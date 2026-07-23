-- Durable, allowlisted diagnostics for the single live-provider invocation
-- associated with a Procurement research job. No provider content, prompts,
-- credentials, request identifiers, or raw payloads are stored here.
create table public.procurement_provider_diagnostics (
  job_id uuid primary key,
  workspace_id uuid not null,
  owner_id uuid not null,
  provider_called boolean not null default false,
  provider_stage text,
  provider_started_at timestamptz,
  provider_headers_at timestamptz,
  provider_body_completed_at timestamptz,
  provider_parse_completed_at timestamptz,
  provider_validation_completed_at timestamptz,
  provider_elapsed_ms integer,
  function_elapsed_ms integer,
  timeout_limit_ms integer,
  timeout_stage text,
  abort_source text,
  provider_http_status integer,
  usage_present boolean,
  validated_candidate_count integer,
  terminal_error_code text,
  diagnostic_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id,job_id)
    references public.procurement_research_jobs(workspace_id,id) on delete cascade,
  check (provider_elapsed_ms is null or provider_elapsed_ms >= 0),
  check (function_elapsed_ms is null or function_elapsed_ms >= 0),
  check (timeout_limit_ms is null or timeout_limit_ms between 30000 and 120000),
  check (timeout_stage is null or timeout_stage in (
    'response_headers','response_body','parsing','validation','completion','unknown'
  )),
  check (provider_stage is null or provider_stage in (
    'provider_request_started','provider_response_headers_received',
    'provider_response_body_completed','provider_response_parsed',
    'candidate_validation_completed','provider_completed',
    'provider_timeout_triggered','provider_cancelled',
    'provider_transport_failed','provider_http_error',
    'provider_response_invalid'
  )),
  check (abort_source is null or abort_source in (
    'caller','application_deadline','none'
  )),
  check (provider_http_status is null or provider_http_status between 100 and 599),
  check (validated_candidate_count is null or validated_candidate_count between 0 and 20),
  check (terminal_error_code is null or terminal_error_code in (
    'PROVIDER_TIMEOUT','PROVIDER_CALLER_ABORTED','PROVIDER_NETWORK_ERROR',
    'PROVIDER_HTTP_ERROR','PROVIDER_PARSE_ERROR','PROVIDER_INVALID_RESPONSE',
    'PROVIDER_FAILURE'
  )),
  check (diagnostic_version = 1),
  check (provider_headers_at is null or provider_started_at is not null),
  check (provider_body_completed_at is null or provider_headers_at is not null),
  check (provider_parse_completed_at is null or provider_body_completed_at is not null),
  check (provider_validation_completed_at is null or provider_parse_completed_at is not null),
  check (provider_headers_at is null or provider_headers_at >= provider_started_at),
  check (provider_body_completed_at is null or provider_body_completed_at >= provider_headers_at),
  check (provider_parse_completed_at is null or provider_parse_completed_at >= provider_body_completed_at),
  check (provider_validation_completed_at is null or provider_validation_completed_at >= provider_parse_completed_at)
);

alter table public.procurement_provider_diagnostics enable row level security;

create policy procurement_provider_diagnostics_owner_read
on public.procurement_provider_diagnostics
for select
to authenticated
using (
  owner_id=(select auth.uid())
  and exists (
    select 1 from public.workspaces
    where id=workspace_id and owner_id=(select auth.uid())
  )
);

revoke all on public.procurement_provider_diagnostics from public,anon,authenticated;
grant select on public.procurement_provider_diagnostics to authenticated;

create function public.persist_procurement_provider_diagnostic(
  candidate_workspace_id uuid,
  candidate_job_id uuid,
  candidate_owner_id uuid,
  diagnostic_provider_called boolean,
  diagnostic_provider_stage text,
  diagnostic_headers_elapsed_ms integer,
  diagnostic_body_elapsed_ms integer,
  diagnostic_parse_elapsed_ms integer,
  diagnostic_validation_elapsed_ms integer,
  diagnostic_provider_elapsed_ms integer,
  diagnostic_function_elapsed_ms integer,
  diagnostic_timeout_limit_ms integer,
  diagnostic_timeout_stage text,
  diagnostic_abort_source text,
  diagnostic_provider_http_status integer,
  diagnostic_usage_present boolean,
  diagnostic_candidate_count integer,
  diagnostic_terminal_error_code text
) returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  invocation_started_at timestamptz;
  diagnostic_written_at timestamptz := clock_timestamp();
  provider_started_at_value timestamptz;
begin
  if candidate_workspace_id is null or candidate_job_id is null
    or candidate_owner_id is null or diagnostic_provider_called is null
  then return false; end if;

  select live_invocation_started_at into invocation_started_at
  from public.procurement_research_jobs
  where workspace_id=candidate_workspace_id
    and id=candidate_job_id
    and owner_id=candidate_owner_id
    and provider='openai-web-search-v1'
    and provider_invocation_count=1
    and live_invocation_started_at is not null
    and exists (
      select 1 from public.workspaces
      where id=candidate_workspace_id
        and owner_id=candidate_owner_id
        and lifecycle_state='active'
    );

  if invocation_started_at is null then return false; end if;
  if diagnostic_provider_elapsed_ms is not null then
    provider_started_at_value := diagnostic_written_at
      - make_interval(secs=>diagnostic_provider_elapsed_ms/1000.0);
  end if;
  if diagnostic_headers_elapsed_ms is not null and (
      diagnostic_provider_elapsed_ms is null
      or diagnostic_headers_elapsed_ms > diagnostic_provider_elapsed_ms
    ) then return false; end if;
  if diagnostic_body_elapsed_ms is not null and (
      diagnostic_headers_elapsed_ms is null
      or diagnostic_body_elapsed_ms < diagnostic_headers_elapsed_ms
      or diagnostic_body_elapsed_ms > diagnostic_provider_elapsed_ms
    ) then return false; end if;
  if diagnostic_parse_elapsed_ms is not null and (
      diagnostic_body_elapsed_ms is null
      or diagnostic_parse_elapsed_ms < diagnostic_body_elapsed_ms
      or diagnostic_parse_elapsed_ms > diagnostic_provider_elapsed_ms
    ) then return false; end if;
  if diagnostic_validation_elapsed_ms is not null and (
      diagnostic_parse_elapsed_ms is null
      or diagnostic_validation_elapsed_ms < diagnostic_parse_elapsed_ms
      or diagnostic_validation_elapsed_ms > diagnostic_provider_elapsed_ms
    ) then return false; end if;

  insert into public.procurement_provider_diagnostics (
    job_id,workspace_id,owner_id,provider_called,provider_stage,provider_started_at,
    provider_headers_at,provider_body_completed_at,provider_parse_completed_at,
    provider_validation_completed_at,provider_elapsed_ms,function_elapsed_ms,
    timeout_limit_ms,timeout_stage,abort_source,provider_http_status,
    usage_present,validated_candidate_count,terminal_error_code,updated_at
  ) values (
    candidate_job_id,candidate_workspace_id,candidate_owner_id,
    diagnostic_provider_called,diagnostic_provider_stage,
    case when diagnostic_provider_called then provider_started_at_value else null end,
    case when diagnostic_headers_elapsed_ms is null then null
      else provider_started_at_value+make_interval(secs=>diagnostic_headers_elapsed_ms/1000.0) end,
    case when diagnostic_body_elapsed_ms is null then null
      else provider_started_at_value+make_interval(secs=>diagnostic_body_elapsed_ms/1000.0) end,
    case when diagnostic_parse_elapsed_ms is null then null
      else provider_started_at_value+make_interval(secs=>diagnostic_parse_elapsed_ms/1000.0) end,
    case when diagnostic_validation_elapsed_ms is null then null
      else provider_started_at_value+make_interval(secs=>diagnostic_validation_elapsed_ms/1000.0) end,
    diagnostic_provider_elapsed_ms,diagnostic_function_elapsed_ms,
    diagnostic_timeout_limit_ms,diagnostic_timeout_stage,
    coalesce(diagnostic_abort_source,'none'),diagnostic_provider_http_status,
    diagnostic_usage_present,diagnostic_candidate_count,
    diagnostic_terminal_error_code,diagnostic_written_at
  )
  on conflict (job_id) do update set
    provider_called=excluded.provider_called,
    provider_stage=excluded.provider_stage,
    provider_started_at=excluded.provider_started_at,
    provider_headers_at=excluded.provider_headers_at,
    provider_body_completed_at=excluded.provider_body_completed_at,
    provider_parse_completed_at=excluded.provider_parse_completed_at,
    provider_validation_completed_at=excluded.provider_validation_completed_at,
    provider_elapsed_ms=excluded.provider_elapsed_ms,
    function_elapsed_ms=excluded.function_elapsed_ms,
    timeout_limit_ms=excluded.timeout_limit_ms,
    timeout_stage=excluded.timeout_stage,
    abort_source=excluded.abort_source,
    provider_http_status=excluded.provider_http_status,
    usage_present=excluded.usage_present,
    validated_candidate_count=excluded.validated_candidate_count,
    terminal_error_code=excluded.terminal_error_code,
    diagnostic_version=1,
    updated_at=excluded.updated_at
  where procurement_provider_diagnostics.workspace_id=excluded.workspace_id
    and procurement_provider_diagnostics.owner_id=excluded.owner_id;

  return found;
exception
  when check_violation or foreign_key_violation or not_null_violation
  then return false;
end
$$;

revoke all on function public.persist_procurement_provider_diagnostic(
  uuid,uuid,uuid,boolean,text,integer,integer,integer,integer,integer,integer,
  integer,text,text,integer,boolean,integer,text
) from public,anon,authenticated;
grant execute on function public.persist_procurement_provider_diagnostic(
  uuid,uuid,uuid,boolean,text,integer,integer,integer,integer,integer,integer,
  integer,text,text,integer,boolean,integer,text
) to service_role;

notify pgrst, 'reload schema';
