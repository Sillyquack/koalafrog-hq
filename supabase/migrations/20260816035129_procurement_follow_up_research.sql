-- Targeted Procurement follow-up research is a separate, immutable job lineage.
-- The original job and its review candidates remain unchanged; the new job
-- carries an owner-approved objective and a canonical snapshot of the gaps it
-- was created to investigate.
alter table public.procurement_research_jobs
  add column follow_up_of_job_id uuid,
  add column follow_up_instructions text,
  add column follow_up_context jsonb,
  add column delivery_country text,
  add column live_research_consent_at timestamptz,
  add constraint procurement_research_jobs_follow_up_workspace_fkey
    foreign key(workspace_id,follow_up_of_job_id)
    references public.procurement_research_jobs(workspace_id,id),
  add constraint procurement_research_jobs_follow_up_shape
    check(
      (
        follow_up_of_job_id is null
        and follow_up_instructions is null
        and follow_up_context is null
        and delivery_country is null
        and live_research_consent_at is null
      )
      or
      (
        follow_up_of_job_id is not null
        and retry_of_job_id is null
        and provider='openai-web-search-v1'
        and length(trim(follow_up_instructions)) between 1 and 4000
        and jsonb_typeof(follow_up_context)='object'
        and delivery_country ~ '^[A-Z]{2}$'
        and live_research_consent_at is not null
      )
    );

create index procurement_research_jobs_follow_up_lineage
  on public.procurement_research_jobs(workspace_id,follow_up_of_job_id,created_at desc)
  where follow_up_of_job_id is not null;

alter table public.procurement_offer_candidates
  add column follow_up_to_candidate_id uuid,
  add constraint procurement_offer_candidates_follow_up_workspace_fkey
    foreign key(workspace_id,follow_up_to_candidate_id)
    references public.procurement_offer_candidates(workspace_id,id);

create index procurement_offer_candidates_follow_up_lineage
  on public.procurement_offer_candidates(workspace_id,follow_up_to_candidate_id)
  where follow_up_to_candidate_id is not null;

create function public.guard_procurement_follow_up_job_lineage()
returns trigger
language plpgsql
security invoker
set search_path=pg_catalog,public,pg_temp
as $$
declare
  prior_job public.procurement_research_jobs;
begin
  if tg_op='UPDATE' and (
    new.follow_up_of_job_id is distinct from old.follow_up_of_job_id
    or new.follow_up_instructions is distinct from old.follow_up_instructions
    or new.follow_up_context is distinct from old.follow_up_context
    or new.delivery_country is distinct from old.delivery_country
    or new.live_research_consent_at is distinct from old.live_research_consent_at
  ) then raise exception 'PROCUREMENT_FOLLOW_UP_LINEAGE_IMMUTABLE'; end if;
  if new.follow_up_of_job_id is null then return new; end if;

  select * into prior_job
  from public.procurement_research_jobs
  where workspace_id=new.workspace_id
    and id=new.follow_up_of_job_id
    and owner_id=new.owner_id;
  if prior_job.id is null
    or prior_job.procurement_request_id<>new.procurement_request_id
    or prior_job.provider<>new.provider
    or prior_job.status not in ('partial','completed','failed')
  then raise exception 'PROCUREMENT_FOLLOW_UP_PRIOR_JOB_INVALID'; end if;
  return new;
end
$$;

create trigger guard_procurement_follow_up_job_lineage
before insert or update on public.procurement_research_jobs
for each row execute function public.guard_procurement_follow_up_job_lineage();

create function public.guard_procurement_follow_up_candidate_lineage()
returns trigger
language plpgsql
security invoker
set search_path=pg_catalog,public,pg_temp
as $$
declare
  current_job public.procurement_research_jobs;
  prior_candidate public.procurement_offer_candidates;
begin
  if tg_op='UPDATE'
    and new.follow_up_to_candidate_id is distinct from old.follow_up_to_candidate_id
  then raise exception 'PROCUREMENT_FOLLOW_UP_CANDIDATE_LINEAGE_IMMUTABLE'; end if;

  select * into current_job
  from public.procurement_research_jobs
  where workspace_id=new.workspace_id
    and id=new.research_job_id
    and owner_id=new.owner_id;
  if current_job.id is null then raise exception 'PROCUREMENT_RESEARCH_JOB_UNAVAILABLE'; end if;

  if new.follow_up_to_candidate_id is null and current_job.follow_up_of_job_id is not null then
    select * into prior_candidate
    from public.procurement_offer_candidates
    where workspace_id=new.workspace_id
      and owner_id=new.owner_id
      and research_job_id=current_job.follow_up_of_job_id
      and requested_item_id=new.requested_item_id
      and (
        source_url=new.source_url
        or (
          regexp_replace(lower(supplier_name),'[^a-z0-9]+','','g')
            =regexp_replace(lower(new.supplier_name),'[^a-z0-9]+','','g')
          and regexp_replace(lower(product_title),'[^a-z0-9]+','','g')
            =regexp_replace(lower(new.product_title),'[^a-z0-9]+','','g')
        )
      )
    order by created_at,id
    limit 1;
    new.follow_up_to_candidate_id:=prior_candidate.id;
  end if;

  if new.follow_up_to_candidate_id is null then return new; end if;
  select * into prior_candidate
  from public.procurement_offer_candidates
  where workspace_id=new.workspace_id
    and id=new.follow_up_to_candidate_id
    and owner_id=new.owner_id;
  if prior_candidate.id is null
    or current_job.follow_up_of_job_id is distinct from prior_candidate.research_job_id
    or prior_candidate.procurement_request_id<>new.procurement_request_id
    or prior_candidate.requested_item_id<>new.requested_item_id
  then raise exception 'PROCUREMENT_FOLLOW_UP_CANDIDATE_INVALID'; end if;
  return new;
end
$$;

create trigger guard_procurement_follow_up_candidate_lineage
before insert or update on public.procurement_offer_candidates
for each row execute function public.guard_procurement_follow_up_candidate_lineage();

create function public.create_procurement_follow_up_research_job(
  candidate_workspace_id uuid,
  candidate_procurement_request_id uuid,
  candidate_prior_job_id uuid,
  candidate_instructions text,
  candidate_delivery_country text,
  candidate_live_research_consent boolean
) returns uuid
language plpgsql
security invoker
set search_path=pg_catalog,public,pg_temp
as $$
declare
  uid uuid:=auth.uid();
  prior_job public.procurement_research_jobs;
  new_job_id uuid;
  clean_instructions text:=trim(coalesce(candidate_instructions,''));
  clean_country text:=upper(trim(coalesce(candidate_delivery_country,'')));
  requested_item_count integer;
  unresolved_fields jsonb;
  prior_candidates jsonb;
  items_without_practical_candidate jsonb;
  context_snapshot jsonb;
begin
  if uid is null then raise exception 'PROCUREMENT_FOLLOW_UP_AUTH_REQUIRED'; end if;
  if candidate_live_research_consent is distinct from true
  then raise exception 'PROCUREMENT_FOLLOW_UP_CONSENT_REQUIRED'; end if;
  if length(clean_instructions) not between 1 and 4000
    or clean_country !~ '^[A-Z]{2}$'
  then raise exception 'PROCUREMENT_FOLLOW_UP_INPUT_INVALID'; end if;
  if not exists(
    select 1 from public.workspaces
    where id=candidate_workspace_id and owner_id=uid and lifecycle_state='active'
  ) then raise exception 'PROCUREMENT_FOLLOW_UP_WORKSPACE_UNAVAILABLE'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    candidate_workspace_id::text||':'||candidate_procurement_request_id::text||
    ':openai-web-search-v1',8162026
  ));

  select * into prior_job
  from public.procurement_research_jobs
  where workspace_id=candidate_workspace_id
    and owner_id=uid
    and id=candidate_prior_job_id
    and procurement_request_id=candidate_procurement_request_id
    and provider='openai-web-search-v1'
    and status in ('partial','completed','failed')
  for update;
  if prior_job.id is null then raise exception 'PROCUREMENT_FOLLOW_UP_PRIOR_JOB_UNAVAILABLE'; end if;
  if exists(
    select 1 from public.procurement_research_jobs
    where workspace_id=candidate_workspace_id
      and owner_id=uid
      and procurement_request_id=candidate_procurement_request_id
      and provider=prior_job.provider
      and status in ('queued','running')
  ) then raise exception 'PROCUREMENT_FOLLOW_UP_ACTIVE_JOB_EXISTS'; end if;

  select count(*) into requested_item_count
  from public.procurement_requested_items
  where workspace_id=candidate_workspace_id
    and owner_id=uid
    and procurement_request_id=candidate_procurement_request_id;
  if requested_item_count<1 or requested_item_count>10
  then raise exception 'PROCUREMENT_FOLLOW_UP_ITEM_COUNT_INVALID'; end if;

  select coalesce(jsonb_agg(field order by field),'[]'::jsonb)
  into unresolved_fields
  from(
    select distinct unnest(c.unresolved_fields) as field
    from public.procurement_offer_candidates c
    where c.workspace_id=candidate_workspace_id
      and c.owner_id=uid
      and c.research_job_id=prior_job.id
  ) unresolved;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id::text,
    'requestedItemId',c.requested_item_id::text,
    'supplierName',c.supplier_name,
    'productTitle',c.product_title,
    'sourceUrl',c.source_url,
    'packageQuantity',c.package_quantity,
    'packageUnit',c.package_unit,
    'itemPrice',c.item_price,
    'currency',c.currency,
    'shippingCost',c.shipping_cost,
    'deliveryEstimateDays',c.delivery_estimate_days,
    'coaAvailability',c.coa_availability,
    'sdsAvailability',c.sds_availability,
    'technicalDocumentAvailability',c.technical_document_availability,
    'evidenceSnippets',to_jsonb(c.evidence_snippets),
    'fieldEvidence',c.field_evidence,
    'unresolvedFields',to_jsonb(c.unresolved_fields),
    'reviewStatus',c.review_status
  ) order by c.created_at,c.id),'[]'::jsonb)
  into prior_candidates
  from public.procurement_offer_candidates c
  where c.workspace_id=candidate_workspace_id
    and c.owner_id=uid
    and c.research_job_id=prior_job.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'requestedItemId',i.id::text,
    'name',i.name
  ) order by i.created_at,i.id),'[]'::jsonb)
  into items_without_practical_candidate
  from public.procurement_requested_items i
  where i.workspace_id=candidate_workspace_id
    and i.owner_id=uid
    and i.procurement_request_id=candidate_procurement_request_id
    and not exists(
      select 1 from public.procurement_offer_candidates c
      where c.workspace_id=i.workspace_id
        and c.owner_id=i.owner_id
        and c.research_job_id=prior_job.id
        and c.requested_item_id=i.id
        and c.review_status not in ('rejected','duplicate')
        and not c.is_marketplace_listing
        and c.package_quantity is not null
        and nullif(trim(c.package_unit),'') is not null
        and c.item_price is not null
        and nullif(trim(c.currency),'') is not null
        and cardinality(c.unresolved_fields)=0
    );

  context_snapshot:=jsonb_build_object(
    'schemaVersion',1,
    'unresolvedFields',unresolved_fields,
    'priorCandidates',prior_candidates,
    'itemsWithoutPracticalCandidate',items_without_practical_candidate
  );

  insert into public.procurement_research_jobs(
    workspace_id,owner_id,procurement_request_id,provider,status,
    follow_up_of_job_id,follow_up_instructions,follow_up_context,
    delivery_country,live_research_consent_at
  ) values(
    candidate_workspace_id,uid,candidate_procurement_request_id,
    prior_job.provider,'queued',prior_job.id,clean_instructions,context_snapshot,
    clean_country,clock_timestamp()
  ) returning id into new_job_id;
  return new_job_id;
end
$$;

revoke all on function public.create_procurement_follow_up_research_job(
  uuid,uuid,uuid,text,text,boolean
) from public,anon;
grant execute on function public.create_procurement_follow_up_research_job(
  uuid,uuid,uuid,text,text,boolean
) to authenticated;

create or replace function public.publish_procurement_research_results(
  candidate_workspace_id uuid,
  candidate_job_id uuid,
  candidates jsonb,
  terminal_status text,
  provider_request_id text default null
) returns integer
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  uid uuid := auth.uid();
  job public.procurement_research_jobs;
  inserted_count integer;
begin
  if terminal_status not in ('partial','completed') then
    raise exception 'Invalid publication status';
  end if;
  if jsonb_typeof(candidates) <> 'array' then raise exception 'Candidates must be an array'; end if;

  select * into job from public.procurement_research_jobs
  where id=candidate_job_id and workspace_id=candidate_workspace_id and owner_id=uid
  for update;
  if job.id is null then raise exception 'Research job unavailable'; end if;
  if job.status <> 'running' then raise exception 'Research job is not running'; end if;

  insert into public.procurement_offer_candidates(
    workspace_id,owner_id,research_job_id,procurement_request_id,requested_item_id,
    follow_up_to_candidate_id,supplier_name,matched_supplier_id,product_title,
    source_url,package_quantity,package_unit,item_price,currency,moq,shipping_cost,
    delivery_estimate_days,stock_status,coa_availability,sds_availability,
    technical_document_availability,first_order_discount,source_date,
    evidence_snippets,source_notes,confidence,freshness,field_states,field_evidence,
    is_marketplace_listing,unresolved_fields
  )
  select candidate_workspace_id,uid,candidate_job_id,job.procurement_request_id,
    x.requested_item_id,x.follow_up_to_candidate_id,x.supplier_name,
    x.matched_supplier_id,x.product_title,x.source_url,x.package_quantity,
    x.package_unit,x.item_price,x.currency,x.moq,x.shipping_cost,
    x.delivery_estimate_days,x.stock_status,x.coa_availability,x.sds_availability,
    x.technical_document_availability,x.first_order_discount,x.source_date,
    x.evidence_snippets,x.source_notes,x.confidence,x.freshness,x.field_states,
    x.field_evidence,x.is_marketplace_listing,x.unresolved_fields
  from jsonb_to_recordset(candidates) as x(
    requested_item_id uuid,follow_up_to_candidate_id uuid,supplier_name text,
    matched_supplier_id uuid,product_title text,source_url text,
    package_quantity numeric,package_unit text,item_price numeric,currency text,
    moq numeric,shipping_cost numeric,delivery_estimate_days integer,
    stock_status text,coa_availability text,sds_availability text,
    technical_document_availability text,first_order_discount numeric,
    source_date date,evidence_snippets text[],source_notes text,confidence text,
    freshness text,field_states jsonb,field_evidence jsonb,
    is_marketplace_listing boolean,unresolved_fields text[]
  );
  get diagnostics inserted_count = row_count;

  update public.procurement_research_jobs set
    status=terminal_status,result_count=inserted_count,
    provider_request_id=coalesce(publish_procurement_research_results.provider_request_id,
      procurement_research_jobs.provider_request_id),
    completed_at=now(),updated_at=now()
  where id=job.id;
  return inserted_count;
end
$$;

create or replace function public.finalize_procurement_background_operation(
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
      follow_up_to_candidate_id,supplier_name,product_title,source_url,
      package_quantity,package_unit,item_price,currency,moq,shipping_cost,
      delivery_estimate_days,stock_status,coa_availability,sds_availability,
      technical_document_availability,first_order_discount,source_date,
      evidence_snippets,source_notes,confidence,freshness,field_states,
      field_evidence,is_marketplace_listing,unresolved_fields
    )
    select operation.workspace_id,operation.owner_id,operation.job_id,
      job.procurement_request_id,x.requested_item_id,x.follow_up_to_candidate_id,
      x.supplier_name,x.product_title,x.source_url,x.package_quantity,
      x.package_unit,x.item_price,x.currency,x.moq,x.shipping_cost,
      x.delivery_estimate_days,x.stock_status,x.coa_availability,
      x.sds_availability,x.technical_document_availability,x.first_order_discount,
      x.source_date,x.evidence_snippets,x.source_notes,x.confidence,x.freshness,
      x.field_states,x.field_evidence,x.is_marketplace_listing,x.unresolved_fields
    from jsonb_to_recordset(candidate_candidates) as x(
      requested_item_id uuid,follow_up_to_candidate_id uuid,supplier_name text,
      product_title text,source_url text,package_quantity numeric,package_unit text,
      item_price numeric,currency text,moq numeric,shipping_cost numeric,
      delivery_estimate_days integer,stock_status text,coa_availability text,
      sds_availability text,technical_document_availability text,
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

revoke all on function public.finalize_procurement_background_operation(
  uuid,uuid,text,text,jsonb,boolean,text,text,text
) from public,anon,authenticated;
grant execute on function public.finalize_procurement_background_operation(
  uuid,uuid,text,text,jsonb,boolean,text,text,text
) to service_role;

notify pgrst,'reload schema';
