-- Durable server-only lifecycle for one OpenAI background Response per owned
-- Procurement research job. This migration exists only on the unmerged feature
-- branch and has never been deployed, so replacing its prototype definition
-- avoids leaving an obsolete unsafe schema in clean resets.

alter table public.procurement_research_jobs
  add column background_lifecycle_status text
    check (background_lifecycle_status is null or background_lifecycle_status in (
      'preparing','submitting','submission_ambiguous','submitted','researching',
      'completing','reconciling','cancelled','completed','failed'
    )),
  add column background_status_updated_at timestamptz;

create function public.guard_procurement_background_job_state()
returns trigger
language plpgsql
security invoker
set search_path=pg_catalog,public,pg_temp
as $$
begin
  if (
    new.background_lifecycle_status is distinct from old.background_lifecycle_status
    or new.background_status_updated_at is distinct from old.background_status_updated_at
  ) and coalesce(current_setting('app.procurement_background_worker',true),'')<>'allowed'
  then raise exception 'BACKGROUND_LIFECYCLE_STATE_MANAGED'; end if;
  return new;
end
$$;

create trigger guard_procurement_background_job_state
before update on public.procurement_research_jobs
for each row execute function public.guard_procurement_background_job_state();

create table public.procurement_background_operations (
  attempt_id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique,
  workspace_id uuid not null,
  owner_id uuid not null,
  provider text not null check (provider='openai-web-search-v1'),
  generation integer not null default 1 check (generation=1),
  client_request_id uuid not null unique default gen_random_uuid(),
  provider_operation_id text unique,
  submission_state text not null check (submission_state in (
    'intent_created','submitting','submission_ambiguous','attached',
    'provider_queued','provider_in_progress','terminal_pending_processing',
    'completed','failed','incomplete','cancelled','expired'
  )),
  provider_status text check (
    provider_status is null or provider_status in
      ('queued','in_progress','completed','failed','incomplete','cancelled')
  ),
  intent_created_at timestamptz not null default now(),
  submission_started_at timestamptz,
  submission_completed_at timestamptz,
  provider_attached_at timestamptz,
  acknowledgement_returned_at timestamptz,
  last_reconciled_at timestamptz,
  reconciliation_attempt_count integer not null default 0
    check (reconciliation_attempt_count between 0 and 100),
  transient_failure_count integer not null default 0
    check (transient_failure_count between 0 and 100),
  next_reconciliation_at timestamptz not null default now(),
  lease_owner uuid,
  lease_acquired_at timestamptz,
  lease_expires_at timestamptz,
  processing_stage text,
  last_safe_failure_code text,
  terminal_code text,
  terminal_source text check (
    terminal_source is null or terminal_source in
      ('webhook','reconciler','cancellation','expiry','submission')
  ),
  terminal_at timestamptz,
  published_at timestamptz,
  row_version integer not null default 1 check (row_version>0),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id,job_id)
    references public.procurement_research_jobs(workspace_id,id) on delete cascade,
  check (provider_operation_id is null or provider_operation_id ~ '^resp_[A-Za-z0-9_-]+$'),
  check (provider_attached_at is null or provider_operation_id is not null),
  check (lease_expires_at is null or lease_owner is not null),
  check (terminal_at is null or terminal_code is not null),
  check (published_at is null or terminal_at is not null)
);

create index procurement_background_due_work
  on public.procurement_background_operations(next_reconciliation_at)
  where terminal_at is null;
create index procurement_background_lease_expiry
  on public.procurement_background_operations(lease_expires_at)
  where terminal_at is null and lease_owner is not null;

create table public.procurement_background_webhook_inbox (
  event_id text primary key check (event_id ~ '^evt_[A-Za-z0-9_-]+$'),
  provider_operation_id text not null check (provider_operation_id ~ '^resp_[A-Za-z0-9_-]+$'),
  terminal_event_type text not null check (terminal_event_type in (
    'response.completed','response.failed','response.incomplete','response.cancelled'
  )),
  received_at timestamptz not null default now(),
  signature_verified_at timestamptz not null default now(),
  processing_state text not null default 'received' check (processing_state in (
    'received','unmatched_pending','processing','processed','duplicate',
    'transient_failure','permanently_rejected'
  )),
  processing_attempt_count integer not null default 0
    check (processing_attempt_count between 0 and 100),
  next_attempt_at timestamptz not null default now(),
  last_safe_error_code text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index procurement_webhook_pending
  on public.procurement_background_webhook_inbox(next_attempt_at)
  where processing_state in ('received','unmatched_pending','transient_failure');
create index procurement_webhook_by_operation
  on public.procurement_background_webhook_inbox(provider_operation_id,received_at);

alter table public.procurement_background_operations enable row level security;
alter table public.procurement_background_webhook_inbox enable row level security;
revoke all on public.procurement_background_operations from public,anon,authenticated;
revoke all on public.procurement_background_webhook_inbox from public,anon,authenticated;
grant select on public.procurement_background_operations to service_role;
grant select on public.procurement_background_webhook_inbox to service_role;

-- The prototype invocation function would allow an authenticated browser to
-- consume the provider gate without creating a durable intent. Only the server
-- lifecycle RPC below may now consume it.
revoke all on function public.begin_procurement_live_invocation(uuid,uuid,integer)
  from public,anon,authenticated;

create function public.begin_procurement_background_submission(
  candidate_workspace_id uuid,
  candidate_job_id uuid,
  candidate_owner_id uuid,
  maximum_daily_invocations integer
) returns table(attempt_id uuid,client_request_id uuid,submission_state text)
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  job public.procurement_research_jobs;
  existing public.procurement_background_operations;
  permitted_count integer;
  permitted_at timestamptz := clock_timestamp();
begin
  if maximum_daily_invocations is null
    or maximum_daily_invocations<1 or maximum_daily_invocations>100
  then raise exception 'LIVE_LIMIT_INVALID'; end if;

  perform pg_advisory_xact_lock(hashtextextended(candidate_owner_id::text,874231));

  select * into job from public.procurement_research_jobs
  where id=candidate_job_id and workspace_id=candidate_workspace_id
    and owner_id=candidate_owner_id and provider='openai-web-search-v1'
    and exists(
      select 1 from public.workspaces
      where id=candidate_workspace_id and owner_id=candidate_owner_id
        and lifecycle_state='active'
    )
  for update;
  if job.id is null then raise exception 'LIVE_JOB_UNAVAILABLE'; end if;

  select * into existing from public.procurement_background_operations
  where job_id=job.id for update;
  if existing.attempt_id is not null then
    return query select existing.attempt_id,existing.client_request_id,existing.submission_state;
    return;
  end if;

  if job.status<>'running' then raise exception 'LIVE_JOB_NOT_RUNNING'; end if;
  if job.live_invocation_started_at is not null or job.provider_invocation_count<>0
  then raise exception 'LIVE_JOB_ALREADY_INVOKED'; end if;

  select count(*) into permitted_count
  from public.procurement_research_jobs
  where owner_id=candidate_owner_id and provider='openai-web-search-v1'
    and live_invocation_started_at>=permitted_at-interval '24 hours';
  if permitted_count>=maximum_daily_invocations
  then raise exception 'LIVE_DAILY_LIMIT_REACHED'; end if;

  perform set_config('app.procurement_live_invocation_gate','allowed',true);
  perform set_config('app.procurement_background_worker','allowed',true);
  update public.procurement_research_jobs set
    live_invocation_started_at=permitted_at,
    provider_invocation_count=1,
    background_lifecycle_status='preparing',
    background_status_updated_at=permitted_at,
    updated_at=permitted_at
  where id=job.id;

  insert into public.procurement_background_operations(
    job_id,workspace_id,owner_id,provider,submission_state,next_reconciliation_at
  ) values (
    job.id,job.workspace_id,job.owner_id,job.provider,'intent_created',
    permitted_at+interval '1 minute'
  ) returning
    procurement_background_operations.attempt_id,
    procurement_background_operations.client_request_id,
    procurement_background_operations.submission_state
  into attempt_id,client_request_id,submission_state;
  return next;
end
$$;

create function public.start_procurement_background_submission(
  candidate_attempt_id uuid
) returns boolean
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare operation public.procurement_background_operations;
begin
  select * into operation from public.procurement_background_operations
    where attempt_id=candidate_attempt_id for update;
  if operation.attempt_id is null then raise exception 'BACKGROUND_OPERATION_UNAVAILABLE'; end if;
  if not exists(
    select 1 from public.procurement_research_jobs
    where id=operation.job_id and workspace_id=operation.workspace_id
      and owner_id=operation.owner_id and status='running'
      and cancellation_requested_at is null
  ) then raise exception 'BACKGROUND_JOB_NOT_RUNNING'; end if;
  if operation.submission_state='submitting' then return false; end if;
  if operation.submission_state<>'intent_created'
  then raise exception 'BACKGROUND_SUBMISSION_ALREADY_STARTED'; end if;
  perform set_config('app.procurement_background_worker','allowed',true);
  update public.procurement_background_operations set
    submission_state='submitting',submission_started_at=clock_timestamp(),
    processing_stage='provider_submission',next_reconciliation_at=clock_timestamp()+interval '2 minutes',
    row_version=row_version+1,updated_at=clock_timestamp()
  where attempt_id=operation.attempt_id;
  update public.procurement_research_jobs set
    background_lifecycle_status='submitting',
    background_status_updated_at=clock_timestamp(),updated_at=clock_timestamp()
  where id=operation.job_id;
  return true;
end
$$;

create function public.attach_procurement_background_operation(
  candidate_attempt_id uuid,
  candidate_owner_id uuid,
  candidate_provider_operation_id text,
  candidate_provider_status text
) returns text
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare operation public.procurement_background_operations;
begin
  if candidate_provider_operation_id !~ '^resp_[A-Za-z0-9_-]+$'
    or candidate_provider_status not in ('queued','in_progress')
  then raise exception 'BACKGROUND_OPERATION_INVALID'; end if;
  select * into operation from public.procurement_background_operations
  where attempt_id=candidate_attempt_id and owner_id=candidate_owner_id for update;
  if operation.attempt_id is null then raise exception 'BACKGROUND_OPERATION_UNAVAILABLE'; end if;
  if operation.provider_operation_id is not null then
    if operation.provider_operation_id=candidate_provider_operation_id then return 'duplicate'; end if;
    raise exception 'BACKGROUND_OPERATION_CONFLICT';
  end if;
  if exists(
    select 1 from public.procurement_background_operations
    where provider_operation_id=candidate_provider_operation_id
      and attempt_id<>candidate_attempt_id
  ) then raise exception 'BACKGROUND_OPERATION_CONFLICT'; end if;

  perform set_config('app.procurement_background_worker','allowed',true);
  update public.procurement_background_operations set
    provider_operation_id=candidate_provider_operation_id,
    provider_status=candidate_provider_status,
    submission_state=case when candidate_provider_status='queued'
      then 'provider_queued' else 'provider_in_progress' end,
    submission_completed_at=clock_timestamp(),
    provider_attached_at=clock_timestamp(),
    processing_stage='awaiting_provider',
    last_safe_failure_code=null,
    next_reconciliation_at=clock_timestamp()+interval '2 minutes',
    row_version=row_version+1,updated_at=clock_timestamp()
  where attempt_id=operation.attempt_id;
  update public.procurement_research_jobs set
    background_lifecycle_status=case when status='cancelled' then 'cancelled' else 'submitted' end,
    background_status_updated_at=clock_timestamp(),updated_at=clock_timestamp()
  where id=operation.job_id;
  update public.procurement_background_webhook_inbox set
    processing_state='received',next_attempt_at=clock_timestamp(),updated_at=clock_timestamp()
  where provider_operation_id=candidate_provider_operation_id
    and processing_state='unmatched_pending';
  return 'attached';
exception when unique_violation then raise exception 'BACKGROUND_OPERATION_CONFLICT';
end
$$;

create function public.mark_procurement_background_submission_ambiguous(
  candidate_attempt_id uuid,
  safe_failure_code text
) returns boolean
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare operation public.procurement_background_operations;
begin
  select * into operation from public.procurement_background_operations
    where attempt_id=candidate_attempt_id for update;
  if operation.attempt_id is null then return false; end if;
  if operation.provider_operation_id is not null or operation.terminal_at is not null then return true; end if;
  perform set_config('app.procurement_background_worker','allowed',true);
  update public.procurement_background_operations set
    submission_state='submission_ambiguous',
    processing_stage='submission_reconciliation',
    last_safe_failure_code=left(coalesce(safe_failure_code,'BACKGROUND_SUBMISSION_AMBIGUOUS'),80),
    next_reconciliation_at=clock_timestamp()+interval '5 minutes',
    row_version=row_version+1,updated_at=clock_timestamp()
  where attempt_id=operation.attempt_id;
  update public.procurement_research_jobs set
    background_lifecycle_status='submission_ambiguous',
    background_status_updated_at=clock_timestamp(),updated_at=clock_timestamp()
  where id=operation.job_id and status='running';
  return true;
end
$$;

create function public.acknowledge_procurement_background_submission(
  candidate_attempt_id uuid
) returns boolean
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
begin
  update public.procurement_background_operations set
    acknowledgement_returned_at=coalesce(acknowledgement_returned_at,clock_timestamp()),
    updated_at=clock_timestamp()
  where attempt_id=candidate_attempt_id and provider_operation_id is not null;
  return found;
end
$$;

create function public.store_procurement_background_webhook(
  candidate_event_id text,
  candidate_provider_operation_id text,
  candidate_event_type text
) returns text
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  current_event public.procurement_background_webhook_inbox;
  inserted_count integer;
begin
  if candidate_event_id !~ '^evt_[A-Za-z0-9_-]+$'
    or candidate_provider_operation_id !~ '^resp_[A-Za-z0-9_-]+$'
    or candidate_event_type not in (
      'response.completed','response.failed','response.incomplete','response.cancelled'
    ) then raise exception 'BACKGROUND_WEBHOOK_INVALID'; end if;
  insert into public.procurement_background_webhook_inbox(
    event_id,provider_operation_id,terminal_event_type,processing_state,processed_at
  ) values (
    candidate_event_id,candidate_provider_operation_id,candidate_event_type,
    case when exists(
      select 1 from public.procurement_background_operations
      where provider_operation_id=candidate_provider_operation_id
        and terminal_at is not null
    ) then 'duplicate' when exists(
      select 1 from public.procurement_background_operations
      where provider_operation_id=candidate_provider_operation_id
    ) then 'received' else 'unmatched_pending' end,
    case when exists(
      select 1 from public.procurement_background_operations
      where provider_operation_id=candidate_provider_operation_id
        and terminal_at is not null
    ) then clock_timestamp() else null end
  ) on conflict(event_id) do nothing;
  get diagnostics inserted_count = row_count;
  select * into current_event from public.procurement_background_webhook_inbox
    where event_id=candidate_event_id;
  if current_event.provider_operation_id<>candidate_provider_operation_id
    or current_event.terminal_event_type<>candidate_event_type
  then raise exception 'BACKGROUND_WEBHOOK_CONFLICT'; end if;
  return case when inserted_count=1 then 'stored' else 'duplicate' end;
end
$$;

create function public.claim_procurement_background_operation(
  candidate_attempt_id uuid,
  candidate_worker_id uuid,
  candidate_stage text,
  lease_seconds integer default 45
) returns boolean
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare claimed boolean;
begin
  if lease_seconds<10 or lease_seconds>120 then raise exception 'BACKGROUND_LEASE_INVALID'; end if;
  update public.procurement_background_operations set
    lease_owner=candidate_worker_id,lease_acquired_at=clock_timestamp(),
    lease_expires_at=clock_timestamp()+make_interval(secs=>lease_seconds),
    processing_stage=left(candidate_stage,80),row_version=row_version+1,
    updated_at=clock_timestamp()
  where attempt_id=candidate_attempt_id and terminal_at is null
    and (lease_owner is null or lease_expires_at<clock_timestamp() or lease_owner=candidate_worker_id)
  returning true into claimed;
  return coalesce(claimed,false);
end
$$;

create function public.reschedule_procurement_background_operation(
  candidate_attempt_id uuid,
  candidate_worker_id uuid,
  safe_failure_code text,
  delay_seconds integer,
  increment_failure boolean default true
) returns boolean
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare operation public.procurement_background_operations;
begin
  if delay_seconds<15 or delay_seconds>21600 then raise exception 'BACKGROUND_DELAY_INVALID'; end if;
  select * into operation from public.procurement_background_operations
  where attempt_id=candidate_attempt_id and lease_owner=candidate_worker_id for update;
  if operation.attempt_id is null or operation.terminal_at is not null then return false; end if;
  perform set_config('app.procurement_background_worker','allowed',true);
  update public.procurement_background_operations set
    submission_state=case when provider_operation_id is null
      then submission_state else 'provider_in_progress' end,
    last_reconciled_at=clock_timestamp(),
    reconciliation_attempt_count=least(reconciliation_attempt_count+1,100),
    transient_failure_count=least(transient_failure_count+
      case when increment_failure then 1 else 0 end,100),
    last_safe_failure_code=left(safe_failure_code,80),
    next_reconciliation_at=clock_timestamp()+make_interval(secs=>delay_seconds),
    lease_owner=null,lease_acquired_at=null,lease_expires_at=null,
    processing_stage='reconciliation_wait',row_version=row_version+1,
    updated_at=clock_timestamp()
  where attempt_id=operation.attempt_id;
  update public.procurement_research_jobs set
    background_lifecycle_status=case when status='cancelled' then 'cancelled' else 'reconciling' end,
    background_status_updated_at=clock_timestamp(),updated_at=clock_timestamp()
  where id=operation.job_id;
  return true;
end
$$;

create function public.finalize_procurement_background_operation(
  candidate_attempt_id uuid,
  candidate_worker_id uuid,
  candidate_event_id text,
  candidate_provider_status text,
  candidate_candidates jsonb default '[]'::jsonb,
  candidate_partial boolean default false,
  candidate_error_code text default null,
  candidate_error_details text default null,
  candidate_terminal_source text default 'reconciler'
) returns text
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  operation public.procurement_background_operations;
  job public.procurement_research_jobs;
  inserted_count integer := 0;
  terminal_job_status text;
  terminal_code_value text;
begin
  if candidate_provider_status not in ('completed','failed','incomplete','cancelled')
    or candidate_terminal_source not in ('webhook','reconciler','cancellation','expiry','submission')
    or jsonb_typeof(candidate_candidates)<>'array'
  then raise exception 'BACKGROUND_TERMINAL_EVENT_INVALID'; end if;

  select * into operation from public.procurement_background_operations
  where attempt_id=candidate_attempt_id for update;
  if operation.attempt_id is null then raise exception 'BACKGROUND_OPERATION_UNAVAILABLE'; end if;
  if operation.terminal_at is not null then return 'duplicate'; end if;
  if operation.lease_owner is distinct from candidate_worker_id
  then raise exception 'BACKGROUND_LEASE_REQUIRED'; end if;
  if candidate_event_id is not null and not exists(
    select 1 from public.procurement_background_webhook_inbox
    where event_id=candidate_event_id
      and provider_operation_id=operation.provider_operation_id
  ) then raise exception 'BACKGROUND_WEBHOOK_OPERATION_MISMATCH'; end if;

  select * into job from public.procurement_research_jobs
  where id=operation.job_id and workspace_id=operation.workspace_id
    and owner_id=operation.owner_id and provider=operation.provider
  for update;
  if job.id is null then raise exception 'BACKGROUND_JOB_UNAVAILABLE'; end if;

  terminal_code_value := coalesce(candidate_error_code,
    case candidate_provider_status
      when 'completed' then 'PROVIDER_COMPLETED'
      when 'failed' then 'PROVIDER_FAILED'
      when 'incomplete' then 'PROVIDER_INCOMPLETE'
      else 'PROVIDER_CANCELLED' end);

  perform set_config('app.procurement_background_worker','allowed',true);
  if job.status<>'running' or job.cancellation_requested_at is not null then
    update public.procurement_background_operations set
      submission_state='cancelled',provider_status=candidate_provider_status,
      terminal_code='PROVIDER_RESULT_DISCARDED_AFTER_CANCELLATION',
      terminal_source='cancellation',terminal_at=clock_timestamp(),
      lease_owner=null,lease_acquired_at=null,lease_expires_at=null,
      processing_stage='discarded',row_version=row_version+1,updated_at=clock_timestamp()
    where attempt_id=operation.attempt_id;
    if operation.provider_operation_id is not null then
      update public.procurement_background_webhook_inbox set
        processing_state=case when event_id=candidate_event_id
          then 'processed' else 'duplicate' end,
        processed_at=clock_timestamp(),updated_at=clock_timestamp()
      where provider_operation_id=operation.provider_operation_id
        and processing_state not in ('processed','duplicate');
    end if;
    return 'discarded';
  end if;

  if candidate_provider_status='completed' then
    insert into public.procurement_offer_candidates(
      workspace_id,owner_id,research_job_id,procurement_request_id,requested_item_id,
      supplier_name,product_title,source_url,package_quantity,package_unit,item_price,
      currency,moq,shipping_cost,delivery_estimate_days,stock_status,coa_availability,
      sds_availability,technical_document_availability,first_order_discount,source_date,
      evidence_snippets,source_notes,confidence,freshness,field_states,field_evidence,
      is_marketplace_listing,unresolved_fields
    )
    select operation.workspace_id,operation.owner_id,operation.job_id,
      job.procurement_request_id,x.requested_item_id,x.supplier_name,x.product_title,
      x.source_url,x.package_quantity,x.package_unit,x.item_price,x.currency,x.moq,
      x.shipping_cost,x.delivery_estimate_days,x.stock_status,x.coa_availability,
      x.sds_availability,x.technical_document_availability,x.first_order_discount,
      x.source_date,x.evidence_snippets,x.source_notes,x.confidence,x.freshness,
      x.field_states,x.field_evidence,x.is_marketplace_listing,x.unresolved_fields
    from jsonb_to_recordset(candidate_candidates) as x(
      requested_item_id uuid,supplier_name text,product_title text,source_url text,
      package_quantity numeric,package_unit text,item_price numeric,currency text,
      moq numeric,shipping_cost numeric,delivery_estimate_days integer,stock_status text,
      coa_availability text,sds_availability text,technical_document_availability text,
      first_order_discount numeric,source_date date,evidence_snippets text[],
      source_notes text,confidence text,freshness text,field_states jsonb,
      field_evidence jsonb,is_marketplace_listing boolean,unresolved_fields text[]
    );
    get diagnostics inserted_count = row_count;
    terminal_job_status := case when candidate_partial then 'partial' else 'completed' end;
  else
    terminal_job_status := case when candidate_provider_status='cancelled'
      then 'cancelled' else 'failed' end;
  end if;

  update public.procurement_background_operations set
    submission_state=candidate_provider_status,
    provider_status=candidate_provider_status,terminal_code=terminal_code_value,
    terminal_source=candidate_terminal_source,terminal_at=clock_timestamp(),
    published_at=case when candidate_provider_status='completed'
      then clock_timestamp() else null end,
    lease_owner=null,lease_acquired_at=null,lease_expires_at=null,
    processing_stage='terminal',row_version=row_version+1,updated_at=clock_timestamp()
  where attempt_id=operation.attempt_id;
  update public.procurement_research_jobs set
    status=terminal_job_status,result_count=inserted_count,
    error_code=case when terminal_job_status='failed' then terminal_code_value else null end,
    error_details=case when terminal_job_status='failed'
      then left(coalesce(candidate_error_details,'Background research did not complete.'),500)
      else null end,
    background_lifecycle_status=case when terminal_job_status in ('completed','partial')
      then 'completed' when terminal_job_status='cancelled' then 'cancelled' else 'failed' end,
    background_status_updated_at=clock_timestamp(),
    provider_stopped_at=clock_timestamp(),completed_at=clock_timestamp(),updated_at=clock_timestamp()
  where id=job.id;
  if operation.provider_operation_id is not null then
    update public.procurement_background_webhook_inbox set
      processing_state=case when event_id=candidate_event_id
        then 'processed' else 'duplicate' end,
      processed_at=clock_timestamp(),updated_at=clock_timestamp()
    where provider_operation_id=operation.provider_operation_id
      and processing_state not in ('processed','duplicate');
  end if;
  return 'finalized';
end
$$;

create function public.mark_procurement_background_webhook_retry(
  candidate_event_id text,
  safe_failure_code text,
  delay_seconds integer
) returns boolean
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp
as $$
begin
  if delay_seconds<15 or delay_seconds>21600 then raise exception 'BACKGROUND_DELAY_INVALID'; end if;
  update public.procurement_background_webhook_inbox set
    processing_state='transient_failure',
    processing_attempt_count=least(processing_attempt_count+1,100),
    last_safe_error_code=left(safe_failure_code,80),
    next_attempt_at=clock_timestamp()+make_interval(secs=>delay_seconds),
    updated_at=clock_timestamp()
  where event_id=candidate_event_id and processing_state<>'processed';
  return found;
end
$$;

do $$
declare function_signature text;
begin
  foreach function_signature in array array[
    'public.begin_procurement_background_submission(uuid,uuid,uuid,integer)',
    'public.start_procurement_background_submission(uuid)',
    'public.attach_procurement_background_operation(uuid,uuid,text,text)',
    'public.mark_procurement_background_submission_ambiguous(uuid,text)',
    'public.acknowledge_procurement_background_submission(uuid)',
    'public.store_procurement_background_webhook(text,text,text)',
    'public.claim_procurement_background_operation(uuid,uuid,text,integer)',
    'public.reschedule_procurement_background_operation(uuid,uuid,text,integer,boolean)',
    'public.finalize_procurement_background_operation(uuid,uuid,text,text,jsonb,boolean,text,text,text)',
    'public.mark_procurement_background_webhook_retry(text,text,integer)'
  ] loop
    execute format('revoke all on function %s from public,anon,authenticated',function_signature);
    execute format('grant execute on function %s to service_role',function_signature);
  end loop;
end
$$;

revoke all on function public.guard_procurement_background_job_state()
  from public,anon,authenticated;
notify pgrst, 'reload schema';
