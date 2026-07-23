-- Admit semantic safety v4 for new Beard Photo Analysis attempts while
-- preserving v2/v3 provenance on historical rows. No data is rewritten.

alter table public.intelligence_analyses
  drop constraint intelligence_analyses_semantic_rule_version_check,
  add constraint intelligence_analyses_semantic_rule_version_check check (
    semantic_rule_version is null or
    semantic_rule_version in (
      'beard-semantic-safety-v2',
      'beard-semantic-safety-v3',
      'beard-semantic-safety-v4'
    )
  ),
  drop constraint intelligence_analyses_failure_validator_check,
  add constraint intelligence_analyses_failure_validator_check check (
    failure_validator is null or failure_validator in (
      'responses-envelope','responses-output','json-parser','json-schema',
      'beard-contract','beard-semantic-safety-v2',
      'beard-semantic-safety-v3','beard-semantic-safety-v4',
      'legacy-beard-validator'
    )
  );

create or replace function public.begin_beard_provider_attempt(
  candidate_workspace_id uuid,
  candidate_analysis_id uuid,
  candidate_provider text,
  candidate_model text,
  candidate_prompt_version text
)
returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare claimed boolean := false;
begin
  if auth.uid() is null then return false; end if;
  if candidate_provider <> 'openai'
    or candidate_model not in ('gpt-5','gpt-5-2025-08-07')
    or candidate_prompt_version <> 'beard-photo-analysis-v4' then
    return false;
  end if;
  update public.intelligence_analyses
  set provider_name=candidate_provider,
      model_name=candidate_model,
      prompt_version=candidate_prompt_version,
      semantic_rule_version='beard-semantic-safety-v4',
      provider_attempted_at=pg_catalog.now(),
      provider_attempt_count=provider_attempt_count+1,
      status='analyzing'
  where id=candidate_analysis_id
    and workspace_id=candidate_workspace_id
    and owner_user_id=auth.uid()
    and schema_version=2
    and contract_version='beard-photo-result-contract-v2'
    and status='staging'
    and provider_attempt_count=0;
  claimed := found;
  return claimed;
end
$$;

revoke all on function public.begin_beard_provider_attempt(
  uuid,uuid,text,text,text
) from public,anon;
grant execute on function public.begin_beard_provider_attempt(
  uuid,uuid,text,text,text
) to authenticated,service_role;

create or replace function public.persist_beard_analysis_result(
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
  observation_id uuid;
  recommendation_id uuid;
  reference_key text;
  reference_index integer;
  observation_id_by_key jsonb := '{}'::jsonb;
  supporting_ids uuid[];
begin
  begin
    select owner_user_id into analysis_owner_user_id
    from public.intelligence_analyses
    where id=candidate_analysis_id
      and workspace_id=candidate_workspace_id
      and correlation_id=candidate_correlation_id
      and schema_version=2
      and contract_version='beard-photo-result-contract-v2'
      and prompt_version='beard-photo-analysis-v4'
      and semantic_rule_version='beard-semantic-safety-v4'
      and status='analyzing'
    for update;
    if not found then raise exception using errcode='P0002'; end if;

    diagnostic_step := 'observation_insert';
    diagnostic_table := 'intelligence_observations';
    diagnostic_operation := 'insert';
    diagnostic_entity_type := 'observation';
    for candidate, candidate_index in
      select value,(ordinality-1)::integer
      from jsonb_array_elements(candidate_observations) with ordinality
    loop
      diagnostic_entity_index := candidate_index;
      observation_id := gen_random_uuid();
      insert into public.intelligence_observations(
        id,workspace_id,owner_user_id,analysis_id,provider_observation_key,
        category,statement,confidence,supporting_views,evidence_description,
        limitations,related_beard_zones,provenance
      ) values (
        observation_id,candidate_workspace_id,analysis_owner_user_id,
        candidate_analysis_id,candidate->>'observationKey',candidate->>'category',
        candidate->>'statement',(candidate->>'confidence')::numeric,
        array(select jsonb_array_elements_text(candidate->'supportingViews')),
        candidate->>'evidenceDescription',
        array(select jsonb_array_elements_text(candidate->'limitations')),
        array(select jsonb_array_elements_text(candidate->'relatedBeardZones')),
        'ai'
      );
      observation_id_by_key := observation_id_by_key ||
        jsonb_build_object(candidate->>'observationKey',observation_id::text);
    end loop;

    diagnostic_step := 'recommendation_insert';
    diagnostic_table := 'intelligence_recommendations';
    diagnostic_operation := 'insert';
    diagnostic_entity_type := 'recommendation';
    for candidate, candidate_index in
      select value,(ordinality-1)::integer
      from jsonb_array_elements(candidate_recommendations) with ordinality
    loop
      diagnostic_entity_index := candidate_index;
      supporting_ids := '{}';
      for reference_key,reference_index in
        select value,(ordinality-1)::integer
        from jsonb_array_elements_text(candidate->'supportingObservationKeys')
          with ordinality
      loop
        if not observation_id_by_key ? reference_key then
          raise exception using errcode='23503';
        end if;
        supporting_ids := array_append(
          supporting_ids,(observation_id_by_key->>reference_key)::uuid
        );
      end loop;
      recommendation_id := (candidate->>'id')::uuid;
      insert into public.intelligence_recommendations(
        id,workspace_id,owner_user_id,analysis_id,title,reason,confidence,
        priority,expected_benefit,supporting_observation_ids,affected_zones,
        tool_constraints,proposed_guard_strategy,review_status,provenance
      ) values (
        recommendation_id,candidate_workspace_id,analysis_owner_user_id,
        candidate_analysis_id,candidate->>'title',candidate->>'reason',
        (candidate->>'confidence')::numeric,candidate->>'priority',
        candidate->>'expectedBenefit',supporting_ids,
        array(select jsonb_array_elements_text(candidate->'affectedZones')),
        array(select jsonb_array_elements_text(candidate->'toolConstraints')),
        candidate->>'proposedGuardStrategy',candidate->>'status','ai'
      );

      diagnostic_step := 'relationship_insert';
      diagnostic_table := 'intelligence_recommendation_observations';
      diagnostic_operation := 'insert';
      diagnostic_entity_type := 'relationship';
      for reference_key,reference_index in
        select value,(ordinality-1)::integer
        from jsonb_array_elements_text(candidate->'supportingObservationKeys')
          with ordinality
      loop
        diagnostic_entity_index := reference_index;
        insert into public.intelligence_recommendation_observations(
          workspace_id,owner_user_id,analysis_id,recommendation_id,observation_id
        ) values (
          candidate_workspace_id,analysis_owner_user_id,candidate_analysis_id,
          recommendation_id,(observation_id_by_key->>reference_key)::uuid
        );
      end loop;
      diagnostic_step := 'recommendation_insert';
      diagnostic_table := 'intelligence_recommendations';
      diagnostic_entity_type := 'recommendation';
      diagnostic_entity_index := candidate_index;
    end loop;

    diagnostic_step := 'analysis_update';
    diagnostic_table := 'intelligence_analyses';
    diagnostic_operation := 'update';
    diagnostic_entity_type := 'analysis';
    diagnostic_entity_index := null;
    update public.intelligence_analyses
    set status='completed',result_payload=candidate_result,
        provider_usage=candidate_provider_usage,completed_at=pg_catalog.now()
    where id=candidate_analysis_id and workspace_id=candidate_workspace_id
      and correlation_id=candidate_correlation_id and status='analyzing';
    if not found then raise exception using errcode='P0002'; end if;
    return jsonb_build_object('success',true);
  exception when others then
    get stacked diagnostics
      diagnostic_sqlstate=returned_sqlstate,
      diagnostic_constraint=constraint_name;
  end;

  update public.intelligence_analyses
  set status='failed',error_code='RESULT_PERSISTENCE_FAILED',
      completed_at=pg_catalog.now(),persistence_failure_step=diagnostic_step,
      persistence_failure_table=diagnostic_table,
      persistence_failure_operation=diagnostic_operation,
      persistence_failure_sqlstate=diagnostic_sqlstate,
      persistence_failure_constraint=nullif(diagnostic_constraint,''),
      persistence_failure_entity_type=diagnostic_entity_type,
      persistence_failure_entity_index=diagnostic_entity_index,
      persistence_failure_diagnostic_version='beard-persistence-diagnostic-v1'
  where id=candidate_analysis_id and workspace_id=candidate_workspace_id
    and correlation_id=candidate_correlation_id;
  if not found then raise exception using errcode='P0002'; end if;
  return jsonb_build_object(
    'success',false,'step',diagnostic_step,'table',diagnostic_table,
    'operation',diagnostic_operation,'sqlstate',diagnostic_sqlstate,
    'constraint',nullif(diagnostic_constraint,''),
    'entityType',diagnostic_entity_type,'entityIndex',diagnostic_entity_index,
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

create or replace function public.lookup_beard_analysis_support_diagnostic(
  candidate_workspace_id uuid,
  candidate_support_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  current_owner uuid := auth.uid();
  support_uuid uuid;
  response jsonb;
begin
  if current_owner is null or candidate_workspace_id is null or
    candidate_support_id is null or
    candidate_support_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;

  support_uuid := candidate_support_id::uuid;

  select jsonb_build_object(
    'supportId',a.correlation_id,
    'analysisId',a.id,
    'status',a.status,
    'errorCode',case when a.error_code in (
      'PROVIDER_NOT_CONFIGURED','PROVIDER_TIMEOUT','PROVIDER_RATE_LIMIT',
      'PROVIDER_REFUSAL','INVALID_STRUCTURED_OUTPUT','INVALID_ENVELOPE',
      'MISSING_OUTPUT_TEXT','PROVIDER_INCOMPLETE','INVALID_JSON',
      'SCHEMA_VALIDATION_FAILED','CONTRACT_VALIDATION_FAILED',
      'SEMANTIC_VALIDATION_FAILED','UNKNOWN_VALIDATION_FAILURE',
      'INVALID_IMAGE','STORAGE_AUTHORIZATION_FAILED','PROVIDER_FAILURE',
      'RESULT_PERSISTENCE_FAILED','INPUT_METADATA_FAILED','CLEANUP_FAILURE',
      'CLEANUP_VERIFICATION_FAILED','NETWORK_FAILURE','ANALYSIS_IN_PROGRESS',
      'ATTEMPT_PROVENANCE_FAILED','UNEXPECTED_ERROR'
    ) then a.error_code else null end,
    'failureStage',a.failure_stage,
    'ruleCode',a.failure_rule_code,
    'jsonPath',a.failure_json_path,
    'validator',a.failure_validator,
    'expectedCategory',a.failure_expected_category,
    'receivedCategory',a.failure_received_category,
    'failureSchemaVersion',a.failure_schema_version,
    'traceVersion',a.failure_trace_version,
    'persistence',jsonb_build_object(
      'step',a.persistence_failure_step,
      'table',a.persistence_failure_table,
      'operation',a.persistence_failure_operation,
      'sqlstate',a.persistence_failure_sqlstate,
      'constraint',a.persistence_failure_constraint,
      'entityType',a.persistence_failure_entity_type,
      'entityIndex',a.persistence_failure_entity_index,
      'diagnosticVersion',a.persistence_failure_diagnostic_version
    ),
    'provenance',jsonb_build_object(
      'provider',case when a.provider_name='openai' then a.provider_name else null end,
      'model',case when a.model_name in ('gpt-5','gpt-5-2025-08-07') then a.model_name else null end,
      'promptVersion',case when a.prompt_version in (
        'beard-photo-analysis-v1','beard-photo-analysis-v2',
        'beard-photo-analysis-v3','beard-photo-analysis-v4'
      ) then a.prompt_version else null end,
      'contractVersion',case when a.contract_version='beard-photo-result-contract-v2'
        then a.contract_version else null end,
      'schemaVersion',a.schema_version,
      'semanticVersion',case when a.semantic_rule_version in (
        'beard-semantic-safety-v2','beard-semantic-safety-v3',
        'beard-semantic-safety-v4'
      ) then a.semantic_rule_version else null end
    ),
    'attemptCount',a.provider_attempt_count,
    'providerAttemptedAt',a.provider_attempted_at,
    'terminalAt',a.completed_at,
    'cleanupState',cleanup.state,
    'cleanupCompletedAt',cleanup.completed_at,
    'resultPresent',a.result_payload is not null,
    'providerUsagePresent',a.provider_usage is not null
  ) into response
  from public.intelligence_analyses a
  cross join lateral (
    select
      case
        when count(*)=0 then null
        when bool_or(i.cleanup_state='cleanup_required') then 'cleanup_required'
        when bool_and(i.cleanup_state='deleted') then 'deleted'
        else 'pending'
      end as state,
      case when count(*)>0 and bool_and(i.cleanup_state='deleted')
        then max(i.cleaned_at) else null end as completed_at
    from public.intelligence_analysis_inputs i
    where i.workspace_id=a.workspace_id
      and i.owner_user_id=a.owner_user_id
      and i.analysis_id=a.id
  ) cleanup
  where a.workspace_id=candidate_workspace_id
    and a.owner_user_id=current_owner
    and a.correlation_id=support_uuid
    and a.status in ('failed','completed','completed_cleanup_required');

  return response;
end
$$;

revoke all on function public.lookup_beard_analysis_support_diagnostic(
  uuid,text
) from public,anon,service_role;
grant execute on function public.lookup_beard_analysis_support_diagnostic(
  uuid,text
) to authenticated;

notify pgrst, 'reload schema';
