begin;
-- Run with Supabase CLI test harness. Synthetic JWT claims must be supplied by the harness.
select plan(4);
select has_table('public','workspaces','workspaces exists');
select has_table('public','workspace_records','record store exists');
select row_security_active('public.workspace_records'::regclass);
select is((select public from storage.buckets where id='compliance-documents'),false,'document bucket is private');
select * from finish();
rollback;
