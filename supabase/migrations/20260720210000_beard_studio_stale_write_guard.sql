create table public.beard_studio_revisions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);
alter table public.beard_studio_revisions enable row level security;
create policy beard_studio_revisions_owner_all on public.beard_studio_revisions
  for all to authenticated
  using (owner_id=auth.uid())
  with check (owner_id=auth.uid() and exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=auth.uid() and w.lifecycle_state='active'));
revoke all on public.beard_studio_revisions from anon;
grant select,insert,update on public.beard_studio_revisions to authenticated;

-- Insert the revision compare-and-swap inside the existing security-invoker
-- transaction. The original owner/workspace checks and RLS remain authoritative.
do $migration$
declare
  definition text;
  guard text := $guard$
  insert into public.beard_studio_revisions(workspace_id,owner_id,revision)
  values(v_workspace,v_owner,coalesce((payload->>'expected_revision')::bigint,0)+1)
  on conflict(workspace_id) do update
    set revision=public.beard_studio_revisions.revision+1,updated_at=now()
    where public.beard_studio_revisions.revision=coalesce((payload->>'expected_revision')::bigint,0);
  if not found then
    raise exception 'Beard Studio changed in another session; refresh and retry.';
  end if;
$guard$;
begin
  select pg_get_functiondef('public.save_beard_studio_workspace(jsonb)'::regprocedure) into definition;
  definition:=replace(definition,'  if v_owner is null then',guard||'  if v_owner is null then');
  if definition not like '%Beard Studio changed in another session%' then
    raise exception 'Could not install Beard Studio revision guard';
  end if;
  execute definition;
end
$migration$;
