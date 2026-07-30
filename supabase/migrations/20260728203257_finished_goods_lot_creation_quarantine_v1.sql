-- Finished Goods & Batch Genealogy V1, Slice 3.
-- Immutable conversion of reconciled packaged output into quarantined lots.

create table public.packaged_output_reconciliations(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  packaging_run_id uuid not null,
  production_output_id uuid not null,
  reconciliation_version integer not null check(reconciliation_version>0),
  policy_version text not null default '1.0.0',
  total_packaged_quantity numeric not null check(total_packaged_quantity>=0 and total_packaged_quantity<=1000000000),
  accepted_quantity numeric not null check(accepted_quantity>=0),
  rejected_quantity numeric not null check(rejected_quantity>=0),
  damaged_quantity numeric not null check(damaged_quantity>=0),
  sample_quantity numeric not null check(sample_quantity>=0),
  retention_quantity numeric not null check(retention_quantity>=0),
  unresolved_variance numeric not null check(unresolved_variance>=0),
  unit text not null check(unit in('pcs','g','ml')),
  equation_difference numeric not null,
  tolerance_quantity numeric not null default 0 check(tolerance_quantity>=0),
  state text not null check(state in('blocked','reconciled')),
  evidence_reference text,
  note text not null default '',
  supersedes_reconciliation_id uuid,
  recorded_by uuid not null,
  recorded_at timestamptz not null,
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,packaging_run_id,reconciliation_version),
  unique(workspace_id,idempotency_key),
  foreign key(workspace_id,packaging_run_id) references public.packaging_runs(workspace_id,id),
  foreign key(workspace_id,production_output_id) references public.production_outputs(workspace_id,id),
  foreign key(supersedes_reconciliation_id) references public.packaged_output_reconciliations(id)
);

create table public.finished_goods_lots(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  packaging_run_id uuid not null,
  production_output_id uuid not null,
  production_run_id text not null,
  formula_id text not null,
  formula_version_id text not null,
  product_id text not null,
  packaging_specification_version_id text not null,
  packaged_output_reconciliation_id uuid not null,
  internal_lot_code text not null,
  consumer_batch_code text not null,
  lot_sequence integer not null check(lot_sequence>0),
  lot_label text not null,
  quantity numeric not null check(quantity>0 and quantity<=1000000000),
  unit text not null check(unit in('pcs','g','ml')),
  normalized_quantity numeric not null check(normalized_quantity>0),
  nominal_fill_quantity numeric not null check(nominal_fill_quantity>0),
  nominal_fill_unit text not null,
  manufacturing_date date not null,
  shelf_life_policy_version text not null default '1.0.0',
  shelf_life_basis text not null,
  shelf_life_duration integer check(shelf_life_duration>0),
  shelf_life_unit text check(shelf_life_unit in('days','months','years')),
  expiry_date date,
  period_after_opening_value integer check(period_after_opening_value>0),
  period_after_opening_unit text check(period_after_opening_unit in('days','months','years')),
  product_snapshot jsonb not null,
  formula_snapshot jsonb not null,
  packaging_snapshot jsonb not null,
  label_snapshot jsonb not null,
  cost_snapshot jsonb not null,
  genealogy_snapshot jsonb not null,
  quarantine_status text not null default 'quarantined' check(quarantine_status in('quarantined','inspection_required')),
  lifecycle_status text not null default 'quarantined' check(lifecycle_status in('quarantined','inspection_required')),
  location text not null,
  revision bigint not null default 1 check(revision>0),
  creation_idempotency_key uuid not null,
  creation_payload_fingerprint text not null,
  code_policy_version text not null default '1.0.0',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  quarantined_by uuid not null,
  quarantined_at timestamptz not null,
  unique(workspace_id,id),
  unique(workspace_id,internal_lot_code),
  unique(workspace_id,consumer_batch_code),
  unique(workspace_id,packaging_run_id,lot_sequence),
  unique(workspace_id,creation_idempotency_key),
  foreign key(workspace_id,packaging_run_id) references public.packaging_runs(workspace_id,id),
  foreign key(workspace_id,production_output_id) references public.production_outputs(workspace_id,id),
  foreign key(workspace_id,production_run_id) references public.production_runs(workspace_id,id),
  foreign key(workspace_id,formula_id) references public.formulas(workspace_id,id),
  foreign key(workspace_id,formula_version_id) references public.formula_versions(workspace_id,id),
  foreign key(workspace_id,product_id) references public.products(workspace_id,id),
  foreign key(workspace_id,packaging_specification_version_id) references public.packaging_specification_versions(workspace_id,id),
  foreign key(workspace_id,packaged_output_reconciliation_id) references public.packaged_output_reconciliations(workspace_id,id),
  check(expiry_date is null or expiry_date>=manufacturing_date),
  check((shelf_life_duration is null and shelf_life_unit is null) or
        (shelf_life_duration is not null and shelf_life_unit is not null))
);

create table public.finished_goods_quarantines(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  finished_goods_lot_id uuid not null,
  packaging_run_id uuid not null,
  quantity numeric not null check(quantity>0),
  unit text not null,
  quarantine_status text not null default 'inspection_required' check(quarantine_status in('quarantined','inspection_required')),
  quarantine_reason text not null,
  location text not null,
  quarantine_policy_version text not null default '1.0.0',
  entered_by uuid not null,
  entered_at timestamptz not null,
  current_review_state text not null default 'not_started',
  released_quantity numeric not null default 0 check(released_quantity=0),
  rejected_quantity numeric not null default 0 check(rejected_quantity=0),
  held_quantity numeric not null default 0 check(held_quantity=0),
  remaining_quantity numeric not null check(remaining_quantity>0),
  revision bigint not null default 1 check(revision=1),
  provenance jsonb not null,
  unique(workspace_id,id),
  unique(workspace_id,finished_goods_lot_id),
  foreign key(workspace_id,finished_goods_lot_id) references public.finished_goods_lots(workspace_id,id),
  foreign key(workspace_id,packaging_run_id) references public.packaging_runs(workspace_id,id)
);

create table public.finished_goods_lot_events(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  finished_goods_lot_id uuid,
  packaging_run_id uuid not null,
  production_output_id uuid not null,
  production_run_id text not null,
  product_id text not null,
  formula_version_id text not null,
  event_type text not null check(event_type in(
    'packaged_output_reconciliation_recorded','packaged_output_reconciliation_superseded',
    'finished_goods_lot_created','finished_goods_lot_quarantined',
    'finished_goods_lot_code_assigned','finished_goods_expiry_assigned',
    'finished_goods_snapshot_recorded'
  )),
  quantity numeric,
  unit text,
  consumer_batch_code text,
  actor_id uuid not null,
  occurred_at timestamptz not null,
  policy_versions jsonb not null,
  revision bigint not null,
  event_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique(workspace_id,id),
  unique(workspace_id,event_key),
  foreign key(workspace_id,finished_goods_lot_id) references public.finished_goods_lots(workspace_id,id),
  foreign key(workspace_id,packaging_run_id) references public.packaging_runs(workspace_id,id),
  foreign key(workspace_id,production_output_id) references public.production_outputs(workspace_id,id),
  foreign key(workspace_id,production_run_id) references public.production_runs(workspace_id,id),
  foreign key(workspace_id,product_id) references public.products(workspace_id,id),
  foreign key(workspace_id,formula_version_id) references public.formula_versions(workspace_id,id)
);

create index packaged_output_reconciliations_run_idx on public.packaged_output_reconciliations(workspace_id,packaging_run_id,reconciliation_version desc);
create index finished_goods_lots_run_idx on public.finished_goods_lots(workspace_id,packaging_run_id,lot_sequence);
create index finished_goods_lots_output_idx on public.finished_goods_lots(workspace_id,production_output_id);
create index finished_goods_lots_production_run_idx on public.finished_goods_lots(workspace_id,production_run_id);
create index finished_goods_lots_product_idx on public.finished_goods_lots(workspace_id,product_id);
create index finished_goods_lots_formula_version_idx on public.finished_goods_lots(workspace_id,formula_version_id);
create index finished_goods_lots_packaging_version_idx on public.finished_goods_lots(workspace_id,packaging_specification_version_id);
create index finished_goods_quarantines_run_idx on public.finished_goods_quarantines(workspace_id,packaging_run_id);
create index finished_goods_events_lot_idx on public.finished_goods_lot_events(workspace_id,finished_goods_lot_id,occurred_at,id);
create index finished_goods_events_run_idx on public.finished_goods_lot_events(workspace_id,packaging_run_id,occurred_at,id);
create index finished_goods_events_output_idx on public.finished_goods_lot_events(workspace_id,production_output_id);
create index finished_goods_events_production_run_idx on public.finished_goods_lot_events(workspace_id,production_run_id);
create index finished_goods_events_product_idx on public.finished_goods_lot_events(workspace_id,product_id);
create index finished_goods_events_formula_idx on public.finished_goods_lot_events(workspace_id,formula_version_id);
create index packaged_output_reconciliations_owner_idx on public.packaged_output_reconciliations(owner_id);
create index finished_goods_lots_owner_idx on public.finished_goods_lots(owner_id);
create index finished_goods_quarantines_owner_idx on public.finished_goods_quarantines(owner_id);
create index finished_goods_events_owner_idx on public.finished_goods_lot_events(owner_id);

do $$ declare t text; begin
  foreach t in array array['packaged_output_reconciliations','finished_goods_lots','finished_goods_quarantines','finished_goods_lot_events']
  loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy owner_read on public.%I for select to authenticated using(owner_id=(select auth.uid()))',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select on public.%I to authenticated,service_role',t);
  end loop;
end $$;

-- Service-role access is server-only and remains distinct from browser grants/RLS.
grant select,insert,update,delete on public.products,public.formulas,public.formula_versions,
  public.production_runs,public.production_outputs,public.packaging_specifications,
  public.packaging_specification_versions,public.packaging_runs to service_role;
grant select,insert,update,delete on public.packaged_output_reconciliations,public.finished_goods_lots,
  public.finished_goods_quarantines,public.finished_goods_lot_events to service_role;

create function public.kf_finished_goods_append_only()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'FINISHED_GOODS_HISTORY_IMMUTABLE'; end $$;

do $$ declare t text; begin
  foreach t in array array['packaged_output_reconciliations','finished_goods_lots','finished_goods_quarantines','finished_goods_lot_events']
  loop execute format('create trigger %I before update or delete on public.%I for each row execute function public.kf_finished_goods_append_only()',t||'_append_only',t); end loop;
end $$;

create function public.kf_finished_goods_readiness_v1(target_workspace_id uuid,target_packaging_run_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare pr public.packaging_runs; rec public.packaged_output_reconciliations; converted numeric:=0; blockers jsonb:='[]'::jsonb;
begin
  select * into pr from public.packaging_runs where workspace_id=target_workspace_id and id=target_packaging_run_id;
  if not found then raise exception 'PACKAGING_RUN_NOT_FOUND'; end if;
  select * into rec from public.packaged_output_reconciliations where workspace_id=target_workspace_id and packaging_run_id=pr.id order by reconciliation_version desc limit 1;
  select coalesce(sum(quantity),0) into converted from public.finished_goods_lots where workspace_id=target_workspace_id and packaging_run_id=pr.id;
  if pr.status<>'completed' then blockers:=blockers||jsonb_build_array(jsonb_build_object('blockerCode','packaging_run_not_complete','category','packaging','severity','blocking','blocksLotCreation',true,'humanMessage','Complete Packaging Run control first.','recommendedAction','Reconcile and complete the Packaging Run.')); end if;
  if rec.id is null then blockers:=blockers||jsonb_build_array(jsonb_build_object('blockerCode','packaged_output_missing','category','quantity','severity','blocking','blocksLotCreation',true,'humanMessage','Packaged output reconciliation is required.','recommendedAction','Record actual packaged output.')); end if;
  if rec.id is not null and rec.state<>'reconciled' then blockers:=blockers||jsonb_build_array(jsonb_build_object('blockerCode','packaged_output_unreconciled','category','quantity','severity','blocking','blocksLotCreation',true,'humanMessage','Packaged output equation is not reconciled.','recommendedAction','Correct quantities or document variance.')); end if;
  return jsonb_build_object(
    'packagingRunId',pr.id,'productionOutputId',pr.production_output_id,'policyVersion','1.0.0',
    'state',case when jsonb_array_length(blockers)=0 and coalesce(rec.accepted_quantity,0)-converted>0 then 'ready' when rec.id is not null and coalesce(rec.accepted_quantity,0)-converted=0 then 'conversion_completed' else 'blocked' end,
    'packagingRunCompleted',pr.status='completed','readyForLotCreation',jsonb_array_length(blockers)=0 and coalesce(rec.accepted_quantity,0)-converted>0,
    'conversionCompleted',rec.id is not null and coalesce(rec.accepted_quantity,0)=converted,'evaluatedAt',now(),
    'totalPackagedQuantity',coalesce(rec.total_packaged_quantity,0),'acceptedQuantity',coalesce(rec.accepted_quantity,0),
    'rejectedQuantity',coalesce(rec.rejected_quantity,0),'damagedQuantity',coalesce(rec.damaged_quantity,0),
    'sampleQuantity',coalesce(rec.sample_quantity,0),'retentionQuantity',coalesce(rec.retention_quantity,0),
    'unresolvedVariance',coalesce(rec.unresolved_variance,0),'convertedQuantity',converted,
    'remainingAcceptedQuantity',greatest(coalesce(rec.accepted_quantity,0)-converted,0),'unit',coalesce(rec.unit,'pcs'),
    'finishedGoodsLotCount',(select count(*) from public.finished_goods_lots where workspace_id=target_workspace_id and packaging_run_id=pr.id),
    'missingEvidenceCount',case when rec.id is not null and rec.unresolved_variance>0 and coalesce(rec.evidence_reference,'')='' then 1 else 0 end,
    'costState',case when pr.bulk_cost_confidence='complete' and not exists(select 1 from public.packaging_run_inventory_uses u where u.workspace_id=target_workspace_id and u.packaging_run_id=pr.id and u.cost_confidence='unknown') then 'complete' else 'provisional' end,
    'reconciliation',case when rec.id is null then null else to_jsonb(rec) end,'blockers',blockers);
end $$;

create function public.get_packaging_run_finished_goods_readiness_v1(target_packaging_run_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); wid uuid;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select id into wid from public.workspaces where owner_id=uid;
  if wid is null then raise exception 'ACTIVE_WORKSPACE_REQUIRED'; end if;
  return public.kf_finished_goods_readiness_v1(wid,target_packaging_run_id);
end $$;

create function public.record_packaged_output_reconciliation_v1(
  target_packaging_run_id uuid, expected_run_revision bigint,
  candidate_total_packaged_quantity numeric,candidate_accepted_quantity numeric,
  candidate_rejected_quantity numeric,candidate_damaged_quantity numeric,
  candidate_sample_quantity numeric,candidate_retention_quantity numeric,
  candidate_unresolved_variance numeric,candidate_unit text,
  candidate_evidence_reference text,candidate_note text,candidate_recorded_at timestamptz,
  candidate_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); wid uuid; pr public.packaging_runs; existing public.packaged_output_reconciliations;
  prior public.packaged_output_reconciliations; fp text; difference numeric; rec_id uuid:=gen_random_uuid(); version_value integer;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select id into wid from public.workspaces where owner_id=uid;
  if wid is null then raise exception 'ACTIVE_WORKSPACE_REQUIRED'; end if;
  fp:=md5(jsonb_build_object('run',target_packaging_run_id,'total',candidate_total_packaged_quantity,'accepted',candidate_accepted_quantity,'rejected',candidate_rejected_quantity,'damaged',candidate_damaged_quantity,'sample',candidate_sample_quantity,'retention',candidate_retention_quantity,'variance',candidate_unresolved_variance,'unit',candidate_unit,'evidence',candidate_evidence_reference,'note',candidate_note)::text);
  select * into existing from public.packaged_output_reconciliations where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then if existing.payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return jsonb_build_object('reconciliation',to_jsonb(existing),'retry',true,'readiness',public.kf_finished_goods_readiness_v1(wid,target_packaging_run_id)); end if;
  select * into pr from public.packaging_runs where workspace_id=wid and id=target_packaging_run_id for update;
  if not found then raise exception 'PACKAGING_RUN_NOT_FOUND'; end if;
  if pr.status<>'completed' then raise exception 'PACKAGING_RUN_NOT_COMPLETE'; end if;
  if pr.revision<>expected_run_revision then raise exception 'STALE_PACKAGING_RUN_REVISION'; end if;
  if candidate_unit<>'pcs' then raise exception 'PACKAGED_OUTPUT_UNIT_MUST_BE_PCS'; end if;
  if least(candidate_total_packaged_quantity,candidate_accepted_quantity,candidate_rejected_quantity,candidate_damaged_quantity,candidate_sample_quantity,candidate_retention_quantity,candidate_unresolved_variance)<0 then raise exception 'INVALID_PACKAGED_OUTPUT_QUANTITY'; end if;
  difference:=candidate_total_packaged_quantity-(candidate_accepted_quantity+candidate_rejected_quantity+candidate_damaged_quantity+candidate_sample_quantity+candidate_retention_quantity+candidate_unresolved_variance);
  if abs(difference)>.0001 then raise exception 'PACKAGED_OUTPUT_EQUATION_MISMATCH'; end if;
  if candidate_unresolved_variance>0 and coalesce(candidate_evidence_reference,'')='' then raise exception 'VARIANCE_EVIDENCE_REQUIRED'; end if;
  select * into prior from public.packaged_output_reconciliations where workspace_id=wid and packaging_run_id=pr.id order by reconciliation_version desc limit 1;
  if prior.id is not null and exists(select 1 from public.finished_goods_lots where workspace_id=wid and packaging_run_id=pr.id) then raise exception 'RECONCILIATION_LOCKED_AFTER_LOT_CREATION'; end if;
  version_value:=coalesce(prior.reconciliation_version,0)+1;
  insert into public.packaged_output_reconciliations(id,workspace_id,owner_id,packaging_run_id,production_output_id,reconciliation_version,
    total_packaged_quantity,accepted_quantity,rejected_quantity,damaged_quantity,sample_quantity,retention_quantity,unresolved_variance,
    unit,equation_difference,tolerance_quantity,state,evidence_reference,note,supersedes_reconciliation_id,recorded_by,recorded_at,idempotency_key,payload_fingerprint)
  values(rec_id,wid,uid,pr.id,pr.production_output_id,version_value,candidate_total_packaged_quantity,candidate_accepted_quantity,
    candidate_rejected_quantity,candidate_damaged_quantity,candidate_sample_quantity,candidate_retention_quantity,candidate_unresolved_variance,
    candidate_unit,difference,0,'reconciled',nullif(candidate_evidence_reference,''),candidate_note,prior.id,uid,candidate_recorded_at,candidate_idempotency_key,fp);
  if prior.id is not null then insert into public.finished_goods_lot_events(workspace_id,owner_id,packaging_run_id,production_output_id,production_run_id,product_id,formula_version_id,event_type,actor_id,occurred_at,policy_versions,revision,event_key,metadata)
    values(wid,uid,pr.id,pr.production_output_id,pr.production_run_id,pr.product_id,pr.formula_version_id,'packaged_output_reconciliation_superseded',uid,candidate_recorded_at,'{"packagedOutput":"1.0.0"}',version_value,'packaged-output-superseded:'||prior.id,jsonb_build_object('supersededId',prior.id,'replacementId',rec_id)); end if;
  insert into public.finished_goods_lot_events(workspace_id,owner_id,packaging_run_id,production_output_id,production_run_id,product_id,formula_version_id,event_type,quantity,unit,actor_id,occurred_at,policy_versions,revision,event_key,metadata)
  values(wid,uid,pr.id,pr.production_output_id,pr.production_run_id,pr.product_id,pr.formula_version_id,'packaged_output_reconciliation_recorded',candidate_total_packaged_quantity,candidate_unit,uid,candidate_recorded_at,'{"packagedOutput":"1.0.0"}',version_value,'packaged-output-reconciled:'||candidate_idempotency_key,jsonb_build_object('reconciliationId',rec_id));
  return jsonb_build_object('reconciliationId',rec_id,'version',version_value,'retry',false,'readiness',public.kf_finished_goods_readiness_v1(wid,pr.id));
end $$;

create function public.create_finished_goods_lot_v1(
  target_packaging_run_id uuid,expected_run_revision bigint,candidate_quantity numeric,candidate_unit text,
  candidate_internal_lot_code text,candidate_consumer_batch_code text,candidate_lot_label text,
  candidate_manufacturing_date date,candidate_shelf_life_basis text,candidate_shelf_life_duration integer,
  candidate_shelf_life_unit text,candidate_expiry_override date,candidate_expiry_override_reason text,
  candidate_expiry_override_evidence text,candidate_pao_value integer,candidate_pao_unit text,
  candidate_location text,candidate_manual_code_override boolean,candidate_code_override_reason text,
  candidate_code_override_evidence text,candidate_acknowledged boolean,candidate_created_at timestamptz,
  candidate_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); wid uuid; pr public.packaging_runs; rec public.packaged_output_reconciliations;
  existing public.finished_goods_lots; p public.products; f public.formulas; fv public.formula_versions;
  dossier public.compliance_dossiers; artwork public.label_artwork_versions; inci public.inci_declarations;
  readiness jsonb; converted numeric; sequence_value integer; lot_id uuid:=gen_random_uuid(); quarantine_id uuid:=gen_random_uuid();
  internal_code text; batch_code text; expiry_value date; fp text; product_snap jsonb; formula_snap jsonb; label_snap jsonb;
  cost_snap jsonb; genealogy_snap jsonb; raw_cost numeric; packaging_cost numeric; cost_currency text; unresolved_cost integer;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select id into wid from public.workspaces where owner_id=uid;
  if wid is null then raise exception 'ACTIVE_WORKSPACE_REQUIRED'; end if;
  fp:=md5(jsonb_build_object('run',target_packaging_run_id,'quantity',candidate_quantity,'unit',candidate_unit,'internal',candidate_internal_lot_code,'batch',candidate_consumer_batch_code,'label',candidate_lot_label,'manufactured',candidate_manufacturing_date,'basis',candidate_shelf_life_basis,'duration',candidate_shelf_life_duration,'durationUnit',candidate_shelf_life_unit,'expiry',candidate_expiry_override,'pao',candidate_pao_value,'paoUnit',candidate_pao_unit,'location',candidate_location)::text);
  select * into existing from public.finished_goods_lots where workspace_id=wid and creation_idempotency_key=candidate_idempotency_key;
  if found then if existing.creation_payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_CONFLICT'; end if; return jsonb_build_object('finishedGoodsLot',to_jsonb(existing),'quarantine',(select to_jsonb(q) from public.finished_goods_quarantines q where q.workspace_id=wid and q.finished_goods_lot_id=existing.id),'retry',true); end if;
  select * into pr from public.packaging_runs where workspace_id=wid and id=target_packaging_run_id for update;
  if not found then raise exception 'PACKAGING_RUN_NOT_FOUND'; end if;
  if pr.status<>'completed' then raise exception 'PACKAGING_RUN_NOT_COMPLETE'; end if;
  if pr.revision<>expected_run_revision then raise exception 'STALE_PACKAGING_RUN_REVISION'; end if;
  perform 1 from public.packaged_output_reconciliations where workspace_id=wid and packaging_run_id=pr.id order by reconciliation_version desc for update;
  select * into rec from public.packaged_output_reconciliations where workspace_id=wid and packaging_run_id=pr.id order by reconciliation_version desc limit 1;
  readiness:=public.kf_finished_goods_readiness_v1(wid,pr.id);
  if not coalesce((readiness->>'readyForLotCreation')::boolean,false) then raise exception 'FINISHED_GOODS_NOT_READY'; end if;
  select coalesce(sum(quantity),0) into converted from public.finished_goods_lots where workspace_id=wid and packaging_run_id=pr.id;
  if candidate_quantity<=0 or candidate_quantity>rec.accepted_quantity-converted then raise exception 'FINISHED_GOODS_OVER_CONVERSION'; end if;
  if candidate_unit<>rec.unit then raise exception 'FINISHED_GOODS_UNIT_MISMATCH'; end if;
  if not candidate_acknowledged then raise exception 'QUARANTINE_ACKNOWLEDGEMENT_REQUIRED'; end if;
  sequence_value:=1+(select count(*) from public.finished_goods_lots where workspace_id=wid and packaging_run_id=pr.id);
  internal_code:=coalesce(nullif(upper(trim(candidate_internal_lot_code)),''),upper(pr.internal_run_code)||'-FG-'||lpad(sequence_value::text,2,'0'));
  batch_code:=coalesce(nullif(upper(trim(candidate_consumer_batch_code)),''),'KF-'||to_char(candidate_manufacturing_date,'YYMMDD')||'-'||lpad(sequence_value::text,2,'0'));
  if candidate_manual_code_override and (coalesce(candidate_code_override_reason,'')='' or coalesce(candidate_code_override_evidence,'')='') then raise exception 'CODE_OVERRIDE_EVIDENCE_REQUIRED'; end if;
  if internal_code!~'^[A-Z0-9][A-Z0-9._-]{2,63}$' or batch_code!~'^[A-Z0-9][A-Z0-9._-]{2,31}$' then raise exception 'INVALID_LOT_OR_BATCH_CODE'; end if;
  if exists(select 1 from public.finished_goods_lots where workspace_id=wid and (internal_lot_code=internal_code or consumer_batch_code=batch_code)) then raise exception 'FINISHED_GOODS_CODE_CONFLICT'; end if;
  if candidate_manufacturing_date>candidate_created_at::date then raise exception 'MANUFACTURING_DATE_IN_FUTURE'; end if;
  if candidate_shelf_life_duration is not null and candidate_shelf_life_unit not in('days','months','years') then raise exception 'INVALID_SHELF_LIFE_UNIT'; end if;
  expiry_value:=case candidate_shelf_life_unit when 'days' then candidate_manufacturing_date+candidate_shelf_life_duration when 'months' then (candidate_manufacturing_date+(candidate_shelf_life_duration||' months')::interval)::date when 'years' then (candidate_manufacturing_date+(candidate_shelf_life_duration||' years')::interval)::date else null end;
  if candidate_expiry_override is not null then
    if coalesce(candidate_expiry_override_reason,'')='' or coalesce(candidate_expiry_override_evidence,'')='' then raise exception 'EXPIRY_OVERRIDE_EVIDENCE_REQUIRED'; end if;
    expiry_value:=candidate_expiry_override;
  end if;
  if expiry_value is not null and expiry_value<candidate_manufacturing_date then raise exception 'EXPIRY_BEFORE_MANUFACTURE'; end if;
  select * into p from public.products where workspace_id=wid and id=pr.product_id;
  select * into fv from public.formula_versions where workspace_id=wid and id=pr.formula_version_id;
  select * into f from public.formulas where workspace_id=wid and id=fv.formula_id;
  select * into dossier from public.compliance_dossiers where workspace_id=wid and product_id=p.id and formula_version_id=fv.id and (packaging_specification_version_id is null or packaging_specification_version_id=pr.packaging_specification_version_id) order by created_at desc limit 1;
  if dossier.id is not null then
    select * into artwork from public.label_artwork_versions where workspace_id=wid and id=dossier.label_artwork_version_id;
    select * into inci from public.inci_declarations where workspace_id=wid and compliance_dossier_id=dossier.id order by created_at desc limit 1;
  end if;
  product_snap:=jsonb_build_object('id',p.id,'name',p.name,'category',p.category,'status',p.status,'developmentStage',p.development_stage,'description',p.description,'scentProfile',p.scent_profile,'market',coalesce(dossier.target_market,'Unknown'),'language',coalesce(dossier.target_language,'Unknown'),'responsiblePersonId',dossier.responsible_person_id,'unknownFields',jsonb_build_array('productVersion','directions','warnings','barcode','approvedShelfLife'));
  formula_snap:=jsonb_build_object('id',f.id,'name',f.name,'formulaVersionId',fv.id,'version',fv.version,'status',fv.status,'batchScale',jsonb_build_object('quantity',pr.planned_bulk_quantity,'unit',pr.planned_bulk_unit),'inci',coalesce(inci.final_text_snapshot,inci.working_text,'Unknown'),'rawMaterialGenealogyReference',pr.production_run_id);
  label_snap:=jsonb_build_object('artworkId',artwork.id,'artworkVersion',artwork.version,'approvalState',coalesce(artwork.status,'Unknown'),'market',coalesce(artwork.market,dossier.target_market,'Unknown'),'language',coalesce(artwork.language,dossier.target_language,'Unknown'),'productName',p.name,'nominalContent',pr.nominal_fill_quantity||' '||pr.nominal_fill_unit,'batchCode',batch_code,'expiry',expiry_value,'pao',case when candidate_pao_value is null then 'Unknown' else candidate_pao_value||' '||candidate_pao_unit end,'inci',coalesce(inci.final_text_snapshot,inci.working_text,'Unknown'),'artworkDocumentId',artwork.artwork_document_id,'unknownFields',jsonb_build_array('printedLabelEvidence','directions','warnings','claims','countryOfOrigin'));
  select po.material_cost_snapshot,po.material_cost_currency,po.unresolved_cost_count into raw_cost,cost_currency,unresolved_cost from public.production_outputs po where po.workspace_id=wid and po.id=pr.production_output_id;
  raw_cost:=case when pr.bulk_material_cost_snapshot is null then null else pr.bulk_material_cost_snapshot*candidate_quantity/rec.accepted_quantity end;
  select sum(total_cost_snapshot) filter(where use_type='consumption')*candidate_quantity/rec.accepted_quantity into packaging_cost from public.packaging_run_inventory_uses where workspace_id=wid and packaging_run_id=pr.id;
  cost_snap:=jsonb_build_object('allocatedBulkCost',raw_cost,'productivePackagingCost',packaging_cost,'totalDirectMaterialCost',case when raw_cost is null or packaging_cost is null then null else raw_cost+packaging_cost end,'quantityBasis',candidate_quantity,'unitCost',case when raw_cost is null or packaging_cost is null then null else (raw_cost+packaging_cost)/candidate_quantity end,'currency',cost_currency,'confidence',case when raw_cost is null or packaging_cost is null then 'provisional' else 'complete' end,'allocationMethod','accepted_quantity_pro_rata','unresolvedCostCount',coalesce(unresolved_cost,0));
  genealogy_snap:=jsonb_build_object('packagingRunId',pr.id,'productionOutputId',pr.production_output_id,'productionRunId',pr.production_run_id,'formulaVersionId',pr.formula_version_id,'packagingSpecificationVersionId',pr.packaging_specification_version_id,'packagedOutputReconciliationId',rec.id,'capturedAt',candidate_created_at);
  insert into public.finished_goods_lots(id,workspace_id,owner_id,packaging_run_id,production_output_id,production_run_id,formula_id,formula_version_id,product_id,packaging_specification_version_id,packaged_output_reconciliation_id,
    internal_lot_code,consumer_batch_code,lot_sequence,lot_label,quantity,unit,normalized_quantity,nominal_fill_quantity,nominal_fill_unit,manufacturing_date,shelf_life_basis,shelf_life_duration,shelf_life_unit,expiry_date,period_after_opening_value,period_after_opening_unit,
    product_snapshot,formula_snapshot,packaging_snapshot,label_snapshot,cost_snapshot,genealogy_snapshot,location,creation_idempotency_key,creation_payload_fingerprint,created_by,created_at,quarantined_by,quarantined_at)
  values(lot_id,wid,uid,pr.id,pr.production_output_id,pr.production_run_id,f.id,fv.id,p.id,pr.packaging_specification_version_id,rec.id,internal_code,batch_code,sequence_value,candidate_lot_label,candidate_quantity,candidate_unit,candidate_quantity,
    pr.nominal_fill_quantity,pr.nominal_fill_unit,candidate_manufacturing_date,candidate_shelf_life_basis,candidate_shelf_life_duration,candidate_shelf_life_unit,expiry_value,candidate_pao_value,candidate_pao_unit,
    product_snap,formula_snap,pr.packaging_specification_snapshot,label_snap,cost_snap,genealogy_snap,candidate_location,candidate_idempotency_key,fp,uid,candidate_created_at,uid,candidate_created_at);
  insert into public.finished_goods_quarantines(id,workspace_id,owner_id,finished_goods_lot_id,packaging_run_id,quantity,unit,quarantine_reason,location,entered_by,entered_at,remaining_quantity,provenance)
  values(quarantine_id,wid,uid,lot_id,pr.id,candidate_quantity,candidate_unit,'Finished Goods Lot creation pending finished-product inspection',candidate_location,uid,candidate_created_at,candidate_quantity,genealogy_snap);
  insert into public.finished_goods_lot_events(workspace_id,owner_id,finished_goods_lot_id,packaging_run_id,production_output_id,production_run_id,product_id,formula_version_id,event_type,quantity,unit,consumer_batch_code,actor_id,occurred_at,policy_versions,revision,event_key,metadata)
  select wid,uid,lot_id,pr.id,pr.production_output_id,pr.production_run_id,pr.product_id,pr.formula_version_id,e,candidate_quantity,candidate_unit,batch_code,uid,candidate_created_at,'{"lotCreation":"1.0.0","code":"1.0.0","shelfLife":"1.0.0","quarantine":"1.0.0"}',1,e||':'||candidate_idempotency_key,jsonb_build_object('lotId',lot_id,'quarantineId',quarantine_id)
  from unnest(array['finished_goods_lot_created','finished_goods_lot_quarantined','finished_goods_lot_code_assigned','finished_goods_snapshot_recorded']::text[]) e;
  if expiry_value is not null then insert into public.finished_goods_lot_events(workspace_id,owner_id,finished_goods_lot_id,packaging_run_id,production_output_id,production_run_id,product_id,formula_version_id,event_type,quantity,unit,consumer_batch_code,actor_id,occurred_at,policy_versions,revision,event_key,metadata)
    values(wid,uid,lot_id,pr.id,pr.production_output_id,pr.production_run_id,pr.product_id,pr.formula_version_id,'finished_goods_expiry_assigned',candidate_quantity,candidate_unit,batch_code,uid,candidate_created_at,'{"shelfLife":"1.0.0"}',1,'finished_goods_expiry_assigned:'||candidate_idempotency_key,jsonb_build_object('expiryDate',expiry_value)); end if;
  return jsonb_build_object('finishedGoodsLot',(select to_jsonb(l) from public.finished_goods_lots l where l.workspace_id=wid and l.id=lot_id),'quarantine',(select to_jsonb(q) from public.finished_goods_quarantines q where q.workspace_id=wid and q.id=quarantine_id),'retry',false,'remainingAcceptedQuantity',rec.accepted_quantity-converted-candidate_quantity);
end $$;

create function public.get_finished_goods_lot_genealogy_v1(target_finished_goods_lot_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); wid uuid; lot public.finished_goods_lots;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select id into wid from public.workspaces where owner_id=uid;
  select * into lot from public.finished_goods_lots where workspace_id=wid and id=target_finished_goods_lot_id;
  if not found then raise exception 'FINISHED_GOODS_LOT_NOT_FOUND'; end if;
  return jsonb_build_object(
    'finishedGoodsLot',to_jsonb(lot),
    'quarantine',(select to_jsonb(q) from public.finished_goods_quarantines q where q.workspace_id=wid and q.finished_goods_lot_id=lot.id),
    'packagingRun',public.get_packaging_run_genealogy_v1(lot.packaging_run_id),
    'rawMaterialConsumptions',coalesce((select jsonb_agg(jsonb_build_object('consumptionId',c.id,'inventoryLotId',c.inventory_lot_id,'movementId',c.movement_id,'quantity',c.consumed_quantity,'unit',c.unit,'qualityReleaseReviewId',c.quality_release_review_id) order by c.consumed_at,c.id) from public.batch_material_consumptions c where c.workspace_id=wid and c.batch_kind='production' and c.batch_id=lot.production_run_id),'[]'::jsonb),
    'rawMaterialWaste',coalesce((select jsonb_agg(to_jsonb(w) order by w.recorded_at,w.id) from public.batch_material_waste w where w.workspace_id=wid and w.batch_kind='production' and w.batch_id=lot.production_run_id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at,e.id) from public.finished_goods_lot_events e where e.workspace_id=wid and e.finished_goods_lot_id=lot.id),'[]'::jsonb));
end $$;

revoke all on function public.get_packaging_run_finished_goods_readiness_v1(uuid) from public,anon;
revoke all on function public.record_packaged_output_reconciliation_v1(uuid,bigint,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,text,text,timestamptz,uuid) from public,anon;
revoke all on function public.create_finished_goods_lot_v1(uuid,bigint,numeric,text,text,text,text,date,text,integer,text,date,text,text,integer,text,text,boolean,text,text,boolean,timestamptz,uuid) from public,anon;
revoke all on function public.get_finished_goods_lot_genealogy_v1(uuid) from public,anon;
grant execute on function public.get_packaging_run_finished_goods_readiness_v1(uuid) to authenticated,service_role;
grant execute on function public.record_packaged_output_reconciliation_v1(uuid,bigint,numeric,numeric,numeric,numeric,numeric,numeric,numeric,text,text,text,timestamptz,uuid) to authenticated,service_role;
grant execute on function public.create_finished_goods_lot_v1(uuid,bigint,numeric,text,text,text,text,date,text,integer,text,date,text,text,integer,text,text,boolean,text,text,boolean,timestamptz,uuid) to authenticated,service_role;
grant execute on function public.get_finished_goods_lot_genealogy_v1(uuid) to authenticated,service_role;
