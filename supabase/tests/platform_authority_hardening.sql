begin;
select plan(38);

select has_function('public','record_inventory_lot_receipt_v1',array['jsonb','jsonb']);
select has_function('public','append_inventory_movement_v1',array['jsonb']);
select has_function('public','record_packaging_lot_receipt_v1',array['jsonb','jsonb']);
select has_function('public','append_packaging_inventory_movement_v1',array['jsonb']);

select function_privs_are('public','record_inventory_lot_receipt_v1',array['jsonb','jsonb'],'authenticated',array['EXECUTE']);
select function_privs_are('public','append_inventory_movement_v1',array['jsonb'],'authenticated',array['EXECUTE']);
select function_privs_are('public','record_packaging_lot_receipt_v1',array['jsonb','jsonb'],'authenticated',array['EXECUTE']);
select function_privs_are('public','append_packaging_inventory_movement_v1',array['jsonb'],'authenticated',array['EXECUTE']);
select function_privs_are('public','record_inventory_lot_receipt_v1',array['jsonb','jsonb'],'anon',array[]::text[]);
select function_privs_are('public','append_inventory_movement_v1',array['jsonb'],'anon',array[]::text[]);
select function_privs_are('public','record_packaging_lot_receipt_v1',array['jsonb','jsonb'],'anon',array[]::text[]);
select function_privs_are('public','append_packaging_inventory_movement_v1',array['jsonb'],'anon',array[]::text[]);

select is((select prosecdef from pg_proc where oid='public.record_inventory_lot_receipt_v1(jsonb,jsonb)'::regprocedure),true,'raw receipt is a definer RPC');
select is((select prosecdef from pg_proc where oid='public.append_inventory_movement_v1(jsonb)'::regprocedure),true,'raw movement append is a definer RPC');
select is((select prosecdef from pg_proc where oid='public.record_packaging_lot_receipt_v1(jsonb,jsonb)'::regprocedure),true,'packaging receipt is a definer RPC');
select is((select prosecdef from pg_proc where oid='public.append_packaging_inventory_movement_v1(jsonb)'::regprocedure),true,'packaging movement append is a definer RPC');
select is((select proconfig[1] from pg_proc where oid='public.record_inventory_lot_receipt_v1(jsonb,jsonb)'::regprocedure),'search_path=""','raw receipt has an empty fixed search path');
select is((select proconfig[1] from pg_proc where oid='public.append_inventory_movement_v1(jsonb)'::regprocedure),'search_path=""','raw append has an empty fixed search path');
select is((select proconfig[1] from pg_proc where oid='public.record_packaging_lot_receipt_v1(jsonb,jsonb)'::regprocedure),'search_path=""','packaging receipt has an empty fixed search path');
select is((select proconfig[1] from pg_proc where oid='public.append_packaging_inventory_movement_v1(jsonb)'::regprocedure),'search_path=""','packaging append has an empty fixed search path');

select table_privs_are('public','inventory_movements','authenticated',array['SELECT']);
select table_privs_are('public','packaging_inventory_movements','authenticated',array['SELECT']);
select table_privs_are('public','finished_goods_batches','authenticated',array['SELECT']);
select table_privs_are('public','finished_goods_movements','authenticated',array['SELECT']);
select table_privs_are('public','packaging_allocations','authenticated',array['SELECT']);
select table_privs_are('public','workspace_records','authenticated',array['SELECT']);

select policies_are('public','inventory_movements',array['owner_read']);
select policies_are('public','packaging_inventory_movements',array['owner_read']);
select policies_are('public','finished_goods_batches',array['owner_read_legacy']);
select policies_are('public','finished_goods_movements',array['owner_read_legacy']);
select policies_are('public','packaging_allocations',array['owner_read_legacy']);
select policies_are('public','workspace_records',array['records_owner_select']);

select function_privs_are('public','register_finished_goods_output',array['jsonb','jsonb'],'authenticated',array[]::text[]);
select function_privs_are('public','commit_packaging_consumption',array['text','jsonb','jsonb'],'authenticated',array[]::text[]);
select function_privs_are('public','register_document_object',array['text','text','text','text','text','text','bigint','text'],'anon',array[]::text[]);
select function_privs_are('public','remove_current_document_object',array['text'],'anon',array[]::text[]);

select is(left(obj_description('public.finished_goods_batches'::regclass),15),'kf.authority.v1','legacy Finished Goods authority is classified');
select is(left(obj_description('public.inventory_movements'::regclass),15),'kf.authority.v1','raw-material movement authority is classified');

select * from finish();
rollback;
