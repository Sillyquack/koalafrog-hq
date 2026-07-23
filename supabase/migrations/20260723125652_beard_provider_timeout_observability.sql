alter table public.intelligence_analyses
  add column provider_stage text,
  add column provider_failure_classification text,
  add column provider_timeout_source text,
  add column provider_timeout_budget_ms integer,
  add column provider_elapsed_ms integer,
  add column edge_function_elapsed_ms integer,
  add column provider_request_dispatched boolean,
  add column provider_response_headers_received boolean,
  add column provider_response_body_completed boolean,
  add column provider_http_status_class text,
  add column provider_abort_signal_aborted boolean,
  add column provider_abort_reason_code text,
  add column provider_transport_error_category text,
  add column provider_request_id_present boolean,
  add column provider_response_present boolean,
  add column provider_trace_usage_present boolean,
  add constraint intelligence_analyses_provider_stage_check check (
    provider_stage is null or provider_stage in (
      'provider_prepare_started','provider_dispatch_started',
      'provider_dispatched','provider_response_headers_received',
      'provider_response_body_started','provider_response_body_completed',
      'provider_response_parsed','provider_timeout_triggered',
      'provider_transport_failed','provider_http_error_received',
      'provider_completed'
    )
  ),
  add constraint intelligence_analyses_provider_failure_classification_check
    check (
      provider_failure_classification is null or
      provider_failure_classification in (
        'PROVIDER_TIMEOUT_RESPONSE_HEADERS',
        'PROVIDER_TIMEOUT_RESPONSE_BODY',
        'PROVIDER_TRANSPORT_NETWORK','PROVIDER_HTTP_ERROR',
        'PROVIDER_RESPONSE_PARSE_FAILED','PROVIDER_CALLER_ABORTED'
      )
    ),
  add constraint intelligence_analyses_provider_timeout_source_check check (
    provider_timeout_source is null or
    provider_timeout_source in ('application_deadline','caller')
  ),
  add constraint intelligence_analyses_provider_http_status_class_check check (
    provider_http_status_class is null or
    provider_http_status_class in ('2xx','4xx','5xx','other')
  ),
  add constraint intelligence_analyses_provider_abort_reason_code_check check (
    provider_abort_reason_code is null or
    provider_abort_reason_code in ('application_deadline','caller')
  ),
  add constraint intelligence_analyses_provider_transport_category_check check (
    provider_transport_error_category is null or
    provider_transport_error_category='network'
  ),
  add constraint intelligence_analyses_provider_timeout_budget_check check (
    provider_timeout_budget_ms is null or
    provider_timeout_budget_ms between 60000 and 120000
  ),
  add constraint intelligence_analyses_provider_elapsed_check check (
    provider_elapsed_ms is null or provider_elapsed_ms >= 0
  ),
  add constraint intelligence_analyses_edge_elapsed_check check (
    edge_function_elapsed_ms is null or edge_function_elapsed_ms >= 0
  );

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
    'providerTrace',jsonb_build_object(
      'stage',a.provider_stage,
      'failureClassification',a.provider_failure_classification,
      'timeoutSource',a.provider_timeout_source,
      'timeoutBudgetMs',a.provider_timeout_budget_ms,
      'providerElapsedMs',a.provider_elapsed_ms,
      'edgeFunctionElapsedMs',a.edge_function_elapsed_ms,
      'requestDispatched',a.provider_request_dispatched,
      'responseHeadersReceived',a.provider_response_headers_received,
      'responseBodyCompleted',a.provider_response_body_completed,
      'httpStatusClass',a.provider_http_status_class,
      'abortSignalAborted',a.provider_abort_signal_aborted,
      'abortReasonCode',a.provider_abort_reason_code,
      'transportErrorCategory',a.provider_transport_error_category,
      'providerRequestIdPresent',a.provider_request_id_present,
      'responsePresent',a.provider_response_present,
      'usagePresent',a.provider_trace_usage_present
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
