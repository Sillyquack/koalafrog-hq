\set ON_ERROR_STOP on
begin;
set local session_replication_role=replica;
insert into public.workspaces(id,owner_id,name,lifecycle_state) values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Output performance','active');
insert into public.products(workspace_id,owner_id,id,name,category,status,development_stage,description,scent_profile,created_at,updated_at)
values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','perf-product','Performance Product','test','Active','Production','','',now()::text,now()::text);
insert into public.formulas(workspace_id,owner_id,id,product_id,name,description,created_at,updated_at)
values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','perf-formula','perf-product','Performance Formula','',now()::text,now()::text);
insert into public.formula_versions(workspace_id,owner_id,id,formula_id,version,status,description,target_characteristics,phase_definitions,manufacturing_process,created_at,updated_at)
values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','perf-version','perf-formula','1.0','Approved','','','[]','[]',now()::text,now()::text);
insert into public.production_runs(workspace_id,owner_id,id,production_run_number,product_id,formula_id,formula_version_id,status,planned_batch_size,planned_batch_unit,actual_yield,actual_yield_unit,created_at,updated_at,purpose,notes,summary)
values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','perf-run','PERF-RUN','perf-product','perf-formula','perf-version','Completed',10000,'g',10000,'g',now()::text,now()::text,'Performance','','');
insert into public.production_outputs(id,workspace_id,owner_id,production_run_id,product_id,formula_id,formula_version_id,output_type,output_sequence,internal_output_code,output_label,
 theoretical_quantity,theoretical_unit,theoretical_normalized_quantity,theoretical_normalized_unit,theoretical_yield_basis,batch_number_snapshot,product_name_snapshot,formula_name_snapshot,
 formula_version_snapshot,batch_scale_quantity_snapshot,batch_scale_unit_snapshot,production_completion_policy_version,material_cost_confidence,unresolved_cost_count,measurement_basis,location,status,
 creation_idempotency_key,creation_payload_fingerprint,created_by)
select md5('output-'||g)::uuid,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','perf-run','perf-product','perf-formula','perf-version','bulk',g,
 'PERF-'||lpad(g::text,5,'0'),'Output '||g,1,'g',1,'g','fixture','PERF-RUN','Performance Product','Performance Formula','1.0',10000,'g','1.1.0','unknown',1,'net','Production','reconciled',
 md5('create-'||g)::uuid,md5(g::text),'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' from generate_series(1,10000) g;
insert into public.production_output_measurements(workspace_id,owner_id,production_output_id,measurement_version,quantity,unit,normalized_quantity,normalized_unit,measurement_method,measured_by,measured_at,note,idempotency_key,payload_fingerprint)
select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',md5('output-'||g)::uuid,1,1,'g',1,'g','net','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',now(),'',
 md5('measure-'||g)::uuid,md5(g::text) from generate_series(1,10000) g;
insert into public.production_output_components(workspace_id,owner_id,production_output_id,component_type,quantity,unit,normalized_quantity,normalized_unit,reason,approval_state,recorded_by,recorded_at,idempotency_key,payload_fingerprint)
select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',md5('output-'||g)::uuid,t,case when t='retained_bulk' then 1 else 0 end,'g',
 case when t='retained_bulk' then 1 else 0 end,'g','fixture','not_required','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',now(),md5(t||g)::uuid,md5(t||g)
from generate_series(1,10000) g cross join unnest(array['retained_bulk','bulk_waste','transferred','unexplained_variance']) t;
insert into public.production_output_reconciliations(workspace_id,owner_id,production_output_id,reconciliation_version,policy_version,actual_normalized_quantity,retained_normalized_quantity,
 waste_normalized_quantity,transferred_normalized_quantity,unexplained_normalized_quantity,equation_difference,theoretical_variance,yield_percentage,tolerance_quantity,state,reconciled_by,reconciled_at,idempotency_key,payload_fingerprint)
select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',md5('output-'||g)::uuid,1,'1.0.0',1,1,0,0,0,0,0,100,0.01,'reconciled',
 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',now(),md5('reconcile-'||g)::uuid,md5(g::text) from generate_series(1,10000) g;
insert into public.production_output_events(workspace_id,owner_id,production_run_id,production_output_id,formula_version_id,event_type,actor_id,policy_version,event_key)
select 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','perf-run',md5('output-'||(((g-1)%10000)+1))::uuid,'perf-version',
 'production_output_created','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','1.0.0','perf-event-'||g
from generate_series(1,50000) g;
analyze public.production_outputs;analyze public.production_output_measurements;analyze public.production_output_components;
analyze public.production_output_reconciliations;analyze public.production_output_events;
\echo 'OUTPUT SUMMARY'
explain(analyze,buffers) select * from public.production_outputs where workspace_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and production_run_id='perf-run' order by output_sequence;
\echo 'MEASUREMENT HISTORY'
explain(analyze,buffers) select * from public.production_output_measurements where workspace_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and production_output_id=md5('output-5000')::uuid order by measurement_version desc;
\echo 'COMPONENTS'
explain(analyze,buffers) select * from public.production_output_components where workspace_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and production_output_id=md5('output-5000')::uuid;
\echo 'RECONCILIATION'
explain(analyze,buffers) select * from public.production_output_reconciliations where workspace_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and production_output_id=md5('output-5000')::uuid order by reconciliation_version desc;
\echo 'AUDIT EVENTS'
explain(analyze,buffers) select * from public.production_output_events where workspace_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' and production_run_id='perf-run' order by occurred_at,id limit 100;
rollback;
