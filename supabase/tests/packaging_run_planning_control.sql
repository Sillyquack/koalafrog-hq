begin;
select no_plan();

select has_table('public',table_name,format('%s exists',table_name))
from unnest(array[
  'packaging_runs','packaging_run_requirements','packaging_run_bulk_allocations','packaging_run_bulk_transfers',
  'packaging_run_reservations','packaging_run_inventory_uses','packaging_run_reconciliations','packaging_run_events'
]) table_name;

select is((select relrowsecurity from pg_class where oid=format('public.%I',table_name)::regclass),true,format('%s has RLS',table_name))
from unnest(array[
  'packaging_runs','packaging_run_requirements','packaging_run_bulk_allocations','packaging_run_bulk_transfers',
  'packaging_run_reservations','packaging_run_inventory_uses','packaging_run_reconciliations','packaging_run_events'
]) table_name;

select is(has_table_privilege('authenticated',format('public.%I',table_name),'SELECT'),true,format('authenticated may read %s',table_name))
from unnest(array[
  'packaging_runs','packaging_run_requirements','packaging_run_bulk_allocations','packaging_run_bulk_transfers',
  'packaging_run_reservations','packaging_run_inventory_uses','packaging_run_reconciliations','packaging_run_events'
]) table_name;

select is(has_table_privilege('authenticated',format('public.%I',table_name),'INSERT'),false,format('%s is RPC-write-only',table_name))
from unnest(array[
  'packaging_runs','packaging_run_requirements','packaging_run_bulk_allocations','packaging_run_bulk_transfers',
  'packaging_run_reservations','packaging_run_inventory_uses','packaging_run_reconciliations','packaging_run_events'
]) table_name;

select is(has_table_privilege('authenticated',format('public.%I',table_name),'UPDATE'),false,format('%s denies direct updates',table_name))
from unnest(array[
  'packaging_runs','packaging_run_requirements','packaging_run_bulk_allocations','packaging_run_bulk_transfers',
  'packaging_run_reservations','packaging_run_inventory_uses','packaging_run_reconciliations','packaging_run_events'
]) table_name;

select is(has_table_privilege('anon',format('public.%I',table_name),'SELECT'),false,format('anonymous cannot read %s',table_name))
from unnest(array[
  'packaging_runs','packaging_run_requirements','packaging_run_bulk_allocations','packaging_run_bulk_transfers',
  'packaging_run_reservations','packaging_run_inventory_uses','packaging_run_reconciliations','packaging_run_events'
]) table_name;

select has_function('public',split_part(signature,'(',1),string_to_array(trim(trailing ')' from split_part(signature,'(',2)),','),format('%s exists',signature))
from unnest(array[
  'create_packaging_run_v1(uuid,text,text,numeric,text,numeric,numeric,text,text,uuid)',
  'get_packaging_available_bulk_v1(uuid)',
  'allocate_bulk_to_packaging_run_v1(uuid,bigint,numeric,text,text,uuid)',
  'release_packaging_run_bulk_allocation_v1(uuid,bigint,text,uuid)',
  'get_packaging_eligible_lots_v1(uuid)',
  'reserve_packaging_run_requirement_v1(uuid,text,bigint,numeric,text,uuid)',
  'reserve_packaging_run_requirements_v1(uuid,bigint,jsonb,uuid)',
  'release_packaging_reservation_v1(uuid,bigint,boolean,text,text,boolean,uuid)',
  'record_packaging_bulk_transfer_v1(uuid,bigint,numeric,text,text,text,text,text,text,text,timestamptz,uuid)',
  'record_packaging_inventory_use_v1(uuid,bigint,text,numeric,text,text,text,text,timestamptz,uuid)',
  'reconcile_packaging_run_v1(uuid,bigint,numeric,numeric,numeric,numeric,numeric,text,text,boolean,timestamptz,uuid)',
  'get_packaging_run_completion_readiness_v1(uuid)',
  'complete_packaging_run_v1(uuid,bigint,timestamptz,uuid)',
  'get_packaging_run_genealogy_v1(uuid)'
]) signature;

select is(has_function_privilege('authenticated','public.'||signature,'EXECUTE'),true,format('authenticated may execute %s',signature))
from unnest(array[
  'create_packaging_run_v1(uuid,text,text,numeric,text,numeric,numeric,text,text,uuid)',
  'get_packaging_available_bulk_v1(uuid)',
  'allocate_bulk_to_packaging_run_v1(uuid,bigint,numeric,text,text,uuid)',
  'release_packaging_run_bulk_allocation_v1(uuid,bigint,text,uuid)',
  'get_packaging_eligible_lots_v1(uuid)',
  'reserve_packaging_run_requirement_v1(uuid,text,bigint,numeric,text,uuid)',
  'reserve_packaging_run_requirements_v1(uuid,bigint,jsonb,uuid)',
  'release_packaging_reservation_v1(uuid,bigint,boolean,text,text,boolean,uuid)',
  'record_packaging_bulk_transfer_v1(uuid,bigint,numeric,text,text,text,text,text,text,text,timestamptz,uuid)',
  'record_packaging_inventory_use_v1(uuid,bigint,text,numeric,text,text,text,text,timestamptz,uuid)',
  'reconcile_packaging_run_v1(uuid,bigint,numeric,numeric,numeric,numeric,numeric,text,text,boolean,timestamptz,uuid)',
  'get_packaging_run_completion_readiness_v1(uuid)',
  'complete_packaging_run_v1(uuid,bigint,timestamptz,uuid)',
  'get_packaging_run_genealogy_v1(uuid)'
]) signature;

select is(has_function_privilege('anon','public.'||signature,'EXECUTE'),false,format('anonymous cannot execute %s',signature))
from unnest(array[
  'create_packaging_run_v1(uuid,text,text,numeric,text,numeric,numeric,text,text,uuid)',
  'get_packaging_available_bulk_v1(uuid)',
  'allocate_bulk_to_packaging_run_v1(uuid,bigint,numeric,text,text,uuid)',
  'release_packaging_run_bulk_allocation_v1(uuid,bigint,text,uuid)',
  'get_packaging_eligible_lots_v1(uuid)',
  'reserve_packaging_run_requirement_v1(uuid,text,bigint,numeric,text,uuid)',
  'reserve_packaging_run_requirements_v1(uuid,bigint,jsonb,uuid)',
  'release_packaging_reservation_v1(uuid,bigint,boolean,text,text,boolean,uuid)',
  'record_packaging_bulk_transfer_v1(uuid,bigint,numeric,text,text,text,text,text,text,text,timestamptz,uuid)',
  'record_packaging_inventory_use_v1(uuid,bigint,text,numeric,text,text,text,text,timestamptz,uuid)',
  'reconcile_packaging_run_v1(uuid,bigint,numeric,numeric,numeric,numeric,numeric,text,text,boolean,timestamptz,uuid)',
  'get_packaging_run_completion_readiness_v1(uuid)',
  'complete_packaging_run_v1(uuid,bigint,timestamptz,uuid)',
  'get_packaging_run_genealogy_v1(uuid)'
]) signature;

select is((select prosecdef from pg_proc where oid=('public.'||signature)::regprocedure),true,format('%s is security definer',signature))
from unnest(array[
  'create_packaging_run_v1(uuid,text,text,numeric,text,numeric,numeric,text,text,uuid)',
  'get_packaging_available_bulk_v1(uuid)',
  'allocate_bulk_to_packaging_run_v1(uuid,bigint,numeric,text,text,uuid)',
  'release_packaging_run_bulk_allocation_v1(uuid,bigint,text,uuid)',
  'get_packaging_eligible_lots_v1(uuid)',
  'reserve_packaging_run_requirement_v1(uuid,text,bigint,numeric,text,uuid)',
  'reserve_packaging_run_requirements_v1(uuid,bigint,jsonb,uuid)',
  'release_packaging_reservation_v1(uuid,bigint,boolean,text,text,boolean,uuid)',
  'record_packaging_bulk_transfer_v1(uuid,bigint,numeric,text,text,text,text,text,text,text,timestamptz,uuid)',
  'record_packaging_inventory_use_v1(uuid,bigint,text,numeric,text,text,text,text,timestamptz,uuid)',
  'reconcile_packaging_run_v1(uuid,bigint,numeric,numeric,numeric,numeric,numeric,text,text,boolean,timestamptz,uuid)',
  'get_packaging_run_completion_readiness_v1(uuid)',
  'complete_packaging_run_v1(uuid,bigint,timestamptz,uuid)',
  'get_packaging_run_genealogy_v1(uuid)'
]) signature;

select is((select proconfig[1] from pg_proc where oid=('public.'||signature)::regprocedure),'search_path=public, pg_temp',format('%s has fixed search path',signature))
from unnest(array[
  'create_packaging_run_v1(uuid,text,text,numeric,text,numeric,numeric,text,text,uuid)',
  'get_packaging_available_bulk_v1(uuid)',
  'allocate_bulk_to_packaging_run_v1(uuid,bigint,numeric,text,text,uuid)',
  'release_packaging_run_bulk_allocation_v1(uuid,bigint,text,uuid)',
  'get_packaging_eligible_lots_v1(uuid)',
  'reserve_packaging_run_requirement_v1(uuid,text,bigint,numeric,text,uuid)',
  'reserve_packaging_run_requirements_v1(uuid,bigint,jsonb,uuid)',
  'release_packaging_reservation_v1(uuid,bigint,boolean,text,text,boolean,uuid)',
  'record_packaging_bulk_transfer_v1(uuid,bigint,numeric,text,text,text,text,text,text,text,timestamptz,uuid)',
  'record_packaging_inventory_use_v1(uuid,bigint,text,numeric,text,text,text,text,timestamptz,uuid)',
  'reconcile_packaging_run_v1(uuid,bigint,numeric,numeric,numeric,numeric,numeric,text,text,boolean,timestamptz,uuid)',
  'get_packaging_run_completion_readiness_v1(uuid)',
  'complete_packaging_run_v1(uuid,bigint,timestamptz,uuid)',
  'get_packaging_run_genealogy_v1(uuid)'
]) signature;

select has_trigger('public','packaging_run_requirements','packaging_run_requirements_append_only','requirements are immutable');
select has_trigger('public','packaging_run_bulk_transfers','packaging_run_bulk_transfers_append_only','transfers are append-only');
select has_trigger('public','packaging_run_inventory_uses','packaging_run_inventory_uses_append_only','uses are append-only');
select has_trigger('public','packaging_run_reconciliations','packaging_run_reconciliations_append_only','reconciliations are append-only');
select has_trigger('public','packaging_run_events','packaging_run_events_append_only','events are append-only');
select has_trigger('public','packaging_runs','completed_packaging_run_immutable','completed Packaging Runs are immutable');

select * from finish();
rollback;
