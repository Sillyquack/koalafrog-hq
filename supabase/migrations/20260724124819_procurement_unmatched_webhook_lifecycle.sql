-- Verified webhooks can arrive before their provider operation is attached.
-- Keep that recovery window bounded without exposing internal identifiers to
-- the worker or permitting terminal inbox states to reopen.

create index procurement_webhook_unmatched_expiry
  on public.procurement_background_webhook_inbox(received_at)
  where processing_state='unmatched_pending';

alter table public.procurement_background_webhook_inbox
  add constraint procurement_webhook_rejection_reason
  check (
    processing_state<>'permanently_rejected'
    or (
      processed_at is not null
      and last_safe_error_code='UNMATCHED_WEBHOOK_EXPIRED'
    )
  );

create function public.guard_procurement_webhook_terminal_state()
returns trigger
language plpgsql
security invoker
set search_path=pg_catalog,public,pg_temp
as $$
begin
  if old.processing_state in ('processed','duplicate','permanently_rejected')
    and new.processing_state is distinct from old.processing_state
  then
    return old;
  end if;
  return new;
end
$$;

create trigger guard_procurement_webhook_terminal_state
before update on public.procurement_background_webhook_inbox
for each row execute function public.guard_procurement_webhook_terminal_state();

create function public.expire_procurement_unmatched_webhooks(
  maximum_rows integer default 25
) returns integer
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  expired_count integer;
begin
  if maximum_rows is null or maximum_rows<1 or maximum_rows>100
  then raise exception 'BACKGROUND_WEBHOOK_BATCH_INVALID'; end if;

  with due as (
    select inbox.event_id
    from public.procurement_background_webhook_inbox inbox
    where inbox.processing_state='unmatched_pending'
      and inbox.received_at+interval '15 minutes'<=clock_timestamp()
      and not exists(
        select 1
        from public.procurement_background_operations operation
        where operation.provider_operation_id=inbox.provider_operation_id
      )
    order by inbox.received_at,inbox.event_id
    for update of inbox skip locked
    limit maximum_rows
  )
  update public.procurement_background_webhook_inbox inbox set
    processing_state='permanently_rejected',
    processing_attempt_count=least(inbox.processing_attempt_count+1,100),
    last_safe_error_code='UNMATCHED_WEBHOOK_EXPIRED',
    processed_at=clock_timestamp(),
    updated_at=clock_timestamp()
  from due
  where inbox.event_id=due.event_id
    and inbox.processing_state='unmatched_pending'
    and inbox.received_at+interval '15 minutes'<=clock_timestamp()
    and not exists(
      select 1
      from public.procurement_background_operations operation
      where operation.provider_operation_id=inbox.provider_operation_id
    );

  get diagnostics expired_count = row_count;
  return expired_count;
end
$$;

-- Attachment remains exact-provider-ID only. An event inside the grace window
-- becomes immediately eligible for processing. At or beyond the boundary it
-- terminalizes monotonically and provider polling remains the recovery path.
create or replace function public.attach_procurement_background_operation(
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
    processing_state=case
      when received_at+interval '15 minutes'>clock_timestamp()
        then 'received'
      else 'permanently_rejected'
    end,
    last_safe_error_code=case
      when received_at+interval '15 minutes'>clock_timestamp()
        then null
      else 'UNMATCHED_WEBHOOK_EXPIRED'
    end,
    processed_at=case
      when received_at+interval '15 minutes'>clock_timestamp()
        then null
      else clock_timestamp()
    end,
    next_attempt_at=clock_timestamp(),
    updated_at=clock_timestamp()
  where provider_operation_id=candidate_provider_operation_id
    and processing_state='unmatched_pending';
  return 'attached';
exception when unique_violation then raise exception 'BACKGROUND_OPERATION_CONFLICT';
end
$$;

-- Retry can only move nonterminal, already matched work. It cannot regress a
-- duplicate or permanently rejected audit row.
create or replace function public.mark_procurement_background_webhook_retry(
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
  where event_id=candidate_event_id
    and processing_state in ('received','processing','transient_failure');
  return found;
end
$$;

revoke all on function public.expire_procurement_unmatched_webhooks(integer)
  from public,anon,authenticated;
grant execute on function public.expire_procurement_unmatched_webhooks(integer)
  to service_role;

revoke all on function public.guard_procurement_webhook_terminal_state()
  from public,anon,authenticated,service_role;

revoke all on function public.attach_procurement_background_operation(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.attach_procurement_background_operation(uuid,uuid,text,text)
  to service_role;

revoke all on function public.mark_procurement_background_webhook_retry(text,text,integer)
  from public,anon,authenticated;
grant execute on function public.mark_procurement_background_webhook_retry(text,text,integer)
  to service_role;

notify pgrst, 'reload schema';
