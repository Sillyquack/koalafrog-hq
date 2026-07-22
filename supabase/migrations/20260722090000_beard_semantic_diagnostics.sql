-- Durable metadata-only diagnostics for Beard Photo Analysis validation
-- failures. Historical rows intentionally remain null: no path or rule is
-- inferred after the fact.
alter table public.intelligence_analyses
  add column semantic_rule_version text,
  add column failure_stage text,
  add column failure_rule_code text,
  add column failure_json_path text,
  add column failure_validator text,
  add column failure_expected_category text,
  add column failure_received_category text,
  add column failure_schema_version smallint,
  add column failure_trace_version text;

alter table public.intelligence_analyses
  add constraint intelligence_analyses_semantic_rule_version_check check (
    semantic_rule_version is null or
    semantic_rule_version = 'beard-semantic-safety-v2'
  ),
  add constraint intelligence_analyses_failure_stage_check check (
    failure_stage is null or failure_stage in (
      'EnvelopeParsing','JsonParsing','SchemaValidation',
      'ContractValidation','SemanticValidation'
    )
  ),
  add constraint intelligence_analyses_failure_rule_code_check check (
    failure_rule_code is null or failure_rule_code in (
      'VAL-0001','VAL-0002','VAL-0003','VAL-0004','VAL-0010','VAL-0011',
      'VAL-0012','VAL-0013','VAL-0014','VAL-0015','VAL-0016','VAL-0017',
      'VAL-0020','VAL-0030','SEM-0001','SEM-0002','SEM-0003','SEM-0004',
      'SEM-0005','SEM-0006','SEM-0010','SEM-0099'
    )
  ),
  add constraint intelligence_analyses_failure_json_path_check check (
    failure_json_path is null or (
      char_length(failure_json_path) between 1 and 160 and
      failure_json_path ~ '^\$(\.[A-Za-z][A-Za-z0-9]*|\[[0-9]+\])*$'
    )
  ),
  add constraint intelligence_analyses_failure_validator_check check (
    failure_validator is null or failure_validator in (
      'responses-envelope','responses-output','json-parser','json-schema',
      'beard-contract','beard-semantic-safety-v2','legacy-beard-validator'
    )
  ),
  add constraint intelligence_analyses_failure_expected_check check (
    failure_expected_category is null or failure_expected_category in (
      'object','array','string','number','integer','boolean','null','required',
      'allowed enum','constant','unique id','known reference','safe text',
      'non-calibrated grooming language','non-medical observation',
      'non-sensitive observation','grooming-only recommendation',
      'unambiguous safe language','completed response'
    )
  ),
  add constraint intelligence_analyses_failure_received_check check (
    failure_received_category is null or failure_received_category in (
      'object','array','string','number','integer','boolean','null','missing',
      'unexpected','duplicate','unknown reference','unsafe text','incomplete',
      'unknown','unsupported measurement claim','medical assertion',
      'infection assertion','biological cause assertion',
      'sensitive trait inference','personal inference','unsafe recommendation',
      'ambiguous sensitive reference'
    )
  ),
  add constraint intelligence_analyses_failure_schema_version_check check (
    failure_schema_version is null or failure_schema_version = 1
  ),
  add constraint intelligence_analyses_failure_trace_version_check check (
    failure_trace_version is null or
    failure_trace_version = 'intelligence-failure-trace-v1'
  ),
  add constraint intelligence_analyses_failure_trace_complete_check check (
    (failure_stage is null and failure_rule_code is null and
      failure_json_path is null and failure_validator is null and
      failure_expected_category is null and failure_received_category is null and
      failure_schema_version is null and failure_trace_version is null) or
    (failure_stage is not null and failure_rule_code is not null and
      failure_json_path is not null and failure_validator is not null and
      failure_expected_category is not null and failure_received_category is not null and
      failure_schema_version = 1 and
      failure_trace_version = 'intelligence-failure-trace-v1')
  );

-- The browser may read its own diagnostic metadata through existing RLS but
-- cannot insert or update any server-selected provenance or failure field.
revoke insert(
  semantic_rule_version,failure_stage,failure_rule_code,failure_json_path,
  failure_validator,failure_expected_category,failure_received_category,
  failure_schema_version,failure_trace_version
) on table public.intelligence_analyses from authenticated;
revoke update(
  semantic_rule_version,failure_stage,failure_rule_code,failure_json_path,
  failure_validator,failure_expected_category,failure_received_category,
  failure_schema_version,failure_trace_version
) on table public.intelligence_analyses from authenticated;

-- Preserve the atomic provider-attempt claim while recording the server-owned
-- semantic rule version. The caller cannot choose or overwrite that version.
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
declare
  claimed boolean := false;
begin
  if auth.uid() is null then
    return false;
  end if;
  if candidate_provider <> 'openai'
    or candidate_model not in ('gpt-5','gpt-5-2025-08-07')
    or candidate_prompt_version <> 'beard-photo-analysis-v2' then
    return false;
  end if;
  update public.intelligence_analyses
  set provider_name=candidate_provider,
      model_name=candidate_model,
      prompt_version=candidate_prompt_version,
      semantic_rule_version='beard-semantic-safety-v2',
      provider_attempted_at=pg_catalog.now(),
      provider_attempt_count=provider_attempt_count+1,
      status='analyzing'
  where id=candidate_analysis_id
    and workspace_id=candidate_workspace_id
    and owner_user_id=auth.uid()
    and status='staging'
    and provider_attempt_count=0;
  claimed := found;
  return claimed;
end
$$;

revoke all on function public.begin_beard_provider_attempt(uuid,uuid,text,text,text)
  from public,anon;
grant execute on function public.begin_beard_provider_attempt(uuid,uuid,text,text,text)
  to authenticated,service_role;
