-- Narrow owner-authenticated release diagnostic for seed and deployment gates.
-- SECURITY DEFINER is required solely to read Supabase's protected migration
-- catalogue. No SQL text, schema input, or infrastructure metadata is exposed.

create or replace function public.get_platform_migration_status_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  migration_count bigint;
  migration_head text;
begin
  if actor is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.workspaces workspace
    where workspace.owner_id = actor
      and workspace.lifecycle_state = 'active'
  ) then
    raise exception 'ACTIVE_OWNER_WORKSPACE_REQUIRED';
  end if;

  select count(*), max(version)
    into migration_count, migration_head
  from supabase_migrations.schema_migrations;

  return jsonb_build_object(
    'migration_count', migration_count,
    'current_migration_version', migration_head,
    'evaluated_at', clock_timestamp()
  );
end;
$$;

revoke all on function public.get_platform_migration_status_v1() from public;
revoke all on function public.get_platform_migration_status_v1() from anon;
grant execute on function public.get_platform_migration_status_v1() to authenticated;

comment on function public.get_platform_migration_status_v1() is
  'Returns only migration count, head, and evaluation time to an authenticated active workspace owner.';
