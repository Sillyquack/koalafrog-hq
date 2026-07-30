-- Recall Readiness V1.
-- Internal assessment authority only: this migration does not block, move, destroy,
-- ship, notify, refund, or otherwise execute a withdrawal or recall.

create table public.recall_readiness_cases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null references auth.users(id),
  case_code text not null,
  title text not null check (length(btrim(title)) between 3 and 200),
  issue_summary text not null check (length(btrim(issue_summary)) between 3 and 4000),
  concern_category text not null check (concern_category in (
    'raw_material_quality','packaging_quality','microbiological_concern','contamination_concern',
    'allergen_concern','formulation_error','manufacturing_deviation','packaging_failure','label_error',
    'missing_warning','expiry_or_shelf_life','supplier_notification','consumer_safety_concern',
    'regulatory_nonconformity','traceability_gap','counterfeit_or_identity_concern','other')),
  initiating_source_type text not null check (initiating_source_type in (
    'raw_material_inventory_lot','supplier_raw_material_lot','packaging_inventory_lot',
    'supplier_packaging_lot','production_batch','production_output','packaging_run',
    'finished_goods_lot','released_finished_goods_inventory_lot','consumer_batch_code',
    'finished_goods_quality_review','traceability_integrity_finding','other_documented_source')),
  initiating_source_id text not null,
  initiating_source_code text not null,
  initial_discovery_at timestamptz not null,
  discovered_by uuid not null references auth.users(id),
  lifecycle_state text not null default 'draft' check (lifecycle_state in (
    'draft','under_assessment','awaiting_review','approved_readiness','closed_no_action',
    'superseded','cancelled')),
  revision integer not null default 1,
  latest_revision_id uuid,
  approved_revision_id uuid,
  closure_reason text,
  closed_at timestamptz,
  closed_by uuid references auth.users(id),
  created_at timestamptz not null default statement_timestamp(),
  created_by uuid not null references auth.users(id),
  updated_at timestamptz not null default statement_timestamp(),
  unique(workspace_id,case_code)
);

create table public.recall_readiness_case_sequences (
  workspace_id uuid not null references public.workspaces(id),
  calendar_year integer not null,
  last_value integer not null check(last_value>0),
  primary key(workspace_id,calendar_year)
);

create table public.recall_readiness_case_revisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null references auth.users(id),
  case_id uuid not null references public.recall_readiness_cases(id),
  revision_number integer not null check(revision_number>0),
  supersedes_revision_id uuid references public.recall_readiness_case_revisions(id),
  supersession_reason text,
  status text not null default 'draft' check(status in ('draft','awaiting_review','approved','superseded')),
  concern_category text not null,
  severity text not null check(severity in ('low','moderate','serious','critical','unknown')),
  urgency text not null check(urgency in ('routine','prompt','urgent','immediate','unknown')),
  exposure_state text not null check(exposure_state in (
    'no_known_exposure','possible_exposure','confirmed_internal_distribution_only',
    'possible_consumer_exposure','confirmed_consumer_exposure','unknown')),
  exposure_unknown_acknowledged boolean not null default false,
  health_hazard_narrative text not null default '',
  compliance_narrative text not null default '',
  operator_recommendation text not null default '',
  recommended_action text not null check(recommended_action in (
    'continue_investigation','no_action_recommended','internal_hold_recommended',
    'withdrawal_assessment_recommended','recall_assessment_recommended',
    'supplier_escalation_recommended','regulatory_review_recommended',
    'destruction_assessment_recommended','other')),
  distribution_boundary text not null default 'no_distribution_records_implemented' check(distribution_boundary in (
    'no_distribution_records_implemented','internal_inventory_only','downstream_scope_incomplete',
    'customer_scope_unknown','distribution_scope_not_applicable','legacy_distribution_data_unavailable')),
  distribution_limitation_acknowledged boolean not null default false,
  evidence_pending_acknowledged boolean not null default false,
  initiating_identity jsonb not null,
  assessment_data jsonb not null default '{}'::jsonb,
  fingerprint text not null,
  created_at timestamptz not null default statement_timestamp(),
  created_by uuid not null references auth.users(id),
  unique(case_id,revision_number),
  unique(case_id,fingerprint)
);

alter table public.recall_readiness_cases
  add constraint recall_readiness_cases_latest_revision_fk foreign key(latest_revision_id) references public.recall_readiness_case_revisions(id),
  add constraint recall_readiness_cases_approved_revision_fk foreign key(approved_revision_id) references public.recall_readiness_case_revisions(id);

create table public.recall_readiness_scope_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null references auth.users(id),
  case_id uuid not null references public.recall_readiness_cases(id),
  revision_id uuid not null unique references public.recall_readiness_case_revisions(id),
  policy_version text not null default '1.0.0',
  traceability_policy_version text not null,
  traceability_fingerprint text not null,
  traceability_snapshot jsonb not null,
  distribution_boundary text not null,
  scope_confidence text not null check(scope_confidence in (
    'complete_for_internal_inventory','complete_with_optional_gaps','partial','blocked',
    'legacy_incomplete','distribution_incomplete')),
  quantity_totals jsonb not null,
  fingerprint text not null,
  evaluated_at timestamptz not null,
  generated_at timestamptz not null default statement_timestamp(),
  generated_by uuid not null references auth.users(id)
);

create table public.recall_readiness_affected_goods (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  scope_snapshot_id uuid not null references public.recall_readiness_scope_snapshots(id),
  finished_goods_lot_id uuid not null references public.finished_goods_lots(id),
  consumer_batch_code text not null,
  product_snapshot jsonb not null,
  packaging_snapshot jsonb not null default '{}'::jsonb,
  label_snapshot jsonb not null default '{}'::jsonb,
  formula_snapshot jsonb not null default '{}'::jsonb,
  production_batch_id text,
  production_output_id uuid,
  packaging_run_id uuid,
  quantity_created numeric,
  quantity_quarantined numeric,
  quantity_released numeric,
  quantity_rejected numeric,
  quantity_active_on_hand numeric,
  quantity_available numeric,
  quantity_held numeric,
  quantity_blocked numeric,
  quantity_damaged numeric,
  quantity_lost numeric,
  quantity_destroyed numeric,
  quantity_expired numeric,
  quantity_unavailable numeric,
  quantity_unknown numeric,
  unit text,
  expiry_date date,
  locations jsonb not null default '[]'::jsonb,
  release_reviews jsonb not null default '[]'::jsonb,
  operational_state text not null,
  trace_path jsonb not null,
  attribution_type text not null,
  confidence text not null,
  unique(scope_snapshot_id,finished_goods_lot_id)
);

create table public.recall_readiness_inventory_impacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  scope_snapshot_id uuid not null references public.recall_readiness_scope_snapshots(id),
  affected_good_id uuid not null references public.recall_readiness_affected_goods(id),
  released_inventory_lot_id uuid not null references public.released_finished_goods_inventory_lots(id),
  location text,
  on_hand_quantity numeric not null,
  available_quantity numeric not null,
  reserved_quantity numeric not null default 0,
  held_quantity numeric not null,
  blocked_quantity numeric not null,
  damaged_quantity numeric not null,
  lost_quantity numeric not null,
  destroyed_quantity numeric not null,
  expired_quantity numeric not null default 0,
  operational_readiness text not null,
  valuation_snapshot jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz not null,
  source_policy_version text not null,
  unique(scope_snapshot_id,released_inventory_lot_id,location)
);

create table public.recall_readiness_gaps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  revision_id uuid not null references public.recall_readiness_case_revisions(id),
  scope_snapshot_id uuid references public.recall_readiness_scope_snapshots(id),
  code text not null,
  severity text not null check(severity in ('warning','blocked')),
  node_identity jsonb,
  relationship text,
  reason text not null,
  scope_impact text not null,
  readiness_impact text not null,
  policy_version text not null,
  unique(revision_id,code,relationship)
);

create table public.recall_readiness_evidence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null references auth.users(id),
  case_id uuid not null references public.recall_readiness_cases(id),
  revision_id uuid references public.recall_readiness_case_revisions(id),
  evidence_type text not null check(evidence_type in (
    'supplier_notice','certificate_of_analysis','laboratory_result','deviation_report',
    'inspection_photo','complaint_summary','internal_note','regulatory_correspondence',
    'traceability_export','other')),
  title text not null,
  description text not null,
  storage_reference text,
  document_reference text,
  content_hash text,
  supersedes_evidence_id uuid references public.recall_readiness_evidence(id),
  superseded boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  uploaded_at timestamptz not null default statement_timestamp(),
  uploaded_by uuid not null references auth.users(id)
);

create table public.recall_readiness_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  case_id uuid not null references public.recall_readiness_cases(id),
  revision_id uuid not null references public.recall_readiness_case_revisions(id),
  reviewer_id uuid not null references auth.users(id),
  reviewer_role text not null check(reviewer_role in (
    'owner','quality_reviewer','responsible_person_candidate','compliance_reviewer',
    'operational_reviewer','other')),
  decision text not null check(decision in ('approve_readiness','request_revision','reject_assessment','acknowledge_only')),
  rationale text not null,
  revision_fingerprint text not null,
  blockers_observed jsonb not null default '[]'::jsonb,
  evidence_reviewed jsonb not null default '[]'::jsonb,
  signature_metadata jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz not null default statement_timestamp(),
  unique(revision_id,reviewer_id,decision)
);

create table public.recall_readiness_approvals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  case_id uuid not null references public.recall_readiness_cases(id),
  revision_id uuid not null unique references public.recall_readiness_case_revisions(id),
  revision_fingerprint text not null,
  scope_fingerprint text not null,
  approved_by uuid not null references auth.users(id),
  distribution_limitation_acknowledged boolean not null,
  non_execution_acknowledged boolean not null,
  approved_at timestamptz not null default statement_timestamp()
);

create table public.recall_readiness_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  case_id uuid not null references public.recall_readiness_cases(id),
  revision_id uuid references public.recall_readiness_case_revisions(id),
  event_type text not null check(event_type in (
    'case_created','evidence_added','assessment_revision_created','scope_generated',
    'scope_regenerated_for_new_revision','review_submitted','revision_requested',
    'readiness_approved','case_closed','case_superseded')),
  actor_id uuid not null references auth.users(id),
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default statement_timestamp(),
  unique(workspace_id,idempotency_key)
);

create index recall_readiness_cases_list_idx on public.recall_readiness_cases(workspace_id,updated_at desc,id desc);
create index recall_readiness_revisions_case_idx on public.recall_readiness_case_revisions(workspace_id,case_id,revision_number desc);
create index recall_readiness_affected_scope_idx on public.recall_readiness_affected_goods(scope_snapshot_id,finished_goods_lot_id);
create index recall_readiness_impact_scope_idx on public.recall_readiness_inventory_impacts(scope_snapshot_id,released_inventory_lot_id);
create index recall_readiness_gaps_revision_idx on public.recall_readiness_gaps(revision_id,severity,code);
create index recall_readiness_evidence_case_idx on public.recall_readiness_evidence(workspace_id,case_id,uploaded_at,id);
create index recall_readiness_reviews_revision_idx on public.recall_readiness_reviews(revision_id,reviewed_at,id);
create index recall_readiness_events_case_idx on public.recall_readiness_events(workspace_id,case_id,occurred_at,id);

alter table public.recall_readiness_cases enable row level security;
alter table public.recall_readiness_case_sequences enable row level security;
alter table public.recall_readiness_case_revisions enable row level security;
alter table public.recall_readiness_scope_snapshots enable row level security;
alter table public.recall_readiness_affected_goods enable row level security;
alter table public.recall_readiness_inventory_impacts enable row level security;
alter table public.recall_readiness_gaps enable row level security;
alter table public.recall_readiness_evidence enable row level security;
alter table public.recall_readiness_reviews enable row level security;
alter table public.recall_readiness_approvals enable row level security;
alter table public.recall_readiness_events enable row level security;

revoke all on public.recall_readiness_cases,public.recall_readiness_case_sequences,
  public.recall_readiness_case_revisions,public.recall_readiness_scope_snapshots,
  public.recall_readiness_affected_goods,public.recall_readiness_inventory_impacts,
  public.recall_readiness_gaps,public.recall_readiness_evidence,public.recall_readiness_reviews,
  public.recall_readiness_approvals,public.recall_readiness_events from public,anon,authenticated;

create function public.kf_recall_workspace_v1()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select id into wid from public.workspaces where owner_id=uid and lifecycle_state='active';
  if wid is null then raise exception 'WORKSPACE_NOT_FOUND'; end if;
  return wid;
end $$;

create function public.kf_recall_validate_identity_v1(wid uuid,source_type text,source_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if source_type='raw_material_inventory_lot' then
    select jsonb_build_object('type',source_type,'id',id,'code',internal_lot_number) into result from public.inventory_lots where workspace_id=wid and id=source_id;
  elsif source_type='packaging_inventory_lot' then
    select jsonb_build_object('type',source_type,'id',id,'code',internal_lot_number) into result from public.packaging_inventory_lots where workspace_id=wid and id=source_id;
  elsif source_type='production_batch' then
    select jsonb_build_object('type',source_type,'id',id,'code',production_run_number) into result from public.production_runs where workspace_id=wid and id=source_id;
  elsif source_type='production_output' then
    select jsonb_build_object('type',source_type,'id',id,'code',internal_output_code) into result from public.production_outputs where workspace_id=wid and id::text=source_id;
  elsif source_type='packaging_run' then
    select jsonb_build_object('type',source_type,'id',id,'code',internal_run_code) into result from public.packaging_runs where workspace_id=wid and id::text=source_id;
  elsif source_type='finished_goods_lot' then
    select jsonb_build_object('type',source_type,'id',id,'code',consumer_batch_code) into result from public.finished_goods_lots where workspace_id=wid and id::text=source_id;
  elsif source_type='released_finished_goods_inventory_lot' then
    select jsonb_build_object('type',source_type,'id',id,'code',internal_lot_code) into result from public.released_finished_goods_inventory_lots where workspace_id=wid and id::text=source_id;
  elsif source_type='consumer_batch_code' then
    select jsonb_build_object('type',source_type,'id',id,'code',consumer_batch_code) into result from public.finished_goods_lots where workspace_id=wid and consumer_batch_code=source_id order by id limit 1;
  elsif source_type='finished_goods_quality_review' then
    select jsonb_build_object('type',source_type,'id',id,'code','Review '||review_sequence,'finishedGoodsLotId',finished_goods_lot_id) into result from public.finished_goods_disposition_reviews where workspace_id=wid and id::text=source_id;
  elsif source_type='supplier_raw_material_lot' then
    select jsonb_build_object('type',source_type,'id',id,'code',supplier_lot_number,'canonicalLotId',id) into result from public.inventory_lots where workspace_id=wid and supplier_lot_number=source_id order by id limit 1;
  elsif source_type='supplier_packaging_lot' then
    select jsonb_build_object('type',source_type,'id',id,'code',supplier_lot_number,'canonicalLotId',id) into result from public.packaging_inventory_lots where workspace_id=wid and supplier_lot_number=source_id order by id limit 1;
  elsif source_type in ('traceability_integrity_finding','other_documented_source') then
    if length(btrim(source_id))>=3 then result:=jsonb_build_object('type',source_type,'id',source_id,'code',source_id,'documented',true); end if;
  end if;
  if result is null then raise exception 'SOURCE_NOT_FOUND'; end if;
  return result;
end $$;

revoke all on function public.kf_recall_workspace_v1() from public,anon,authenticated;
revoke all on function public.kf_recall_validate_identity_v1(uuid,text,text) from public,anon,authenticated;

create function public.create_recall_readiness_case_v1(
  candidate_title text,candidate_issue_summary text,candidate_concern_category text,
  candidate_discovery_at timestamptz,candidate_source_type text,candidate_source_id text,
  candidate_evidence_pending boolean,candidate_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid:=public.kf_recall_workspace_v1(); identity jsonb;
  fp text; existing public.recall_readiness_events; seq integer; code text; item public.recall_readiness_cases;
begin
  identity:=public.kf_recall_validate_identity_v1(wid,candidate_source_type,candidate_source_id);
  fp:=md5(jsonb_build_object('title',btrim(candidate_title),'summary',btrim(candidate_issue_summary),
    'category',candidate_concern_category,'discovery',candidate_discovery_at,'identity',identity,
    'evidencePending',candidate_evidence_pending)::text);
  select * into existing from public.recall_readiness_events where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then
    if existing.payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    select * into item from public.recall_readiness_cases where id=existing.case_id;
    return jsonb_build_object('case',to_jsonb(item),'retry',true);
  end if;
  insert into public.recall_readiness_case_sequences(workspace_id,calendar_year,last_value)
    values(wid,extract(year from statement_timestamp())::integer,1)
    on conflict(workspace_id,calendar_year) do update set last_value=public.recall_readiness_case_sequences.last_value+1
    returning last_value into seq;
  code:='RR-'||to_char(statement_timestamp(),'YYYY')||'-'||lpad(seq::text,4,'0');
  insert into public.recall_readiness_cases(workspace_id,owner_id,case_code,title,issue_summary,concern_category,
    initiating_source_type,initiating_source_id,initiating_source_code,initial_discovery_at,discovered_by,created_by)
    values(wid,uid,code,btrim(candidate_title),btrim(candidate_issue_summary),candidate_concern_category,
      candidate_source_type,identity->>'id',identity->>'code',candidate_discovery_at,uid,uid) returning * into item;
  insert into public.recall_readiness_events(workspace_id,case_id,event_type,actor_id,idempotency_key,payload_fingerprint,metadata)
    values(wid,item.id,'case_created',uid,candidate_idempotency_key,fp,jsonb_build_object('caseCode',code,'identity',identity,'evidencePending',candidate_evidence_pending));
  return jsonb_build_object('case',to_jsonb(item),'retry',false);
end $$;

create function public.create_recall_readiness_revision_v1(
  target_case_id uuid,expected_case_revision integer,candidate_severity text,candidate_urgency text,
  candidate_exposure_state text,candidate_exposure_unknown_acknowledged boolean,
  candidate_health_hazard_narrative text,candidate_compliance_narrative text,
  candidate_operator_recommendation text,candidate_recommended_action text,
  candidate_distribution_limitation_acknowledged boolean,candidate_evidence_pending_acknowledged boolean,
  candidate_supersession_reason text,candidate_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid:=public.kf_recall_workspace_v1(); c public.recall_readiness_cases;
  previous public.recall_readiness_case_revisions; item public.recall_readiness_case_revisions; identity jsonb;
  fp text; n integer; existing public.recall_readiness_events;
begin
  select * into c from public.recall_readiness_cases where workspace_id=wid and id=target_case_id for update;
  if c.id is null then raise exception 'CASE_NOT_FOUND'; end if;
  if c.revision<>expected_case_revision then raise exception 'REVISION_CONFLICT'; end if;
  select * into previous from public.recall_readiness_case_revisions where id=c.latest_revision_id;
  if previous.status='approved' and nullif(btrim(candidate_supersession_reason),'') is null then raise exception 'SUPERSESSION_REASON_REQUIRED'; end if;
  identity:=public.kf_recall_validate_identity_v1(wid,c.initiating_source_type,c.initiating_source_id);
  n:=coalesce(previous.revision_number,0)+1;
  fp:=md5(jsonb_build_object('case',c.id,'revision',n,'category',c.concern_category,'severity',candidate_severity,
    'urgency',candidate_urgency,'exposure',candidate_exposure_state,'exposureAck',candidate_exposure_unknown_acknowledged,
    'health',btrim(candidate_health_hazard_narrative),'compliance',btrim(candidate_compliance_narrative),
    'recommendation',btrim(candidate_operator_recommendation),'action',candidate_recommended_action,
    'distributionAck',candidate_distribution_limitation_acknowledged,'evidencePending',candidate_evidence_pending_acknowledged,
    'identity',identity,'supersedes',previous.id,'reason',candidate_supersession_reason)::text);
  select * into existing from public.recall_readiness_events where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then
    if existing.payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    select * into item from public.recall_readiness_case_revisions where id=existing.revision_id;
    return jsonb_build_object('revision',to_jsonb(item),'case',to_jsonb(c),'retry',true);
  end if;
  if previous.id is not null then update public.recall_readiness_case_revisions set status='superseded' where id=previous.id and status='draft'; end if;
  insert into public.recall_readiness_case_revisions(workspace_id,owner_id,case_id,revision_number,supersedes_revision_id,
    supersession_reason,concern_category,severity,urgency,exposure_state,exposure_unknown_acknowledged,
    health_hazard_narrative,compliance_narrative,operator_recommendation,recommended_action,
    distribution_limitation_acknowledged,evidence_pending_acknowledged,initiating_identity,fingerprint,created_by)
    values(wid,uid,c.id,n,previous.id,nullif(btrim(candidate_supersession_reason),''),
      c.concern_category,candidate_severity,candidate_urgency,candidate_exposure_state,candidate_exposure_unknown_acknowledged,
      btrim(candidate_health_hazard_narrative),btrim(candidate_compliance_narrative),btrim(candidate_operator_recommendation),
      candidate_recommended_action,candidate_distribution_limitation_acknowledged,candidate_evidence_pending_acknowledged,
      identity,fp,uid) returning * into item;
  update public.recall_readiness_cases set latest_revision_id=item.id,revision=revision+1,lifecycle_state='under_assessment',
    updated_at=statement_timestamp() where id=c.id returning * into c;
  insert into public.recall_readiness_events(workspace_id,case_id,revision_id,event_type,actor_id,idempotency_key,payload_fingerprint,metadata)
    values(wid,c.id,item.id,'assessment_revision_created',uid,candidate_idempotency_key,fp,jsonb_build_object('revisionNumber',n,'supersedes',previous.id));
  return jsonb_build_object('revision',to_jsonb(item),'case',to_jsonb(c),'retry',false);
end $$;

create function public.register_recall_readiness_evidence_v1(
  target_case_id uuid,target_revision_id uuid,candidate_type text,candidate_title text,
  candidate_description text,candidate_storage_reference text,candidate_document_reference text,
  candidate_content_hash text,candidate_metadata jsonb,candidate_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid:=public.kf_recall_workspace_v1(); item public.recall_readiness_evidence;
  fp text:=md5(jsonb_build_object('case',target_case_id,'revision',target_revision_id,'type',candidate_type,
    'title',candidate_title,'description',candidate_description,'storage',candidate_storage_reference,
    'document',candidate_document_reference,'hash',candidate_content_hash,'metadata',candidate_metadata)::text);
  existing public.recall_readiness_events;
begin
  if not exists(select 1 from public.recall_readiness_cases where workspace_id=wid and id=target_case_id) then raise exception 'CASE_NOT_FOUND'; end if;
  if target_revision_id is not null and not exists(select 1 from public.recall_readiness_case_revisions where workspace_id=wid and case_id=target_case_id and id=target_revision_id and status<>'approved') then raise exception 'REVISION_IMMUTABLE_OR_NOT_FOUND'; end if;
  if candidate_storage_reference is null and candidate_document_reference is null and nullif(btrim(candidate_description),'') is null then raise exception 'EVIDENCE_REFERENCE_REQUIRED'; end if;
  select * into existing from public.recall_readiness_events where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then
    if existing.payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    select * into item from public.recall_readiness_evidence where id=(existing.metadata->>'evidenceId')::uuid;
    return jsonb_build_object('evidence',to_jsonb(item),'retry',true);
  end if;
  insert into public.recall_readiness_evidence(workspace_id,owner_id,case_id,revision_id,evidence_type,title,description,
    storage_reference,document_reference,content_hash,metadata,uploaded_by)
    values(wid,uid,target_case_id,target_revision_id,candidate_type,btrim(candidate_title),btrim(candidate_description),
      candidate_storage_reference,candidate_document_reference,candidate_content_hash,coalesce(candidate_metadata,'{}'::jsonb),uid)
    returning * into item;
  insert into public.recall_readiness_events(workspace_id,case_id,revision_id,event_type,actor_id,idempotency_key,payload_fingerprint,metadata)
    values(wid,target_case_id,target_revision_id,'evidence_added',uid,candidate_idempotency_key,fp,jsonb_build_object('evidenceId',item.id,'type',candidate_type));
  return jsonb_build_object('evidence',to_jsonb(item),'retry',false);
end $$;

create function public.generate_recall_readiness_scope_v1(
  target_case_id uuid,target_revision_id uuid,candidate_scope_policy_version text,
  candidate_idempotency_key uuid,expected_case_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid:=public.kf_recall_workspace_v1(); c public.recall_readiness_cases;
  rev public.recall_readiness_case_revisions; identity jsonb; trace jsonb; affected jsonb:='[]'::jsonb;
  fg jsonb; impact jsonb; snap public.recall_readiness_scope_snapshots; good_id uuid;
  gaps jsonb:='[]'::jsonb; confidence text; totals jsonb; fp text; existing public.recall_readiness_events;
  evaluated timestamptz:=statement_timestamp();
begin
  if candidate_scope_policy_version<>'1.0.0' then raise exception 'UNSUPPORTED_SCOPE_POLICY'; end if;
  select * into c from public.recall_readiness_cases where workspace_id=wid and id=target_case_id for update;
  if c.id is null then raise exception 'CASE_NOT_FOUND'; end if;
  if c.revision<>expected_case_revision then raise exception 'REVISION_CONFLICT'; end if;
  select * into rev from public.recall_readiness_case_revisions where workspace_id=wid and case_id=c.id and id=target_revision_id;
  if rev.id is null or c.latest_revision_id<>rev.id then raise exception 'STALE_REVISION'; end if;
  if rev.status='approved' then raise exception 'REVISION_IMMUTABLE'; end if;
  identity:=public.kf_recall_validate_identity_v1(wid,c.initiating_source_type,c.initiating_source_id);
  if c.initiating_source_type in ('raw_material_inventory_lot','supplier_raw_material_lot') then
    trace:=public.kf_forward_trace_result_v1(wid,'raw_material_inventory_lot',coalesce(identity->>'canonicalLotId',identity->>'id'));
    affected:=coalesce(trace->'affectedFinishedGoods','[]'::jsonb);
  elsif c.initiating_source_type in ('packaging_inventory_lot','supplier_packaging_lot') then
    trace:=public.kf_forward_trace_result_v1(wid,'packaging_inventory_lot',coalesce(identity->>'canonicalLotId',identity->>'id'));
    affected:=coalesce(trace->'affectedFinishedGoods','[]'::jsonb);
  elsif c.initiating_source_type in ('finished_goods_lot','consumer_batch_code','released_finished_goods_inventory_lot','finished_goods_quality_review') then
    declare lot_id uuid;
    begin
      if c.initiating_source_type='released_finished_goods_inventory_lot' then
        select finished_goods_lot_id into lot_id from public.released_finished_goods_inventory_lots where workspace_id=wid and id::text=identity->>'id';
      elsif c.initiating_source_type='finished_goods_quality_review' then lot_id:=(identity->>'finishedGoodsLotId')::uuid;
      else lot_id:=(identity->>'id')::uuid; end if;
      trace:=public.kf_finished_goods_backward_trace_v1(wid,lot_id);
      select jsonb_agg(jsonb_build_object('finishedGoodsLotId',l.id,'consumerBatchCode',l.consumer_batch_code,
        'product',l.product_snapshot,'exactFinishedGoodsLotQuantity',l.quantity,'unit',l.unit,
        'productionBatchId',l.production_run_id,'productionOutputId',l.production_output_id,
        'packagingRunId',l.packaging_run_id,'quantityAttribution','exact_finished_goods_identity',
        'currentInventoryImpact',public.kf_traceability_inventory_impact_v1(wid,l.id),
        'tracePath',jsonb_build_array(l.production_run_id,l.production_output_id,l.packaging_run_id,l.id))
        order by l.id) into affected from public.finished_goods_lots l where l.workspace_id=wid and l.id=lot_id;
    end;
  elsif c.initiating_source_type='production_batch' then
    trace:=public.get_production_batch_trace_v1(identity->>'id');
    select coalesce(jsonb_agg(jsonb_build_object('finishedGoodsLotId',l.id,'consumerBatchCode',l.consumer_batch_code,
      'product',l.product_snapshot,'exactFinishedGoodsLotQuantity',l.quantity,'unit',l.unit,'productionBatchId',l.production_run_id,
      'productionOutputId',l.production_output_id,'packagingRunId',l.packaging_run_id,'quantityAttribution','exact_finished_goods_identity',
      'currentInventoryImpact',public.kf_traceability_inventory_impact_v1(wid,l.id),'tracePath',jsonb_build_array(l.production_run_id,l.production_output_id,l.packaging_run_id,l.id))
      order by l.id),'[]'::jsonb) into affected from public.finished_goods_lots l where l.workspace_id=wid and l.production_run_id=identity->>'id';
  elsif c.initiating_source_type in ('production_output','packaging_run') then
    if c.initiating_source_type='packaging_run' then trace:=public.get_packaging_run_trace_v1((identity->>'id')::uuid);
    else trace:=jsonb_build_object('root',identity,'policyVersion','1.0.0','confidence',jsonb_build_object('state','complete'),'missingLinks','[]'::jsonb); end if;
    select coalesce(jsonb_agg(jsonb_build_object('finishedGoodsLotId',l.id,'consumerBatchCode',l.consumer_batch_code,
      'product',l.product_snapshot,'exactFinishedGoodsLotQuantity',l.quantity,'unit',l.unit,'productionBatchId',l.production_run_id,
      'productionOutputId',l.production_output_id,'packagingRunId',l.packaging_run_id,'quantityAttribution','exact_finished_goods_identity',
      'currentInventoryImpact',public.kf_traceability_inventory_impact_v1(wid,l.id),'tracePath',jsonb_build_array(l.production_run_id,l.production_output_id,l.packaging_run_id,l.id))
      order by l.id),'[]'::jsonb) into affected from public.finished_goods_lots l where l.workspace_id=wid and
      ((c.initiating_source_type='production_output' and l.production_output_id::text=identity->>'id') or
       (c.initiating_source_type='packaging_run' and l.packaging_run_id::text=identity->>'id'));
  else
    trace:=jsonb_build_object('root',identity,'policyVersion','1.0.0','confidence',jsonb_build_object('state','blocked'),
      'missingLinks',jsonb_build_array(jsonb_build_object('code','documented_source_requires_trace_root','severity','blocked','reason','A canonical lifecycle identity is required to calculate affected goods.')));
  end if;
  if affected is null then affected:='[]'::jsonb; end if;
  gaps:=coalesce(trace->'missingLinks','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
    'code','distribution_boundary','severity','warning','reason','Customer and distribution tracing are not implemented in the current platform.',
    'scopeImpact','Internal inventory only','readinessImpact','Explicit acknowledgement required','policyVersion','1.0.0'));
  confidence:=case when jsonb_array_length(affected)=0 then 'blocked'
    when coalesce(trace->'confidence'->>'state','complete')='blocked' then 'blocked'
    else 'distribution_incomplete' end;
  totals:=jsonb_build_object('affectedFinishedGoodsLots',jsonb_array_length(affected),
    'quantitySemantics','group_by_product_and_unit','crossUnitTotal','not_applicable',
    'unknownCrossLevelAttribution',true);
  fp:=md5(jsonb_build_object('policy','1.0.0','identity',identity,'traceFingerprint',trace->>'fingerprint',
    'affected',affected,'gaps',gaps,'confidence',confidence,'totals',totals)::text);
  select * into existing from public.recall_readiness_events where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then
    if existing.payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    select * into snap from public.recall_readiness_scope_snapshots where id=(existing.metadata->>'scopeSnapshotId')::uuid;
    return jsonb_build_object('scope',to_jsonb(snap),'retry',true);
  end if;
  if exists(select 1 from public.recall_readiness_scope_snapshots where revision_id=rev.id) then raise exception 'SCOPE_ALREADY_FROZEN'; end if;
  insert into public.recall_readiness_scope_snapshots(workspace_id,owner_id,case_id,revision_id,policy_version,
    traceability_policy_version,traceability_fingerprint,traceability_snapshot,distribution_boundary,scope_confidence,
    quantity_totals,fingerprint,evaluated_at,generated_by)
    values(wid,uid,c.id,rev.id,'1.0.0',coalesce(trace->>'policyVersion','1.0.0'),coalesce(trace->>'fingerprint',md5(trace::text)),
      trace,'no_distribution_records_implemented',confidence,totals,fp,evaluated,uid) returning * into snap;
  for fg in select * from jsonb_array_elements(affected) loop
    declare lot public.finished_goods_lots; released_total numeric:=0; on_hand numeric:=0; available numeric:=0;
      held numeric:=0; blocked numeric:=0; damaged numeric:=0; lost numeric:=0; destroyed numeric:=0; expired numeric:=0;
    begin
      select * into lot from public.finished_goods_lots where workspace_id=wid and id=(fg->>'finishedGoodsLotId')::uuid;
      select coalesce(sum(x.quantity_released),0),coalesce(sum((i->>'onHandQuantity')::numeric),0),
        coalesce(sum((i->>'availableQuantity')::numeric),0),coalesce(sum((i->>'heldQuantity')::numeric),0),
        coalesce(sum((i->>'blockedQuantity')::numeric),0),coalesce(sum((i->>'damagedQuantity')::numeric),0),
        coalesce(sum((i->>'lostQuantity')::numeric),0),coalesce(sum((i->>'destroyedQuantity')::numeric),0),
        coalesce(sum(case when i->>'expiryState'='expired' then (i->>'onHandQuantity')::numeric else 0 end),0)
        into released_total,on_hand,available,held,blocked,damaged,lost,destroyed,expired
        from jsonb_array_elements(coalesce(fg->'currentInventoryImpact','[]'::jsonb)) i
        left join lateral jsonb_to_record(i->'lot') x(quantity_released numeric) on true;
      insert into public.recall_readiness_affected_goods(workspace_id,scope_snapshot_id,finished_goods_lot_id,
        consumer_batch_code,product_snapshot,packaging_snapshot,label_snapshot,formula_snapshot,production_batch_id,
        production_output_id,packaging_run_id,quantity_created,quantity_quarantined,quantity_released,quantity_rejected,
        quantity_active_on_hand,quantity_available,quantity_held,quantity_blocked,quantity_damaged,quantity_lost,
        quantity_destroyed,quantity_expired,quantity_unavailable,quantity_unknown,unit,expiry_date,locations,
        release_reviews,operational_state,trace_path,attribution_type,confidence)
        values(wid,snap.id,lot.id,lot.consumer_batch_code,lot.product_snapshot,lot.packaging_snapshot,lot.label_snapshot,
          lot.formula_snapshot,lot.production_run_id,lot.production_output_id,lot.packaging_run_id,lot.quantity,
          greatest(lot.quantity-released_total,0),released_total,coalesce((select sum(quantity) from public.finished_goods_disposition_reviews where workspace_id=wid and finished_goods_lot_id=lot.id and decision='reject'),0),
          on_hand,available,held,blocked,damaged,lost,destroyed,expired,greatest(lot.quantity-on_hand,0),
          case when fg->>'quantityAttribution' like '%unknown%' then lot.quantity else 0 end,lot.unit,lot.expiry_date,
          coalesce((select jsonb_agg(distinct loc->>'location') from jsonb_array_elements(coalesce(fg->'currentInventoryImpact','[]'::jsonb)) i cross join lateral jsonb_array_elements(coalesce(i->'locations','[]'::jsonb)) loc),'[]'::jsonb),
          coalesce(trace->'quality'->'releaseReviews','[]'::jsonb),case when blocked>0 then 'blocked' when held>0 then 'held' when available>0 then 'available' else 'unavailable' end,
          coalesce(fg->'tracePath','[]'::jsonb),coalesce(fg->>'quantityAttribution','unknown'),confidence)
        returning id into good_id;
      for impact in select * from jsonb_array_elements(coalesce(fg->'currentInventoryImpact','[]'::jsonb)) loop
        insert into public.recall_readiness_inventory_impacts(workspace_id,scope_snapshot_id,affected_good_id,
          released_inventory_lot_id,location,on_hand_quantity,available_quantity,reserved_quantity,held_quantity,
          blocked_quantity,damaged_quantity,lost_quantity,destroyed_quantity,expired_quantity,operational_readiness,
          valuation_snapshot,evaluated_at,source_policy_version)
        values(wid,snap.id,good_id,(impact->'lot'->>'id')::uuid,
          coalesce((impact->'locations'->0->>'location'),impact->'lot'->>'location'),
          coalesce((impact->>'onHandQuantity')::numeric,0),coalesce((impact->>'availableQuantity')::numeric,0),
          coalesce((impact->>'reservedQuantity')::numeric,0),coalesce((impact->>'heldQuantity')::numeric,0),
          coalesce((impact->>'blockedQuantity')::numeric,0),coalesce((impact->>'damagedQuantity')::numeric,0),
          coalesce((impact->>'lostQuantity')::numeric,0),coalesce((impact->>'destroyedQuantity')::numeric,0),
          case when impact->>'expiryState'='expired' then coalesce((impact->>'onHandQuantity')::numeric,0) else 0 end,
          coalesce(impact->>'operationalReadiness','unavailable'),coalesce(impact->'lot'->'cost_snapshot','{}'::jsonb),
          evaluated,'1.0.0');
      end loop;
    end;
  end loop;
  insert into public.recall_readiness_gaps(workspace_id,revision_id,scope_snapshot_id,code,severity,reason,scope_impact,readiness_impact,policy_version)
    select wid,rev.id,snap.id,coalesce(g->>'code',g->>'state','traceability_gap'),
      case when coalesce(g->>'severity','warning') in ('blocked','error') then 'blocked' else 'warning' end,
      coalesce(g->>'reason','Traceability gap'),coalesce(g->>'scopeImpact','Affected scope confidence reduced'),
      coalesce(g->>'readinessImpact','Review required'),'1.0.0'
    from jsonb_array_elements(gaps) g on conflict do nothing;
  update public.recall_readiness_cases set lifecycle_state='awaiting_review',updated_at=statement_timestamp() where id=c.id;
  insert into public.recall_readiness_events(workspace_id,case_id,revision_id,event_type,actor_id,idempotency_key,payload_fingerprint,metadata)
    values(wid,c.id,rev.id,case when rev.revision_number=1 then 'scope_generated' else 'scope_regenerated_for_new_revision' end,
      uid,candidate_idempotency_key,fp,jsonb_build_object('scopeSnapshotId',snap.id,'scopeFingerprint',fp));
  return jsonb_build_object('scope',to_jsonb(snap),'affectedGoods',affected,'gaps',gaps,'retry',false);
end $$;

create function public.get_recall_readiness_decision_readiness_v1(target_case_id uuid,target_revision_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare wid uuid:=public.kf_recall_workspace_v1(); rev public.recall_readiness_case_revisions;
  scope public.recall_readiness_scope_snapshots; blockers jsonb:='[]'::jsonb; warnings jsonb:='[]'::jsonb;
  evidence_count integer; approved_review boolean; evaluated timestamptz:=statement_timestamp();
begin
  select * into rev from public.recall_readiness_case_revisions where workspace_id=wid and case_id=target_case_id and id=target_revision_id;
  if rev.id is null then raise exception 'REVISION_NOT_FOUND'; end if;
  select * into scope from public.recall_readiness_scope_snapshots where revision_id=rev.id;
  select count(*) into evidence_count from public.recall_readiness_evidence where workspace_id=wid and case_id=target_case_id and not superseded;
  select exists(select 1 from public.recall_readiness_reviews where workspace_id=wid and revision_id=rev.id and decision='approve_readiness') into approved_review;
  if scope.id is null then blockers:=blockers||jsonb_build_array('scope_not_generated'); end if;
  if evidence_count=0 and not rev.evidence_pending_acknowledged then blockers:=blockers||jsonb_build_array('evidence_missing'); end if;
  if rev.severity='unknown' then blockers:=blockers||jsonb_build_array('severity_unknown'); end if;
  if rev.urgency='unknown' then blockers:=blockers||jsonb_build_array('urgency_unknown'); end if;
  if rev.exposure_state='unknown' and not rev.exposure_unknown_acknowledged then blockers:=blockers||jsonb_build_array('exposure_unknown_unacknowledged'); end if;
  if nullif(btrim(rev.operator_recommendation),'') is null then blockers:=blockers||jsonb_build_array('recommendation_missing'); end if;
  if not rev.distribution_limitation_acknowledged then blockers:=blockers||jsonb_build_array('distribution_boundary_unacknowledged'); end if;
  if scope.scope_confidence='blocked' then blockers:=blockers||jsonb_build_array('traceability_blocked'); end if;
  if scope.id is not null and not exists(select 1 from public.recall_readiness_affected_goods where scope_snapshot_id=scope.id) then blockers:=blockers||jsonb_build_array('affected_goods_unresolved'); end if;
  if not approved_review then blockers:=blockers||jsonb_build_array('required_review_missing'); end if;
  warnings:=jsonb_build_array('customer_and_distribution_tracing_not_implemented');
  return jsonb_build_object('caseId',target_case_id,'revisionId',rev.id,'scopePolicyVersion',coalesce(scope.policy_version,'1.0.0'),
    'scopeGenerated',scope.id is not null,'scopeFingerprint',scope.fingerprint,'initiatingIdentityValid',true,
    'affectedGoodsIdentified',scope.id is not null and exists(select 1 from public.recall_readiness_affected_goods where scope_snapshot_id=scope.id),
    'quantityReconciliationComplete',scope.id is not null,'currentInventoryCaptured',scope.id is not null,
    'traceabilityConfidence',scope.traceability_snapshot->'confidence','scopeConfidence',scope.scope_confidence,
    'evidenceSufficient',evidence_count>0 or rev.evidence_pending_acknowledged,'severityAssessed',rev.severity<>'unknown',
    'urgencyAssessed',rev.urgency<>'unknown','exposureAssessed',rev.exposure_state<>'unknown' or rev.exposure_unknown_acknowledged,
    'recommendationPresent',nullif(btrim(rev.operator_recommendation),'') is not null,
    'distributionLimitationAcknowledged',rev.distribution_limitation_acknowledged,'requiredReviewerPresent',approved_review,
    'blockers',blockers,'warnings',warnings,'readyForReview',scope.id is not null and not exists(
      select 1 from jsonb_array_elements_text(blockers) blocker where blocker<>'required_review_missing'),
    'readyForApproval',jsonb_array_length(blockers)=0,'evaluatedAt',evaluated);
end $$;

create function public.submit_recall_readiness_review_v1(
  target_case_id uuid,target_revision_id uuid,candidate_revision_fingerprint text,
  candidate_role text,candidate_decision text,candidate_rationale text,candidate_evidence_reviewed jsonb,
  candidate_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid:=public.kf_recall_workspace_v1(); rev public.recall_readiness_case_revisions;
  item public.recall_readiness_reviews; fp text; existing public.recall_readiness_events;
begin
  select * into rev from public.recall_readiness_case_revisions where workspace_id=wid and case_id=target_case_id and id=target_revision_id;
  if rev.id is null then raise exception 'REVISION_NOT_FOUND'; end if;
  if rev.status in ('approved','superseded') then raise exception 'STALE_REVISION'; end if;
  if rev.fingerprint<>candidate_revision_fingerprint then raise exception 'FINGERPRINT_MISMATCH'; end if;
  fp:=md5(jsonb_build_object('revision',rev.id,'fingerprint',candidate_revision_fingerprint,'role',candidate_role,
    'decision',candidate_decision,'rationale',candidate_rationale,'evidence',candidate_evidence_reviewed)::text);
  select * into existing from public.recall_readiness_events where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then
    if existing.payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    select * into item from public.recall_readiness_reviews where id=(existing.metadata->>'reviewId')::uuid;
    return jsonb_build_object('review',to_jsonb(item),'retry',true);
  end if;
  insert into public.recall_readiness_reviews(workspace_id,case_id,revision_id,reviewer_id,reviewer_role,decision,
    rationale,revision_fingerprint,evidence_reviewed)
    values(wid,target_case_id,rev.id,uid,candidate_role,candidate_decision,btrim(candidate_rationale),rev.fingerprint,
      coalesce(candidate_evidence_reviewed,'[]'::jsonb)) returning * into item;
  if candidate_decision='request_revision' then update public.recall_readiness_cases set lifecycle_state='under_assessment',updated_at=statement_timestamp() where id=target_case_id; end if;
  insert into public.recall_readiness_events(workspace_id,case_id,revision_id,event_type,actor_id,idempotency_key,payload_fingerprint,metadata)
    values(wid,target_case_id,rev.id,case when candidate_decision='request_revision' then 'revision_requested' else 'review_submitted' end,
      uid,candidate_idempotency_key,fp,jsonb_build_object('reviewId',item.id,'decision',candidate_decision));
  return jsonb_build_object('review',to_jsonb(item),'retry',false);
end $$;

create function public.approve_recall_readiness_revision_v1(
  target_case_id uuid,target_revision_id uuid,candidate_revision_fingerprint text,candidate_scope_fingerprint text,
  candidate_distribution_acknowledged boolean,candidate_non_execution_acknowledged boolean,
  expected_case_revision integer,candidate_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid:=public.kf_recall_workspace_v1(); c public.recall_readiness_cases;
  rev public.recall_readiness_case_revisions; scope public.recall_readiness_scope_snapshots;
  ready jsonb; item public.recall_readiness_approvals; fp text; existing public.recall_readiness_events;
begin
  select * into c from public.recall_readiness_cases where workspace_id=wid and id=target_case_id for update;
  if c.id is null then raise exception 'CASE_NOT_FOUND'; end if;
  if c.revision<>expected_case_revision or c.latest_revision_id<>target_revision_id then raise exception 'STALE_REVISION'; end if;
  select * into rev from public.recall_readiness_case_revisions where id=target_revision_id;
  select * into scope from public.recall_readiness_scope_snapshots where revision_id=target_revision_id;
  if rev.fingerprint<>candidate_revision_fingerprint or scope.fingerprint<>candidate_scope_fingerprint then raise exception 'FINGERPRINT_MISMATCH'; end if;
  if not candidate_distribution_acknowledged or not candidate_non_execution_acknowledged then raise exception 'ACKNOWLEDGEMENT_REQUIRED'; end if;
  ready:=public.get_recall_readiness_decision_readiness_v1(target_case_id,target_revision_id);
  if not (ready->>'readyForApproval')::boolean then raise exception 'READINESS_BLOCKED: %',ready->'blockers'; end if;
  fp:=md5(jsonb_build_object('case',c.id,'revision',rev.id,'revisionFingerprint',rev.fingerprint,
    'scopeFingerprint',scope.fingerprint,'distributionAck',candidate_distribution_acknowledged,
    'nonExecutionAck',candidate_non_execution_acknowledged)::text);
  select * into existing from public.recall_readiness_events where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then
    if existing.payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    select * into item from public.recall_readiness_approvals where revision_id=rev.id;
    return jsonb_build_object('approval',to_jsonb(item),'retry',true);
  end if;
  insert into public.recall_readiness_approvals(workspace_id,case_id,revision_id,revision_fingerprint,scope_fingerprint,
    approved_by,distribution_limitation_acknowledged,non_execution_acknowledged)
    values(wid,c.id,rev.id,rev.fingerprint,scope.fingerprint,uid,true,true) returning * into item;
  update public.recall_readiness_case_revisions set status='approved' where id=rev.id;
  update public.recall_readiness_cases set approved_revision_id=rev.id,lifecycle_state='approved_readiness',
    revision=revision+1,updated_at=statement_timestamp() where id=c.id returning * into c;
  insert into public.recall_readiness_events(workspace_id,case_id,revision_id,event_type,actor_id,idempotency_key,payload_fingerprint,metadata)
    values(wid,c.id,rev.id,'readiness_approved',uid,candidate_idempotency_key,fp,
      jsonb_build_object('approvalId',item.id,'scopeFingerprint',scope.fingerprint,'executionCreated',false));
  return jsonb_build_object('approval',to_jsonb(item),'case',to_jsonb(c),'retry',false);
end $$;

create function public.get_recall_readiness_case_v1(target_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare wid uuid:=public.kf_recall_workspace_v1(); c public.recall_readiness_cases;
begin
  select * into c from public.recall_readiness_cases where workspace_id=wid and id=target_case_id;
  if c.id is null then raise exception 'CASE_NOT_FOUND'; end if;
  return jsonb_build_object('case',to_jsonb(c),
    'revisions',coalesce((select jsonb_agg(to_jsonb(r) order by revision_number) from public.recall_readiness_case_revisions r where r.workspace_id=wid and r.case_id=c.id),'[]'::jsonb),
    'scopes',coalesce((select jsonb_agg(to_jsonb(s) order by generated_at) from public.recall_readiness_scope_snapshots s where s.workspace_id=wid and s.case_id=c.id),'[]'::jsonb),
    'affectedGoods',coalesce((select jsonb_agg(to_jsonb(a) order by consumer_batch_code,a.id) from public.recall_readiness_affected_goods a join public.recall_readiness_scope_snapshots s on s.id=a.scope_snapshot_id where a.workspace_id=wid and s.case_id=c.id),'[]'::jsonb),
    'inventoryImpacts',coalesce((select jsonb_agg(to_jsonb(i) order by i.released_inventory_lot_id,i.location) from public.recall_readiness_inventory_impacts i join public.recall_readiness_scope_snapshots s on s.id=i.scope_snapshot_id where i.workspace_id=wid and s.case_id=c.id),'[]'::jsonb),
    'gaps',coalesce((select jsonb_agg(to_jsonb(g) order by g.severity,g.code) from public.recall_readiness_gaps g join public.recall_readiness_case_revisions r on r.id=g.revision_id where g.workspace_id=wid and r.case_id=c.id),'[]'::jsonb),
    'evidence',coalesce((select jsonb_agg(to_jsonb(e) order by uploaded_at,id) from public.recall_readiness_evidence e where e.workspace_id=wid and e.case_id=c.id),'[]'::jsonb),
    'reviews',coalesce((select jsonb_agg(to_jsonb(r) order by reviewed_at,id) from public.recall_readiness_reviews r where r.workspace_id=wid and r.case_id=c.id),'[]'::jsonb),
    'approvals',coalesce((select jsonb_agg(to_jsonb(a) order by approved_at,id) from public.recall_readiness_approvals a where a.workspace_id=wid and a.case_id=c.id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by occurred_at,id) from public.recall_readiness_events e where e.workspace_id=wid and e.case_id=c.id),'[]'::jsonb));
end $$;

create function public.list_recall_readiness_cases_v1(candidate_filters jsonb default '{}'::jsonb,candidate_limit integer default 50,candidate_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare wid uuid:=public.kf_recall_workspace_v1();
begin
  return coalesce((select jsonb_agg(item order by item->>'updatedAt' desc,item->>'id') from (
    select jsonb_build_object('id',c.id,'caseCode',c.case_code,'title',c.title,'concernCategory',c.concern_category,
      'state',c.lifecycle_state,'initiatingIdentity',jsonb_build_object('type',c.initiating_source_type,'id',c.initiating_source_id,'code',c.initiating_source_code),
      'revision',c.revision,'latestRevisionId',c.latest_revision_id,'approvedRevisionId',c.approved_revision_id,
      'severity',r.severity,'urgency',r.urgency,'scopeConfidence',s.scope_confidence,
      'affectedFinishedGoodsLotCount',coalesce((select count(*) from public.recall_readiness_affected_goods a where a.scope_snapshot_id=s.id),0),
      'activeOnHandImpact',coalesce((select sum(a.quantity_active_on_hand) from public.recall_readiness_affected_goods a where a.scope_snapshot_id=s.id),0),
      'updatedAt',c.updated_at) item
    from public.recall_readiness_cases c left join public.recall_readiness_case_revisions r on r.id=c.latest_revision_id
    left join public.recall_readiness_scope_snapshots s on s.revision_id=r.id
    where c.workspace_id=wid
      and (candidate_filters->>'state' is null or c.lifecycle_state=candidate_filters->>'state')
      and (candidate_filters->>'severity' is null or r.severity=candidate_filters->>'severity')
      and (candidate_filters->>'urgency' is null or r.urgency=candidate_filters->>'urgency')
      and (candidate_filters->>'concernCategory' is null or c.concern_category=candidate_filters->>'concernCategory')
    order by c.updated_at desc,c.id limit least(greatest(candidate_limit,1),100) offset greatest(candidate_offset,0)
  )q),'[]'::jsonb);
end $$;

create function public.compare_recall_scope_to_live_inventory_v1(target_revision_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare wid uuid:=public.kf_recall_workspace_v1(); scope public.recall_readiness_scope_snapshots;
begin
  select * into scope from public.recall_readiness_scope_snapshots where workspace_id=wid and revision_id=target_revision_id;
  if scope.id is null then raise exception 'SCOPE_NOT_FOUND'; end if;
  return jsonb_build_object('revisionId',target_revision_id,'scopeFingerprint',scope.fingerprint,'frozenEvaluatedAt',scope.evaluated_at,
    'comparedAt',statement_timestamp(),'label','Current live comparison',
    'changes',coalesce((select jsonb_agg(jsonb_build_object('releasedInventoryLotId',i.released_inventory_lot_id,
      'frozen',to_jsonb(i),'live',live,'quantityChanged',(live->>'onHandQuantity')::numeric<>i.on_hand_quantity,
      'locationChanged',coalesce(live->'locations','[]'::jsonb)<>to_jsonb(array[i.location]),
      'heldStateChanged',(live->>'heldQuantity')::numeric<>i.held_quantity,
      'blockedStateChanged',(live->>'blockedQuantity')::numeric<>i.blocked_quantity,
      'damageChanged',(live->>'damagedQuantity')::numeric<>i.damaged_quantity,
      'destructionChanged',(live->>'destroyedQuantity')::numeric<>i.destroyed_quantity,
      'expiryStateChanged',(live->>'expiryState'='expired')<>(i.expired_quantity>0))
      order by i.released_inventory_lot_id)
      from public.recall_readiness_inventory_impacts i
      cross join lateral public.kf_finished_goods_inventory_snapshot_v1(wid,i.released_inventory_lot_id) live
      where i.scope_snapshot_id=scope.id),'[]'::jsonb));
end $$;

create function public.compare_recall_readiness_revisions_v1(target_left_revision_id uuid,target_right_revision_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare wid uuid:=public.kf_recall_workspace_v1(); l public.recall_readiness_case_revisions; r public.recall_readiness_case_revisions;
  ls public.recall_readiness_scope_snapshots; rs public.recall_readiness_scope_snapshots;
begin
  select * into l from public.recall_readiness_case_revisions where workspace_id=wid and id=target_left_revision_id;
  select * into r from public.recall_readiness_case_revisions where workspace_id=wid and id=target_right_revision_id and case_id=l.case_id;
  if l.id is null or r.id is null then raise exception 'REVISION_NOT_FOUND'; end if;
  select * into ls from public.recall_readiness_scope_snapshots where revision_id=l.id;
  select * into rs from public.recall_readiness_scope_snapshots where revision_id=r.id;
  return jsonb_build_object('leftRevision',to_jsonb(l),'rightRevision',to_jsonb(r),
    'fieldChanges',jsonb_build_object('severity',l.severity is distinct from r.severity,'urgency',l.urgency is distinct from r.urgency,
      'exposure',l.exposure_state is distinct from r.exposure_state,'recommendation',l.recommended_action is distinct from r.recommended_action),
    'scopeFingerprintChanged',ls.fingerprint is distinct from rs.fingerprint,
    'addedFinishedGoods',coalesce((select jsonb_agg(to_jsonb(a) order by consumer_batch_code) from public.recall_readiness_affected_goods a where a.scope_snapshot_id=rs.id and not exists(select 1 from public.recall_readiness_affected_goods old where old.scope_snapshot_id=ls.id and old.finished_goods_lot_id=a.finished_goods_lot_id)),'[]'::jsonb),
    'removedFinishedGoods',coalesce((select jsonb_agg(to_jsonb(a) order by consumer_batch_code) from public.recall_readiness_affected_goods a where a.scope_snapshot_id=ls.id and not exists(select 1 from public.recall_readiness_affected_goods newer where newer.scope_snapshot_id=rs.id and newer.finished_goods_lot_id=a.finished_goods_lot_id)),'[]'::jsonb));
end $$;

create function public.close_recall_readiness_case_v1(target_case_id uuid,expected_case_revision integer,
  candidate_closure_state text,candidate_reason text,candidate_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); wid uuid:=public.kf_recall_workspace_v1(); c public.recall_readiness_cases;
  fp text:=md5(jsonb_build_object('case',target_case_id,'state',candidate_closure_state,'reason',candidate_reason)::text);
  existing public.recall_readiness_events;
begin
  if candidate_closure_state not in ('closed_no_action','cancelled_duplicate','cancelled_invalid_source','superseded_by_other_case','closed_after_external_handling') then raise exception 'INVALID_CLOSURE_STATE'; end if;
  select * into c from public.recall_readiness_cases where workspace_id=wid and id=target_case_id for update;
  if c.id is null then raise exception 'CASE_NOT_FOUND'; end if;
  if c.revision<>expected_case_revision then raise exception 'REVISION_CONFLICT'; end if;
  select * into existing from public.recall_readiness_events where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then
    if existing.payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('case',to_jsonb(c),'retry',true);
  end if;
  update public.recall_readiness_cases set lifecycle_state=case when candidate_closure_state='closed_no_action' then 'closed_no_action' when candidate_closure_state='superseded_by_other_case' then 'superseded' else 'cancelled' end,
    closure_reason=btrim(candidate_reason),closed_at=statement_timestamp(),closed_by=uid,revision=revision+1,updated_at=statement_timestamp()
    where id=c.id returning * into c;
  insert into public.recall_readiness_events(workspace_id,case_id,revision_id,event_type,actor_id,idempotency_key,payload_fingerprint,metadata)
    values(wid,c.id,c.latest_revision_id,case when candidate_closure_state='superseded_by_other_case' then 'case_superseded' else 'case_closed' end,
      uid,candidate_idempotency_key,fp,jsonb_build_object('closureState',candidate_closure_state,'reason',candidate_reason));
  return jsonb_build_object('case',to_jsonb(c),'retry',false);
end $$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.create_recall_readiness_case_v1(text,text,text,timestamptz,text,text,boolean,uuid)',
    'public.create_recall_readiness_revision_v1(uuid,integer,text,text,text,boolean,text,text,text,text,boolean,boolean,text,uuid)',
    'public.register_recall_readiness_evidence_v1(uuid,uuid,text,text,text,text,text,text,jsonb,uuid)',
    'public.generate_recall_readiness_scope_v1(uuid,uuid,text,uuid,integer)',
    'public.get_recall_readiness_decision_readiness_v1(uuid,uuid)',
    'public.submit_recall_readiness_review_v1(uuid,uuid,text,text,text,text,jsonb,uuid)',
    'public.approve_recall_readiness_revision_v1(uuid,uuid,text,text,boolean,boolean,integer,uuid)',
    'public.get_recall_readiness_case_v1(uuid)','public.list_recall_readiness_cases_v1(jsonb,integer,integer)',
    'public.compare_recall_scope_to_live_inventory_v1(uuid)','public.compare_recall_readiness_revisions_v1(uuid,uuid)',
    'public.close_recall_readiness_case_v1(uuid,integer,text,text,uuid)'
  ] loop
    execute format('revoke all on function %s from public,anon',fn);
    execute format('grant execute on function %s to authenticated',fn);
  end loop;
end $$;
