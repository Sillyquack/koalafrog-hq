begin;
select plan(77);

select has_table('public','recall_readiness_cases','cases exist');
select has_table('public','recall_readiness_case_sequences','case sequence exists');
select has_table('public','recall_readiness_case_revisions','revisions exist');
select has_table('public','recall_readiness_scope_snapshots','scope snapshots exist');
select has_table('public','recall_readiness_affected_goods','affected goods exist');
select has_table('public','recall_readiness_inventory_impacts','inventory impacts exist');
select has_table('public','recall_readiness_gaps','gaps exist');
select has_table('public','recall_readiness_evidence','evidence exists');
select has_table('public','recall_readiness_reviews','reviews exist');
select has_table('public','recall_readiness_approvals','approvals exist');
select has_table('public','recall_readiness_events','events exist');

select has_function('public','create_recall_readiness_case_v1',array['text','text','text','timestamp with time zone','text','text','boolean','uuid']);
select has_function('public','create_recall_readiness_revision_v1',array['uuid','integer','text','text','text','boolean','text','text','text','text','boolean','boolean','text','uuid']);
select has_function('public','register_recall_readiness_evidence_v1',array['uuid','uuid','text','text','text','text','text','text','jsonb','uuid']);
select has_function('public','generate_recall_readiness_scope_v1',array['uuid','uuid','text','uuid','integer']);
select has_function('public','get_recall_readiness_decision_readiness_v1',array['uuid','uuid']);
select has_function('public','submit_recall_readiness_review_v1',array['uuid','uuid','text','text','text','text','jsonb','uuid']);
select has_function('public','approve_recall_readiness_revision_v1',array['uuid','uuid','text','text','boolean','boolean','integer','uuid']);
select has_function('public','get_recall_readiness_case_v1',array['uuid']);
select has_function('public','list_recall_readiness_cases_v1',array['jsonb','integer','integer']);
select has_function('public','compare_recall_scope_to_live_inventory_v1',array['uuid']);
select has_function('public','compare_recall_readiness_revisions_v1',array['uuid','uuid']);
select has_function('public','close_recall_readiness_case_v1',array['uuid','integer','text','text','uuid']);

select function_returns('public','create_recall_readiness_case_v1',array['text','text','text','timestamp with time zone','text','text','boolean','uuid'],'jsonb');
select function_returns('public','create_recall_readiness_revision_v1',array['uuid','integer','text','text','text','boolean','text','text','text','text','boolean','boolean','text','uuid'],'jsonb');
select function_returns('public','generate_recall_readiness_scope_v1',array['uuid','uuid','text','uuid','integer'],'jsonb');
select function_returns('public','get_recall_readiness_decision_readiness_v1',array['uuid','uuid'],'jsonb');
select function_returns('public','approve_recall_readiness_revision_v1',array['uuid','uuid','text','text','boolean','boolean','integer','uuid'],'jsonb');
select function_returns('public','get_recall_readiness_case_v1',array['uuid'],'jsonb');
select function_returns('public','list_recall_readiness_cases_v1',array['jsonb','integer','integer'],'jsonb');
select function_returns('public','compare_recall_scope_to_live_inventory_v1',array['uuid'],'jsonb');
select function_returns('public','compare_recall_readiness_revisions_v1',array['uuid','uuid'],'jsonb');

select function_privs_are('public','create_recall_readiness_case_v1',array['text','text','text','timestamp with time zone','text','text','boolean','uuid'],'authenticated',array['EXECUTE']);
select function_privs_are('public','create_recall_readiness_revision_v1',array['uuid','integer','text','text','text','boolean','text','text','text','text','boolean','boolean','text','uuid'],'authenticated',array['EXECUTE']);
select function_privs_are('public','generate_recall_readiness_scope_v1',array['uuid','uuid','text','uuid','integer'],'authenticated',array['EXECUTE']);
select function_privs_are('public','get_recall_readiness_decision_readiness_v1',array['uuid','uuid'],'authenticated',array['EXECUTE']);
select function_privs_are('public','approve_recall_readiness_revision_v1',array['uuid','uuid','text','text','boolean','boolean','integer','uuid'],'authenticated',array['EXECUTE']);
select function_privs_are('public','get_recall_readiness_case_v1',array['uuid'],'authenticated',array['EXECUTE']);
select function_privs_are('public','list_recall_readiness_cases_v1',array['jsonb','integer','integer'],'authenticated',array['EXECUTE']);
select function_privs_are('public','compare_recall_scope_to_live_inventory_v1',array['uuid'],'authenticated',array['EXECUTE']);
select function_privs_are('public','compare_recall_readiness_revisions_v1',array['uuid','uuid'],'authenticated',array['EXECUTE']);

select function_privs_are('public','create_recall_readiness_case_v1',array['text','text','text','timestamp with time zone','text','text','boolean','uuid'],'anon',array[]::text[]);
select function_privs_are('public','create_recall_readiness_revision_v1',array['uuid','integer','text','text','text','boolean','text','text','text','text','boolean','boolean','text','uuid'],'anon',array[]::text[]);
select function_privs_are('public','generate_recall_readiness_scope_v1',array['uuid','uuid','text','uuid','integer'],'anon',array[]::text[]);
select function_privs_are('public','get_recall_readiness_decision_readiness_v1',array['uuid','uuid'],'anon',array[]::text[]);
select function_privs_are('public','approve_recall_readiness_revision_v1',array['uuid','uuid','text','text','boolean','boolean','integer','uuid'],'anon',array[]::text[]);
select function_privs_are('public','get_recall_readiness_case_v1',array['uuid'],'anon',array[]::text[]);
select function_privs_are('public','list_recall_readiness_cases_v1',array['jsonb','integer','integer'],'anon',array[]::text[]);
select function_privs_are('public','compare_recall_scope_to_live_inventory_v1',array['uuid'],'anon',array[]::text[]);
select function_privs_are('public','compare_recall_readiness_revisions_v1',array['uuid','uuid'],'anon',array[]::text[]);
select function_privs_are('public','kf_recall_workspace_v1',array[]::text[],'anon',array[]::text[]);
select function_privs_are('public','kf_recall_workspace_v1',array[]::text[],'authenticated',array[]::text[]);
select function_privs_are('public','kf_recall_validate_identity_v1',array['uuid','text','text'],'anon',array[]::text[]);
select function_privs_are('public','kf_recall_validate_identity_v1',array['uuid','text','text'],'authenticated',array[]::text[]);

select table_privs_are('public','recall_readiness_cases','authenticated',array[]::text[]);
select table_privs_are('public','recall_readiness_case_revisions','authenticated',array[]::text[]);
select table_privs_are('public','recall_readiness_scope_snapshots','authenticated',array[]::text[]);
select table_privs_are('public','recall_readiness_affected_goods','authenticated',array[]::text[]);
select table_privs_are('public','recall_readiness_inventory_impacts','authenticated',array[]::text[]);
select table_privs_are('public','recall_readiness_evidence','authenticated',array[]::text[]);
select table_privs_are('public','recall_readiness_reviews','authenticated',array[]::text[]);
select table_privs_are('public','recall_readiness_approvals','authenticated',array[]::text[]);
select table_privs_are('public','recall_readiness_events','authenticated',array[]::text[]);

select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='recall_readiness_cases'),'cases RLS enabled');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='recall_readiness_case_revisions'),'revisions RLS enabled');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='recall_readiness_scope_snapshots'),'scopes RLS enabled');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='recall_readiness_affected_goods'),'affected goods RLS enabled');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='recall_readiness_inventory_impacts'),'impacts RLS enabled');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='recall_readiness_evidence'),'evidence RLS enabled');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='recall_readiness_reviews'),'reviews RLS enabled');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='recall_readiness_approvals'),'approvals RLS enabled');
select ok((select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='recall_readiness_events'),'events RLS enabled');

select has_index('public','recall_readiness_cases','recall_readiness_cases_list_idx','case list index exists');
select has_index('public','recall_readiness_case_revisions','recall_readiness_revisions_case_idx','revision list index exists');
select has_index('public','recall_readiness_affected_goods','recall_readiness_affected_scope_idx','affected scope index exists');
select has_index('public','recall_readiness_inventory_impacts','recall_readiness_impact_scope_idx','impact scope index exists');
select has_index('public','recall_readiness_events','recall_readiness_events_case_idx','event history index exists');

select * from finish();
rollback;
