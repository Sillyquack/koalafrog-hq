-- A successful provider poll proves the Response is still retrievable and
-- resets the consecutive-failure budget. Failed retrievals remain bounded by
-- the roughly ten-minute OpenAI background Response retention window. The
-- worker enforces four consecutive attempts; this RPC resets that counter
-- after every successfully retrieved queued/in-progress response.
create or replace function public.reschedule_procurement_background_operation(
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
  if delay_seconds<15 or delay_seconds>60 then raise exception 'BACKGROUND_DELAY_INVALID'; end if;
  select * into operation from public.procurement_background_operations
  where attempt_id=candidate_attempt_id and lease_owner=candidate_worker_id for update;
  if operation.attempt_id is null or operation.terminal_at is not null then return false; end if;
  perform set_config('app.procurement_background_worker','allowed',true);
  update public.procurement_background_operations set
    submission_state=case when provider_operation_id is null
      then submission_state else 'provider_in_progress' end,
    last_reconciled_at=clock_timestamp(),
    reconciliation_attempt_count=least(reconciliation_attempt_count+1,100),
    transient_failure_count=case when increment_failure
      then least(transient_failure_count+1,100) else 0 end,
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

revoke all on function public.reschedule_procurement_background_operation(uuid,uuid,text,integer,boolean)
  from public,anon,authenticated;
grant execute on function public.reschedule_procurement_background_operation(uuid,uuid,text,integer,boolean)
  to service_role;
