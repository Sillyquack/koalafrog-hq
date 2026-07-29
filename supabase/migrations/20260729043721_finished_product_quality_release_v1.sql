-- Finished Goods & Batch Genealogy V1, Slice 4.
-- Finished-product inspection, immutable disposition, and controlled release.

alter table public.finished_goods_quarantines
  drop constraint finished_goods_quarantines_released_quantity_check,
  drop constraint finished_goods_quarantines_rejected_quantity_check,
  drop constraint finished_goods_quarantines_held_quantity_check,
  drop constraint finished_goods_quarantines_remaining_quantity_check,
  drop constraint finished_goods_quarantines_revision_check,
  drop constraint finished_goods_quarantines_quarantine_status_check;
alter table public.finished_goods_quarantines
  add constraint finished_goods_quarantines_released_quantity_check check(released_quantity>=0),
  add constraint finished_goods_quarantines_rejected_quantity_check check(rejected_quantity>=0),
  add constraint finished_goods_quarantines_held_quantity_check check(held_quantity>=0),
  add constraint finished_goods_quarantines_remaining_quantity_check check(remaining_quantity>=0),
  add constraint finished_goods_quarantines_revision_check check(revision>0),
  add constraint finished_goods_quarantines_quarantine_status_check
    check(quarantine_status in('inspection_required','quarantined','partially_released','held','released','rejected')),
  add constraint finished_goods_quarantines_quantity_equation_check
    check(abs(quantity-released_quantity-rejected_quantity-remaining_quantity)<=0.0001),
  add constraint finished_goods_quarantines_hold_balance_check check(held_quantity<=remaining_quantity);

alter table public.finished_goods_lots
  drop constraint finished_goods_lots_lifecycle_status_check,
  drop constraint finished_goods_lots_quarantine_status_check;
alter table public.finished_goods_lots
  add constraint finished_goods_lots_lifecycle_status_check
    check(lifecycle_status in('quarantined','inspection_required','partially_released','held','released','rejected')),
  add constraint finished_goods_lots_quarantine_status_check
    check(quarantine_status in('quarantined','inspection_required','partially_released','held','released','rejected'));

drop trigger finished_goods_quarantines_append_only on public.finished_goods_quarantines;
drop trigger finished_goods_lots_append_only on public.finished_goods_lots;

create function public.kf_finished_goods_quality_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if current_setting('koalafrog.finished_goods_quality_mutation',true)<>'allowed' then
    raise exception 'FINISHED_GOODS_HISTORY_IMMUTABLE';
  end if;
  if tg_table_name='finished_goods_quarantines' then
    if new.id<>old.id or new.workspace_id<>old.workspace_id or new.owner_id<>old.owner_id or
      new.finished_goods_lot_id<>old.finished_goods_lot_id or new.packaging_run_id<>old.packaging_run_id or
      new.quantity<>old.quantity or new.unit<>old.unit or new.quarantine_reason<>old.quarantine_reason or
      new.location<>old.location or new.quarantine_policy_version<>old.quarantine_policy_version or
      new.entered_by<>old.entered_by or new.entered_at<>old.entered_at or new.provenance<>old.provenance
    then raise exception 'FINISHED_GOODS_QUARANTINE_IDENTITY_IMMUTABLE'; end if;
  elsif tg_table_name='finished_goods_lots' then
    if new.id<>old.id or new.workspace_id<>old.workspace_id or new.owner_id<>old.owner_id or
      new.packaging_run_id<>old.packaging_run_id or new.production_output_id<>old.production_output_id or
      new.production_run_id<>old.production_run_id or new.formula_version_id<>old.formula_version_id or
      new.product_id<>old.product_id or new.packaging_specification_version_id<>old.packaging_specification_version_id or
      new.internal_lot_code<>old.internal_lot_code or new.consumer_batch_code<>old.consumer_batch_code or
      new.quantity<>old.quantity or new.unit<>old.unit or new.manufacturing_date<>old.manufacturing_date or
      new.expiry_date is distinct from old.expiry_date or new.product_snapshot<>old.product_snapshot or
      new.formula_snapshot<>old.formula_snapshot or new.packaging_snapshot<>old.packaging_snapshot or
      new.label_snapshot<>old.label_snapshot or new.cost_snapshot<>old.cost_snapshot or
      new.genealogy_snapshot<>old.genealogy_snapshot
    then raise exception 'FINISHED_GOODS_LOT_IDENTITY_IMMUTABLE'; end if;
  end if;
  return new;
end $$;
create trigger finished_goods_quarantines_quality_guard before update or delete on public.finished_goods_quarantines
  for each row execute function public.kf_finished_goods_quality_guard();
create trigger finished_goods_lots_quality_guard before update or delete on public.finished_goods_lots
  for each row execute function public.kf_finished_goods_quality_guard();

create table public.finished_goods_inspections(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  finished_goods_lot_id uuid not null,
  quarantine_id uuid not null,
  inspection_plan_version text not null default '1.0.0',
  inspection_category text not null,
  requirement_code text not null,
  requirement_snapshot jsonb not null,
  result_status text not null check(result_status in('not_tested','pass','fail','hold','not_applicable','inconclusive')),
  measured_value numeric,
  unit text,
  lower_bound numeric,
  upper_bound numeric,
  textual_observation text not null default '',
  evidence jsonb not null default '[]'::jsonb check(jsonb_typeof(evidence)='array'),
  equipment_reference text,
  method_reference text,
  sample_quantity numeric check(sample_quantity is null or sample_quantity>0),
  inspected_by uuid not null,
  inspected_at timestamptz not null,
  supersedes_inspection_id uuid,
  revision integer not null check(revision>0),
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,idempotency_key),
  unique(workspace_id,finished_goods_lot_id,requirement_code,revision),
  foreign key(workspace_id,finished_goods_lot_id) references public.finished_goods_lots(workspace_id,id),
  foreign key(workspace_id,quarantine_id) references public.finished_goods_quarantines(workspace_id,id),
  foreign key(supersedes_inspection_id) references public.finished_goods_inspections(id)
);

create table public.finished_goods_deviations(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  finished_goods_lot_id uuid not null,
  quarantine_id uuid not null,
  inspection_id uuid,
  packaging_run_id uuid not null,
  production_run_id text not null,
  category text not null,
  severity text not null check(severity in('non_blocking','blocking','critical')),
  affected_quantity numeric not null check(affected_quantity>0),
  unit text not null,
  description text not null check(length(trim(description))>0),
  evidence jsonb not null default '[]'::jsonb check(jsonb_typeof(evidence)='array'),
  status text not null check(status in('open','under_review','resolved','accepted','rejected','cancelled')),
  disposition_impact text not null,
  investigation text not null default '',
  resolution text,
  approval jsonb,
  opened_by uuid not null,
  opened_at timestamptz not null,
  resolved_by uuid,
  resolved_at timestamptz,
  supersedes_deviation_id uuid,
  revision integer not null check(revision>0),
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,idempotency_key),
  foreign key(workspace_id,finished_goods_lot_id) references public.finished_goods_lots(workspace_id,id),
  foreign key(workspace_id,quarantine_id) references public.finished_goods_quarantines(workspace_id,id),
  foreign key(inspection_id) references public.finished_goods_inspections(id),
  foreign key(supersedes_deviation_id) references public.finished_goods_deviations(id)
);

create table public.finished_goods_disposition_reviews(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  finished_goods_lot_id uuid not null,
  quarantine_id uuid not null,
  review_sequence integer not null check(review_sequence>0),
  decision text not null check(decision in('hold','reject','release')),
  quantity numeric not null check(quantity>0),
  unit text not null,
  normalized_quantity numeric not null check(normalized_quantity>0),
  policy_version text not null default '1.0.0',
  inspection_summary_snapshot jsonb not null,
  blocker_snapshot jsonb not null,
  deviation_snapshot jsonb not null,
  evidence jsonb not null default '[]'::jsonb check(jsonb_typeof(evidence)='array'),
  reason text not null check(length(trim(reason))>0),
  reviewed_by uuid not null,
  reviewed_at timestamptz not null,
  source_quarantine_revision bigint not null,
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  released_inventory_lot_id uuid,
  opening_movement_id uuid,
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,idempotency_key),
  unique(workspace_id,finished_goods_lot_id,review_sequence),
  foreign key(workspace_id,finished_goods_lot_id) references public.finished_goods_lots(workspace_id,id),
  foreign key(workspace_id,quarantine_id) references public.finished_goods_quarantines(workspace_id,id)
);

create table public.released_finished_goods_inventory_lots(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  finished_goods_lot_id uuid not null,
  quarantine_id uuid not null,
  release_review_id uuid not null,
  packaging_run_id uuid not null,
  production_output_id uuid not null,
  production_run_id text not null,
  product_id text not null,
  formula_version_id text not null,
  packaging_specification_version_id text not null,
  consumer_batch_code text not null,
  internal_lot_code text not null,
  product_snapshot jsonb not null,
  quantity_released numeric not null check(quantity_released>0),
  unit text not null,
  normalized_quantity numeric not null check(normalized_quantity>0),
  manufacturing_date date not null,
  expiry_date date not null,
  period_after_opening_value integer,
  period_after_opening_unit text,
  status text not null default 'active' check(status='active'),
  location text not null,
  unit_cost numeric,
  total_cost numeric,
  currency text,
  cost_confidence text not null check(cost_confidence in('complete','provisional','unknown')),
  cost_snapshot jsonb not null,
  release_policy_version text not null default '1.0.0',
  released_by uuid not null,
  released_at timestamptz not null,
  revision bigint not null default 1 check(revision=1),
  provenance jsonb not null,
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,release_review_id),
  foreign key(workspace_id,finished_goods_lot_id) references public.finished_goods_lots(workspace_id,id),
  foreign key(workspace_id,quarantine_id) references public.finished_goods_quarantines(workspace_id,id),
  foreign key(workspace_id,release_review_id) references public.finished_goods_disposition_reviews(workspace_id,id)
);

create table public.finished_goods_inventory_movements(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  released_inventory_lot_id uuid not null,
  finished_goods_lot_id uuid not null,
  release_review_id uuid not null,
  movement_type text not null check(movement_type in('release_receipt','adjustment','sample','shipment','return','destruction')),
  quantity numeric not null check(quantity<>0),
  unit text not null,
  normalized_quantity numeric not null check(normalized_quantity<>0),
  unit_cost numeric,
  total_cost numeric,
  currency text,
  actor_id uuid not null,
  occurred_at timestamptz not null,
  idempotency_key uuid not null,
  event_key text not null,
  provenance jsonb not null,
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,idempotency_key),
  unique(workspace_id,event_key),
  foreign key(workspace_id,released_inventory_lot_id) references public.released_finished_goods_inventory_lots(workspace_id,id),
  foreign key(workspace_id,finished_goods_lot_id) references public.finished_goods_lots(workspace_id,id),
  foreign key(workspace_id,release_review_id) references public.finished_goods_disposition_reviews(workspace_id,id)
);

alter table public.finished_goods_disposition_reviews
  add foreign key(workspace_id,released_inventory_lot_id) references public.released_finished_goods_inventory_lots(workspace_id,id) deferrable initially deferred,
  add foreign key(workspace_id,opening_movement_id) references public.finished_goods_inventory_movements(workspace_id,id) deferrable initially deferred;

create table public.finished_goods_quality_events(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  finished_goods_lot_id uuid not null,
  quarantine_id uuid not null,
  inspection_id uuid,
  deviation_id uuid,
  disposition_review_id uuid,
  released_inventory_lot_id uuid,
  movement_id uuid,
  event_type text not null check(event_type in(
    'finished_goods_inspection_recorded','finished_goods_inspection_superseded',
    'finished_goods_deviation_opened','finished_goods_deviation_resolved',
    'finished_goods_disposition_recorded','finished_goods_hold_recorded',
    'finished_goods_rejection_recorded','finished_goods_release_recorded',
    'finished_goods_inventory_lot_created','finished_goods_opening_movement_created'
  )),
  decision text,
  quantity numeric,
  unit text,
  actor_id uuid not null,
  occurred_at timestamptz not null,
  policy_version text not null,
  revision bigint not null,
  event_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique(workspace_id,id),
  unique(workspace_id,event_key),
  foreign key(workspace_id,finished_goods_lot_id) references public.finished_goods_lots(workspace_id,id),
  foreign key(workspace_id,quarantine_id) references public.finished_goods_quarantines(workspace_id,id)
);

create index finished_goods_inspections_lot_effective_idx on public.finished_goods_inspections(workspace_id,finished_goods_lot_id,requirement_code,revision desc);
create index finished_goods_deviations_lot_status_idx on public.finished_goods_deviations(workspace_id,finished_goods_lot_id,status,severity);
create index finished_goods_reviews_lot_sequence_idx on public.finished_goods_disposition_reviews(workspace_id,finished_goods_lot_id,review_sequence);
create index released_finished_goods_source_idx on public.released_finished_goods_inventory_lots(workspace_id,finished_goods_lot_id,released_at);
create index released_finished_goods_batch_idx on public.released_finished_goods_inventory_lots(workspace_id,consumer_batch_code);
create index finished_goods_inventory_movement_lot_idx on public.finished_goods_inventory_movements(workspace_id,released_inventory_lot_id,occurred_at,id);
create index finished_goods_quality_events_lot_idx on public.finished_goods_quality_events(workspace_id,finished_goods_lot_id,occurred_at,id);

do $$ declare t text; begin
  foreach t in array array['finished_goods_inspections','finished_goods_deviations','finished_goods_disposition_reviews',
    'released_finished_goods_inventory_lots','finished_goods_inventory_movements','finished_goods_quality_events']
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy owner_read on public.%I for select to authenticated using(owner_id=(select auth.uid()))',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select on public.%I to authenticated,service_role',t);
    execute format('grant select,insert,update,delete on public.%I to service_role',t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.kf_finished_goods_append_only()',t||'_append_only',t);
  end loop;
end $$;

create function public.kf_finished_goods_inspection_plan_v1(target_workspace_id uuid,target_finished_goods_lot_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare lot public.finished_goods_lots; requirements jsonb;
begin
  select * into lot from public.finished_goods_lots where workspace_id=target_workspace_id and id=target_finished_goods_lot_id;
  if not found then raise exception 'FINISHED_GOODS_LOT_NOT_FOUND'; end if;
  requirements:=jsonb_build_array(
    jsonb_build_object('category','identity','requirementCode','identity_verification','requirementState','required','evidenceRequired',false,'specification',jsonb_build_object('productId',lot.product_id,'formulaVersionId',lot.formula_version_id)),
    jsonb_build_object('category','identity','requirementCode','batch_code_verification','requirementState','required','evidenceRequired',false,'specification',jsonb_build_object('consumerBatchCode',lot.consumer_batch_code)),
    jsonb_build_object('category','packaging','requirementCode','packaging_specification_verification','requirementState','required','evidenceRequired',false,'specification',lot.packaging_snapshot),
    jsonb_build_object('category','label','requirementCode','label_verification','requirementState','required','evidenceRequired',true,'specification',lot.label_snapshot),
    jsonb_build_object('category','fill','requirementCode','nominal_content_verification','requirementState','required','evidenceRequired',true,'specification',jsonb_build_object('nominalFillQuantity',lot.nominal_fill_quantity,'unit',lot.nominal_fill_unit)),
    jsonb_build_object('category','packaging','requirementCode','packaging_integrity','requirementState','required','evidenceRequired',true,'specification',lot.packaging_snapshot),
    jsonb_build_object('category','sensory','requirementCode','appearance','requirementState','required','evidenceRequired',false,'specification',coalesce(lot.product_snapshot->'appearance','"Unknown"'::jsonb)),
    jsonb_build_object('category','genealogy','requirementCode','genealogy_completeness','requirementState','required','evidenceRequired',false,'specification',lot.genealogy_snapshot),
    jsonb_build_object('category','expiry','requirementCode','expiry_validation','requirementState','required','evidenceRequired',false,'specification',jsonb_build_object('manufacturingDate',lot.manufacturing_date,'expiryDate',lot.expiry_date)),
    jsonb_build_object('category','release','requirementCode','final_release_evidence','requirementState','required','evidenceRequired',true,'specification',jsonb_build_object('policyVersion','1.0.0')),
    jsonb_build_object('category','microbiology','requirementCode','microbiology_evidence','requirementState','unknown_non_blocking','evidenceRequired',false,'specification','Unknown')
  );
  return jsonb_build_object('finishedGoodsLotId',lot.id,'quarantineId',(select id from public.finished_goods_quarantines where workspace_id=target_workspace_id and finished_goods_lot_id=lot.id),
    'policyVersion','1.0.0','requirements',requirements,'derivedFromSnapshots',true);
end $$;

create function public.get_finished_goods_inspection_plan_v1(target_finished_goods_lot_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select id into wid from public.workspaces where owner_id=uid;
  if wid is null then raise exception 'ACTIVE_WORKSPACE_REQUIRED'; end if;
  return public.kf_finished_goods_inspection_plan_v1(wid,target_finished_goods_lot_id);
end $$;

create function public.record_finished_goods_inspection_v1(
  target_finished_goods_lot_id uuid,expected_quarantine_revision bigint,candidate_requirement_code text,
  candidate_result_status text,candidate_measured_value numeric,candidate_unit text,candidate_textual_observation text,
  candidate_evidence jsonb,candidate_equipment_reference text,candidate_method_reference text,
  candidate_sample_quantity numeric,candidate_inspected_at timestamptz,candidate_supersedes_inspection_id uuid,
  candidate_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid; q public.finished_goods_quarantines; plan jsonb; requirement jsonb;
  existing public.finished_goods_inspections; prior public.finished_goods_inspections; fp text; new_id uuid:=gen_random_uuid(); rev integer;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select id into wid from public.workspaces where owner_id=uid;
  if wid is null then raise exception 'ACTIVE_WORKSPACE_REQUIRED'; end if;
  fp:=md5(jsonb_build_object('lot',target_finished_goods_lot_id,'requirement',candidate_requirement_code,'status',candidate_result_status,
    'value',candidate_measured_value,'unit',candidate_unit,'observation',candidate_textual_observation,'evidence',candidate_evidence,
    'equipment',candidate_equipment_reference,'method',candidate_method_reference,'sample',candidate_sample_quantity,'supersedes',candidate_supersedes_inspection_id)::text);
  select * into existing from public.finished_goods_inspections where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then if existing.payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return jsonb_build_object('inspection',to_jsonb(existing),'retry',true); end if;
  select * into q from public.finished_goods_quarantines where workspace_id=wid and finished_goods_lot_id=target_finished_goods_lot_id for update;
  if not found then raise exception 'FINISHED_GOODS_QUARANTINE_NOT_FOUND'; end if;
  if q.revision<>expected_quarantine_revision then raise exception 'STALE_QUARANTINE_REVISION'; end if;
  plan:=public.kf_finished_goods_inspection_plan_v1(wid,target_finished_goods_lot_id);
  select value into requirement from jsonb_array_elements(plan->'requirements') where value->>'requirementCode'=candidate_requirement_code;
  if requirement is null then raise exception 'INSPECTION_REQUIREMENT_NOT_FOUND'; end if;
  if candidate_result_status not in('not_tested','pass','fail','hold','not_applicable','inconclusive') then raise exception 'INVALID_INSPECTION_STATUS'; end if;
  select * into prior from public.finished_goods_inspections where workspace_id=wid and finished_goods_lot_id=target_finished_goods_lot_id
    and requirement_code=candidate_requirement_code order by revision desc limit 1;
  if prior.id is not null and candidate_supersedes_inspection_id is distinct from prior.id then raise exception 'INSPECTION_SUPERSESSION_REQUIRED'; end if;
  if prior.id is null and candidate_supersedes_inspection_id is not null then raise exception 'INSPECTION_SUPERSESSION_INVALID'; end if;
  rev:=coalesce(prior.revision,0)+1;
  insert into public.finished_goods_inspections(id,workspace_id,owner_id,finished_goods_lot_id,quarantine_id,inspection_category,
    requirement_code,requirement_snapshot,result_status,measured_value,unit,textual_observation,evidence,equipment_reference,
    method_reference,sample_quantity,inspected_by,inspected_at,supersedes_inspection_id,revision,idempotency_key,payload_fingerprint)
  values(new_id,wid,uid,target_finished_goods_lot_id,q.id,requirement->>'category',candidate_requirement_code,requirement,
    candidate_result_status,candidate_measured_value,candidate_unit,coalesce(candidate_textual_observation,''),coalesce(candidate_evidence,'[]'::jsonb),
    nullif(candidate_equipment_reference,''),nullif(candidate_method_reference,''),candidate_sample_quantity,uid,candidate_inspected_at,
    candidate_supersedes_inspection_id,rev,candidate_idempotency_key,fp);
  if prior.id is not null then
    insert into public.finished_goods_quality_events(workspace_id,owner_id,finished_goods_lot_id,quarantine_id,inspection_id,event_type,actor_id,occurred_at,policy_version,revision,event_key,metadata)
    values(wid,uid,target_finished_goods_lot_id,q.id,new_id,'finished_goods_inspection_superseded',uid,candidate_inspected_at,'1.0.0',rev,'inspection-superseded:'||candidate_idempotency_key,jsonb_build_object('supersededInspectionId',prior.id));
  end if;
  insert into public.finished_goods_quality_events(workspace_id,owner_id,finished_goods_lot_id,quarantine_id,inspection_id,event_type,actor_id,occurred_at,policy_version,revision,event_key,metadata)
  values(wid,uid,target_finished_goods_lot_id,q.id,new_id,'finished_goods_inspection_recorded',uid,candidate_inspected_at,'1.0.0',rev,'inspection-recorded:'||candidate_idempotency_key,jsonb_build_object('requirementCode',candidate_requirement_code,'resultStatus',candidate_result_status));
  return jsonb_build_object('inspection',(select to_jsonb(i) from public.finished_goods_inspections i where i.id=new_id),'retry',false);
end $$;

create function public.open_finished_goods_deviation_v1(
  target_finished_goods_lot_id uuid,expected_quarantine_revision bigint,candidate_inspection_id uuid,
  candidate_category text,candidate_severity text,candidate_affected_quantity numeric,candidate_unit text,
  candidate_description text,candidate_evidence jsonb,candidate_disposition_impact text,candidate_opened_at timestamptz,
  candidate_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid; q public.finished_goods_quarantines; lot public.finished_goods_lots;
  existing public.finished_goods_deviations; fp text; new_id uuid:=gen_random_uuid();
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select id into wid from public.workspaces where owner_id=uid;
  fp:=md5(jsonb_build_object('lot',target_finished_goods_lot_id,'inspection',candidate_inspection_id,'category',candidate_category,
    'severity',candidate_severity,'quantity',candidate_affected_quantity,'unit',candidate_unit,'description',candidate_description,
    'evidence',candidate_evidence,'impact',candidate_disposition_impact)::text);
  select * into existing from public.finished_goods_deviations where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then if existing.payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return jsonb_build_object('deviation',to_jsonb(existing),'retry',true); end if;
  select * into q from public.finished_goods_quarantines where workspace_id=wid and finished_goods_lot_id=target_finished_goods_lot_id for update;
  select * into lot from public.finished_goods_lots where workspace_id=wid and id=target_finished_goods_lot_id;
  if q.id is null then raise exception 'FINISHED_GOODS_QUARANTINE_NOT_FOUND'; end if;
  if q.revision<>expected_quarantine_revision then raise exception 'STALE_QUARANTINE_REVISION'; end if;
  if candidate_severity not in('non_blocking','blocking','critical') then raise exception 'INVALID_DEVIATION_SEVERITY'; end if;
  if candidate_affected_quantity<=0 or candidate_affected_quantity>q.remaining_quantity then raise exception 'INVALID_DEVIATION_QUANTITY'; end if;
  insert into public.finished_goods_deviations(id,workspace_id,owner_id,finished_goods_lot_id,quarantine_id,inspection_id,packaging_run_id,production_run_id,
    category,severity,affected_quantity,unit,description,evidence,status,disposition_impact,opened_by,opened_at,revision,idempotency_key,payload_fingerprint)
  values(new_id,wid,uid,lot.id,q.id,candidate_inspection_id,lot.packaging_run_id,lot.production_run_id,candidate_category,candidate_severity,
    candidate_affected_quantity,candidate_unit,candidate_description,coalesce(candidate_evidence,'[]'::jsonb),'open',candidate_disposition_impact,
    uid,candidate_opened_at,1,candidate_idempotency_key,fp);
  insert into public.finished_goods_quality_events(workspace_id,owner_id,finished_goods_lot_id,quarantine_id,deviation_id,event_type,quantity,unit,actor_id,occurred_at,policy_version,revision,event_key,metadata)
  values(wid,uid,lot.id,q.id,new_id,'finished_goods_deviation_opened',candidate_affected_quantity,candidate_unit,uid,candidate_opened_at,'1.0.0',1,'deviation-opened:'||candidate_idempotency_key,jsonb_build_object('severity',candidate_severity));
  return jsonb_build_object('deviation',(select to_jsonb(d) from public.finished_goods_deviations d where d.id=new_id),'retry',false);
end $$;

create function public.resolve_finished_goods_deviation_v1(
  target_deviation_id uuid,candidate_resolution text,candidate_evidence jsonb,candidate_approval jsonb,
  candidate_resolved_at timestamptz,candidate_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid; prior public.finished_goods_deviations; existing public.finished_goods_deviations;
  fp text; new_id uuid:=gen_random_uuid();
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select id into wid from public.workspaces where owner_id=uid;
  fp:=md5(jsonb_build_object('deviation',target_deviation_id,'resolution',candidate_resolution,'evidence',candidate_evidence,'approval',candidate_approval)::text);
  select * into existing from public.finished_goods_deviations where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then if existing.payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return jsonb_build_object('deviation',to_jsonb(existing),'retry',true); end if;
  select * into prior from public.finished_goods_deviations where workspace_id=wid and id=target_deviation_id;
  if not found or prior.status not in('open','under_review') then raise exception 'DEVIATION_NOT_RESOLVABLE'; end if;
  if coalesce(trim(candidate_resolution),'')='' or jsonb_array_length(coalesce(candidate_evidence,'[]'::jsonb))=0 or candidate_approval is null then raise exception 'DEVIATION_RESOLUTION_EVIDENCE_REQUIRED'; end if;
  insert into public.finished_goods_deviations(id,workspace_id,owner_id,finished_goods_lot_id,quarantine_id,inspection_id,packaging_run_id,production_run_id,
    category,severity,affected_quantity,unit,description,evidence,status,disposition_impact,investigation,resolution,approval,opened_by,opened_at,
    resolved_by,resolved_at,supersedes_deviation_id,revision,idempotency_key,payload_fingerprint)
  values(new_id,wid,uid,prior.finished_goods_lot_id,prior.quarantine_id,prior.inspection_id,prior.packaging_run_id,prior.production_run_id,
    prior.category,prior.severity,prior.affected_quantity,prior.unit,prior.description,coalesce(candidate_evidence,'[]'::jsonb),'resolved',
    prior.disposition_impact,prior.investigation,candidate_resolution,candidate_approval,prior.opened_by,prior.opened_at,uid,candidate_resolved_at,
    prior.id,prior.revision+1,candidate_idempotency_key,fp);
  insert into public.finished_goods_quality_events(workspace_id,owner_id,finished_goods_lot_id,quarantine_id,deviation_id,event_type,quantity,unit,actor_id,occurred_at,policy_version,revision,event_key,metadata)
  values(wid,uid,prior.finished_goods_lot_id,prior.quarantine_id,new_id,'finished_goods_deviation_resolved',prior.affected_quantity,prior.unit,uid,candidate_resolved_at,'1.0.0',prior.revision+1,'deviation-resolved:'||candidate_idempotency_key,jsonb_build_object('supersededDeviationId',prior.id));
  return jsonb_build_object('deviation',(select to_jsonb(d) from public.finished_goods_deviations d where d.id=new_id),'retry',false);
end $$;

create function public.kf_finished_goods_release_readiness_v1(target_workspace_id uuid,target_finished_goods_lot_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare lot public.finished_goods_lots; q public.finished_goods_quarantines; plan jsonb; req jsonb; effective public.finished_goods_inspections;
  blockers jsonb:='[]'::jsonb; mandatory integer:=0; passed integer:=0; failed integer:=0; held integer:=0; inconclusive integer:=0; not_tested integer:=0; missing_evidence integer:=0;
begin
  select * into lot from public.finished_goods_lots where workspace_id=target_workspace_id and id=target_finished_goods_lot_id;
  select * into q from public.finished_goods_quarantines where workspace_id=target_workspace_id and finished_goods_lot_id=target_finished_goods_lot_id;
  if lot.id is null or q.id is null then raise exception 'FINISHED_GOODS_LOT_NOT_FOUND'; end if;
  plan:=public.kf_finished_goods_inspection_plan_v1(target_workspace_id,target_finished_goods_lot_id);
  for req in select value from jsonb_array_elements(plan->'requirements') where value->>'requirementState'='required' loop
    mandatory:=mandatory+1;
    select * into effective from public.finished_goods_inspections where workspace_id=target_workspace_id and finished_goods_lot_id=lot.id
      and requirement_code=req->>'requirementCode' order by revision desc limit 1;
    if effective.id is null or effective.result_status='not_tested' then
      not_tested:=not_tested+1; blockers:=blockers||jsonb_build_array(jsonb_build_object('blockerCode','mandatory_inspection_missing','category','inspection','severity','blocking','blocksRelease',true,'requirementCode',req->>'requirementCode','humanMessage','Required inspection has not passed.','recommendedAction','Record the required inspection.'));
    elsif effective.result_status='pass' then
      passed:=passed+1;
      if coalesce((req->>'evidenceRequired')::boolean,false) and jsonb_array_length(effective.evidence)=0 then
        missing_evidence:=missing_evidence+1; blockers:=blockers||jsonb_build_array(jsonb_build_object('blockerCode','required_evidence_missing','category','evidence','severity','blocking','blocksRelease',true,'inspectionId',effective.id,'requirementCode',effective.requirement_code,'humanMessage','Required inspection evidence is missing.','recommendedAction','Supersede the inspection with evidence.'));
      end if;
    elsif effective.result_status='fail' then failed:=failed+1; blockers:=blockers||jsonb_build_array(jsonb_build_object('blockerCode','inspection_failed','category','inspection','severity','blocking','blocksRelease',true,'inspectionId',effective.id,'requirementCode',effective.requirement_code,'humanMessage','A mandatory inspection failed.','recommendedAction','Investigate and supersede only with a new supported result.'));
    elsif effective.result_status='hold' then held:=held+1; blockers:=blockers||jsonb_build_array(jsonb_build_object('blockerCode','inspection_on_hold','category','inspection','severity','blocking','blocksRelease',true,'inspectionId',effective.id,'requirementCode',effective.requirement_code,'humanMessage','A mandatory inspection is on hold.','recommendedAction','Resolve the hold through a new inspection.'));
    else inconclusive:=inconclusive+1; blockers:=blockers||jsonb_build_array(jsonb_build_object('blockerCode','inspection_inconclusive','category','inspection','severity','blocking','blocksRelease',true,'inspectionId',effective.id,'requirementCode',effective.requirement_code,'humanMessage','A mandatory inspection is inconclusive or not applicable.','recommendedAction','Record a conclusive passing result.'));
    end if;
  end loop;
  if lot.expiry_date is null or lot.expiry_date<current_date then blockers:=blockers||jsonb_build_array(jsonb_build_object('blockerCode','expiry_invalid','category','expiry','severity','blocking','blocksRelease',true,'humanMessage','A future expiry date is required.','recommendedAction','Correct the lot through the controlled upstream process.')); end if;
  if lot.genealogy_snapshot is null or lot.genealogy_snapshot='{}'::jsonb then blockers:=blockers||jsonb_build_array(jsonb_build_object('blockerCode','genealogy_incomplete','category','genealogy','severity','blocking','blocksRelease',true,'humanMessage','Genealogy snapshot is incomplete.','recommendedAction','Restore upstream genealogy before release.')); end if;
  if exists(select 1 from public.finished_goods_deviations d where d.workspace_id=target_workspace_id and d.finished_goods_lot_id=lot.id and d.severity in('blocking','critical') and d.status in('open','under_review') and not exists(select 1 from public.finished_goods_deviations r where r.workspace_id=d.workspace_id and r.supersedes_deviation_id=d.id and r.status in('resolved','accepted'))) then
    blockers:=blockers||jsonb_build_array(jsonb_build_object('blockerCode','open_blocking_deviation','category','deviation','severity','blocking','blocksRelease',true,'humanMessage','A blocking deviation remains open.','recommendedAction','Resolve it with evidence and approval.'));
  end if;
  if q.remaining_quantity<=0 then blockers:=blockers||jsonb_build_array(jsonb_build_object('blockerCode','already_fully_disposed','category','quantity','severity','blocking','blocksRelease',true,'humanMessage','No quarantined quantity remains.','recommendedAction','Review disposition history.')); end if;
  return jsonb_build_object('finishedGoodsLotId',lot.id,'quarantineId',q.id,'policyVersion','1.0.0','lifecycleStatus',lot.lifecycle_status,
    'quarantineStatus',q.quarantine_status,'readyForRelease',jsonb_array_length(blockers)=0,'inspectionComplete',passed=mandatory,
    'evaluatedAt',now(),'originalQuantity',q.quantity,'releasedQuantity',q.released_quantity,'rejectedQuantity',q.rejected_quantity,
    'heldQuantity',q.held_quantity,'remainingQuarantinedQuantity',q.remaining_quantity,'undecidedQuantity',q.remaining_quantity-q.held_quantity,
    'mandatoryChecks',mandatory,'passedChecks',passed,'failedChecks',failed,'heldChecks',held,'inconclusiveChecks',inconclusive,
    'notTestedChecks',not_tested,'missingEvidenceCount',missing_evidence,
    'openDeviations',(select count(*) from public.finished_goods_deviations d where d.workspace_id=target_workspace_id and d.finished_goods_lot_id=lot.id and d.status in('open','under_review')),
    'blockingDeviations',(select count(*) from public.finished_goods_deviations d where d.workspace_id=target_workspace_id and d.finished_goods_lot_id=lot.id and d.severity in('blocking','critical') and d.status in('open','under_review')),
    'expiryState',case when lot.expiry_date is null then 'unknown' when lot.expiry_date<current_date then 'expired' else 'valid' end,
    'genealogyState',case when lot.genealogy_snapshot is null or lot.genealogy_snapshot='{}'::jsonb then 'incomplete' else 'complete' end,
    'labelVerificationState',coalesce((select result_status from public.finished_goods_inspections where workspace_id=target_workspace_id and finished_goods_lot_id=lot.id and requirement_code='label_verification' order by revision desc limit 1),'not_tested'),
    'specificationState',case when failed=0 and inconclusive=0 and not_tested=0 then 'passed' else 'incomplete' end,
    'costState',coalesce(lot.cost_snapshot->>'confidence','unknown'),'blockers',blockers,'quarantineRevision',q.revision);
end $$;

create function public.get_finished_goods_release_readiness_v1(target_finished_goods_lot_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select id into wid from public.workspaces where owner_id=uid;
  if wid is null then raise exception 'ACTIVE_WORKSPACE_REQUIRED'; end if;
  return public.kf_finished_goods_release_readiness_v1(wid,target_finished_goods_lot_id);
end $$;

create function public.record_finished_goods_disposition_v1(
  target_finished_goods_lot_id uuid,expected_quarantine_revision bigint,candidate_decision text,candidate_quantity numeric,
  candidate_unit text,candidate_reason text,candidate_evidence jsonb,candidate_location text,candidate_acknowledged boolean,
  candidate_reviewed_at timestamptz,candidate_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid; lot public.finished_goods_lots; q public.finished_goods_quarantines;
  existing public.finished_goods_disposition_reviews; readiness jsonb; fp text; review_id uuid:=gen_random_uuid();
  inventory_id uuid:=gen_random_uuid(); movement_id uuid:=gen_random_uuid(); seq integer; next_released numeric; next_rejected numeric;
  next_held numeric; next_remaining numeric; next_status text; unit_cost_value numeric; total_cost_value numeric; confidence text; currency_value text;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select id into wid from public.workspaces where owner_id=uid;
  if wid is null then raise exception 'ACTIVE_WORKSPACE_REQUIRED'; end if;
  fp:=md5(jsonb_build_object('lot',target_finished_goods_lot_id,'decision',candidate_decision,'quantity',candidate_quantity,'unit',candidate_unit,
    'reason',candidate_reason,'evidence',candidate_evidence,'location',candidate_location,'acknowledged',candidate_acknowledged)::text);
  select * into existing from public.finished_goods_disposition_reviews where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then
    if existing.payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('review',to_jsonb(existing),'inventoryLot',(select to_jsonb(i) from public.released_finished_goods_inventory_lots i where i.workspace_id=wid and i.id=existing.released_inventory_lot_id),
      'openingMovement',(select to_jsonb(m) from public.finished_goods_inventory_movements m where m.workspace_id=wid and m.id=existing.opening_movement_id),
      'retry',true,'readiness',public.kf_finished_goods_release_readiness_v1(wid,target_finished_goods_lot_id));
  end if;
  select * into lot from public.finished_goods_lots where workspace_id=wid and id=target_finished_goods_lot_id for update;
  select * into q from public.finished_goods_quarantines where workspace_id=wid and finished_goods_lot_id=target_finished_goods_lot_id for update;
  if lot.id is null or q.id is null then raise exception 'FINISHED_GOODS_QUARANTINE_NOT_FOUND'; end if;
  if q.revision<>expected_quarantine_revision then raise exception 'STALE_QUARANTINE_REVISION'; end if;
  if candidate_decision not in('hold','reject','release') then raise exception 'INVALID_DISPOSITION_DECISION'; end if;
  if candidate_quantity<=0 or candidate_quantity>q.remaining_quantity then raise exception 'DISPOSITION_QUANTITY_EXCEEDS_QUARANTINE'; end if;
  if candidate_unit<>q.unit then raise exception 'DISPOSITION_UNIT_MISMATCH'; end if;
  if coalesce(trim(candidate_reason),'')='' or jsonb_array_length(coalesce(candidate_evidence,'[]'::jsonb))=0 then raise exception 'DISPOSITION_EVIDENCE_REQUIRED'; end if;
  if candidate_decision in('release','reject') and not candidate_acknowledged then raise exception 'DISPOSITION_ACKNOWLEDGEMENT_REQUIRED'; end if;
  if candidate_decision='hold' and candidate_quantity>q.remaining_quantity-q.held_quantity then raise exception 'HOLD_QUANTITY_EXCEEDS_UNDECIDED'; end if;
  readiness:=public.kf_finished_goods_release_readiness_v1(wid,lot.id);
  if candidate_decision='release' and not (readiness->>'readyForRelease')::boolean then raise exception 'FINISHED_GOODS_RELEASE_BLOCKED'; end if;
  if candidate_decision='release' and lot.expiry_date is null then raise exception 'EXPIRY_INVALID'; end if;
  seq:=1+(select count(*) from public.finished_goods_disposition_reviews where workspace_id=wid and finished_goods_lot_id=lot.id);
  next_released:=q.released_quantity+case when candidate_decision='release' then candidate_quantity else 0 end;
  next_rejected:=q.rejected_quantity+case when candidate_decision='reject' then candidate_quantity else 0 end;
  next_remaining:=q.quantity-next_released-next_rejected;
  next_held:=case when candidate_decision='hold' then q.held_quantity+candidate_quantity
                  when candidate_decision in('release','reject') then greatest(q.held_quantity-candidate_quantity,0)
                  else q.held_quantity end;
  next_status:=case when next_remaining=0 and next_released=q.quantity then 'released'
                    when next_remaining=0 and next_rejected=q.quantity then 'rejected'
                    when next_remaining=0 then 'partially_released'
                    when next_held=next_remaining then 'held'
                    when next_released>0 then 'partially_released'
                    else 'inspection_required' end;
  insert into public.finished_goods_disposition_reviews(id,workspace_id,owner_id,finished_goods_lot_id,quarantine_id,review_sequence,
    decision,quantity,unit,normalized_quantity,inspection_summary_snapshot,blocker_snapshot,deviation_snapshot,evidence,reason,reviewed_by,
    reviewed_at,source_quarantine_revision,idempotency_key,payload_fingerprint,released_inventory_lot_id,opening_movement_id)
  values(review_id,wid,uid,lot.id,q.id,seq,candidate_decision,candidate_quantity,candidate_unit,candidate_quantity,readiness,readiness->'blockers',
    coalesce((select jsonb_agg(to_jsonb(d) order by d.opened_at,d.id) from public.finished_goods_deviations d where d.workspace_id=wid and d.finished_goods_lot_id=lot.id),'[]'::jsonb),
    candidate_evidence,candidate_reason,uid,candidate_reviewed_at,q.revision,candidate_idempotency_key,fp,
    case when candidate_decision='release' then inventory_id end,case when candidate_decision='release' then movement_id end);
  if candidate_decision='release' then
    unit_cost_value:=nullif(lot.cost_snapshot->>'unitCost','')::numeric;
    total_cost_value:=case when unit_cost_value is null then null else unit_cost_value*candidate_quantity end;
    confidence:=coalesce(lot.cost_snapshot->>'confidence','unknown');
    currency_value:=nullif(lot.cost_snapshot->>'currency','');
    insert into public.released_finished_goods_inventory_lots(id,workspace_id,owner_id,finished_goods_lot_id,quarantine_id,release_review_id,
      packaging_run_id,production_output_id,production_run_id,product_id,formula_version_id,packaging_specification_version_id,
      consumer_batch_code,internal_lot_code,product_snapshot,quantity_released,unit,normalized_quantity,manufacturing_date,expiry_date,
      period_after_opening_value,period_after_opening_unit,location,unit_cost,total_cost,currency,cost_confidence,cost_snapshot,released_by,released_at,provenance)
    values(inventory_id,wid,uid,lot.id,q.id,review_id,lot.packaging_run_id,lot.production_output_id,lot.production_run_id,lot.product_id,
      lot.formula_version_id,lot.packaging_specification_version_id,lot.consumer_batch_code,lot.internal_lot_code||'-R'||lpad(seq::text,2,'0'),
      lot.product_snapshot,candidate_quantity,candidate_unit,candidate_quantity,lot.manufacturing_date,lot.expiry_date,
      lot.period_after_opening_value,lot.period_after_opening_unit,coalesce(nullif(candidate_location,''),lot.location),unit_cost_value,total_cost_value,
      currency_value,case when confidence in('complete','provisional','unknown') then confidence else 'unknown' end,lot.cost_snapshot,uid,candidate_reviewed_at,
      lot.genealogy_snapshot||jsonb_build_object('releaseReviewId',review_id,'finishedGoodsLotId',lot.id));
    insert into public.finished_goods_inventory_movements(id,workspace_id,owner_id,released_inventory_lot_id,finished_goods_lot_id,release_review_id,
      movement_type,quantity,unit,normalized_quantity,unit_cost,total_cost,currency,actor_id,occurred_at,idempotency_key,event_key,provenance)
    values(movement_id,wid,uid,inventory_id,lot.id,review_id,'release_receipt',candidate_quantity,candidate_unit,candidate_quantity,
      unit_cost_value,total_cost_value,currency_value,uid,candidate_reviewed_at,candidate_idempotency_key,'finished-goods-opening:'||review_id,
      lot.genealogy_snapshot||jsonb_build_object('releaseReviewId',review_id,'inventoryLotId',inventory_id));
  end if;
  perform set_config('koalafrog.finished_goods_quality_mutation','allowed',true);
  update public.finished_goods_quarantines set released_quantity=next_released,rejected_quantity=next_rejected,held_quantity=next_held,
    remaining_quantity=next_remaining,current_review_state=candidate_decision,quarantine_status=next_status,revision=revision+1 where id=q.id;
  update public.finished_goods_lots set lifecycle_status=next_status,quarantine_status=next_status,revision=revision+1 where id=lot.id;
  insert into public.finished_goods_quality_events(workspace_id,owner_id,finished_goods_lot_id,quarantine_id,disposition_review_id,
    released_inventory_lot_id,movement_id,event_type,decision,quantity,unit,actor_id,occurred_at,policy_version,revision,event_key,metadata)
  values(wid,uid,lot.id,q.id,review_id,case when candidate_decision='release' then inventory_id end,case when candidate_decision='release' then movement_id end,
    'finished_goods_disposition_recorded',candidate_decision,candidate_quantity,candidate_unit,uid,candidate_reviewed_at,'1.0.0',q.revision+1,
    'disposition:'||candidate_idempotency_key,jsonb_build_object('remainingQuantity',next_remaining));
  insert into public.finished_goods_quality_events(workspace_id,owner_id,finished_goods_lot_id,quarantine_id,disposition_review_id,
    released_inventory_lot_id,movement_id,event_type,decision,quantity,unit,actor_id,occurred_at,policy_version,revision,event_key,metadata)
  values(wid,uid,lot.id,q.id,review_id,case when candidate_decision='release' then inventory_id end,case when candidate_decision='release' then movement_id end,
    case candidate_decision when 'hold' then 'finished_goods_hold_recorded' when 'reject' then 'finished_goods_rejection_recorded' else 'finished_goods_release_recorded' end,
    candidate_decision,candidate_quantity,candidate_unit,uid,candidate_reviewed_at,'1.0.0',q.revision+1,
    candidate_decision||':'||candidate_idempotency_key,jsonb_build_object('remainingQuantity',next_remaining));
  if candidate_decision='release' then
    insert into public.finished_goods_quality_events(workspace_id,owner_id,finished_goods_lot_id,quarantine_id,disposition_review_id,released_inventory_lot_id,movement_id,event_type,decision,quantity,unit,actor_id,occurred_at,policy_version,revision,event_key,metadata)
    select wid,uid,lot.id,q.id,review_id,inventory_id,movement_id,event_type,'release',candidate_quantity,candidate_unit,uid,candidate_reviewed_at,'1.0.0',q.revision+1,event_type||':'||candidate_idempotency_key,'{}'::jsonb
    from unnest(array['finished_goods_inventory_lot_created','finished_goods_opening_movement_created']::text[]) event_type;
  end if;
  return jsonb_build_object('review',(select to_jsonb(r) from public.finished_goods_disposition_reviews r where r.id=review_id),
    'inventoryLot',(select to_jsonb(i) from public.released_finished_goods_inventory_lots i where i.id=inventory_id),
    'openingMovement',(select to_jsonb(m) from public.finished_goods_inventory_movements m where m.id=movement_id),
    'retry',false,'readiness',public.kf_finished_goods_release_readiness_v1(wid,lot.id));
end $$;

create function public.get_finished_goods_quality_workspace_v1(target_finished_goods_lot_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid; lot public.finished_goods_lots;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select id into wid from public.workspaces where owner_id=uid;
  select * into lot from public.finished_goods_lots where workspace_id=wid and id=target_finished_goods_lot_id;
  if not found then raise exception 'FINISHED_GOODS_LOT_NOT_FOUND'; end if;
  return jsonb_build_object('lot',to_jsonb(lot),
    'quarantine',(select to_jsonb(q) from public.finished_goods_quarantines q where q.workspace_id=wid and q.finished_goods_lot_id=lot.id),
    'inspectionPlan',public.kf_finished_goods_inspection_plan_v1(wid,lot.id),
    'inspections',coalesce((select jsonb_agg(to_jsonb(i) order by i.inspected_at,i.id) from public.finished_goods_inspections i where i.workspace_id=wid and i.finished_goods_lot_id=lot.id),'[]'::jsonb),
    'deviations',coalesce((select jsonb_agg(to_jsonb(d) order by d.opened_at,d.id) from public.finished_goods_deviations d where d.workspace_id=wid and d.finished_goods_lot_id=lot.id),'[]'::jsonb),
    'readiness',public.kf_finished_goods_release_readiness_v1(wid,lot.id),
    'dispositionReviews',coalesce((select jsonb_agg(to_jsonb(r) order by r.review_sequence) from public.finished_goods_disposition_reviews r where r.workspace_id=wid and r.finished_goods_lot_id=lot.id),'[]'::jsonb),
    'inventoryLots',coalesce((select jsonb_agg(to_jsonb(i) order by i.released_at,i.id) from public.released_finished_goods_inventory_lots i where i.workspace_id=wid and i.finished_goods_lot_id=lot.id),'[]'::jsonb),
    'openingMovements',coalesce((select jsonb_agg(to_jsonb(m) order by m.occurred_at,m.id) from public.finished_goods_inventory_movements m where m.workspace_id=wid and m.finished_goods_lot_id=lot.id),'[]'::jsonb),
    'qualityEvents',coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at,e.id) from public.finished_goods_quality_events e where e.workspace_id=wid and e.finished_goods_lot_id=lot.id),'[]'::jsonb),
    'genealogy',public.get_finished_goods_lot_genealogy_v1(lot.id));
end $$;

create function public.get_released_finished_goods_genealogy_v1(target_released_inventory_lot_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid; inventory_lot public.released_finished_goods_inventory_lots;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select id into wid from public.workspaces where owner_id=uid;
  select * into inventory_lot from public.released_finished_goods_inventory_lots where workspace_id=wid and id=target_released_inventory_lot_id;
  if not found then raise exception 'RELEASED_FINISHED_GOODS_LOT_NOT_FOUND'; end if;
  return jsonb_build_object('releasedInventoryLot',to_jsonb(inventory_lot),
    'releaseReview',(select to_jsonb(r) from public.finished_goods_disposition_reviews r where r.workspace_id=wid and r.id=inventory_lot.release_review_id),
    'openingMovement',(select to_jsonb(m) from public.finished_goods_inventory_movements m where m.workspace_id=wid and m.released_inventory_lot_id=inventory_lot.id and m.movement_type='release_receipt'),
    'movementDerivedBalance',(select coalesce(sum(m.normalized_quantity),0) from public.finished_goods_inventory_movements m where m.workspace_id=wid and m.released_inventory_lot_id=inventory_lot.id),
    'finishedGoodsGenealogy',public.get_finished_goods_lot_genealogy_v1(inventory_lot.finished_goods_lot_id));
end $$;

do $$ declare signature text; begin
  foreach signature in array array[
    'public.get_finished_goods_inspection_plan_v1(uuid)',
    'public.record_finished_goods_inspection_v1(uuid,bigint,text,text,numeric,text,text,jsonb,text,text,numeric,timestamptz,uuid,uuid)',
    'public.open_finished_goods_deviation_v1(uuid,bigint,uuid,text,text,numeric,text,text,jsonb,text,timestamptz,uuid)',
    'public.resolve_finished_goods_deviation_v1(uuid,text,jsonb,jsonb,timestamptz,uuid)',
    'public.get_finished_goods_release_readiness_v1(uuid)',
    'public.record_finished_goods_disposition_v1(uuid,bigint,text,numeric,text,text,jsonb,text,boolean,timestamptz,uuid)',
    'public.get_finished_goods_quality_workspace_v1(uuid)',
    'public.get_released_finished_goods_genealogy_v1(uuid)'
  ] loop
    execute 'revoke all on function '||signature||' from public,anon,authenticated';
    execute 'grant execute on function '||signature||' to authenticated,service_role';
  end loop;
end $$;
