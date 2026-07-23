-- Server-only linkage between an owned Procurement job and one OpenAI
-- background Response. Provider identifiers and webhook delivery identifiers
-- are deliberately unavailable to browser roles.
create table public.procurement_background_operations (
  job_id uuid primary key,
  workspace_id uuid not null,
  owner_id uuid not null,
  provider text not null check (provider='openai-web-search-v1'),
  provider_operation_id text not null unique,
  provider_status text not null check (
    provider_status in ('queued','in_progress','completed','failed','incomplete','cancelled')
  ),
  terminal_event_id text unique,
  attached_at timestamptz not null default now(),
  terminal_at timestamptz,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (workspace_id,job_id)
    references public.procurement_research_jobs(workspace_id,id) on delete cascade,
  check (provider_operation_id ~ '^resp_[A-Za-z0-9_-]+$'),
  check (terminal_at is null or terminal_at >= attached_at),
  check (published_at is null or terminal_at is not null)
);

alter table public.procurement_background_operations enable row level security;
revoke all on public.procurement_background_operations from public,anon,authenticated;

create function public.attach_procurement_background_operation(
  candidate_workspace_id uuid,
  candidate_job_id uuid,
  candidate_owner_id uuid,
  candidate_provider_operation_id text,
  candidate_provider_status text
) returns boolean
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  job public.procurement_research_jobs;
begin
  if candidate_provider_operation_id !~ '^resp_[A-Za-z0-9_-]+$'
    or candidate_provider_status not in ('queued','in_progress')
  then raise exception 'BACKGROUND_OPERATION_INVALID'; end if;

  select * into job
  from public.procurement_research_jobs
  where id=candidate_job_id
    and workspace_id=candidate_workspace_id
    and owner_id=candidate_owner_id
    and provider='openai-web-search-v1'
    and status='running'
    and provider_invocation_count=1
  for update;

  if job.id is null then raise exception 'BACKGROUND_JOB_UNAVAILABLE'; end if;

  insert into public.procurement_background_operations(
    job_id,workspace_id,owner_id,provider,provider_operation_id,provider_status
  ) values (
    job.id,job.workspace_id,job.owner_id,job.provider,
    candidate_provider_operation_id,candidate_provider_status
  );
  return true;
exception
  when unique_violation then raise exception 'BACKGROUND_OPERATION_ALREADY_ATTACHED';
end
$$;

create function public.finalize_procurement_background_operation(
  candidate_provider_operation_id text,
  candidate_event_id text,
  candidate_provider_status text,
  candidate_candidates jsonb default '[]'::jsonb,
  candidate_partial boolean default false,
  candidate_error_code text default null,
  candidate_error_details text default null
) returns text
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
declare
  operation public.procurement_background_operations;
  job public.procurement_research_jobs;
  inserted_count integer := 0;
  terminal_job_status text;
begin
  if candidate_event_id is null or btrim(candidate_event_id)=''
    or candidate_provider_status not in ('completed','failed','incomplete','cancelled')
  then raise exception 'BACKGROUND_TERMINAL_EVENT_INVALID'; end if;
  if jsonb_typeof(candidate_candidates)<>'array'
  then raise exception 'BACKGROUND_CANDIDATES_INVALID'; end if;

  select * into operation
  from public.procurement_background_operations
  where provider_operation_id=candidate_provider_operation_id
  for update;
  if operation.job_id is null then raise exception 'BACKGROUND_OPERATION_UNAVAILABLE'; end if;
  if operation.terminal_event_id is not null then return 'duplicate'; end if;

  select * into job from public.procurement_research_jobs
  where id=operation.job_id
    and workspace_id=operation.workspace_id
    and owner_id=operation.owner_id
    and provider=operation.provider
  for update;
  if job.id is null then raise exception 'BACKGROUND_JOB_UNAVAILABLE'; end if;

  update public.procurement_background_operations set
    provider_status=candidate_provider_status,
    terminal_event_id=candidate_event_id,
    terminal_at=clock_timestamp(),
    updated_at=clock_timestamp()
  where job_id=operation.job_id;

  -- Cancellation and every other prior terminal state win over a late provider
  -- event. The event is consumed, but no candidate can be published.
  if job.status<>'running' or job.cancellation_requested_at is not null then
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
    update public.procurement_background_operations
      set published_at=clock_timestamp(),updated_at=clock_timestamp()
      where job_id=operation.job_id;
  else
    terminal_job_status := case when candidate_provider_status='cancelled'
      then 'cancelled' else 'failed' end;
  end if;

  update public.procurement_research_jobs set
    status=terminal_job_status,
    result_count=inserted_count,
    error_code=case when terminal_job_status='failed'
      then coalesce(candidate_error_code,'PROVIDER_FAILURE') else null end,
    error_details=case when terminal_job_status='failed'
      then left(coalesce(candidate_error_details,'Background research did not complete.'),500)
      else null end,
    provider_stopped_at=clock_timestamp(),
    completed_at=clock_timestamp(),
    updated_at=clock_timestamp()
  where id=job.id;
  return 'finalized';
end
$$;

revoke all on function public.attach_procurement_background_operation(
  uuid,uuid,uuid,text,text
) from public,anon,authenticated;
grant execute on function public.attach_procurement_background_operation(
  uuid,uuid,uuid,text,text
) to service_role;
revoke all on function public.finalize_procurement_background_operation(
  text,text,text,jsonb,boolean,text,text
) from public,anon,authenticated;
grant execute on function public.finalize_procurement_background_operation(
  text,text,text,jsonb,boolean,text,text
) to service_role;

notify pgrst, 'reload schema';
