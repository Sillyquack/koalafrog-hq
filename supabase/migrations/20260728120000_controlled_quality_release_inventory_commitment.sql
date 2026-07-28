-- Controlled quality disposition is the sole bridge from receiving quarantine
-- into the existing raw-material and packaging inventory ledgers.

alter table public.inventory_quarantine_intakes
  add column released_quantity numeric not null default 0 check(released_quantity>=0),
  add column rejected_quantity numeric not null default 0 check(rejected_quantity>=0),
  add constraint quarantine_disposition_within_intake
    check(released_quantity+rejected_quantity<=quarantine_quantity);

alter table public.inventory_quarantine_intakes
  drop constraint inventory_quarantine_intakes_quarantine_status_check;
alter table public.inventory_quarantine_intakes
  add constraint inventory_quarantine_intakes_quarantine_status_check
    check(quarantine_status in(
      'pending_review','quarantined','held','rejected','release_ready',
      'partially_released','released','cancelled'
    ));

create table public.inventory_quality_release_reviews(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  quarantine_intake_id uuid not null,
  review_version integer not null check(review_version>0),
  decision text not null check(decision in('release','hold','reject')),
  disposition_quantity numeric not null check(disposition_quantity>0),
  unit text not null,
  policy_version text not null,
  checklist_snapshot jsonb not null check(jsonb_typeof(checklist_snapshot)='object'),
  evidence jsonb not null check(jsonb_typeof(evidence)='object'),
  decision_reason text not null check(length(trim(decision_reason))>0),
  internal_lot_number text,
  inventory_kind text check(inventory_kind in('raw_material','packaging')),
  inventory_lot_id text,
  opening_movement_id text,
  total_acquisition_cost numeric check(total_acquisition_cost>=0),
  acquisition_cost_currency text,
  acquisition_cost_source text not null default 'unknown'
    check(acquisition_cost_source in('unknown','purchase_order_line','supplier_invoice','manual_evidence')),
  acquisition_cost_evidence jsonb not null default '{}' check(jsonb_typeof(acquisition_cost_evidence)='object'),
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  reviewed_by uuid not null,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,quarantine_intake_id,review_version),
  unique(workspace_id,quarantine_intake_id,idempotency_key),
  foreign key(workspace_id,quarantine_intake_id)
    references public.inventory_quarantine_intakes(workspace_id,id),
  check(
    (decision='release' and inventory_kind is not null and inventory_lot_id is not null and opening_movement_id is not null and internal_lot_number is not null)
    or
    (decision in('hold','reject') and inventory_kind is null and inventory_lot_id is null and opening_movement_id is null and internal_lot_number is null)
  ),
  check(
    (total_acquisition_cost is null and acquisition_cost_currency is null and acquisition_cost_source='unknown')
    or
    (total_acquisition_cost is not null and nullif(trim(acquisition_cost_currency),'') is not null and acquisition_cost_source<>'unknown' and acquisition_cost_evidence<>'{}'::jsonb)
  )
);

create index inventory_quality_reviews_intake
  on public.inventory_quality_release_reviews(workspace_id,quarantine_intake_id,review_version desc);
create unique index inventory_quality_reviews_raw_lot
  on public.inventory_quality_release_reviews(workspace_id,inventory_lot_id)
  where inventory_kind='raw_material';
create unique index inventory_quality_reviews_packaging_lot
  on public.inventory_quality_release_reviews(workspace_id,inventory_lot_id)
  where inventory_kind='packaging';

alter table public.inventory_quality_release_reviews enable row level security;
create policy owner_select on public.inventory_quality_release_reviews
  for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.inventory_quality_release_reviews from public,anon,authenticated;
grant select on public.inventory_quality_release_reviews to authenticated;
grant all on public.inventory_quality_release_reviews to service_role;

create function public.prevent_quality_release_review_mutation()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if current_user in('postgres','service_role') then return old; end if;
  raise exception 'QUALITY_RELEASE_REVIEW_APPEND_ONLY';
end $$;
create trigger prevent_quality_release_review_mutation
  before update or delete on public.inventory_quality_release_reviews for each row
  execute function public.prevent_quality_release_review_mutation();

alter table public.inventory_lots
  add column quarantine_intake_id uuid,
  add column quality_release_review_id uuid,
  add constraint inventory_lots_quarantine_intake_fk foreign key(workspace_id,quarantine_intake_id)
    references public.inventory_quarantine_intakes(workspace_id,id),
  add constraint inventory_lots_quality_review_fk foreign key(quality_release_review_id)
    references public.inventory_quality_release_reviews(id);
alter table public.packaging_inventory_lots
  add column quarantine_intake_id uuid,
  add column quality_release_review_id uuid,
  add constraint packaging_lots_quarantine_intake_fk foreign key(workspace_id,quarantine_intake_id)
    references public.inventory_quarantine_intakes(workspace_id,id),
  add constraint packaging_lots_quality_review_fk foreign key(quality_release_review_id)
    references public.inventory_quality_release_reviews(id);

create function public.protect_quality_released_lot_provenance()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if old.quality_release_review_id is not null and (
    new.quarantine_intake_id is distinct from old.quarantine_intake_id or
    new.quality_release_review_id is distinct from old.quality_release_review_id or
    new.opening_quantity is distinct from old.opening_quantity or
    new.unit is distinct from old.unit or
    new.internal_lot_number is distinct from old.internal_lot_number or
    new.supplier_lot_number is distinct from old.supplier_lot_number or
    new.total_acquisition_cost is distinct from old.total_acquisition_cost or
    new.acquisition_cost_currency is distinct from old.acquisition_cost_currency or
    new.cost_notes is distinct from old.cost_notes
  ) then raise exception 'QUALITY_RELEASE_PROVENANCE_IMMUTABLE'; end if;
  return new;
end $$;
create trigger protect_quality_released_inventory_lot
  before update on public.inventory_lots for each row
  execute function public.protect_quality_released_lot_provenance();
create trigger protect_quality_released_packaging_lot
  before update on public.packaging_inventory_lots for each row
  execute function public.protect_quality_released_lot_provenance();

alter table public.purchase_order_audit_events
  drop constraint purchase_order_audit_events_event_type_check;
alter table public.purchase_order_audit_events
  add constraint purchase_order_audit_events_event_type_check check(event_type in(
    'draft_handoff_started','draft_created','draft_lines_created','draft_handoff_retried','draft_cancelled','placement_recorded','placement_retried',
    'supplier_confirmation_recorded','supplier_confirmation_decided','shipment_created','shipment_status_recorded',
    'physical_receipt_recorded','receipt_line_recorded','receipt_discrepancy_recorded','receipt_inspection_recorded','receiving_completed',
    'receipt_quarantine_created','receipt_cancelled','quality_review_recorded','inventory_release_committed'
  ));

create function public.review_quarantined_inventory(
  target_quarantine_intake_id uuid,
  expected_intake_revision bigint,
  candidate_idempotency_key uuid,
  review_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  uid uuid:=auth.uid();
  q public.inventory_quarantine_intakes;
  existing public.inventory_quality_release_reviews;
  r public.purchase_order_receipts;
  o public.purchase_orders;
  review_id uuid:=gen_random_uuid();
  review_no integer;
  decision_value text:=review_payload->>'decision';
  qty numeric:=coalesce((review_payload->>'quantity')::numeric,0);
  remaining numeric;
  fingerprint text:=encode(extensions.digest(jsonb_strip_nulls(review_payload)::text,'sha256'),'hex');
  lot_id text;
  movement_id text;
  lot_number text:=nullif(trim(review_payload->>'internalLotNumber'),'');
  lot_kind text;
  cost_value numeric:=nullif(review_payload->>'totalAcquisitionCost','')::numeric;
  cost_currency text:=nullif(trim(review_payload->>'acquisitionCostCurrency'),'');
  cost_source text:=coalesce(nullif(review_payload->>'acquisitionCostSource',''),'unknown');
  effective_date date:=coalesce(nullif(review_payload->>'releaseDate','')::date,current_date);
  next_status text;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if candidate_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;

  select * into q from public.inventory_quarantine_intakes
    where id=target_quarantine_intake_id and owner_id=uid for update;
  if q.id is null or not exists(
    select 1 from public.workspaces where id=q.workspace_id and owner_id=uid and lifecycle_state='active'
  ) then raise exception 'QUARANTINE_INTAKE_UNAVAILABLE'; end if;

  select * into existing from public.inventory_quality_release_reviews
    where workspace_id=q.workspace_id and quarantine_intake_id=q.id
      and idempotency_key=candidate_idempotency_key;
  if existing.id is not null then
    if existing.payload_fingerprint<>fingerprint then raise exception 'QUALITY_REVIEW_RETRY_CONFLICT'; end if;
    return jsonb_build_object(
      'reviewId',existing.id,'inventoryKind',existing.inventory_kind,
      'inventoryLotId',existing.inventory_lot_id,'openingMovementId',existing.opening_movement_id,
      'intakeRevision',q.revision
    );
  end if;

  if q.revision<>expected_intake_revision then raise exception 'STALE_QUARANTINE_INTAKE_REVISION'; end if;
  if q.quarantine_status in('cancelled','released','rejected') then raise exception 'QUARANTINE_INTAKE_FINALIZED'; end if;
  remaining:=q.quarantine_quantity-q.released_quantity-q.rejected_quantity;
  if decision_value not in('release','hold','reject') or qty<=0 or qty>remaining then
    raise exception 'QUALITY_DISPOSITION_QUANTITY_INVALID';
  end if;
  if coalesce(review_payload->>'policyVersion','')='' or
     jsonb_typeof(review_payload->'checklistSnapshot')<>'object' or
     jsonb_typeof(review_payload->'evidence')<>'object' or
     nullif(trim(review_payload->>'decisionReason'),'') is null then
    raise exception 'QUALITY_REVIEW_REQUIRED_VALUES_MISSING';
  end if;
  if decision_value='release' then
    if q.quarantine_status='held' and not coalesce((review_payload->>'acknowledgeHoldResolution')::boolean,false) then
      raise exception 'QUARANTINE_HOLD_RESOLUTION_REQUIRED';
    end if;
    if coalesce((q.documentation_snapshot->>'documentationComplete')::boolean,false) is not true then
      raise exception 'QUALITY_DOCUMENTATION_INCOMPLETE';
    end if;
    if exists(
      select 1 from public.purchase_order_receipt_inspections i
      where i.workspace_id=q.workspace_id and i.receipt_line_id=q.receipt_line_id
        and i.result in('pending','conditional_hold','failed')
        and not exists(
          select 1 from public.purchase_order_receipt_inspections newer
          where newer.workspace_id=i.workspace_id and newer.receipt_line_id=i.receipt_line_id
            and newer.inspection_type=i.inspection_type and newer.inspection_version>i.inspection_version
        )
    ) then raise exception 'QUALITY_INSPECTION_BLOCKS_RELEASE'; end if;
    if exists(
      select 1 from public.purchase_order_receipt_discrepancies d
      where d.workspace_id=q.workspace_id and d.receipt_line_id=q.receipt_line_id
        and d.resolution_status not in('resolved','closed') and d.severity in('major','critical')
    ) then raise exception 'QUALITY_DISCREPANCY_BLOCKS_RELEASE'; end if;
    if q.expiry_or_retest_date is not null and q.expiry_or_retest_date<effective_date then
      raise exception 'QUALITY_EXPIRY_BLOCKS_RELEASE';
    end if;
    if lot_number is null or nullif(trim(review_payload->>'inventoryLocation'),'') is null then
      raise exception 'RELEASE_LOT_REQUIRED_VALUES_MISSING';
    end if;
    if cost_value is not null and (cost_value<0 or cost_currency is null or cost_source='unknown' or coalesce(review_payload->'acquisitionCostEvidence','{}')='{}'::jsonb) then
      raise exception 'ACQUISITION_COST_PROVENANCE_REQUIRED';
    end if;
    if cost_value is null and (cost_currency is not null or cost_source<>'unknown') then
      raise exception 'UNKNOWN_ACQUISITION_COST_MUST_REMAIN_NULL';
    end if;
  end if;

  review_no:=coalesce((select max(review_version)+1 from public.inventory_quality_release_reviews
    where workspace_id=q.workspace_id and quarantine_intake_id=q.id),1);
  lot_kind:=case when decision_value='release' and q.canonical_ingredient_id is not null then 'raw_material'
                 when decision_value='release' then 'packaging' end;
  lot_id:=case when decision_value='release' then gen_random_uuid()::text end;
  movement_id:=case when decision_value='release' then gen_random_uuid()::text end;

  insert into public.inventory_quality_release_reviews(
    id,workspace_id,owner_id,quarantine_intake_id,review_version,decision,disposition_quantity,unit,
    policy_version,checklist_snapshot,evidence,decision_reason,internal_lot_number,inventory_kind,
    inventory_lot_id,opening_movement_id,total_acquisition_cost,acquisition_cost_currency,
    acquisition_cost_source,acquisition_cost_evidence,idempotency_key,payload_fingerprint,reviewed_by
  ) values(
    review_id,q.workspace_id,uid,q.id,review_no,decision_value,qty,q.unit,
    review_payload->>'policyVersion',review_payload->'checklistSnapshot',review_payload->'evidence',
    trim(review_payload->>'decisionReason'),lot_number,lot_kind,lot_id,movement_id,cost_value,cost_currency,
    cost_source,coalesce(review_payload->'acquisitionCostEvidence','{}'),candidate_idempotency_key,fingerprint,uid
  );

  if decision_value='release' and lot_kind='raw_material' then
    insert into public.inventory_lots(
      workspace_id,owner_id,id,ingredient_id,supplier_product_id,internal_lot_number,supplier_lot_number,
      received_date,opening_quantity,unit,expiry_date,best_before_date,location,status,notes,
      total_acquisition_cost,acquisition_cost_currency,cost_notes,created_at,updated_at,
      quarantine_intake_id,quality_release_review_id
    ) values(
      q.workspace_id,uid,lot_id,q.canonical_ingredient_id,
      nullif(q.supplier_product_snapshot->>'supplierProductId',''),lot_number,q.supplier_lot_number,
      effective_date::text,qty,q.unit,q.expiry_or_retest_date::text,null,
      trim(review_payload->>'inventoryLocation'),'Active',
      'Created by controlled quality release from quarantine intake '||q.id,
      cost_value,cost_currency,case when cost_value is null then 'Unknown acquisition cost at release.' else 'Quality-release acquisition-cost snapshot: '||cost_source end,
      now()::text,now()::text,q.id,review_id
    );
    insert into public.inventory_movements(
      workspace_id,owner_id,id,inventory_lot_id,type,quantity,unit,reason,reference_type,reference_id,notes,occurred_at,created_at
    ) values(
      q.workspace_id,uid,movement_id,lot_id,'Receipt',qty,q.unit,'Controlled quality release',
      'InventoryQualityReleaseReview',review_id::text,'Exactly-once opening receipt from quarantine.',now()::text,now()::text
    );
  elsif decision_value='release' and lot_kind='packaging' then
    insert into public.packaging_inventory_lots(
      workspace_id,owner_id,id,packaging_component_id,packaging_supplier_product_id,internal_lot_number,
      supplier_lot_number,received_date,opening_quantity,unit,location,status,notes,total_acquisition_cost,
      acquisition_cost_currency,cost_notes,created_at,updated_at,quarantine_intake_id,quality_release_review_id
    ) values(
      q.workspace_id,uid,lot_id,q.packaging_component_id,
      nullif(q.supplier_product_snapshot->>'supplierProductId',''),lot_number,q.supplier_lot_number,
      effective_date::text,qty,q.unit,trim(review_payload->>'inventoryLocation'),'Active',
      'Created by controlled quality release from quarantine intake '||q.id,
      cost_value,cost_currency,case when cost_value is null then 'Unknown acquisition cost at release.' else 'Quality-release acquisition-cost snapshot: '||cost_source end,
      now()::text,now()::text,q.id,review_id
    );
    insert into public.packaging_inventory_movements(
      workspace_id,owner_id,id,packaging_inventory_lot_id,type,quantity,unit,reason,reference_type,reference_id,notes,occurred_at,created_at
    ) values(
      q.workspace_id,uid,movement_id,lot_id,'Receipt',qty,q.unit,'Controlled quality release',
      'InventoryQualityReleaseReview',review_id::text,'Exactly-once opening receipt from quarantine.',now()::text,now()::text
    );
  end if;

  remaining:=remaining-case when decision_value in('release','reject') then qty else 0 end;
  next_status:=case
    when decision_value='hold' then 'held'
    when decision_value='release' and remaining=0 then 'released'
    when decision_value='release' then 'partially_released'
    when decision_value='reject' and remaining=0 then 'rejected'
    else 'held'
  end;
  update public.inventory_quarantine_intakes set
    released_quantity=released_quantity+case when decision_value='release' then qty else 0 end,
    rejected_quantity=rejected_quantity+case when decision_value='reject' then qty else 0 end,
    quarantine_status=next_status,revision=revision+1
  where id=q.id;

  select * into r from public.purchase_order_receipts where workspace_id=q.workspace_id and id=q.receipt_id;
  select * into o from public.purchase_orders where workspace_id=q.workspace_id and id=r.purchase_order_id;
  insert into public.purchase_order_audit_events(
    workspace_id,owner_id,purchase_order_id,source_purchase_plan_id,source_purchase_plan_version,
    source_purchase_plan_basket_id,supplier_id,event_type,actor_id,prior_state,new_state,reason,metadata
  ) values(
    q.workspace_id,uid,o.id,o.source_purchase_plan_id,o.source_purchase_plan_version,
    o.source_purchase_plan_basket_id,q.supplier_id,'quality_review_recorded',uid,q.quarantine_status,next_status,
    trim(review_payload->>'decisionReason'),
    jsonb_build_object('reviewId',review_id,'quarantineIntakeId',q.id,'decision',decision_value,'quantity',qty,'unit',q.unit)
  );
  if decision_value='release' then
    insert into public.purchase_order_audit_events(
      workspace_id,owner_id,purchase_order_id,source_purchase_plan_id,source_purchase_plan_version,
      source_purchase_plan_basket_id,supplier_id,event_type,actor_id,prior_state,new_state,reason,metadata
    ) values(
      q.workspace_id,uid,o.id,o.source_purchase_plan_id,o.source_purchase_plan_version,
      o.source_purchase_plan_basket_id,q.supplier_id,'inventory_release_committed',uid,'quarantine','inventory_active',
      'Quality release atomically created an inventory lot and opening Receipt movement.',
      jsonb_build_object('reviewId',review_id,'inventoryKind',lot_kind,'inventoryLotId',lot_id,'openingMovementId',movement_id)
    );
  end if;

  return jsonb_build_object(
    'reviewId',review_id,'inventoryKind',lot_kind,'inventoryLotId',lot_id,
    'openingMovementId',movement_id,'intakeRevision',q.revision+1
  );
end $$;

revoke all on function public.review_quarantined_inventory(uuid,bigint,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.review_quarantined_inventory(uuid,bigint,uuid,jsonb) to authenticated,service_role;

-- Existing ledgers remain authoritative, but commitment must also enforce that
-- the selected lot is released, active, and not expired.
create or replace function public.commit_lab_consumption(batch_id text, commits jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();wid uuid;item jsonb;a lab_lot_allocations%rowtype;ln lab_batch_lines%rowtype;b lab_batches%rowtype;l inventory_lots%rowtype;needed numeric;result jsonb:='[]'::jsonb;
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
    if l.status<>'Active' or (nullif(l.expiry_date,'') is not null and l.expiry_date::date<current_date) then raise exception 'Inventory Lot is not production available';end if;
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
declare uid uuid:=auth.uid();wid uuid;item jsonb;a production_lot_allocations%rowtype;ln production_run_lines%rowtype;r production_runs%rowtype;l inventory_lots%rowtype;needed numeric;unit_cost numeric;result jsonb:='[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required';end if;select id into wid from workspaces where owner_id=uid;if wid is null then raise exception 'Workspace not found';end if;
  if jsonb_array_length(commits)=0 then raise exception 'No allocations to commit';end if;
  for item in select value from jsonb_array_elements(commits) loop
    select * into a from production_lot_allocations where workspace_id=wid and id=item->>'allocation_id' for update;
    if not found then raise exception 'Production allocation not found';end if;if a.inventory_movement_id is not null then raise exception 'Production allocation already committed';end if;
    select * into ln from production_run_lines where workspace_id=wid and id=a.production_run_line_id;select * into r from production_runs where workspace_id=wid and id=ln.production_run_id and id=run_id;
    if not found or r.status<>'In Progress' then raise exception 'Production Run is not commit-ready';end if;
    select * into l from inventory_lots where workspace_id=wid and id=a.inventory_lot_id for update;if not found then raise exception 'Inventory Lot not found';end if;
    if l.status<>'Active' or (nullif(l.expiry_date,'') is not null and l.expiry_date::date<current_date) then raise exception 'Inventory Lot is not production available';end if;
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
declare uid uuid:=auth.uid();wid uuid;item jsonb;a packaging_allocations%rowtype;b finished_goods_batches%rowtype;l packaging_inventory_lots%rowtype;needed numeric;unit_cost numeric;req record;result jsonb:='[]'::jsonb;
begin
  if uid is null then raise exception 'Authentication required';end if;select id into wid from workspaces where owner_id=uid;if wid is null then raise exception 'Workspace not found';end if;
  select f.* into b from finished_goods_batches f where f.workspace_id=wid and f.id=target_finished_goods_batch_id for update;if not found or b.packaging_specification_version_id is null then raise exception 'Packaged Finished Goods Batch not found';end if;
  if exists(select 1 from finished_goods_movements where workspace_id=wid and finished_goods_batch_id=b.id and type='ProductionReceipt') then raise exception 'Packaging consumption already committed';end if;
  for req in select sl.id,sl.quantity_per_unit*b.initial_quantity required,coalesce(sum(pa.quantity),0) allocated from packaging_specification_lines sl left join packaging_allocations pa on pa.workspace_id=sl.workspace_id and pa.packaging_specification_line_id=sl.id and pa.finished_goods_batch_id=b.id where sl.workspace_id=wid and sl.packaging_specification_version_id=b.packaging_specification_version_id group by sl.id,sl.quantity_per_unit loop if abs(req.required-req.allocated)>.0001 then raise exception 'Packaging allocations do not match requirements';end if;end loop;
  for item in select value from jsonb_array_elements(commits) loop
    select * into a from packaging_allocations where workspace_id=wid and id=item->>'allocation_id' and finished_goods_batch_id=b.id for update;if not found then raise exception 'Packaging allocation not found';end if;if a.packaging_inventory_movement_id is not null then raise exception 'Packaging allocation already committed';end if;
    select * into l from packaging_inventory_lots where workspace_id=wid and id=a.packaging_inventory_lot_id for update;if not found then raise exception 'Packaging Lot not found';end if;
    if l.status<>'Active' then raise exception 'Packaging Lot is not production available';end if;
    needed:=kf_convert_quantity(a.quantity,a.unit,l.unit);if needed is null then raise exception 'Incompatible packaging units';end if;if needed<=0 or kf_packaging_balance(wid,l.id)<needed then raise exception 'Insufficient packaging balance';end if;
    unit_cost:=case when l.total_acquisition_cost is not null and l.opening_quantity>0 then (l.total_acquisition_cost/l.opening_quantity)*kf_convert_quantity(1,a.unit,l.unit) end;
    insert into packaging_inventory_movements(workspace_id,owner_id,id,packaging_inventory_lot_id,type,quantity,unit,reason,reference_type,reference_id,notes,occurred_at,created_at) values(wid,uid,item->>'movement_id',l.id,'Consumption',a.quantity,a.unit,'Finished Goods '||b.finished_goods_batch_number,'FinishedGoodsBatch',b.id,'',item->>'occurred_at',item->>'created_at');
    update packaging_allocations set packaging_inventory_movement_id=item->>'movement_id',unit_cost_snapshot=unit_cost,cost_currency_snapshot=case when unit_cost is null then null else l.acquisition_cost_currency end where workspace_id=wid and id=a.id;result:=result||jsonb_build_array(jsonb_build_object('allocationId',a.id,'movementId',item->>'movement_id','unitCostSnapshot',unit_cost));
  end loop;
  insert into finished_goods_movements(workspace_id,owner_id,id,finished_goods_batch_id,type,quantity,unit,reason,reference_type,reference_id,notes,occurred_at,created_at) values(wid,uid,receipt->>'id',b.id,'ProductionReceipt',b.initial_quantity,b.unit,'Packaging committed and Production output finalized','ProductionRun',b.production_run_id,'',receipt->>'occurred_at',receipt->>'created_at');
  update finished_goods_batches set status='Active',updated_at=receipt->>'created_at' where workspace_id=wid and id=b.id;return jsonb_build_object('commits',result,'receiptId',receipt->>'id');
end $$;

revoke all on function public.commit_lab_consumption(text,jsonb),public.commit_production_consumption(text,jsonb),public.commit_packaging_consumption(text,jsonb,jsonb) from public,anon;
grant execute on function public.commit_lab_consumption(text,jsonb),public.commit_production_consumption(text,jsonb),public.commit_packaging_consumption(text,jsonb,jsonb) to authenticated,service_role;
