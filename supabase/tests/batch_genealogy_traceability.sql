begin;
select plan(41);

select has_function('public','search_finished_goods_traceability_v1',array['text','integer']);
select has_function('public','get_finished_goods_backward_genealogy_v1',array['uuid','uuid']);
select has_function('public','get_raw_material_lot_forward_trace_v1',array['text']);
select has_function('public','get_packaging_lot_forward_trace_v1',array['text']);
select has_function('public','get_production_batch_trace_v1',array['text']);
select has_function('public','get_packaging_run_trace_v1',array['uuid']);
select has_function('public','get_traceability_readiness_v1',array['uuid','uuid']);
select has_function('public','get_traceability_integrity_v1',array['uuid','uuid']);

select function_privs_are('public','search_finished_goods_traceability_v1',array['text','integer'],'authenticated',array['EXECUTE']);
select function_privs_are('public','get_finished_goods_backward_genealogy_v1',array['uuid','uuid'],'authenticated',array['EXECUTE']);
select function_privs_are('public','get_raw_material_lot_forward_trace_v1',array['text'],'authenticated',array['EXECUTE']);
select function_privs_are('public','get_packaging_lot_forward_trace_v1',array['text'],'authenticated',array['EXECUTE']);
select function_privs_are('public','get_production_batch_trace_v1',array['text'],'authenticated',array['EXECUTE']);
select function_privs_are('public','get_packaging_run_trace_v1',array['uuid'],'authenticated',array['EXECUTE']);
select function_privs_are('public','get_traceability_readiness_v1',array['uuid','uuid'],'authenticated',array['EXECUTE']);
select function_privs_are('public','get_traceability_integrity_v1',array['uuid','uuid'],'authenticated',array['EXECUTE']);

select function_privs_are('public','search_finished_goods_traceability_v1',array['text','integer'],'anon',array[]::text[]);
select function_privs_are('public','get_finished_goods_backward_genealogy_v1',array['uuid','uuid'],'anon',array[]::text[]);
select function_privs_are('public','get_raw_material_lot_forward_trace_v1',array['text'],'anon',array[]::text[]);
select function_privs_are('public','get_packaging_lot_forward_trace_v1',array['text'],'anon',array[]::text[]);
select function_privs_are('public','get_production_batch_trace_v1',array['text'],'anon',array[]::text[]);
select function_privs_are('public','get_packaging_run_trace_v1',array['uuid'],'anon',array[]::text[]);
select function_privs_are('public','get_traceability_readiness_v1',array['uuid','uuid'],'anon',array[]::text[]);
select function_privs_are('public','get_traceability_integrity_v1',array['uuid','uuid'],'anon',array[]::text[]);
select function_privs_are('public','kf_traceability_inventory_impact_v1',array['uuid','uuid'],'anon',array[]::text[]);
select function_privs_are('public','kf_traceability_inventory_impact_v1',array['uuid','uuid'],'authenticated',array[]::text[]);
select function_privs_are('public','kf_finished_goods_backward_trace_v1',array['uuid','uuid'],'anon',array[]::text[]);
select function_privs_are('public','kf_finished_goods_backward_trace_v1',array['uuid','uuid'],'authenticated',array[]::text[]);
select function_privs_are('public','kf_forward_trace_result_v1',array['uuid','text','text'],'anon',array[]::text[]);
select function_privs_are('public','kf_forward_trace_result_v1',array['uuid','text','text'],'authenticated',array[]::text[]);

select function_returns('public','search_finished_goods_traceability_v1',array['text','integer'],'jsonb');
select function_returns('public','get_finished_goods_backward_genealogy_v1',array['uuid','uuid'],'jsonb');
select function_returns('public','get_raw_material_lot_forward_trace_v1',array['text'],'jsonb');
select function_returns('public','get_packaging_lot_forward_trace_v1',array['text'],'jsonb');
select function_returns('public','get_production_batch_trace_v1',array['text'],'jsonb');
select function_returns('public','get_packaging_run_trace_v1',array['uuid'],'jsonb');
select function_returns('public','get_traceability_readiness_v1',array['uuid','uuid'],'jsonb');
select function_returns('public','get_traceability_integrity_v1',array['uuid','uuid'],'jsonb');

select has_index('public','batch_material_consumptions','batch_material_consumptions_lot_trace_idx','raw-material forward trace index exists');
select has_index('public','finished_goods_lots','finished_goods_lots_production_trace_idx','Production Batch trace index exists');
select has_index('public','finished_goods_lots','finished_goods_lots_output_trace_idx','production output trace index exists');

select * from finish();
rollback;
