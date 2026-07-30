-- Admit the v6 structured guard-strategy boundary without changing the stored
-- result shape. The established v5 functions remain private implementation
-- details; public signatures and owner-safe lookup shape stay unchanged.

alter function public.begin_beard_provider_attempt(uuid,uuid,text,text,text)
  rename to begin_beard_provider_attempt_v5;
revoke all on function public.begin_beard_provider_attempt_v5(
  uuid,uuid,text,text,text
) from public,anon,authenticated,service_role;

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
declare claimed boolean;
begin
  if auth.uid() is null or
    candidate_prompt_version <> 'beard-photo-analysis-v6' then
    return false;
  end if;
  claimed := public.begin_beard_provider_attempt_v5(
    candidate_workspace_id,candidate_analysis_id,candidate_provider,
    candidate_model,'beard-photo-analysis-v5'
  );
  if not claimed then return false; end if;
  update public.intelligence_analyses
  set prompt_version='beard-photo-analysis-v6'
  where id=candidate_analysis_id
    and workspace_id=candidate_workspace_id
    and owner_user_id=auth.uid()
    and status='analyzing'
    and prompt_version='beard-photo-analysis-v5';
  return found;
end
$$;

revoke all on function public.begin_beard_provider_attempt(
  uuid,uuid,text,text,text
) from public,anon;
grant execute on function public.begin_beard_provider_attempt(
  uuid,uuid,text,text,text
) to authenticated,service_role;

alter function public.persist_beard_analysis_result(
  uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb
) rename to persist_beard_analysis_result_v5;
revoke all on function public.persist_beard_analysis_result_v5(
  uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb
) from public,anon,authenticated,service_role;

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
declare persisted jsonb;
begin
  update public.intelligence_analyses
  set prompt_version='beard-photo-analysis-v5'
  where id=candidate_analysis_id
    and workspace_id=candidate_workspace_id
    and correlation_id=candidate_correlation_id
    and prompt_version='beard-photo-analysis-v6'
    and status='analyzing';
  if not found then raise exception using errcode='P0002'; end if;

  persisted := public.persist_beard_analysis_result_v5(
    candidate_workspace_id,candidate_analysis_id,candidate_correlation_id,
    candidate_result,candidate_observations,candidate_recommendations,
    candidate_provider_usage
  );

  update public.intelligence_analyses
  set prompt_version='beard-photo-analysis-v6'
  where id=candidate_analysis_id
    and workspace_id=candidate_workspace_id
    and correlation_id=candidate_correlation_id
    and prompt_version='beard-photo-analysis-v5';
  if not found then raise exception using errcode='P0002'; end if;
  return persisted;
end
$$;

revoke all on function public.persist_beard_analysis_result(
  uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb
) from public,anon,authenticated;
grant execute on function public.persist_beard_analysis_result(
  uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb
) to service_role;

alter function public.lookup_beard_analysis_support_diagnostic(uuid,text)
  rename to lookup_beard_analysis_support_diagnostic_v25;
revoke all on function public.lookup_beard_analysis_support_diagnostic_v25(
  uuid,text
) from public,anon,authenticated,service_role;

create function public.lookup_beard_analysis_support_diagnostic(
  candidate_workspace_id uuid,
  candidate_support_id text
)
returns jsonb
language sql
stable
security definer
set search_path=pg_catalog,public,pg_temp
as $$
  with base as (
    select public.lookup_beard_analysis_support_diagnostic_v25(
      candidate_workspace_id,candidate_support_id
    ) as payload
  ), prompt as (
    select a.prompt_version
    from public.intelligence_analyses a
    where a.workspace_id=candidate_workspace_id
      and a.owner_user_id=auth.uid()
      and a.correlation_id::text=candidate_support_id
      and a.prompt_version in (
        'beard-photo-analysis-v1','beard-photo-analysis-v2',
        'beard-photo-analysis-v3','beard-photo-analysis-v4',
        'beard-photo-analysis-v5','beard-photo-analysis-v6'
      )
  )
  select case when base.payload is null then null else
    jsonb_set(
      base.payload,'{provenance,promptVersion}',
      to_jsonb(prompt.prompt_version),true
    )
  end
  from base left join prompt on true
$$;

revoke all on function public.lookup_beard_analysis_support_diagnostic(
  uuid,text
) from public,anon,service_role;
grant execute on function public.lookup_beard_analysis_support_diagnostic(
  uuid,text
) to authenticated;
