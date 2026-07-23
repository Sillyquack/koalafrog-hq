alter table public.procurement_research_jobs
  add column cancellation_requested_at timestamptz,
  add column provider_stopped_at timestamptz;

drop index if exists public.procurement_one_active_provider_job;
create unique index procurement_one_active_provider_job
  on public.procurement_research_jobs(workspace_id,procurement_request_id,provider)
  where status in ('queued','running');

alter table public.procurement_research_jobs
  drop constraint procurement_research_jobs_retry_of_job_id_fkey,
  add constraint procurement_research_jobs_retry_workspace_fkey
    foreign key(workspace_id,retry_of_job_id)
    references public.procurement_research_jobs(workspace_id,id);

alter table public.procurement_offer_candidates
  drop constraint procurement_offer_candidates_duplicate_of_candidate_id_fkey,
  add constraint procurement_offer_candidates_duplicate_workspace_fkey
    foreign key(workspace_id,duplicate_of_candidate_id)
    references public.procurement_offer_candidates(workspace_id,id);

create function public.accept_procurement_offer_candidate(
  candidate_workspace_id uuid,
  candidate_id uuid,
  selected_supplier_id uuid default null,
  create_supplier boolean default true
) returns table(supplier_id uuid,offer_id uuid)
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  uid uuid := auth.uid();
  candidate public.procurement_offer_candidates;
  resolved_supplier_id uuid;
  created_offer_id uuid;
begin
  if uid is null or not exists(
    select 1 from public.workspaces
    where id=candidate_workspace_id and owner_id=uid and lifecycle_state='active'
  ) then raise exception 'Active workspace unavailable'; end if;

  select * into candidate
  from public.procurement_offer_candidates
  where id=candidate_id and workspace_id=candidate_workspace_id and owner_id=uid
  for update;

  if candidate.id is null then raise exception 'Candidate unavailable'; end if;
  if candidate.review_status <> 'pending' then raise exception 'Candidate is no longer pending'; end if;
  if candidate.package_quantity is null or candidate.package_unit is null or trim(candidate.package_unit)='' then
    raise exception 'Package size must be resolved before acceptance';
  end if;

  resolved_supplier_id := coalesce(selected_supplier_id,candidate.matched_supplier_id);
  if resolved_supplier_id is not null then
    if not exists(
      select 1 from public.suppliers
      where id=resolved_supplier_id and workspace_id=candidate_workspace_id and owner_id=uid
    ) then raise exception 'Supplier unavailable in this workspace'; end if;
  elsif create_supplier then
    insert into public.suppliers(
      workspace_id,owner_id,legal_name,supplier_type,status,website_url,internal_notes,is_preferred
    ) values(
      candidate_workspace_id,uid,candidate.supplier_name,'raw_material','research',
      candidate.source_url,
      'Created from reviewed Procurement research candidate '||candidate.id::text,
      false
    ) returning id into resolved_supplier_id;
  else
    raise exception 'A canonical supplier is required';
  end if;

  insert into public.procurement_supplier_offers(
    workspace_id,owner_id,requested_item_id,supplier_id,product_title,product_url,
    package_quantity,package_unit,item_price,currency,moq,shipping_cost,
    delivery_estimate_days,stock_status,coa_availability,sds_availability,
    technical_document_availability,certification_claims,first_order_discount,
    notes,date_checked,confidence
  ) values(
    candidate_workspace_id,uid,candidate.requested_item_id,resolved_supplier_id,
    candidate.product_title,candidate.source_url,candidate.package_quantity,
    candidate.package_unit,candidate.item_price,candidate.currency,candidate.moq,
    candidate.shipping_cost,candidate.delivery_estimate_days,candidate.stock_status,
    candidate.coa_availability,candidate.sds_availability,
    candidate.technical_document_availability,'{}',candidate.first_order_discount,
    'Research provenance: '||candidate.source_notes||E'\nEvidence: '||
      array_to_string(candidate.evidence_snippets,' | '),
    candidate.source_date,candidate.confidence
  ) returning id into created_offer_id;

  update public.procurement_offer_candidates set
    matched_supplier_id=resolved_supplier_id,
    accepted_offer_id=created_offer_id,
    review_status='accepted',
    reviewed_at=now(),
    updated_at=now()
  where id=candidate.id;

  return query select resolved_supplier_id,created_offer_id;
end
$$;

create function public.publish_procurement_research_results(
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
    supplier_name,matched_supplier_id,product_title,source_url,package_quantity,
    package_unit,item_price,currency,moq,shipping_cost,delivery_estimate_days,
    stock_status,coa_availability,sds_availability,technical_document_availability,
    first_order_discount,source_date,evidence_snippets,source_notes,confidence,
    freshness,field_states,field_evidence,is_marketplace_listing,unresolved_fields
  )
  select candidate_workspace_id,uid,candidate_job_id,job.procurement_request_id,
    x.requested_item_id,x.supplier_name,x.matched_supplier_id,x.product_title,
    x.source_url,x.package_quantity,x.package_unit,x.item_price,x.currency,x.moq,
    x.shipping_cost,x.delivery_estimate_days,x.stock_status,x.coa_availability,
    x.sds_availability,x.technical_document_availability,x.first_order_discount,
    x.source_date,x.evidence_snippets,x.source_notes,x.confidence,x.freshness,
    x.field_states,x.field_evidence,x.is_marketplace_listing,x.unresolved_fields
  from jsonb_to_recordset(candidates) as x(
    requested_item_id uuid,supplier_name text,matched_supplier_id uuid,
    product_title text,source_url text,package_quantity numeric,package_unit text,
    item_price numeric,currency text,moq numeric,shipping_cost numeric,
    delivery_estimate_days integer,stock_status text,coa_availability text,
    sds_availability text,technical_document_availability text,
    first_order_discount numeric,source_date date,evidence_snippets text[],
    source_notes text,confidence text,freshness text,field_states jsonb,
    field_evidence jsonb,is_marketplace_listing boolean,unresolved_fields text[]
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

revoke all on function public.accept_procurement_offer_candidate(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.accept_procurement_offer_candidate(uuid,uuid,uuid,boolean) to authenticated;
revoke all on function public.publish_procurement_research_results(uuid,uuid,jsonb,text,text) from public,anon;
grant execute on function public.publish_procurement_research_results(uuid,uuid,jsonb,text,text) to authenticated;
