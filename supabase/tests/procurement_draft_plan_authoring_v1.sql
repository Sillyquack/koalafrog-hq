begin;
select plan(74);

select has_column('public','purchase_plans',column_name,format('purchase_plans has %s',column_name))
from unnest(array[
  'placement_state','order_authorized','target_budget','absolute_stop',
  'credible_range_minimum','credible_range_maximum',
  'worst_credible_range_minimum','worst_credible_range_maximum',
  'commercial_checked_at','draft_payload_fingerprint','draft_authoring_version'
]) column_name;

select has_column('public','purchase_plan_baskets',column_name,format('purchase_plan_baskets has %s',column_name))
from unnest(array['vat_adjustment','dangerous_goods_fee','payment_fx','commercial_checked_at']) column_name;

select has_column('public','purchase_plan_lines',column_name,format('purchase_plan_lines has %s',column_name))
from unnest(array[
  'source_kind','source_record_id','packaging_component_id',
  'supplier_sku_snapshot','commercial_checked_at','commercial_evidence_snapshot'
]) column_name;

select col_is_null('public','purchase_plan_baskets',column_name,format('%s preserves Unknown as null',column_name))
from unnest(array[
  'merchandise_subtotal','eligible_subtotal','confirmed_discount',
  'estimated_discount','post_discount_subtotal','known_minimum'
]) column_name;

select has_function(
  'public','create_draft_purchase_plan_v1',
  array['uuid','uuid','jsonb','jsonb'],
  'atomic Draft Purchase Plan RPC exists'
);
select is(
  (select prosecdef from pg_proc where oid='public.create_draft_purchase_plan_v1(uuid,uuid,jsonb,jsonb)'::regprocedure),
  true,
  'Draft Purchase Plan RPC is a guarded security definer'
);
select is(
  (select proconfig[1] from pg_proc where oid='public.create_draft_purchase_plan_v1(uuid,uuid,jsonb,jsonb)'::regprocedure),
  'search_path=""',
  'Draft Purchase Plan RPC has an empty fixed search path'
);
select is(
  has_function_privilege('authenticated','public.create_draft_purchase_plan_v1(uuid,uuid,jsonb,jsonb)','EXECUTE'),
  true,
  'authenticated may execute Draft Purchase Plan RPC'
);
select is(
  has_function_privilege('anon','public.create_draft_purchase_plan_v1(uuid,uuid,jsonb,jsonb)','EXECUTE'),
  false,
  'anonymous cannot execute Draft Purchase Plan RPC'
);
select is(
  has_function_privilege('public','public.create_draft_purchase_plan_v1(uuid,uuid,jsonb,jsonb)','EXECUTE'),
  false,
  'PUBLIC cannot execute Draft Purchase Plan RPC'
);

select is(
  has_function_privilege('public',signature,'EXECUTE'),
  false,
  format('PUBLIC cannot execute helper %s',signature)
)
from unnest(array[
  'public.kf_draft_optional_numeric_v1(jsonb,text)',
  'public.kf_draft_plan_receipt_bundle_v1(uuid,text)'
]) signature;
select is(
  has_function_privilege('authenticated',signature,'EXECUTE'),
  false,
  format('authenticated cannot call helper %s directly',signature)
)
from unnest(array[
  'public.kf_draft_optional_numeric_v1(jsonb,text)',
  'public.kf_draft_plan_receipt_bundle_v1(uuid,text)'
]) signature;

select is(
  (select relrowsecurity from pg_class where oid=format('public.%I',table_name)::regclass),
  true,
  format('%s retains RLS',table_name)
)
from unnest(array['purchase_plans','purchase_plan_baskets','purchase_plan_lines']) table_name;

select is(
  has_table_privilege('authenticated',format('public.%I',table_name),'INSERT'),
  false,
  format('authenticated direct INSERT remains denied on %s',table_name)
)
from unnest(array['purchase_plans','purchase_plan_baskets','purchase_plan_lines']) table_name;

select is(
  has_table_privilege('anon',format('public.%I',table_name),'SELECT'),
  false,
  format('anonymous cannot read %s',table_name)
)
from unnest(array['purchase_plans','purchase_plan_baskets','purchase_plan_lines']) table_name;

select is(
  has_table_privilege('authenticated',format('public.%I',table_name),'SELECT'),
  true,
  format('authenticated owner readback remains available on %s',table_name)
)
from unnest(array['purchase_plans','purchase_plan_baskets','purchase_plan_lines']) table_name;

select table_privs_are(
  'public',table_name,'authenticated',array['SELECT'],
  format('authenticated has exactly SELECT on %s',table_name)
)
from unnest(array['purchase_plans','purchase_plan_baskets','purchase_plan_lines']) table_name;
select table_privs_are(
  'public',table_name,'anon',array[]::text[],
  format('anonymous has no table privileges on %s',table_name)
)
from unnest(array['purchase_plans','purchase_plan_baskets','purchase_plan_lines']) table_name;
select table_privs_are(
  'public',table_name,'public',array[]::text[],
  format('PUBLIC has no table privileges on %s',table_name)
)
from unnest(array['purchase_plans','purchase_plan_baskets','purchase_plan_lines']) table_name;

select function_privs_are(
  'public','create_draft_purchase_plan_v1',array['uuid','uuid','jsonb','jsonb'],
  'authenticated',array['EXECUTE'],'authenticated has exactly RPC execution'
);
select function_privs_are(
  'public','create_draft_purchase_plan_v1',array['uuid','uuid','jsonb','jsonb'],
  'anon',array[]::text[],'anonymous has no RPC execution'
);
select function_privs_are(
  'public','create_draft_purchase_plan_v1',array['uuid','uuid','jsonb','jsonb'],
  'public',array[]::text[],'PUBLIC has no RPC execution'
);
select function_privs_are(
  'public','kf_draft_optional_numeric_v1',array['jsonb','text'],
  role_name,array[]::text[],format('%s cannot execute the numeric helper',role_name)
)
from unnest(array['authenticated','anon','public']) role_name;
select function_privs_are(
  'public','kf_draft_plan_receipt_bundle_v1',array['uuid','text'],
  role_name,array[]::text[],format('%s cannot execute the receipt helper',role_name)
)
from unnest(array['authenticated','anon','public']) role_name;

select has_index(
  'public','purchase_plans','purchase_plans_active_draft_normalized_title_unique',
  'active owner-authored Draft titles have a database uniqueness boundary'
);
select ok(
  position(
    'lower(regexp_replace(title'
    in pg_get_indexdef('public.purchase_plans_active_draft_normalized_title_unique'::regclass)
  )>0,
  'Draft title identity trims surrounding whitespace and folds case'
);
select ok(
  position(
    '[[:space:]]'
    in pg_get_indexdef('public.purchase_plans_active_draft_normalized_title_unique'::regclass)
  )>0,
  'Draft title identity includes non-space surrounding whitespace'
);
select ok(
  position(
    'owner_authored_draft_v1'
    in pg_get_indexdef('public.purchase_plans_active_draft_normalized_title_unique'::regclass)
  )>0,
  'Draft title uniqueness is scoped to the owner-authored Draft lifecycle'
);

select ok(
  position('num_nonnulls' in pg_get_constraintdef(oid))>0,
  format('%s explicitly enforces null pairing',conname)
)
from pg_constraint
where conname in (
  'purchase_plans_budget_gate_check',
  'purchase_plans_credible_range_check',
  'purchase_plans_worst_credible_range_check'
)
order by conname;

select * from finish();
rollback;
