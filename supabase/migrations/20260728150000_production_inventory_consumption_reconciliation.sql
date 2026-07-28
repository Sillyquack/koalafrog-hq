-- Production Inventory Control V1: weighing, immutable consumption, explicit
-- waste/variance, reconciliation, and server-enforced completion policy.

create table public.batch_material_weighings(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null,
  batch_kind text not null check(batch_kind in('lab','production')),
  batch_id text not null,
  requirement_id text not null,
  allocation_id uuid not null,
  reservation_id uuid not null,
  inventory_lot_id text not null,
  record_type text not null check(record_type in('planned','actual','correction')),
  planned_quantity numeric check(planned_quantity is null or planned_quantity>0),
  actual_quantity numeric check(actual_quantity is null or actual_quantity>0),
  unit text not null check(unit in('mg','g','kg','ml','L','pcs')),
  normalized_quantity numeric not null check(normalized_quantity>0),
  planned_container text,
  planned_sequence integer check(planned_sequence is null or planned_sequence>0),
  equipment_reference text,
  evidence_reference text,
  operator_note text not null default '',
  deviation_from_target numeric,
  supersedes_weighing_id uuid,
  actor_id uuid not null,
  recorded_at timestamptz not null default now(),
  revision bigint not null default 1 check(revision>0),
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  unique(workspace_id,id),
  unique(workspace_id,idempotency_key),
  foreign key(workspace_id,allocation_id) references public.batch_material_lot_allocations(workspace_id,id),
  foreign key(workspace_id,reservation_id) references public.inventory_reservations(workspace_id,id),
  foreign key(workspace_id,inventory_lot_id) references public.inventory_lots(workspace_id,id),
  foreign key(supersedes_weighing_id) references public.batch_material_weighings(id),
  check(
    (record_type='planned' and planned_quantity is not null and actual_quantity is null)
    or (record_type in('actual','correction') and actual_quantity is not null)
  )
);

create table public.batch_material_consumptions(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null,
  batch_kind text not null check(batch_kind in('lab','production')),
  batch_id text not null,
  formula_id_snapshot text not null,
  formula_version_id_snapshot text not null,
  requirement_id text not null,
  formula_line_id_snapshot text not null,
  ingredient_id_snapshot text not null,
  ingredient_name_snapshot text not null,
  allocation_id uuid not null,
  reservation_id uuid not null,
  inventory_lot_id text not null,
  weighing_id uuid not null,
  consumed_quantity numeric not null check(consumed_quantity>0),
  unit text not null check(unit in('mg','g','kg','ml','L','pcs')),
  normalized_quantity numeric not null check(normalized_quantity>0),
  movement_id text not null,
  unit_cost_snapshot numeric,
  total_cost_snapshot numeric,
  cost_currency_snapshot text,
  cost_confidence text not null check(cost_confidence in('final','provisional','unknown')),
  cost_state text not null check(cost_state in('final','provisional','unresolved')),
  quality_release_review_id uuid,
  landed_cost_source jsonb not null default '{}' check(jsonb_typeof(landed_cost_source)='object'),
  actor_id uuid not null,
  consumed_at timestamptz not null default now(),
  reason text not null,
  revision bigint not null default 1 check(revision>0),
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  unique(workspace_id,id),
  unique(workspace_id,movement_id),
  unique(workspace_id,idempotency_key),
  foreign key(workspace_id,allocation_id) references public.batch_material_lot_allocations(workspace_id,id),
  foreign key(workspace_id,reservation_id) references public.inventory_reservations(workspace_id,id),
  foreign key(workspace_id,inventory_lot_id) references public.inventory_lots(workspace_id,id),
  foreign key(workspace_id,movement_id) references public.inventory_movements(workspace_id,id),
  foreign key(weighing_id) references public.batch_material_weighings(id)
);

create table public.batch_material_waste(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null,
  batch_kind text not null check(batch_kind in('lab','production')),
  batch_id text not null,
  requirement_id text not null,
  reservation_id uuid not null,
  inventory_lot_id text not null,
  weighing_id uuid not null,
  quantity numeric not null check(quantity>0),
  unit text not null check(unit in('mg','g','kg','ml','L','pcs')),
  normalized_quantity numeric not null check(normalized_quantity>0),
  waste_category text not null check(waste_category in('weighing_loss','transfer_loss','container_residue','spill','contamination','rejected_staged_material','process_loss','other')),
  reason text not null,
  evidence_reference text,
  movement_id text not null,
  unit_cost_snapshot numeric,
  total_cost_snapshot numeric,
  cost_currency_snapshot text,
  actor_id uuid not null,
  recorded_at timestamptz not null default now(),
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  unique(workspace_id,id),
  unique(workspace_id,movement_id),
  unique(workspace_id,idempotency_key),
  foreign key(workspace_id,reservation_id) references public.inventory_reservations(workspace_id,id),
  foreign key(workspace_id,inventory_lot_id) references public.inventory_lots(workspace_id,id),
  foreign key(workspace_id,movement_id) references public.inventory_movements(workspace_id,id),
  foreign key(weighing_id) references public.batch_material_weighings(id)
);

create table public.batch_material_returns(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null,
  batch_kind text not null check(batch_kind in('lab','production')),
  batch_id text not null,
  requirement_id text not null,
  reservation_id uuid not null,
  inventory_lot_id text not null,
  weighing_id uuid not null,
  original_consumption_id uuid,
  quantity numeric not null check(quantity>0),
  unit text not null check(unit in('mg','g','kg','ml','L','pcs')),
  normalized_quantity numeric not null check(normalized_quantity>0),
  return_kind text not null check(return_kind in('staged_unconsumed','physical_return_after_consumption')),
  condition_assessment text not null,
  reason text not null,
  evidence_reference text,
  movement_id text,
  actor_id uuid not null,
  returned_at timestamptz not null default now(),
  policy_version text not null default '1.0.0',
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  unique(workspace_id,id),
  unique(workspace_id,idempotency_key),
  foreign key(workspace_id,reservation_id) references public.inventory_reservations(workspace_id,id),
  foreign key(workspace_id,inventory_lot_id) references public.inventory_lots(workspace_id,id),
  foreign key(workspace_id,movement_id) references public.inventory_movements(workspace_id,id),
  foreign key(weighing_id) references public.batch_material_weighings(id),
  foreign key(original_consumption_id) references public.batch_material_consumptions(id),
  check(
    (return_kind='staged_unconsumed' and movement_id is null and original_consumption_id is null)
    or (return_kind='physical_return_after_consumption' and movement_id is not null and original_consumption_id is not null)
  )
);

create table public.batch_material_variances(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null,
  batch_kind text not null check(batch_kind in('lab','production')),
  batch_id text not null,
  requirement_id text not null,
  quantity numeric not null check(quantity<>0),
  unit text not null check(unit in('mg','g','kg','ml','L','pcs')),
  reason text not null check(length(trim(reason))>0),
  evidence_reference text,
  actor_id uuid not null,
  approval_state text not null check(approval_state in('documented','approved','rejected')),
  approved_by uuid,
  approved_at timestamptz,
  policy_version text not null default '1.0.0',
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  recorded_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,idempotency_key),
  check((approval_state='approved' and approved_by is not null and approved_at is not null) or approval_state<>'approved')
);

create table public.batch_material_reconciliations(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null,
  batch_kind text not null check(batch_kind in('lab','production')),
  batch_id text not null,
  requirement_id text not null,
  target_quantity numeric not null,
  unit text not null,
  reserved_quantity numeric not null,
  actual_weighed_quantity numeric not null,
  productive_consumption numeric not null,
  waste_quantity numeric not null,
  returned_quantity numeric not null,
  released_quantity numeric not null,
  remaining_reservation numeric not null,
  unexplained_variance numeric not null,
  tolerance_quantity numeric not null,
  state text not null check(state in('open','reconciled','variance_requires_review','blocked')),
  variance_id uuid,
  policy_version text not null default '1.0.0',
  reconciled_by uuid not null,
  reconciled_at timestamptz not null default now(),
  revision bigint not null default 1,
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  unique(workspace_id,id),
  unique(workspace_id,batch_kind,batch_id,requirement_id),
  unique(workspace_id,idempotency_key),
  foreign key(variance_id) references public.batch_material_variances(id)
);

create index batch_material_weighings_requirement on public.batch_material_weighings(workspace_id,batch_kind,batch_id,requirement_id,recorded_at);
create index batch_material_weighings_superseded on public.batch_material_weighings(supersedes_weighing_id) where supersedes_weighing_id is not null;
create index batch_material_consumptions_batch on public.batch_material_consumptions(workspace_id,batch_kind,batch_id,requirement_id,consumed_at);
create index batch_material_consumptions_reservation on public.batch_material_consumptions(workspace_id,reservation_id);
create index batch_material_waste_batch on public.batch_material_waste(workspace_id,batch_kind,batch_id,requirement_id);
create index batch_material_returns_batch on public.batch_material_returns(workspace_id,batch_kind,batch_id,requirement_id);
create index batch_material_returns_consumption on public.batch_material_returns(workspace_id,original_consumption_id) where original_consumption_id is not null;
create index batch_material_variances_batch on public.batch_material_variances(workspace_id,batch_kind,batch_id,requirement_id);
create index batch_material_reconciliations_batch on public.batch_material_reconciliations(workspace_id,batch_kind,batch_id,state);

do $$ declare table_name text;begin
  foreach table_name in array array[
    'batch_material_weighings','batch_material_consumptions','batch_material_waste',
    'batch_material_returns','batch_material_variances','batch_material_reconciliations'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('create policy owner_select on public.%I for select to authenticated using(owner_id=(select auth.uid()))',table_name);
    execute format('revoke all on public.%I from public,anon,authenticated',table_name);
    execute format('grant select on public.%I to authenticated',table_name);
    execute format('grant all on public.%I to service_role',table_name);
  end loop;
end $$;

create function public.record_batch_material_weighing(
  target_reservation_id uuid,expected_reservation_revision bigint,record_type text,
  weighing_quantity numeric,weighing_unit text,equipment_reference text,
  evidence_reference text,operator_note text,candidate_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();wid uuid;r public.inventory_reservations;lot public.inventory_lots;
  normalized numeric;fingerprint text;existing public.batch_material_weighings;weighing_id uuid;target_quantity numeric;formula_version text;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED';end if;
  if record_type not in('planned','actual') or weighing_quantity<=0 then raise exception 'WEIGHING_INVALID';end if;
  select w.id into wid from public.workspaces w where w.owner_id=uid and w.lifecycle_state='active';
  fingerprint:=md5(concat_ws('|',target_reservation_id,expected_reservation_revision,record_type,weighing_quantity,weighing_unit,equipment_reference,evidence_reference,operator_note));
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
  if record_type='actual' and public.kf_convert_quantity(weighing_quantity,weighing_unit,r.unit)>r.remaining_quantity then
    raise exception 'WEIGHING_EXCEEDS_RESERVATION';
  end if;
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
    record_type,planned_quantity,actual_quantity,unit,normalized_quantity,equipment_reference,evidence_reference,
    operator_note,deviation_from_target,actor_id,idempotency_key,payload_fingerprint
  ) values(
    weighing_id,wid,uid,r.batch_kind,r.batch_id,r.requirement_id,r.allocation_id,r.id,r.inventory_lot_id,
    record_type,case when record_type='planned' then weighing_quantity end,case when record_type='actual' then weighing_quantity end,
    weighing_unit,normalized,equipment_reference,evidence_reference,operator_note,
    case when record_type='actual' then public.kf_convert_quantity(weighing_quantity,weighing_unit,r.unit)-target_quantity end,
    uid,candidate_idempotency_key,fingerprint
  );
  insert into public.batch_material_events(workspace_id,owner_id,batch_kind,batch_id,formula_version_id,requirement_id,inventory_lot_id,reservation_id,allocation_id,weighing_id,event_type,quantity,unit,actor_id,event_key,metadata)
  values(wid,uid,r.batch_kind,r.batch_id,formula_version,r.requirement_id,r.inventory_lot_id,r.id,r.allocation_id,weighing_id,'batch_material_weighing_recorded',weighing_quantity,weighing_unit,uid,'weighing:'||weighing_id,jsonb_build_object('type',record_type,'equipmentReference',equipment_reference,'evidenceReference',evidence_reference));
  return jsonb_build_object('weighingId',weighing_id,'retry',false);
end $$;

create function public.consume_reserved_batch_material(
  target_reservation_id uuid,expected_reservation_revision bigint,target_weighing_id uuid,
  productive_quantity numeric,waste_quantity numeric,consumption_unit text,
  waste_category text,reason text,evidence_reference text,candidate_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=auth.uid();wid uuid;r public.inventory_reservations;a public.batch_material_lot_allocations;
  lot public.inventory_lots;w public.batch_material_weighings;normalized_total numeric;requested_total numeric;
  productive_normalized numeric;waste_normalized numeric;available numeric;fingerprint text;
  existing public.batch_material_consumptions;consumption_id uuid;waste_id uuid;
  consumption_movement_id text;waste_movement_id text;unit_cost numeric;formula_id text;formula_version text;
  formula_line text;ingredient text;ingredient_name text;new_status text;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED';end if;
  if productive_quantity<0 or waste_quantity<0 or productive_quantity+waste_quantity<=0 then raise exception 'CONSUMPTION_QUANTITY_INVALID';end if;
  if waste_quantity>0 and waste_category not in('weighing_loss','transfer_loss','container_residue','spill','contamination','rejected_staged_material','process_loss','other') then raise exception 'WASTE_CATEGORY_INVALID';end if;
  select workspace.id into wid from public.workspaces workspace where workspace.owner_id=uid and workspace.lifecycle_state='active';
  fingerprint:=md5(concat_ws('|',target_reservation_id,expected_reservation_revision,target_weighing_id,productive_quantity,waste_quantity,consumption_unit,waste_category,reason,evidence_reference));
  select * into existing from public.batch_material_consumptions where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then
    return jsonb_build_object('consumptionId',existing.id,'movementId',existing.movement_id,
      'reservationId',existing.reservation_id,'retry',true);
  end if;
  if exists(select 1 from public.batch_material_waste where workspace_id=wid and idempotency_key=candidate_idempotency_key)
    then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  select * into r from public.inventory_reservations where workspace_id=wid and owner_id=uid and id=target_reservation_id for update;
  if not found then raise exception 'RESERVATION_UNAVAILABLE';end if;
  if r.revision<>expected_reservation_revision then raise exception 'STALE_RESERVATION_REVISION';end if;
  if r.status not in('active','partially_consumed') then raise exception 'RESERVATION_NOT_CONSUMABLE';end if;
  select * into a from public.batch_material_lot_allocations where workspace_id=wid and id=r.allocation_id for update;
  select * into lot from public.inventory_lots where workspace_id=wid and id=r.inventory_lot_id for update;
  select * into w from public.batch_material_weighings where workspace_id=wid and id=target_weighing_id
    and reservation_id=r.id and record_type in('actual','correction');
  if not found then raise exception 'ACTUAL_WEIGHING_REQUIRED';end if;
  if lot.status<>'Active' or lot.released_at is null or lot.recalled_at is not null or lot.blocked_at is not null
    or (nullif(lot.expiry_date,'') is not null and lot.expiry_date::date<current_date)
    or (lot.mandatory_retest_date is not null and lot.mandatory_retest_date<current_date)
    then raise exception 'LOT_NOT_ELIGIBLE';end if;
  requested_total:=productive_quantity+waste_quantity;
  if public.kf_convert_quantity(requested_total,consumption_unit,r.unit)>r.remaining_quantity then raise exception 'CONSUMPTION_EXCEEDS_RESERVATION';end if;
  if public.kf_convert_quantity(requested_total,consumption_unit,w.unit)>coalesce(w.actual_quantity,0) then raise exception 'CONSUMPTION_EXCEEDS_WEIGHING';end if;
  normalized_total:=public.kf_convert_quantity(requested_total,consumption_unit,lot.unit);
  productive_normalized:=public.kf_convert_quantity(productive_quantity,consumption_unit,lot.unit);
  waste_normalized:=public.kf_convert_quantity(waste_quantity,consumption_unit,lot.unit);
  if normalized_total is null or normalized_total<=0 then raise exception 'CONSUMPTION_UNIT_INCOMPATIBLE';end if;
  available:=public.kf_inventory_balance(wid,lot.id);
  if normalized_total>available then raise exception 'INSUFFICIENT_INVENTORY_BALANCE';end if;
  if r.batch_kind='lab' then
    select batch.formula_id,batch.formula_version_id,line.formula_line_id,line.ingredient_id,line.ingredient_name_snapshot
      into formula_id,formula_version,formula_line,ingredient,ingredient_name
    from public.lab_batches batch join public.lab_batch_lines line on line.workspace_id=batch.workspace_id and line.lab_batch_id=batch.id
    where batch.workspace_id=wid and batch.id=r.batch_id and line.id=r.requirement_id and batch.status='In Progress' for update of batch;
  else
    select run.formula_id,run.formula_version_id,line.formula_line_id,line.ingredient_id,line.ingredient_name_snapshot
      into formula_id,formula_version,formula_line,ingredient,ingredient_name
    from public.production_runs run join public.production_run_lines line on line.workspace_id=run.workspace_id and line.production_run_id=run.id
    where run.workspace_id=wid and run.id=r.batch_id and line.id=r.requirement_id and run.status='In Progress' for update of run;
  end if;
  if formula_version is null then raise exception 'BATCH_NOT_CONSUMABLE';end if;
  unit_cost:=case when lot.total_acquisition_cost is not null and lot.opening_quantity>0
    then (lot.total_acquisition_cost/lot.opening_quantity)*public.kf_convert_quantity(1,consumption_unit,lot.unit) end;
  consumption_id:=gen_random_uuid();consumption_movement_id:='bmc-'||consumption_id::text;
  if productive_quantity>0 then
    insert into public.inventory_movements(workspace_id,owner_id,id,inventory_lot_id,type,quantity,unit,reason,reference_type,reference_id,notes,occurred_at,created_at)
    values(wid,uid,consumption_movement_id,lot.id,'Consumption',productive_quantity,consumption_unit,reason,
      case when r.batch_kind='lab' then 'LabBatch' else 'ProductionRun' end,r.batch_id,
      'Reservation '||r.id::text,now()::text,now()::text);
    insert into public.batch_material_consumptions(
      id,workspace_id,owner_id,batch_kind,batch_id,formula_id_snapshot,formula_version_id_snapshot,
      requirement_id,formula_line_id_snapshot,ingredient_id_snapshot,ingredient_name_snapshot,
      allocation_id,reservation_id,inventory_lot_id,weighing_id,consumed_quantity,unit,normalized_quantity,
      movement_id,unit_cost_snapshot,total_cost_snapshot,cost_currency_snapshot,cost_confidence,cost_state,
      quality_release_review_id,landed_cost_source,actor_id,reason,idempotency_key,payload_fingerprint
    ) values(
      consumption_id,wid,uid,r.batch_kind,r.batch_id,formula_id,formula_version,r.requirement_id,
      formula_line,ingredient,ingredient_name,r.allocation_id,r.id,lot.id,w.id,productive_quantity,
      consumption_unit,productive_normalized,consumption_movement_id,unit_cost,
      case when unit_cost is null then null else productive_quantity*unit_cost end,lot.acquisition_cost_currency,
      a.cost_confidence,case when unit_cost is null then 'unresolved' when a.cost_confidence='final' then 'final' else 'provisional' end,
      lot.quality_release_review_id,jsonb_build_object('lotCostNotes',lot.cost_notes),uid,reason,candidate_idempotency_key,fingerprint
    );
  end if;
  if waste_quantity>0 then
    waste_id:=gen_random_uuid();waste_movement_id:='bmw-'||waste_id::text;
    insert into public.inventory_movements(workspace_id,owner_id,id,inventory_lot_id,type,quantity,unit,reason,reference_type,reference_id,notes,occurred_at,created_at)
    values(wid,uid,waste_movement_id,lot.id,'Waste',waste_quantity,consumption_unit,reason,
      case when r.batch_kind='lab' then 'LabBatch' else 'ProductionRun' end,r.batch_id,
      'Reservation '||r.id::text,now()::text,now()::text);
    insert into public.batch_material_waste(
      id,workspace_id,owner_id,batch_kind,batch_id,requirement_id,reservation_id,inventory_lot_id,weighing_id,
      quantity,unit,normalized_quantity,waste_category,reason,evidence_reference,movement_id,
      unit_cost_snapshot,total_cost_snapshot,cost_currency_snapshot,actor_id,idempotency_key,payload_fingerprint
    ) values(
      waste_id,wid,uid,r.batch_kind,r.batch_id,r.requirement_id,r.id,lot.id,w.id,waste_quantity,
      consumption_unit,waste_normalized,waste_category,reason,evidence_reference,waste_movement_id,
      unit_cost,case when unit_cost is null then null else waste_quantity*unit_cost end,lot.acquisition_cost_currency,
      uid,case when productive_quantity=0 then candidate_idempotency_key else gen_random_uuid() end,fingerprint
    );
  end if;
  new_status:=case when r.remaining_quantity-public.kf_convert_quantity(requested_total,consumption_unit,r.unit)=0 then 'consumed' else 'partially_consumed' end;
  update public.inventory_reservations set
    consumed_quantity=consumed_quantity+public.kf_convert_quantity(productive_quantity,consumption_unit,r.unit),
    wasted_quantity=wasted_quantity+public.kf_convert_quantity(waste_quantity,consumption_unit,r.unit),
    remaining_quantity=remaining_quantity-public.kf_convert_quantity(requested_total,consumption_unit,r.unit),
    status=new_status,revision=revision+1,updated_at=now()
  where workspace_id=wid and id=r.id returning * into r;
  update public.batch_material_lot_allocations set status=new_status,revision=revision+1,updated_at=now()
    where workspace_id=wid and id=a.id;
  if productive_quantity>0 then
    insert into public.batch_material_events(workspace_id,owner_id,batch_kind,batch_id,formula_version_id,requirement_id,inventory_lot_id,reservation_id,allocation_id,weighing_id,consumption_id,movement_id,event_type,quantity,unit,actor_id,event_key,metadata)
    values(wid,uid,r.batch_kind,r.batch_id,formula_version,r.requirement_id,lot.id,r.id,a.id,w.id,consumption_id,consumption_movement_id,'batch_material_consumed',productive_quantity,consumption_unit,uid,'consumption:'||consumption_id,jsonb_build_object('cost',case when unit_cost is null then null else productive_quantity*unit_cost end,'costConfidence',a.cost_confidence));
  end if;
  if waste_quantity>0 then
    insert into public.batch_material_events(workspace_id,owner_id,batch_kind,batch_id,formula_version_id,requirement_id,inventory_lot_id,reservation_id,allocation_id,weighing_id,movement_id,event_type,quantity,unit,actor_id,event_key,metadata)
    values(wid,uid,r.batch_kind,r.batch_id,formula_version,r.requirement_id,lot.id,r.id,a.id,w.id,waste_movement_id,'batch_material_waste_recorded',waste_quantity,consumption_unit,uid,'waste:'||waste_id,jsonb_build_object('category',waste_category,'evidenceReference',evidence_reference));
  end if;
  return jsonb_build_object('consumptionId',case when productive_quantity>0 then consumption_id end,'movementId',case when productive_quantity>0 then consumption_movement_id end,
    'wasteId',waste_id,'wasteMovementId',waste_movement_id,'reservationId',r.id,'reservationRevision',r.revision,
    'remainingReservation',r.remaining_quantity,'remainingLotBalance',public.kf_inventory_balance(wid,lot.id),'retry',false);
end $$;

create function public.record_batch_material_return(
  target_reservation_id uuid,expected_reservation_revision bigint,target_weighing_id uuid,
  original_consumption_id uuid,return_quantity numeric,return_unit text,return_kind text,
  condition_assessment text,reason text,evidence_reference text,candidate_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=auth.uid();wid uuid;r public.inventory_reservations;a public.batch_material_lot_allocations;
  lot public.inventory_lots;w public.batch_material_weighings;c public.batch_material_consumptions;
  existing public.batch_material_returns;fingerprint text;normalized_reservation numeric;normalized_lot numeric;
  previously_returned numeric;return_id uuid;return_movement_id text;formula_version text;new_remaining numeric;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED';end if;
  if return_kind not in('staged_unconsumed','physical_return_after_consumption') or return_quantity<=0
    or nullif(trim(condition_assessment),'') is null or nullif(trim(reason),'') is null
    or nullif(trim(evidence_reference),'') is null
  then raise exception 'RETURN_REQUIRED_VALUES_MISSING';end if;
  select workspace.id into wid from public.workspaces workspace where workspace.owner_id=uid and workspace.lifecycle_state='active';
  fingerprint:=md5(concat_ws('|',target_reservation_id,expected_reservation_revision,target_weighing_id,
    original_consumption_id,return_quantity,return_unit,return_kind,condition_assessment,reason,evidence_reference));
  select * into existing from public.batch_material_returns where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then
    if existing.payload_fingerprint<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT';end if;
    return jsonb_build_object('returnId',existing.id,'movementId',existing.movement_id,'retry',true);
  end if;
  select * into r from public.inventory_reservations where workspace_id=wid and owner_id=uid and id=target_reservation_id for update;
  if not found then raise exception 'RESERVATION_UNAVAILABLE';end if;
  if r.revision<>expected_reservation_revision then raise exception 'STALE_RESERVATION_REVISION';end if;
  select * into a from public.batch_material_lot_allocations where workspace_id=wid and id=r.allocation_id for update;
  select * into lot from public.inventory_lots where workspace_id=wid and id=r.inventory_lot_id for update;
  select * into w from public.batch_material_weighings where workspace_id=wid and id=target_weighing_id
    and reservation_id=r.id and record_type in('actual','correction');
  if not found then raise exception 'ACTUAL_WEIGHING_REQUIRED';end if;
  normalized_reservation:=public.kf_convert_quantity(return_quantity,return_unit,r.unit);
  normalized_lot:=public.kf_convert_quantity(return_quantity,return_unit,lot.unit);
  if normalized_reservation is null or normalized_lot is null then raise exception 'RETURN_UNIT_INCOMPATIBLE';end if;

  if return_kind='staged_unconsumed' then
    if original_consumption_id is not null then raise exception 'STAGED_RETURN_MUST_NOT_REFERENCE_CONSUMPTION';end if;
    if r.status not in('active','partially_consumed') or normalized_reservation>r.remaining_quantity then
      raise exception 'STAGED_RETURN_EXCEEDS_RESERVATION';
    end if;
    new_remaining:=r.remaining_quantity-normalized_reservation;
  else
    if original_consumption_id is null then raise exception 'PHYSICAL_RETURN_REQUIRES_CONSUMPTION';end if;
    select * into c from public.batch_material_consumptions where workspace_id=wid and id=original_consumption_id
      and reservation_id=r.id and weighing_id=w.id for update;
    if not found then raise exception 'ORIGINAL_CONSUMPTION_UNAVAILABLE';end if;
    select coalesce(sum(public.kf_convert_quantity(ret.quantity,ret.unit,c.unit)),0) into previously_returned
    from public.batch_material_returns ret
    where ret.workspace_id=wid and ret.original_consumption_id=c.id and ret.return_kind='physical_return_after_consumption';
    if public.kf_convert_quantity(return_quantity,return_unit,c.unit)+previously_returned>c.consumed_quantity then
      raise exception 'PHYSICAL_RETURN_EXCEEDS_CONSUMPTION';
    end if;
    if lot.status<>'Active' or lot.released_at is null or lot.recalled_at is not null or lot.blocked_at is not null
      or (nullif(lot.expiry_date,'') is not null and lot.expiry_date::date<current_date)
      or (lot.mandatory_retest_date is not null and lot.mandatory_retest_date<current_date)
    then raise exception 'RETURN_DESTINATION_LOT_NOT_ELIGIBLE';end if;
    return_movement_id:='bmr-'||gen_random_uuid()::text;
    insert into public.inventory_movements(workspace_id,owner_id,id,inventory_lot_id,type,quantity,unit,reason,reference_type,reference_id,notes,occurred_at,created_at)
    values(wid,uid,return_movement_id,lot.id,'Adjustment',return_quantity,return_unit,reason,
      case when r.batch_kind='lab' then 'LabBatch' else 'ProductionRun' end,r.batch_id,
      'Controlled physical return from consumption '||c.id::text||'; condition: '||condition_assessment,now()::text,now()::text);
    new_remaining:=r.remaining_quantity;
  end if;

  return_id:=gen_random_uuid();
  insert into public.batch_material_returns(
    id,workspace_id,owner_id,batch_kind,batch_id,requirement_id,reservation_id,inventory_lot_id,weighing_id,
    original_consumption_id,quantity,unit,normalized_quantity,return_kind,condition_assessment,reason,
    evidence_reference,movement_id,actor_id,idempotency_key,payload_fingerprint
  ) values(
    return_id,wid,uid,r.batch_kind,r.batch_id,r.requirement_id,r.id,lot.id,w.id,
    original_consumption_id,return_quantity,return_unit,normalized_lot,return_kind,condition_assessment,reason,
    evidence_reference,return_movement_id,uid,candidate_idempotency_key,fingerprint
  );
  if return_kind='staged_unconsumed' then
    update public.inventory_reservations set
      released_quantity=released_quantity+normalized_reservation,remaining_quantity=new_remaining,
      released_by=case when new_remaining=0 then uid else released_by end,
      released_at=case when new_remaining=0 then now() else released_at end,
      status=case when new_remaining=0 then 'released' when consumed_quantity+wasted_quantity>0 then 'partially_consumed' else 'active' end,
      revision=revision+1,updated_at=now()
    where workspace_id=wid and id=r.id returning * into r;
    update public.batch_material_lot_allocations set
      status=case when new_remaining=0 then 'released' when r.consumed_quantity+r.wasted_quantity>0 then 'partially_consumed' else 'reserved' end,
      revision=revision+1,updated_at=now()
    where workspace_id=wid and id=a.id;
  end if;
  if r.batch_kind='lab' then select formula_version_id into formula_version from public.lab_batches where workspace_id=wid and id=r.batch_id;
  else select formula_version_id into formula_version from public.production_runs where workspace_id=wid and id=r.batch_id;end if;
  insert into public.batch_material_events(workspace_id,owner_id,batch_kind,batch_id,formula_version_id,requirement_id,inventory_lot_id,reservation_id,allocation_id,weighing_id,consumption_id,movement_id,event_type,quantity,unit,actor_id,event_key,metadata)
  values(wid,uid,r.batch_kind,r.batch_id,formula_version,r.requirement_id,lot.id,r.id,a.id,w.id,original_consumption_id,return_movement_id,
    'batch_material_returned',return_quantity,return_unit,uid,'return:'||return_id,
    jsonb_build_object('returnKind',return_kind,'conditionAssessment',condition_assessment,'evidenceReference',evidence_reference));
  return jsonb_build_object('returnId',return_id,'movementId',return_movement_id,'reservationId',r.id,
    'reservationRevision',r.revision,'remainingReservation',new_remaining,'remainingLotBalance',public.kf_inventory_balance(wid,lot.id),'retry',false);
end $$;

create function public.reconcile_batch_material_requirement(
  target_batch_kind text,target_batch_id text,target_requirement_id text,
  variance_reason text,variance_evidence text,variance_approval_state text,
  candidate_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=auth.uid();wid uuid;target numeric;target_unit text;tolerance numeric;formula_version text;
  reserved numeric;weighed numeric;productive numeric;waste numeric;returned numeric;released numeric;remaining numeric;
  unexplained numeric;state text;variance_id uuid;fingerprint text;existing public.batch_material_reconciliations;reconciliation_id uuid;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED';end if;
  select w.id into wid from public.workspaces w where w.owner_id=uid and w.lifecycle_state='active';
  fingerprint:=md5(concat_ws('|',target_batch_kind,target_batch_id,target_requirement_id,variance_reason,variance_evidence,variance_approval_state));
  select * into existing from public.batch_material_reconciliations where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then
    if existing.payload_fingerprint<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT';end if;
    return jsonb_build_object('reconciliationId',existing.id,'state',existing.state,'unexplainedVariance',existing.unexplained_variance,'retry',true);
  end if;
  if target_batch_kind='lab' then
    select line.planned_quantity,line.unit,line.tolerance_quantity,batch.formula_version_id into target,target_unit,tolerance,formula_version
    from public.lab_batch_lines line join public.lab_batches batch on batch.workspace_id=line.workspace_id and batch.id=line.lab_batch_id
    where line.workspace_id=wid and line.id=target_requirement_id and batch.id=target_batch_id and batch.owner_id=uid for update of batch,line;
  elsif target_batch_kind='production' then
    select line.planned_quantity,line.unit,line.tolerance_quantity,run.formula_version_id into target,target_unit,tolerance,formula_version
    from public.production_run_lines line join public.production_runs run on run.workspace_id=line.workspace_id and run.id=line.production_run_id
    where line.workspace_id=wid and line.id=target_requirement_id and run.id=target_batch_id and run.owner_id=uid for update of run,line;
  else raise exception 'BATCH_KIND_INVALID';end if;
  if target is null then raise exception 'REQUIREMENT_UNAVAILABLE';end if;
  select
    coalesce(sum(r.reserved_quantity),0),coalesce(sum(r.released_quantity),0),coalesce(sum(r.remaining_quantity),0)
    into reserved,released,remaining
  from public.inventory_reservations r where r.workspace_id=wid and r.batch_kind=target_batch_kind and r.batch_id=target_batch_id and r.requirement_id=target_requirement_id;
  select coalesce(sum(public.kf_convert_quantity(w.actual_quantity,w.unit,target_unit)),0) into weighed
    from public.batch_material_weighings w where w.workspace_id=wid and w.batch_kind=target_batch_kind and w.batch_id=target_batch_id and w.requirement_id=target_requirement_id and w.record_type in('actual','correction')
      and not exists(select 1 from public.batch_material_weighings newer where newer.supersedes_weighing_id=w.id);
  select coalesce(sum(public.kf_convert_quantity(c.consumed_quantity,c.unit,target_unit)),0) into productive
    from public.batch_material_consumptions c where c.workspace_id=wid and c.batch_kind=target_batch_kind and c.batch_id=target_batch_id and c.requirement_id=target_requirement_id;
  select coalesce(sum(public.kf_convert_quantity(x.quantity,x.unit,target_unit)),0) into waste
    from public.batch_material_waste x where x.workspace_id=wid and x.batch_kind=target_batch_kind and x.batch_id=target_batch_id and x.requirement_id=target_requirement_id;
  select coalesce(sum(public.kf_convert_quantity(x.quantity,x.unit,target_unit)),0) into returned
    from public.batch_material_returns x where x.workspace_id=wid and x.batch_kind=target_batch_kind and x.batch_id=target_batch_id and x.requirement_id=target_requirement_id;
  select weighed-productive-waste-coalesce(sum(public.kf_convert_quantity(x.quantity,x.unit,target_unit)),0) into unexplained
    from public.batch_material_returns x
    where x.workspace_id=wid and x.batch_kind=target_batch_kind and x.batch_id=target_batch_id
      and x.requirement_id=target_requirement_id and x.return_kind='staged_unconsumed';
  if abs(unexplained)>tolerance then
    if length(trim(coalesce(variance_reason,'')))=0 then state:='variance_requires_review';
    else
      variance_id:=gen_random_uuid();
      insert into public.batch_material_variances(id,workspace_id,owner_id,batch_kind,batch_id,requirement_id,quantity,unit,reason,evidence_reference,actor_id,approval_state,approved_by,approved_at,idempotency_key,payload_fingerprint)
      values(variance_id,wid,uid,target_batch_kind,target_batch_id,target_requirement_id,unexplained,target_unit,variance_reason,variance_evidence,uid,
        variance_approval_state,case when variance_approval_state='approved' then uid end,case when variance_approval_state='approved' then now() end,
        candidate_idempotency_key,fingerprint);
      state:=case when variance_approval_state='approved' then 'reconciled' else 'variance_requires_review' end;
    end if;
  else state:='reconciled';end if;
  reconciliation_id:=gen_random_uuid();
  insert into public.batch_material_reconciliations(
    id,workspace_id,owner_id,batch_kind,batch_id,requirement_id,target_quantity,unit,reserved_quantity,
    actual_weighed_quantity,productive_consumption,waste_quantity,returned_quantity,released_quantity,
    remaining_reservation,unexplained_variance,tolerance_quantity,state,variance_id,reconciled_by,
    idempotency_key,payload_fingerprint
  ) values(
    reconciliation_id,wid,uid,target_batch_kind,target_batch_id,target_requirement_id,target,target_unit,reserved,
    weighed,productive,waste,returned,released,remaining,unexplained,tolerance,state,variance_id,uid,
    candidate_idempotency_key,fingerprint
  ) on conflict(workspace_id,batch_kind,batch_id,requirement_id) do update set
    reserved_quantity=excluded.reserved_quantity,actual_weighed_quantity=excluded.actual_weighed_quantity,
    productive_consumption=excluded.productive_consumption,waste_quantity=excluded.waste_quantity,
    returned_quantity=excluded.returned_quantity,released_quantity=excluded.released_quantity,
    remaining_reservation=excluded.remaining_reservation,unexplained_variance=excluded.unexplained_variance,
    state=excluded.state,variance_id=excluded.variance_id,reconciled_by=uid,reconciled_at=now(),
    revision=public.batch_material_reconciliations.revision+1,idempotency_key=excluded.idempotency_key,
    payload_fingerprint=excluded.payload_fingerprint
  returning id into reconciliation_id;
  insert into public.batch_material_events(workspace_id,owner_id,batch_kind,batch_id,formula_version_id,requirement_id,event_type,quantity,unit,actor_id,event_key,metadata)
  values(wid,uid,target_batch_kind,target_batch_id,formula_version,target_requirement_id,
    case when variance_id is null then 'batch_material_reconciled' else 'batch_material_variance_recorded' end,
    unexplained,target_unit,uid,'reconciliation:'||candidate_idempotency_key,jsonb_build_object('state',state,'tolerance',tolerance,'varianceId',variance_id));
  return jsonb_build_object('reconciliationId',reconciliation_id,'state',state,'unexplainedVariance',unexplained,'varianceId',variance_id,'retry',false);
end $$;

create function public.enforce_batch_inventory_completion()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare kind text;line_count integer;reconciled_count integer;active_count integer;
begin
  kind:=case tg_table_name when 'lab_batches' then 'lab' else 'production' end;
  if new.status='Completed' and old.status is distinct from 'Completed' then
    if (kind='lab' and new.actual_yield is null) or (kind='production' and new.actual_yield is null) then raise exception 'ACTUAL_YIELD_REQUIRED';end if;
    if kind='lab' then select count(*) into line_count from public.lab_batch_lines where workspace_id=new.workspace_id and lab_batch_id=new.id;
    else select count(*) into line_count from public.production_run_lines where workspace_id=new.workspace_id and production_run_id=new.id;end if;
    select count(*) into reconciled_count from public.batch_material_reconciliations
      where workspace_id=new.workspace_id and batch_kind=kind and batch_id=new.id and state='reconciled' and remaining_reservation=0;
    select count(*) into active_count from public.inventory_reservations
      where workspace_id=new.workspace_id and batch_kind=kind and batch_id=new.id and status in('active','partially_consumed','exception');
    if line_count=0 or reconciled_count<>line_count then raise exception 'MATERIAL_RECONCILIATION_REQUIRED';end if;
    if active_count>0 then raise exception 'ACTIVE_RESERVATIONS_REMAIN';end if;
  end if;
  if new.status='Aborted' and old.status is distinct from 'Aborted' then
    update public.inventory_reservations set
      released_quantity=released_quantity+remaining_quantity,remaining_quantity=0,status='cancelled',
      released_by=(select auth.uid()),released_at=now(),revision=revision+1,updated_at=now()
    where workspace_id=new.workspace_id and batch_kind=kind and batch_id=new.id
      and status in('active','partially_consumed','exception');
    update public.batch_material_lot_allocations set status='cancelled',revision=revision+1,updated_at=now()
    where workspace_id=new.workspace_id and batch_kind=kind
      and coalesce(lab_batch_id,production_run_id)=new.id and status in('allocated','reserved','partially_consumed');
  end if;
  return new;
end $$;
create trigger enforce_lab_inventory_completion before update of status on public.lab_batches
for each row execute function public.enforce_batch_inventory_completion();
create trigger enforce_production_inventory_completion before update of status on public.production_runs
for each row execute function public.enforce_batch_inventory_completion();

create function public.prevent_completed_batch_material_mutation()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'BATCH_MATERIAL_RECORD_APPEND_ONLY';end $$;
create trigger weighings_append_only before update or delete on public.batch_material_weighings for each row execute function public.prevent_completed_batch_material_mutation();
create trigger consumptions_append_only before update or delete on public.batch_material_consumptions for each row execute function public.prevent_completed_batch_material_mutation();
create trigger waste_append_only before update or delete on public.batch_material_waste for each row execute function public.prevent_completed_batch_material_mutation();
create trigger returns_append_only before update or delete on public.batch_material_returns for each row execute function public.prevent_completed_batch_material_mutation();
create trigger variances_append_only before update or delete on public.batch_material_variances for each row execute function public.prevent_completed_batch_material_mutation();

revoke all on function public.record_batch_material_weighing(uuid,bigint,text,numeric,text,text,text,text,uuid),
  public.consume_reserved_batch_material(uuid,bigint,uuid,numeric,numeric,text,text,text,text,uuid),
  public.record_batch_material_return(uuid,bigint,uuid,uuid,numeric,text,text,text,text,text,uuid),
  public.reconcile_batch_material_requirement(text,text,text,text,text,text,uuid)
from public,anon,authenticated;
grant execute on function public.record_batch_material_weighing(uuid,bigint,text,numeric,text,text,text,text,uuid),
  public.consume_reserved_batch_material(uuid,bigint,uuid,numeric,numeric,text,text,text,text,uuid),
  public.record_batch_material_return(uuid,bigint,uuid,uuid,numeric,text,text,text,text,text,uuid),
  public.reconcile_batch_material_requirement(text,text,text,text,text,text,uuid)
to authenticated,service_role;
