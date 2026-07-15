begin;
-- Run with Supabase CLI test harness. Synthetic JWT claims must be supplied by the harness.
select plan(8);
select has_table('public','workspaces','workspaces exists');
select has_table('public','workspace_records','record store exists');
select row_security_active('public.workspace_records'::regclass);
select is((select public from storage.buckets where id='compliance-documents'),false,'document bucket is private');
select has_table('public','intelligence_threads','intelligence threads exist');
select has_table('public','intelligence_runs','intelligence runs exist');
select row_security_active('public.intelligence_threads'::regclass);
select row_security_active('public.intelligence_runs'::regclass);
select * from finish();
rollback;
