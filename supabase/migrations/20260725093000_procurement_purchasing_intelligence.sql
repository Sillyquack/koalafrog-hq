-- Supplier-level commercial terms and owner-reviewed cart scenarios.
-- These records support landed-cost planning only. They never place orders,
-- create payments, or mutate either inventory ledger.

create table public.procurement_supplier_discounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null,
  supplier_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  discount_type text not null check (discount_type in ('percentage','fixed_amount','free_shipping','other')),
  percentage numeric check (percentage is null or (percentage > 0 and percentage <= 100)),
  fixed_amount numeric check (fixed_amount is null or fixed_amount >= 0),
  currency text check (currency is null or length(currency) = 3),
  coupon_code text,
  minimum_order_value numeric check (minimum_order_value is null or minimum_order_value >= 0),
  maximum_discount numeric check (maximum_discount is null or maximum_discount >= 0),
  first_purchase_only boolean not null default false,
  requires_newsletter boolean not null default false,
  valid_from date,
  expires_at timestamptz,
  status text not null default 'available' check (status in ('available','planned','used','expired','invalid','unknown')),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  evidence_notes text not null default '',
  verified_at timestamptz,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id,id),
  foreign key (workspace_id,supplier_id) references public.suppliers(workspace_id,id) on delete cascade,
  check (
    (discount_type='percentage' and percentage is not null)
    or (discount_type='fixed_amount' and fixed_amount is not null and currency is not null)
    or discount_type in ('free_shipping','other')
  )
);

create table public.procurement_supplier_shipping_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null,
  supplier_id uuid not null,
  destination_country_code text,
  destination_region text,
  shipping_method text,
  currency text check (currency is null or length(currency) = 3),
  flat_rate numeric check (flat_rate is null or flat_rate >= 0),
  free_shipping_threshold numeric check (free_shipping_threshold is null or free_shipping_threshold >= 0),
  minimum_order_value numeric check (minimum_order_value is null or minimum_order_value >= 0),
  delivery_estimate_min_days integer check (delivery_estimate_min_days is null or delivery_estimate_min_days >= 0),
  delivery_estimate_max_days integer check (delivery_estimate_max_days is null or delivery_estimate_max_days >= 0),
  tax_handling text not null default 'unknown' check (tax_handling in ('unknown','included','excluded','destination_checkout','import_due')),
  duty_handling text not null default 'unknown' check (duty_handling in ('unknown','included','excluded','import_due')),
  status text not null default 'needs_verification' check (status in ('active','needs_verification','inactive','expired')),
  source_url text check (source_url is null or source_url ~ '^https?://'),
  evidence_notes text not null default '',
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id,id),
  foreign key (workspace_id,supplier_id) references public.suppliers(workspace_id,id) on delete cascade,
  check (
    delivery_estimate_min_days is null
    or delivery_estimate_max_days is null
    or delivery_estimate_min_days <= delivery_estimate_max_days
  )
);

create table public.procurement_cart_scenarios (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null,
  supplier_id uuid not null,
  name text not null check (length(trim(name)) > 0),
  destination_country_code text not null default 'NO',
  currency text not null check (length(currency) = 3),
  shipping_rule_id uuid,
  discount_id uuid,
  manual_shipping_cost numeric check (manual_shipping_cost is null or manual_shipping_cost >= 0),
  manual_tax_estimate numeric check (manual_tax_estimate is null or manual_tax_estimate >= 0),
  manual_duty_estimate numeric check (manual_duty_estimate is null or manual_duty_estimate >= 0),
  payment_fee numeric check (payment_fee is null or payment_fee >= 0),
  additional_cost numeric check (additional_cost is null or additional_cost >= 0),
  status text not null default 'draft' check (status in ('draft','ready_for_review','selected','superseded','archived')),
  notes text not null default '',
  calculated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id,id),
  foreign key (workspace_id,supplier_id) references public.suppliers(workspace_id,id),
  foreign key (workspace_id,shipping_rule_id) references public.procurement_supplier_shipping_rules(workspace_id,id),
  foreign key (workspace_id,discount_id) references public.procurement_supplier_discounts(workspace_id,id)
);

create table public.procurement_cart_scenario_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null,
  scenario_id uuid not null,
  supplier_offer_id uuid not null,
  requested_item_id uuid not null,
  package_count numeric not null check (package_count > 0),
  unit_price numeric not null check (unit_price >= 0),
  line_discount numeric not null default 0 check (line_discount >= 0),
  display_order integer not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id,id),
  foreign key (workspace_id,scenario_id) references public.procurement_cart_scenarios(workspace_id,id) on delete cascade,
  foreign key (workspace_id,supplier_offer_id,requested_item_id) references public.procurement_supplier_offers(workspace_id,id,requested_item_id)
);

create index procurement_supplier_discounts_supplier
  on public.procurement_supplier_discounts(workspace_id,supplier_id,status,expires_at);
create index procurement_supplier_shipping_rules_supplier
  on public.procurement_supplier_shipping_rules(workspace_id,supplier_id,destination_country_code,status);
create index procurement_cart_scenarios_supplier
  on public.procurement_cart_scenarios(workspace_id,supplier_id,status,updated_at desc);
create index procurement_cart_scenario_items_scenario
  on public.procurement_cart_scenario_items(workspace_id,scenario_id,display_order);

-- Only one selected scenario per supplier and destination may be active at a time.
create unique index procurement_cart_scenarios_one_selected
  on public.procurement_cart_scenarios(workspace_id,supplier_id,destination_country_code)
  where status='selected';

do $$ declare table_name text; begin
  foreach table_name in array array[
    'procurement_supplier_discounts',
    'procurement_supplier_shipping_rules',
    'procurement_cart_scenarios',
    'procurement_cart_scenario_items'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format(
      'create policy owner_all on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and exists (select 1 from public.workspaces where id = workspace_id and owner_id = (select auth.uid()) and lifecycle_state = ''active''))',
      table_name
    );
    execute format('revoke all on public.%I from anon',table_name);
    execute format('grant select,insert,update,delete on public.%I to authenticated',table_name);
  end loop;
end $$;
