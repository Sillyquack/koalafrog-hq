-- Request-centred procurement research. These records plan and compare only:
-- they do not create orders, payments, inventory lots, or movements.
create table public.procurement_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null,
  title text not null check (length(trim(title)) > 0),
  status text not null default 'needed' check (status in ('needed','researching','recommended','ordered','received')),
  category text not null default 'raw_material',
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  needed_by date,
  notes text not null default '',
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id,id)
);

create table public.procurement_requested_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  procurement_request_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  category text not null,
  requested_quantity numeric not null check (requested_quantity > 0),
  unit text not null,
  intended_product_ids text[] not null default '{}',
  intended_formula_ids text[] not null default '{}',
  required_specifications text[] not null default '{}',
  acceptable_substitutes text[] not null default '{}',
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  needed_by date,
  notes text not null default '',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id,id),
  unique (workspace_id,id,procurement_request_id),
  foreign key (workspace_id,procurement_request_id) references public.procurement_requests(workspace_id,id) on delete cascade
);

create table public.procurement_supplier_offers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  requested_item_id uuid not null,
  supplier_id uuid not null,
  source_supplier_product_domain text check (source_supplier_product_domain in ('raw_material','packaging')),
  source_supplier_product_id text,
  product_title text not null check (length(trim(product_title)) > 0),
  product_url text check (product_url is null or product_url ~ '^https?://'),
  country_code text,
  package_quantity numeric not null check (package_quantity > 0),
  package_unit text not null,
  item_price numeric check (item_price >= 0),
  currency text check (currency is null or length(currency) = 3),
  moq numeric check (moq > 0),
  shipping_cost numeric check (shipping_cost >= 0),
  tax_duty_estimate numeric check (tax_duty_estimate >= 0),
  delivery_estimate_days integer check (delivery_estimate_days >= 0),
  stock_status text not null default 'unknown' check (stock_status in ('unknown','in_stock','limited','backorder','out_of_stock')),
  coa_availability text not null default 'unknown' check (coa_availability in ('unknown','available','unavailable','partial')),
  sds_availability text not null default 'unknown' check (sds_availability in ('unknown','available','unavailable','partial')),
  technical_document_availability text not null default 'unknown' check (technical_document_availability in ('unknown','available','unavailable','partial')),
  certification_claims text[] not null default '{}',
  first_order_discount numeric check (first_order_discount >= 0),
  notes text not null default '',
  date_checked date not null,
  confidence text not null default 'unknown' check (confidence in ('low','medium','high','unknown')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id,id),
  unique (workspace_id,id,requested_item_id),
  foreign key (workspace_id,requested_item_id) references public.procurement_requested_items(workspace_id,id) on delete cascade,
  foreign key (workspace_id,supplier_id) references public.suppliers(workspace_id,id)
);

create table public.procurement_recommendations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  procurement_request_id uuid not null,
  requested_item_id uuid not null,
  supplier_offer_id uuid not null,
  summary text not null,
  rationale text not null default '',
  recommended_purchase_quantity numeric check (recommended_purchase_quantity > 0),
  status text not null default 'draft' check (status in ('draft','recommended','superseded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id,procurement_request_id) references public.procurement_requests(workspace_id,id),
  foreign key (workspace_id,requested_item_id,procurement_request_id) references public.procurement_requested_items(workspace_id,id,procurement_request_id),
  foreign key (workspace_id,supplier_offer_id,requested_item_id) references public.procurement_supplier_offers(workspace_id,id,requested_item_id)
);

create index procurement_requests_attention on public.procurement_requests(workspace_id,status,priority,needed_by);
create index procurement_items_request on public.procurement_requested_items(workspace_id,procurement_request_id,display_order);
create index procurement_offers_item on public.procurement_supplier_offers(workspace_id,requested_item_id,date_checked desc);
create index procurement_recommendations_request on public.procurement_recommendations(workspace_id,procurement_request_id,status);

do $$ declare table_name text; begin
  foreach table_name in array array['procurement_requests','procurement_requested_items','procurement_supplier_offers','procurement_recommendations']
  loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format(
      'create policy owner_all on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and exists (select 1 from public.workspaces where id = workspace_id and owner_id = (select auth.uid()) and lifecycle_state = ''active''))',
      table_name
    );
    execute format('revoke all on public.%I from anon',table_name);
    execute format('grant select,insert,update,delete on public.%I to authenticated',table_name);
  end loop;
end $$;

create function public.import_procurement_snapshot(
  candidate_workspace_id uuid,
  payload jsonb
) returns void
language plpgsql
security invoker
set search_path=pg_catalog,public,pg_temp
as $$
declare current_owner uuid := auth.uid();
begin
  if current_owner is null or candidate_workspace_id is null or payload is null
    or jsonb_typeof(payload->'requests') <> 'array'
    or jsonb_typeof(payload->'requestedItems') <> 'array'
    or jsonb_typeof(payload->'offers') <> 'array'
    or jsonb_typeof(payload->'recommendations') <> 'array'
    or not exists (
      select 1 from public.workspaces
      where id=candidate_workspace_id and owner_id=current_owner and lifecycle_state='active'
    )
  then raise exception using errcode='22023',message='INVALID_PROCUREMENT_IMPORT'; end if;

  insert into public.procurement_requests(
    id,workspace_id,owner_id,title,status,category,priority,needed_by,notes,revision,created_at,updated_at
  ) select id,candidate_workspace_id,current_owner,title,status,category,priority,needed_by,notes,revision,created_at,updated_at
  from jsonb_to_recordset(payload->'requests') as x(
    id uuid,title text,status text,category text,priority text,needed_by date,notes text,
    revision bigint,created_at timestamptz,updated_at timestamptz
  );

  insert into public.procurement_requested_items(
    id,workspace_id,owner_id,procurement_request_id,name,category,requested_quantity,unit,
    intended_product_ids,intended_formula_ids,required_specifications,acceptable_substitutes,
    priority,needed_by,notes,display_order,created_at,updated_at
  ) select id,candidate_workspace_id,current_owner,procurement_request_id,name,category,
    requested_quantity,unit,intended_product_ids,intended_formula_ids,required_specifications,
    acceptable_substitutes,priority,needed_by,notes,display_order,created_at,updated_at
  from jsonb_to_recordset(payload->'requestedItems') as x(
    id uuid,procurement_request_id uuid,name text,category text,requested_quantity numeric,unit text,
    intended_product_ids text[],intended_formula_ids text[],required_specifications text[],
    acceptable_substitutes text[],priority text,needed_by date,notes text,display_order integer,
    created_at timestamptz,updated_at timestamptz
  );

  insert into public.procurement_supplier_offers(
    id,workspace_id,owner_id,requested_item_id,supplier_id,source_supplier_product_domain,
    source_supplier_product_id,product_title,product_url,country_code,package_quantity,package_unit,
    item_price,currency,moq,shipping_cost,tax_duty_estimate,delivery_estimate_days,stock_status,
    coa_availability,sds_availability,technical_document_availability,certification_claims,
    first_order_discount,notes,date_checked,confidence,created_at,updated_at
  ) select id,candidate_workspace_id,current_owner,requested_item_id,supplier_id,
    source_supplier_product_domain,source_supplier_product_id,product_title,product_url,country_code,
    package_quantity,package_unit,item_price,currency,moq,shipping_cost,tax_duty_estimate,
    delivery_estimate_days,stock_status,coa_availability,sds_availability,
    technical_document_availability,certification_claims,first_order_discount,notes,date_checked,
    confidence,created_at,updated_at
  from jsonb_to_recordset(payload->'offers') as x(
    id uuid,requested_item_id uuid,supplier_id uuid,source_supplier_product_domain text,
    source_supplier_product_id text,product_title text,product_url text,country_code text,
    package_quantity numeric,package_unit text,item_price numeric,currency text,moq numeric,
    shipping_cost numeric,tax_duty_estimate numeric,delivery_estimate_days integer,stock_status text,
    coa_availability text,sds_availability text,technical_document_availability text,
    certification_claims text[],first_order_discount numeric,notes text,date_checked date,
    confidence text,created_at timestamptz,updated_at timestamptz
  );

  insert into public.procurement_recommendations(
    id,workspace_id,owner_id,procurement_request_id,requested_item_id,supplier_offer_id,
    summary,rationale,recommended_purchase_quantity,status,created_at,updated_at
  ) select id,candidate_workspace_id,current_owner,procurement_request_id,requested_item_id,
    supplier_offer_id,summary,rationale,recommended_purchase_quantity,status,created_at,updated_at
  from jsonb_to_recordset(payload->'recommendations') as x(
    id uuid,procurement_request_id uuid,requested_item_id uuid,supplier_offer_id uuid,summary text,
    rationale text,recommended_purchase_quantity numeric,status text,created_at timestamptz,
    updated_at timestamptz
  );
end
$$;
revoke all on function public.import_procurement_snapshot(uuid,jsonb) from public,anon;
grant execute on function public.import_procurement_snapshot(uuid,jsonb) to authenticated;
