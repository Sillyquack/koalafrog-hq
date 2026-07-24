begin;
-- Run with Supabase CLI test harness. Synthetic JWT claims must be supplied by the harness.
select plan(251);
select has_table('public','workspaces','workspaces exists');
select has_table('public','workspace_records','record store exists');
select has_table('public','procurement_research_jobs','Procurement jobs exist');
select has_table('public','procurement_offer_candidates','Procurement candidates exist');
select has_function('public','accept_procurement_offer_candidate',array['uuid','uuid','uuid','boolean'],'transactional candidate acceptance exists');
select has_function('public','publish_procurement_research_results',array['uuid','uuid','jsonb','text','text'],'guarded research publication exists');
select has_column('public','procurement_research_jobs','live_invocation_started_at','live invocation time exists');
select has_column('public','procurement_research_jobs','provider_invocation_count','bounded invocation count exists');
select has_function('public','begin_procurement_live_invocation',array['uuid','uuid','integer'],'atomic live invocation gate exists');
select is(has_function_privilege('authenticated','public.begin_procurement_live_invocation(uuid,uuid,integer)','EXECUTE'),false,'browser cannot consume a live invocation outside durable intent creation');
select is(has_function_privilege('anon','public.begin_procurement_live_invocation(uuid,uuid,integer)','EXECUTE'),false,'anonymous cannot request a live invocation');
select is((select prosecdef from pg_proc where oid='public.begin_procurement_live_invocation(uuid,uuid,integer)'::regprocedure),false,'live invocation gate respects RLS as security invoker');
select has_trigger('public','procurement_research_jobs','guard_procurement_live_invocation_state','managed invocation state trigger exists');
select has_table('public','procurement_provider_diagnostics','Procurement provider diagnostics exist');
select has_column('public','procurement_provider_diagnostics','provider_stage','Procurement provider stage exists');
select has_column('public','procurement_provider_diagnostics','timeout_stage','Procurement timeout stage exists');
select has_column('public','procurement_provider_diagnostics','provider_headers_at','Procurement provider header timestamp exists');
select is((select relrowsecurity from pg_class where oid='public.procurement_provider_diagnostics'::regclass),true,'Procurement diagnostics RLS is enabled');
select is(has_table_privilege('authenticated','public.procurement_provider_diagnostics','SELECT'),true,'owner role can read Procurement diagnostics');
select is(has_table_privilege('authenticated','public.procurement_provider_diagnostics','INSERT'),false,'browser cannot insert Procurement diagnostics');
select is(has_table_privilege('authenticated','public.procurement_provider_diagnostics','UPDATE'),false,'browser cannot update Procurement diagnostics');
select is(has_table_privilege('authenticated','public.procurement_provider_diagnostics','DELETE'),false,'browser cannot delete Procurement diagnostics');
select has_function('public','persist_procurement_provider_diagnostic',array['uuid','uuid','uuid','boolean','text','integer','integer','integer','integer','integer','integer','integer','text','text','integer','boolean','integer','text'],'trusted Procurement diagnostic writer exists');
select is(has_function_privilege('service_role','public.persist_procurement_provider_diagnostic(uuid,uuid,uuid,boolean,text,integer,integer,integer,integer,integer,integer,integer,text,text,integer,boolean,integer,text)','EXECUTE'),true,'service role can persist Procurement diagnostics');
select is(has_function_privilege('authenticated','public.persist_procurement_provider_diagnostic(uuid,uuid,uuid,boolean,text,integer,integer,integer,integer,integer,integer,integer,text,text,integer,boolean,integer,text)','EXECUTE'),false,'browser cannot forge Procurement diagnostics through RPC');
select is(has_function_privilege('anon','public.persist_procurement_provider_diagnostic(uuid,uuid,uuid,boolean,text,integer,integer,integer,integer,integer,integer,integer,text,text,integer,boolean,integer,text)','EXECUTE'),false,'anonymous cannot persist Procurement diagnostics');
select is(has_function_privilege('public','public.persist_procurement_provider_diagnostic(uuid,uuid,uuid,boolean,text,integer,integer,integer,integer,integer,integer,integer,text,text,integer,boolean,integer,text)','EXECUTE'),false,'public cannot persist Procurement diagnostics');
select is((select prosecdef from pg_proc where oid='public.persist_procurement_provider_diagnostic(uuid,uuid,uuid,boolean,text,integer,integer,integer,integer,integer,integer,integer,text,text,integer,boolean,integer,text)'::regprocedure),true,'Procurement diagnostic writer is security definer');
select is((select proowner::regrole::text from pg_proc where oid='public.persist_procurement_provider_diagnostic(uuid,uuid,uuid,boolean,text,integer,integer,integer,integer,integer,integer,integer,text,text,integer,boolean,integer,text)'::regprocedure),'postgres','Procurement diagnostic writer owner is postgres');
select is((select proconfig[1] from pg_proc where oid='public.persist_procurement_provider_diagnostic(uuid,uuid,uuid,boolean,text,integer,integer,integer,integer,integer,integer,integer,text,text,integer,boolean,integer,text)'::regprocedure),'search_path=pg_catalog, public, pg_temp','Procurement diagnostic writer search path is fixed');
select is(position('raw_response' in pg_get_functiondef('public.persist_procurement_provider_diagnostic(uuid,uuid,uuid,boolean,text,integer,integer,integer,integer,integer,integer,integer,text,text,integer,boolean,integer,text)'::regprocedure)),0,'Procurement diagnostic writer contract excludes raw provider output');
select has_table('public','procurement_background_operations','server-only Procurement background operations exist');
select has_table('public','procurement_background_webhook_inbox','durable Procurement webhook inbox exists');
select has_column('public','procurement_research_jobs','background_lifecycle_status','owner-safe background lifecycle state exists');
select is((select relrowsecurity from pg_class where oid='public.procurement_background_operations'::regclass),true,'background operations RLS is enabled');
select is((select relrowsecurity from pg_class where oid='public.procurement_background_webhook_inbox'::regclass),true,'webhook inbox RLS is enabled');
select is(has_table_privilege('authenticated','public.procurement_background_operations','SELECT'),false,'browser cannot read provider operation ids');
select is(has_table_privilege('authenticated','public.procurement_background_operations','INSERT'),false,'browser cannot attach provider operations');
select is(has_table_privilege('authenticated','public.procurement_background_operations','UPDATE'),false,'browser cannot finalize provider operations');
select is(has_table_privilege('authenticated','public.procurement_background_webhook_inbox','SELECT'),false,'browser cannot read webhook event or response ids');
select is(has_table_privilege('authenticated','public.procurement_background_webhook_inbox','INSERT'),false,'browser cannot forge webhook events');
select is(position('raw_body' in (select string_agg(column_name,',') from information_schema.columns where table_schema='public' and table_name='procurement_background_webhook_inbox')),0,'webhook inbox cannot persist raw body');
select has_function('public','begin_procurement_background_submission',array['uuid','uuid','uuid','integer'],'durable submission intent gate exists');
select has_function('public','attach_procurement_background_operation',array['uuid','uuid','text','text'],'idempotent operation attachment exists');
select has_function('public','store_procurement_background_webhook',array['text','text','text'],'durable webhook intake exists');
select has_function('public','claim_procurement_background_operation',array['uuid','uuid','text','integer'],'lease claim exists');
select has_function('public','reschedule_procurement_background_operation',array['uuid','uuid','text','integer','boolean'],'durable reconciliation backoff exists');
select has_function('public','finalize_procurement_background_operation',array['uuid','uuid','text','text','jsonb','boolean','text','text','text'],'atomic background finalizer exists');
select is(has_function_privilege('service_role','public.begin_procurement_background_submission(uuid,uuid,uuid,integer)','EXECUTE'),true,'service role may create durable submission intent');
select is(has_function_privilege('authenticated','public.begin_procurement_background_submission(uuid,uuid,uuid,integer)','EXECUTE'),false,'browser cannot create or inspect internal submission intent');
select is(has_function_privilege('service_role','public.attach_procurement_background_operation(uuid,uuid,text,text)','EXECUTE'),true,'service role may attach provider operation');
select is(has_function_privilege('authenticated','public.attach_procurement_background_operation(uuid,uuid,text,text)','EXECUTE'),false,'browser cannot attach provider operation through RPC');
select is(has_function_privilege('service_role','public.store_procurement_background_webhook(text,text,text)','EXECUTE'),true,'service role may durably store verified webhook metadata');
select is(has_function_privilege('authenticated','public.store_procurement_background_webhook(text,text,text)','EXECUTE'),false,'browser cannot forge a verified webhook');
select is(has_function_privilege('service_role','public.finalize_procurement_background_operation(uuid,uuid,text,text,jsonb,boolean,text,text,text)','EXECUTE'),true,'service role may finalize provider operation');
select is(has_function_privilege('authenticated','public.finalize_procurement_background_operation(uuid,uuid,text,text,jsonb,boolean,text,text,text)','EXECUTE'),false,'browser cannot publish background results through RPC');
select is((select prosecdef from pg_proc where oid='public.finalize_procurement_background_operation(uuid,uuid,text,text,jsonb,boolean,text,text,text)'::regprocedure),true,'background finalizer is security definer');
select is((select proconfig[1] from pg_proc where oid='public.finalize_procurement_background_operation(uuid,uuid,text,text,jsonb,boolean,text,text,text)'::regprocedure),'search_path=pg_catalog, public, pg_temp','background finalizer search path is fixed');
select is((select proconfig[1] from pg_proc where oid='public.begin_procurement_background_submission(uuid,uuid,uuid,integer)'::regprocedure),'search_path=pg_catalog, public, pg_temp','submission intent search path is fixed');
select is((select proconfig[1] from pg_proc where oid='public.store_procurement_background_webhook(text,text,text)'::regprocedure),'search_path=pg_catalog, public, pg_temp','webhook intake search path is fixed');
select is(
  has_table_privilege(role_name,table_name,privilege_name),
  role_name='service_role' and privilege_name='SELECT',
  format('%s %s privilege on %s matches the RPC-only boundary',role_name,privilege_name,table_name)
)
from unnest(array['anon','authenticated','service_role']) as role_name
cross join unnest(array[
  'public.procurement_background_operations',
  'public.procurement_background_webhook_inbox'
]) as table_name
cross join unnest(array[
  'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
]) as privilege_name;
select is(
  has_function_privilege(role_name,function_signature,'EXECUTE'),
  role_name='service_role',
  format('%s lifecycle RPC access to %s matches the service-only boundary',role_name,function_signature)
)
from unnest(array['anon','authenticated','service_role']) as role_name
cross join unnest(array[
  'public.begin_procurement_background_submission(uuid,uuid,uuid,integer)',
  'public.start_procurement_background_submission(uuid)',
  'public.attach_procurement_background_operation(uuid,uuid,text,text)',
  'public.mark_procurement_background_submission_ambiguous(uuid,text)',
  'public.acknowledge_procurement_background_submission(uuid)',
  'public.store_procurement_background_webhook(text,text,text)',
  'public.claim_procurement_background_operation(uuid,uuid,text,integer)',
  'public.reschedule_procurement_background_operation(uuid,uuid,text,integer,boolean)',
  'public.finalize_procurement_background_operation(uuid,uuid,text,text,jsonb,boolean,text,text,text)',
  'public.mark_procurement_background_webhook_retry(text,text,integer)',
  'public.expire_procurement_unmatched_webhooks(integer)'
]) as function_signature;
select is(
  (select proconfig[1] from pg_proc where oid=function_signature::regprocedure),
  'search_path=pg_catalog, public, pg_temp',
  format('%s retains a fixed search path',function_signature)
)
from unnest(array[
  'public.begin_procurement_background_submission(uuid,uuid,uuid,integer)',
  'public.start_procurement_background_submission(uuid)',
  'public.attach_procurement_background_operation(uuid,uuid,text,text)',
  'public.mark_procurement_background_submission_ambiguous(uuid,text)',
  'public.acknowledge_procurement_background_submission(uuid)',
  'public.store_procurement_background_webhook(text,text,text)',
  'public.claim_procurement_background_operation(uuid,uuid,text,integer)',
  'public.reschedule_procurement_background_operation(uuid,uuid,text,integer,boolean)',
  'public.finalize_procurement_background_operation(uuid,uuid,text,text,jsonb,boolean,text,text,text)',
  'public.mark_procurement_background_webhook_retry(text,text,integer)',
  'public.expire_procurement_unmatched_webhooks(integer)'
]) as function_signature;
select is(
  (
    select count(*)
    from information_schema.columns
    where table_schema='public'
      and table_name in (select table_name from information_schema.views where table_schema='public')
      and column_name in ('provider_operation_id','event_id','client_request_id','lease_owner')
  ),
  0::bigint,
  'owner-facing public views expose no internal lifecycle identifiers'
);
select has_index(
  'public','procurement_background_webhook_inbox',
  'procurement_webhook_unmatched_expiry',
  'unmatched webhook expiry work has a partial due index'
);
select has_function(
  'public','expire_procurement_unmatched_webhooks',array['integer'],
  'bounded unmatched webhook expiry RPC exists'
);
select is(
  has_function_privilege(
    'service_role',
    'public.expire_procurement_unmatched_webhooks(integer)',
    'EXECUTE'
  ),
  true,
  'service role may run bounded unmatched webhook expiry'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.expire_procurement_unmatched_webhooks(integer)',
    'EXECUTE'
  ),
  false,
  'browser cannot expire unmatched webhook metadata'
);
select is(
  has_function_privilege(
    'anon',
    'public.expire_procurement_unmatched_webhooks(integer)',
    'EXECUTE'
  ),
  false,
  'anonymous cannot expire unmatched webhook metadata'
);
select is(
  has_function_privilege(
    'public',
    'public.expire_procurement_unmatched_webhooks(integer)',
    'EXECUTE'
  ),
  false,
  'public cannot expire unmatched webhook metadata'
);
select is(
  (
    select prosecdef
    from pg_proc
    where oid='public.expire_procurement_unmatched_webhooks(integer)'::regprocedure
  ),
  true,
  'unmatched webhook expiry is security definer'
);
select is(
  (
    select proconfig[1]
    from pg_proc
    where oid='public.expire_procurement_unmatched_webhooks(integer)'::regprocedure
  ),
  'search_path=pg_catalog, public, pg_temp',
  'unmatched webhook expiry search path is fixed'
);
select has_trigger(
  'public','procurement_background_webhook_inbox',
  'guard_procurement_webhook_terminal_state',
  'terminal webhook inbox states have a monotonic transition guard'
);
select throws_ok(
  'select public.expire_procurement_unmatched_webhooks(0)',
  'P0001',
  'BACKGROUND_WEBHOOK_BATCH_INVALID',
  'unmatched webhook expiry rejects an empty batch'
);
select throws_ok(
  'select public.expire_procurement_unmatched_webhooks(101)',
  'P0001',
  'BACKGROUND_WEBHOOK_BATCH_INVALID',
  'unmatched webhook expiry rejects an unbounded batch'
);
insert into public.procurement_background_webhook_inbox(
  event_id,provider_operation_id,terminal_event_type,received_at,
  signature_verified_at,processing_state,next_attempt_at
) values
  (
    'evt_pgtap_expired_a','resp_pgtap_expired_a','response.completed',
    clock_timestamp()-interval '16 minutes',clock_timestamp()-interval '16 minutes',
    'unmatched_pending',clock_timestamp()-interval '16 minutes'
  ),
  (
    'evt_pgtap_expired_b','resp_pgtap_expired_b','response.failed',
    clock_timestamp()-interval '16 minutes',clock_timestamp()-interval '16 minutes',
    'unmatched_pending',clock_timestamp()-interval '16 minutes'
  ),
  (
    'evt_pgtap_fresh','resp_pgtap_fresh','response.completed',
    clock_timestamp(),clock_timestamp(),'unmatched_pending',clock_timestamp()
  );
select is(
  public.expire_procurement_unmatched_webhooks(1),
  1,
  'unmatched webhook expiry respects its batch limit'
);
select is(
  (
    select count(*)::integer
    from public.procurement_background_webhook_inbox
    where event_id like 'evt_pgtap_expired_%'
      and processing_state='permanently_rejected'
  ),
  1,
  'only one expired webhook terminalizes in the first bounded batch'
);
select is(
  (
    select processing_state
    from public.procurement_background_webhook_inbox
    where event_id='evt_pgtap_fresh'
  ),
  'unmatched_pending',
  'an unmatched webhook inside the grace period remains pending'
);
select is(
  public.expire_procurement_unmatched_webhooks(25),
  1,
  'the remaining expired webhook terminalizes on the next sweep'
);
select is(
  public.expire_procurement_unmatched_webhooks(25),
  0,
  'repeated unmatched webhook expiry is idempotent'
);
select is(
  (
    select count(*)::integer
    from public.procurement_background_webhook_inbox
    where event_id like 'evt_pgtap_expired_%'
      and processing_state='permanently_rejected'
      and last_safe_error_code='UNMATCHED_WEBHOOK_EXPIRED'
      and processed_at is not null
  ),
  2,
  'expired webhook rows retain only the safe terminal reason'
);
update public.procurement_background_webhook_inbox
set processing_state='received'
where event_id like 'evt_pgtap_expired_%';
select is(
  (
    select count(*)::integer
    from public.procurement_background_webhook_inbox
    where event_id like 'evt_pgtap_expired_%'
      and processing_state='permanently_rejected'
  ),
  2,
  'terminal webhook rows cannot reopen'
);
select is(
  public.store_procurement_background_webhook(
    'evt_pgtap_expired_a','resp_pgtap_expired_a','response.completed'
  ),
  'duplicate',
  'replay after expiry remains idempotent'
);
select is(
  (
    select processing_state
    from public.procurement_background_webhook_inbox
    where event_id='evt_pgtap_expired_a'
  ),
  'permanently_rejected',
  'replay after expiry does not reopen the terminal row'
);
select throws_ok(
  $sql$
    select public.store_procurement_background_webhook(
      'evt_pgtap_unsupported','resp_pgtap_unsupported','response.created'
    )
  $sql$,
  'P0001',
  'BACKGROUND_WEBHOOK_INVALID',
  'unsupported webhook events remain rejected'
);
select is(
  (
    select count(*)::integer
    from public.procurement_background_operations
    where provider_operation_id like 'resp_pgtap_%'
  ),
  0,
  'unmatched expiry creates no provider operation'
);
insert into auth.users(id,email,created_at,updated_at)
values(
  '10000000-0000-4000-8000-000000000001',
  'webhook-lifecycle-pgtap@example.invalid',
  clock_timestamp(),clock_timestamp()
);
insert into public.workspaces(id,owner_id,name,lifecycle_state)
values(
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Webhook lifecycle pgTAP','active'
);
insert into public.procurement_requests(
  id,workspace_id,owner_id,title
) values
  (
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Webhook lifecycle pgTAP fresh'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Webhook lifecycle pgTAP expired'
  );
insert into public.procurement_research_jobs(
  id,workspace_id,owner_id,procurement_request_id,provider,status,started_at
) values
  (
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    'openai-web-search-v1','running',clock_timestamp()
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'openai-web-search-v1','running',clock_timestamp()
  );
insert into public.procurement_background_operations(
  attempt_id,job_id,workspace_id,owner_id,provider,submission_state
) values
  (
    '50000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'openai-web-search-v1','submitting'
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'openai-web-search-v1','submitting'
  );
insert into public.procurement_background_webhook_inbox(
  event_id,provider_operation_id,terminal_event_type,received_at,
  signature_verified_at,processing_state,next_attempt_at
) values
  (
    'evt_pgtap_attach_fresh','resp_pgtap_attach_fresh','response.completed',
    clock_timestamp(),clock_timestamp(),'unmatched_pending',clock_timestamp()
  ),
  (
    'evt_pgtap_attach_expired','resp_pgtap_attach_expired','response.completed',
    clock_timestamp()-interval '15 minutes',clock_timestamp()-interval '15 minutes',
    'unmatched_pending',clock_timestamp()-interval '15 minutes'
  );
select is(
  public.attach_procurement_background_operation(
    '50000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'resp_pgtap_attach_fresh','in_progress'
  ),
  'attached',
  'exact attachment inside the grace period succeeds'
);
select is(
  (
    select processing_state
    from public.procurement_background_webhook_inbox
    where event_id='evt_pgtap_attach_fresh'
  ),
  'received',
  'exact attachment inside the grace period activates the early event'
);
select is(
  public.attach_procurement_background_operation(
    '50000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'resp_pgtap_attach_expired','in_progress'
  ),
  'attached',
  'provider attachment remains available at the webhook expiry boundary'
);
select is(
  (
    select processing_state
    from public.procurement_background_webhook_inbox
    where event_id='evt_pgtap_attach_expired'
  ),
  'permanently_rejected',
  'attachment at the expiry boundary does not reopen the old event'
);
select is(
  (
    select last_safe_error_code
    from public.procurement_background_webhook_inbox
    where event_id='evt_pgtap_attach_expired'
  ),
  'UNMATCHED_WEBHOOK_EXPIRED',
  'late exact attachment records only the safe terminal reason'
);
select is(
  public.attach_procurement_background_operation(
    '50000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'resp_pgtap_attach_expired','in_progress'
  ),
  'duplicate',
  'duplicate exact attachment remains idempotent'
);
select throws_ok(
  $sql$
    select public.attach_procurement_background_operation(
      '50000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'resp_pgtap_attachment_conflict','queued'
    )
  $sql$,
  'P0001',
  'BACKGROUND_OPERATION_CONFLICT',
  'an intent cannot attach a conflicting provider operation'
);
select throws_ok(
  $sql$
    select public.attach_procurement_background_operation(
      '50000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000099',
      'resp_pgtap_attach_fresh','queued'
    )
  $sql$,
  'P0001',
  'BACKGROUND_OPERATION_UNAVAILABLE',
  'attachment cannot cross owner or workspace boundaries'
);
select is(
  (
    select count(*)::integer
    from public.procurement_offer_candidates
    where research_job_id in(
      '40000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002'
    )
  ),
  0,
  'early or expired attachment publishes no candidate'
);
set local role service_role;
select lives_ok(
  'select attempt_id from public.procurement_background_operations limit 0',
  'service role may directly read background operations'
);
select lives_ok(
  'select event_id from public.procurement_background_webhook_inbox limit 0',
  'service role may directly read webhook metadata'
);
select throws_ok(
  'insert into public.procurement_background_operations default values',
  '42501',
  'permission denied for table procurement_background_operations',
  'service role cannot directly insert background operations'
);
select throws_ok(
  'update public.procurement_background_operations set updated_at=clock_timestamp() where false',
  '42501',
  'permission denied for table procurement_background_operations',
  'service role cannot directly update background operations'
);
select throws_ok(
  'delete from public.procurement_background_operations where false',
  '42501',
  'permission denied for table procurement_background_operations',
  'service role cannot directly delete background operations'
);
select throws_ok(
  'truncate table public.procurement_background_operations',
  '42501',
  'permission denied for table procurement_background_operations',
  'service role cannot truncate background operations'
);
select throws_ok(
  'insert into public.procurement_background_webhook_inbox default values',
  '42501',
  'permission denied for table procurement_background_webhook_inbox',
  'service role cannot directly insert webhook metadata'
);
select throws_ok(
  'update public.procurement_background_webhook_inbox set updated_at=clock_timestamp() where false',
  '42501',
  'permission denied for table procurement_background_webhook_inbox',
  'service role cannot directly update webhook metadata'
);
select throws_ok(
  'delete from public.procurement_background_webhook_inbox where false',
  '42501',
  'permission denied for table procurement_background_webhook_inbox',
  'service role cannot directly delete webhook metadata'
);
select throws_ok(
  'truncate table public.procurement_background_webhook_inbox',
  '42501',
  'permission denied for table procurement_background_webhook_inbox',
  'service role cannot truncate webhook metadata'
);
reset role;
select is(has_function_privilege('authenticated','public.accept_procurement_offer_candidate(uuid,uuid,uuid,boolean)','EXECUTE'),true,'authenticated owner may accept a candidate');
select is(has_function_privilege('anon','public.accept_procurement_offer_candidate(uuid,uuid,uuid,boolean)','EXECUTE'),false,'anonymous cannot accept a candidate');
select is((select prosecdef from pg_proc where oid='public.accept_procurement_offer_candidate(uuid,uuid,uuid,boolean)'::regprocedure),false,'candidate acceptance respects RLS as security invoker');
select matches((select pg_get_expr(indpred,indrelid) from pg_index where indexrelid='public.procurement_one_active_provider_job'::regclass),'queued.*running','only queued and running jobs are active');
select is((select relrowsecurity from pg_class where oid='public.workspace_records'::regclass),true,'record store RLS is enabled');
select is((select public from storage.buckets where id='compliance-documents'),false,'document bucket is private');
select has_table('public','intelligence_threads','intelligence threads exist');
select has_table('public','intelligence_runs','intelligence runs exist');
select is((select relrowsecurity from pg_class where oid='public.intelligence_threads'::regclass),true,'intelligence thread RLS is enabled');
select is((select relrowsecurity from pg_class where oid='public.intelligence_runs'::regclass),true,'intelligence run RLS is enabled');
select has_table('public','intelligence_analyses','intelligence analyses exist');
select has_table('public','intelligence_analysis_inputs','intelligence inputs exist');
select has_table('public','intelligence_observations','intelligence observations exist');
select has_table('public','intelligence_recommendations','intelligence recommendations exist');
select is((select relrowsecurity from pg_class where oid='public.intelligence_analyses'::regclass),true,'intelligence analysis RLS is enabled');
select is((select relrowsecurity from pg_class where oid='public.intelligence_analysis_inputs'::regclass),true,'intelligence input RLS is enabled');
select is((select relrowsecurity from pg_class where oid='public.intelligence_observations'::regclass),true,'intelligence observation RLS is enabled');
select is((select relrowsecurity from pg_class where oid='public.intelligence_recommendations'::regclass),true,'intelligence recommendation RLS is enabled');
select is((select public from storage.buckets where id='beard-analysis-images'),false,'beard analysis image bucket is private');
select is(has_table_privilege('authenticated','public.intelligence_analyses','DELETE'),false,'authenticated cannot delete intelligence analyses');
select is(has_column_privilege('authenticated','public.intelligence_analyses','profile_id','UPDATE'),false,'authenticated cannot rewrite analysis identity');
select is(has_column_privilege('authenticated','public.intelligence_recommendations','review_status','UPDATE'),true,'authenticated may review recommendations');
select has_column('public','intelligence_analyses','provider_attempted_at','analysis attempt timestamp exists');
select has_column('public','intelligence_analyses','provider_attempt_count','analysis attempt counter exists');
select has_column('public','intelligence_analyses','semantic_rule_version','semantic rule provenance exists');
select has_column('public','intelligence_analyses','failure_stage','failure stage exists');
select has_column('public','intelligence_analyses','failure_rule_code','failure rule code exists');
select has_column('public','intelligence_analyses','failure_json_path','safe failure path exists');
select has_column('public','intelligence_analyses','failure_validator','failure validator exists');
select has_column('public','intelligence_analyses','failure_expected_category','failure expected category exists');
select has_column('public','intelligence_analyses','failure_received_category','failure received category exists');
select has_column('public','intelligence_analyses','failure_schema_version','failure schema version exists');
select has_column('public','intelligence_analyses','failure_trace_version','failure trace version exists');
select has_column('public','intelligence_analyses','provider_stage','provider stage exists');
select has_column('public','intelligence_analyses','provider_failure_classification','provider failure classification exists');
select has_column('public','intelligence_analyses','provider_timeout_budget_ms','provider timeout budget exists');
select has_column('public','intelligence_analyses','provider_response_headers_received','provider headers flag exists');
select is(has_column_privilege('authenticated','public.intelligence_analyses','provider_stage','UPDATE'),false,'browser cannot update provider trace');
select is(has_column_privilege('authenticated','public.intelligence_analyses','failure_stage','INSERT'),false,'browser cannot insert failure diagnostics');
select is(has_column_privilege('authenticated','public.intelligence_analyses','failure_stage','UPDATE'),false,'browser cannot update failure diagnostics');
select is(has_column_privilege('authenticated','public.intelligence_analyses','provider_name','UPDATE'),false,'authenticated cannot directly rewrite provider provenance');
select is(has_column_privilege('authenticated','public.intelligence_analyses','model_name','INSERT'),false,'authenticated cannot insert model provenance');
select has_function('public','begin_beard_provider_attempt',array['uuid','uuid','text','text','text'],'atomic provider attempt function exists');
select has_function('public','lookup_beard_analysis_support_diagnostic',array['uuid','text'],'owner-safe support lookup exists');
select is(has_function_privilege('authenticated','public.lookup_beard_analysis_support_diagnostic(uuid,text)','EXECUTE'),true,'authenticated owner may execute safe support lookup');
select is(has_function_privilege('anon','public.lookup_beard_analysis_support_diagnostic(uuid,text)','EXECUTE'),false,'anonymous cannot execute support lookup');
select is(has_function_privilege('public','public.lookup_beard_analysis_support_diagnostic(uuid,text)','EXECUTE'),false,'public cannot execute support lookup');
select is(has_function_privilege('service_role','public.lookup_beard_analysis_support_diagnostic(uuid,text)','EXECUTE'),false,'service role lookup is not browser-facing infrastructure');
select matches(
  pg_get_constraintdef((select oid from pg_constraint where conname='intelligence_analyses_semantic_rule_version_check')),
  'beard-semantic-safety-v2',
  'semantic constraint retains v2'
);
select matches(
  pg_get_constraintdef((select oid from pg_constraint where conname='intelligence_analyses_semantic_rule_version_check')),
  'beard-semantic-safety-v3',
  'semantic constraint retains v3'
);
select matches(
  pg_get_constraintdef((select oid from pg_constraint where conname='intelligence_analyses_semantic_rule_version_check')),
  'beard-semantic-safety-v4',
  'semantic constraint admits v4'
);
select matches(
  pg_get_constraintdef((select oid from pg_constraint where conname='intelligence_analyses_failure_validator_check')),
  'beard-semantic-safety-v4',
  'failure validator constraint admits v4'
);
select matches(
  pg_get_functiondef('public.begin_beard_provider_attempt(uuid,uuid,text,text,text)'::regprocedure),
  'semantic_rule_version=''beard-semantic-safety-v4''',
  'provider attempt records semantic v4'
);
select matches(
  pg_get_functiondef('public.persist_beard_analysis_result(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)'::regprocedure),
  'semantic_rule_version=''beard-semantic-safety-v4''',
  'persistence requires semantic v4'
);
select is(
  (select prosecdef from pg_proc where oid='public.begin_beard_provider_attempt(uuid,uuid,text,text,text)'::regprocedure),
  true,
  'provider attempt remains security definer'
);
select is(
  (select prosecdef from pg_proc where oid='public.persist_beard_analysis_result(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)'::regprocedure),
  true,
  'persistence remains security definer'
);
select is(
  (select prosecdef from pg_proc where oid='public.lookup_beard_analysis_support_diagnostic(uuid,text)'::regprocedure),
  true,
  'support lookup remains security definer'
);
select is(
  (select proowner::regrole::text from pg_proc where oid='public.lookup_beard_analysis_support_diagnostic(uuid,text)'::regprocedure),
  'postgres',
  'support lookup owner remains postgres'
);
select is(
  (select proconfig[1] from pg_proc where oid='public.lookup_beard_analysis_support_diagnostic(uuid,text)'::regprocedure),
  'search_path=pg_catalog, public, pg_temp',
  'support lookup search path remains fixed'
);
select is(
  (select proowner::regrole::text from pg_proc where oid='public.begin_beard_provider_attempt(uuid,uuid,text,text,text)'::regprocedure),
  'postgres',
  'provider attempt owner remains postgres'
);
select is(
  (select proowner::regrole::text from pg_proc where oid='public.persist_beard_analysis_result(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)'::regprocedure),
  'postgres',
  'persistence owner remains postgres'
);
select is(
  (select proconfig[1] from pg_proc where oid='public.begin_beard_provider_attempt(uuid,uuid,text,text,text)'::regprocedure),
  'search_path=pg_catalog, public, pg_temp',
  'provider attempt search path remains fixed'
);
select is(
  (select proconfig[1] from pg_proc where oid='public.persist_beard_analysis_result(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)'::regprocedure),
  'search_path=pg_catalog, public, pg_temp',
  'persistence search path remains fixed'
);
select * from finish();
rollback;
