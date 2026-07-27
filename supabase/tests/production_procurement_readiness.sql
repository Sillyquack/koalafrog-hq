begin;
select plan(45);

select has_table('public',table_name,format('%s exists',table_name))
from unnest(array[
  'production_procurement_rounds','production_procurement_round_products',
  'production_procurement_requirements','production_procurement_requirement_sources',
  'production_procurement_inventory_gaps'
]) table_name;

select is((select relrowsecurity from pg_class where oid=format('public.%I',table_name)::regclass),true,format('%s has RLS enabled',table_name))
from unnest(array[
  'production_procurement_rounds','production_procurement_round_products',
  'production_procurement_requirements','production_procurement_requirement_sources',
  'production_procurement_inventory_gaps'
]) table_name;

select is(has_table_privilege('authenticated',format('public.%I',table_name),'SELECT'),true,format('authenticated may read owned %s rows',table_name))
from unnest(array[
  'production_procurement_rounds','production_procurement_round_products',
  'production_procurement_requirements','production_procurement_requirement_sources',
  'production_procurement_inventory_gaps'
]) table_name;

select is(has_table_privilege('authenticated',format('public.%I',table_name),'INSERT'),false,format('%s is RPC-write-only',table_name))
from unnest(array[
  'production_procurement_rounds','production_procurement_round_products',
  'production_procurement_requirements','production_procurement_requirement_sources',
  'production_procurement_inventory_gaps'
]) table_name;

select is(has_table_privilege('anon',format('public.%I',table_name),'SELECT'),false,format('anonymous cannot read %s',table_name))
from unnest(array[
  'production_procurement_rounds','production_procurement_round_products',
  'production_procurement_requirements','production_procurement_requirement_sources',
  'production_procurement_inventory_gaps'
]) table_name;

select has_function('public','create_production_procurement_round',array['uuid','text','text','text','uuid'],'round creation RPC exists');
select has_function('public','update_production_procurement_round_products',array['uuid','bigint','text','text','jsonb'],'round basis RPC exists');
select has_function('public','regenerate_production_procurement_requirements',array['uuid','bigint'],'requirement regeneration RPC exists');
select has_function('public','cancel_production_procurement_round',array['uuid','bigint'],'round cancellation RPC exists');

select is(has_function_privilege('authenticated',signature,'EXECUTE'),true,format('authenticated may execute %s',signature))
from unnest(array[
  'public.create_production_procurement_round(uuid,text,text,text,uuid)',
  'public.update_production_procurement_round_products(uuid,bigint,text,text,jsonb)',
  'public.regenerate_production_procurement_requirements(uuid,bigint)',
  'public.cancel_production_procurement_round(uuid,bigint)'
]) signature;

select is(has_function_privilege('anon',signature,'EXECUTE'),false,format('anonymous cannot execute %s',signature))
from unnest(array[
  'public.create_production_procurement_round(uuid,text,text,text,uuid)',
  'public.update_production_procurement_round_products(uuid,bigint,text,text,jsonb)',
  'public.regenerate_production_procurement_requirements(uuid,bigint)',
  'public.cancel_production_procurement_round(uuid,bigint)'
]) signature;

select is((select prosecdef from pg_proc where oid=signature::regprocedure),true,format('%s is a guarded security definer',signature))
from unnest(array[
  'public.create_production_procurement_round(uuid,text,text,text,uuid)',
  'public.update_production_procurement_round_products(uuid,bigint,text,text,jsonb)',
  'public.regenerate_production_procurement_requirements(uuid,bigint)',
  'public.cancel_production_procurement_round(uuid,bigint)'
]) signature;

select is((select proconfig[1] from pg_proc where oid=signature::regprocedure),'search_path=pg_catalog, public, pg_temp',format('%s has a fixed search path',signature))
from unnest(array[
  'public.create_production_procurement_round(uuid,text,text,text,uuid)',
  'public.update_production_procurement_round_products(uuid,bigint,text,text,jsonb)',
  'public.regenerate_production_procurement_requirements(uuid,bigint)',
  'public.cancel_production_procurement_round(uuid,bigint)'
]) signature;

select * from finish();
rollback;
