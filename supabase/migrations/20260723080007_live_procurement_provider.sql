alter table public.procurement_research_jobs
 add column provider_request_id text,
 add column correlation_id uuid not null default gen_random_uuid(),
 add column attempt_count integer not null default 0 check(attempt_count between 0 and 5);
create unique index procurement_one_active_provider_job
 on public.procurement_research_jobs(workspace_id,procurement_request_id,provider)
 where status in('queued','running','partial');
alter table public.procurement_offer_candidates
 add column is_marketplace_listing boolean not null default false,
 add column field_evidence jsonb not null default '{}';
alter table public.procurement_offer_candidates
 drop constraint procurement_offer_candidates_freshness_check,
 add constraint procurement_offer_candidates_freshness_check check(freshness in('fresh','aging','stale','unknown')),
 add constraint procurement_offer_candidates_field_states_check check(
   not jsonb_path_exists(field_states,'$.* ? (@ != "unknown" && @ != "inferred" && @ != "reported" && @ != "verified")')
 );
