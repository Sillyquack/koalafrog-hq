begin;
select plan(114);

select has_table('public',table_name,format('%s exists',table_name))
from unnest(array[
  'batch_material_lot_allocations','inventory_reservations','batch_material_events',
  'batch_material_weighings','batch_material_consumptions','batch_material_waste',
  'batch_material_returns','batch_material_variances','batch_material_reconciliations'
]) table_name;
select is((select relrowsecurity from pg_class where oid=format('public.%I',table_name)::regclass),true,format('%s has RLS',table_name))
from unnest(array[
  'batch_material_lot_allocations','inventory_reservations','batch_material_events',
  'batch_material_weighings','batch_material_consumptions','batch_material_waste',
  'batch_material_returns','batch_material_variances','batch_material_reconciliations'
]) table_name;
select is(has_table_privilege('authenticated',format('public.%I',table_name),'SELECT'),true,format('authenticated may read %s',table_name))
from unnest(array[
  'batch_material_lot_allocations','inventory_reservations','batch_material_events',
  'batch_material_weighings','batch_material_consumptions','batch_material_waste',
  'batch_material_returns','batch_material_variances','batch_material_reconciliations'
]) table_name;
select is(has_table_privilege('authenticated',format('public.%I',table_name),'INSERT'),false,format('%s is RPC-write-only',table_name))
from unnest(array[
  'batch_material_lot_allocations','inventory_reservations','batch_material_events',
  'batch_material_weighings','batch_material_consumptions','batch_material_waste',
  'batch_material_returns','batch_material_variances','batch_material_reconciliations'
]) table_name;
select is(has_table_privilege('anon',format('public.%I',table_name),'SELECT'),false,format('anonymous cannot read %s',table_name))
from unnest(array[
  'batch_material_lot_allocations','inventory_reservations','batch_material_events',
  'batch_material_weighings','batch_material_consumptions','batch_material_waste',
  'batch_material_returns','batch_material_variances','batch_material_reconciliations'
]) table_name;

select has_function('public',split_part(signature,'(',1),string_to_array(trim(trailing ')' from split_part(signature,'(',2)),','),format('%s exists',signature))
from unnest(array[
  'kf_active_reserved_balance(uuid,text)','kf_inventory_available_balance(uuid,text)',
  'eligible_batch_material_lots(text,text,text)',
  'reserve_batch_material_inventory(text,text,text,text,numeric,text,text,bigint,uuid)',
  'release_batch_material_reservation(uuid,bigint,numeric,text,uuid)',
  'record_batch_material_weighing(uuid,bigint,text,numeric,text,text,text,text,uuid)',
  'consume_reserved_batch_material(uuid,bigint,uuid,numeric,numeric,text,text,text,text,uuid)',
  'record_batch_material_return(uuid,bigint,uuid,uuid,numeric,text,text,text,text,text,uuid)',
  'reconcile_batch_material_requirement(text,text,text,text,text,text,uuid)'
]) signature;
select is(has_function_privilege('authenticated','public.'||signature,'EXECUTE'),true,format('authenticated may execute %s',signature))
from unnest(array[
  'eligible_batch_material_lots(text,text,text)',
  'reserve_batch_material_inventory(text,text,text,text,numeric,text,text,bigint,uuid)',
  'release_batch_material_reservation(uuid,bigint,numeric,text,uuid)',
  'record_batch_material_weighing(uuid,bigint,text,numeric,text,text,text,text,uuid)',
  'consume_reserved_batch_material(uuid,bigint,uuid,numeric,numeric,text,text,text,text,uuid)',
  'record_batch_material_return(uuid,bigint,uuid,uuid,numeric,text,text,text,text,text,uuid)',
  'reconcile_batch_material_requirement(text,text,text,text,text,text,uuid)'
]) signature;
select is(has_function_privilege('anon','public.'||signature,'EXECUTE'),false,format('anonymous cannot execute %s',signature))
from unnest(array[
  'eligible_batch_material_lots(text,text,text)',
  'reserve_batch_material_inventory(text,text,text,text,numeric,text,text,bigint,uuid)',
  'release_batch_material_reservation(uuid,bigint,numeric,text,uuid)',
  'record_batch_material_weighing(uuid,bigint,text,numeric,text,text,text,text,uuid)',
  'consume_reserved_batch_material(uuid,bigint,uuid,numeric,numeric,text,text,text,text,uuid)',
  'record_batch_material_return(uuid,bigint,uuid,uuid,numeric,text,text,text,text,text,uuid)',
  'reconcile_batch_material_requirement(text,text,text,text,text,text,uuid)'
]) signature;
select is((select prosecdef from pg_proc where oid=('public.'||signature)::regprocedure),true,format('%s is security definer',signature))
from unnest(array[
  'eligible_batch_material_lots(text,text,text)',
  'reserve_batch_material_inventory(text,text,text,text,numeric,text,text,bigint,uuid)',
  'release_batch_material_reservation(uuid,bigint,numeric,text,uuid)',
  'record_batch_material_weighing(uuid,bigint,text,numeric,text,text,text,text,uuid)',
  'consume_reserved_batch_material(uuid,bigint,uuid,numeric,numeric,text,text,text,text,uuid)',
  'record_batch_material_return(uuid,bigint,uuid,uuid,numeric,text,text,text,text,text,uuid)',
  'reconcile_batch_material_requirement(text,text,text,text,text,text,uuid)'
]) signature;
select is((select proconfig[1] from pg_proc where oid=('public.'||signature)::regprocedure),'search_path=public, pg_temp',format('%s has fixed search path',signature))
from unnest(array[
  'eligible_batch_material_lots(text,text,text)',
  'reserve_batch_material_inventory(text,text,text,text,numeric,text,text,bigint,uuid)',
  'release_batch_material_reservation(uuid,bigint,numeric,text,uuid)',
  'record_batch_material_weighing(uuid,bigint,text,numeric,text,text,text,text,uuid)',
  'consume_reserved_batch_material(uuid,bigint,uuid,numeric,numeric,text,text,text,text,uuid)',
  'reconcile_batch_material_requirement(text,text,text,text,text,text,uuid)'
]) signature;

select has_column('public','lab_batch_lines',column_name,format('Lab requirement snapshots %s',column_name))
from unnest(array['formula_id_snapshot','formula_version_id_snapshot','inci_snapshot','functions_snapshot','tolerance_quantity','revision']) column_name;
select has_column('public','production_run_lines',column_name,format('Production requirement snapshots %s',column_name))
from unnest(array['formula_id_snapshot','formula_version_id_snapshot','inci_snapshot','functions_snapshot','tolerance_quantity','revision']) column_name;

select has_trigger('public','batch_material_events','batch_material_events_append_only','material events are append-only');
select has_trigger('public','batch_material_weighings','weighings_append_only','weighings are append-only');
select has_trigger('public','batch_material_consumptions','consumptions_append_only','consumptions are append-only');
select has_trigger('public','batch_material_waste','waste_append_only','waste is append-only');
select has_trigger('public','batch_material_returns','returns_append_only','returns are append-only');
select has_trigger('public','batch_material_variances','variances_append_only','variances are append-only');
select has_trigger('public','inventory_lots','protect_inventory_lot_eligibility_controls','Inventory Lot eligibility controls require a trusted server path');
select has_trigger('public','lab_batches','enforce_lab_inventory_completion','Lab completion is server guarded');
select has_trigger('public','production_runs','enforce_production_inventory_completion','Production completion is server guarded');

select has_function('public','record_batch_material_weighing_v2',array['uuid','bigint','text','numeric','text','integer','text','text','text','text','uuid'],'planned weighing v2 exists');
select has_function('public','get_batch_material_completion_readiness_v1',array['text','text'],'completion readiness v1 exists');
select has_function('public','get_batch_material_provenance_v1',array['text','text','text'],'provenance v1 exists');
select is(has_function_privilege('authenticated','public.record_batch_material_weighing_v2(uuid,bigint,text,numeric,text,integer,text,text,text,text,uuid)','EXECUTE'),true,'authenticated may record v2 weighing');
select is(has_function_privilege('authenticated','public.get_batch_material_completion_readiness_v1(text,text)','EXECUTE'),true,'authenticated may read completion readiness');
select is(has_function_privilege('authenticated','public.get_batch_material_provenance_v1(text,text,text)','EXECUTE'),true,'authenticated may read provenance');
select is(has_function_privilege('anon','public.record_batch_material_weighing_v2(uuid,bigint,text,numeric,text,integer,text,text,text,text,uuid)','EXECUTE'),false,'anonymous cannot record v2 weighing');
select is(has_function_privilege('anon','public.get_batch_material_completion_readiness_v1(text,text)','EXECUTE'),false,'anonymous cannot read completion readiness');
select is(has_function_privilege('anon','public.get_batch_material_provenance_v1(text,text,text)','EXECUTE'),false,'anonymous cannot read provenance');
select is((select prosecdef from pg_proc where oid='public.get_batch_material_completion_readiness_v1(text,text)'::regprocedure),true,'completion readiness is security definer');
select is((select proconfig[1] from pg_proc where oid='public.get_batch_material_completion_readiness_v1(text,text)'::regprocedure),'search_path=public, pg_temp','completion readiness has fixed search path');
select is((select proconfig[1] from pg_proc where oid='public.get_batch_material_provenance_v1(text,text,text)'::regprocedure),'search_path=public, pg_temp','provenance has fixed search path');

select * from finish();
rollback;
