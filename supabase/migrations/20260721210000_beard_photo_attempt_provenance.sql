-- Preserve the exact server-selected provider attempt before any private image
-- bytes are retrieved or transmitted. Existing failed rows remain historically
-- honest with attempt_count=0 and no inferred provider metadata.
alter table public.intelligence_analyses
  add column provider_attempted_at timestamptz,
  add column provider_attempt_count integer not null default 0
    check (provider_attempt_count >= 0);

revoke insert on table public.intelligence_analyses from authenticated;
grant insert(
  id,workspace_id,owner_user_id,source_module,analysis_type,schema_version,
  prompt_version,status,idempotency_key,profile_id,context_manifest,correlation_id
) on table public.intelligence_analyses to authenticated;
revoke update(provider_name,model_name) on table public.intelligence_analyses from authenticated;

create function public.begin_beard_provider_attempt(
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
    or candidate_prompt_version <> 'beard-photo-analysis-v1' then
    return false;
  end if;
  update public.intelligence_analyses
  set provider_name=candidate_provider,
      model_name=candidate_model,
      prompt_version=candidate_prompt_version,
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

revoke all on function public.begin_beard_provider_attempt(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.begin_beard_provider_attempt(uuid,uuid,text,text,text) to authenticated,service_role;
