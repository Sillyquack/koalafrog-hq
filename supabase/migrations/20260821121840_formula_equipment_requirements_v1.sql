-- Formula Equipment requirements extend the existing Equipment root. They are
-- immutable snapshots owned by an exact Formula Version; Equipment records
-- remain the current workspace read model used to evaluate readiness.

alter table public.process_equipment_requirements
  add column formula_version_id text,
  add column catalog_key text,
  add column requirement_name text,
  add column category text,
  add column minimum_value numeric,
  add column maximum_value numeric,
  add column required_material text,
  add column preparation_instructions text not null default '',
  add column sort_order integer not null default 0,
  add column revision integer not null default 1,
  add column updated_at timestamptz not null default now();

update public.process_equipment_requirements
set formula_version_id = source_id
where source_type = 'formula_version';

alter table public.process_equipment_requirements
  drop constraint if exists process_equipment_requirements_check,
  add constraint process_equipment_requirements_match_source_check check (
    (source_type = 'formula_version' and formula_version_id = source_id)
    or (source_type <> 'formula_version' and formula_version_id is null)
  ),
  add constraint process_equipment_requirements_selector_check check (
    num_nonnulls(required_equipment_type, required_capability) >= 1
  ),
  add constraint process_equipment_requirements_catalog_check check (
    source_type <> 'formula_version'
    or (
      nullif(btrim(catalog_key), '') is not null
      and nullif(btrim(requirement_name), '') is not null
      and category in (
        'weighing', 'measuring_transfer', 'mixing', 'heating_cooling',
        'filling_packaging', 'hygiene_sanitation', 'ppe', 'qc_observation'
      )
    )
  ),
  add constraint process_equipment_requirements_capacity_check check (
    minimum_capacity is null or minimum_capacity > 0
  ),
  add constraint process_equipment_requirements_precision_check check (
    required_precision is null or required_precision > 0
  ),
  add constraint process_equipment_requirements_range_check check (
    minimum_value is null or maximum_value is null or minimum_value <= maximum_value
  ),
  add constraint process_equipment_requirements_sort_check check (sort_order >= 0),
  add constraint process_equipment_requirements_formula_version_fkey
    foreign key (workspace_id, formula_version_id)
    references public.formula_versions(workspace_id, id)
    deferrable initially deferred;

create unique index process_equipment_requirements_formula_catalog_unique
  on public.process_equipment_requirements(workspace_id, formula_version_id, catalog_key)
  where formula_version_id is not null;
create index process_equipment_requirements_formula_sort_idx
  on public.process_equipment_requirements(workspace_id, formula_version_id, sort_order)
  where formula_version_id is not null;

create or replace function public.guard_formula_equipment_requirement_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  candidate public.process_equipment_requirements;
  formula_status text;
begin
  candidate := case when tg_op = 'DELETE' then old else new end;
  if candidate.source_type <> 'formula_version' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if current_setting('kf.formula_equipment_import', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' and (
    old.workspace_id is distinct from new.workspace_id
    or old.owner_id is distinct from new.owner_id
    or old.formula_version_id is distinct from new.formula_version_id
    or old.source_type is distinct from new.source_type
    or old.source_id is distinct from new.source_id
  ) then
    raise exception 'Formula Equipment requirements cannot be re-parented';
  end if;

  select version.status into formula_status
  from public.formula_versions version
  where version.workspace_id = candidate.workspace_id
    and version.owner_id = candidate.owner_id
    and version.id = candidate.formula_version_id;

  if formula_status is null then
    raise exception 'Formula Version unavailable';
  end if;
  if formula_status <> 'Draft' then
    raise exception 'Formula Equipment requirements are immutable after Draft';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger guard_formula_equipment_requirement_snapshot
before insert or update or delete on public.process_equipment_requirements
for each row execute function public.guard_formula_equipment_requirement_snapshot();

revoke insert, update, delete, truncate on table public.process_equipment_requirements from authenticated;
revoke references, trigger on table public.process_equipment_requirements from authenticated;
grant select on table public.process_equipment_requirements to authenticated;
grant select, insert, update, delete on table public.process_equipment_requirements to service_role;

create or replace function public.replace_formula_equipment_requirements_v1(
  target_formula_version_id text,
  expected_formula_updated_at text,
  candidate_formula_updated_at text,
  candidate_requirements jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  wid uuid;
  version public.formula_versions;
  requirement jsonb;
  persisted jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if target_formula_version_id is null or btrim(target_formula_version_id) = '' then
    raise exception 'Formula Version is required';
  end if;
  if candidate_formula_updated_at is null or btrim(candidate_formula_updated_at) = '' then
    raise exception 'Formula Version update timestamp is required';
  end if;
  if jsonb_typeof(coalesce(candidate_requirements, '[]'::jsonb)) <> 'array' then
    raise exception 'Equipment requirements must be an array';
  end if;
  if jsonb_array_length(coalesce(candidate_requirements, '[]'::jsonb)) > 100 then
    raise exception 'A Formula Version cannot have more than 100 Equipment requirements';
  end if;

  select workspace.id into wid
  from public.workspaces workspace
  where workspace.owner_id = uid and workspace.lifecycle_state = 'active';
  if wid is null then raise exception 'Active workspace required'; end if;

  select * into version
  from public.formula_versions candidate
  where candidate.workspace_id = wid
    and candidate.owner_id = uid
    and candidate.id = target_formula_version_id
  for update;
  if version.id is null then raise exception 'Formula Version unavailable'; end if;
  if version.status <> 'Draft' then
    raise exception 'Formula Equipment requirements are immutable after Draft';
  end if;
  if version.updated_at is distinct from expected_formula_updated_at then
    raise exception 'Formula Version changed; refresh and retry';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(candidate_requirements, '[]'::jsonb)) item
    group by item->>'catalog_key'
    having count(*) > 1
  ) then
    raise exception 'Equipment Catalog requirements must be unique per Formula Version';
  end if;

  for requirement in
    select value from jsonb_array_elements(coalesce(candidate_requirements, '[]'::jsonb))
  loop
    if nullif(requirement->>'id', '') is null
      or not (requirement->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then
      raise exception 'Each Equipment requirement needs a UUID';
    end if;
    if requirement->>'formula_version_id' is distinct from target_formula_version_id then
      raise exception 'Equipment requirement Formula Version mismatch';
    end if;
    if nullif(btrim(requirement->>'catalog_key'), '') is null
      or nullif(btrim(requirement->>'requirement_name'), '') is null then
      raise exception 'Equipment Catalog key and requirement name are required';
    end if;
    if requirement->>'category' not in (
      'weighing', 'measuring_transfer', 'mixing', 'heating_cooling',
      'filling_packaging', 'hygiene_sanitation', 'ppe', 'qc_observation'
    ) then raise exception 'Unsupported Equipment requirement category'; end if;
    if nullif(btrim(requirement->>'required_equipment_type'), '') is null
      and nullif(btrim(requirement->>'required_capability'), '') is null then
      raise exception 'Equipment type or capability is required';
    end if;
    if coalesce((requirement->>'quantity_required')::integer, 0) <= 0 then
      raise exception 'Equipment requirement quantity must be positive';
    end if;
    if requirement->>'requirement_level' not in ('required', 'recommended', 'optional') then
      raise exception 'Unsupported Equipment requirement level';
    end if;
    if nullif(requirement->>'minimum_capacity', '') is not null
      and (requirement->>'minimum_capacity')::numeric <= 0 then
      raise exception 'Minimum capacity must be positive';
    end if;
    if nullif(requirement->>'required_precision', '') is not null
      and (requirement->>'required_precision')::numeric <= 0 then
      raise exception 'Required precision must be positive';
    end if;
    if nullif(requirement->>'minimum_value', '') is not null
      and nullif(requirement->>'maximum_value', '') is not null
      and (requirement->>'minimum_value')::numeric > (requirement->>'maximum_value')::numeric then
      raise exception 'Equipment requirement range is invalid';
    end if;
  end loop;

  delete from public.process_equipment_requirements existing
  where existing.workspace_id = wid
    and existing.owner_id = uid
    and existing.formula_version_id = target_formula_version_id;

  for requirement in
    select value from jsonb_array_elements(coalesce(candidate_requirements, '[]'::jsonb))
  loop
    insert into public.process_equipment_requirements(
      id, workspace_id, owner_id, source_type, source_id, formula_version_id,
      catalog_key, requirement_name, category, required_equipment_type,
      required_capability, minimum_capacity, required_precision, minimum_value,
      maximum_value, unit, required_material, quantity_required,
      requirement_level, preparation_instructions, notes, sort_order, revision,
      created_at, updated_at
    ) values (
      (requirement->>'id')::uuid, wid, uid, 'formula_version', target_formula_version_id,
      target_formula_version_id, requirement->>'catalog_key', requirement->>'requirement_name',
      requirement->>'category', nullif(requirement->>'required_equipment_type', ''),
      nullif(requirement->>'required_capability', ''),
      nullif(requirement->>'minimum_capacity', '')::numeric,
      nullif(requirement->>'required_precision', '')::numeric,
      nullif(requirement->>'minimum_value', '')::numeric,
      nullif(requirement->>'maximum_value', '')::numeric,
      nullif(requirement->>'unit', ''), nullif(requirement->>'required_material', ''),
      (requirement->>'quantity_required')::integer, requirement->>'requirement_level',
      coalesce(requirement->>'preparation_instructions', ''),
      coalesce(requirement->>'notes', ''),
      coalesce((requirement->>'sort_order')::integer, 0),
      coalesce((requirement->>'revision')::integer, 1),
      coalesce((requirement->>'created_at')::timestamptz, now()),
      coalesce((requirement->>'updated_at')::timestamptz, now())
    );
  end loop;

  update public.formula_versions
  set updated_at = candidate_formula_updated_at
  where workspace_id = wid and owner_id = uid and id = target_formula_version_id;

  select coalesce(jsonb_agg(to_jsonb(saved) order by saved.sort_order), '[]'::jsonb)
  into persisted
  from public.process_equipment_requirements saved
  where saved.workspace_id = wid
    and saved.owner_id = uid
    and saved.formula_version_id = target_formula_version_id;

  return jsonb_build_object(
    'formulaVersionId', target_formula_version_id,
    'formulaUpdatedAt', candidate_formula_updated_at,
    'requirements', persisted
  );
end $$;

revoke all on function public.replace_formula_equipment_requirements_v1(text,text,text,jsonb) from public, anon;
grant execute on function public.replace_formula_equipment_requirements_v1(text,text,text,jsonb) to authenticated, service_role;
comment on function public.replace_formula_equipment_requirements_v1(text,text,text,jsonb) is
  'kf.authority.v1 owner_derived atomic replacement of Draft Formula Version Equipment requirement snapshots';

-- Keep the deployed five-argument handoff callable, while making the new
-- six-argument handoff atomically persist Formula requirements.
alter function public.create_product_studio_formula_handoff(text,jsonb,jsonb,jsonb,jsonb)
  rename to create_product_studio_formula_handoff_pre_equipment_requirements;
revoke all on function public.create_product_studio_formula_handoff_pre_equipment_requirements(text,jsonb,jsonb,jsonb,jsonb) from public, anon, authenticated;

create or replace function public.create_product_studio_formula_handoff(
  concept_id text,
  product jsonb,
  formula jsonb,
  formula_version jsonb,
  formula_lines jsonb,
  equipment_requirements jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  wid uuid;
  existing_formula_version_id text;
  result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select workspace.id into wid
  from public.workspaces workspace
  where workspace.owner_id = uid and workspace.lifecycle_state = 'active';
  if wid is null then raise exception 'Active workspace required'; end if;

  select concept.generated_formula_version_id into existing_formula_version_id
  from public.product_studio_concepts concept
  where concept.workspace_id = wid and concept.owner_id = uid and concept.id = concept_id
  for update;

  result := public.create_product_studio_formula_handoff_pre_equipment_requirements(
    concept_id, product, formula, formula_version, formula_lines
  );

  if existing_formula_version_id is not null then return result; end if;
  if result->>'formulaVersionId' is distinct from formula_version->>'id' then
    raise exception 'Formula handoff returned an unexpected Formula Version';
  end if;

  perform public.replace_formula_equipment_requirements_v1(
    formula_version->>'id',
    formula_version->>'updated_at',
    formula_version->>'updated_at',
    coalesce(equipment_requirements, '[]'::jsonb)
  );
  return result;
end $$;

create or replace function public.create_product_studio_formula_handoff(
  concept_id text,
  product jsonb,
  formula jsonb,
  formula_version jsonb,
  formula_lines jsonb
) returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.create_product_studio_formula_handoff(
    concept_id, product, formula, formula_version, formula_lines, '[]'::jsonb
  );
$$;

revoke all on function public.create_product_studio_formula_handoff(text,jsonb,jsonb,jsonb,jsonb,jsonb) from public, anon;
revoke all on function public.create_product_studio_formula_handoff(text,jsonb,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.create_product_studio_formula_handoff(text,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated, service_role;
grant execute on function public.create_product_studio_formula_handoff(text,jsonb,jsonb,jsonb,jsonb) to authenticated, service_role;

create or replace function public.duplicate_formula_version_as_draft_v1(
  source_formula_version_id text,
  candidate_formula_version jsonb,
  candidate_formula_lines jsonb,
  candidate_equipment_requirements jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  wid uuid;
  source_version public.formula_versions;
  candidate_id text := nullif(candidate_formula_version->>'id', '');
  line jsonb;
  result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if candidate_id is null then raise exception 'Candidate Formula Version ID is required'; end if;
  if jsonb_typeof(coalesce(candidate_formula_lines, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(candidate_equipment_requirements, '[]'::jsonb)) <> 'array' then
    raise exception 'Formula lines and Equipment requirements must be arrays';
  end if;

  select workspace.id into wid
  from public.workspaces workspace
  where workspace.owner_id = uid and workspace.lifecycle_state = 'active';
  if wid is null then raise exception 'Active workspace required'; end if;

  select * into source_version
  from public.formula_versions source
  where source.workspace_id = wid
    and source.owner_id = uid
    and source.id = source_formula_version_id
  for share;
  if source_version.id is null then raise exception 'Source Formula Version unavailable'; end if;
  if candidate_formula_version->>'formula_id' is distinct from source_version.formula_id
    or candidate_formula_version->>'derived_from_version_id' is distinct from source_version.id
    or candidate_formula_version->>'status' is distinct from 'Draft' then
    raise exception 'Derived Formula Version identity is invalid';
  end if;
  if exists (
    select 1 from public.formula_versions existing
    where existing.workspace_id = wid and existing.id = candidate_id
  ) then raise exception 'Derived Formula Version already exists'; end if;

  if jsonb_array_length(coalesce(candidate_formula_lines, '[]'::jsonb)) <>
    (select count(*) from public.formula_lines source_line
     where source_line.workspace_id = wid and source_line.formula_version_id = source_version.id) then
    raise exception 'Derived Formula lines must exactly snapshot the source';
  end if;
  if exists (
    select 1
    from public.formula_lines source_line
    where source_line.workspace_id = wid
      and source_line.formula_version_id = source_version.id
      and not exists (
        select 1
        from jsonb_array_elements(candidate_formula_lines) proposed
        where proposed->>'formula_version_id' = candidate_id
          and proposed->>'ingredient_id' = source_line.ingredient_id
          and (proposed->>'percentage')::numeric = source_line.percentage
          and proposed->>'phase' = source_line.phase
          and (proposed->>'sort_order')::numeric = source_line.sort_order
          and proposed->>'notes' = source_line.notes
          and proposed->>'formulation_role' is not distinct from source_line.formulation_role
      )
  ) then raise exception 'Derived Formula lines must exactly snapshot the source'; end if;

  if jsonb_array_length(coalesce(candidate_equipment_requirements, '[]'::jsonb)) <>
    (select count(*) from public.process_equipment_requirements source_requirement
     where source_requirement.workspace_id = wid
       and source_requirement.formula_version_id = source_version.id) then
    raise exception 'Derived Equipment requirements must exactly snapshot the source';
  end if;
  if exists (
    select 1
    from public.process_equipment_requirements source_requirement
    where source_requirement.workspace_id = wid
      and source_requirement.formula_version_id = source_version.id
      and not exists (
        select 1
        from jsonb_array_elements(candidate_equipment_requirements) proposed
        where proposed->>'formula_version_id' = candidate_id
          and proposed->>'catalog_key' = source_requirement.catalog_key
          and proposed->>'requirement_name' = source_requirement.requirement_name
          and proposed->>'category' = source_requirement.category
          and proposed->>'required_equipment_type' is not distinct from source_requirement.required_equipment_type
          and proposed->>'required_capability' is not distinct from source_requirement.required_capability
          and nullif(proposed->>'minimum_capacity', '')::numeric is not distinct from source_requirement.minimum_capacity
          and nullif(proposed->>'required_precision', '')::numeric is not distinct from source_requirement.required_precision
          and nullif(proposed->>'minimum_value', '')::numeric is not distinct from source_requirement.minimum_value
          and nullif(proposed->>'maximum_value', '')::numeric is not distinct from source_requirement.maximum_value
          and proposed->>'unit' is not distinct from source_requirement.unit
          and proposed->>'required_material' is not distinct from source_requirement.required_material
          and (proposed->>'quantity_required')::integer = source_requirement.quantity_required
          and proposed->>'requirement_level' = source_requirement.requirement_level
          and proposed->>'preparation_instructions' = source_requirement.preparation_instructions
          and proposed->>'notes' = source_requirement.notes
          and (proposed->>'sort_order')::integer = source_requirement.sort_order
      )
  ) then raise exception 'Derived Equipment requirements must exactly snapshot the source'; end if;

  insert into public.formula_versions(
    workspace_id, owner_id, id, formula_id, version, status, description,
    target_characteristics, process_instructions, development_notes,
    phase_definitions, manufacturing_process, created_at, updated_at,
    derived_from_version_id
  ) values (
    wid, uid, candidate_id, candidate_formula_version->>'formula_id',
    candidate_formula_version->>'version', 'Draft',
    candidate_formula_version->>'description',
    candidate_formula_version->>'target_characteristics',
    candidate_formula_version->>'process_instructions',
    candidate_formula_version->>'development_notes',
    coalesce(nullif(candidate_formula_version->'phase_definitions', 'null'::jsonb), '[]'::jsonb),
    coalesce(nullif(candidate_formula_version->'manufacturing_process', 'null'::jsonb), '[]'::jsonb),
    candidate_formula_version->>'created_at', candidate_formula_version->>'updated_at',
    source_version.id
  );

  for line in select value from jsonb_array_elements(candidate_formula_lines) loop
    insert into public.formula_lines(
      workspace_id, owner_id, id, formula_version_id, ingredient_id,
      percentage, phase, sort_order, notes, formulation_role
    ) values (
      wid, uid, line->>'id', candidate_id, line->>'ingredient_id',
      (line->>'percentage')::numeric, line->>'phase',
      (line->>'sort_order')::integer, line->>'notes', line->>'formulation_role'
    );
  end loop;

  result := public.replace_formula_equipment_requirements_v1(
    candidate_id,
    candidate_formula_version->>'updated_at',
    candidate_formula_version->>'updated_at',
    candidate_equipment_requirements
  );
  return jsonb_build_object(
    'formulaVersionId', candidate_id,
    'lineCount', jsonb_array_length(candidate_formula_lines),
    'requirementCount', jsonb_array_length(candidate_equipment_requirements),
    'requirements', result->'requirements'
  );
end $$;

revoke all on function public.duplicate_formula_version_as_draft_v1(text,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.duplicate_formula_version_as_draft_v1(text,jsonb,jsonb,jsonb) to authenticated, service_role;
comment on function public.duplicate_formula_version_as_draft_v1(text,jsonb,jsonb,jsonb) is
  'kf.authority.v1 owner_derived atomic exact copy to a new editable Draft, including Formula Equipment snapshots';

-- Preserve the one-time local v9 import and include this new collection when a
-- not-yet-reconciled workspace is imported after this migration is deployed.
alter function public.import_v9_relational(jsonb)
  rename to import_v9_relational_pre_formula_equipment_requirements;
revoke all on function public.import_v9_relational_pre_formula_equipment_requirements(jsonb) from public, anon, authenticated;

create or replace function public.import_v9_relational(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
  wid uuid;
  requirement jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  result := public.import_v9_relational_pre_formula_equipment_requirements(payload);
  wid := (result->>'workspaceId')::uuid;
  perform set_config('kf.formula_equipment_import', 'on', true);

  for requirement in
    select value from jsonb_array_elements(coalesce(payload->'formulaEquipmentRequirements', '[]'::jsonb))
  loop
    insert into public.process_equipment_requirements(
      id, workspace_id, owner_id, source_type, source_id, formula_version_id,
      catalog_key, requirement_name, category, required_equipment_type,
      required_capability, minimum_capacity, required_precision, minimum_value,
      maximum_value, unit, required_material, quantity_required,
      requirement_level, preparation_instructions, notes, sort_order, revision,
      created_at, updated_at
    ) values (
      (requirement->>'id')::uuid, wid, uid, 'formula_version',
      requirement->>'formula_version_id', requirement->>'formula_version_id',
      requirement->>'catalog_key', requirement->>'requirement_name', requirement->>'category',
      nullif(requirement->>'required_equipment_type', ''),
      nullif(requirement->>'required_capability', ''),
      nullif(requirement->>'minimum_capacity', '')::numeric,
      nullif(requirement->>'required_precision', '')::numeric,
      nullif(requirement->>'minimum_value', '')::numeric,
      nullif(requirement->>'maximum_value', '')::numeric,
      nullif(requirement->>'unit', ''), nullif(requirement->>'required_material', ''),
      (requirement->>'quantity_required')::integer, requirement->>'requirement_level',
      coalesce(requirement->>'preparation_instructions', ''),
      coalesce(requirement->>'notes', ''),
      coalesce((requirement->>'sort_order')::integer, 0),
      coalesce((requirement->>'revision')::integer, 1),
      coalesce((requirement->>'created_at')::timestamptz, now()),
      coalesce((requirement->>'updated_at')::timestamptz, now())
    );
  end loop;
  perform set_config('kf.formula_equipment_import', 'off', true);

  result := jsonb_set(
    result,
    array['counts', 'formulaEquipmentRequirements'],
    to_jsonb(jsonb_array_length(coalesce(payload->'formulaEquipmentRequirements', '[]'::jsonb))),
    true
  );
  return result;
end $$;

revoke all on function public.import_v9_relational(jsonb) from public, anon;
grant execute on function public.import_v9_relational(jsonb) to authenticated, service_role;
comment on function public.import_v9_relational(jsonb) is
  'kf.authority.v1 owner_derived one_time_compatibility_import; includes Formula Equipment requirement snapshots';

comment on table public.process_equipment_requirements is
  'Current Equipment stays in equipment_items; formula_version rows here are immutable requirement snapshots after Draft and write through owner-scoped RPC only.';
