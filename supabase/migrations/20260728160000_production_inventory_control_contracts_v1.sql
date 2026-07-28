-- Additive application contracts for Production Inventory Control V1.

create function public.record_batch_material_weighing_v2(
  target_reservation_id uuid,expected_reservation_revision bigint,record_type text,
  weighing_quantity numeric,weighing_unit text,planned_sequence integer,planned_container text,
  equipment_reference text,evidence_reference text,operator_note text,candidate_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();wid uuid;r public.inventory_reservations;lot public.inventory_lots;
  normalized numeric;fingerprint text;existing public.batch_material_weighings;weighing_id uuid;
  target_quantity numeric;formula_version text;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED';end if;
  if record_type not in('planned','actual') or weighing_quantity<=0 or weighing_quantity>1000000000 then raise exception 'WEIGHING_INVALID';end if;
  if record_type='planned' and (planned_sequence is null or planned_sequence<1 or planned_sequence>1000000) then raise exception 'PLANNED_SEQUENCE_INVALID';end if;
  if record_type='actual' and (planned_sequence is not null or nullif(trim(coalesce(planned_container,'')),'') is not null) then raise exception 'ACTUAL_WEIGHING_PLANNED_FIELDS_FORBIDDEN';end if;
  if length(coalesce(planned_container,''))>160 then raise exception 'PLANNED_CONTAINER_TOO_LONG';end if;
  select w.id into wid from public.workspaces w where w.owner_id=uid and w.lifecycle_state='active';
  fingerprint:=md5(concat_ws('|',target_reservation_id,expected_reservation_revision,record_type,weighing_quantity,weighing_unit,
    planned_sequence,nullif(trim(coalesce(planned_container,'')),''),equipment_reference,evidence_reference,operator_note));
  select * into existing from public.batch_material_weighings where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then
    if existing.payload_fingerprint<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT';end if;
    return jsonb_build_object('weighingId',existing.id,'retry',true);
  end if;
  select * into r from public.inventory_reservations where workspace_id=wid and owner_id=uid and id=target_reservation_id for update;
  if not found then raise exception 'RESERVATION_UNAVAILABLE';end if;
  if r.revision<>expected_reservation_revision then raise exception 'STALE_RESERVATION_REVISION';end if;
  if r.status not in('active','partially_consumed') then raise exception 'RESERVATION_NOT_WEIGHABLE';end if;
  select * into lot from public.inventory_lots where workspace_id=wid and id=r.inventory_lot_id for update;
  normalized:=public.kf_convert_quantity(weighing_quantity,weighing_unit,lot.unit);
  if normalized is null then raise exception 'WEIGHING_UNIT_INCOMPATIBLE';end if;
  if record_type='actual' and public.kf_convert_quantity(weighing_quantity,weighing_unit,r.unit)>r.remaining_quantity then raise exception 'WEIGHING_EXCEEDS_RESERVATION';end if;
  if record_type='planned' and public.kf_convert_quantity(weighing_quantity,weighing_unit,r.unit)>r.remaining_quantity then raise exception 'PLANNED_WEIGHING_EXCEEDS_RESERVATION';end if;
  if r.batch_kind='lab' then
    select line.planned_quantity,batch.formula_version_id into target_quantity,formula_version
    from public.lab_batch_lines line join public.lab_batches batch on batch.workspace_id=line.workspace_id and batch.id=line.lab_batch_id
    where line.workspace_id=wid and line.id=r.requirement_id and batch.status in('Planned','In Progress');
  else
    select line.planned_quantity,run.formula_version_id into target_quantity,formula_version
    from public.production_run_lines line join public.production_runs run on run.workspace_id=line.workspace_id and run.id=line.production_run_id
    where line.workspace_id=wid and line.id=r.requirement_id and run.status in('Planned','In Progress');
  end if;
  if target_quantity is null then raise exception 'BATCH_NOT_WEIGHABLE';end if;
  weighing_id:=gen_random_uuid();
  insert into public.batch_material_weighings(
    id,workspace_id,owner_id,batch_kind,batch_id,requirement_id,allocation_id,reservation_id,inventory_lot_id,
    record_type,planned_quantity,actual_quantity,unit,normalized_quantity,planned_sequence,planned_container,
    equipment_reference,evidence_reference,operator_note,deviation_from_target,actor_id,idempotency_key,payload_fingerprint
  ) values(
    weighing_id,wid,uid,r.batch_kind,r.batch_id,r.requirement_id,r.allocation_id,r.id,r.inventory_lot_id,
    record_type,case when record_type='planned' then weighing_quantity end,case when record_type='actual' then weighing_quantity end,
    weighing_unit,normalized,case when record_type='planned' then planned_sequence end,
    case when record_type='planned' then nullif(trim(coalesce(planned_container,'')),'') end,
    equipment_reference,evidence_reference,operator_note,
    case when record_type='actual' then public.kf_convert_quantity(weighing_quantity,weighing_unit,r.unit)-target_quantity end,
    uid,candidate_idempotency_key,fingerprint
  );
  insert into public.batch_material_events(workspace_id,owner_id,batch_kind,batch_id,formula_version_id,requirement_id,inventory_lot_id,reservation_id,allocation_id,weighing_id,event_type,quantity,unit,actor_id,event_key,metadata)
  values(wid,uid,r.batch_kind,r.batch_id,formula_version,r.requirement_id,r.inventory_lot_id,r.id,r.allocation_id,weighing_id,
    'batch_material_weighing_recorded',weighing_quantity,weighing_unit,uid,'weighing:'||weighing_id,
    jsonb_build_object('type',record_type,'plannedSequence',planned_sequence,'plannedContainer',nullif(trim(coalesce(planned_container,'')),''),
      'equipmentReference',equipment_reference,'evidenceReference',evidence_reference));
  return jsonb_build_object('weighingId',weighing_id,'retry',false);
end $$;

create function public.kf_batch_material_completion_readiness_v1(target_workspace_id uuid,target_batch_kind text,target_batch_id text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare batch_revision bigint;batch_status text;yield_missing boolean;total integer;reconciled integer;active integer;blockers jsonb;
begin
  if target_batch_kind='lab' then
    select revision,status,actual_yield is null into batch_revision,batch_status,yield_missing
    from public.lab_batches where workspace_id=target_workspace_id and id=target_batch_id;
    select count(*) into total from public.lab_batch_lines where workspace_id=target_workspace_id and lab_batch_id=target_batch_id;
  elsif target_batch_kind='production' then
    select revision,status,actual_yield is null into batch_revision,batch_status,yield_missing
    from public.production_runs where workspace_id=target_workspace_id and id=target_batch_id;
    select count(*) into total from public.production_run_lines where workspace_id=target_workspace_id and production_run_id=target_batch_id;
  else raise exception 'BATCH_KIND_INVALID';end if;
  if batch_revision is null then raise exception 'BATCH_UNAVAILABLE';end if;
  select count(*) into reconciled from public.batch_material_reconciliations
    where workspace_id=target_workspace_id and batch_kind=target_batch_kind and batch_id=target_batch_id and state='reconciled' and remaining_reservation=0;
  select count(*) into active from public.inventory_reservations
    where workspace_id=target_workspace_id and batch_kind=target_batch_kind and batch_id=target_batch_id
      and status in('active','partially_consumed','exception');
  with requirements as (
    select id,ingredient_id,ingredient_name_snapshot,planned_quantity,unit from public.lab_batch_lines
      where target_batch_kind='lab' and workspace_id=target_workspace_id and lab_batch_id=target_batch_id
    union all
    select id,ingredient_id,ingredient_name_snapshot,planned_quantity,unit from public.production_run_lines
      where target_batch_kind='production' and workspace_id=target_workspace_id and production_run_id=target_batch_id
  ), issues as (
    select 'yield_missing' code,'batch' category,'error' severity,true blocks,null::text requirement_id,null::text ingredient_id,
      null::text ingredient_name,null::text inventory_lot_id,null::uuid reservation_id,null::numeric quantity,null::text unit,
      'Actual yield is required.' message,'Record actual yield.' action,'{}'::jsonb metadata where yield_missing
    union all
    select 'material_not_allocated','allocation','error',true,q.id,q.ingredient_id,q.ingredient_name_snapshot,null,null,q.planned_quantity,q.unit,
      'No controlled lot allocation exists.','Reserve an eligible released lot.','{}'::jsonb
      from requirements q where not exists(select 1 from public.batch_material_lot_allocations a where a.workspace_id=target_workspace_id and a.batch_kind=target_batch_kind and coalesce(a.lab_batch_line_id,a.production_run_line_id)=q.id)
    union all
    select 'planned_weighing_missing','weighing','error',true,q.id,q.ingredient_id,q.ingredient_name_snapshot,null,null,q.planned_quantity,q.unit,
      'Planned weighing is missing.','Record planned weighing intent.','{}'::jsonb
      from requirements q where not exists(select 1 from public.batch_material_weighings w where w.workspace_id=target_workspace_id and w.batch_kind=target_batch_kind and w.batch_id=target_batch_id and w.requirement_id=q.id and w.record_type='planned')
    union all
    select 'actual_weighing_missing','weighing','error',true,q.id,q.ingredient_id,q.ingredient_name_snapshot,null,null,q.planned_quantity,q.unit,
      'Actual weighing is missing.','Record actual weighing evidence.','{}'::jsonb
      from requirements q where not exists(select 1 from public.batch_material_weighings w where w.workspace_id=target_workspace_id and w.batch_kind=target_batch_kind and w.batch_id=target_batch_id and w.requirement_id=q.id and w.record_type in('actual','correction'))
    union all
    select 'productive_consumption_missing','consumption','error',true,q.id,q.ingredient_id,q.ingredient_name_snapshot,null,null,q.planned_quantity,q.unit,
      'Productive consumption is missing.','Confirm productive consumption.','{}'::jsonb
      from requirements q where not exists(select 1 from public.batch_material_consumptions c where c.workspace_id=target_workspace_id and c.batch_kind=target_batch_kind and c.batch_id=target_batch_id and c.requirement_id=q.id)
    union all
    select 'material_reconciliation_incomplete','reconciliation','error',true,q.id,q.ingredient_id,q.ingredient_name_snapshot,null,null,q.planned_quantity,q.unit,
      'Material reconciliation is incomplete.','Reconcile this material requirement.','{}'::jsonb
      from requirements q where not exists(select 1 from public.batch_material_reconciliations x where x.workspace_id=target_workspace_id and x.batch_kind=target_batch_kind and x.batch_id=target_batch_id and x.requirement_id=q.id and x.state='reconciled' and x.remaining_reservation=0)
    union all
    select 'active_reservation_remaining','reservation','error',true,r.requirement_id,q.ingredient_id,q.ingredient_name_snapshot,r.inventory_lot_id,r.id,r.remaining_quantity,r.unit,
      'An active reservation remains.','Release, return, consume, or reconcile the remaining reservation.',
      jsonb_build_object('reservationStatus',r.status)
      from public.inventory_reservations r join requirements q on q.id=r.requirement_id
      where r.workspace_id=target_workspace_id and r.batch_kind=target_batch_kind and r.batch_id=target_batch_id and r.status in('active','partially_consumed','exception')
    union all
    select 'unexplained_variance','variance','error',true,x.requirement_id,q.ingredient_id,q.ingredient_name_snapshot,null,null,x.unexplained_variance,x.unit,
      'Unexplained variance requires review.','Document and approve the variance.',jsonb_build_object('state',x.state,'tolerance',x.tolerance_quantity)
      from public.batch_material_reconciliations x join requirements q on q.id=x.requirement_id
      where x.workspace_id=target_workspace_id and x.batch_kind=target_batch_kind and x.batch_id=target_batch_id and x.state<>'reconciled'
  )
  select coalesce(jsonb_agg(jsonb_build_object('blockerCode',code,'category',category,'severity',severity,'blocksCompletion',blocks,
    'requirementId',requirement_id,'ingredientId',ingredient_id,'ingredientNameSnapshot',ingredient_name,'inventoryLotId',inventory_lot_id,
    'reservationId',reservation_id,'quantity',quantity,'unit',unit,'humanMessage',message,'recommendedAction',action,'structuredMetadata',metadata)
    order by category,requirement_id,code),'[]'::jsonb) into blockers from issues;
  return jsonb_build_object('batchId',target_batch_id,'batchType',target_batch_kind,'batchRevision',batch_revision,
    'completionPolicyVersion','1.1.0','state',case when batch_status='Completed' then 'completed' when jsonb_array_length(blockers)=0 then 'ready_for_completion' else 'not_ready_for_completion' end,
    'readyForCompletion',jsonb_array_length(blockers)=0,'completed',batch_status='Completed','evaluatedAt',now(),
    'totalRequirements',total,'reconciledRequirements',reconciled,'blockedRequirements',
      (select count(distinct value->>'requirementId') from jsonb_array_elements(blockers) where value->>'requirementId' is not null),
    'activeReservations',active,'unresolvedVariances',(select count(*) from jsonb_array_elements(blockers) where value->>'category'='variance'),
    'missingPlannedWeighings',(select count(*) from jsonb_array_elements(blockers) where value->>'blockerCode'='planned_weighing_missing'),
    'missingActualWeighings',(select count(*) from jsonb_array_elements(blockers) where value->>'blockerCode'='actual_weighing_missing'),
    'missingYield',yield_missing,'blockers',blockers);
end $$;

create function public.get_batch_material_completion_readiness_v1(target_batch_kind text,target_batch_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();wid uuid;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED';end if;
  select id into wid from public.workspaces where owner_id=uid and lifecycle_state='active';
  if wid is null then raise exception 'ACTIVE_WORKSPACE_REQUIRED';end if;
  if target_batch_kind='lab' and not exists(select 1 from public.lab_batches where workspace_id=wid and owner_id=uid and id=target_batch_id) then raise exception 'BATCH_UNAVAILABLE';end if;
  if target_batch_kind='production' and not exists(select 1 from public.production_runs where workspace_id=wid and owner_id=uid and id=target_batch_id) then raise exception 'BATCH_UNAVAILABLE';end if;
  return public.kf_batch_material_completion_readiness_v1(wid,target_batch_kind,target_batch_id);
end $$;

create or replace function public.enforce_batch_inventory_completion()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare kind text;readiness jsonb;first_code text;
begin
  kind:=case tg_table_name when 'lab_batches' then 'lab' else 'production' end;
  if new.status='Completed' and old.status is distinct from 'Completed' then
    readiness:=public.kf_batch_material_completion_readiness_v1(new.workspace_id,kind,new.id);
    if not coalesce((readiness->>'readyForCompletion')::boolean,false) then
      first_code:=readiness->'blockers'->0->>'blockerCode';
      raise exception 'BATCH_COMPLETION_BLOCKED:%',coalesce(first_code,'other_policy_rejection');
    end if;
  end if;
  if new.status='Aborted' and old.status is distinct from 'Aborted' then
    update public.inventory_reservations set released_quantity=released_quantity+remaining_quantity,remaining_quantity=0,status='cancelled',
      released_by=(select auth.uid()),released_at=now(),revision=revision+1,updated_at=now()
    where workspace_id=new.workspace_id and batch_kind=kind and batch_id=new.id and status in('active','partially_consumed','exception');
    update public.batch_material_lot_allocations set status='cancelled',revision=revision+1,updated_at=now()
    where workspace_id=new.workspace_id and batch_kind=kind and coalesce(lab_batch_id,production_run_id)=new.id and status in('allocated','reserved','partially_consumed');
  end if;
  return new;
end $$;

create function public.get_batch_material_provenance_v1(target_batch_kind text,target_batch_id text,target_requirement_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();wid uuid;formula_version text;nodes jsonb;requirement_exists boolean;
  requirement_ingredient_id text;requirement_name text;requirement_quantity numeric;requirement_unit text;ingredient_differs boolean;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED';end if;
  select id into wid from public.workspaces where owner_id=uid and lifecycle_state='active';
  if target_batch_kind='lab' then
    select b.formula_version_id,exists(select 1 from public.lab_batch_lines l where l.workspace_id=wid and l.lab_batch_id=b.id and l.id=target_requirement_id)
      into formula_version,requirement_exists from public.lab_batches b where b.workspace_id=wid and b.owner_id=uid and b.id=target_batch_id;
    select l.ingredient_id,l.ingredient_name_snapshot,l.planned_quantity,l.unit,
      coalesce(i.common_name is distinct from l.ingredient_name_snapshot,true)
      into requirement_ingredient_id,requirement_name,requirement_quantity,requirement_unit,ingredient_differs
      from public.lab_batch_lines l left join public.ingredients i on i.workspace_id=l.workspace_id and i.id=l.ingredient_id
      where l.workspace_id=wid and l.lab_batch_id=target_batch_id and l.id=target_requirement_id;
  elsif target_batch_kind='production' then
    select b.formula_version_id,exists(select 1 from public.production_run_lines l where l.workspace_id=wid and l.production_run_id=b.id and l.id=target_requirement_id)
      into formula_version,requirement_exists from public.production_runs b where b.workspace_id=wid and b.owner_id=uid and b.id=target_batch_id;
    select l.ingredient_id,l.ingredient_name_snapshot,l.planned_quantity,l.unit,
      coalesce(i.common_name is distinct from l.ingredient_name_snapshot,true)
      into requirement_ingredient_id,requirement_name,requirement_quantity,requirement_unit,ingredient_differs
      from public.production_run_lines l left join public.ingredients i on i.workspace_id=l.workspace_id and i.id=l.ingredient_id
      where l.workspace_id=wid and l.production_run_id=target_batch_id and l.id=target_requirement_id;
  else raise exception 'BATCH_KIND_INVALID';end if;
  if formula_version is null or not coalesce(requirement_exists,false) then raise exception 'REQUIREMENT_UNAVAILABLE';end if;
  with chain as (
    select 10 ord,'formula_version' node_type,'present' lifecycle_status,formula_version immutable_id,null::text parent_id,
      'Formula Version '||formula_version historical_label,null::numeric quantity,null::text unit,null::uuid actor,null::timestamptz occurred_at,
      jsonb_build_object('formulaVersionId',formula_version) snapshot,false current_differs,'{}'::jsonb metadata
    union all select 20,'batch_material_requirement','present',target_requirement_id,formula_version,requirement_name,requirement_quantity,requirement_unit,null,null,
      jsonb_build_object('batchId',target_batch_id,'batchKind',target_batch_kind,'ingredientId',requirement_ingredient_id,
        'ingredientName',requirement_name),ingredient_differs,'{}'
    union all
    select 30,'lot_allocation','present',a.id::text,target_requirement_id,coalesce(a.supplier_product_snapshot,a.inventory_lot_id),
      a.allocated_quantity,a.unit,a.selected_by,a.selected_at,
      jsonb_build_object('supplierName',a.supplier_name_snapshot,'supplierLot',a.supplier_lot_snapshot,'status',a.lot_status_snapshot,'unitCost',a.unit_cost_snapshot),false,'{}'
      from public.batch_material_lot_allocations a where a.workspace_id=wid and a.batch_kind=target_batch_kind and coalesce(a.lab_batch_line_id,a.production_run_line_id)=target_requirement_id
    union all
    select 40,'inventory_reservation','present',r.id::text,r.allocation_id::text,'Inventory reservation',r.reserved_quantity,r.unit,r.reserved_by,r.reserved_at,
      jsonb_build_object('status',r.status,'remainingQuantity',r.remaining_quantity,'revision',r.revision),false,'{}'
      from public.inventory_reservations r where r.workspace_id=wid and r.batch_kind=target_batch_kind and r.batch_id=target_batch_id and r.requirement_id=target_requirement_id
    union all
    select case w.record_type when 'planned' then 50 else 60 end,case w.record_type when 'planned' then 'planned_weighing' else 'actual_weighing' end,
      'present',w.id::text,w.reservation_id::text,initcap(w.record_type)||' weighing',coalesce(w.planned_quantity,w.actual_quantity),w.unit,w.actor_id,w.recorded_at,
      jsonb_build_object('sequence',w.planned_sequence,'container',w.planned_container,'evidence',w.evidence_reference,'note',w.operator_note,'revision',w.revision),false,'{}'
      from public.batch_material_weighings w where w.workspace_id=wid and w.batch_kind=target_batch_kind and w.batch_id=target_batch_id and w.requirement_id=target_requirement_id
    union all
    select 70,'productive_consumption','present',c.id::text,c.weighing_id::text,c.ingredient_name_snapshot,c.consumed_quantity,c.unit,c.actor_id,c.consumed_at,
      jsonb_build_object('movementId',c.movement_id,'formulaVersionId',c.formula_version_id_snapshot,'ingredientId',c.ingredient_id_snapshot,'unitCost',c.unit_cost_snapshot,'totalCost',c.total_cost_snapshot),false,'{}'
      from public.batch_material_consumptions c where c.workspace_id=wid and c.batch_kind=target_batch_kind and c.batch_id=target_batch_id and c.requirement_id=target_requirement_id
    union all
    select 80,'waste','present',x.id::text,x.weighing_id::text,x.waste_category,x.quantity,x.unit,x.actor_id,x.recorded_at,
      jsonb_build_object('movementId',x.movement_id,'evidence',x.evidence_reference),false,'{}'
      from public.batch_material_waste x where x.workspace_id=wid and x.batch_kind=target_batch_kind and x.batch_id=target_batch_id and x.requirement_id=target_requirement_id
    union all
    select case x.return_kind when 'staged_unconsumed' then 90 else 100 end,case x.return_kind when 'staged_unconsumed' then 'staged_return' else 'post_consumption_return' end,
      'present',x.id::text,x.weighing_id::text,x.condition_assessment,x.quantity,x.unit,x.actor_id,x.returned_at,
      jsonb_build_object('movementId',x.movement_id,'evidence',x.evidence_reference,'reason',x.reason),false,'{}'
      from public.batch_material_returns x where x.workspace_id=wid and x.batch_kind=target_batch_kind and x.batch_id=target_batch_id and x.requirement_id=target_requirement_id
    union all
    select 110,'inventory_movement','present',m.id,c.id::text,m.type,m.quantity,m.unit,c.actor_id,m.occurred_at::timestamptz,
      jsonb_build_object('reason',m.reason,'referenceType',m.reference_type,'referenceId',m.reference_id),false,'{}'
      from public.batch_material_consumptions c join public.inventory_movements m on m.workspace_id=c.workspace_id and m.id=c.movement_id
      where c.workspace_id=wid and c.batch_kind=target_batch_kind and c.batch_id=target_batch_id and c.requirement_id=target_requirement_id
    union all
    select 120,'inventory_lot','present',l.id,target_requirement_id,l.internal_lot_number,l.opening_quantity,l.unit,null,l.created_at::timestamptz,
      jsonb_build_object('supplierLot',l.supplier_lot_number,'receivedDate',l.received_date,'qualityReleaseReviewId',l.quality_release_review_id,'quarantineIntakeId',l.quarantine_intake_id),false,'{}'
      from public.inventory_lots l where l.workspace_id=wid and exists(select 1 from public.inventory_reservations r where r.workspace_id=wid and r.requirement_id=target_requirement_id and r.inventory_lot_id=l.id)
    union all
    select 130,'quality_release','present',q.id::text,q.inventory_lot_id,q.decision,q.disposition_quantity,q.unit,q.reviewed_by,q.reviewed_at,
      jsonb_build_object('policyVersion',q.policy_version,'evidence',q.evidence,'acquisitionCostSource',q.acquisition_cost_source),false,'{}'
      from public.inventory_quality_release_reviews q where q.workspace_id=wid and exists(select 1 from public.inventory_lots l where l.workspace_id=wid and l.quality_release_review_id=q.id and exists(select 1 from public.inventory_reservations r where r.workspace_id=wid and r.requirement_id=target_requirement_id and r.inventory_lot_id=l.id))
    union all
    select 140,'quarantine_intake','present',i.id::text,i.receipt_id::text,i.supplier_lot_number,i.quarantine_quantity,i.unit,i.created_by,i.created_at,
      jsonb_build_object('supplierProductSnapshot',i.supplier_product_snapshot,'status',i.quarantine_status,'purchaseOrderLineId',i.purchase_order_line_id),false,'{}'
      from public.inventory_quarantine_intakes i where i.workspace_id=wid and exists(select 1 from public.inventory_lots l where l.workspace_id=wid and l.quarantine_intake_id=i.id and exists(select 1 from public.inventory_reservations r where r.workspace_id=wid and r.requirement_id=target_requirement_id and r.inventory_lot_id=l.id))
    union all
    select 150,'receipt','present',r.id::text,r.purchase_order_id::text,r.receipt_number,null,null,r.physically_received_by,r.physical_receipt_date,
      jsonb_build_object('status',r.status,'evidenceReference',r.evidence_reference),false,'{}'
      from public.purchase_order_receipts r where r.workspace_id=wid and exists(select 1 from public.inventory_quarantine_intakes i where i.workspace_id=wid and i.receipt_id=r.id and exists(select 1 from public.inventory_lots l join public.inventory_reservations z on z.workspace_id=l.workspace_id and z.inventory_lot_id=l.id where l.workspace_id=wid and l.quarantine_intake_id=i.id and z.requirement_id=target_requirement_id))
    union all
    select 160,'shipment','present',s.id::text,s.confirmation_id::text,coalesce(nullif(s.supplier_shipment_reference,''),'Shipment'),s.package_count,null,s.recorded_by,s.recorded_at,
      jsonb_build_object('carrier',s.carrier,'trackingNumber',s.tracking_number,'status',s.status),false,'{}'
      from public.purchase_order_shipments s where s.workspace_id=wid and exists(select 1 from public.purchase_order_receipt_shipments rs join public.purchase_order_receipts r on r.workspace_id=rs.workspace_id and r.id=rs.receipt_id where rs.workspace_id=wid and rs.shipment_id=s.id and exists(select 1 from public.inventory_quarantine_intakes i where i.workspace_id=wid and i.receipt_id=r.id and exists(select 1 from public.inventory_lots l join public.inventory_reservations z on z.workspace_id=l.workspace_id and z.inventory_lot_id=l.id where l.workspace_id=wid and l.quarantine_intake_id=i.id and z.requirement_id=target_requirement_id)))
    union all
    select 170,'supplier_confirmation','present',c.id::text,c.purchase_order_id::text,c.supplier_confirmation_reference,null,null,c.recorded_by,c.recorded_at,
      jsonb_build_object('classification',c.classification,'acceptanceStatus',c.acceptance_status),false,'{}'
      from public.purchase_order_confirmations c where c.workspace_id=wid and exists(select 1 from public.purchase_order_shipments s where s.workspace_id=wid and s.confirmation_id=c.id and exists(select 1 from public.purchase_order_receipt_shipments rs where rs.workspace_id=wid and rs.shipment_id=s.id and exists(select 1 from public.inventory_quarantine_intakes i where i.workspace_id=wid and i.receipt_id=rs.receipt_id and exists(select 1 from public.inventory_lots l join public.inventory_reservations z on z.workspace_id=l.workspace_id and z.inventory_lot_id=l.id where l.workspace_id=wid and l.quarantine_intake_id=i.id and z.requirement_id=target_requirement_id))))
    union all
    select 180,'purchase_order','present',o.id::text,o.source_purchase_plan_id::text,coalesce(o.order_reference,'Purchase Order'),null,null,o.created_by,o.created_at,
      jsonb_build_object('status',o.status,'sourcePurchasePlanRevision',o.source_purchase_plan_revision),false,'{}'
      from public.purchase_orders o where o.workspace_id=wid and exists(select 1 from public.inventory_quarantine_intakes i where i.workspace_id=wid and i.purchase_order_line_id in(select id from public.purchase_order_lines where workspace_id=wid and purchase_order_id=o.id) and exists(select 1 from public.inventory_lots l join public.inventory_reservations z on z.workspace_id=l.workspace_id and z.inventory_lot_id=l.id where l.workspace_id=wid and l.quarantine_intake_id=i.id and z.requirement_id=target_requirement_id))
    union all
    select 190,'purchase_plan','present',p.id::text,null,p.title,null,null,p.owner_id,p.created_at,
      jsonb_build_object('status',p.status,'revision',p.revision),false,'{}'
      from public.purchase_plans p where p.workspace_id=wid and exists(select 1 from public.purchase_orders o join public.inventory_quarantine_intakes i on i.workspace_id=o.workspace_id and i.purchase_order_line_id in(select id from public.purchase_order_lines where workspace_id=wid and purchase_order_id=o.id) where o.workspace_id=wid and o.source_purchase_plan_id=p.id and exists(select 1 from public.inventory_lots l join public.inventory_reservations z on z.workspace_id=l.workspace_id and z.inventory_lot_id=l.id where l.workspace_id=wid and l.quarantine_intake_id=i.id and z.requirement_id=target_requirement_id))
  ), expected(node_type,ord) as (values ('lot_allocation',30),('inventory_reservation',40),('planned_weighing',50),('actual_weighing',60),('productive_consumption',70),('waste',80),('staged_return',90),('post_consumption_return',100),('inventory_movement',110),('inventory_lot',120),('quality_release',130),('quarantine_intake',140),('receipt',150),('shipment',160),('supplier_confirmation',170),('purchase_order',180),('purchase_plan',190)),
  complete_chain as (
    select * from chain union all
    select e.ord,e.node_type,case when e.ord<=70 then 'not_yet_applicable' else 'not_applicable' end,null,null,initcap(replace(e.node_type,'_',' ')),null,null,null,null,'{}',false,'{}'
    from expected e where not exists(select 1 from chain c where c.node_type=e.node_type)
  )
  select jsonb_agg(jsonb_build_object('nodeType',node_type,'lifecycleStatus',lifecycle_status,'historicalLabel',historical_label,
    'immutableId',immutable_id,'parentId',parent_id,'quantity',quantity,'unit',unit,'actor',actor,'timestamp',occurred_at,
    'snapshot',snapshot,'currentMasterDiffers',current_differs,'metadata',metadata) order by ord,occurred_at,immutable_id)
    into nodes from complete_chain;
  return jsonb_build_object('contractVersion','1.0.0','batchId',target_batch_id,'batchType',target_batch_kind,
    'requirementId',target_requirement_id,'nodes',nodes);
end $$;

revoke all on function public.record_batch_material_weighing_v2(uuid,bigint,text,numeric,text,integer,text,text,text,text,uuid),
  public.kf_batch_material_completion_readiness_v1(uuid,text,text),
  public.get_batch_material_completion_readiness_v1(text,text),
  public.get_batch_material_provenance_v1(text,text,text)
from public,anon,authenticated;
grant execute on function public.record_batch_material_weighing_v2(uuid,bigint,text,numeric,text,integer,text,text,text,text,uuid),
  public.get_batch_material_completion_readiness_v1(text,text),
  public.get_batch_material_provenance_v1(text,text,text)
to authenticated,service_role;
grant execute on function public.kf_batch_material_completion_readiness_v1(uuid,text,text) to service_role;
