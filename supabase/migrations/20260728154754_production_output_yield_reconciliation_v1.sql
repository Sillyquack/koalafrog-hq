-- Finished Goods & Batch Genealogy V1, Slice 1.
-- Controlled Production Output identity, measurement, reconciliation and completion.

alter table public.production_runs
  add column output_stage_status text not null default 'not_started'
    check(output_stage_status in('not_started','in_progress','completed')),
  add column output_stage_completed_by uuid,
  add column output_stage_completed_at timestamptz;

create function public.default_production_output_stage()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  new.output_stage_status:=coalesce(new.output_stage_status,'not_started');
  return new;
end $$;
create trigger default_production_output_stage before insert on public.production_runs
for each row execute function public.default_production_output_stage();

create table public.production_outputs(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  production_run_id text not null,
  product_id text not null,
  formula_id text not null,
  formula_version_id text not null,
  output_type text not null default 'bulk' check(output_type in('bulk','intermediate')),
  output_sequence integer not null check(output_sequence>0),
  internal_output_code text not null,
  output_label text not null,
  theoretical_quantity numeric not null check(theoretical_quantity>0 and theoretical_quantity<=1000000000),
  theoretical_unit text not null check(theoretical_unit in('mg','g','kg','ml','l')),
  theoretical_normalized_quantity numeric not null check(theoretical_normalized_quantity>0),
  theoretical_normalized_unit text not null check(theoretical_normalized_unit in('g','ml')),
  theoretical_yield_basis text not null,
  theoretical_override_reason text,
  theoretical_override_evidence text,
  batch_number_snapshot text not null,
  product_name_snapshot text not null,
  formula_name_snapshot text not null,
  formula_version_snapshot text not null,
  batch_scale_quantity_snapshot numeric not null,
  batch_scale_unit_snapshot text not null,
  production_completion_policy_version text not null,
  material_cost_snapshot numeric,
  material_cost_currency text,
  material_cost_confidence text not null check(material_cost_confidence in('complete','partial','unknown')),
  unresolved_cost_count integer not null default 0 check(unresolved_cost_count>=0),
  measurement_basis text not null,
  location text not null,
  status text not null default 'draft' check(status in('draft','measured','reconciled','completed','cancelled')),
  revision bigint not null default 1 check(revision>0),
  creation_idempotency_key uuid not null,
  creation_payload_fingerprint text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  completed_by uuid,
  completed_at timestamptz,
  unique(workspace_id,id),
  unique(workspace_id,production_run_id,output_sequence),
  unique(workspace_id,internal_output_code),
  unique(workspace_id,creation_idempotency_key),
  foreign key(workspace_id,production_run_id) references public.production_runs(workspace_id,id),
  foreign key(workspace_id,product_id) references public.products(workspace_id,id),
  foreign key(workspace_id,formula_id) references public.formulas(workspace_id,id),
  foreign key(workspace_id,formula_version_id) references public.formula_versions(workspace_id,id)
);

create table public.production_output_measurements(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  production_output_id uuid not null,
  measurement_version integer not null check(measurement_version>0),
  quantity numeric not null check(quantity>0 and quantity<=1000000000),
  unit text not null check(unit in('mg','g','kg','ml','l')),
  normalized_quantity numeric not null check(normalized_quantity>0),
  normalized_unit text not null check(normalized_unit in('g','ml')),
  measurement_method text not null,
  equipment_reference text,
  vessel_reference text,
  gross_quantity numeric,
  tare_quantity numeric,
  measured_by uuid not null,
  measured_at timestamptz not null,
  evidence_reference text,
  note text not null default '',
  supersedes_measurement_id uuid,
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  created_at timestamptz not null default now(),
  unique(workspace_id,production_output_id,measurement_version),
  unique(workspace_id,idempotency_key),
  foreign key(workspace_id,production_output_id) references public.production_outputs(workspace_id,id),
  foreign key(supersedes_measurement_id) references public.production_output_measurements(id),
  check(gross_quantity is null or tare_quantity is null or gross_quantity>=tare_quantity)
);

create table public.production_output_components(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  production_output_id uuid not null,
  component_type text not null check(component_type in('retained_bulk','bulk_waste','transferred','unexplained_variance')),
  quantity numeric not null check(quantity>=0 and quantity<=1000000000),
  unit text not null check(unit in('mg','g','kg','ml','l')),
  normalized_quantity numeric not null check(normalized_quantity>=0),
  normalized_unit text not null check(normalized_unit in('g','ml')),
  reason text not null,
  evidence_reference text,
  approval_state text not null default 'not_required' check(approval_state in('not_required','pending','approved')),
  recorded_by uuid not null,
  recorded_at timestamptz not null,
  revision bigint not null default 1,
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  created_at timestamptz not null default now(),
  unique(workspace_id,production_output_id,component_type),
  unique(workspace_id,idempotency_key),
  foreign key(workspace_id,production_output_id) references public.production_outputs(workspace_id,id)
);

create table public.production_output_reconciliations(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  production_output_id uuid not null,
  reconciliation_version integer not null check(reconciliation_version>0),
  policy_version text not null,
  actual_normalized_quantity numeric not null,
  retained_normalized_quantity numeric not null,
  waste_normalized_quantity numeric not null,
  transferred_normalized_quantity numeric not null,
  unexplained_normalized_quantity numeric not null,
  equation_difference numeric not null,
  theoretical_variance numeric not null,
  yield_percentage numeric not null,
  tolerance_quantity numeric not null check(tolerance_quantity>=0),
  state text not null check(state in('blocked','reconciled')),
  reason text,
  evidence_reference text,
  approved_by uuid,
  reconciled_by uuid not null,
  reconciled_at timestamptz not null,
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  created_at timestamptz not null default now(),
  unique(workspace_id,production_output_id,reconciliation_version),
  unique(workspace_id,idempotency_key),
  foreign key(workspace_id,production_output_id) references public.production_outputs(workspace_id,id)
);

create table public.production_output_events(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  production_run_id text not null,
  production_output_id uuid,
  formula_version_id text not null,
  event_type text not null check(event_type in(
    'production_output_created','production_output_measurement_recorded',
    'production_output_measurement_superseded','production_output_component_recorded',
    'production_output_variance_recorded','production_output_reconciled',
    'production_output_stage_completed'
  )),
  quantity numeric,
  unit text,
  actor_id uuid not null,
  occurred_at timestamptz not null default now(),
  policy_version text not null,
  output_revision bigint,
  event_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique(workspace_id,event_key),
  foreign key(workspace_id,production_run_id) references public.production_runs(workspace_id,id),
  foreign key(workspace_id,production_output_id) references public.production_outputs(workspace_id,id),
  foreign key(workspace_id,formula_version_id) references public.formula_versions(workspace_id,id)
);

create index production_outputs_run_status_idx on public.production_outputs(workspace_id,production_run_id,status);
create index production_output_measurements_history_idx on public.production_output_measurements(workspace_id,production_output_id,measurement_version desc);
create index production_output_components_output_idx on public.production_output_components(workspace_id,production_output_id,component_type);
create index production_output_reconciliations_history_idx on public.production_output_reconciliations(workspace_id,production_output_id,reconciliation_version desc);
create index production_output_events_run_idx on public.production_output_events(workspace_id,production_run_id,occurred_at,id);
create index production_output_owner_idx on public.production_outputs(owner_id);
create index production_output_measurement_owner_idx on public.production_output_measurements(owner_id);
create index production_output_component_owner_idx on public.production_output_components(owner_id);
create index production_output_reconciliation_owner_idx on public.production_output_reconciliations(owner_id);
create index production_output_event_owner_idx on public.production_output_events(owner_id);

alter table public.production_outputs enable row level security;
alter table public.production_output_measurements enable row level security;
alter table public.production_output_components enable row level security;
alter table public.production_output_reconciliations enable row level security;
alter table public.production_output_events enable row level security;

create policy production_outputs_owner_read on public.production_outputs for select to authenticated using((select auth.uid())=owner_id);
create policy production_output_measurements_owner_read on public.production_output_measurements for select to authenticated using((select auth.uid())=owner_id);
create policy production_output_components_owner_read on public.production_output_components for select to authenticated using((select auth.uid())=owner_id);
create policy production_output_reconciliations_owner_read on public.production_output_reconciliations for select to authenticated using((select auth.uid())=owner_id);
create policy production_output_events_owner_read on public.production_output_events for select to authenticated using((select auth.uid())=owner_id);

revoke all on public.production_outputs,public.production_output_measurements,public.production_output_components,
  public.production_output_reconciliations,public.production_output_events from public,anon,authenticated;
grant select on public.production_outputs,public.production_output_measurements,public.production_output_components,
  public.production_output_reconciliations,public.production_output_events to authenticated;

create function public.kf_output_normalize(q numeric,u text)
returns table(quantity numeric,unit text) language sql immutable security invoker set search_path=public,pg_temp as $$
  select case
    when u='mg' then q/1000 when u='g' then q when u='kg' then q*1000
    when u='ml' then q when u='l' then q*1000 end,
    case when u in('mg','g','kg') then 'g' else 'ml' end
  where u in('mg','g','kg','ml','l') and q is not null
$$;

create function public.kf_production_output_readiness_v1(target_workspace_id uuid,target_run_id text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.production_runs;total integer;active integer;incomplete integer;blockers jsonb;summary jsonb;
begin
  select * into r from public.production_runs where workspace_id=target_workspace_id and id=target_run_id;
  if not found then raise exception 'PRODUCTION_BATCH_UNAVAILABLE';end if;
  select count(*),count(*) filter(where status<>'cancelled'),count(*) filter(where status not in('reconciled','completed','cancelled'))
  into total,active,incomplete from public.production_outputs where workspace_id=target_workspace_id and production_run_id=target_run_id;
  with issues as(
    select 'production_material_not_complete' code,'batch' category,'Complete Production material control first.' action
      where r.status<>'Completed'
    union all select 'actual_output_missing','measurement','Record an actual output measurement.'
      where active=0 or exists(select 1 from public.production_outputs o where o.workspace_id=target_workspace_id and o.production_run_id=target_run_id and o.status not in('cancelled','reconciled','completed')
        and not exists(select 1 from public.production_output_measurements m where m.workspace_id=o.workspace_id and m.production_output_id=o.id))
    union all select 'unexplained_variance','variance','Document and approve output variance.'
      where exists(select 1 from public.production_outputs o join public.production_output_components c on c.workspace_id=o.workspace_id and c.production_output_id=o.id
        where o.workspace_id=target_workspace_id and o.production_run_id=target_run_id and c.component_type='unexplained_variance' and c.normalized_quantity>0 and c.approval_state<>'approved')
    union all select 'reconciliation_required','reconciliation','Reconcile every active Production Output.'
      where active=0 or incomplete>0
  )
  select coalesce(jsonb_agg(jsonb_build_object('blockerCode',code,'category',category,'severity','error','blocksCompletion',true,
    'productionOutputId',null,'quantity',null,'unit',null,'humanMessage',replace(initcap(replace(code,'_',' ')),'.','')||'.',
    'recommendedAction',action,'metadata','{}'::jsonb)),'[]'::jsonb) into blockers from issues;
  select coalesce(jsonb_agg(jsonb_build_object('productionOutputId',o.id,'outputCode',o.internal_output_code,'status',o.status,
    'theoreticalQuantity',o.theoretical_quantity,'theoreticalUnit',o.theoretical_unit,'actualQuantity',m.quantity,'actualUnit',m.unit,
    'retainedQuantity',coalesce(c.retained,0),'wasteQuantity',coalesce(c.waste,0),'transferredQuantity',coalesce(c.transferred,0),
    'unexplainedVariance',coalesce(c.variance,0),'yieldPercentage',x.yield_percentage) order by o.output_sequence),'[]'::jsonb)
  into summary from public.production_outputs o
  left join lateral(select quantity,unit from public.production_output_measurements where workspace_id=o.workspace_id and production_output_id=o.id order by measurement_version desc limit 1)m on true
  left join lateral(select sum(normalized_quantity) filter(where component_type='retained_bulk') retained,
    sum(normalized_quantity) filter(where component_type='bulk_waste') waste,
    sum(normalized_quantity) filter(where component_type='transferred') transferred,
    sum(normalized_quantity) filter(where component_type='unexplained_variance') variance
    from public.production_output_components where workspace_id=o.workspace_id and production_output_id=o.id)c on true
  left join lateral(select yield_percentage from public.production_output_reconciliations where workspace_id=o.workspace_id and production_output_id=o.id order by reconciliation_version desc limit 1)x on true
  where o.workspace_id=target_workspace_id and o.production_run_id=target_run_id and o.status<>'cancelled';
  return jsonb_build_object('productionBatchId',r.id,'policyVersion','1.0.0','state',case when r.output_stage_status='completed' then 'completed'
    when jsonb_array_length(blockers)=0 then 'ready_for_completion' else 'not_ready_for_completion' end,
    'readyForCompletion',jsonb_array_length(blockers)=0,'completed',r.output_stage_status='completed','evaluatedAt',now(),
    'outputRecordCount',total,'activeOutputRecords',active,'incompleteOutputRecords',incomplete,'outputs',summary,'blockers',blockers);
end $$;

create function public.create_production_output_v1(
  target_production_run_id text,expected_batch_revision bigint,candidate_output_type text,candidate_output_label text,
  candidate_theoretical_quantity numeric,candidate_theoretical_unit text,candidate_theoretical_basis text,
  candidate_override_reason text,candidate_override_evidence text,candidate_measurement_basis text,candidate_location text,
  candidate_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();wid uuid;r public.production_runs;p public.products;f public.formulas;v public.formula_versions;
  existing public.production_outputs;seq integer;oid uuid:=gen_random_uuid();code text;norm record;fingerprint text;material_cost numeric;missing integer;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED';end if;
  select id into wid from public.workspaces where owner_id=uid and lifecycle_state='active';if wid is null then raise exception 'ACTIVE_WORKSPACE_REQUIRED';end if;
  fingerprint:=encode(sha256(convert_to(concat_ws('|',target_production_run_id,candidate_output_type,trim(candidate_output_label),
    candidate_theoretical_quantity,candidate_theoretical_unit,trim(candidate_theoretical_basis),coalesce(candidate_override_reason,''),
    coalesce(candidate_override_evidence,''),trim(candidate_measurement_basis),trim(candidate_location)),'utf8')),'hex');
  select * into existing from public.production_outputs where workspace_id=wid and creation_idempotency_key=candidate_idempotency_key;
  if found then if existing.creation_payload_fingerprint<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT';end if;
    return jsonb_build_object('productionOutputId',existing.id,'outputCode',existing.internal_output_code,'revision',existing.revision,'retry',true);end if;
  select * into r from public.production_runs where workspace_id=wid and owner_id=uid and id=target_production_run_id for update;
  if not found then raise exception 'PRODUCTION_BATCH_UNAVAILABLE';end if;
  if r.revision<>expected_batch_revision then raise exception 'STALE_PRODUCTION_BATCH_REVISION';end if;
  if r.status<>'Completed' then raise exception 'PRODUCTION_MATERIAL_NOT_COMPLETE';end if;
  if candidate_output_type not in('bulk','intermediate') then raise exception 'OUTPUT_TYPE_INVALID';end if;
  select * into norm from public.kf_output_normalize(candidate_theoretical_quantity,candidate_theoretical_unit);
  if norm.quantity is null or candidate_theoretical_quantity<=0 then raise exception 'THEORETICAL_YIELD_INVALID';end if;
  if norm.unit<>(select unit from public.kf_output_normalize(r.planned_batch_size,r.planned_batch_unit)) then raise exception 'OUTPUT_UNIT_INCOMPATIBLE';end if;
  if candidate_theoretical_quantity<>r.planned_batch_size and nullif(trim(coalesce(candidate_override_reason,'')),'') is null then raise exception 'THEORETICAL_OVERRIDE_REASON_REQUIRED';end if;
  select * into p from public.products where workspace_id=wid and id=r.product_id;
  select * into f from public.formulas where workspace_id=wid and id=r.formula_id;
  select * into v from public.formula_versions where workspace_id=wid and id=r.formula_version_id;
  select coalesce(max(output_sequence),0)+1 into seq from public.production_outputs where workspace_id=wid and production_run_id=r.id;
  code:=regexp_replace(upper(r.production_run_number),'[^A-Z0-9]+','-','g')||'-OUT-'||lpad(seq::text,2,'0');
  select sum(c.consumed_quantity*c.unit_cost_snapshot),count(*) filter(where c.unit_cost_snapshot is null) into material_cost,missing
  from public.batch_material_consumptions c where c.workspace_id=wid and c.batch_kind='production' and c.batch_id=r.id;
  insert into public.production_outputs(id,workspace_id,owner_id,production_run_id,product_id,formula_id,formula_version_id,output_type,
    output_sequence,internal_output_code,output_label,theoretical_quantity,theoretical_unit,theoretical_normalized_quantity,theoretical_normalized_unit,
    theoretical_yield_basis,theoretical_override_reason,theoretical_override_evidence,batch_number_snapshot,product_name_snapshot,formula_name_snapshot,
    formula_version_snapshot,batch_scale_quantity_snapshot,batch_scale_unit_snapshot,production_completion_policy_version,material_cost_snapshot,
    material_cost_currency,material_cost_confidence,unresolved_cost_count,measurement_basis,location,status,creation_idempotency_key,
    creation_payload_fingerprint,created_by)
  values(oid,wid,uid,r.id,r.product_id,r.formula_id,r.formula_version_id,candidate_output_type,seq,code,trim(candidate_output_label),
    candidate_theoretical_quantity,candidate_theoretical_unit,norm.quantity,norm.unit,trim(candidate_theoretical_basis),nullif(trim(coalesce(candidate_override_reason,'')),''),
    nullif(trim(coalesce(candidate_override_evidence,'')),''),r.production_run_number,p.name,f.name,v.version,r.planned_batch_size,r.planned_batch_unit,
    '1.1.0',material_cost,case when material_cost is null then null else 'NOK' end,case when missing=0 and material_cost is not null then 'complete'
    when material_cost is not null then 'partial' else 'unknown' end,missing,trim(candidate_measurement_basis),trim(candidate_location),'draft',
    candidate_idempotency_key,fingerprint,uid);
  update public.production_runs set output_stage_status='in_progress',revision=revision+1,updated_at=now()::text where workspace_id=wid and id=r.id;
  insert into public.production_output_events(workspace_id,owner_id,production_run_id,production_output_id,formula_version_id,event_type,quantity,unit,
    actor_id,policy_version,output_revision,event_key,metadata) values(wid,uid,r.id,oid,r.formula_version_id,'production_output_created',
    candidate_theoretical_quantity,candidate_theoretical_unit,uid,'1.0.0',1,'create:'||candidate_idempotency_key,
    jsonb_build_object('outputCode',code,'theoreticalBasis',candidate_theoretical_basis));
  return jsonb_build_object('productionOutputId',oid,'outputCode',code,'revision',1,'retry',false);
end $$;

create function public.record_production_output_measurement_v1(
  target_production_output_id uuid,expected_output_revision bigint,candidate_quantity numeric,candidate_unit text,
  candidate_method text,candidate_equipment_reference text,candidate_vessel_reference text,candidate_gross_quantity numeric,
  candidate_tare_quantity numeric,candidate_evidence_reference text,candidate_note text,candidate_measured_at timestamptz,
  candidate_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();wid uuid;o public.production_outputs;existing public.production_output_measurements;norm record;ver integer;mid uuid:=gen_random_uuid();fp text;prior uuid;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED';end if;select id into wid from public.workspaces where owner_id=uid and lifecycle_state='active';
  fp:=encode(sha256(convert_to(concat_ws('|',target_production_output_id,candidate_quantity,candidate_unit,trim(candidate_method),
    coalesce(candidate_equipment_reference,''),coalesce(candidate_vessel_reference,''),coalesce(candidate_gross_quantity::text,''),
    coalesce(candidate_tare_quantity::text,''),coalesce(candidate_evidence_reference,''),coalesce(candidate_note,''),candidate_measured_at),'utf8')),'hex');
  select * into existing from public.production_output_measurements where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then if existing.payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_CONFLICT';end if;
    return jsonb_build_object('measurementId',existing.id,'measurementVersion',existing.measurement_version,'revision',expected_output_revision,'retry',true);end if;
  select * into o from public.production_outputs where workspace_id=wid and owner_id=uid and id=target_production_output_id for update;
  if not found then raise exception 'PRODUCTION_OUTPUT_UNAVAILABLE';end if;if o.revision<>expected_output_revision then raise exception 'STALE_OUTPUT_REVISION';end if;
  if o.status in('completed','cancelled') then raise exception 'OUTPUT_IMMUTABLE';end if;
  select * into norm from public.kf_output_normalize(candidate_quantity,candidate_unit);if norm.quantity is null or norm.unit<>o.theoretical_normalized_unit then raise exception 'OUTPUT_UNIT_INCOMPATIBLE';end if;
  select id,measurement_version into prior,ver from public.production_output_measurements where workspace_id=wid and production_output_id=o.id order by measurement_version desc limit 1;ver:=coalesce(ver,0)+1;
  insert into public.production_output_measurements(id,workspace_id,owner_id,production_output_id,measurement_version,quantity,unit,normalized_quantity,
    normalized_unit,measurement_method,equipment_reference,vessel_reference,gross_quantity,tare_quantity,measured_by,measured_at,evidence_reference,note,
    supersedes_measurement_id,idempotency_key,payload_fingerprint)
  values(mid,wid,uid,o.id,ver,candidate_quantity,candidate_unit,norm.quantity,norm.unit,trim(candidate_method),nullif(trim(coalesce(candidate_equipment_reference,'')),''),
    nullif(trim(coalesce(candidate_vessel_reference,'')),''),candidate_gross_quantity,candidate_tare_quantity,uid,candidate_measured_at,
    nullif(trim(coalesce(candidate_evidence_reference,'')),''),coalesce(candidate_note,''),prior,candidate_idempotency_key,fp);
  update public.production_outputs set status='measured',revision=revision+1 where id=o.id;
  insert into public.production_output_events(workspace_id,owner_id,production_run_id,production_output_id,formula_version_id,event_type,quantity,unit,actor_id,
    policy_version,output_revision,event_key,metadata) values(wid,uid,o.production_run_id,o.id,o.formula_version_id,'production_output_measurement_recorded',
    candidate_quantity,candidate_unit,uid,'1.0.0',o.revision+1,'measurement:'||candidate_idempotency_key,jsonb_build_object('version',ver,'supersedes',prior));
  if prior is not null then insert into public.production_output_events(workspace_id,owner_id,production_run_id,production_output_id,formula_version_id,event_type,
    actor_id,policy_version,output_revision,event_key,metadata) values(wid,uid,o.production_run_id,o.id,o.formula_version_id,'production_output_measurement_superseded',
    uid,'1.0.0',o.revision+1,'measurement-superseded:'||candidate_idempotency_key,jsonb_build_object('supersededMeasurementId',prior,'replacementMeasurementId',mid));end if;
  return jsonb_build_object('measurementId',mid,'measurementVersion',ver,'revision',o.revision+1,'retry',false);
end $$;

create function public.record_production_output_component_v1(
  target_production_output_id uuid,expected_output_revision bigint,candidate_component_type text,candidate_quantity numeric,candidate_unit text,
  candidate_reason text,candidate_evidence_reference text,candidate_approval_state text,candidate_recorded_at timestamptz,candidate_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();wid uuid;o public.production_outputs;existing public.production_output_components;norm record;cid uuid:=gen_random_uuid();fp text;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED';end if;select id into wid from public.workspaces where owner_id=uid and lifecycle_state='active';
  fp:=encode(sha256(convert_to(concat_ws('|',target_production_output_id,candidate_component_type,candidate_quantity,candidate_unit,
    trim(candidate_reason),coalesce(candidate_evidence_reference,''),candidate_approval_state,candidate_recorded_at),'utf8')),'hex');
  select * into existing from public.production_output_components where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then if existing.payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_CONFLICT';end if;return jsonb_build_object('componentId',existing.id,'revision',expected_output_revision,'retry',true);end if;
  select * into o from public.production_outputs where workspace_id=wid and owner_id=uid and id=target_production_output_id for update;
  if not found then raise exception 'PRODUCTION_OUTPUT_UNAVAILABLE';end if;if o.revision<>expected_output_revision then raise exception 'STALE_OUTPUT_REVISION';end if;
  if o.status in('completed','cancelled') then raise exception 'OUTPUT_IMMUTABLE';end if;
  if candidate_component_type not in('retained_bulk','bulk_waste','transferred','unexplained_variance') then raise exception 'OUTPUT_COMPONENT_INVALID';end if;
  select * into norm from public.kf_output_normalize(candidate_quantity,candidate_unit);if norm.quantity is null or norm.unit<>o.theoretical_normalized_unit then raise exception 'OUTPUT_UNIT_INCOMPATIBLE';end if;
  insert into public.production_output_components(id,workspace_id,owner_id,production_output_id,component_type,quantity,unit,normalized_quantity,normalized_unit,
    reason,evidence_reference,approval_state,recorded_by,recorded_at,idempotency_key,payload_fingerprint)
  values(cid,wid,uid,o.id,candidate_component_type,candidate_quantity,candidate_unit,norm.quantity,norm.unit,trim(candidate_reason),
    nullif(trim(coalesce(candidate_evidence_reference,'')),''),candidate_approval_state,uid,candidate_recorded_at,candidate_idempotency_key,fp);
  update public.production_outputs set revision=revision+1 where id=o.id;
  insert into public.production_output_events(workspace_id,owner_id,production_run_id,production_output_id,formula_version_id,event_type,quantity,unit,actor_id,
    policy_version,output_revision,event_key,metadata) values(wid,uid,o.production_run_id,o.id,o.formula_version_id,
    case when candidate_component_type='unexplained_variance' then 'production_output_variance_recorded' else 'production_output_component_recorded' end,
    candidate_quantity,candidate_unit,uid,'1.0.0',o.revision+1,'component:'||candidate_idempotency_key,
    jsonb_build_object('componentType',candidate_component_type,'approvalState',candidate_approval_state));
  return jsonb_build_object('componentId',cid,'revision',o.revision+1,'retry',false);
end $$;

create function public.reconcile_production_output_v1(
  target_production_output_id uuid,expected_output_revision bigint,candidate_tolerance_quantity numeric,candidate_reason text,
  candidate_evidence_reference text,candidate_approve_variance boolean,candidate_reconciled_at timestamptz,candidate_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();wid uuid;o public.production_outputs;m public.production_output_measurements;existing public.production_output_reconciliations;
  retained numeric:=0;waste numeric:=0;transferred numeric:=0;variance numeric:=0;difference numeric;theory_variance numeric;yield_pct numeric;ver integer;
  rid uuid:=gen_random_uuid();fp text;state_value text;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED';end if;select id into wid from public.workspaces where owner_id=uid and lifecycle_state='active';
  fp:=encode(sha256(convert_to(concat_ws('|',target_production_output_id,candidate_tolerance_quantity,coalesce(candidate_reason,''),
    coalesce(candidate_evidence_reference,''),candidate_approve_variance,candidate_reconciled_at),'utf8')),'hex');
  select * into existing from public.production_output_reconciliations where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then if existing.payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_CONFLICT';end if;return jsonb_build_object('reconciliationId',existing.id,'state',existing.state,'revision',expected_output_revision,'retry',true);end if;
  select * into o from public.production_outputs where workspace_id=wid and owner_id=uid and id=target_production_output_id for update;
  if not found then raise exception 'PRODUCTION_OUTPUT_UNAVAILABLE';end if;if o.revision<>expected_output_revision then raise exception 'STALE_OUTPUT_REVISION';end if;
  if o.status in('completed','cancelled') then raise exception 'OUTPUT_IMMUTABLE';end if;
  select * into m from public.production_output_measurements where workspace_id=wid and production_output_id=o.id order by measurement_version desc limit 1;
  if not found then raise exception 'ACTUAL_OUTPUT_MISSING';end if;
  select coalesce(sum(normalized_quantity) filter(where component_type='retained_bulk'),0),
    coalesce(sum(normalized_quantity) filter(where component_type='bulk_waste'),0),
    coalesce(sum(normalized_quantity) filter(where component_type='transferred'),0),
    coalesce(sum(normalized_quantity) filter(where component_type='unexplained_variance'),0)
  into retained,waste,transferred,variance from public.production_output_components where workspace_id=wid and production_output_id=o.id;
  difference:=m.normalized_quantity-(retained+waste+transferred+variance);
  theory_variance:=o.theoretical_normalized_quantity-m.normalized_quantity;
  yield_pct:=round((m.normalized_quantity/o.theoretical_normalized_quantity)*100,4);
  if abs(difference)>candidate_tolerance_quantity then raise exception 'OUTPUT_EQUATION_UNBALANCED';end if;
  if variance>candidate_tolerance_quantity and (not candidate_approve_variance or nullif(trim(coalesce(candidate_reason,'')),'') is null or nullif(trim(coalesce(candidate_evidence_reference,'')),'') is null) then raise exception 'OUTPUT_VARIANCE_APPROVAL_REQUIRED';end if;
  state_value:='reconciled';select coalesce(max(reconciliation_version),0)+1 into ver from public.production_output_reconciliations where workspace_id=wid and production_output_id=o.id;
  insert into public.production_output_reconciliations(id,workspace_id,owner_id,production_output_id,reconciliation_version,policy_version,
    actual_normalized_quantity,retained_normalized_quantity,waste_normalized_quantity,transferred_normalized_quantity,unexplained_normalized_quantity,
    equation_difference,theoretical_variance,yield_percentage,tolerance_quantity,state,reason,evidence_reference,approved_by,reconciled_by,reconciled_at,
    idempotency_key,payload_fingerprint)
  values(rid,wid,uid,o.id,ver,'1.0.0',m.normalized_quantity,retained,waste,transferred,variance,difference,theory_variance,yield_pct,
    candidate_tolerance_quantity,state_value,nullif(trim(coalesce(candidate_reason,'')),''),nullif(trim(coalesce(candidate_evidence_reference,'')),''),
    case when candidate_approve_variance then uid end,uid,candidate_reconciled_at,candidate_idempotency_key,fp);
  update public.production_outputs set status='reconciled',revision=revision+1 where id=o.id;
  insert into public.production_output_events(workspace_id,owner_id,production_run_id,production_output_id,formula_version_id,event_type,quantity,unit,actor_id,
    policy_version,output_revision,event_key,metadata) values(wid,uid,o.production_run_id,o.id,o.formula_version_id,'production_output_reconciled',
    m.quantity,m.unit,uid,'1.0.0',o.revision+1,'reconcile:'||candidate_idempotency_key,jsonb_build_object('difference',difference,'yieldPercentage',yield_pct));
  return jsonb_build_object('reconciliationId',rid,'state',state_value,'revision',o.revision+1,'equationDifference',difference,'yieldPercentage',yield_pct,'retry',false);
end $$;

create function public.get_production_output_completion_readiness_v1(target_production_run_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();wid uuid;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED';end if;select id into wid from public.workspaces where owner_id=uid and lifecycle_state='active';
  if wid is null or not exists(select 1 from public.production_runs where workspace_id=wid and owner_id=uid and id=target_production_run_id) then raise exception 'PRODUCTION_BATCH_UNAVAILABLE';end if;
  return public.kf_production_output_readiness_v1(wid,target_production_run_id);
end $$;

create function public.get_production_output_genealogy_v1(target_production_output_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();wid uuid;o public.production_outputs;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED';end if;select id into wid from public.workspaces where owner_id=uid and lifecycle_state='active';
  select * into o from public.production_outputs where workspace_id=wid and owner_id=uid and id=target_production_output_id;
  if not found then raise exception 'PRODUCTION_OUTPUT_UNAVAILABLE';end if;
  return jsonb_build_object('contractVersion','1.0.0','productionOutputId',o.id,'productionBatchId',o.production_run_id,
    'formulaVersionId',o.formula_version_id,'outputCode',o.internal_output_code,
    'materialRequirements',(select coalesce(jsonb_agg(jsonb_build_object('requirementId',l.id,'ingredientId',l.ingredient_id,
      'ingredientNameSnapshot',l.ingredient_name_snapshot,'consumptions',(select coalesce(jsonb_agg(jsonb_build_object(
        'consumptionId',c.id,'inventoryLotId',c.inventory_lot_id,'inventoryMovementId',c.movement_id,
        'quantity',c.consumed_quantity,'unit',c.unit,'unitCostSnapshot',c.unit_cost_snapshot)),'[]'::jsonb)
        from public.batch_material_consumptions c where c.workspace_id=wid and c.batch_kind='production' and c.batch_id=o.production_run_id and c.requirement_id=l.id))),'[]'::jsonb)
      from public.production_run_lines l where l.workspace_id=wid and l.production_run_id=o.production_run_id));
end $$;

create function public.complete_production_output_stage_v1(
  target_production_run_id text,expected_batch_revision bigint,candidate_completed_at timestamptz,candidate_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();wid uuid;r public.production_runs;readiness jsonb;existing public.production_output_events;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED';end if;select id into wid from public.workspaces where owner_id=uid and lifecycle_state='active';
  select * into existing from public.production_output_events where workspace_id=wid and event_key='stage-complete:'||candidate_idempotency_key;
  if found then return jsonb_build_object('productionBatchId',existing.production_run_id,'completed',true,'retry',true);end if;
  select * into r from public.production_runs where workspace_id=wid and owner_id=uid and id=target_production_run_id for update;
  if not found then raise exception 'PRODUCTION_BATCH_UNAVAILABLE';end if;if r.revision<>expected_batch_revision then raise exception 'STALE_PRODUCTION_BATCH_REVISION';end if;
  perform 1 from public.production_outputs where workspace_id=wid and production_run_id=r.id order by id for update;
  readiness:=public.kf_production_output_readiness_v1(wid,r.id);
  if not coalesce((readiness->>'readyForCompletion')::boolean,false) then raise exception 'OUTPUT_STAGE_COMPLETION_BLOCKED:%',readiness->'blockers'->0->>'blockerCode';end if;
  update public.production_runs set output_stage_status='completed',output_stage_completed_by=uid,output_stage_completed_at=candidate_completed_at,
    revision=revision+1,updated_at=candidate_completed_at::text where workspace_id=wid and id=r.id;
  update public.production_outputs set status='completed',completed_by=uid,completed_at=candidate_completed_at,revision=revision+1
    where workspace_id=wid and production_run_id=r.id and status='reconciled';
  insert into public.production_output_events(workspace_id,owner_id,production_run_id,production_output_id,formula_version_id,event_type,actor_id,
    policy_version,event_key,metadata) values(wid,uid,r.id,null,r.formula_version_id,'production_output_stage_completed',uid,'1.0.0',
    'stage-complete:'||candidate_idempotency_key,jsonb_build_object('readiness',readiness));
  return jsonb_build_object('productionBatchId',r.id,'completed',true,'batchRevision',r.revision+1,'retry',false);
end $$;

create function public.prevent_production_output_history_mutation()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'PRODUCTION_OUTPUT_HISTORY_APPEND_ONLY';end $$;
create trigger production_output_measurements_append_only before update or delete on public.production_output_measurements for each row execute function public.prevent_production_output_history_mutation();
create trigger production_output_components_append_only before update or delete on public.production_output_components for each row execute function public.prevent_production_output_history_mutation();
create trigger production_output_reconciliations_append_only before update or delete on public.production_output_reconciliations for each row execute function public.prevent_production_output_history_mutation();
create trigger production_output_events_append_only before update or delete on public.production_output_events for each row execute function public.prevent_production_output_history_mutation();

revoke all on function public.kf_output_normalize(numeric,text),public.kf_production_output_readiness_v1(uuid,text),
  public.create_production_output_v1(text,bigint,text,text,numeric,text,text,text,text,text,text,uuid),
  public.record_production_output_measurement_v1(uuid,bigint,numeric,text,text,text,text,numeric,numeric,text,text,timestamptz,uuid),
  public.record_production_output_component_v1(uuid,bigint,text,numeric,text,text,text,text,timestamptz,uuid),
  public.reconcile_production_output_v1(uuid,bigint,numeric,text,text,boolean,timestamptz,uuid),
  public.get_production_output_completion_readiness_v1(text),public.get_production_output_genealogy_v1(uuid),
  public.complete_production_output_stage_v1(text,bigint,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.create_production_output_v1(text,bigint,text,text,numeric,text,text,text,text,text,text,uuid),
  public.record_production_output_measurement_v1(uuid,bigint,numeric,text,text,text,text,numeric,numeric,text,text,timestamptz,uuid),
  public.record_production_output_component_v1(uuid,bigint,text,numeric,text,text,text,text,timestamptz,uuid),
  public.reconcile_production_output_v1(uuid,bigint,numeric,text,text,boolean,timestamptz,uuid),
  public.get_production_output_completion_readiness_v1(text),public.get_production_output_genealogy_v1(uuid),
  public.complete_production_output_stage_v1(text,bigint,timestamptz,uuid) to authenticated;
grant execute on function public.kf_output_normalize(numeric,text),public.kf_production_output_readiness_v1(uuid,text) to service_role;
