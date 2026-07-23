alter table public.procurement_research_jobs
  add column live_invocation_started_at timestamptz,
  add column provider_invocation_count integer not null default 0
    check(provider_invocation_count between 0 and 1);

create function public.guard_procurement_live_invocation_state()
returns trigger
language plpgsql
security invoker
set search_path=pg_catalog,public,pg_temp
as $$
begin
  if tg_op='INSERT' and (
    new.live_invocation_started_at is not null or new.provider_invocation_count<>0
  ) then
    raise exception 'LIVE_INVOCATION_STATE_MANAGED';
  end if;
  if tg_op='UPDATE'
    and (
      new.live_invocation_started_at is distinct from old.live_invocation_started_at
      or new.provider_invocation_count is distinct from old.provider_invocation_count
    )
    and coalesce(current_setting('app.procurement_live_invocation_gate',true),'')<>'allowed'
  then
    raise exception 'LIVE_INVOCATION_STATE_MANAGED';
  end if;
  return new;
end
$$;

create trigger guard_procurement_live_invocation_state
before insert or update on public.procurement_research_jobs
for each row execute function public.guard_procurement_live_invocation_state();

create function public.begin_procurement_live_invocation(
  candidate_workspace_id uuid,
  candidate_job_id uuid,
  maximum_daily_invocations integer
) returns timestamptz
language plpgsql
security invoker
set search_path=pg_catalog,public,pg_temp
as $$
declare
  uid uuid := auth.uid();
  job public.procurement_research_jobs;
  permitted_count integer;
  permitted_at timestamptz := clock_timestamp();
begin
  if uid is null then raise exception 'LIVE_JOB_UNAVAILABLE'; end if;
  if maximum_daily_invocations is null
    or maximum_daily_invocations < 1
    or maximum_daily_invocations > 100
  then raise exception 'LIVE_LIMIT_INVALID'; end if;

  -- Serialize the rolling owner limit across different jobs as well as locking
  -- the individual job below. The key contains no secret or provider payload.
  perform pg_advisory_xact_lock(hashtextextended(uid::text,874231));

  select * into job
  from public.procurement_research_jobs
  where id=candidate_job_id
    and workspace_id=candidate_workspace_id
    and owner_id=uid
    and provider='openai-web-search-v1'
    and exists(
      select 1 from public.workspaces
      where id=candidate_workspace_id and owner_id=uid and lifecycle_state='active'
    )
  for update;

  if job.id is null then raise exception 'LIVE_JOB_UNAVAILABLE'; end if;
  if job.status<>'running' then raise exception 'LIVE_JOB_NOT_RUNNING'; end if;
  if job.live_invocation_started_at is not null or job.provider_invocation_count<>0
  then raise exception 'LIVE_JOB_ALREADY_INVOKED'; end if;

  select count(*) into permitted_count
  from public.procurement_research_jobs
  where owner_id=uid
    and provider='openai-web-search-v1'
    and live_invocation_started_at>=permitted_at-interval '24 hours';

  if permitted_count>=maximum_daily_invocations
  then raise exception 'LIVE_DAILY_LIMIT_REACHED'; end if;

  perform set_config('app.procurement_live_invocation_gate','allowed',true);
  update public.procurement_research_jobs set
    live_invocation_started_at=permitted_at,
    provider_invocation_count=1,
    updated_at=permitted_at
  where id=job.id;

  return permitted_at;
end
$$;

revoke all on function public.guard_procurement_live_invocation_state() from public,anon,authenticated;
revoke all on function public.begin_procurement_live_invocation(uuid,uuid,integer) from public,anon;
grant execute on function public.begin_procurement_live_invocation(uuid,uuid,integer) to authenticated;
