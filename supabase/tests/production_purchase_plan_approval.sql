begin;
select plan(47);

select has_table('public',table_name,format('%s exists',table_name))
from unnest(array['purchase_plan_baskets','purchase_plan_verifications','purchase_plan_audit_events']) table_name;
select is((select relrowsecurity from pg_class where oid=format('public.%I',table_name)::regclass),true,format('%s has RLS enabled',table_name))
from unnest(array['purchase_plan_baskets','purchase_plan_verifications','purchase_plan_audit_events']) table_name;
select is(has_table_privilege('authenticated',format('public.%I',table_name),'SELECT'),true,format('authenticated may read owned %s',table_name))
from unnest(array['purchase_plan_baskets','purchase_plan_verifications','purchase_plan_audit_events']) table_name;
select is(has_table_privilege('authenticated',format('public.%I',table_name),'INSERT'),false,format('%s writes are RPC-only',table_name))
from unnest(array['purchase_plan_baskets','purchase_plan_verifications','purchase_plan_audit_events']) table_name;
select is(has_table_privilege('anon',format('public.%I',table_name),'SELECT'),false,format('anonymous cannot read %s',table_name))
from unnest(array['purchase_plan_baskets','purchase_plan_verifications','purchase_plan_audit_events']) table_name;

select has_column('public','purchase_plans',column_name,format('purchase_plans snapshots %s',column_name))
from unnest(array['production_procurement_round_id','source_scenario_id','plan_version','strategy','verification_revision','approval_key','source_snapshot']) column_name;
select has_column('public','purchase_plan_lines',column_name,format('purchase_plan_lines snapshots %s',column_name))
from unnest(array['purchase_plan_basket_id','source_scenario_line_id','canonical_ingredient_id','inci_snapshot','pack_size','expected_landed_cost','documentation_state','source_snapshot']) column_name;

select has_function('public',split_part(signature,'(',1),string_to_array(trim(trailing ')' from split_part(signature,'(',2)),','),format('%s exists',signature))
from unnest(array[
  'approve_production_procurement_scenario(uuid,bigint,uuid,text,text,uuid)',
  'record_purchase_plan_verification(uuid,bigint,text,jsonb,text,text,text,text)',
  'waive_purchase_plan_verification(uuid,bigint,text)',
  'mark_purchase_plan_checkout_ready(uuid,bigint)',
  'cancel_internal_purchase_plan(uuid,bigint,text)'
]) signature;
select is(has_function_privilege('authenticated','public.'||signature,'EXECUTE'),true,format('authenticated may execute %s',signature))
from unnest(array[
  'approve_production_procurement_scenario(uuid,bigint,uuid,text,text,uuid)',
  'record_purchase_plan_verification(uuid,bigint,text,jsonb,text,text,text,text)',
  'waive_purchase_plan_verification(uuid,bigint,text)',
  'mark_purchase_plan_checkout_ready(uuid,bigint)',
  'cancel_internal_purchase_plan(uuid,bigint,text)'
]) signature;
select is(has_function_privilege('anon','public.'||signature,'EXECUTE'),false,format('anonymous cannot execute %s',signature))
from unnest(array[
  'approve_production_procurement_scenario(uuid,bigint,uuid,text,text,uuid)',
  'record_purchase_plan_verification(uuid,bigint,text,jsonb,text,text,text,text)',
  'waive_purchase_plan_verification(uuid,bigint,text)',
  'mark_purchase_plan_checkout_ready(uuid,bigint)',
  'cancel_internal_purchase_plan(uuid,bigint,text)'
]) signature;

select is((select prosecdef from pg_proc where oid='public.approve_production_procurement_scenario(uuid,bigint,uuid,text,text,uuid)'::regprocedure),true,'approval is a guarded security definer');
select is((select proconfig[1] from pg_proc where oid='public.approve_production_procurement_scenario(uuid,bigint,uuid,text,text,uuid)'::regprocedure),'search_path=public, pg_temp','approval has fixed search path');

select * from finish();
rollback;
