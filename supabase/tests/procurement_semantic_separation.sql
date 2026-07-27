begin;
select plan(24);

select has_table('public',table_name,format('%s exists',table_name))
from unnest(array['purchase_orders','purchase_order_lines']) table_name;
select is((select relrowsecurity from pg_class where oid=format('public.%I',table_name)::regclass),true,format('%s has RLS enabled',table_name))
from unnest(array['purchase_orders','purchase_order_lines']) table_name;
select is(has_table_privilege('authenticated',format('public.%I',table_name),'SELECT'),true,format('authenticated may read owned %s',table_name))
from unnest(array['purchase_orders','purchase_order_lines']) table_name;
select is(has_table_privilege('authenticated',format('public.%I',table_name),'INSERT'),false,format('%s lifecycle is RPC-only',table_name))
from unnest(array['purchase_orders','purchase_order_lines']) table_name;
select is(has_table_privilege('anon',format('public.%I',table_name),'SELECT'),false,format('anonymous cannot read %s',table_name))
from unnest(array['purchase_orders','purchase_order_lines']) table_name;

select has_function('public',split_part(signature,'(',1),string_to_array(trim(trailing ')' from split_part(signature,'(',2)),','),format('%s exists',signature))
from unnest(array['create_purchase_order_from_plan(uuid,uuid)','record_purchase_order_placement(uuid,bigint,text,timestamp with time zone)']) signature;
select is(has_function_privilege('authenticated','public.'||signature,'EXECUTE'),true,format('authenticated may execute %s',signature))
from unnest(array['create_purchase_order_from_plan(uuid,uuid)','record_purchase_order_placement(uuid,bigint,text,timestamp with time zone)']) signature;
select is(has_function_privilege('anon','public.'||signature,'EXECUTE'),false,format('anonymous cannot execute %s',signature))
from unnest(array['create_purchase_order_from_plan(uuid,uuid)','record_purchase_order_placement(uuid,bigint,text,timestamp with time zone)']) signature;
select is((select prosecdef from pg_proc where oid=('public.'||signature)::regprocedure),true,format('%s is a guarded security definer',signature))
from unnest(array['create_purchase_order_from_plan(uuid,uuid)','record_purchase_order_placement(uuid,bigint,text,timestamp with time zone)']) signature;
select is((select proconfig[1] from pg_proc where oid=('public.'||signature)::regprocedure),'search_path=public, pg_temp',format('%s has fixed search path',signature))
from unnest(array['create_purchase_order_from_plan(uuid,uuid)','record_purchase_order_placement(uuid,bigint,text,timestamp with time zone)']) signature;

select is(to_regprocedure('public.mark_purchase_plan_external_order(uuid,uuid)'),null,'legacy plan-to-order mutation RPC is removed');
select has_column('public','supplier_events','purchase_order_id','supplier events can identify external execution');
select is(has_table_privilege('authenticated','public.purchase_plans','UPDATE'),false,'Purchase Plan lifecycle cannot be directly mutated');
select is(has_table_privilege('authenticated','public.purchase_orders','UPDATE'),false,'Purchase Order lifecycle cannot be directly mutated');

select * from finish();
rollback;
