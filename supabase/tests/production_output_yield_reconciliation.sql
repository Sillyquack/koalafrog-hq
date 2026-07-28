begin;
select no_plan();

select has_table('public',table_name,format('%s exists',table_name))
from unnest(array['production_outputs','production_output_measurements','production_output_components',
  'production_output_reconciliations','production_output_events']) table_name;
select is((select relrowsecurity from pg_class where oid=format('public.%I',table_name)::regclass),true,format('%s has RLS',table_name))
from unnest(array['production_outputs','production_output_measurements','production_output_components',
  'production_output_reconciliations','production_output_events']) table_name;
select is(has_table_privilege('authenticated',format('public.%I',table_name),'SELECT'),true,format('authenticated may read %s',table_name))
from unnest(array['production_outputs','production_output_measurements','production_output_components',
  'production_output_reconciliations','production_output_events']) table_name;
select is(has_table_privilege('authenticated',format('public.%I',table_name),'INSERT'),false,format('%s is RPC-write-only',table_name))
from unnest(array['production_outputs','production_output_measurements','production_output_components',
  'production_output_reconciliations','production_output_events']) table_name;
select is(has_table_privilege('anon',format('public.%I',table_name),'SELECT'),false,format('anonymous cannot read %s',table_name))
from unnest(array['production_outputs','production_output_measurements','production_output_components',
  'production_output_reconciliations','production_output_events']) table_name;

select has_function('public',split_part(signature,'(',1),string_to_array(trim(trailing ')' from split_part(signature,'(',2)),','),format('%s exists',signature))
from unnest(array[
  'create_production_output_v1(text,bigint,text,text,numeric,text,text,text,text,text,text,uuid)',
  'record_production_output_measurement_v1(uuid,bigint,numeric,text,text,text,text,numeric,numeric,text,text,timestamptz,uuid)',
  'record_production_output_component_v1(uuid,bigint,text,numeric,text,text,text,text,timestamptz,uuid)',
  'reconcile_production_output_v1(uuid,bigint,numeric,text,text,boolean,timestamptz,uuid)',
  'get_production_output_completion_readiness_v1(text)','get_production_output_genealogy_v1(uuid)',
  'complete_production_output_stage_v1(text,bigint,timestamptz,uuid)'
]) signature;
select is(has_function_privilege('authenticated','public.'||signature,'EXECUTE'),true,format('authenticated may execute %s',signature))
from unnest(array[
  'create_production_output_v1(text,bigint,text,text,numeric,text,text,text,text,text,text,uuid)',
  'record_production_output_measurement_v1(uuid,bigint,numeric,text,text,text,text,numeric,numeric,text,text,timestamptz,uuid)',
  'record_production_output_component_v1(uuid,bigint,text,numeric,text,text,text,text,timestamptz,uuid)',
  'reconcile_production_output_v1(uuid,bigint,numeric,text,text,boolean,timestamptz,uuid)',
  'get_production_output_completion_readiness_v1(text)','get_production_output_genealogy_v1(uuid)',
  'complete_production_output_stage_v1(text,bigint,timestamptz,uuid)'
]) signature;
select is(has_function_privilege('anon','public.'||signature,'EXECUTE'),false,format('anonymous cannot execute %s',signature))
from unnest(array[
  'create_production_output_v1(text,bigint,text,text,numeric,text,text,text,text,text,text,uuid)',
  'record_production_output_measurement_v1(uuid,bigint,numeric,text,text,text,text,numeric,numeric,text,text,timestamptz,uuid)',
  'record_production_output_component_v1(uuid,bigint,text,numeric,text,text,text,text,timestamptz,uuid)',
  'reconcile_production_output_v1(uuid,bigint,numeric,text,text,boolean,timestamptz,uuid)',
  'get_production_output_completion_readiness_v1(text)','get_production_output_genealogy_v1(uuid)',
  'complete_production_output_stage_v1(text,bigint,timestamptz,uuid)'
]) signature;
select is((select prosecdef from pg_proc where oid=('public.'||signature)::regprocedure),true,format('%s is security definer',signature))
from unnest(array[
  'create_production_output_v1(text,bigint,text,text,numeric,text,text,text,text,text,text,uuid)',
  'record_production_output_measurement_v1(uuid,bigint,numeric,text,text,text,text,numeric,numeric,text,text,timestamptz,uuid)',
  'record_production_output_component_v1(uuid,bigint,text,numeric,text,text,text,text,timestamptz,uuid)',
  'reconcile_production_output_v1(uuid,bigint,numeric,text,text,boolean,timestamptz,uuid)',
  'get_production_output_completion_readiness_v1(text)','get_production_output_genealogy_v1(uuid)',
  'complete_production_output_stage_v1(text,bigint,timestamptz,uuid)'
]) signature;
select is((select proconfig[1] from pg_proc where oid=('public.'||signature)::regprocedure),'search_path=public, pg_temp',format('%s has fixed search path',signature))
from unnest(array[
  'create_production_output_v1(text,bigint,text,text,numeric,text,text,text,text,text,text,uuid)',
  'record_production_output_measurement_v1(uuid,bigint,numeric,text,text,text,text,numeric,numeric,text,text,timestamptz,uuid)',
  'record_production_output_component_v1(uuid,bigint,text,numeric,text,text,text,text,timestamptz,uuid)',
  'reconcile_production_output_v1(uuid,bigint,numeric,text,text,boolean,timestamptz,uuid)',
  'get_production_output_completion_readiness_v1(text)','get_production_output_genealogy_v1(uuid)',
  'complete_production_output_stage_v1(text,bigint,timestamptz,uuid)'
]) signature;

select has_trigger('public','production_output_measurements','production_output_measurements_append_only','measurements are append-only');
select has_trigger('public','production_output_components','production_output_components_append_only','components are append-only');
select has_trigger('public','production_output_reconciliations','production_output_reconciliations_append_only','reconciliations are append-only');
select has_trigger('public','production_output_events','production_output_events_append_only','events are append-only');
select has_column('public','production_runs','output_stage_status','Production Batch owns output-stage status');

select * from finish();
rollback;
