-- Procurement Semantic Separation V1.
-- Purchase Plans remain internal decisions. Purchase Orders record explicit external execution.

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  supplier_id uuid not null,
  source_purchase_plan_id uuid not null,
  source_purchase_plan_revision bigint not null check (source_purchase_plan_revision > 0),
  status text not null default 'draft' check (status in ('draft','placed','confirmed','cancelled','partially_fulfilled','fulfilled')),
  payment_status text not null default 'unknown' check (payment_status in ('unknown','pending','paid','failed','refunded','partially_refunded')),
  confirmation_state text not null default 'unknown' check (confirmation_state in ('unknown','pending','confirmed','rejected')),
  order_reference text,
  supplier_order_number text,
  external_order_date timestamptz,
  currency text,
  merchandise_subtotal numeric check (merchandise_subtotal is null or merchandise_subtotal >= 0),
  discount numeric check (discount is null or discount >= 0),
  shipping numeric check (shipping is null or shipping >= 0),
  tax numeric check (tax is null or tax >= 0),
  total numeric check (total is null or total >= 0),
  supplier_url_snapshot text,
  order_url text,
  notes text not null default '',
  handoff_key uuid,
  legacy_migration jsonb not null default '{}',
  requires_receiving_review boolean not null default false,
  created_by uuid not null,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id,id),
  unique (workspace_id,handoff_key),
  foreign key (workspace_id,supplier_id) references public.suppliers(workspace_id,id),
  foreign key (workspace_id,source_purchase_plan_id) references public.purchase_plans(workspace_id,id)
);

alter table public.purchase_plan_lines add constraint purchase_plan_lines_workspace_id_id_key unique (workspace_id,id);

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  purchase_order_id uuid not null,
  source_purchase_plan_line_id uuid not null,
  supplier_product_id text,
  canonical_ingredient_id text,
  product_name_snapshot text not null,
  package_size numeric check (package_size is null or package_size > 0),
  package_unit text,
  ordered_package_count numeric check (ordered_package_count is null or ordered_package_count > 0),
  ordered_quantity numeric not null check (ordered_quantity > 0),
  ordered_unit text not null,
  unit_price numeric check (unit_price is null or unit_price >= 0),
  currency text,
  line_subtotal numeric check (line_subtotal is null or line_subtotal >= 0),
  discount_allocation numeric check (discount_allocation is null or discount_allocation >= 0),
  tax_allocation numeric check (tax_allocation is null or tax_allocation >= 0),
  legacy_received_quantity numeric check (legacy_received_quantity is null or legacy_received_quantity >= 0),
  legacy_receiving_state text check (legacy_receiving_state is null or legacy_receiving_state in ('unknown','partial','received')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (workspace_id,id),
  unique (workspace_id,purchase_order_id,source_purchase_plan_line_id),
  foreign key (workspace_id,purchase_order_id) references public.purchase_orders(workspace_id,id),
  foreign key (workspace_id,source_purchase_plan_line_id) references public.purchase_plan_lines(workspace_id,id)
);

create index purchase_orders_workspace_status on public.purchase_orders(workspace_id,status,external_order_date desc);
create index purchase_orders_owner on public.purchase_orders(owner_id,updated_at desc);
create index purchase_orders_supplier on public.purchase_orders(workspace_id,supplier_id,external_order_date desc);
create index purchase_orders_source_plan on public.purchase_orders(workspace_id,source_purchase_plan_id);
create unique index purchase_orders_legacy_source_plan on public.purchase_orders(workspace_id,source_purchase_plan_id)
  where legacy_migration->>'source'='legacy_purchase_plan';
create index purchase_order_lines_order on public.purchase_order_lines(workspace_id,purchase_order_id);

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
create policy owner_select on public.purchase_orders for select to authenticated
  using (owner_id=(select auth.uid()) and exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid()) and w.lifecycle_state='active'));
create policy owner_select on public.purchase_order_lines for select to authenticated
  using (owner_id=(select auth.uid()) and exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid()) and w.lifecycle_state='active'));
revoke all on public.purchase_orders,public.purchase_order_lines from public,anon,authenticated;
grant select on public.purchase_orders,public.purchase_order_lines to authenticated;
grant all on public.purchase_orders,public.purchase_order_lines to service_role;

-- Preserve legacy external lifecycle before narrowing Purchase Plan states.
insert into public.purchase_orders(
  workspace_id,owner_id,supplier_id,source_purchase_plan_id,source_purchase_plan_revision,status,
  order_reference,external_order_date,currency,merchandise_subtotal,total,notes,
  legacy_migration,requires_receiving_review,created_by,created_at,updated_at
)
select p.workspace_id,p.owner_id,p.supplier_id,p.id,p.revision,
  case p.status when 'ordered_external' then 'placed' when 'partially_received' then 'partially_fulfilled' else 'fulfilled' end,
  p.external_order_key::text,p.ordered_at,p.currency,p.estimated_merchandise_total,p.estimated_landed_total,p.internal_notes,
  jsonb_build_object('source','legacy_purchase_plan','legacyStatus',p.status,'legacyExternalOrderKey',p.external_order_key),
  p.status in ('partially_received','received'),p.owner_id,p.created_at,p.updated_at
from public.purchase_plans p
where p.status in ('ordered_external','partially_received','received') and p.supplier_id is not null
on conflict do nothing;

insert into public.purchase_order_lines(
  workspace_id,owner_id,purchase_order_id,source_purchase_plan_line_id,supplier_product_id,
  product_name_snapshot,package_size,package_unit,ordered_package_count,ordered_quantity,ordered_unit,
  unit_price,currency,line_subtotal,legacy_received_quantity,legacy_receiving_state,notes,created_at
)
select l.workspace_id,l.owner_id,o.id,l.id,l.supplier_product_id,l.description,l.pack_size,l.unit,l.pack_count,
  l.planned_quantity,l.unit,l.estimated_unit_price,l.currency,l.estimated_line_total,l.received_quantity,
  case when l.received_quantity=0 then 'unknown' when l.received_quantity<l.planned_quantity then 'partial' else 'received' end,
  coalesce(l.requirement_reason,''),l.created_at
from public.purchase_plan_lines l
join public.purchase_orders o on o.workspace_id=l.workspace_id and o.source_purchase_plan_id=l.purchase_plan_id
where o.legacy_migration->>'source'='legacy_purchase_plan'
on conflict do nothing;

alter table public.supplier_events add column purchase_order_id uuid;
alter table public.supplier_events add constraint supplier_events_purchase_order_fk
  foreign key (workspace_id,purchase_order_id) references public.purchase_orders(workspace_id,id);
create index supplier_events_purchase_order on public.supplier_events(workspace_id,purchase_order_id,occurred_at desc)
  where purchase_order_id is not null;
update public.supplier_events e set purchase_order_id=o.id
from public.purchase_orders o
where e.workspace_id=o.workspace_id and e.purchase_plan_id=o.source_purchase_plan_id
  and e.event_type in ('purchase_placed','order_confirmed','shipment_dispatched','shipment_received','partial_shipment','cancelled_order','refund','replacement_shipment','damaged_shipment','customs_issue','invoice_received','payment_completed')
  and e.purchase_order_id is null;

create function public.prevent_supplier_event_execution_forgery() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if current_user<>'postgres' and (
    (tg_op='INSERT' and new.purchase_order_id is not null) or
    (tg_op='UPDATE' and new.purchase_order_id is distinct from old.purchase_order_id)
  ) then raise exception 'PURCHASE_ORDER_EVENT_LINK_RPC_ONLY'; end if;
  return new;
end $$;
create trigger supplier_event_execution_link_guard
  before insert or update of purchase_order_id on public.supplier_events
  for each row execute function public.prevent_supplier_event_execution_forgery();

drop trigger if exists supplier_purchase_history on public.purchase_plans;
drop function if exists public.record_supplier_purchase_event();
drop function if exists public.mark_purchase_plan_external_order(uuid,uuid);

update public.purchase_plans set
  status=case
    when status in ('approved_internal','ordered_external','partially_received','received') then 'approved'
    when status='ready_for_review' then 'verification_required'
    when status='archived' then 'superseded'
    else status
  end,
  updated_at=now();
alter table public.purchase_plans drop constraint purchase_plans_status_check;
alter table public.purchase_plans add constraint purchase_plans_status_check
  check (status in ('draft','approved','verification_required','checkout_ready','superseded','cancelled'));
comment on column public.purchase_plan_lines.received_quantity is
  'Deprecated compatibility field. Never write or read as receipt truth; historical values are copied to purchase_order_lines legacy migration metadata.';

drop policy if exists owner_all on public.purchase_plans;
drop policy if exists owner_all on public.purchase_plan_lines;
create policy owner_select on public.purchase_plans for select to authenticated using (owner_id=(select auth.uid()));
create policy owner_insert_draft on public.purchase_plans for insert to authenticated
  with check (owner_id=(select auth.uid()) and status='draft' and exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid()) and w.lifecycle_state='active'));
create policy owner_select on public.purchase_plan_lines for select to authenticated using (owner_id=(select auth.uid()));
revoke update,delete on public.purchase_plans,public.purchase_plan_lines from authenticated;
grant select,insert on public.purchase_plans to authenticated;
grant select on public.purchase_plan_lines to authenticated;
grant all on public.purchase_plans,public.purchase_plan_lines to service_role;

create function public.create_purchase_order_from_plan(target_plan_id uuid,candidate_handoff_key uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); plan_row public.purchase_plans; existing_id uuid; order_id uuid;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if candidate_handoff_key is null then raise exception 'HANDOFF_KEY_REQUIRED'; end if;
  select * into plan_row from public.purchase_plans where id=target_plan_id and owner_id=uid for update;
  if plan_row.id is null then raise exception 'PURCHASE_PLAN_UNAVAILABLE'; end if;
  if not exists(select 1 from public.workspaces where id=plan_row.workspace_id and owner_id=uid and lifecycle_state='active') then raise exception 'WORKSPACE_UNAVAILABLE'; end if;
  select id into existing_id from public.purchase_orders where workspace_id=plan_row.workspace_id and handoff_key=candidate_handoff_key;
  if existing_id is not null then return existing_id; end if;
  if plan_row.status not in ('approved','checkout_ready') then raise exception 'PURCHASE_PLAN_NOT_ELIGIBLE'; end if;
  if plan_row.supplier_id is null then raise exception 'PURCHASE_PLAN_SUPPLIER_REQUIRED'; end if;
  if not exists(select 1 from public.suppliers s where s.workspace_id=plan_row.workspace_id and s.id=plan_row.supplier_id and s.owner_id=uid) then raise exception 'SUPPLIER_UNAVAILABLE'; end if;
  if not exists(select 1 from public.purchase_plan_lines l where l.workspace_id=plan_row.workspace_id and l.purchase_plan_id=plan_row.id and l.owner_id=uid) then raise exception 'PURCHASE_PLAN_LINES_REQUIRED'; end if;
  insert into public.purchase_orders(workspace_id,owner_id,supplier_id,source_purchase_plan_id,source_purchase_plan_revision,currency,merchandise_subtotal,total,supplier_url_snapshot,notes,handoff_key,created_by)
  select plan_row.workspace_id,uid,plan_row.supplier_id,plan_row.id,plan_row.revision,plan_row.currency,plan_row.estimated_merchandise_total,plan_row.estimated_landed_total,s.website_url,plan_row.internal_notes,candidate_handoff_key,uid
  from public.suppliers s where s.workspace_id=plan_row.workspace_id and s.id=plan_row.supplier_id returning id into order_id;
  insert into public.purchase_order_lines(workspace_id,owner_id,purchase_order_id,source_purchase_plan_line_id,supplier_product_id,product_name_snapshot,package_size,package_unit,ordered_package_count,ordered_quantity,ordered_unit,unit_price,currency,line_subtotal,notes)
  select l.workspace_id,uid,order_id,l.id,l.supplier_product_id,l.description,l.pack_size,l.unit,l.pack_count,l.planned_quantity,l.unit,l.estimated_unit_price,l.currency,l.estimated_line_total,coalesce(l.requirement_reason,'')
  from public.purchase_plan_lines l where l.workspace_id=plan_row.workspace_id and l.purchase_plan_id=plan_row.id and l.owner_id=uid;
  return order_id;
end $$;

create function public.record_purchase_order_placement(target_order_id uuid,expected_revision bigint,external_reference text,placed_at timestamptz default now())
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); order_row public.purchase_orders;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into order_row from public.purchase_orders where id=target_order_id and owner_id=uid for update;
  if order_row.id is null then raise exception 'PURCHASE_ORDER_UNAVAILABLE'; end if;
  if order_row.revision<>expected_revision then raise exception 'STALE_PURCHASE_ORDER_REVISION'; end if;
  if order_row.status='placed' then return order_row.revision; end if;
  if order_row.status<>'draft' then raise exception 'PURCHASE_ORDER_NOT_PLACEABLE'; end if;
  update public.purchase_orders set status='placed',order_reference=nullif(trim(external_reference),''),external_order_date=placed_at,revision=revision+1,updated_at=now() where id=order_row.id;
  insert into public.supplier_events(workspace_id,owner_id,supplier_id,event_type,occurred_at,title,description,purchase_plan_id,purchase_order_id,source_key)
  values(order_row.workspace_id,uid,order_row.supplier_id,'purchase_placed',placed_at,'Purchase order placed',coalesce(external_reference,''),order_row.source_purchase_plan_id,order_row.id,'purchase_order:'||order_row.id::text||':purchase_placed')
  on conflict (workspace_id,source_key) do nothing;
  return order_row.revision+1;
end $$;

revoke all on function public.create_purchase_order_from_plan(uuid,uuid) from public,anon;
revoke all on function public.record_purchase_order_placement(uuid,bigint,text,timestamptz) from public,anon;
grant execute on function public.create_purchase_order_from_plan(uuid,uuid) to authenticated;
grant execute on function public.record_purchase_order_placement(uuid,bigint,text,timestamptz) to authenticated;
