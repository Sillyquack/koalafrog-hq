alter table public.workspaces add constraint workspaces_id_owner_unique unique(id,owner_id);
create table public.intelligence_threads (
  id uuid primary key,
  workspace_id uuid not null,
  owner_user_id uuid not null,
  mode text not null check (mode in ('scent_exploration')),
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id,id),
  foreign key (workspace_id,owner_user_id) references public.workspaces(id,owner_id) on delete cascade
);
create table public.intelligence_runs (
  id uuid primary key,
  workspace_id uuid not null,
  owner_user_id uuid not null,
  thread_id uuid not null,
  request_schema_version integer not null,
  response_schema_version integer,
  prompt_version text not null,
  context_version integer not null,
  user_prompt text not null,
  context_selection jsonb not null,
  context_manifest jsonb not null,
  response_payload jsonb,
  status text not null check(status in ('gathering_context','analyzing','completed','failed')),
  provider_name text,
  model_name text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (workspace_id,owner_user_id) references public.workspaces(id,owner_id) on delete cascade,
  foreign key (workspace_id,thread_id) references public.intelligence_threads(workspace_id,id) on delete cascade
);
alter table public.intelligence_threads enable row level security;
alter table public.intelligence_runs enable row level security;
create policy intelligence_threads_owner_all on public.intelligence_threads for all to authenticated using(owner_user_id=auth.uid()) with check(owner_user_id=auth.uid() and exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=auth.uid() and w.lifecycle_state='active'));
create policy intelligence_runs_owner_all on public.intelligence_runs for all to authenticated using(owner_user_id=auth.uid()) with check(owner_user_id=auth.uid() and exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=auth.uid() and w.lifecycle_state='active') and exists(select 1 from public.intelligence_threads t where t.id=thread_id and t.workspace_id=workspace_id and t.owner_user_id=auth.uid()));
revoke all on public.intelligence_threads,public.intelligence_runs from anon;
grant select,insert,update,delete on public.intelligence_threads,public.intelligence_runs to authenticated;
