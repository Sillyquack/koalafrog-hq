\set ON_ERROR_STOP on
begin;
set local session_replication_role=replica;

create temp table packaging_plan_ids as
with inserted as(
  insert into public.packaging_runs(
    workspace_id,owner_id,production_output_id,production_run_id,formula_version_id,product_id,
    packaging_specification_version_id,run_sequence,internal_run_code,run_label,planned_bulk_quantity,
    planned_bulk_unit,planned_bulk_normalized_quantity,planned_bulk_normalized_unit,planned_unit_count,
    nominal_fill_quantity,nominal_fill_unit,target_packaging_format,location,product_name_snapshot,
    formula_version_snapshot,production_output_code_snapshot,packaging_specification_name_snapshot,
    packaging_specification_version_snapshot,packaging_specification_snapshot,bulk_cost_confidence,status,
    creation_idempotency_key,creation_payload_fingerprint,created_by
  )
  select '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
    gen_random_uuid(), 'perf-run-'||n, 'perf-formula-v1', 'perf-product', 'perf-packaging-v1',
    1, 'PERF-PKG-'||n, 'Performance Packaging Run',100,'g',100,'g',10,10,'g','retail','Packaging',
    'Performance Product','1.0','PERF-OUT-'||n,'Performance Pack','1.0','{}','complete',
    case when n%10=0 then 'completed' else 'in_progress' end,gen_random_uuid(),md5(n::text),
    '00000000-0000-0000-0000-000000000002'
  from generate_series(1,10000)n
  returning id,workspace_id,owner_id,production_output_id,production_run_id
) select *,row_number() over() n from inserted;

insert into public.packaging_run_requirements(
  workspace_id,owner_id,packaging_run_id,packaging_specification_version_id,packaging_specification_line_id,
  packaging_component_id,component_name_snapshot,component_role_snapshot,units_required_per_finished_unit,
  planned_unit_count,total_required_quantity,unit,normalized_quantity,expected_waste_allowance,
  eligibility_policy_version,sequence,instructions
)
select p.workspace_id,p.owner_id,p.id,'perf-packaging-v1','perf-line-'||component,
  'perf-component-'||component,'Component '||component,'primary',1,10,10,'pcs',10,1,'1.0.0',component,''
from packaging_plan_ids p cross join generate_series(1,4)component;

insert into public.packaging_run_bulk_allocations(
  workspace_id,owner_id,packaging_run_id,production_output_id,allocated_quantity,unit,normalized_quantity,
  normalized_unit,allocation_method,output_available_before_snapshot,output_available_after_snapshot,
  transferred_normalized_quantity,status,allocated_by,allocated_at,idempotency_key,payload_fingerprint
)
select workspace_id,owner_id,id,production_output_id,100,'g',100,'g','performance',100,0,100,'transferred',
  owner_id,now(),gen_random_uuid(),md5(id::text) from packaging_plan_ids;

insert into public.packaging_run_reservations(
  workspace_id,owner_id,packaging_run_id,packaging_requirement_id,packaging_inventory_lot_id,
  reserved_quantity,unit,reserved_in_lot_unit,consumed_in_lot_unit,status,reserved_by,reserved_at,
  idempotency_key,payload_fingerprint
)
select r.workspace_id,r.owner_id,r.packaging_run_id,r.id,'perf-lot-'||r.packaging_component_id,
  10,'pcs',10,case when p.n%5=0 then 0 else 10 end,
  case when p.n%5=0 then 'active' else 'fulfilled' end,r.owner_id,now(),gen_random_uuid(),md5(r.id::text)
from public.packaging_run_requirements r join packaging_plan_ids p on p.id=r.packaging_run_id;

insert into public.packaging_run_reconciliations(
  workspace_id,owner_id,packaging_run_id,reconciliation_version,policy_version,
  pending_finished_goods_normalized_quantity,retained_bulk_normalized_quantity,bulk_waste_normalized_quantity,
  unexplained_bulk_variance,unexplained_packaging_variance,state,reconciled_by,reconciled_at,
  idempotency_key,payload_fingerprint
)
select workspace_id,owner_id,id,1,'1.0.0',100,0,0,0,0,'reconciled',owner_id,now(),gen_random_uuid(),md5(id::text)
from packaging_plan_ids;

insert into public.packaging_run_events(
  workspace_id,owner_id,packaging_run_id,production_output_id,production_run_id,event_type,actor_id,
  policy_version,event_key,metadata
)
select p.workspace_id,p.owner_id,p.id,p.production_output_id,p.production_run_id,'performance_event',p.owner_id,
  '1.0.0','performance:'||p.n||':'||event,'{}'
from packaging_plan_ids p cross join generate_series(1,5)event;

analyze public.packaging_runs;
analyze public.packaging_run_requirements;
analyze public.packaging_run_bulk_allocations;
analyze public.packaging_run_reservations;
analyze public.packaging_run_reconciliations;
analyze public.packaging_run_events;

\echo 'Packaging Runs by Production Output (10,000 runs)'
explain(analyze,buffers) select * from public.packaging_runs
where workspace_id='00000000-0000-0000-0000-000000000001'
  and production_output_id=(select production_output_id from packaging_plan_ids where n=5000);

\echo 'Packaging Run requirements (40,000 requirements)'
explain(analyze,buffers) select * from public.packaging_run_requirements
where workspace_id='00000000-0000-0000-0000-000000000001'
  and packaging_run_id=(select id from packaging_plan_ids where n=5000) order by sequence;

\echo 'Active reservation aggregation (40,000 reservations)'
explain(analyze,buffers) select packaging_inventory_lot_id,
  sum(reserved_in_lot_unit-consumed_in_lot_unit-waste_in_lot_unit)
from public.packaging_run_reservations
where workspace_id='00000000-0000-0000-0000-000000000001' and status in('active','partially_used')
group by packaging_inventory_lot_id;

\echo 'Packaging Run reconciliation and readiness sources'
explain(analyze,buffers) select r.*,coalesce(a.active_count,0)
from public.packaging_runs r
left join lateral(
  select count(*) active_count from public.packaging_run_reservations x
  where x.workspace_id=r.workspace_id and x.packaging_run_id=r.id and x.status in('active','partially_used')
)a on true
where r.workspace_id='00000000-0000-0000-0000-000000000001'
  and r.id=(select id from packaging_plan_ids where n=5000);

\echo 'Packaging Run genealogy event history (50,000 events)'
explain(analyze,buffers) select * from public.packaging_run_events
where workspace_id='00000000-0000-0000-0000-000000000001'
  and packaging_run_id=(select id from packaging_plan_ids where n=5000)
order by occurred_at,id;

rollback;
