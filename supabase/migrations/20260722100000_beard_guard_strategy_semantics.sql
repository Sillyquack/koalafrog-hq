-- Advance Beard Photo Analysis provenance for the field-aware guard-strategy
-- semantic policy. Historical analyses retain their original versions.
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
    or candidate_prompt_version <> 'beard-photo-analysis-v3' then
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
