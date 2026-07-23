begin;
-- Run with Supabase CLI test harness. Synthetic JWT claims must be supplied by the harness.
select plan(106);
select has_table('public','workspaces','workspaces exists');
select has_table('public','workspace_records','record store exists');
select has_table('public','procurement_research_jobs','Procurement jobs exist');
select has_table('public','procurement_offer_candidates','Procurement candidates exist');
select has_function('public','accept_procurement_offer_candidate',array['uuid','uuid','uuid','boolean'],'transactional candidate acceptance exists');
select has_function('public','publish_procurement_research_results',array['uuid','uuid','jsonb','text','text'],'guarded research publication exists');
select has_column('public','procurement_research_jobs','live_invocation_started_at','live invocation time exists');
select has_column('public','procurement_research_jobs','provider_invocation_count','bounded invocation count exists');
select has_function('public','begin_procurement_live_invocation',array['uuid','uuid','integer'],'atomic live invocation gate exists');
select is(has_function_privilege('authenticated','public.begin_procurement_live_invocation(uuid,uuid,integer)','EXECUTE'),true,'authenticated owner may request a live invocation');
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
select is((select relrowsecurity from pg_class where oid='public.procurement_background_operations'::regclass),true,'background operations RLS is enabled');
select is(has_table_privilege('authenticated','public.procurement_background_operations','SELECT'),false,'browser cannot read provider operation ids');
select is(has_table_privilege('authenticated','public.procurement_background_operations','INSERT'),false,'browser cannot attach provider operations');
select is(has_table_privilege('authenticated','public.procurement_background_operations','UPDATE'),false,'browser cannot finalize provider operations');
select has_function('public','attach_procurement_background_operation',array['uuid','uuid','uuid','text','text'],'service-only operation attachment exists');
select has_function('public','finalize_procurement_background_operation',array['text','text','text','jsonb','boolean','text','text'],'atomic background finalizer exists');
select is(has_function_privilege('service_role','public.attach_procurement_background_operation(uuid,uuid,uuid,text,text)','EXECUTE'),true,'service role may attach provider operation');
select is(has_function_privilege('authenticated','public.attach_procurement_background_operation(uuid,uuid,uuid,text,text)','EXECUTE'),false,'browser cannot attach provider operation through RPC');
select is(has_function_privilege('service_role','public.finalize_procurement_background_operation(text,text,text,jsonb,boolean,text,text)','EXECUTE'),true,'service role may finalize provider operation');
select is(has_function_privilege('authenticated','public.finalize_procurement_background_operation(text,text,text,jsonb,boolean,text,text)','EXECUTE'),false,'browser cannot publish background results through RPC');
select is((select proconfig[1] from pg_proc where oid='public.finalize_procurement_background_operation(text,text,text,jsonb,boolean,text,text)'::regprocedure),'search_path=pg_catalog, public, pg_temp','background finalizer search path is fixed');
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
