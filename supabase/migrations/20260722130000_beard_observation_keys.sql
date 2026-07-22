-- Beard Photo Analysis result contract v2: stable provider observation keys
-- mapped atomically to server-generated observation UUIDs.
alter table public.intelligence_analyses
  drop constraint intelligence_analyses_schema_version_check,
  add column contract_version text,
  add constraint intelligence_analyses_schema_version_check
    check (schema_version in (1,2)),
  add constraint intelligence_analyses_contract_version_check check (
    (schema_version=1 and contract_version is null) or
    (schema_version=2 and contract_version='beard-photo-result-contract-v2')
  );

alter table public.intelligence_analyses
  drop constraint intelligence_analyses_failure_schema_version_check,
  add constraint intelligence_analyses_failure_schema_version_check check (
    failure_schema_version is null or failure_schema_version in (1,2)
  ),
  drop constraint intelligence_analyses_failure_trace_complete_check,
  add constraint intelligence_analyses_failure_trace_complete_check check (
    (failure_stage is null and failure_rule_code is null and
      failure_json_path is null and failure_validator is null and
      failure_expected_category is null and failure_received_category is null and
      failure_schema_version is null and failure_trace_version is null) or
    (failure_stage is not null and failure_rule_code is not null and
      failure_json_path is not null and failure_validator is not null and
      failure_expected_category is not null and failure_received_category is not null and
      failure_schema_version in (1,2) and
      failure_trace_version='intelligence-failure-trace-v1')
  ),
  drop constraint intelligence_analyses_failure_rule_code_check,
  add constraint intelligence_analyses_failure_rule_code_check check (
    failure_rule_code is null or failure_rule_code in (
      'VAL-0001','VAL-0002','VAL-0003','VAL-0004','VAL-0010','VAL-0011',
      'VAL-0012','VAL-0013','VAL-0014','VAL-0015','VAL-0016','VAL-0017',
      'VAL-0018','VAL-0020','VAL-0030','SEM-0001','SEM-0002','SEM-0003',
      'SEM-0004','SEM-0005','SEM-0006','SEM-0010','SEM-0099'
    )
  ),
  drop constraint intelligence_analyses_failure_expected_check,
  add constraint intelligence_analyses_failure_expected_check check (
    failure_expected_category is null or failure_expected_category in (
      'object','array','string','number','integer','boolean','null','required',
      'allowed enum','constant','unique id','known reference','safe text',
      'non-calibrated grooming language','non-medical observation',
      'non-sensitive observation','grooming-only recommendation',
      'unambiguous safe language','completed response',
      'valid observation key','unique observation key'
    )
  ),
  drop constraint intelligence_analyses_failure_received_check,
  add constraint intelligence_analyses_failure_received_check check (
    failure_received_category is null or failure_received_category in (
      'object','array','string','number','integer','boolean','null','missing',
      'unexpected','duplicate','unknown reference','unsafe text','incomplete',
      'unknown','unsupported measurement claim','medical assertion',
      'infection assertion','biological cause assertion',
      'sensitive trait inference','personal inference','unsafe recommendation',
      'ambiguous sensitive reference','invalid observation key'
    )
  );

revoke update(contract_version)
  on table public.intelligence_analyses from authenticated;

alter table public.intelligence_observations
  add column provider_observation_key text,
  add constraint intelligence_observations_provider_key_check check (
    provider_observation_key is null or
    provider_observation_key ~ '^[a-z][a-z0-9_]{2,63}$'
  );
create unique index intelligence_observations_analysis_provider_key_unique
  on public.intelligence_observations(analysis_id,provider_observation_key)
  where provider_observation_key is not null;
create unique index intelligence_observations_analysis_id_id_unique
  on public.intelligence_observations(analysis_id,id);
create unique index intelligence_recommendations_analysis_id_id_unique
  on public.intelligence_recommendations(analysis_id,id);
revoke insert(provider_observation_key),update(provider_observation_key)
  on table public.intelligence_observations from authenticated;

revoke insert on table public.intelligence_analyses from authenticated;
revoke insert on table public.intelligence_analysis_inputs from authenticated;
revoke insert on table public.intelligence_observations from authenticated;
revoke insert on table public.intelligence_recommendations from authenticated;
grant all on table public.intelligence_analyses to service_role;
grant all on table public.intelligence_analysis_inputs to service_role;
grant all on table public.intelligence_observations to service_role;
grant all on table public.intelligence_recommendations to service_role;

create table public.intelligence_recommendation_observations (
  workspace_id uuid not null,
  owner_user_id uuid not null,
  analysis_id uuid not null,
  recommendation_id uuid not null,
  observation_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(recommendation_id,observation_id),
  foreign key(workspace_id,analysis_id)
    references public.intelligence_analyses(workspace_id,id) on delete cascade,
  foreign key(analysis_id,recommendation_id)
    references public.intelligence_recommendations(analysis_id,id) on delete cascade,
  foreign key(analysis_id,observation_id)
    references public.intelligence_observations(analysis_id,id) on delete cascade,
  foreign key(workspace_id,owner_user_id)
    references public.workspaces(id,owner_id) on delete cascade
);
alter table public.intelligence_recommendation_observations enable row level security;
create policy intelligence_recommendation_observations_owner_select
  on public.intelligence_recommendation_observations for select to authenticated
  using (
    owner_user_id=auth.uid() and exists(
      select 1 from public.workspaces w
      where w.id=workspace_id and w.owner_id=auth.uid()
    )
  );
revoke all on table public.intelligence_recommendation_observations
  from public,anon,authenticated;
grant select on table public.intelligence_recommendation_observations
  to authenticated;
grant all on table public.intelligence_recommendation_observations
  to service_role;

alter table public.intelligence_analyses
  drop constraint intelligence_analyses_persistence_step_check,
  add constraint intelligence_analyses_persistence_step_check check (
    persistence_failure_step is null or persistence_failure_step in (
      'analysis_lock','observation_insert','recommendation_insert',
      'relationship_insert','analysis_update'
    )
  ),
  drop constraint intelligence_analyses_persistence_table_check,
  add constraint intelligence_analyses_persistence_table_check check (
    persistence_failure_table is null or persistence_failure_table in (
      'intelligence_analyses','intelligence_observations',
      'intelligence_recommendations','intelligence_recommendation_observations'
    )
  ),
  drop constraint intelligence_analyses_persistence_entity_check,
  add constraint intelligence_analyses_persistence_entity_check check (
    persistence_failure_entity_type is null or
    persistence_failure_entity_type in (
      'analysis','observation','recommendation','relationship'
    )
  ),
  drop constraint intelligence_analyses_persistence_diagnostic_complete_check,
  add constraint intelligence_analyses_persistence_diagnostic_complete_check check (
    (persistence_failure_step is null and persistence_failure_table is null and
      persistence_failure_operation is null and persistence_failure_sqlstate is null and
      persistence_failure_constraint is null and persistence_failure_entity_type is null and
      persistence_failure_entity_index is null and
      persistence_failure_diagnostic_version is null) or
    (persistence_failure_step is not null and persistence_failure_table is not null and
      persistence_failure_operation is not null and persistence_failure_sqlstate is not null and
      persistence_failure_entity_type is not null and
      ((persistence_failure_entity_type='analysis' and
          persistence_failure_entity_index is null) or
       (persistence_failure_entity_type in ('observation','recommendation','relationship') and
          persistence_failure_entity_index is not null)) and
      persistence_failure_diagnostic_version='beard-persistence-diagnostic-v1')
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
      semantic_rule_version='beard-semantic-safety-v3',
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
      and semantic_rule_version='beard-semantic-safety-v3'
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
