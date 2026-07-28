-- Finished Goods & Batch Genealogy V1, Slice 2.
-- Packaging Run planning, bulk allocation and packaging consumption.

create table public.packaging_runs(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  production_output_id uuid not null,
  production_run_id text not null,
  formula_version_id text not null,
  product_id text not null,
  packaging_specification_version_id text not null,
  run_sequence integer not null check(run_sequence>0),
  internal_run_code text not null,
  run_label text not null,
  planned_bulk_quantity numeric not null check(planned_bulk_quantity>0),
  planned_bulk_unit text not null check(planned_bulk_unit in('mg','g','kg','ml','l')),
  planned_bulk_normalized_quantity numeric not null check(planned_bulk_normalized_quantity>0),
  planned_bulk_normalized_unit text not null check(planned_bulk_normalized_unit in('g','ml')),
  actual_transferred_normalized_quantity numeric not null default 0 check(actual_transferred_normalized_quantity>=0),
  planned_unit_count numeric not null check(planned_unit_count>0),
  nominal_fill_quantity numeric not null check(nominal_fill_quantity>0),
  nominal_fill_unit text not null check(nominal_fill_unit in('mg','g','kg','ml','l')),
  target_packaging_format text not null,
  location text not null,
  product_name_snapshot text not null,
  formula_version_snapshot text not null,
  production_output_code_snapshot text not null,
  packaging_specification_name_snapshot text not null,
  packaging_specification_version_snapshot text not null,
  packaging_specification_snapshot jsonb not null,
  bulk_material_cost_snapshot numeric,
  bulk_material_cost_currency text,
  bulk_cost_confidence text not null check(bulk_cost_confidence in('complete','partial','unknown')),
  status text not null default 'draft'
    check(status in('draft','planned','reserved','in_progress','reconciliation_required','blocked','reconciled','completed','cancelled')),
  revision bigint not null default 1 check(revision>0),
  creation_idempotency_key uuid not null,
  creation_payload_fingerprint text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  started_by uuid,
  started_at timestamptz,
  completed_by uuid,
  completed_at timestamptz,
  unique(workspace_id,id),
  unique(workspace_id,production_output_id,run_sequence),
  unique(workspace_id,internal_run_code),
  unique(workspace_id,creation_idempotency_key),
  foreign key(workspace_id,production_output_id) references public.production_outputs(workspace_id,id),
  foreign key(workspace_id,production_run_id) references public.production_runs(workspace_id,id),
  foreign key(workspace_id,formula_version_id) references public.formula_versions(workspace_id,id),
  foreign key(workspace_id,product_id) references public.products(workspace_id,id),
  foreign key(workspace_id,packaging_specification_version_id)
    references public.packaging_specification_versions(workspace_id,id)
);

create table public.packaging_run_requirements(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  packaging_run_id uuid not null,
  packaging_specification_version_id text not null,
  packaging_specification_line_id text not null,
  packaging_component_id text not null,
  component_name_snapshot text not null,
  component_role_snapshot text not null,
  units_required_per_finished_unit numeric not null check(units_required_per_finished_unit>0),
  planned_unit_count numeric not null check(planned_unit_count>0),
  total_required_quantity numeric not null check(total_required_quantity>0),
  unit text not null,
  normalized_quantity numeric not null check(normalized_quantity>0),
  expected_waste_allowance numeric not null default 0 check(expected_waste_allowance>=0),
  eligibility_policy_version text not null,
  sequence integer not null check(sequence>=0),
  instructions text not null default '',
  revision bigint not null default 1 check(revision>0),
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,packaging_run_id,packaging_specification_line_id),
  foreign key(workspace_id,packaging_run_id) references public.packaging_runs(workspace_id,id),
  foreign key(workspace_id,packaging_specification_version_id)
    references public.packaging_specification_versions(workspace_id,id),
  foreign key(workspace_id,packaging_specification_line_id)
    references public.packaging_specification_lines(workspace_id,id),
  foreign key(workspace_id,packaging_component_id) references public.packaging_components(workspace_id,id)
);

create table public.packaging_run_bulk_allocations(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  packaging_run_id uuid not null,
  production_output_id uuid not null,
  allocated_quantity numeric not null check(allocated_quantity>0),
  unit text not null check(unit in('mg','g','kg','ml','l')),
  normalized_quantity numeric not null check(normalized_quantity>0),
  normalized_unit text not null check(normalized_unit in('g','ml')),
  allocation_method text not null,
  output_available_before_snapshot numeric not null check(output_available_before_snapshot>=0),
  output_available_after_snapshot numeric not null check(output_available_after_snapshot>=0),
  transferred_normalized_quantity numeric not null default 0 check(transferred_normalized_quantity>=0),
  status text not null default 'active' check(status in('active','partially_transferred','transferred','released','cancelled')),
  revision bigint not null default 1 check(revision>0),
  allocated_by uuid not null,
  allocated_at timestamptz not null,
  released_by uuid,
  released_at timestamptz,
  release_idempotency_key uuid,
  release_payload_fingerprint text,
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  unique(workspace_id,id),
  unique(workspace_id,packaging_run_id),
  unique(workspace_id,idempotency_key),
  unique(workspace_id,release_idempotency_key),
  foreign key(workspace_id,packaging_run_id) references public.packaging_runs(workspace_id,id),
  foreign key(workspace_id,production_output_id) references public.production_outputs(workspace_id,id),
  check(transferred_normalized_quantity<=normalized_quantity)
);

create table public.packaging_run_bulk_transfers(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  packaging_run_id uuid not null,
  bulk_allocation_id uuid not null,
  production_output_id uuid not null,
  quantity numeric not null check(quantity>0),
  unit text not null check(unit in('mg','g','kg','ml','l')),
  normalized_quantity numeric not null check(normalized_quantity>0),
  normalized_unit text not null check(normalized_unit in('g','ml')),
  measurement_method text not null,
  equipment_reference text,
  source_vessel text,
  destination_vessel text,
  evidence_reference text,
  note text not null default '',
  transferred_by uuid not null,
  transferred_at timestamptz not null,
  revision bigint not null default 1 check(revision>0),
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,idempotency_key),
  foreign key(workspace_id,packaging_run_id) references public.packaging_runs(workspace_id,id),
  foreign key(workspace_id,bulk_allocation_id) references public.packaging_run_bulk_allocations(workspace_id,id),
  foreign key(workspace_id,production_output_id) references public.production_outputs(workspace_id,id)
);

create table public.packaging_run_reservations(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  packaging_run_id uuid not null,
  packaging_requirement_id uuid not null,
  packaging_inventory_lot_id text not null,
  reserved_quantity numeric not null check(reserved_quantity>0),
  unit text not null,
  reserved_in_lot_unit numeric not null check(reserved_in_lot_unit>0),
  consumed_in_lot_unit numeric not null default 0 check(consumed_in_lot_unit>=0),
  waste_in_lot_unit numeric not null default 0 check(waste_in_lot_unit>=0),
  status text not null default 'active' check(status in('active','partially_used','fulfilled','released','cancelled')),
  revision bigint not null default 1 check(revision>0),
  reserved_by uuid not null,
  reserved_at timestamptz not null,
  released_by uuid,
  released_at timestamptz,
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  unique(workspace_id,id),
  unique(workspace_id,idempotency_key),
  foreign key(workspace_id,packaging_run_id) references public.packaging_runs(workspace_id,id),
  foreign key(workspace_id,packaging_requirement_id) references public.packaging_run_requirements(workspace_id,id),
  foreign key(workspace_id,packaging_inventory_lot_id) references public.packaging_inventory_lots(workspace_id,id),
  check(consumed_in_lot_unit+waste_in_lot_unit<=reserved_in_lot_unit)
);

create table public.packaging_run_inventory_uses(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  packaging_run_id uuid not null,
  packaging_requirement_id uuid not null,
  packaging_reservation_id uuid not null,
  packaging_inventory_lot_id text not null,
  use_type text not null check(use_type in('consumption','waste')),
  quantity numeric not null check(quantity>0),
  unit text not null,
  quantity_in_lot_unit numeric not null check(quantity_in_lot_unit>0),
  category text,
  reason text not null,
  evidence_reference text,
  packaging_inventory_movement_id text not null,
  unit_cost_snapshot numeric,
  total_cost_snapshot numeric,
  currency text,
  cost_confidence text not null check(cost_confidence in('complete','unknown')),
  actor_id uuid not null,
  occurred_at timestamptz not null,
  revision bigint not null default 1 check(revision>0),
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,idempotency_key),
  unique(workspace_id,packaging_inventory_movement_id),
  foreign key(workspace_id,packaging_run_id) references public.packaging_runs(workspace_id,id),
  foreign key(workspace_id,packaging_requirement_id) references public.packaging_run_requirements(workspace_id,id),
  foreign key(workspace_id,packaging_reservation_id) references public.packaging_run_reservations(workspace_id,id),
  foreign key(workspace_id,packaging_inventory_lot_id) references public.packaging_inventory_lots(workspace_id,id),
  foreign key(workspace_id,packaging_inventory_movement_id) references public.packaging_inventory_movements(workspace_id,id)
);

create table public.packaging_run_reconciliations(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  packaging_run_id uuid not null,
  reconciliation_version integer not null check(reconciliation_version>0),
  policy_version text not null,
  pending_finished_goods_normalized_quantity numeric not null check(pending_finished_goods_normalized_quantity>=0),
  retained_bulk_normalized_quantity numeric not null check(retained_bulk_normalized_quantity>=0),
  bulk_waste_normalized_quantity numeric not null check(bulk_waste_normalized_quantity>=0),
  unexplained_bulk_variance numeric not null,
  unexplained_packaging_variance numeric not null,
  state text not null check(state in('blocked','reconciled')),
  reason text,
  evidence_reference text,
  reconciled_by uuid not null,
  reconciled_at timestamptz not null,
  idempotency_key uuid not null,
  payload_fingerprint text not null,
  created_at timestamptz not null default now(),
  unique(workspace_id,id),
  unique(workspace_id,packaging_run_id,reconciliation_version),
  unique(workspace_id,idempotency_key),
  foreign key(workspace_id,packaging_run_id) references public.packaging_runs(workspace_id,id)
);

create table public.packaging_run_events(
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  owner_id uuid not null,
  packaging_run_id uuid not null,
  production_output_id uuid not null,
  production_run_id text not null,
  packaging_requirement_id uuid,
  packaging_inventory_lot_id text,
  event_type text not null,
  quantity numeric,
  unit text,
  actor_id uuid not null,
  occurred_at timestamptz not null default now(),
  revision bigint,
  policy_version text not null,
  event_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  unique(workspace_id,id),
  unique(workspace_id,event_key),
  foreign key(workspace_id,packaging_run_id) references public.packaging_runs(workspace_id,id),
  foreign key(workspace_id,production_output_id) references public.production_outputs(workspace_id,id),
  foreign key(workspace_id,production_run_id) references public.production_runs(workspace_id,id),
  foreign key(workspace_id,packaging_requirement_id) references public.packaging_run_requirements(workspace_id,id),
  foreign key(workspace_id,packaging_inventory_lot_id) references public.packaging_inventory_lots(workspace_id,id)
);

create index packaging_runs_output_idx on public.packaging_runs(workspace_id,production_output_id,status);
create index packaging_requirements_run_idx on public.packaging_run_requirements(workspace_id,packaging_run_id,sequence);
create index packaging_bulk_allocations_output_idx on public.packaging_run_bulk_allocations(workspace_id,production_output_id,status);
create index packaging_bulk_transfers_run_idx on public.packaging_run_bulk_transfers(workspace_id,packaging_run_id,transferred_at);
create index packaging_reservations_lot_idx on public.packaging_run_reservations(workspace_id,packaging_inventory_lot_id,status);
create index packaging_reservations_requirement_idx on public.packaging_run_reservations(workspace_id,packaging_requirement_id,status);
create index packaging_uses_run_idx on public.packaging_run_inventory_uses(workspace_id,packaging_run_id,occurred_at);
create index packaging_events_run_idx on public.packaging_run_events(workspace_id,packaging_run_id,occurred_at,id);
create index packaging_runs_production_run_idx on public.packaging_runs(workspace_id,production_run_id);
create index packaging_runs_formula_version_idx on public.packaging_runs(workspace_id,formula_version_id);
create index packaging_runs_product_idx on public.packaging_runs(workspace_id,product_id);
create index packaging_runs_specification_version_idx on public.packaging_runs(workspace_id,packaging_specification_version_id);
create index packaging_requirements_specification_version_idx on public.packaging_run_requirements(workspace_id,packaging_specification_version_id);
create index packaging_requirements_specification_line_idx on public.packaging_run_requirements(workspace_id,packaging_specification_line_id);
create index packaging_requirements_component_idx on public.packaging_run_requirements(workspace_id,packaging_component_id);
create index packaging_bulk_transfers_allocation_idx on public.packaging_run_bulk_transfers(workspace_id,bulk_allocation_id);
create index packaging_bulk_transfers_output_idx on public.packaging_run_bulk_transfers(workspace_id,production_output_id);
create index packaging_reservations_run_idx on public.packaging_run_reservations(workspace_id,packaging_run_id,status);
create index packaging_uses_requirement_idx on public.packaging_run_inventory_uses(workspace_id,packaging_requirement_id);
create index packaging_uses_reservation_idx on public.packaging_run_inventory_uses(workspace_id,packaging_reservation_id);
create index packaging_uses_lot_idx on public.packaging_run_inventory_uses(workspace_id,packaging_inventory_lot_id);
create index packaging_events_output_idx on public.packaging_run_events(workspace_id,production_output_id);
create index packaging_events_production_run_idx on public.packaging_run_events(workspace_id,production_run_id);
create index packaging_events_requirement_idx on public.packaging_run_events(workspace_id,packaging_requirement_id);
create index packaging_events_lot_idx on public.packaging_run_events(workspace_id,packaging_inventory_lot_id);
create index packaging_runs_owner_idx on public.packaging_runs(owner_id);
create index packaging_requirements_owner_idx on public.packaging_run_requirements(owner_id);
create index packaging_bulk_allocations_owner_idx on public.packaging_run_bulk_allocations(owner_id);
create index packaging_bulk_transfers_owner_idx on public.packaging_run_bulk_transfers(owner_id);
create index packaging_reservations_owner_idx on public.packaging_run_reservations(owner_id);
create index packaging_uses_owner_idx on public.packaging_run_inventory_uses(owner_id);
create index packaging_reconciliations_owner_idx on public.packaging_run_reconciliations(owner_id);
create index packaging_events_owner_idx on public.packaging_run_events(owner_id);

do $$ declare t text; begin
  foreach t in array array[
    'packaging_runs','packaging_run_requirements','packaging_run_bulk_allocations',
    'packaging_run_bulk_transfers','packaging_run_reservations',
    'packaging_run_inventory_uses','packaging_run_reconciliations','packaging_run_events'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy %I on public.%I for select to authenticated using((select auth.uid())=owner_id)',t||'_owner_read',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;

create function public.kf_packaging_run_append_only()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin raise exception 'PACKAGING_HISTORY_APPEND_ONLY'; end $$;

create function public.kf_completed_packaging_run_immutable()
returns trigger language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if old.status='completed' then raise exception 'COMPLETED_PACKAGING_RUN_IMMUTABLE'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger completed_packaging_run_immutable before update or delete on public.packaging_runs
for each row execute function public.kf_completed_packaging_run_immutable();

do $$ declare t text; begin
  foreach t in array array[
    'packaging_run_requirements','packaging_run_bulk_transfers',
    'packaging_run_inventory_uses','packaging_run_reconciliations','packaging_run_events'
  ] loop
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.kf_packaging_run_append_only()',t||'_append_only',t);
  end loop;
end $$;

create function public.kf_packaging_available_bulk_v1(target_workspace_id uuid,target_output_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare o public.production_outputs; retained numeric; allocated numeric; normalized_unit text;
begin
  select * into o from public.production_outputs
  where workspace_id=target_workspace_id and id=target_output_id;
  if not found then raise exception 'PRODUCTION_OUTPUT_UNAVAILABLE'; end if;
  if o.status<>'completed' then raise exception 'OUTPUT_STAGE_NOT_COMPLETE'; end if;
  select c.normalized_quantity,c.normalized_unit into retained,normalized_unit
  from public.production_output_components c
  where c.workspace_id=target_workspace_id and c.production_output_id=target_output_id
    and c.component_type='retained_bulk';
  if retained is null then raise exception 'OUTPUT_RETAINED_BULK_MISSING'; end if;
  select coalesce(sum(a.normalized_quantity),0) into allocated
  from public.packaging_run_bulk_allocations a
  where a.workspace_id=target_workspace_id and a.production_output_id=target_output_id
    and a.status in('active','partially_transferred','transferred');
  return jsonb_build_object(
    'productionOutputId',o.id,'outputCode',o.internal_output_code,
    'retainedNormalizedQuantity',retained,'allocatedNormalizedQuantity',allocated,
    'availableNormalizedQuantity',greatest(retained-allocated,0),
    'normalizedUnit',normalized_unit,'outputRevision',o.revision
  );
end $$;

create function public.get_packaging_available_bulk_v1(target_production_output_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); wid uuid;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select id into wid from public.workspaces where owner_id=uid;
  if wid is null then raise exception 'ACTIVE_WORKSPACE_REQUIRED'; end if;
  return public.kf_packaging_available_bulk_v1(wid,target_production_output_id);
end $$;

revoke all on function public.get_packaging_available_bulk_v1(uuid) from public,anon;
grant execute on function public.get_packaging_available_bulk_v1(uuid) to authenticated,service_role;

create function public.create_packaging_run_v1(
  target_production_output_id uuid,
  candidate_packaging_specification_version_id text,
  candidate_run_label text,
  candidate_planned_bulk_quantity numeric,
  candidate_planned_bulk_unit text,
  candidate_planned_unit_count numeric,
  candidate_nominal_fill_quantity numeric,
  candidate_nominal_fill_unit text,
  candidate_location text,
  candidate_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  uid uuid:=auth.uid(); wid uuid; o public.production_outputs;
  sv public.packaging_specification_versions; s public.packaging_specifications; p public.products;
  existing public.packaging_runs; normalized numeric; normalized_unit text; seq integer; run_id uuid:=gen_random_uuid();
  code text; fp text; snapshot jsonb;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select id into wid from public.workspaces where owner_id=uid;
  if wid is null then raise exception 'ACTIVE_WORKSPACE_REQUIRED'; end if;
  fp:=md5(jsonb_build_object('output',target_production_output_id,'spec',candidate_packaging_specification_version_id,
    'label',candidate_run_label,'bulk',candidate_planned_bulk_quantity,'bulkUnit',candidate_planned_bulk_unit,
    'units',candidate_planned_unit_count,'fill',candidate_nominal_fill_quantity,'fillUnit',candidate_nominal_fill_unit,
    'location',candidate_location)::text);
  select * into existing from public.packaging_runs where workspace_id=wid and creation_idempotency_key=candidate_idempotency_key;
  if found then
    if existing.creation_payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if;
    return jsonb_build_object('packagingRunId',existing.id,'runCode',existing.internal_run_code,'revision',existing.revision,'retry',true);
  end if;
  select * into o from public.production_outputs where workspace_id=wid and id=target_production_output_id for update;
  if not found or o.status<>'completed' then raise exception 'OUTPUT_STAGE_NOT_COMPLETE'; end if;
  select * into sv from public.packaging_specification_versions
    where workspace_id=wid and id=candidate_packaging_specification_version_id and status='Approved';
  if not found then raise exception 'APPROVED_PACKAGING_SPECIFICATION_REQUIRED'; end if;
  select * into s from public.packaging_specifications where workspace_id=wid and id=sv.packaging_specification_id and product_id=o.product_id;
  if not found then raise exception 'PACKAGING_SPECIFICATION_PRODUCT_MISMATCH'; end if;
  select * into p from public.products where workspace_id=wid and id=o.product_id;
  select n.quantity,n.unit into normalized,normalized_unit
    from public.kf_output_normalize(candidate_planned_bulk_quantity,candidate_planned_bulk_unit) n;
  if normalized is null or normalized<=0 then raise exception 'INCOMPATIBLE_BULK_UNIT'; end if;
  perform 1 from public.kf_packaging_available_bulk_v1(wid,o.id);
  select coalesce(max(run_sequence),0)+1 into seq from public.packaging_runs where workspace_id=wid and production_output_id=o.id;
  code:=o.internal_output_code||'-PKG-'||lpad(seq::text,2,'0');
  snapshot:=jsonb_build_object(
    'packagingSpecificationId',s.id,'packagingSpecificationName',s.name,'versionId',sv.id,'version',sv.version,
    'description',sv.description,'notes',sv.notes,'productId',p.id,'productName',p.name,
    'nominalFillQuantity',candidate_nominal_fill_quantity,'nominalFillUnit',candidate_nominal_fill_unit,
    'plannedUnitCount',candidate_planned_unit_count,'unknownFieldsRemainUnknown',true
  );
  insert into public.packaging_runs(
    id,workspace_id,owner_id,production_output_id,production_run_id,formula_version_id,product_id,
    packaging_specification_version_id,run_sequence,internal_run_code,run_label,planned_bulk_quantity,
    planned_bulk_unit,planned_bulk_normalized_quantity,planned_bulk_normalized_unit,planned_unit_count,
    nominal_fill_quantity,nominal_fill_unit,target_packaging_format,location,product_name_snapshot,
    formula_version_snapshot,production_output_code_snapshot,packaging_specification_name_snapshot,
    packaging_specification_version_snapshot,packaging_specification_snapshot,bulk_material_cost_snapshot,
    bulk_material_cost_currency,bulk_cost_confidence,status,creation_idempotency_key,
    creation_payload_fingerprint,created_by
  ) values(
    run_id,wid,uid,o.id,o.production_run_id,o.formula_version_id,o.product_id,sv.id,seq,code,candidate_run_label,
    candidate_planned_bulk_quantity,candidate_planned_bulk_unit,normalized,normalized_unit,candidate_planned_unit_count,
    candidate_nominal_fill_quantity,candidate_nominal_fill_unit,sv.description,candidate_location,o.product_name_snapshot,
    o.formula_version_snapshot,o.internal_output_code,s.name,sv.version,snapshot,o.material_cost_snapshot,
    o.material_cost_currency,o.material_cost_confidence,'planned',candidate_idempotency_key,fp,uid
  );
  insert into public.packaging_run_requirements(
    workspace_id,owner_id,packaging_run_id,packaging_specification_version_id,packaging_specification_line_id,
    packaging_component_id,component_name_snapshot,component_role_snapshot,units_required_per_finished_unit,
    planned_unit_count,total_required_quantity,unit,normalized_quantity,expected_waste_allowance,
    eligibility_policy_version,sequence,instructions
  )
  select wid,uid,run_id,sv.id,l.id,l.packaging_component_id,c.name,l.purpose,l.quantity_per_unit,
    candidate_planned_unit_count,l.quantity_per_unit*candidate_planned_unit_count,l.unit,
    l.quantity_per_unit*candidate_planned_unit_count,ceil(l.quantity_per_unit*candidate_planned_unit_count*.05),
    '1.0.0',l.sort_order,l.notes
  from public.packaging_specification_lines l
  join public.packaging_components c on c.workspace_id=l.workspace_id and c.id=l.packaging_component_id
  where l.workspace_id=wid and l.packaging_specification_version_id=sv.id
  order by l.sort_order,l.id;
  if not found then raise exception 'PACKAGING_REQUIREMENTS_MISSING'; end if;
  insert into public.packaging_run_events(workspace_id,owner_id,packaging_run_id,production_output_id,production_run_id,
    event_type,actor_id,revision,policy_version,event_key,metadata)
  values(wid,uid,run_id,o.id,o.production_run_id,'packaging_run_created',uid,1,'1.0.0',
    'packaging-run-created:'||candidate_idempotency_key,jsonb_build_object('runCode',code,'specificationSnapshot',snapshot));
  return jsonb_build_object('packagingRunId',run_id,'runCode',code,'revision',1,'retry',false);
end $$;

create function public.allocate_bulk_to_packaging_run_v1(
  target_packaging_run_id uuid, expected_run_revision bigint, candidate_quantity numeric,
  candidate_unit text, candidate_allocation_method text, candidate_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); wid uuid; pr public.packaging_runs; o public.production_outputs;
  existing public.packaging_run_bulk_allocations; availability jsonb; normalized numeric; normalized_unit text;
  before_qty numeric; fp text; allocation_id uuid:=gen_random_uuid();
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select id into wid from public.workspaces where owner_id=uid;
  fp:=md5(jsonb_build_object('run',target_packaging_run_id,'quantity',candidate_quantity,'unit',candidate_unit,'method',candidate_allocation_method)::text);
  select * into existing from public.packaging_run_bulk_allocations where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then
    if existing.payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if;
    return jsonb_build_object('bulkAllocationId',existing.id,'revision',existing.revision,'retry',true);
  end if;
  select * into pr from public.packaging_runs where workspace_id=wid and id=target_packaging_run_id for update;
  if not found then raise exception 'PACKAGING_RUN_NOT_FOUND'; end if;
  if pr.revision<>expected_run_revision then raise exception 'STALE_PACKAGING_RUN_REVISION'; end if;
  if pr.status in('completed','cancelled') then raise exception 'PACKAGING_RUN_IMMUTABLE'; end if;
  select * into o from public.production_outputs where workspace_id=wid and id=pr.production_output_id for update;
  availability:=public.kf_packaging_available_bulk_v1(wid,o.id);
  select n.quantity,n.unit into normalized,normalized_unit
    from public.kf_output_normalize(candidate_quantity,candidate_unit) n;
  before_qty:=(availability->>'availableNormalizedQuantity')::numeric;
  if normalized is null or normalized<=0 or normalized>before_qty then raise exception 'INSUFFICIENT_OUTPUT_BULK'; end if;
  if normalized<>pr.planned_bulk_normalized_quantity then raise exception 'BULK_ALLOCATION_MUST_MATCH_PLAN'; end if;
  insert into public.packaging_run_bulk_allocations(id,workspace_id,owner_id,packaging_run_id,production_output_id,
    allocated_quantity,unit,normalized_quantity,normalized_unit,allocation_method,
    output_available_before_snapshot,output_available_after_snapshot,allocated_by,allocated_at,idempotency_key,payload_fingerprint)
  values(allocation_id,wid,uid,pr.id,o.id,candidate_quantity,candidate_unit,normalized,normalized_unit,
    candidate_allocation_method,before_qty,before_qty-normalized,uid,now(),candidate_idempotency_key,fp);
  update public.packaging_runs set revision=revision+1 where workspace_id=wid and id=pr.id;
  insert into public.packaging_run_events(workspace_id,owner_id,packaging_run_id,production_output_id,production_run_id,
    event_type,quantity,unit,actor_id,revision,policy_version,event_key,metadata)
  values(wid,uid,pr.id,o.id,pr.production_run_id,'packaging_bulk_allocated',candidate_quantity,candidate_unit,uid,
    pr.revision+1,'1.0.0','packaging-bulk-allocated:'||candidate_idempotency_key,
    jsonb_build_object('allocationId',allocation_id,'availableBefore',before_qty,'availableAfter',before_qty-normalized));
  return jsonb_build_object('bulkAllocationId',allocation_id,'availableBefore',before_qty,
    'availableAfter',before_qty-normalized,'revision',pr.revision+1,'retry',false);
end $$;

create function public.release_packaging_run_bulk_allocation_v1(
  target_bulk_allocation_id uuid, expected_run_revision bigint, candidate_reason text, candidate_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); wid uuid; a public.packaging_run_bulk_allocations; pr public.packaging_runs; fp text;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if; select id into wid from public.workspaces where owner_id=uid;
  select * into a from public.packaging_run_bulk_allocations where workspace_id=wid and id=target_bulk_allocation_id for update;
  if not found then raise exception 'BULK_ALLOCATION_NOT_FOUND'; end if;
  select * into pr from public.packaging_runs where workspace_id=wid and id=a.packaging_run_id for update;
  fp:=md5(jsonb_build_object('allocation',a.id,'reason',candidate_reason)::text);
  if a.status='released' then
    if a.release_idempotency_key<>candidate_idempotency_key or a.release_payload_fingerprint<>fp
      then raise exception 'BULK_ALLOCATION_ALREADY_RELEASED'; end if;
    return jsonb_build_object('bulkAllocationId',a.id,'revision',pr.revision,'retry',true);
  end if;
  if pr.revision<>expected_run_revision then raise exception 'STALE_PACKAGING_RUN_REVISION'; end if;
  if a.transferred_normalized_quantity>0 then raise exception 'TRANSFERRED_BULK_CANNOT_BE_RELEASED'; end if;
  update public.packaging_run_bulk_allocations set status='released',released_by=uid,released_at=now(),
    revision=revision+1,release_idempotency_key=candidate_idempotency_key,release_payload_fingerprint=fp
    where workspace_id=wid and id=a.id;
  update public.packaging_runs set revision=revision+1 where workspace_id=wid and id=pr.id;
  insert into public.packaging_run_events(workspace_id,owner_id,packaging_run_id,production_output_id,production_run_id,
    event_type,quantity,unit,actor_id,revision,policy_version,event_key,metadata)
  values(wid,uid,pr.id,pr.production_output_id,pr.production_run_id,'packaging_bulk_allocation_released',
    a.allocated_quantity,a.unit,uid,pr.revision+1,'1.0.0','packaging-bulk-released:'||candidate_idempotency_key,
    jsonb_build_object('allocationId',a.id,'reason',candidate_reason));
  return jsonb_build_object('bulkAllocationId',a.id,'revision',pr.revision+1,'retry',false);
end $$;

create function public.get_packaging_eligible_lots_v1(target_packaging_requirement_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); wid uuid; req public.packaging_run_requirements;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if; select id into wid from public.workspaces where owner_id=uid;
  select * into req from public.packaging_run_requirements where workspace_id=wid and id=target_packaging_requirement_id;
  if not found then raise exception 'PACKAGING_REQUIREMENT_NOT_FOUND'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'lotId',l.id,'lotCode',l.internal_lot_number,'supplierLot',l.supplier_lot_number,'receivedDate',l.received_date,
    'location',l.location,'unit',l.unit,'movementBalance',public.kf_packaging_balance(wid,l.id),
    'activeReservations',coalesce(ar.qty,0),'availableQuantity',greatest(public.kf_packaging_balance(wid,l.id)-coalesce(ar.qty,0),0),
    'status',l.status,'eligible',l.status='Active' and public.kf_packaging_balance(wid,l.id)-coalesce(ar.qty,0)>0 and l.unit=req.unit,
    'ineligibilityReasons',array_remove(array[
      case when l.status<>'Active' then 'LOT_NOT_ACTIVE' end,
      case when public.kf_packaging_balance(wid,l.id)-coalesce(ar.qty,0)<=0 then 'NO_AVAILABLE_BALANCE' end,
      case when l.unit<>req.unit then 'UNIT_INCOMPATIBLE' end
    ],null),
    'unitCost',case when l.total_acquisition_cost is not null then l.total_acquisition_cost/l.opening_quantity end,
    'costCurrency',l.acquisition_cost_currency,'recommendationRank',1+(select count(*)
      from public.packaging_inventory_lots earlier where earlier.workspace_id=l.workspace_id
        and earlier.packaging_component_id=l.packaging_component_id
        and (earlier.received_date,earlier.internal_lot_number)<(l.received_date,l.internal_lot_number))
  ) order by l.received_date,l.internal_lot_number)
  from public.packaging_inventory_lots l
  left join lateral(
    select sum(r.reserved_in_lot_unit-r.consumed_in_lot_unit-r.waste_in_lot_unit) qty
    from public.packaging_run_reservations r where r.workspace_id=wid and r.packaging_inventory_lot_id=l.id
      and r.status in('active','partially_used')
  ) ar on true
  where l.workspace_id=wid and l.packaging_component_id=req.packaging_component_id),'[]'::jsonb);
end $$;

create function public.reserve_packaging_run_requirement_v1(
  target_packaging_requirement_id uuid, target_packaging_inventory_lot_id text,
  expected_run_revision bigint, candidate_quantity numeric, candidate_unit text, candidate_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); wid uuid; req public.packaging_run_requirements; pr public.packaging_runs;
  lot public.packaging_inventory_lots; existing public.packaging_run_reservations; converted numeric; balance numeric;
  active numeric; fp text; reservation_id uuid:=gen_random_uuid(); total_reserved numeric;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if; select id into wid from public.workspaces where owner_id=uid;
  fp:=md5(jsonb_build_object('requirement',target_packaging_requirement_id,'lot',target_packaging_inventory_lot_id,
    'quantity',candidate_quantity,'unit',candidate_unit)::text);
  select * into existing from public.packaging_run_reservations where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then
    if existing.payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if;
    return jsonb_build_object('reservationId',existing.id,'revision',existing.revision,'retry',true);
  end if;
  select * into req from public.packaging_run_requirements where workspace_id=wid and id=target_packaging_requirement_id;
  if not found then raise exception 'PACKAGING_REQUIREMENT_NOT_FOUND'; end if;
  select * into pr from public.packaging_runs where workspace_id=wid and id=req.packaging_run_id for update;
  if pr.revision<>expected_run_revision then raise exception 'STALE_PACKAGING_RUN_REVISION'; end if;
  if pr.status in('completed','cancelled') then raise exception 'PACKAGING_RUN_IMMUTABLE'; end if;
  select * into lot from public.packaging_inventory_lots
    where workspace_id=wid and id=target_packaging_inventory_lot_id for update;
  if not found or lot.packaging_component_id<>req.packaging_component_id then raise exception 'WRONG_PACKAGING_COMPONENT'; end if;
  if lot.status<>'Active' then raise exception 'PACKAGING_LOT_INELIGIBLE'; end if;
  converted:=public.kf_convert_quantity(candidate_quantity,candidate_unit,lot.unit);
  if converted is null or converted<=0 then raise exception 'INCOMPATIBLE_PACKAGING_UNIT'; end if;
  select coalesce(sum(reserved_in_lot_unit-consumed_in_lot_unit-waste_in_lot_unit),0) into active
  from public.packaging_run_reservations where workspace_id=wid and packaging_inventory_lot_id=lot.id
    and status in('active','partially_used');
  balance:=public.kf_packaging_balance(wid,lot.id);
  if converted>balance-active then raise exception 'INSUFFICIENT_PACKAGING_AVAILABILITY'; end if;
  select coalesce(sum(reserved_quantity),0) into total_reserved from public.packaging_run_reservations
    where workspace_id=wid and packaging_requirement_id=req.id and status<>'cancelled';
  if total_reserved+candidate_quantity>req.total_required_quantity+req.expected_waste_allowance then
    raise exception 'PACKAGING_REQUIREMENT_OVER_RESERVED';
  end if;
  insert into public.packaging_run_reservations(id,workspace_id,owner_id,packaging_run_id,packaging_requirement_id,
    packaging_inventory_lot_id,reserved_quantity,unit,reserved_in_lot_unit,reserved_by,reserved_at,idempotency_key,payload_fingerprint)
  values(reservation_id,wid,uid,pr.id,req.id,lot.id,candidate_quantity,candidate_unit,converted,uid,now(),candidate_idempotency_key,fp);
  update public.packaging_runs set revision=revision+1,status=case
    when not exists(select 1 from public.packaging_run_requirements rr where rr.workspace_id=wid and rr.packaging_run_id=pr.id
      and rr.id<>req.id and coalesce((select sum(x.reserved_quantity) from public.packaging_run_reservations x
        where x.workspace_id=wid and x.packaging_requirement_id=rr.id and x.status in('active','partially_used','fulfilled')),0)<rr.total_required_quantity)
      and total_reserved+candidate_quantity>=req.total_required_quantity then 'reserved' else 'planned' end
  where workspace_id=wid and id=pr.id;
  insert into public.packaging_run_events(workspace_id,owner_id,packaging_run_id,production_output_id,production_run_id,
    packaging_requirement_id,packaging_inventory_lot_id,event_type,quantity,unit,actor_id,revision,policy_version,event_key,metadata)
  values(wid,uid,pr.id,pr.production_output_id,pr.production_run_id,req.id,lot.id,'packaging_requirement_reserved',
    candidate_quantity,candidate_unit,uid,pr.revision+1,'1.0.0','packaging-reserved:'||candidate_idempotency_key,
    jsonb_build_object('reservationId',reservation_id,'availableBefore',balance-active,'availableAfter',balance-active-converted));
  return jsonb_build_object('reservationId',reservation_id,'availableBefore',balance-active,
    'availableAfter',balance-active-converted,'revision',pr.revision+1,'retry',false);
end $$;

create function public.reserve_packaging_run_requirements_v1(
  target_packaging_run_id uuid, expected_run_revision bigint, candidates jsonb, candidate_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); wid uuid; pr public.packaging_runs; item jsonb; result jsonb:='[]'::jsonb;
  item_result jsonb; item_key uuid; current_revision bigint:=expected_run_revision; fp text; prior public.packaging_run_events;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if; select id into wid from public.workspaces where owner_id=uid;
  if jsonb_typeof(candidates)<>'array' or jsonb_array_length(candidates)=0 then raise exception 'RESERVATION_CANDIDATES_REQUIRED'; end if;
  fp:=md5(jsonb_build_object('run',target_packaging_run_id,'candidates',candidates)::text);
  select * into prior from public.packaging_run_events where workspace_id=wid and event_key='packaging-reserve-all:'||candidate_idempotency_key;
  if found then
    if prior.metadata->>'fingerprint'<>fp then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if;
    return prior.metadata->'result'||jsonb_build_object('retry',true);
  end if;
  select * into pr from public.packaging_runs where workspace_id=wid and id=target_packaging_run_id for update;
  if not found or pr.revision<>expected_run_revision then raise exception 'STALE_PACKAGING_RUN_REVISION'; end if;
  perform 1 from public.packaging_inventory_lots l where l.workspace_id=wid and l.id in
    (select value->>'packagingInventoryLotId' from jsonb_array_elements(candidates)) order by l.id for update;
  for item in select value from jsonb_array_elements(candidates) loop
    item_key:=coalesce((item->>'idempotencyKey')::uuid,gen_random_uuid());
    item_result:=public.reserve_packaging_run_requirement_v1(
      (item->>'packagingRequirementId')::uuid,item->>'packagingInventoryLotId',current_revision,
      (item->>'quantity')::numeric,item->>'unit',item_key);
    current_revision:=(item_result->>'revision')::bigint;
    result:=result||jsonb_build_array(item_result);
  end loop;
  insert into public.packaging_run_events(workspace_id,owner_id,packaging_run_id,production_output_id,production_run_id,
    event_type,actor_id,revision,policy_version,event_key,metadata)
  values(wid,uid,pr.id,pr.production_output_id,pr.production_run_id,'packaging_requirements_reserved',
    uid,current_revision,'1.0.0','packaging-reserve-all:'||candidate_idempotency_key,
    jsonb_build_object('fingerprint',fp,'result',jsonb_build_object('reservations',result,'revision',current_revision)));
  return jsonb_build_object('reservations',result,'revision',current_revision,'retry',false);
end $$;

create function public.release_packaging_reservation_v1(
  target_packaging_reservation_id uuid, expected_run_revision bigint, candidate_staged_return boolean,
  candidate_reason text, candidate_evidence_reference text, candidate_condition_acceptable boolean,
  candidate_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); wid uuid; res public.packaging_run_reservations; pr public.packaging_runs;
  fp text; event_type text; remaining numeric;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if; select id into wid from public.workspaces where owner_id=uid;
  select * into res from public.packaging_run_reservations where workspace_id=wid and id=target_packaging_reservation_id for update;
  if not found then raise exception 'PACKAGING_RESERVATION_NOT_FOUND'; end if;
  select * into pr from public.packaging_runs where workspace_id=wid and id=res.packaging_run_id for update;
  fp:=md5(jsonb_build_object('reservation',res.id,'stagedReturn',candidate_staged_return,'reason',candidate_reason,
    'evidence',candidate_evidence_reference,'condition',candidate_condition_acceptable)::text);
  if res.status='released' then
    if not exists(select 1 from public.packaging_run_events where workspace_id=wid
      and event_key='packaging-reservation-release:'||candidate_idempotency_key and metadata->>'fingerprint'=fp)
      then raise exception 'PACKAGING_RESERVATION_ALREADY_RELEASED'; end if;
    return jsonb_build_object('reservationId',res.id,'revision',pr.revision,'retry',true);
  end if;
  if pr.revision<>expected_run_revision then raise exception 'STALE_PACKAGING_RUN_REVISION'; end if;
  remaining:=res.reserved_in_lot_unit-res.consumed_in_lot_unit-res.waste_in_lot_unit;
  if remaining<=0 then raise exception 'NO_UNUSED_RESERVATION'; end if;
  if candidate_staged_return and (not candidate_condition_acceptable or nullif(trim(candidate_evidence_reference),'') is null)
    then raise exception 'STAGED_RETURN_EVIDENCE_REQUIRED'; end if;
  event_type:=case when candidate_staged_return then 'packaging_staged_return_recorded' else 'packaging_reservation_released' end;
  update public.packaging_run_reservations set status='released',released_by=uid,released_at=now(),revision=revision+1
  where workspace_id=wid and id=res.id;
  update public.packaging_runs set revision=revision+1 where workspace_id=wid and id=pr.id;
  insert into public.packaging_run_events(workspace_id,owner_id,packaging_run_id,production_output_id,production_run_id,
    packaging_requirement_id,packaging_inventory_lot_id,event_type,quantity,unit,actor_id,revision,policy_version,event_key,metadata)
  values(wid,uid,pr.id,pr.production_output_id,pr.production_run_id,res.packaging_requirement_id,res.packaging_inventory_lot_id,
    event_type,remaining,res.unit,uid,pr.revision+1,'1.0.0','packaging-reservation-release:'||candidate_idempotency_key,
    jsonb_build_object('reservationId',res.id,'reason',candidate_reason,'evidence',candidate_evidence_reference,
      'conditionAcceptable',candidate_condition_acceptable,'fingerprint',fp,'movementCreated',false));
  return jsonb_build_object('reservationId',res.id,'releasedQuantity',remaining,'movementId',null,
    'revision',pr.revision+1,'retry',false);
end $$;

create function public.record_packaging_bulk_transfer_v1(
  target_bulk_allocation_id uuid, expected_run_revision bigint, candidate_quantity numeric, candidate_unit text,
  candidate_measurement_method text, candidate_equipment_reference text, candidate_source_vessel text,
  candidate_destination_vessel text, candidate_evidence_reference text, candidate_note text,
  candidate_transferred_at timestamptz, candidate_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); wid uuid; a public.packaging_run_bulk_allocations; pr public.packaging_runs;
  existing public.packaging_run_bulk_transfers; normalized numeric; normalized_unit text; fp text; transfer_id uuid:=gen_random_uuid();
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if; select id into wid from public.workspaces where owner_id=uid;
  fp:=md5(jsonb_build_object('allocation',target_bulk_allocation_id,'quantity',candidate_quantity,'unit',candidate_unit,
    'method',candidate_measurement_method,'equipment',candidate_equipment_reference,'source',candidate_source_vessel,
    'destination',candidate_destination_vessel,'evidence',candidate_evidence_reference,'note',candidate_note,'at',candidate_transferred_at)::text);
  select * into existing from public.packaging_run_bulk_transfers where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then if existing.payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if;
    return jsonb_build_object('bulkTransferId',existing.id,'revision',existing.revision,'retry',true); end if;
  select * into a from public.packaging_run_bulk_allocations where workspace_id=wid and id=target_bulk_allocation_id for update;
  if not found or a.status='released' then raise exception 'ACTIVE_BULK_ALLOCATION_REQUIRED'; end if;
  select * into pr from public.packaging_runs where workspace_id=wid and id=a.packaging_run_id for update;
  if pr.revision<>expected_run_revision then raise exception 'STALE_PACKAGING_RUN_REVISION'; end if;
  select n.quantity,n.unit into normalized,normalized_unit from public.kf_output_normalize(candidate_quantity,candidate_unit) n;
  if normalized is null or normalized<=0 or a.transferred_normalized_quantity+normalized>a.normalized_quantity
    then raise exception 'BULK_TRANSFER_EXCEEDS_ALLOCATION'; end if;
  insert into public.packaging_run_bulk_transfers(id,workspace_id,owner_id,packaging_run_id,bulk_allocation_id,
    production_output_id,quantity,unit,normalized_quantity,normalized_unit,measurement_method,equipment_reference,
    source_vessel,destination_vessel,evidence_reference,note,transferred_by,transferred_at,idempotency_key,payload_fingerprint)
  values(transfer_id,wid,uid,pr.id,a.id,pr.production_output_id,candidate_quantity,candidate_unit,normalized,normalized_unit,
    candidate_measurement_method,candidate_equipment_reference,candidate_source_vessel,candidate_destination_vessel,
    candidate_evidence_reference,candidate_note,uid,candidate_transferred_at,candidate_idempotency_key,fp);
  update public.packaging_run_bulk_allocations set transferred_normalized_quantity=transferred_normalized_quantity+normalized,
    status=case when transferred_normalized_quantity+normalized=normalized_quantity then 'transferred' else 'partially_transferred' end,
    revision=revision+1 where workspace_id=wid and id=a.id;
  update public.packaging_runs set actual_transferred_normalized_quantity=actual_transferred_normalized_quantity+normalized,
    status='in_progress',started_by=coalesce(started_by,uid),started_at=coalesce(started_at,candidate_transferred_at),revision=revision+1
    where workspace_id=wid and id=pr.id;
  insert into public.packaging_run_events(workspace_id,owner_id,packaging_run_id,production_output_id,production_run_id,
    event_type,quantity,unit,actor_id,revision,policy_version,event_key,metadata)
  values(wid,uid,pr.id,pr.production_output_id,pr.production_run_id,'packaging_bulk_transferred',candidate_quantity,
    candidate_unit,uid,pr.revision+1,'1.0.0','packaging-bulk-transferred:'||candidate_idempotency_key,
    jsonb_build_object('transferId',transfer_id,'allocationId',a.id));
  return jsonb_build_object('bulkTransferId',transfer_id,'revision',pr.revision+1,'retry',false);
end $$;

create function public.record_packaging_inventory_use_v1(
  target_packaging_reservation_id uuid, expected_run_revision bigint, candidate_use_type text,
  candidate_quantity numeric, candidate_unit text, candidate_category text, candidate_reason text,
  candidate_evidence_reference text, candidate_occurred_at timestamptz, candidate_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); wid uuid; res public.packaging_run_reservations; pr public.packaging_runs;
  lot public.packaging_inventory_lots; existing public.packaging_run_inventory_uses; converted numeric; remaining numeric;
  fp text; use_id uuid:=gen_random_uuid(); movement_id text:=gen_random_uuid()::text; unit_cost numeric; total_cost numeric;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if; select id into wid from public.workspaces where owner_id=uid;
  if candidate_use_type not in('consumption','waste') then raise exception 'PACKAGING_USE_TYPE_INVALID'; end if;
  fp:=md5(jsonb_build_object('reservation',target_packaging_reservation_id,'type',candidate_use_type,
    'quantity',candidate_quantity,'unit',candidate_unit,'category',candidate_category,'reason',candidate_reason,
    'evidence',candidate_evidence_reference,'at',candidate_occurred_at)::text);
  select * into existing from public.packaging_run_inventory_uses where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then if existing.payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if;
    return jsonb_build_object('inventoryUseId',existing.id,'movementId',existing.packaging_inventory_movement_id,'retry',true); end if;
  select * into res from public.packaging_run_reservations where workspace_id=wid and id=target_packaging_reservation_id for update;
  if not found or res.status not in('active','partially_used') then raise exception 'ACTIVE_PACKAGING_RESERVATION_REQUIRED'; end if;
  select * into pr from public.packaging_runs where workspace_id=wid and id=res.packaging_run_id for update;
  if pr.revision<>expected_run_revision then raise exception 'STALE_PACKAGING_RUN_REVISION'; end if;
  select * into lot from public.packaging_inventory_lots where workspace_id=wid and id=res.packaging_inventory_lot_id for update;
  converted:=public.kf_convert_quantity(candidate_quantity,candidate_unit,lot.unit);
  remaining:=res.reserved_in_lot_unit-res.consumed_in_lot_unit-res.waste_in_lot_unit;
  if converted is null or converted<=0 or converted>remaining or converted>public.kf_packaging_balance(wid,lot.id)
    then raise exception 'PACKAGING_USE_EXCEEDS_AVAILABLE_RESERVATION'; end if;
  unit_cost:=case when lot.total_acquisition_cost is not null then lot.total_acquisition_cost/lot.opening_quantity end;
  total_cost:=case when unit_cost is not null then unit_cost*converted end;
  insert into public.packaging_inventory_movements(workspace_id,owner_id,id,packaging_inventory_lot_id,type,quantity,unit,
    reason,reference_type,reference_id,notes,occurred_at,created_at)
  values(wid,uid,movement_id,lot.id,case when candidate_use_type='consumption' then 'Consumption' else 'Waste' end,
    candidate_quantity,candidate_unit,candidate_reason,'PackagingRun',pr.id::text,coalesce(candidate_evidence_reference,''),
    candidate_occurred_at,candidate_occurred_at::text);
  insert into public.packaging_run_inventory_uses(id,workspace_id,owner_id,packaging_run_id,packaging_requirement_id,
    packaging_reservation_id,packaging_inventory_lot_id,use_type,quantity,unit,quantity_in_lot_unit,category,reason,
    evidence_reference,packaging_inventory_movement_id,unit_cost_snapshot,total_cost_snapshot,currency,cost_confidence,
    actor_id,occurred_at,idempotency_key,payload_fingerprint)
  values(use_id,wid,uid,pr.id,res.packaging_requirement_id,res.id,lot.id,candidate_use_type,candidate_quantity,
    candidate_unit,converted,candidate_category,candidate_reason,candidate_evidence_reference,movement_id,unit_cost,total_cost,
    case when unit_cost is null then null else lot.acquisition_cost_currency end,
    case when unit_cost is null then 'unknown' else 'complete' end,uid,candidate_occurred_at,candidate_idempotency_key,fp);
  update public.packaging_run_reservations set
    consumed_in_lot_unit=consumed_in_lot_unit+case when candidate_use_type='consumption' then converted else 0 end,
    waste_in_lot_unit=waste_in_lot_unit+case when candidate_use_type='waste' then converted else 0 end,
    status=case when consumed_in_lot_unit+waste_in_lot_unit+converted=reserved_in_lot_unit then 'fulfilled' else 'partially_used' end,
    revision=revision+1 where workspace_id=wid and id=res.id;
  update public.packaging_runs set revision=revision+1,status='in_progress',
    started_by=coalesce(started_by,uid),started_at=coalesce(started_at,candidate_occurred_at)
    where workspace_id=wid and id=pr.id;
  insert into public.packaging_run_events(workspace_id,owner_id,packaging_run_id,production_output_id,production_run_id,
    packaging_requirement_id,packaging_inventory_lot_id,event_type,quantity,unit,actor_id,revision,policy_version,event_key,metadata)
  values(wid,uid,pr.id,pr.production_output_id,pr.production_run_id,res.packaging_requirement_id,lot.id,
    case when candidate_use_type='consumption' then 'packaging_component_consumed' else 'packaging_component_waste_recorded' end,
    candidate_quantity,candidate_unit,uid,pr.revision+1,'1.0.0','packaging-use:'||candidate_idempotency_key,
    jsonb_build_object('inventoryUseId',use_id,'reservationId',res.id,'movementId',movement_id,'totalCost',total_cost));
  return jsonb_build_object('inventoryUseId',use_id,'movementId',movement_id,'totalCost',total_cost,
    'currency',case when unit_cost is null then null else lot.acquisition_cost_currency end,'revision',pr.revision+1,'retry',false);
end $$;

create function public.reconcile_packaging_run_v1(
  target_packaging_run_id uuid, expected_run_revision bigint,
  candidate_pending_finished_goods_quantity numeric, candidate_retained_bulk_quantity numeric,
  candidate_bulk_waste_quantity numeric, candidate_unexplained_bulk_variance numeric,
  candidate_unexplained_packaging_variance numeric, candidate_reason text,
  candidate_evidence_reference text, candidate_approve_variance boolean,
  candidate_reconciled_at timestamptz, candidate_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); wid uuid; pr public.packaging_runs; existing public.packaging_run_reconciliations;
  fp text; total numeric; state_value text; version_value integer; rec_id uuid:=gen_random_uuid();
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if; select id into wid from public.workspaces where owner_id=uid;
  fp:=md5(jsonb_build_object('run',target_packaging_run_id,'pending',candidate_pending_finished_goods_quantity,
    'retained',candidate_retained_bulk_quantity,'waste',candidate_bulk_waste_quantity,
    'bulkVariance',candidate_unexplained_bulk_variance,'packagingVariance',candidate_unexplained_packaging_variance,
    'reason',candidate_reason,'evidence',candidate_evidence_reference,'approved',candidate_approve_variance)::text);
  select * into existing from public.packaging_run_reconciliations where workspace_id=wid and idempotency_key=candidate_idempotency_key;
  if found then if existing.payload_fingerprint<>fp then raise exception 'IDEMPOTENCY_PAYLOAD_CONFLICT'; end if;
    return jsonb_build_object('reconciliationId',existing.id,'state',existing.state,'retry',true); end if;
  select * into pr from public.packaging_runs where workspace_id=wid and id=target_packaging_run_id for update;
  if not found or pr.revision<>expected_run_revision then raise exception 'STALE_PACKAGING_RUN_REVISION'; end if;
  total:=candidate_pending_finished_goods_quantity+candidate_retained_bulk_quantity+candidate_bulk_waste_quantity+
    candidate_unexplained_bulk_variance;
  if abs(total-pr.actual_transferred_normalized_quantity)>.000001 then raise exception 'PACKAGING_BULK_RECONCILIATION_MISMATCH'; end if;
  if (abs(candidate_unexplained_bulk_variance)>.000001 or abs(candidate_unexplained_packaging_variance)>.000001)
    and (not candidate_approve_variance or nullif(trim(candidate_reason),'') is null)
    then raise exception 'PACKAGING_VARIANCE_APPROVAL_REQUIRED'; end if;
  state_value:='reconciled';
  select coalesce(max(reconciliation_version),0)+1 into version_value from public.packaging_run_reconciliations
    where workspace_id=wid and packaging_run_id=pr.id;
  insert into public.packaging_run_reconciliations(id,workspace_id,owner_id,packaging_run_id,reconciliation_version,
    policy_version,pending_finished_goods_normalized_quantity,retained_bulk_normalized_quantity,
    bulk_waste_normalized_quantity,unexplained_bulk_variance,unexplained_packaging_variance,state,reason,
    evidence_reference,reconciled_by,reconciled_at,idempotency_key,payload_fingerprint)
  values(rec_id,wid,uid,pr.id,version_value,'1.0.0',candidate_pending_finished_goods_quantity,
    candidate_retained_bulk_quantity,candidate_bulk_waste_quantity,candidate_unexplained_bulk_variance,
    candidate_unexplained_packaging_variance,state_value,candidate_reason,candidate_evidence_reference,uid,
    candidate_reconciled_at,candidate_idempotency_key,fp);
  update public.packaging_runs set status='reconciled',revision=revision+1 where workspace_id=wid and id=pr.id;
  insert into public.packaging_run_events(workspace_id,owner_id,packaging_run_id,production_output_id,production_run_id,
    event_type,actor_id,revision,policy_version,event_key,metadata)
  values(wid,uid,pr.id,pr.production_output_id,pr.production_run_id,'packaging_run_reconciled',uid,pr.revision+1,
    '1.0.0','packaging-run-reconciled:'||candidate_idempotency_key,jsonb_build_object('reconciliationId',rec_id));
  return jsonb_build_object('reconciliationId',rec_id,'state',state_value,'revision',pr.revision+1,'retry',false);
end $$;

create function public.kf_packaging_run_completion_readiness_v1(target_workspace_id uuid,target_packaging_run_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare pr public.packaging_runs; blocker jsonb:='[]'::jsonb; requirement_count integer; fully_consumed integer;
  active_count integer; allocation_remaining numeric; latest_state text; unresolved_cost integer; ready boolean;
begin
  select * into pr from public.packaging_runs where workspace_id=target_workspace_id and id=target_packaging_run_id;
  if not found then raise exception 'PACKAGING_RUN_NOT_FOUND'; end if;
  select count(*),count(*) filter(where consumed>=total_required_quantity) into requirement_count,fully_consumed
  from (
    select req.id,req.total_required_quantity,coalesce(sum(u.quantity) filter(where u.use_type='consumption'),0) consumed
    from public.packaging_run_requirements req left join public.packaging_run_inventory_uses u
      on u.workspace_id=req.workspace_id and u.packaging_requirement_id=req.id
    where req.workspace_id=target_workspace_id and req.packaging_run_id=pr.id group by req.id
  ) q;
  select count(*) into active_count from public.packaging_run_reservations
    where workspace_id=target_workspace_id and packaging_run_id=pr.id and status in('active','partially_used');
  select coalesce(sum(normalized_quantity-transferred_normalized_quantity),0) into allocation_remaining
  from public.packaging_run_bulk_allocations where workspace_id=target_workspace_id and packaging_run_id=pr.id
    and status in('active','partially_transferred');
  select state into latest_state from public.packaging_run_reconciliations
    where workspace_id=target_workspace_id and packaging_run_id=pr.id order by reconciliation_version desc limit 1;
  select count(*) into unresolved_cost from public.packaging_run_inventory_uses
    where workspace_id=target_workspace_id and packaging_run_id=pr.id and cost_confidence='unknown';
  if not exists(select 1 from public.packaging_run_bulk_allocations where workspace_id=target_workspace_id and packaging_run_id=pr.id)
    then blocker:=blocker||jsonb_build_array(jsonb_build_object('blockerCode','BULK_ALLOCATION_REQUIRED','category','bulk','severity','error','blocksCompletion',true,'humanMessage','Allocate Production Output bulk.','recommendedAction','Allocate bulk to this Packaging Run.','metadata','{}'::jsonb)); end if;
  if pr.actual_transferred_normalized_quantity<=0 then blocker:=blocker||jsonb_build_array(jsonb_build_object('blockerCode','BULK_TRANSFER_REQUIRED','category','bulk','severity','error','blocksCompletion',true,'humanMessage','Record actual bulk transfer.','recommendedAction','Record the measured transfer.','metadata','{}'::jsonb)); end if;
  if fully_consumed<requirement_count then blocker:=blocker||jsonb_build_array(jsonb_build_object('blockerCode','PACKAGING_REQUIREMENTS_INCOMPLETE','category','packaging','severity','error','blocksCompletion',true,'humanMessage','Productive packaging consumption is incomplete.','recommendedAction','Consume the required components and record waste separately.','metadata',jsonb_build_object('required',requirement_count,'complete',fully_consumed))); end if;
  if active_count>0 then blocker:=blocker||jsonb_build_array(jsonb_build_object('blockerCode','ACTIVE_PACKAGING_RESERVATIONS','category','reservation','severity','error','blocksCompletion',true,'humanMessage','Active packaging reservations remain.','recommendedAction','Consume, release, or safely return staged packaging.','metadata',jsonb_build_object('count',active_count))); end if;
  if allocation_remaining>0 then blocker:=blocker||jsonb_build_array(jsonb_build_object('blockerCode','ACTIVE_BULK_ALLOCATION','category','bulk','severity','error','blocksCompletion',true,'humanMessage','Bulk allocation remains unexplained.','recommendedAction','Transfer or release the unused allocation.','metadata',jsonb_build_object('quantity',allocation_remaining))); end if;
  if latest_state is distinct from 'reconciled' then blocker:=blocker||jsonb_build_array(jsonb_build_object('blockerCode','RECONCILIATION_REQUIRED','category','reconciliation','severity','error','blocksCompletion',true,'humanMessage','Packaging Run reconciliation is required.','recommendedAction','Record the authoritative reconciliation.','metadata','{}'::jsonb)); end if;
  ready:=jsonb_array_length(blocker)=0;
  return jsonb_build_object('packagingRunId',pr.id,'productionOutputId',pr.production_output_id,'policyVersion','1.0.0',
    'state',case when pr.status='completed' then 'completed' when ready then 'ready' else 'blocked' end,
    'readyForCompletion',ready or pr.status='completed','completed',pr.status='completed','evaluatedAt',now(),
    'plannedBulk',pr.planned_bulk_normalized_quantity,'allocatedBulk',coalesce((select sum(normalized_quantity) from public.packaging_run_bulk_allocations where workspace_id=target_workspace_id and packaging_run_id=pr.id and status<>'released'),0),
    'transferredBulk',pr.actual_transferred_normalized_quantity,'remainingBulkAllocation',allocation_remaining,
    'requirementCount',requirement_count,'fullyReservedCount',coalesce((select count(*) from public.packaging_run_requirements req where req.workspace_id=target_workspace_id and req.packaging_run_id=pr.id and
      coalesce((select sum(r.reserved_quantity) from public.packaging_run_reservations r where r.workspace_id=target_workspace_id and r.packaging_requirement_id=req.id),0)>=req.total_required_quantity),0),
    'consumedCount',fully_consumed,'activeReservations',active_count,'unresolvedWaste',0,'unresolvedStagedReturns',0,
    'unexplainedBulkVariance',coalesce((select unexplained_bulk_variance from public.packaging_run_reconciliations where workspace_id=target_workspace_id and packaging_run_id=pr.id order by reconciliation_version desc limit 1),0),
    'unexplainedPackagingVariance',coalesce((select unexplained_packaging_variance from public.packaging_run_reconciliations where workspace_id=target_workspace_id and packaging_run_id=pr.id order by reconciliation_version desc limit 1),0),
    'missingEvidence',0,'costState',case when unresolved_cost>0 then 'unknown' else 'complete' end,'blockers',blocker);
end $$;

create function public.get_packaging_run_completion_readiness_v1(target_packaging_run_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); wid uuid;
begin if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if; select id into wid from public.workspaces where owner_id=uid;
return public.kf_packaging_run_completion_readiness_v1(wid,target_packaging_run_id); end $$;

create function public.complete_packaging_run_v1(
  target_packaging_run_id uuid, expected_run_revision bigint, candidate_completed_at timestamptz,
  candidate_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); wid uuid; pr public.packaging_runs; readiness jsonb; prior public.packaging_run_events;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if; select id into wid from public.workspaces where owner_id=uid;
  select * into prior from public.packaging_run_events where workspace_id=wid and event_key='packaging-run-completed:'||candidate_idempotency_key;
  if found then return prior.metadata->'result'||jsonb_build_object('retry',true); end if;
  select * into pr from public.packaging_runs where workspace_id=wid and id=target_packaging_run_id for update;
  if not found or pr.revision<>expected_run_revision then raise exception 'STALE_PACKAGING_RUN_REVISION'; end if;
  perform 1 from public.production_outputs where workspace_id=wid and id=pr.production_output_id for update;
  perform 1 from public.packaging_run_reservations where workspace_id=wid and packaging_run_id=pr.id order by packaging_inventory_lot_id,id for update;
  readiness:=public.kf_packaging_run_completion_readiness_v1(wid,pr.id);
  if not (readiness->>'readyForCompletion')::boolean then
    raise exception 'PACKAGING_RUN_COMPLETION_BLOCKED:%',readiness->'blockers';
  end if;
  update public.packaging_runs set status='completed',completed_by=uid,completed_at=candidate_completed_at,
    revision=revision+1 where workspace_id=wid and id=pr.id;
  insert into public.packaging_run_events(workspace_id,owner_id,packaging_run_id,production_output_id,production_run_id,
    event_type,actor_id,revision,policy_version,event_key,metadata)
  values(wid,uid,pr.id,pr.production_output_id,pr.production_run_id,'packaging_run_completed',uid,pr.revision+1,
    '1.0.0','packaging-run-completed:'||candidate_idempotency_key,
    jsonb_build_object('result',jsonb_build_object('packagingRunId',pr.id,'revision',pr.revision+1,
      'state','ready_for_finished_goods_lot_creation','finishedGoodsCreated',false,'finishedGoodsMovementCreated',false)));
  return jsonb_build_object('packagingRunId',pr.id,'revision',pr.revision+1,
    'state','ready_for_finished_goods_lot_creation','finishedGoodsCreated',false,'finishedGoodsMovementCreated',false,'retry',false);
end $$;

create function public.get_packaging_run_genealogy_v1(target_packaging_run_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); wid uuid; pr public.packaging_runs;
begin
  if uid is null then raise exception 'AUTHENTICATION_REQUIRED'; end if; select id into wid from public.workspaces where owner_id=uid;
  select * into pr from public.packaging_runs where workspace_id=wid and id=target_packaging_run_id;
  if not found then raise exception 'PACKAGING_RUN_NOT_FOUND'; end if;
  return jsonb_build_object('packagingRunId',pr.id,'productionOutputId',pr.production_output_id,
    'productionRunId',pr.production_run_id,'formulaVersionId',pr.formula_version_id,
    'packagingSpecificationVersionId',pr.packaging_specification_version_id,
    'requirements',coalesce((select jsonb_agg(to_jsonb(req) order by req.sequence) from public.packaging_run_requirements req where req.workspace_id=wid and req.packaging_run_id=pr.id),'[]'::jsonb),
    'reservations',coalesce((select jsonb_agg(to_jsonb(r) order by r.reserved_at) from public.packaging_run_reservations r where r.workspace_id=wid and r.packaging_run_id=pr.id),'[]'::jsonb),
    'inventoryUses',coalesce((select jsonb_agg(to_jsonb(u) order by u.occurred_at) from public.packaging_run_inventory_uses u where u.workspace_id=wid and u.packaging_run_id=pr.id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at,e.id) from public.packaging_run_events e where e.workspace_id=wid and e.packaging_run_id=pr.id),'[]'::jsonb),
    'finishedGoodsLots','[]'::jsonb);
end $$;

revoke all on function
  public.create_packaging_run_v1(uuid,text,text,numeric,text,numeric,numeric,text,text,uuid),
  public.allocate_bulk_to_packaging_run_v1(uuid,bigint,numeric,text,text,uuid),
  public.release_packaging_run_bulk_allocation_v1(uuid,bigint,text,uuid),
  public.get_packaging_eligible_lots_v1(uuid),
  public.reserve_packaging_run_requirement_v1(uuid,text,bigint,numeric,text,uuid),
  public.reserve_packaging_run_requirements_v1(uuid,bigint,jsonb,uuid),
  public.release_packaging_reservation_v1(uuid,bigint,boolean,text,text,boolean,uuid),
  public.record_packaging_bulk_transfer_v1(uuid,bigint,numeric,text,text,text,text,text,text,text,timestamptz,uuid),
  public.record_packaging_inventory_use_v1(uuid,bigint,text,numeric,text,text,text,text,timestamptz,uuid),
  public.reconcile_packaging_run_v1(uuid,bigint,numeric,numeric,numeric,numeric,numeric,text,text,boolean,timestamptz,uuid),
  public.get_packaging_run_completion_readiness_v1(uuid),
  public.complete_packaging_run_v1(uuid,bigint,timestamptz,uuid),
  public.get_packaging_run_genealogy_v1(uuid)
from public,anon;
grant execute on function
  public.create_packaging_run_v1(uuid,text,text,numeric,text,numeric,numeric,text,text,uuid),
  public.allocate_bulk_to_packaging_run_v1(uuid,bigint,numeric,text,text,uuid),
  public.release_packaging_run_bulk_allocation_v1(uuid,bigint,text,uuid),
  public.get_packaging_eligible_lots_v1(uuid),
  public.reserve_packaging_run_requirement_v1(uuid,text,bigint,numeric,text,uuid),
  public.reserve_packaging_run_requirements_v1(uuid,bigint,jsonb,uuid),
  public.release_packaging_reservation_v1(uuid,bigint,boolean,text,text,boolean,uuid),
  public.record_packaging_bulk_transfer_v1(uuid,bigint,numeric,text,text,text,text,text,text,text,timestamptz,uuid),
  public.record_packaging_inventory_use_v1(uuid,bigint,text,numeric,text,text,text,text,timestamptz,uuid),
  public.reconcile_packaging_run_v1(uuid,bigint,numeric,numeric,numeric,numeric,numeric,text,text,boolean,timestamptz,uuid),
  public.get_packaging_run_completion_readiness_v1(uuid),
  public.complete_packaging_run_v1(uuid,bigint,timestamptz,uuid),
  public.get_packaging_run_genealogy_v1(uuid)
to authenticated,service_role;
