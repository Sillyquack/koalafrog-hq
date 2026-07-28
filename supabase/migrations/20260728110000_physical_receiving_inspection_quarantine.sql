-- Physical Receiving, Inspection, and Quarantine Intake V1.
-- Physical receipt proves arrival only. Inspection records receiving checks.
-- Quarantine intake is unavailable material and is not an Inventory Lot or Movement.

alter table public.purchase_order_shipments drop constraint purchase_order_shipments_status_check;
alter table public.purchase_order_shipments add constraint purchase_order_shipments_status_check
  check(status in('preparing','dispatched','in_transit','delayed','carrier_exception','delivery_reported','physically_received','cancelled'));

alter table public.purchase_order_shipment_events drop constraint purchase_order_shipment_events_event_type_check;
alter table public.purchase_order_shipment_events add constraint purchase_order_shipment_events_event_type_check
  check(event_type in('created','tracking_updated','dispatched','in_transit','delayed','carrier_exception','delivery_reported','physically_received','cancelled'));

create table public.purchase_order_receipts(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  purchase_order_id uuid not null,
  supplier_id uuid not null,
  receipt_sequence integer not null check(receipt_sequence>0),
  receipt_number text not null check(length(trim(receipt_number))>0),
  revision bigint not null default 1 check(revision>0),
  status text not null default 'receiving' check(status in('draft','receiving','inspection_pending','inspection_in_progress','discrepancy_review','quarantine_ready','quarantined','cancelled')),
  physical_receipt_date timestamptz not null,
  physically_received_by uuid not null,
  receiving_location text not null check(length(trim(receiving_location))>0),
  package_count_expected numeric check(package_count_expected is null or package_count_expected>=0),
  package_count_received numeric not null check(package_count_received>0),
  outer_packaging_condition text not null check(outer_packaging_condition in('intact','minor_damage','major_damage','wet','contaminated','unknown')),
  tamper_state text not null check(tamper_state in('none_observed','suspected','confirmed','unknown')),
  water_damage_state text not null check(water_damage_state in('none_observed','suspected','confirmed','unknown')),
  visible_contamination_state text not null check(visible_contamination_state in('none_observed','suspected','confirmed','unknown')),
  temperature_concern_state text not null check(temperature_concern_state in('none_observed','suspected','confirmed','not_applicable','unknown')),
  evidence_type text not null,
  evidence_reference text not null check(length(trim(evidence_reference))>0),
  photograph_reference text not null default '',
  delivery_note_reference text not null default '',
  packing_slip_reference text not null default '',
  source_url text,
  receiving_notes text not null default '',
  policy_version text not null default '1.0.0',
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  recorded_by uuid not null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,purchase_order_id,receipt_sequence),
  unique(workspace_id,purchase_order_id,receipt_number),
  unique(workspace_id,purchase_order_id,idempotency_key),
  foreign key(workspace_id,purchase_order_id) references public.purchase_orders(workspace_id,id),
  foreign key(workspace_id,supplier_id) references public.suppliers(workspace_id,id)
);

create table public.purchase_order_receipt_shipments(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  receipt_id uuid not null,
  purchase_order_id uuid not null,
  shipment_id uuid not null,
  carrier_snapshot text not null,
  tracking_number_snapshot text not null,
  shipment_reference_snapshot text not null,
  carrier_delivery_reported_at timestamptz,
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,receipt_id,shipment_id),
  foreign key(workspace_id,receipt_id) references public.purchase_order_receipts(workspace_id,id),
  foreign key(workspace_id,purchase_order_id) references public.purchase_orders(workspace_id,id),
  foreign key(workspace_id,shipment_id) references public.purchase_order_shipments(workspace_id,id)
);

create table public.purchase_order_receipt_lines(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  receipt_id uuid not null,
  purchase_order_id uuid not null,
  purchase_order_line_id uuid not null,
  confirmation_line_id uuid,
  shipment_line_id uuid,
  supplier_product_id text,
  canonical_ingredient_id text,
  packaging_component_id text,
  source_order_snapshot jsonb not null check(jsonb_typeof(source_order_snapshot)='object'),
  ordered_package_count numeric not null check(ordered_package_count>0),
  confirmed_package_count numeric check(confirmed_package_count is null or confirmed_package_count>=0),
  shipped_package_count numeric check(shipped_package_count is null or shipped_package_count>=0),
  ordered_quantity numeric not null check(ordered_quantity>0),
  confirmed_quantity numeric check(confirmed_quantity is null or confirmed_quantity>=0),
  shipped_quantity numeric check(shipped_quantity is null or shipped_quantity>=0),
  expected_package_size numeric not null check(expected_package_size>0),
  expected_unit text not null,
  expected_product text not null,
  expected_sku text not null default '',
  expected_variant text not null default '',
  received_product_name text not null,
  received_supplier_product_identity text not null,
  received_sku text not null default '',
  received_variant text not null default '',
  received_package_count numeric not null check(received_package_count>=0),
  received_package_size numeric not null check(received_package_size>0),
  received_package_unit text not null,
  received_total_quantity numeric not null check(received_total_quantity>=0),
  damaged_quantity numeric not null default 0 check(damaged_quantity>=0),
  held_quantity numeric not null default 0 check(held_quantity>=0),
  rejected_quantity numeric not null default 0 check(rejected_quantity>=0),
  quarantine_candidate_quantity numeric not null default 0 check(quarantine_candidate_quantity>=0),
  unopened_package_count numeric not null default 0 check(unopened_package_count>=0),
  opened_package_count numeric not null default 0 check(opened_package_count>=0),
  supplier_lot_number text not null default '',
  supplier_batch_number text not null default '',
  manufacturer_lot_number text not null default '',
  manufacturing_date date,
  expiry_date date,
  best_before_date date,
  retest_date date,
  lot_marking_location text not null default '',
  lot_evidence_reference text not null default '',
  identity_checks jsonb not null default '{}' check(jsonb_typeof(identity_checks)='object'),
  condition_checks jsonb not null default '{}' check(jsonb_typeof(condition_checks)='object'),
  documentation_checks jsonb not null default '{}' check(jsonb_typeof(documentation_checks)='object'),
  documentation_references jsonb not null default '{}' check(jsonb_typeof(documentation_references)='object'),
  material_profile text not null default 'other_raw_material' check(material_profile in('carrier_oil','essential_oil','butter','wax','powder','fragrance_material','packaging_component','label','finished_goods_component','other_raw_material')),
  line_status text not null check(line_status in('expected','received','partially_received','not_received','over_received','damaged','incorrect_product','incorrect_package','label_mismatch','documentation_missing','held','rejected','quarantine_candidate')),
  identity_status text not null check(identity_status in('pending','matches','mismatch','unverified')),
  condition_status text not null check(condition_status in('pending','acceptable','damaged','critical_concern','held')),
  physical_line_note text not null default '',
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  recorded_by uuid not null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,receipt_id,purchase_order_line_id,shipment_line_id),
  unique(workspace_id,receipt_id,idempotency_key),
  check(canonical_ingredient_id is not null or packaging_component_id is not null),
  check(not(canonical_ingredient_id is not null and packaging_component_id is not null)),
  check(damaged_quantity+held_quantity+rejected_quantity<=received_total_quantity),
  check(quarantine_candidate_quantity<=received_total_quantity-damaged_quantity-held_quantity-rejected_quantity),
  foreign key(workspace_id,receipt_id) references public.purchase_order_receipts(workspace_id,id),
  foreign key(workspace_id,purchase_order_id) references public.purchase_orders(workspace_id,id),
  foreign key(workspace_id,purchase_order_line_id) references public.purchase_order_lines(workspace_id,id),
  foreign key(workspace_id,confirmation_line_id) references public.purchase_order_confirmation_lines(workspace_id,id),
  foreign key(workspace_id,shipment_line_id) references public.purchase_order_shipment_lines(workspace_id,id)
);

create table public.purchase_order_receipt_discrepancies(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  receipt_id uuid not null,
  receipt_line_id uuid,
  discrepancy_type text not null check(discrepancy_type in('missing_quantity','over_delivery','damaged_item','leaking_container','broken_packaging','incorrect_product','incorrect_sku','incorrect_variant','incorrect_package_size','incorrect_unit','wrong_lot','missing_lot_number','missing_expiry_date','short_expiry','missing_documentation','incorrect_documentation','label_mismatch','contamination_concern','temperature_concern','substitution_not_previously_accepted','duplicate_shipment','unknown_item','other')),
  severity text not null check(severity in('advisory','minor','major','critical')),
  affected_quantity numeric not null check(affected_quantity>=0),
  unit text not null,
  description text not null check(length(trim(description))>0),
  evidence jsonb not null default '{}' check(jsonb_typeof(evidence)='object'),
  supplier_responsibility_state text not null default 'unknown' check(supplier_responsibility_state in('unknown','likely_supplier','likely_carrier','internal','shared','not_applicable')),
  owner_disposition text not null check(owner_disposition in('accept_to_quarantine','hold_for_review','reject','return_to_supplier','destroy_pending_approval','supplier_claim','quantity_adjustment','awaiting_documentation','awaiting_compatibility_review')),
  reason text not null,
  resolution_status text not null default 'open' check(resolution_status in('open','under_review','resolved','superseded')),
  supplier_claim_required boolean not null default false,
  supplier_claim_reference text not null default '',
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  actor_id uuid not null,
  occurred_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,receipt_id,idempotency_key),
  foreign key(workspace_id,receipt_id) references public.purchase_order_receipts(workspace_id,id),
  foreign key(workspace_id,receipt_line_id) references public.purchase_order_receipt_lines(workspace_id,id)
);

create table public.purchase_order_receipt_inspections(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  receipt_id uuid not null,
  receipt_line_id uuid,
  inspection_type text not null check(inspection_type in('package_condition','identity_and_label','quantity','lot_traceability','documentation','organoleptic_receiving_check','temperature_check','basic_dimensional_check','other')),
  inspection_version integer not null check(inspection_version>0),
  policy_version text not null default '1.0.0',
  result text not null check(result in('pending','passed_receiving_checks','conditional_hold','failed','not_applicable')),
  checklist_snapshot jsonb not null check(jsonb_typeof(checklist_snapshot)='object'),
  measured_values jsonb not null default '{}' check(jsonb_typeof(measured_values)='object'),
  notes text not null default '',
  evidence jsonb not null default '{}' check(jsonb_typeof(evidence)='object'),
  supersedes_inspection_id uuid,
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  inspected_by uuid not null,
  inspected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,receipt_id,idempotency_key),
  unique(workspace_id,receipt_id,receipt_line_id,inspection_type,inspection_version),
  foreign key(workspace_id,receipt_id) references public.purchase_order_receipts(workspace_id,id),
  foreign key(workspace_id,receipt_line_id) references public.purchase_order_receipt_lines(workspace_id,id),
  foreign key(supersedes_inspection_id) references public.purchase_order_receipt_inspections(id)
);

create table public.inventory_quarantine_intakes(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_id uuid not null,
  receipt_id uuid not null,
  receipt_line_id uuid not null,
  purchase_order_line_id uuid not null,
  supplier_id uuid not null,
  canonical_ingredient_id text,
  packaging_component_id text,
  supplier_product_snapshot jsonb not null check(jsonb_typeof(supplier_product_snapshot)='object'),
  supplier_lot_number text not null,
  supplier_batch_number text not null default '',
  manufacturing_date date,
  expiry_or_retest_date date,
  quarantine_quantity numeric not null check(quarantine_quantity>0),
  unit text not null,
  package_count numeric not null check(package_count>=0),
  container_count numeric not null check(container_count>=0),
  storage_requirement_snapshot jsonb not null default '{}' check(jsonb_typeof(storage_requirement_snapshot)='object'),
  hazard_snapshot jsonb not null default '{}' check(jsonb_typeof(hazard_snapshot)='object'),
  documentation_snapshot jsonb not null check(jsonb_typeof(documentation_snapshot)='object'),
  discrepancy_snapshot jsonb not null check(jsonb_typeof(discrepancy_snapshot)='array'),
  inspection_summary jsonb not null check(jsonb_typeof(inspection_summary)='array'),
  quarantine_reason text not null,
  quarantine_location text not null check(length(trim(quarantine_location))>0),
  quarantine_status text not null default 'quarantined' check(quarantine_status in('pending_review','quarantined','held','rejected','release_ready','cancelled')),
  revision bigint not null default 1 check(revision>0),
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,receipt_line_id,idempotency_key),
  check(canonical_ingredient_id is not null or packaging_component_id is not null),
  foreign key(workspace_id,receipt_id) references public.purchase_order_receipts(workspace_id,id),
  foreign key(workspace_id,receipt_line_id) references public.purchase_order_receipt_lines(workspace_id,id),
  foreign key(workspace_id,purchase_order_line_id) references public.purchase_order_lines(workspace_id,id),
  foreign key(workspace_id,supplier_id) references public.suppliers(workspace_id,id)
);

create index purchase_order_receipts_order on public.purchase_order_receipts(workspace_id,purchase_order_id,receipt_sequence desc);
create index receipt_shipments_shipment on public.purchase_order_receipt_shipments(workspace_id,shipment_id);
create index receipt_lines_order_line on public.purchase_order_receipt_lines(workspace_id,purchase_order_line_id,recorded_at);
create index receipt_discrepancies_open on public.purchase_order_receipt_discrepancies(workspace_id,receipt_id,resolution_status,severity);
create index receipt_inspections_line on public.purchase_order_receipt_inspections(workspace_id,receipt_line_id,inspection_type,inspection_version desc);
create index quarantine_intakes_receipt on public.inventory_quarantine_intakes(workspace_id,receipt_id,quarantine_status);

alter table public.purchase_order_receipts enable row level security;
alter table public.purchase_order_receipt_shipments enable row level security;
alter table public.purchase_order_receipt_lines enable row level security;
alter table public.purchase_order_receipt_discrepancies enable row level security;
alter table public.purchase_order_receipt_inspections enable row level security;
alter table public.inventory_quarantine_intakes enable row level security;
create policy owner_select on public.purchase_order_receipts for select to authenticated using(owner_id=(select auth.uid()));
create policy owner_select on public.purchase_order_receipt_shipments for select to authenticated using(owner_id=(select auth.uid()));
create policy owner_select on public.purchase_order_receipt_lines for select to authenticated using(owner_id=(select auth.uid()));
create policy owner_select on public.purchase_order_receipt_discrepancies for select to authenticated using(owner_id=(select auth.uid()));
create policy owner_select on public.purchase_order_receipt_inspections for select to authenticated using(owner_id=(select auth.uid()));
create policy owner_select on public.inventory_quarantine_intakes for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.purchase_order_receipts,public.purchase_order_receipt_shipments,public.purchase_order_receipt_lines,public.purchase_order_receipt_discrepancies,public.purchase_order_receipt_inspections,public.inventory_quarantine_intakes from public,anon,authenticated;
grant select on public.purchase_order_receipts,public.purchase_order_receipt_shipments,public.purchase_order_receipt_lines,public.purchase_order_receipt_discrepancies,public.purchase_order_receipt_inspections,public.inventory_quarantine_intakes to authenticated;
grant all on public.purchase_order_receipts,public.purchase_order_receipt_shipments,public.purchase_order_receipt_lines,public.purchase_order_receipt_discrepancies,public.purchase_order_receipt_inspections,public.inventory_quarantine_intakes to service_role;

comment on table public.purchase_order_receipts is 'Owner-recorded physical arrival. It does not verify contents, accept quantity, approve material, or create inventory.';
comment on table public.purchase_order_receipt_inspections is 'Append-only receiving checks. Passing checks does not release material or make it production-ready.';
comment on table public.inventory_quarantine_intakes is 'Physically present material unavailable for production. This is not an Inventory Lot or Inventory Movement.';

alter table public.purchase_order_audit_events drop constraint purchase_order_audit_events_event_type_check;
alter table public.purchase_order_audit_events add constraint purchase_order_audit_events_event_type_check check(event_type in(
  'draft_handoff_started','draft_created','draft_lines_created','draft_handoff_retried','draft_cancelled','placement_recorded','placement_retried',
  'supplier_confirmation_recorded','supplier_confirmation_decided','shipment_created','shipment_status_recorded',
  'physical_receipt_recorded','receipt_line_recorded','receipt_discrepancy_recorded','receipt_inspection_recorded','receiving_completed','receipt_quarantine_created','receipt_cancelled'
));
alter table public.supplier_events drop constraint supplier_events_event_type_check;
alter table public.supplier_events add constraint supplier_events_event_type_check check(event_type in(
  'quote_received','quote_updated','purchase_planned','purchase_placed','order_confirmed','shipment_dispatched','shipment_received','partial_shipment',
  'cancelled_order','refund','replacement_shipment','damaged_shipment','customs_issue','invoice_received','payment_completed',
  'documentation_requested','documentation_received','documentation_rejected','communication','manual_note',
  'supplier_confirmation_received','supplier_confirmation_changed','supplier_line_backordered','supplier_line_unavailable',
  'supplier_substitution_proposed','shipment_preparing','shipment_delayed','shipment_delivery_reported',
  'physical_receipt_recorded','package_damage_recorded','receipt_discrepancy_recorded','quantity_short_received','quantity_over_received',
  'wrong_product_received','documentation_missing_at_receipt','receipt_inspection_completed','receipt_quarantine_created',
  'receipt_line_rejected','supplier_claim_needed'
));

create function public.create_purchase_order_receipt(
  target_order_id uuid, expected_order_revision bigint, candidate_idempotency_key uuid, receipt_payload jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); o public.purchase_orders; existing public.purchase_order_receipts; r_id uuid; sequence_no integer;
  fingerprint text:=encode(extensions.digest(jsonb_strip_nulls(receipt_payload)::text,'sha256'),'hex'); item jsonb; s public.purchase_order_shipments;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if candidate_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  select * into o from public.purchase_orders where id=target_order_id and owner_id=uid for update;
  if o.id is null or not exists(select 1 from public.workspaces where id=o.workspace_id and owner_id=uid and lifecycle_state='active') then raise exception 'PURCHASE_ORDER_UNAVAILABLE'; end if;
  select * into existing from public.purchase_order_receipts where workspace_id=o.workspace_id and purchase_order_id=o.id and idempotency_key=candidate_idempotency_key;
  if existing.id is not null then if existing.payload_fingerprint<>fingerprint then raise exception 'RECEIPT_RETRY_CONFLICT'; end if; return existing.id; end if;
  if o.revision<>expected_order_revision then raise exception 'STALE_PURCHASE_ORDER_REVISION'; end if;
  if o.status not in('placed','supplier_confirmed','partially_confirmed','confirmation_exception','partially_shipped','shipped') then raise exception 'PURCHASE_ORDER_NOT_RECEIVABLE'; end if;
  if coalesce(jsonb_array_length(receipt_payload->'shipmentIds'),0)=0 then raise exception 'RECEIPT_SHIPMENT_REQUIRED'; end if;
  if coalesce((receipt_payload->>'packageCountReceived')::numeric,0)<=0 or nullif(trim(receipt_payload->>'receivingLocation'),'') is null or nullif(trim(receipt_payload->>'evidenceReference'),'') is null then raise exception 'RECEIPT_REQUIRED_VALUES_MISSING'; end if;
  sequence_no:=coalesce((select max(receipt_sequence)+1 from public.purchase_order_receipts where workspace_id=o.workspace_id and purchase_order_id=o.id),1);
  insert into public.purchase_order_receipts(workspace_id,owner_id,purchase_order_id,supplier_id,receipt_sequence,receipt_number,physical_receipt_date,physically_received_by,receiving_location,package_count_expected,package_count_received,outer_packaging_condition,tamper_state,water_damage_state,visible_contamination_state,temperature_concern_state,evidence_type,evidence_reference,photograph_reference,delivery_note_reference,packing_slip_reference,source_url,receiving_notes,idempotency_key,payload_fingerprint,recorded_by)
  values(o.workspace_id,uid,o.id,o.supplier_id,sequence_no,coalesce(nullif(trim(receipt_payload->>'receiptNumber'),''),'RCV-'||lpad(sequence_no::text,3,'0')),coalesce(nullif(receipt_payload->>'physicalReceiptDate','')::timestamptz,now()),uid,trim(receipt_payload->>'receivingLocation'),nullif(receipt_payload->>'packageCountExpected','')::numeric,(receipt_payload->>'packageCountReceived')::numeric,coalesce(receipt_payload->>'outerPackagingCondition','unknown'),coalesce(receipt_payload->>'tamperState','unknown'),coalesce(receipt_payload->>'waterDamageState','unknown'),coalesce(receipt_payload->>'visibleContaminationState','unknown'),coalesce(receipt_payload->>'temperatureConcernState','unknown'),coalesce(receipt_payload->>'evidenceType','manual_reference'),trim(receipt_payload->>'evidenceReference'),coalesce(receipt_payload->>'photographReference',''),coalesce(receipt_payload->>'deliveryNoteReference',''),coalesce(receipt_payload->>'packingSlipReference',''),nullif(receipt_payload->>'sourceUrl',''),coalesce(receipt_payload->>'receivingNotes',''),candidate_idempotency_key,fingerprint,uid) returning id into r_id;
  for item in select value from jsonb_array_elements(receipt_payload->'shipmentIds') loop
    select * into s from public.purchase_order_shipments where workspace_id=o.workspace_id and purchase_order_id=o.id and id=(item#>>'{}')::uuid and status in('dispatched','in_transit','delayed','carrier_exception','delivery_reported','physically_received') for update;
    if s.id is null then raise exception 'RECEIPT_SHIPMENT_INVALID'; end if;
    insert into public.purchase_order_receipt_shipments(workspace_id,owner_id,receipt_id,purchase_order_id,shipment_id,carrier_snapshot,tracking_number_snapshot,shipment_reference_snapshot,carrier_delivery_reported_at)
    values(o.workspace_id,uid,r_id,o.id,s.id,s.carrier,s.tracking_number,s.supplier_shipment_reference,s.delivery_reported_at);
    update public.purchase_order_shipments set status='physically_received',revision=revision+1,updated_at=now() where id=s.id;
    insert into public.purchase_order_shipment_events(workspace_id,owner_id,shipment_id,purchase_order_id,event_type,prior_state,new_state,evidence,metadata,actor_id,source_key)
    values(o.workspace_id,uid,s.id,o.id,'physically_received',s.status,'physically_received',jsonb_build_object('type',receipt_payload->>'evidenceType','reference',receipt_payload->>'evidenceReference'),jsonb_build_object('receiptId',r_id),uid,'shipment-physical-receipt:'||r_id||':'||s.id);
  end loop;
  insert into public.purchase_order_audit_events(workspace_id,owner_id,purchase_order_id,source_purchase_plan_id,source_purchase_plan_version,source_purchase_plan_basket_id,supplier_id,event_type,actor_id,new_state,metadata)
  values(o.workspace_id,uid,o.id,o.source_purchase_plan_id,o.source_purchase_plan_version,o.source_purchase_plan_basket_id,o.supplier_id,'physical_receipt_recorded',uid,'receiving',jsonb_build_object('receiptId',r_id,'receiptSequence',sequence_no));
  insert into public.supplier_events(workspace_id,owner_id,supplier_id,event_type,occurred_at,title,description,purchase_plan_id,purchase_order_id,source_key,metadata)
  values(o.workspace_id,uid,o.supplier_id,'physical_receipt_recorded',now(),'Physical receipt recorded','Package arrival recorded. Contents are not approved and no inventory exists.',o.source_purchase_plan_id,o.id,'physical-receipt:'||r_id,jsonb_build_object('receiptId',r_id,'evidenceReference',receipt_payload->>'evidenceReference')) on conflict do nothing;
  return r_id;
end $$;

create function public.record_purchase_order_receipt_line(
  target_receipt_id uuid, expected_receipt_revision bigint, candidate_idempotency_key uuid, line_payload jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); r public.purchase_order_receipts; existing public.purchase_order_receipt_lines; ol public.purchase_order_lines;
  sl public.purchase_order_shipment_lines; cl public.purchase_order_confirmation_lines; line_id uuid; received numeric; damaged numeric; held numeric; rejected numeric;
  fingerprint text:=encode(extensions.digest(jsonb_strip_nulls(line_payload)::text,'sha256'),'hex'); cumulative numeric; status_value text;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into r from public.purchase_order_receipts where id=target_receipt_id and owner_id=uid for update;
  if r.id is null or not exists(select 1 from public.workspaces where id=r.workspace_id and owner_id=uid and lifecycle_state='active') then raise exception 'RECEIPT_UNAVAILABLE'; end if;
  select * into existing from public.purchase_order_receipt_lines where workspace_id=r.workspace_id and receipt_id=r.id and idempotency_key=candidate_idempotency_key;
  if existing.id is not null then if existing.payload_fingerprint<>fingerprint then raise exception 'RECEIPT_LINE_RETRY_CONFLICT'; end if; return existing.id; end if;
  if r.revision<>expected_receipt_revision or r.status not in('receiving','inspection_pending','inspection_in_progress','discrepancy_review') then raise exception 'RECEIPT_NOT_EDITABLE'; end if;
  select * into ol from public.purchase_order_lines where workspace_id=r.workspace_id and purchase_order_id=r.purchase_order_id and id=(line_payload->>'purchaseOrderLineId')::uuid;
  if ol.id is null then raise exception 'RECEIPT_ORDER_LINE_INVALID'; end if;
  if nullif(line_payload->>'shipmentLineId','') is not null then
    select x.* into sl from public.purchase_order_shipment_lines x join public.purchase_order_receipt_shipments rs on rs.workspace_id=x.workspace_id and rs.shipment_id=x.shipment_id and rs.receipt_id=r.id where x.id=(line_payload->>'shipmentLineId')::uuid and x.purchase_order_line_id=ol.id;
    if sl.id is null then raise exception 'RECEIPT_SHIPMENT_LINE_INVALID'; end if;
  end if;
  select * into cl from public.purchase_order_confirmation_lines where workspace_id=r.workspace_id and id=coalesce(sl.confirmation_line_id,nullif(line_payload->>'confirmationLineId','')::uuid);
  received:=coalesce((line_payload->>'receivedTotalQuantity')::numeric,-1); damaged:=coalesce((line_payload->>'damagedQuantity')::numeric,0); held:=coalesce((line_payload->>'heldQuantity')::numeric,0); rejected:=coalesce((line_payload->>'rejectedQuantity')::numeric,0);
  if received<0 or damaged<0 or held<0 or rejected<0 or damaged+held+rejected>received then raise exception 'RECEIPT_QUANTITY_INVALID'; end if;
  if coalesce(line_payload->>'receivedPackageUnit','')<>ol.package_unit then raise exception 'RECEIPT_UNIT_INCOMPATIBLE'; end if;
  select coalesce(sum(received_total_quantity),0) into cumulative from public.purchase_order_receipt_lines where workspace_id=r.workspace_id and purchase_order_line_id=ol.id;
  if cumulative+received>coalesce(sl.shipped_quantity,cl.confirmed_quantity,ol.actual_package_count*ol.package_size)*1.10 and not coalesce((line_payload->>'acknowledgeOverDelivery')::boolean,false) then raise exception 'OVER_DELIVERY_ACKNOWLEDGEMENT_REQUIRED'; end if;
  status_value:=case when received=0 then 'not_received' when damaged>0 then 'damaged' when received<coalesce(sl.shipped_quantity,cl.confirmed_quantity,ol.actual_package_count*ol.package_size) then 'partially_received' when received>coalesce(sl.shipped_quantity,cl.confirmed_quantity,ol.actual_package_count*ol.package_size) then 'over_received' else 'received' end;
  insert into public.purchase_order_receipt_lines(workspace_id,owner_id,receipt_id,purchase_order_id,purchase_order_line_id,confirmation_line_id,shipment_line_id,supplier_product_id,canonical_ingredient_id,packaging_component_id,source_order_snapshot,ordered_package_count,confirmed_package_count,shipped_package_count,ordered_quantity,confirmed_quantity,shipped_quantity,expected_package_size,expected_unit,expected_product,expected_sku,expected_variant,received_product_name,received_supplier_product_identity,received_sku,received_variant,received_package_count,received_package_size,received_package_unit,received_total_quantity,damaged_quantity,held_quantity,rejected_quantity,quarantine_candidate_quantity,unopened_package_count,opened_package_count,supplier_lot_number,supplier_batch_number,manufacturer_lot_number,manufacturing_date,expiry_date,best_before_date,retest_date,lot_marking_location,lot_evidence_reference,identity_checks,condition_checks,documentation_checks,documentation_references,material_profile,line_status,identity_status,condition_status,physical_line_note,idempotency_key,payload_fingerprint,recorded_by)
  values(r.workspace_id,uid,r.id,r.purchase_order_id,ol.id,cl.id,sl.id,ol.supplier_product_id,ol.canonical_ingredient_id,null,jsonb_build_object('productName',ol.product_name_snapshot,'sku',ol.supplier_sku_snapshot,'variant',ol.variant_snapshot,'packageSize',ol.package_size,'packageUnit',ol.package_unit),ol.actual_package_count,cl.confirmed_package_count,sl.shipped_package_count,ol.actual_package_count*ol.package_size,cl.confirmed_quantity,sl.shipped_quantity,ol.package_size,ol.package_unit,ol.product_name_snapshot,coalesce(ol.supplier_sku_snapshot,''),coalesce(ol.variant_snapshot,''),line_payload->>'receivedProductName',line_payload->>'receivedSupplierProductIdentity',coalesce(line_payload->>'receivedSku',''),coalesce(line_payload->>'receivedVariant',''),(line_payload->>'receivedPackageCount')::numeric,(line_payload->>'receivedPackageSize')::numeric,line_payload->>'receivedPackageUnit',received,damaged,held,rejected,greatest(received-damaged-held-rejected,0),coalesce((line_payload->>'unopenedPackageCount')::numeric,0),coalesce((line_payload->>'openedPackageCount')::numeric,0),coalesce(line_payload->>'supplierLotNumber',''),coalesce(line_payload->>'supplierBatchNumber',''),coalesce(line_payload->>'manufacturerLotNumber',''),nullif(line_payload->>'manufacturingDate','')::date,nullif(line_payload->>'expiryDate','')::date,nullif(line_payload->>'bestBeforeDate','')::date,nullif(line_payload->>'retestDate','')::date,coalesce(line_payload->>'lotMarkingLocation',''),coalesce(line_payload->>'lotEvidenceReference',''),coalesce(line_payload->'identityChecks','{}'),coalesce(line_payload->'conditionChecks','{}'),coalesce(line_payload->'documentationChecks','{}'),coalesce(line_payload->'documentationReferences','{}'),coalesce(line_payload->>'materialProfile','other_raw_material'),status_value,coalesce(line_payload->>'identityStatus','pending'),coalesce(line_payload->>'conditionStatus','pending'),coalesce(line_payload->>'physicalLineNote',''),candidate_idempotency_key,fingerprint,uid) returning id into line_id;
  update public.purchase_order_receipts set revision=revision+1,updated_at=now() where id=r.id;
  return line_id;
end $$;

create function public.record_purchase_order_receipt_discrepancy(
  target_receipt_id uuid, expected_receipt_revision bigint, candidate_idempotency_key uuid, discrepancy_payload jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); r public.purchase_order_receipts; existing public.purchase_order_receipt_discrepancies; d_id uuid;
  fingerprint text:=encode(extensions.digest(jsonb_strip_nulls(discrepancy_payload)::text,'sha256'),'hex');
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into r from public.purchase_order_receipts where id=target_receipt_id and owner_id=uid for update;
  if r.id is null or r.revision<>expected_receipt_revision then raise exception 'RECEIPT_UNAVAILABLE_OR_STALE'; end if;
  select * into existing from public.purchase_order_receipt_discrepancies where workspace_id=r.workspace_id and receipt_id=r.id and idempotency_key=candidate_idempotency_key;
  if existing.id is not null then if existing.payload_fingerprint<>fingerprint then raise exception 'DISCREPANCY_RETRY_CONFLICT'; end if; return existing.id; end if;
  if nullif(discrepancy_payload->>'receiptLineId','') is not null and not exists(select 1 from public.purchase_order_receipt_lines where workspace_id=r.workspace_id and receipt_id=r.id and id=(discrepancy_payload->>'receiptLineId')::uuid) then raise exception 'DISCREPANCY_LINE_INVALID'; end if;
  insert into public.purchase_order_receipt_discrepancies(workspace_id,owner_id,receipt_id,receipt_line_id,discrepancy_type,severity,affected_quantity,unit,description,evidence,supplier_responsibility_state,owner_disposition,reason,supplier_claim_required,idempotency_key,payload_fingerprint,actor_id)
  values(r.workspace_id,uid,r.id,nullif(discrepancy_payload->>'receiptLineId','')::uuid,discrepancy_payload->>'discrepancyType',discrepancy_payload->>'severity',(discrepancy_payload->>'affectedQuantity')::numeric,discrepancy_payload->>'unit',discrepancy_payload->>'description',coalesce(discrepancy_payload->'evidence','{}'),coalesce(discrepancy_payload->>'supplierResponsibilityState','unknown'),discrepancy_payload->>'ownerDisposition',coalesce(discrepancy_payload->>'reason',''),coalesce((discrepancy_payload->>'supplierClaimRequired')::boolean,false),candidate_idempotency_key,fingerprint,uid) returning id into d_id;
  update public.purchase_order_receipts set status='discrepancy_review',revision=revision+1,updated_at=now() where id=r.id;
  insert into public.supplier_events(workspace_id,owner_id,supplier_id,event_type,occurred_at,title,description,purchase_plan_id,purchase_order_id,source_key,metadata)
  select r.workspace_id,uid,r.supplier_id,case when discrepancy_payload->>'discrepancyType'='missing_quantity' then 'quantity_short_received' when discrepancy_payload->>'discrepancyType'='over_delivery' then 'quantity_over_received' when discrepancy_payload->>'discrepancyType'='incorrect_product' then 'wrong_product_received' when discrepancy_payload->>'discrepancyType'='missing_documentation' then 'documentation_missing_at_receipt' else 'receipt_discrepancy_recorded' end,now(),'Receipt discrepancy recorded',discrepancy_payload->>'description',o.source_purchase_plan_id,o.id,'receipt-discrepancy:'||d_id,jsonb_build_object('receiptId',r.id,'receiptLineId',discrepancy_payload->>'receiptLineId','discrepancyId',d_id,'severity',discrepancy_payload->>'severity','quantity',discrepancy_payload->>'affectedQuantity','unit',discrepancy_payload->>'unit','evidence',discrepancy_payload->'evidence')
  from public.purchase_orders o where o.id=r.purchase_order_id on conflict do nothing;
  return d_id;
end $$;

create function public.record_purchase_order_receipt_inspection(
  target_receipt_id uuid, expected_receipt_revision bigint, candidate_idempotency_key uuid, inspection_payload jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); r public.purchase_order_receipts; existing public.purchase_order_receipt_inspections; prior public.purchase_order_receipt_inspections; inspection_id uuid; version_no integer;
  fingerprint text:=encode(extensions.digest(jsonb_strip_nulls(inspection_payload)::text,'sha256'),'hex');
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into r from public.purchase_order_receipts where id=target_receipt_id and owner_id=uid for update;
  if r.id is null or r.revision<>expected_receipt_revision or r.status in('quarantined','cancelled') then raise exception 'RECEIPT_UNAVAILABLE_OR_STALE'; end if;
  select * into existing from public.purchase_order_receipt_inspections where workspace_id=r.workspace_id and receipt_id=r.id and idempotency_key=candidate_idempotency_key;
  if existing.id is not null then if existing.payload_fingerprint<>fingerprint then raise exception 'INSPECTION_RETRY_CONFLICT'; end if; return existing.id; end if;
  if nullif(inspection_payload->>'receiptLineId','') is not null and not exists(select 1 from public.purchase_order_receipt_lines where workspace_id=r.workspace_id and receipt_id=r.id and id=(inspection_payload->>'receiptLineId')::uuid) then raise exception 'INSPECTION_LINE_INVALID'; end if;
  select * into prior from public.purchase_order_receipt_inspections where workspace_id=r.workspace_id and receipt_id=r.id and receipt_line_id is not distinct from nullif(inspection_payload->>'receiptLineId','')::uuid and inspection_type=inspection_payload->>'inspectionType' order by inspection_version desc limit 1;
  version_no:=coalesce(prior.inspection_version+1,1);
  insert into public.purchase_order_receipt_inspections(workspace_id,owner_id,receipt_id,receipt_line_id,inspection_type,inspection_version,result,checklist_snapshot,measured_values,notes,evidence,supersedes_inspection_id,idempotency_key,payload_fingerprint,inspected_by)
  values(r.workspace_id,uid,r.id,nullif(inspection_payload->>'receiptLineId','')::uuid,inspection_payload->>'inspectionType',version_no,inspection_payload->>'result',coalesce(inspection_payload->'checklistSnapshot','{}'),coalesce(inspection_payload->'measuredValues','{}'),coalesce(inspection_payload->>'notes',''),coalesce(inspection_payload->'evidence','{}'),prior.id,candidate_idempotency_key,fingerprint,uid) returning id into inspection_id;
  update public.purchase_order_receipts set status='inspection_in_progress',revision=revision+1,updated_at=now() where id=r.id;
  insert into public.supplier_events(workspace_id,owner_id,supplier_id,event_type,occurred_at,title,description,purchase_plan_id,purchase_order_id,source_key,metadata)
  select r.workspace_id,uid,r.supplier_id,'receipt_inspection_completed',now(),'Receipt inspection recorded','Receiving inspection history appended; no release occurred.',o.source_purchase_plan_id,o.id,'receipt-inspection:'||inspection_id,jsonb_build_object('receiptId',r.id,'receiptLineId',inspection_payload->>'receiptLineId','inspectionId',inspection_id,'result',inspection_payload->>'result')
  from public.purchase_orders o where o.id=r.purchase_order_id on conflict do nothing;
  return inspection_id;
end $$;

create function public.complete_purchase_order_receiving(target_receipt_id uuid, expected_receipt_revision bigint, candidate_idempotency_key uuid)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); r public.purchase_order_receipts; result_state text;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into r from public.purchase_order_receipts where id=target_receipt_id and owner_id=uid for update;
  if r.id is null then raise exception 'RECEIPT_UNAVAILABLE'; end if;
  if exists(select 1 from public.purchase_order_audit_events where workspace_id=r.workspace_id and metadata->>'idempotencyKey'=candidate_idempotency_key::text) then return r.status; end if;
  if r.revision<>expected_receipt_revision then raise exception 'STALE_RECEIPT_REVISION'; end if;
  if not exists(select 1 from public.purchase_order_receipt_lines where receipt_id=r.id) then raise exception 'RECEIPT_LINES_REQUIRED'; end if;
  if exists(select 1 from public.purchase_order_receipt_lines l where l.receipt_id=r.id and not exists(select 1 from public.purchase_order_receipt_inspections i where i.receipt_line_id=l.id and i.result<>'pending')) then raise exception 'REQUIRED_INSPECTIONS_MISSING'; end if;
  result_state:=case when exists(select 1 from public.purchase_order_receipt_discrepancies where receipt_id=r.id and resolution_status in('open','under_review')) then 'discrepancy_review'
    when exists(select 1 from public.purchase_order_receipt_inspections where receipt_id=r.id and result in('failed','conditional_hold')) then 'discrepancy_review'
    else 'quarantine_ready' end;
  update public.purchase_order_receipts set status=result_state,revision=revision+1,updated_at=now() where id=r.id;
  insert into public.purchase_order_audit_events(workspace_id,owner_id,purchase_order_id,source_purchase_plan_id,source_purchase_plan_version,source_purchase_plan_basket_id,supplier_id,event_type,actor_id,prior_state,new_state,metadata)
  select r.workspace_id,uid,r.purchase_order_id,o.source_purchase_plan_id,o.source_purchase_plan_version,o.source_purchase_plan_basket_id,r.supplier_id,'receiving_completed',uid,r.status,result_state,jsonb_build_object('receiptId',r.id,'idempotencyKey',candidate_idempotency_key)
  from public.purchase_orders o where o.id=r.purchase_order_id;
  return result_state;
end $$;

create function public.place_purchase_order_receipt_into_quarantine(
  target_receipt_id uuid, expected_receipt_revision bigint, candidate_idempotency_key uuid, quarantine_payload jsonb
) returns uuid[] language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); r public.purchase_order_receipts; item jsonb; l public.purchase_order_receipt_lines; intake_id uuid; ids uuid[]:='{}'::uuid[]; qty numeric;
  fingerprint text:=encode(extensions.digest(jsonb_strip_nulls(quarantine_payload)::text,'sha256'),'hex');
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into r from public.purchase_order_receipts where id=target_receipt_id and owner_id=uid for update;
  if exists(select 1 from public.inventory_quarantine_intakes where workspace_id=r.workspace_id and receipt_id=r.id and idempotency_key=candidate_idempotency_key) then
    if exists(select 1 from public.inventory_quarantine_intakes where workspace_id=r.workspace_id and receipt_id=r.id and idempotency_key=candidate_idempotency_key and payload_fingerprint<>fingerprint) then raise exception 'QUARANTINE_RETRY_CONFLICT'; end if;
    return array(select id from public.inventory_quarantine_intakes where workspace_id=r.workspace_id and receipt_id=r.id and idempotency_key=candidate_idempotency_key order by id);
  end if;
  if r.id is null or r.revision<>expected_receipt_revision or r.status not in('quarantine_ready','discrepancy_review') then raise exception 'RECEIPT_NOT_QUARANTINE_ELIGIBLE'; end if;
  if exists(select 1 from public.purchase_order_receipt_discrepancies where receipt_id=r.id and resolution_status in('open','under_review') and severity='critical') then raise exception 'CRITICAL_DISCREPANCY_BLOCKS_QUARANTINE'; end if;
  if exists(select 1 from public.purchase_order_receipt_inspections where receipt_id=r.id and result='failed') then raise exception 'FAILED_INSPECTION_BLOCKS_QUARANTINE'; end if;
  for item in select value from jsonb_array_elements(coalesce(quarantine_payload->'lines','[]')) loop
    select * into l from public.purchase_order_receipt_lines where workspace_id=r.workspace_id and receipt_id=r.id and id=(item->>'receiptLineId')::uuid for update;
    if l.id is null then raise exception 'QUARANTINE_LINE_INVALID'; end if;
    qty:=(item->>'quarantineQuantity')::numeric;
    if qty<=0 or qty>(l.received_total_quantity-l.damaged_quantity-l.held_quantity-l.rejected_quantity)-
      coalesce((select sum(quarantine_quantity) from public.inventory_quarantine_intakes where receipt_line_id=l.id and quarantine_status<>'cancelled'),0) then raise exception 'QUARANTINE_QUANTITY_EXCEEDS_ELIGIBLE'; end if;
    if nullif(trim(l.supplier_lot_number),'') is null then raise exception 'SUPPLIER_LOT_REQUIRED'; end if;
    insert into public.inventory_quarantine_intakes(workspace_id,owner_id,receipt_id,receipt_line_id,purchase_order_line_id,supplier_id,canonical_ingredient_id,packaging_component_id,supplier_product_snapshot,supplier_lot_number,supplier_batch_number,manufacturing_date,expiry_or_retest_date,quarantine_quantity,unit,package_count,container_count,storage_requirement_snapshot,hazard_snapshot,documentation_snapshot,discrepancy_snapshot,inspection_summary,quarantine_reason,quarantine_location,quarantine_status,idempotency_key,payload_fingerprint,created_by)
    values(r.workspace_id,uid,r.id,l.id,l.purchase_order_line_id,r.supplier_id,l.canonical_ingredient_id,l.packaging_component_id,l.source_order_snapshot,l.supplier_lot_number,l.supplier_batch_number,l.manufacturing_date,coalesce(l.expiry_date,l.retest_date),qty,l.received_package_unit,qty/l.received_package_size,coalesce((item->>'containerCount')::numeric,qty/l.received_package_size),coalesce(item->'storageRequirementSnapshot','{}'),coalesce(item->'hazardSnapshot','{}'),l.documentation_checks,(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from public.purchase_order_receipt_discrepancies d where d.receipt_line_id=l.id),(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from public.purchase_order_receipt_inspections i where i.receipt_line_id=l.id),coalesce(item->>'quarantineReason','Receiving checks completed; awaiting quality release.'),item->>'quarantineLocation',case when l.held_quantity>0 then 'held' else 'quarantined' end,candidate_idempotency_key,fingerprint,uid)
    on conflict(workspace_id,receipt_line_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key
    returning id into intake_id;
    ids:=array_append(ids,intake_id);
  end loop;
  if cardinality(ids)=0 then raise exception 'QUARANTINE_LINES_REQUIRED'; end if;
  update public.purchase_order_receipts set status='quarantined',revision=revision+1,updated_at=now() where id=r.id;
  insert into public.purchase_order_audit_events(workspace_id,owner_id,purchase_order_id,source_purchase_plan_id,source_purchase_plan_version,source_purchase_plan_basket_id,supplier_id,event_type,actor_id,prior_state,new_state,metadata)
  select r.workspace_id,uid,r.purchase_order_id,o.source_purchase_plan_id,o.source_purchase_plan_version,o.source_purchase_plan_basket_id,r.supplier_id,'receipt_quarantine_created',uid,r.status,'quarantined',jsonb_build_object('receiptId',r.id,'intakeIds',ids)
  from public.purchase_orders o where o.id=r.purchase_order_id;
  insert into public.supplier_events(workspace_id,owner_id,supplier_id,event_type,occurred_at,title,description,purchase_plan_id,purchase_order_id,source_key,metadata)
  select r.workspace_id,uid,r.supplier_id,'receipt_quarantine_created',now(),'Receipt quantity quarantined','Material is physically present but not released or available for production.',o.source_purchase_plan_id,o.id,'receipt-quarantine:'||candidate_idempotency_key,jsonb_build_object('receiptId',r.id,'intakeIds',ids)
  from public.purchase_orders o where o.id=r.purchase_order_id on conflict do nothing;
  return ids;
end $$;

create function public.cancel_purchase_order_receipt(target_receipt_id uuid, expected_receipt_revision bigint, candidate_reason text)
returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); r public.purchase_order_receipts;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into r from public.purchase_order_receipts where id=target_receipt_id and owner_id=uid for update;
  if r.id is null or r.revision<>expected_receipt_revision or r.status in('quarantined','cancelled') then raise exception 'RECEIPT_NOT_CANCELLABLE'; end if;
  if nullif(trim(candidate_reason),'') is null then raise exception 'CANCELLATION_REASON_REQUIRED'; end if;
  update public.purchase_order_receipts set status='cancelled',revision=revision+1,receiving_notes=receiving_notes||E'\nCancellation: '||trim(candidate_reason),updated_at=now() where id=r.id;
  return r.revision+1;
end $$;

revoke execute on function public.create_purchase_order_receipt(uuid,bigint,uuid,jsonb) from public,anon;
revoke execute on function public.record_purchase_order_receipt_line(uuid,bigint,uuid,jsonb) from public,anon;
revoke execute on function public.record_purchase_order_receipt_discrepancy(uuid,bigint,uuid,jsonb) from public,anon;
revoke execute on function public.record_purchase_order_receipt_inspection(uuid,bigint,uuid,jsonb) from public,anon;
revoke execute on function public.complete_purchase_order_receiving(uuid,bigint,uuid) from public,anon;
revoke execute on function public.place_purchase_order_receipt_into_quarantine(uuid,bigint,uuid,jsonb) from public,anon;
revoke execute on function public.cancel_purchase_order_receipt(uuid,bigint,text) from public,anon;
grant execute on function public.create_purchase_order_receipt(uuid,bigint,uuid,jsonb) to authenticated;
grant execute on function public.record_purchase_order_receipt_line(uuid,bigint,uuid,jsonb) to authenticated;
grant execute on function public.record_purchase_order_receipt_discrepancy(uuid,bigint,uuid,jsonb) to authenticated;
grant execute on function public.record_purchase_order_receipt_inspection(uuid,bigint,uuid,jsonb) to authenticated;
grant execute on function public.complete_purchase_order_receiving(uuid,bigint,uuid) to authenticated;
grant execute on function public.place_purchase_order_receipt_into_quarantine(uuid,bigint,uuid,jsonb) to authenticated;
grant execute on function public.cancel_purchase_order_receipt(uuid,bigint,text) to authenticated;
