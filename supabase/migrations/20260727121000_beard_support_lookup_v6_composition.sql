-- Compose the v6 prompt provenance and safe parser/rate-limit classifications
-- after the 429 migration replaced the public wrapper. The stable public
-- signature and metadata-only response shape remain unchanged.
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
  current_owner uuid:=auth.uid();
  support_uuid uuid;
  response jsonb;
  analysis public.intelligence_analyses%rowtype;
begin
  if current_owner is null or candidate_workspace_id is null or
    candidate_support_id is null or
    candidate_support_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;
  support_uuid:=candidate_support_id::uuid;
  response:=public.lookup_beard_analysis_support_diagnostic_v24(candidate_workspace_id,candidate_support_id);
  if response is null then return null; end if;

  select a.* into analysis from public.intelligence_analyses a
  where a.workspace_id=candidate_workspace_id and a.owner_user_id=current_owner
    and (a.correlation_id=support_uuid or a.id=support_uuid)
    and a.status in ('failed','completed','completed_cleanup_required')
  limit 1;
  if not found then return null; end if;

  if analysis.error_code in (
    'PROVIDER_RATE_LIMIT_REQUESTS','PROVIDER_RATE_LIMIT_TOKENS',
    'PROVIDER_QUOTA_EXHAUSTED','PROVIDER_BILLING_LIMIT','PROVIDER_MODEL_LIMIT',
    'PROVIDER_RATE_LIMIT_UNKNOWN','PROVIDER_RESPONSE_ENVELOPE_INVALID',
    'PROVIDER_STRUCTURED_OUTPUT_MISSING','PROVIDER_STRUCTURED_OUTPUT_AMBIGUOUS',
    'PROVIDER_OUTPUT_TEXT_MISSING','PROVIDER_OUTPUT_JSON_INVALID',
    'PROVIDER_OUTPUT_REFUSAL','PROVIDER_OUTPUT_SCHEMA_MISMATCH',
    'PROVIDER_RESPONSE_PARSE_INTERNAL_ERROR'
  ) then
    response:=jsonb_set(response,'{errorCode}',to_jsonb(analysis.error_code),true);
  end if;
  if analysis.prompt_version in (
    'beard-photo-analysis-v1','beard-photo-analysis-v2','beard-photo-analysis-v3',
    'beard-photo-analysis-v4','beard-photo-analysis-v5','beard-photo-analysis-v6'
  ) then
    response:=jsonb_set(response,'{provenance,promptVersion}',to_jsonb(analysis.prompt_version),true);
  end if;
  return response-'recommendationIndex';
end $$;
revoke all on function public.lookup_beard_analysis_support_diagnostic(uuid,text) from public,anon,service_role;
grant execute on function public.lookup_beard_analysis_support_diagnostic(uuid,text) to authenticated;
