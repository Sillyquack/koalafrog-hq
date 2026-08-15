-- Atomic, owner-scoped Foot Care research handoff. This creates Procurement
-- requests and requested items only. It never starts research, accepts a
-- candidate, creates a recommendation, places an order, or changes inventory.
alter table public.procurement_requests
  add column source_type text,
  add column source_id text,
  add column source_group text,
  add column source_registry_version text,
  add constraint procurement_requests_product_studio_source check (
    (source_type is null and source_id is null and source_group is null and source_registry_version is null)
    or (
      source_type = 'product_studio_concept'
      and nullif(trim(source_id), '') is not null
      and nullif(trim(source_group), '') is not null
      and nullif(trim(source_registry_version), '') is not null
    )
  );

create unique index procurement_requests_product_studio_source_unique
  on public.procurement_requests(workspace_id, source_id, source_group)
  where source_type = 'product_studio_concept';

alter table public.procurement_requested_items
  add column source_target_id text,
  add column source_benchmark_ids text[] not null default '{}',
  add column source_benchmark_ingredient_incis text[] not null default '{}',
  add column source_functions text[] not null default '{}',
  add column preferred_supplier_hint text,
  add constraint procurement_requested_items_source_target check (
    source_target_id is null
    or (
      nullif(trim(source_target_id), '') is not null
      and cardinality(source_benchmark_ids) > 0
      and cardinality(source_benchmark_ingredient_incis) > 0
      and cardinality(source_functions) > 0
    )
  );

create unique index procurement_requested_items_source_target_unique
  on public.procurement_requested_items(workspace_id, procurement_request_id, source_target_id)
  where source_target_id is not null;

create function public.create_foot_care_procurement_handoff(
  candidate_workspace_id uuid,
  candidate_concept_id text,
  candidate_registry_version text,
  candidate_groups jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  concept public.product_studio_concepts;
  group_value jsonb;
  target_value jsonb;
  group_id text;
  group_label text;
  request_id uuid;
  requested_item_id uuid;
  request_created boolean;
  created_item_count integer;
  item_ids jsonb;
  result_groups jsonb := '[]'::jsonb;
  target_text text;
begin
  if uid is null then raise exception 'FOOT_CARE_HANDOFF_AUTH_REQUIRED'; end if;
  if candidate_workspace_id is null
    or nullif(trim(candidate_concept_id), '') is null
    or nullif(trim(candidate_registry_version), '') is null
    or jsonb_typeof(candidate_groups) <> 'array'
    or jsonb_array_length(candidate_groups) = 0
  then raise exception 'FOOT_CARE_HANDOFF_INVALID'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    candidate_workspace_id::text || ':' || candidate_concept_id,
    47150815
  ));

  select * into concept
  from public.product_studio_concepts
  where id = candidate_concept_id
    and workspace_id = candidate_workspace_id
    and owner_id = uid
    and product_type = 'foot_care'
    and exists (
      select 1 from public.workspaces
      where id = candidate_workspace_id
        and owner_id = uid
        and lifecycle_state = 'active'
    )
  for update;

  if concept.id is null then raise exception 'FOOT_CARE_CONCEPT_UNAVAILABLE'; end if;

  for group_value in select * from jsonb_array_elements(candidate_groups) loop
    group_id := trim(coalesce(group_value->>'id', ''));
    group_label := trim(coalesce(group_value->>'label', ''));
    if group_id = '' or group_label = ''
      or jsonb_typeof(group_value->'targets') <> 'array'
      or jsonb_array_length(group_value->'targets') = 0
      or jsonb_array_length(group_value->'targets') > 10
    then raise exception 'FOOT_CARE_HANDOFF_GROUP_INVALID'; end if;

    request_id := null;
    request_created := false;
    created_item_count := 0;
    item_ids := '[]'::jsonb;

    select id into request_id
    from public.procurement_requests
    where workspace_id = candidate_workspace_id
      and owner_id = uid
      and source_type = 'product_studio_concept'
      and source_id = candidate_concept_id
      and source_group = group_id
    for update;

    if request_id is null then
      insert into public.procurement_requests(
        workspace_id, owner_id, title, status, category, priority, needed_by, notes,
        source_type, source_id, source_group, source_registry_version
      ) values (
        candidate_workspace_id, uid, concept.name || ' — ' || group_label,
        'identified', 'raw_material', 'normal', null,
        'Foot Care research requirements only. Live research requires explicit owner consent; all candidates enter review. No supplier is selected, no order is created and nothing is purchased.',
        'product_studio_concept', candidate_concept_id, group_id, candidate_registry_version
      ) returning id into request_id;
      request_created := true;
    elsif not exists (
      select 1 from public.procurement_requests
      where id = request_id and source_registry_version = candidate_registry_version
    ) then
      raise exception 'FOOT_CARE_HANDOFF_REGISTRY_VERSION_CONFLICT';
    end if;

    for target_value in select * from jsonb_array_elements(group_value->'targets') loop
      target_text := lower(coalesce(target_value->>'id', '') || ' ' || coalesce(target_value->>'name', ''));
      if nullif(trim(target_value->>'id'), '') is null
        or nullif(trim(target_value->>'name'), '') is null
        or jsonb_typeof(target_value->'benchmarkIds') <> 'array'
        or jsonb_array_length(target_value->'benchmarkIds') = 0
        or jsonb_typeof(target_value->'benchmarkIngredientIncis') <> 'array'
        or jsonb_array_length(target_value->'benchmarkIngredientIncis') = 0
        or jsonb_typeof(target_value->'functions') <> 'array'
        or jsonb_array_length(target_value->'functions') = 0
        or target_text like '%octenidine%'
        or target_text like '%butane%'
        or target_text like '%propane%'
        or target_text like '%aerosol propellant%'
      then raise exception 'FOOT_CARE_HANDOFF_TARGET_BLOCKED_OR_INVALID'; end if;

      requested_item_id := null;
      select id into requested_item_id
      from public.procurement_requested_items
      where workspace_id = candidate_workspace_id
        and owner_id = uid
        and procurement_request_id = request_id
        and source_target_id = target_value->>'id'
      for update;

      if requested_item_id is null then
        insert into public.procurement_requested_items(
          workspace_id, owner_id, procurement_request_id, name, category,
          requested_quantity, unit, requirement_type, reason, status,
          package_preference, target_supplier_id, target_supplier_product_domain,
          target_supplier_product_id, decision_notes, sourcing_notes,
          intended_product_ids, intended_formula_ids, required_specifications,
          acceptable_substitutes, priority, needed_by, notes, display_order,
          source_target_id, source_benchmark_ids, source_functions,
          source_benchmark_ingredient_incis, preferred_supplier_hint
        ) values (
          candidate_workspace_id, uid, request_id, target_value->>'name', 'raw_material',
          null, null, 'raw_material',
          'Benchmark functions: ' || array_to_string(array(select jsonb_array_elements_text(target_value->'functions')), ', '),
          'identified', null, null, null, null, null,
          'Registry ' || candidate_registry_version || '. Benchmark → function → sourcing target provenance is stored on this item.',
          '{}', '{}',
          array(select jsonb_array_elements_text(coalesce(target_value->'requiredSpecifications', '[]'::jsonb))),
          array(select jsonb_array_elements_text(coalesce(target_value->'acceptableSubstitutes', '[]'::jsonb))),
          'normal', null, coalesce(target_value->>'notes', ''), created_item_count,
          target_value->>'id',
          array(select jsonb_array_elements_text(target_value->'benchmarkIds')),
          array(select jsonb_array_elements_text(target_value->'functions')),
          array(select jsonb_array_elements_text(target_value->'benchmarkIngredientIncis')),
          nullif(trim(target_value->>'preferredSupplierHint'), '')
        ) returning id into requested_item_id;
        created_item_count := created_item_count + 1;
      end if;

      item_ids := item_ids || jsonb_build_array(requested_item_id);
    end loop;

    result_groups := result_groups || jsonb_build_array(jsonb_build_object(
      'groupId', group_id,
      'requestId', request_id,
      'operation', case when request_created then 'created' else 'reused' end,
      'createdItemCount', created_item_count,
      'itemIds', item_ids
    ));
  end loop;

  return jsonb_build_object(
    'schemaVersion', 1,
    'conceptId', candidate_concept_id,
    'registryVersion', candidate_registry_version,
    'groups', result_groups,
    'researchStarted', false,
    'candidateAccepted', false,
    'orderCreated', false
  );
end
$$;

revoke all on function public.create_foot_care_procurement_handoff(uuid,text,text,jsonb) from public, anon;
grant execute on function public.create_foot_care_procurement_handoff(uuid,text,text,jsonb) to authenticated;
