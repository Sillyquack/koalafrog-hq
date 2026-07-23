create table public.procurement_research_jobs(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,owner_id uuid not null,
 procurement_request_id uuid not null,provider text not null,status text not null default 'queued' check(status in('queued','running','partial','completed','failed','cancelled')),
 started_at timestamptz,completed_at timestamptz,error_code text,error_details text,
 result_count integer not null default 0 check(result_count>=0),reviewed_count integer not null default 0 check(reviewed_count>=0),
 retry_of_job_id uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(workspace_id,id),
 foreign key(workspace_id,procurement_request_id) references public.procurement_requests(workspace_id,id),
 foreign key(retry_of_job_id) references public.procurement_research_jobs(id)
);
create table public.procurement_offer_candidates(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,owner_id uuid not null,
 research_job_id uuid not null,procurement_request_id uuid not null,requested_item_id uuid not null,
 supplier_name text not null,matched_supplier_id uuid,product_title text not null,source_url text not null check(source_url ~ '^https?://'),
 package_quantity numeric check(package_quantity>0),package_unit text,item_price numeric check(item_price>=0),currency text check(currency is null or length(currency)=3),
 moq numeric check(moq>0),shipping_cost numeric check(shipping_cost>=0),delivery_estimate_days integer check(delivery_estimate_days>=0),
 stock_status text not null default 'unknown' check(stock_status in('unknown','in_stock','limited','backorder','out_of_stock')),
 coa_availability text not null default 'unknown',sds_availability text not null default 'unknown',technical_document_availability text not null default 'unknown',
 first_order_discount numeric check(first_order_discount>=0),source_date date not null,evidence_snippets text[] not null default '{}',
 source_notes text not null default '',confidence text not null default 'unknown' check(confidence in('low','medium','high','unknown')),
 freshness text not null default 'unknown' check(freshness in('fresh','aging','stale','unknown')),
 field_states jsonb not null default '{}',unresolved_fields text[] not null default '{}',
 review_status text not null default 'pending' check(review_status in('pending','accepted','rejected','duplicate','merged')),
 accepted_offer_id uuid,duplicate_of_candidate_id uuid,merged_into_offer_id uuid,review_notes text not null default '',
 reviewed_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(workspace_id,id),
 foreign key(workspace_id,research_job_id) references public.procurement_research_jobs(workspace_id,id) on delete cascade,
 foreign key(workspace_id,procurement_request_id) references public.procurement_requests(workspace_id,id),
 foreign key(workspace_id,requested_item_id,procurement_request_id) references public.procurement_requested_items(workspace_id,id,procurement_request_id),
 foreign key(workspace_id,matched_supplier_id) references public.suppliers(workspace_id,id),
 foreign key(workspace_id,accepted_offer_id) references public.procurement_supplier_offers(workspace_id,id),
 foreign key(workspace_id,merged_into_offer_id) references public.procurement_supplier_offers(workspace_id,id),
 foreign key(duplicate_of_candidate_id) references public.procurement_offer_candidates(id)
);
create index procurement_jobs_request on public.procurement_research_jobs(workspace_id,procurement_request_id,created_at desc);
create index procurement_candidate_inbox on public.procurement_offer_candidates(workspace_id,procurement_request_id,review_status,created_at desc);
do $$declare t text;begin foreach t in array array['procurement_research_jobs','procurement_offer_candidates'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy owner_all on public.%I for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()) and exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=(select auth.uid()) and w.lifecycle_state=''active''))',t);
 execute format('revoke all on public.%I from anon',t);
 execute format('grant select,insert,update on public.%I to authenticated',t);
end loop;end$$;
revoke delete on public.procurement_research_jobs,public.procurement_offer_candidates from authenticated;
