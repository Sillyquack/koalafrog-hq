begin;
-- Run with Supabase CLI test harness. Synthetic JWT claims must be supplied by the harness.
select plan(53);
select has_table('public','workspaces','workspaces exists');
select has_table('public','workspace_records','record store exists');
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
