-- Preserve the existing owner-safe support payload while admitting the
-- narrowly allowlisted OpenAI 429 classifications introduced by function v28.

create or replace function public.lookup_beard_analysis_support_diagnostic(
  candidate_workspace_id uuid,
  candidate_support_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  current_owner uuid := auth.uid();
  support_uuid uuid;
  response jsonb;
  safe_error_code text;
begin
  if current_owner is null or candidate_workspace_id is null or
    candidate_support_id is null or
    candidate_support_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;
  support_uuid := candidate_support_id::uuid;

  response := public.lookup_beard_analysis_support_diagnostic_v24(
    candidate_workspace_id,
    candidate_support_id
  );
  if response is null then
    return null;
  end if;

  select a.error_code into safe_error_code
  from public.intelligence_analyses a
  where a.workspace_id = candidate_workspace_id
    and a.owner_user_id = current_owner
    and (a.correlation_id = support_uuid or a.id = support_uuid)
    and a.error_code in (
      'PROVIDER_RATE_LIMIT_REQUESTS',
      'PROVIDER_RATE_LIMIT_TOKENS',
      'PROVIDER_QUOTA_EXHAUSTED',
      'PROVIDER_BILLING_LIMIT',
      'PROVIDER_MODEL_LIMIT',
      'PROVIDER_RATE_LIMIT_UNKNOWN'
    )
  limit 1;

  if safe_error_code is not null then
    response := jsonb_set(response, '{errorCode}', to_jsonb(safe_error_code));
  end if;
  return response - 'recommendationIndex';
end
$$;

revoke all on function public.lookup_beard_analysis_support_diagnostic(uuid, text)
  from public, anon, service_role;
grant execute on function public.lookup_beard_analysis_support_diagnostic(uuid, text)
  to authenticated;
