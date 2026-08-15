-- Read the canonical snake_case Foot Care analysis persisted by the workspace
-- repository. This replaces only the saved-concept identity lookup while
-- preserving the complete database-attested registry and provenance preflight
-- introduced by the preceding hardening migration.
create or replace function public.create_foot_care_procurement_handoff(
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
  concept_registry_version text;
  project_kind text;
  group_value jsonb;
  target_value jsonb;
  registry_target jsonb;
  group_id text;
  group_label text;
  request_id uuid;
  requested_item_id uuid;
  request_created boolean;
  created_item_count integer;
  item_ids jsonb;
  result_groups jsonb := '[]'::jsonb;
  target_text text;
  server_registry_version constant text := 'foot-care-2026-08-15-v1';
  server_targets constant jsonb := $registry$
  [
    {
      "id":"urea",
      "name":"Urea",
      "projectKinds":["daily_dry_foot_care"],
      "benchmarkIds":["gehwol-fusskraft-blue-no-2026-08"],
      "benchmarkIngredientIncis":["Urea"],
      "functions":["humectant","dry-skin care"],
      "requiredSpecifications":["Cosmetic grade","Supplier usage guidance","COA and SDS availability"],
      "acceptableSubstitutes":["Documented cosmetic humectant system with equivalent development function"]
    },
    {
      "id":"glycerin",
      "name":"Glycerin",
      "projectKinds":["daily_dry_foot_care"],
      "benchmarkIds":["gehwol-fusskraft-blue-no-2026-08"],
      "benchmarkIngredientIncis":["Glycerin"],
      "functions":["humectant"],
      "requiredSpecifications":["Cosmetic grade","INCI identity confirmed","COA and SDS availability"],
      "acceptableSubstitutes":["Documented cosmetic humectant with compatible sensory and processing profile"]
    },
    {
      "id":"barrier-system",
      "name":"Lanolin or vegan barrier-system alternative",
      "projectKinds":["daily_dry_foot_care"],
      "benchmarkIds":["gehwol-fusskraft-blue-no-2026-08"],
      "benchmarkIngredientIncis":["Lanolin"],
      "functions":["emollient","occlusive / barrier support"],
      "requiredSpecifications":["Cosmetic leave-on suitability","Origin and allergen documentation","Supplier usage guidance"],
      "acceptableSubstitutes":["Documented vegan barrier system","Alternative occlusive emollient system"]
    },
    {
      "id":"dry-emollient",
      "name":"Isopropyl Palmitate or lower-grease emollient alternative",
      "projectKinds":["daily_dry_foot_care"],
      "benchmarkIds":["gehwol-fusskraft-blue-no-2026-08"],
      "benchmarkIngredientIncis":["Isopropyl Palmitate"],
      "functions":["emollient","spreadability"],
      "requiredSpecifications":["Cosmetic grade","Leave-on skin suitability","Supplier sensory and usage guidance"],
      "acceptableSubstitutes":["Lower-grease dry emollient with documented emulsion compatibility"]
    },
    {
      "id":"ow-emulsifier",
      "name":"Cosmetic O/W emulsifier system",
      "projectKinds":["daily_dry_foot_care","sweat_control"],
      "benchmarkIds":["gehwol-fusskraft-blue-no-2026-08","gehwol-med-antiperspirant-eu-2026-08"],
      "benchmarkIngredientIncis":["Glycol Stearate SE","Cetyl Alcohol","Cetearyl Alcohol"],
      "functions":["emulsifying / structuring system","emulsion structure"],
      "requiredSpecifications":["Cosmetic O/W system","Supplier process and usage guidance","Compatibility evidence for intended actives"],
      "acceptableSubstitutes":["Complete supplier-documented O/W emulsifier system"]
    },
    {
      "id":"aloe-vera-powder",
      "name":"Aloe Vera powder",
      "projectKinds":["daily_dry_foot_care"],
      "benchmarkIds":["gehwol-fusskraft-blue-no-2026-08"],
      "benchmarkIngredientIncis":["Aloe Barbadensis Leaf Juice Powder"],
      "functions":["skin conditioning"],
      "requiredSpecifications":["Cosmetic grade","Concentration or reconstitution basis documented","COA and microbiological specification"],
      "acceptableSubstitutes":["Documented cosmetic aloe concentrate with clear equivalence basis"],
      "preferredSupplierHint":"Mystic Moments"
    },
    {
      "id":"menthol",
      "name":"Menthol",
      "projectKinds":["daily_dry_foot_care","sweat_control"],
      "benchmarkIds":["gehwol-fusskraft-blue-no-2026-08","gehwol-med-antiperspirant-eu-2026-08"],
      "benchmarkIngredientIncis":["Menthol"],
      "functions":["cooling / sensory"],
      "requiredSpecifications":["Cosmetic grade","Supplier usage and solubility guidance","COA and SDS availability"],
      "acceptableSubstitutes":["Documented cosmetic cooling sensory material"],
      "preferredSupplierHint":"Mystic Moments"
    },
    {
      "id":"aluminum-chlorohydrate",
      "name":"Aluminum Chlorohydrate",
      "projectKinds":["sweat_control"],
      "benchmarkIds":["gehwol-med-antiperspirant-eu-2026-08"],
      "benchmarkIngredientIncis":["Aluminum Chlorohydrate"],
      "functions":["antiperspirant active"],
      "requiredSpecifications":["Cosmetic antiperspirant grade","EU/EEA supplier documentation","Usage, pH and compatibility guidance","COA and SDS availability"],
      "acceptableSubstitutes":["Documented cosmetic antiperspirant active for explicit Compliance review"]
    },
    {
      "id":"panthenol",
      "name":"Panthenol",
      "projectKinds":["sweat_control"],
      "benchmarkIds":["gehwol-med-antiperspirant-eu-2026-08"],
      "benchmarkIngredientIncis":["Panthenol"],
      "functions":["skin conditioning","humectant support"],
      "requiredSpecifications":["Cosmetic grade","Active concentration documented","Supplier usage guidance"],
      "acceptableSubstitutes":["Documented cosmetic conditioning humectant"]
    },
    {
      "id":"zinc-ricinoleate",
      "name":"Zinc Ricinoleate",
      "projectKinds":["foot_shoe_deodorizer"],
      "benchmarkIds":["gehwol-foot-shoe-deo-eu-2026-08"],
      "benchmarkIngredientIncis":["Zinc Ricinoleate"],
      "functions":["odour-control active / odour binding"],
      "requiredSpecifications":["Cosmetic deodorant grade","Supplier usage and compatibility guidance","COA and SDS availability"],
      "acceptableSubstitutes":["Documented cosmetic odour-binding active without antimicrobial positioning"]
    },
    {
      "id":"zinc-ricinoleate-system",
      "name":"Zinc Ricinoleate solubilisation/neutralisation system",
      "projectKinds":["foot_shoe_deodorizer"],
      "benchmarkIds":["gehwol-foot-shoe-deo-eu-2026-08"],
      "benchmarkIngredientIncis":["Triethanolamine","Propylene Glycol"],
      "functions":["neutralisation / pH / solubilisation support","solvent / humectant"],
      "requiredSpecifications":["Supplier-documented compatibility with zinc ricinoleate","Cosmetic leave-on suitability","Process and pH guidance"],
      "acceptableSubstitutes":["Complete supplier-documented zinc ricinoleate carrier system"]
    },
    {
      "id":"foot-care-preservation",
      "name":"Preservation system suitable for foot-care emulsions",
      "projectKinds":["daily_dry_foot_care","sweat_control"],
      "benchmarkIds":["gehwol-fusskraft-blue-no-2026-08","gehwol-med-antiperspirant-eu-2026-08"],
      "benchmarkIngredientIncis":["Caprylyl Glycol","Phenylpropanol","Phenoxyethanol"],
      "functions":["preservative","preservative support"],
      "requiredSpecifications":["Supplier-documented cosmetic preservation system","Intended pH and formulation compatibility","Challenge-test planning information","COA and SDS availability"],
      "acceptableSubstitutes":["Alternative complete preservation system supported for the intended aqueous formulation"]
    }
  ]
  $registry$::jsonb;
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
  if jsonb_typeof(concept.analysis->'foot_care') is distinct from 'object' then
    raise exception 'FOOT_CARE_HANDOFF_CONCEPT_ANALYSIS_INVALID';
  end if;

  concept_registry_version := nullif(trim(concept.analysis->'foot_care'->>'registry_version'), '');
  project_kind := nullif(trim(concept.analysis->'foot_care'->>'project_kind'), '');
  if concept_registry_version is null or project_kind is null then
    raise exception 'FOOT_CARE_HANDOFF_CONCEPT_ANALYSIS_INVALID';
  end if;
  if candidate_registry_version is distinct from concept_registry_version then
    raise exception 'FOOT_CARE_HANDOFF_REGISTRY_VERSION_MISMATCH';
  end if;
  if concept_registry_version is distinct from server_registry_version then
    raise exception 'FOOT_CARE_HANDOFF_REGISTRY_VERSION_UNSUPPORTED';
  end if;

  -- Preflight the complete payload before the first Procurement write.
  for group_value in select * from jsonb_array_elements(candidate_groups) loop
    group_id := trim(coalesce(group_value->>'id', ''));
    group_label := trim(coalesce(group_value->>'label', ''));
    if group_id = '' or group_label = ''
      or jsonb_typeof(group_value->'targets') <> 'array'
      or jsonb_array_length(group_value->'targets') = 0
      or jsonb_array_length(group_value->'targets') > 10
    then raise exception 'FOOT_CARE_HANDOFF_GROUP_INVALID'; end if;

    for target_value in select * from jsonb_array_elements(group_value->'targets') loop
      target_text := lower(coalesce(target_value->>'id', '') || ' ' || coalesce(target_value->>'name', ''));
      if nullif(trim(target_value->>'id'), '') is null
        or nullif(trim(target_value->>'name'), '') is null
        or target_text like '%octenidine%'
        or target_text like '%butane%'
        or target_text like '%propane%'
        or target_text like '%aerosol propellant%'
      then raise exception 'FOOT_CARE_HANDOFF_TARGET_BLOCKED_OR_INVALID'; end if;

      registry_target := null;
      select value into registry_target
      from jsonb_array_elements(server_targets)
      where value->>'id' = target_value->>'id';
      if registry_target is null then
        raise exception 'FOOT_CARE_HANDOFF_TARGET_NOT_IN_REGISTRY';
      end if;
      if not (registry_target->'projectKinds' ? project_kind) then
        raise exception 'FOOT_CARE_HANDOFF_TARGET_PROJECT_MISMATCH';
      end if;
      if target_value->>'name' is distinct from registry_target->>'name'
        or target_value->'requiredSpecifications' is distinct from registry_target->'requiredSpecifications'
        or target_value->'acceptableSubstitutes' is distinct from registry_target->'acceptableSubstitutes'
      then raise exception 'FOOT_CARE_HANDOFF_TARGET_DEFINITION_MISMATCH'; end if;
      if target_value->'benchmarkIds' is distinct from registry_target->'benchmarkIds'
        or target_value->'benchmarkIngredientIncis' is distinct from registry_target->'benchmarkIngredientIncis'
        or target_value->'functions' is distinct from registry_target->'functions'
      then raise exception 'FOOT_CARE_HANDOFF_PROVENANCE_MISMATCH'; end if;
      if coalesce(nullif(trim(target_value->>'preferredSupplierHint'), ''), '')
        is distinct from coalesce(registry_target->>'preferredSupplierHint', '')
      then raise exception 'FOOT_CARE_HANDOFF_PREFERRED_SUPPLIER_HINT_MISMATCH'; end if;
    end loop;
  end loop;

  for group_value in select * from jsonb_array_elements(candidate_groups) loop
    group_id := trim(group_value->>'id');
    group_label := trim(group_value->>'label');
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
        'product_studio_concept', candidate_concept_id, group_id, server_registry_version
      ) returning id into request_id;
      request_created := true;
    elsif not exists (
      select 1 from public.procurement_requests
      where id = request_id and source_registry_version = server_registry_version
    ) then
      raise exception 'FOOT_CARE_HANDOFF_REGISTRY_VERSION_CONFLICT';
    end if;

    for target_value in select * from jsonb_array_elements(group_value->'targets') loop
      select value into registry_target
      from jsonb_array_elements(server_targets)
      where value->>'id' = target_value->>'id';

      requested_item_id := null;
      select id into requested_item_id
      from public.procurement_requested_items
      where workspace_id = candidate_workspace_id
        and owner_id = uid
        and procurement_request_id = request_id
        and source_target_id = registry_target->>'id'
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
          candidate_workspace_id, uid, request_id, registry_target->>'name', 'raw_material',
          null, null, 'raw_material',
          'Benchmark functions: ' || array_to_string(array(select jsonb_array_elements_text(registry_target->'functions')), ', '),
          'identified', null, null, null, null, null,
          'Server registry ' || server_registry_version || '. Benchmark → function → sourcing target provenance is canonical and database-validated.',
          '{}', '{}',
          array(select jsonb_array_elements_text(registry_target->'requiredSpecifications')),
          array(select jsonb_array_elements_text(registry_target->'acceptableSubstitutes')),
          'normal', null,
          'Research candidates require owner review. No supplier is selected, no candidate is accepted, no order is created and nothing is purchased.',
          created_item_count,
          registry_target->>'id',
          array(select jsonb_array_elements_text(registry_target->'benchmarkIds')),
          array(select jsonb_array_elements_text(registry_target->'functions')),
          array(select jsonb_array_elements_text(registry_target->'benchmarkIngredientIncis')),
          nullif(registry_target->>'preferredSupplierHint', '')
        ) returning id into requested_item_id;
        created_item_count := created_item_count + 1;
      elsif not exists (
        select 1
        from public.procurement_requested_items
        where id = requested_item_id
          and name = registry_target->>'name'
          and required_specifications = array(select jsonb_array_elements_text(registry_target->'requiredSpecifications'))
          and acceptable_substitutes = array(select jsonb_array_elements_text(registry_target->'acceptableSubstitutes'))
          and source_benchmark_ids = array(select jsonb_array_elements_text(registry_target->'benchmarkIds'))
          and source_benchmark_ingredient_incis = array(select jsonb_array_elements_text(registry_target->'benchmarkIngredientIncis'))
          and source_functions = array(select jsonb_array_elements_text(registry_target->'functions'))
          and preferred_supplier_hint is not distinct from nullif(registry_target->>'preferredSupplierHint', '')
      ) then
        raise exception 'FOOT_CARE_HANDOFF_EXISTING_ITEM_CONFLICT';
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
    'registryVersion', server_registry_version,
    'groups', result_groups,
    'researchStarted', false,
    'candidateAccepted', false,
    'orderCreated', false
  );
end
$$;

revoke all on function public.create_foot_care_procurement_handoff(uuid,text,text,jsonb) from public, anon;
grant execute on function public.create_foot_care_procurement_handoff(uuid,text,text,jsonb) to authenticated;
