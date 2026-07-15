create or replace function public.create_clean_workspace()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  workspace_id uuid;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;

  if exists(select 1 from public.workspaces where owner_id = uid) then
    raise exception 'Workspace already exists for authenticated owner';
  end if;

  insert into public.workspaces(owner_id, name, lifecycle_state)
  values(uid, 'Koalafrog HQ', 'active')
  returning id into workspace_id;

  return workspace_id;
end
$$;

revoke all on function public.create_clean_workspace() from public, anon;
grant execute on function public.create_clean_workspace() to authenticated;
