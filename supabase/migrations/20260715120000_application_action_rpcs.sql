create or replace function public.kf_convert_quantity(q numeric, from_unit text, to_unit text)
returns numeric language sql immutable set search_path=public,pg_temp as $$
  select case
    when from_unit=to_unit then q
    when from_unit='kg' and to_unit='g' then q*1000
    when from_unit='g' and to_unit='kg' then q/1000
    when from_unit='L' and to_unit='ml' then q*1000
    when from_unit='ml' and to_unit='L' then q/1000
    else null end
$$;

create or replace function public.kf_inventory_balance(wid uuid, lot_id text)
returns numeric language sql stable set search_path=public,pg_temp as $$
  select coalesce(sum(case when m.type='Receipt' then kf_convert_quantity(m.quantity,m.unit,l.unit)
    when m.type='Adjustment' then kf_convert_quantity(m.quantity,m.unit,l.unit)
    else -abs(kf_convert_quantity(m.quantity,m.unit,l.unit)) end),0)
  from inventory_lots l left join inventory_movements m on m.workspace_id=l.workspace_id and m.inventory_lot_id=l.id
  where l.workspace_id=wid and l.id=lot_id group by l.id
$$;

create or replace function public.kf_packaging_balance(wid uuid, lot_id text)
returns numeric language sql stable set search_path=public,pg_temp as $$
  select coalesce(sum(case when m.type='Receipt' then kf_convert_quantity(m.quantity,m.unit,l.unit)
    when m.type='Adjustment' then kf_convert_quantity(m.quantity,m.unit,l.unit)
    else -abs(kf_convert_quantity(m.quantity,m.unit,l.unit)) end),0)
  from packaging_inventory_lots l left join packaging_inventory_movements m on m.workspace_id=l.workspace_id and m.packaging_inventory_lot_id=l.id
  where l.workspace_id=wid and l.id=lot_id group by l.id
$$;

create or replace function public.commit_lab_consumption(batch_id text, commits jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();wid uuid;item jsonb;a lab_lot_allocations%rowtype;ln lab_batch_lines%rowtype;b lab_batches%rowtype;l inventory_lots%rowtype;needed numeric;result jsonb:='[]';
begin
  if uid is null then raise exception 'Authentication required';end if;
  select id into wid from workspaces where owner_id=uid;if wid is null then raise exception 'Workspace not found';end if;
  if jsonb_array_length(commits)=0 then raise exception 'No allocations to commit';end if;
  for item in select value from jsonb_array_elements(commits) loop
    select * into a from lab_lot_allocations where workspace_id=wid and id=item->>'allocation_id' for update;
    if not found then raise exception 'Lab allocation not found';end if;if a.inventory_movement_id is not null then raise exception 'Lab allocation already committed';end if;
    select * into ln from lab_batch_lines where workspace_id=wid and id=a.lab_batch_line_id;
    select * into b from lab_batches where workspace_id=wid and id=ln.lab_batch_id and id=batch_id;
    if not found or b.status<>'In Progress' then raise exception 'Lab Batch is not commit-ready';end if;
    select * into l from inventory_lots where workspace_id=wid and id=a.inventory_lot_id for update;
    if not found then raise exception 'Inventory Lot not found';end if;
    needed:=kf_convert_quantity(a.quantity,a.unit,l.unit);if needed is null then raise exception 'Incompatible inventory units';end if;
    if needed<=0 or kf_inventory_balance(wid,l.id)<needed then raise exception 'Insufficient inventory balance';end if;
    insert into inventory_movements(workspace_id,owner_id,id,inventory_lot_id,type,quantity,unit,reason,reference_type,reference_id,notes,occurred_at,created_at)
    values(wid,uid,item->>'movement_id',l.id,'Consumption',a.quantity,a.unit,'Lab batch '||b.batch_number,'LabBatch',b.id,coalesce(item->>'notes',''),item->>'occurred_at',item->>'created_at');
    update lab_lot_allocations set inventory_movement_id=item->>'movement_id' where workspace_id=wid and id=a.id;
    result:=result||jsonb_build_array(jsonb_build_object('allocationId',a.id,'movementId',item->>'movement_id'));
  end loop;return result;
end $$;

create or replace function public.commit_production_consumption(run_id text, commits jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();wid uuid;item jsonb;a production_lot_allocations%rowtype;ln production_run_lines%rowtype;r production_runs%rowtype;l inventory_lots%rowtype;needed numeric;unit_cost numeric;result jsonb:='[]';
begin
  if uid is null then raise exception 'Authentication required';end if;select id into wid from workspaces where owner_id=uid;if wid is null then raise exception 'Workspace not found';end if;
  if jsonb_array_length(commits)=0 then raise exception 'No allocations to commit';end if;
  for item in select value from jsonb_array_elements(commits) loop
    select * into a from production_lot_allocations where workspace_id=wid and id=item->>'allocation_id' for update;
    if not found then raise exception 'Production allocation not found';end if;if a.inventory_movement_id is not null then raise exception 'Production allocation already committed';end if;
    select * into ln from production_run_lines where workspace_id=wid and id=a.production_run_line_id;select * into r from production_runs where workspace_id=wid and id=ln.production_run_id and id=run_id;
    if not found or r.status<>'In Progress' then raise exception 'Production Run is not commit-ready';end if;
    select * into l from inventory_lots where workspace_id=wid and id=a.inventory_lot_id for update;if not found then raise exception 'Inventory Lot not found';end if;
    needed:=kf_convert_quantity(a.quantity,a.unit,l.unit);if needed is null then raise exception 'Incompatible inventory units';end if;if needed<=0 or kf_inventory_balance(wid,l.id)<needed then raise exception 'Insufficient inventory balance';end if;
    unit_cost:=case when l.total_acquisition_cost is not null and l.opening_quantity>0 then (l.total_acquisition_cost/l.opening_quantity)*kf_convert_quantity(1,a.unit,l.unit) end;
    insert into inventory_movements(workspace_id,owner_id,id,inventory_lot_id,type,quantity,unit,reason,reference_type,reference_id,notes,occurred_at,created_at)
    values(wid,uid,item->>'movement_id',l.id,'Consumption',a.quantity,a.unit,'Production run '||r.production_run_number,'ProductionRun',r.id,coalesce(item->>'notes',''),item->>'occurred_at',item->>'created_at');
    update production_lot_allocations set inventory_movement_id=item->>'movement_id',unit_cost_snapshot=unit_cost,cost_currency_snapshot=case when unit_cost is null then null else l.acquisition_cost_currency end where workspace_id=wid and id=a.id;
    result:=result||jsonb_build_array(jsonb_build_object('allocationId',a.id,'movementId',item->>'movement_id','unitCostSnapshot',unit_cost,'costCurrencySnapshot',case when unit_cost is null then null else l.acquisition_cost_currency end));
  end loop;return result;
end $$;

create or replace function public.commit_packaging_consumption(target_finished_goods_batch_id text, commits jsonb, receipt jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();wid uuid;item jsonb;a packaging_allocations%rowtype;b finished_goods_batches%rowtype;l packaging_inventory_lots%rowtype;needed numeric;unit_cost numeric;req record;result jsonb:='[]';
begin
  if uid is null then raise exception 'Authentication required';end if;select id into wid from workspaces where owner_id=uid;if wid is null then raise exception 'Workspace not found';end if;
  select f.* into b from finished_goods_batches f where f.workspace_id=wid and f.id=target_finished_goods_batch_id for update;if not found or b.packaging_specification_version_id is null then raise exception 'Packaged Finished Goods Batch not found';end if;
  if exists(select 1 from finished_goods_movements where workspace_id=wid and finished_goods_batch_id=b.id and type='ProductionReceipt') then raise exception 'Packaging consumption already committed';end if;
  for req in select sl.id,sl.quantity_per_unit*b.initial_quantity required,coalesce(sum(pa.quantity),0) allocated from packaging_specification_lines sl left join packaging_allocations pa on pa.workspace_id=sl.workspace_id and pa.packaging_specification_line_id=sl.id and pa.finished_goods_batch_id=b.id where sl.workspace_id=wid and sl.packaging_specification_version_id=b.packaging_specification_version_id group by sl.id,sl.quantity_per_unit loop if abs(req.required-req.allocated)>.0001 then raise exception 'Packaging allocations do not match requirements';end if;end loop;
  for item in select value from jsonb_array_elements(commits) loop
    select * into a from packaging_allocations where workspace_id=wid and id=item->>'allocation_id' and finished_goods_batch_id=b.id for update;if not found then raise exception 'Packaging allocation not found';end if;if a.packaging_inventory_movement_id is not null then raise exception 'Packaging allocation already committed';end if;
    select * into l from packaging_inventory_lots where workspace_id=wid and id=a.packaging_inventory_lot_id for update;if not found then raise exception 'Packaging Lot not found';end if;
    needed:=kf_convert_quantity(a.quantity,a.unit,l.unit);if needed is null then raise exception 'Incompatible packaging units';end if;if needed<=0 or kf_packaging_balance(wid,l.id)<needed then raise exception 'Insufficient packaging balance';end if;
    unit_cost:=case when l.total_acquisition_cost is not null and l.opening_quantity>0 then (l.total_acquisition_cost/l.opening_quantity)*kf_convert_quantity(1,a.unit,l.unit) end;
    insert into packaging_inventory_movements(workspace_id,owner_id,id,packaging_inventory_lot_id,type,quantity,unit,reason,reference_type,reference_id,notes,occurred_at,created_at) values(wid,uid,item->>'movement_id',l.id,'Consumption',a.quantity,a.unit,'Finished Goods '||b.finished_goods_batch_number,'FinishedGoodsBatch',b.id,'',item->>'occurred_at',item->>'created_at');
    update packaging_allocations set packaging_inventory_movement_id=item->>'movement_id',unit_cost_snapshot=unit_cost,cost_currency_snapshot=case when unit_cost is null then null else l.acquisition_cost_currency end where workspace_id=wid and id=a.id;result:=result||jsonb_build_array(jsonb_build_object('allocationId',a.id,'movementId',item->>'movement_id','unitCostSnapshot',unit_cost));
  end loop;
  insert into finished_goods_movements(workspace_id,owner_id,id,finished_goods_batch_id,type,quantity,unit,reason,reference_type,reference_id,notes,occurred_at,created_at) values(wid,uid,receipt->>'id',b.id,'ProductionReceipt',b.initial_quantity,b.unit,'Packaging committed and Production output finalized','ProductionRun',b.production_run_id,'',receipt->>'occurred_at',receipt->>'created_at');
  update finished_goods_batches set status='Active',updated_at=receipt->>'created_at' where workspace_id=wid and id=b.id;return jsonb_build_object('commits',result,'receiptId',receipt->>'id');
end $$;

create or replace function public.register_finished_goods_output(batch jsonb, receipt jsonb default null)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();wid uuid;r production_runs%rowtype;registered numeric;
begin
  if uid is null then raise exception 'Authentication required';end if;select id into wid from workspaces where owner_id=uid;if wid is null then raise exception 'Workspace not found';end if;
  select * into r from production_runs where workspace_id=wid and id=batch->>'production_run_id' for update;if not found or r.actual_units_produced is null then raise exception 'Production output is not available';end if;
  if r.product_id<>batch->>'product_id' or r.formula_version_id<>batch->>'formula_version_id' then raise exception 'Finished Goods traceability mismatch';end if;
  select coalesce(sum(initial_quantity),0) into registered from finished_goods_batches where workspace_id=wid and production_run_id=r.id;
  if (batch->>'initial_quantity')::numeric<=0 or registered+(batch->>'initial_quantity')::numeric>r.actual_units_produced then raise exception 'Finished Goods output exceeds remaining Production output';end if;
  if batch->>'packaging_specification_version_id' is not null and not exists(select 1 from packaging_specification_versions where workspace_id=wid and id=batch->>'packaging_specification_version_id' and status='Approved') then raise exception 'Approved Packaging Specification Version required';end if;
  insert into finished_goods_batches select (jsonb_populate_record(null::finished_goods_batches,batch||jsonb_build_object('workspace_id',wid,'owner_id',uid))).*;
  if batch->>'packaging_specification_version_id' is null then if receipt is null then raise exception 'ProductionReceipt required';end if;insert into finished_goods_movements select (jsonb_populate_record(null::finished_goods_movements,receipt||jsonb_build_object('workspace_id',wid,'owner_id',uid))).*;end if;
  return jsonb_build_object('batchId',batch->>'id','receiptId',case when receipt is null then null else receipt->>'id' end);
end $$;

revoke all on function public.kf_convert_quantity(numeric,text,text),public.kf_inventory_balance(uuid,text),public.kf_packaging_balance(uuid,text),public.commit_lab_consumption(text,jsonb),public.commit_production_consumption(text,jsonb),public.commit_packaging_consumption(text,jsonb,jsonb),public.register_finished_goods_output(jsonb,jsonb) from public,anon;
grant execute on function public.commit_lab_consumption(text,jsonb),public.commit_production_consumption(text,jsonb),public.commit_packaging_consumption(text,jsonb,jsonb),public.register_finished_goods_output(jsonb,jsonb) to authenticated;
