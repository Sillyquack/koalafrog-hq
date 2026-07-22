-- Atomic Beard result persistence with metadata-only database diagnostics.
-- Provider content is accepted only as result data and is never copied into
-- diagnostic columns. The inner exception block is a PostgreSQL subtransaction:
-- every result write rolls back before the outer diagnostic update is stored.
alter table public.intelligence_analyses
  add column persistence_failure_step text,
  add column persistence_failure_table text,
  add column persistence_failure_operation text,
  add column persistence_failure_sqlstate text,
  add column persistence_failure_constraint text,
  add column persistence_failure_entity_type text,
  add column persistence_failure_entity_index integer,
  add column persistence_failure_diagnostic_version text;

alter table public.intelligence_analyses
  add constraint intelligence_analyses_persistence_step_check check (
    persistence_failure_step is null or persistence_failure_step in (
      'analysis_lock','observation_insert','recommendation_insert','analysis_update'
    )
  ),
  add constraint intelligence_analyses_persistence_table_check check (
    persistence_failure_table is null or persistence_failure_table in (
      'intelligence_analyses','intelligence_observations','intelligence_recommendations'
    )
  ),
  add constraint intelligence_analyses_persistence_operation_check check (
    persistence_failure_operation is null or
    persistence_failure_operation in ('select_for_update','insert','update')
  ),
  add constraint intelligence_analyses_persistence_sqlstate_check check (
    persistence_failure_sqlstate is null or
    persistence_failure_sqlstate ~ '^[0-9A-Z]{5}$'
  ),
  add constraint intelligence_analyses_persistence_constraint_check check (
    persistence_failure_constraint is null or (
      char_length(persistence_failure_constraint) between 1 and 63 and
      persistence_failure_constraint ~ '^[a-zA-Z_][a-zA-Z0-9_]*$'
    )
  ),
  add constraint intelligence_analyses_persistence_entity_check check (
    persistence_failure_entity_type is null or
    persistence_failure_entity_type in ('analysis','observation','recommendation')
  ),
  add constraint intelligence_analyses_persistence_entity_index_check check (
    persistence_failure_entity_index is null or
    persistence_failure_entity_index >= 0
  ),
  add constraint intelligence_analyses_persistence_diagnostic_version_check check (
    persistence_failure_diagnostic_version is null or
    persistence_failure_diagnostic_version = 'beard-persistence-diagnostic-v1'
  ),
  add constraint intelligence_analyses_persistence_diagnostic_complete_check check (
    (
      persistence_failure_step is null and
      persistence_failure_table is null and
      persistence_failure_operation is null and
      persistence_failure_sqlstate is null and
      persistence_failure_constraint is null and
      persistence_failure_entity_type is null and
      persistence_failure_entity_index is null and
      persistence_failure_diagnostic_version is null
    ) or (
      persistence_failure_step is not null and
      persistence_failure_table is not null and
      persistence_failure_operation is not null and
      persistence_failure_sqlstate is not null and
      persistence_failure_entity_type is not null and
      (
        (persistence_failure_entity_type = 'analysis' and
          persistence_failure_entity_index is null) or
        (persistence_failure_entity_type in ('observation','recommendation') and
          persistence_failure_entity_index is not null)
      ) and
      persistence_failure_diagnostic_version = 'beard-persistence-diagnostic-v1'
    )
  );

revoke insert(
  persistence_failure_step,persistence_failure_table,
  persistence_failure_operation,persistence_failure_sqlstate,
  persistence_failure_constraint,persistence_failure_entity_type,
  persistence_failure_entity_index,persistence_failure_diagnostic_version
) on table public.intelligence_analyses from authenticated;
revoke update(
  persistence_failure_step,persistence_failure_table,
  persistence_failure_operation,persistence_failure_sqlstate,
  persistence_failure_constraint,persistence_failure_entity_type,
  persistence_failure_entity_index,persistence_failure_diagnostic_version
) on table public.intelligence_analyses from authenticated;

create function public.persist_beard_analysis_result(
  candidate_workspace_id uuid,
  candidate_analysis_id uuid,
  candidate_correlation_id uuid,
  candidate_result jsonb,
  candidate_observations jsonb,
  candidate_recommendations jsonb,
  candidate_provider_usage jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  diagnostic_step text := 'analysis_lock';
  diagnostic_table text := 'intelligence_analyses';
  diagnostic_operation text := 'select_for_update';
  diagnostic_entity_type text := 'analysis';
  diagnostic_entity_index integer := null;
  diagnostic_sqlstate text;
  diagnostic_constraint text;
  analysis_owner_user_id uuid;
  candidate jsonb;
  candidate_index integer;
begin
  begin
    select owner_user_id into analysis_owner_user_id
    from public.intelligence_analyses
    where id=candidate_analysis_id
      and workspace_id=candidate_workspace_id
      and correlation_id=candidate_correlation_id
      and status='analyzing'
    for update;
    if not found then
      raise exception using errcode='P0002';
    end if;

    diagnostic_step := 'observation_insert';
    diagnostic_table := 'intelligence_observations';
    diagnostic_operation := 'insert';
    diagnostic_entity_type := 'observation';
    for candidate, candidate_index in
      select value, (ordinality - 1)::integer
      from jsonb_array_elements(candidate_observations) with ordinality
    loop
      diagnostic_entity_index := candidate_index;
      insert into public.intelligence_observations(
        id,workspace_id,owner_user_id,analysis_id,category,statement,
        confidence,supporting_views,evidence_description,limitations,
        related_beard_zones,provenance
      ) values (
        (candidate->>'id')::uuid,candidate_workspace_id,
        analysis_owner_user_id,candidate_analysis_id,candidate->>'category',
        candidate->>'statement',(candidate->>'confidence')::numeric,
        array(select jsonb_array_elements_text(candidate->'supportingViews')),
        candidate->>'evidenceDescription',
        array(select jsonb_array_elements_text(candidate->'limitations')),
        array(select jsonb_array_elements_text(candidate->'relatedBeardZones')),
        'ai'
      );
    end loop;

    diagnostic_step := 'recommendation_insert';
    diagnostic_table := 'intelligence_recommendations';
    diagnostic_operation := 'insert';
    diagnostic_entity_type := 'recommendation';
    for candidate, candidate_index in
      select value, (ordinality - 1)::integer
      from jsonb_array_elements(candidate_recommendations) with ordinality
    loop
      diagnostic_entity_index := candidate_index;
      insert into public.intelligence_recommendations(
        id,workspace_id,owner_user_id,analysis_id,title,reason,confidence,
        priority,expected_benefit,supporting_observation_ids,affected_zones,
        tool_constraints,proposed_guard_strategy,review_status,provenance
      ) values (
        (candidate->>'id')::uuid,candidate_workspace_id,
        analysis_owner_user_id,candidate_analysis_id,candidate->>'title',
        candidate->>'reason',(candidate->>'confidence')::numeric,
        candidate->>'priority',candidate->>'expectedBenefit',
        array(select value::uuid from jsonb_array_elements_text(
          candidate->'supportingObservationIds'
        )),
        array(select jsonb_array_elements_text(candidate->'affectedZones')),
        array(select jsonb_array_elements_text(candidate->'toolConstraints')),
        candidate->>'proposedGuardStrategy',candidate->>'status','ai'
      );
    end loop;

    diagnostic_step := 'analysis_update';
    diagnostic_table := 'intelligence_analyses';
    diagnostic_operation := 'update';
    diagnostic_entity_type := 'analysis';
    diagnostic_entity_index := null;
    update public.intelligence_analyses
    set status='completed',
        result_payload=candidate_result,
        provider_usage=candidate_provider_usage,
        completed_at=pg_catalog.now()
    where id=candidate_analysis_id
      and workspace_id=candidate_workspace_id
      and correlation_id=candidate_correlation_id
      and status='analyzing';
    if not found then
      raise exception using errcode='P0002';
    end if;

    return jsonb_build_object('success',true);
  exception when others then
    get stacked diagnostics
      diagnostic_sqlstate = returned_sqlstate,
      diagnostic_constraint = constraint_name;
  end;

  update public.intelligence_analyses
  set status='failed',
      error_code='RESULT_PERSISTENCE_FAILED',
      completed_at=pg_catalog.now(),
      persistence_failure_step=diagnostic_step,
      persistence_failure_table=diagnostic_table,
      persistence_failure_operation=diagnostic_operation,
      persistence_failure_sqlstate=diagnostic_sqlstate,
      persistence_failure_constraint=nullif(diagnostic_constraint,''),
      persistence_failure_entity_type=diagnostic_entity_type,
      persistence_failure_entity_index=diagnostic_entity_index,
      persistence_failure_diagnostic_version='beard-persistence-diagnostic-v1'
  where id=candidate_analysis_id
    and workspace_id=candidate_workspace_id
    and correlation_id=candidate_correlation_id;

  if not found then
    raise exception using errcode='P0002';
  end if;
  return jsonb_build_object(
    'success',false,
    'step',diagnostic_step,
    'table',diagnostic_table,
    'operation',diagnostic_operation,
    'sqlstate',diagnostic_sqlstate,
    'constraint',nullif(diagnostic_constraint,''),
    'entityType',diagnostic_entity_type,
    'entityIndex',diagnostic_entity_index,
    'diagnosticVersion','beard-persistence-diagnostic-v1'
  );
end
$$;

revoke all on function public.persist_beard_analysis_result(
  uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb
) from public,anon,authenticated;
grant execute on function public.persist_beard_analysis_result(
  uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb
) to service_role;
