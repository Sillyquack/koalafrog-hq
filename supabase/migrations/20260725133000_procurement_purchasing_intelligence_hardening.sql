-- Forward-only corrections for Purchasing Intelligence.
-- Unknown tax and duty estimates remain nullable and inactive workspaces are
-- excluded from reads as well as writes.

alter table public.procurement_supplier_shipping_rules
  add column tax_estimate numeric check (tax_estimate is null or tax_estimate >= 0),
  add column duty_estimate numeric check (duty_estimate is null or duty_estimate >= 0),
  add constraint procurement_shipping_destination_present check (
    destination_country_code is not null or destination_region is not null
  ),
  add constraint procurement_shipping_country_shape check (
    destination_country_code is null or destination_country_code ~ '^[A-Z]{2}$'
  );

alter table public.procurement_supplier_discounts
  add constraint procurement_discount_currency_shape check (
    currency is null or currency ~ '^[A-Z]{3}$'
  ),
  add constraint procurement_discount_validity_order check (
    valid_from is null or expires_at is null or valid_from <= expires_at::date
  );

alter table public.procurement_cart_scenarios
  add constraint procurement_cart_country_shape check (destination_country_code ~ '^[A-Z]{2}$'),
  add constraint procurement_cart_currency_shape check (currency ~ '^[A-Z]{3}$');

do $$ declare table_name text; begin
  foreach table_name in array array[
    'procurement_supplier_discounts',
    'procurement_supplier_shipping_rules',
    'procurement_cart_scenarios',
    'procurement_cart_scenario_items'
  ] loop
    execute format('drop policy owner_all on public.%I',table_name);
    execute format(
      'create policy owner_all on public.%I for all to authenticated using (
        owner_id = (select auth.uid()) and exists (
          select 1 from public.workspaces
          where id = workspace_id
            and owner_id = (select auth.uid())
            and lifecycle_state = ''active''
        )
      ) with check (
        owner_id = (select auth.uid()) and exists (
          select 1 from public.workspaces
          where id = workspace_id
            and owner_id = (select auth.uid())
            and lifecycle_state = ''active''
        )
      )',
      table_name
    );
  end loop;
end $$;

create function public.import_procurement_purchasing_snapshot(
  candidate_workspace_id uuid,
  payload jsonb
) returns void
language plpgsql
security invoker
set search_path=pg_catalog,public,pg_temp
as $$
declare current_owner uuid := auth.uid();
begin
  perform public.import_procurement_snapshot(candidate_workspace_id,payload);

  insert into public.procurement_supplier_discounts(
    id,workspace_id,owner_id,supplier_id,name,discount_type,percentage,fixed_amount,currency,
    coupon_code,minimum_order_value,maximum_discount,first_purchase_only,requires_newsletter,
    valid_from,expires_at,status,source_url,evidence_notes,verified_at,used_at,created_at,updated_at
  ) select id,candidate_workspace_id,current_owner,supplier_id,name,discount_type,percentage,
    fixed_amount,currency,coupon_code,minimum_order_value,maximum_discount,first_purchase_only,
    requires_newsletter,valid_from,expires_at,status,source_url,evidence_notes,verified_at,used_at,
    created_at,updated_at
  from jsonb_to_recordset(coalesce(payload->'supplierDiscounts','[]')) as x(
    id uuid,supplier_id uuid,name text,discount_type text,percentage numeric,fixed_amount numeric,
    currency text,coupon_code text,minimum_order_value numeric,maximum_discount numeric,
    first_purchase_only boolean,requires_newsletter boolean,valid_from date,expires_at timestamptz,
    status text,source_url text,evidence_notes text,verified_at timestamptz,used_at timestamptz,
    created_at timestamptz,updated_at timestamptz
  );

  insert into public.procurement_supplier_shipping_rules(
    id,workspace_id,owner_id,supplier_id,destination_country_code,destination_region,
    shipping_method,currency,flat_rate,free_shipping_threshold,minimum_order_value,
    delivery_estimate_min_days,delivery_estimate_max_days,tax_handling,duty_handling,
    tax_estimate,duty_estimate,status,source_url,evidence_notes,verified_at,created_at,updated_at
  ) select id,candidate_workspace_id,current_owner,supplier_id,destination_country_code,
    destination_region,shipping_method,currency,flat_rate,free_shipping_threshold,
    minimum_order_value,delivery_estimate_min_days,delivery_estimate_max_days,tax_handling,
    duty_handling,tax_estimate,duty_estimate,status,source_url,evidence_notes,verified_at,
    created_at,updated_at
  from jsonb_to_recordset(coalesce(payload->'supplierShippingRules','[]')) as x(
    id uuid,supplier_id uuid,destination_country_code text,destination_region text,
    shipping_method text,currency text,flat_rate numeric,free_shipping_threshold numeric,
    minimum_order_value numeric,delivery_estimate_min_days integer,delivery_estimate_max_days integer,
    tax_handling text,duty_handling text,tax_estimate numeric,duty_estimate numeric,status text,
    source_url text,evidence_notes text,verified_at timestamptz,created_at timestamptz,updated_at timestamptz
  );

  insert into public.procurement_cart_scenarios(
    id,workspace_id,owner_id,supplier_id,name,destination_country_code,currency,shipping_rule_id,
    discount_id,manual_shipping_cost,manual_tax_estimate,manual_duty_estimate,payment_fee,
    additional_cost,status,notes,calculated_at,created_at,updated_at
  ) select id,candidate_workspace_id,current_owner,supplier_id,name,destination_country_code,
    currency,shipping_rule_id,discount_id,manual_shipping_cost,manual_tax_estimate,
    manual_duty_estimate,payment_fee,additional_cost,status,notes,calculated_at,created_at,updated_at
  from jsonb_to_recordset(coalesce(payload->'cartScenarios','[]')) as x(
    id uuid,supplier_id uuid,name text,destination_country_code text,currency text,
    shipping_rule_id uuid,discount_id uuid,manual_shipping_cost numeric,manual_tax_estimate numeric,
    manual_duty_estimate numeric,payment_fee numeric,additional_cost numeric,status text,notes text,
    calculated_at timestamptz,created_at timestamptz,updated_at timestamptz
  );

  insert into public.procurement_cart_scenario_items(
    id,workspace_id,owner_id,scenario_id,supplier_offer_id,requested_item_id,package_count,
    unit_price,line_discount,display_order,notes,created_at,updated_at
  ) select id,candidate_workspace_id,current_owner,scenario_id,supplier_offer_id,requested_item_id,
    package_count,unit_price,line_discount,display_order,notes,created_at,updated_at
  from jsonb_to_recordset(coalesce(payload->'cartScenarioItems','[]')) as x(
    id uuid,scenario_id uuid,supplier_offer_id uuid,requested_item_id uuid,package_count numeric,
    unit_price numeric,line_discount numeric,display_order integer,notes text,
    created_at timestamptz,updated_at timestamptz
  );
end
$$;
revoke all on function public.import_procurement_purchasing_snapshot(uuid,jsonb) from public,anon;
grant execute on function public.import_procurement_purchasing_snapshot(uuid,jsonb) to authenticated;
