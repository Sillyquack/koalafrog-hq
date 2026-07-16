alter table public.intelligence_runs
  add column input_tokens bigint,
  add column output_tokens bigint,
  add column total_tokens bigint,
  add column cached_input_tokens bigint,
  add column reasoning_tokens bigint,
  add column provider_usage_version text,
  add column estimated_cost_usd numeric(14,8),
  add column pricing_snapshot_version text;

alter table public.intelligence_runs
  add constraint intelligence_runs_usage_nonnegative check (
    input_tokens >= 0 and output_tokens >= 0 and total_tokens >= 0 and
    coalesce(cached_input_tokens, 0) >= 0 and coalesce(reasoning_tokens, 0) >= 0 and
    coalesce(estimated_cost_usd, 0) >= 0
  );

create table public.knowledge_references (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_user_id uuid not null,
  source_type text not null check (source_type in ('intelligence_thread')),
  source_intelligence_thread_id uuid not null,
  title text,
  user_note text,
  tags text[] not null default '{}',
  is_pinned boolean not null default false,
  archived_at timestamptz,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, source_intelligence_thread_id),
  foreign key (workspace_id, owner_user_id)
    references public.workspaces(id, owner_id) on delete cascade,
  foreign key (workspace_id, source_intelligence_thread_id)
    references public.intelligence_threads(workspace_id, id) on delete cascade
);

create table public.scent_memory_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  owner_user_id uuid not null,
  title text not null check (length(trim(title)) > 0),
  status text not null default 'active' check (status in ('active','completed')),
  product_id text,
  formula_version_id text,
  lab_batch_id text,
  ingredient_id text,
  test_session_id text,
  overall_score smallint check (overall_score between 1 and 5),
  what_worked text,
  what_surprised_me text,
  what_felt_dominant text,
  what_disappeared text,
  what_was_missing text,
  change_next text,
  final_conclusion text,
  archived_at timestamptz,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, owner_user_id)
    references public.workspaces(id, owner_id) on delete cascade,
  foreign key (workspace_id, product_id) references public.products(workspace_id, id),
  foreign key (workspace_id, formula_version_id) references public.formula_versions(workspace_id, id),
  foreign key (workspace_id, lab_batch_id) references public.lab_batches(workspace_id, id),
  foreign key (workspace_id, ingredient_id) references public.ingredients(workspace_id, id),
  foreign key (workspace_id, test_session_id) references public.test_sessions(workspace_id, id),
  check (num_nonnulls(product_id, formula_version_id, lab_batch_id, ingredient_id, test_session_id) > 0)
);

create table public.scent_memory_checkpoints (
  id uuid primary key default gen_random_uuid(),
  logical_id uuid not null,
  workspace_id uuid not null,
  owner_user_id uuid not null,
  session_id uuid not null,
  revision integer not null check (revision > 0),
  supersedes_id uuid,
  is_current boolean not null default true,
  checkpoint_kind text not null check (checkpoint_kind in ('immediate','15_minutes','1_hour','4_hours','next_day','custom')),
  custom_minutes integer check (custom_minutes is null or custom_minutes >= 0),
  observed_at timestamptz not null,
  descriptors text[] not null default '{}',
  notes text,
  intensity smallint check (intensity between 1 and 5),
  freshness smallint check (freshness between 1 and 5),
  warmth smallint check (warmth between 1 and 5),
  dryness smallint check (dryness between 1 and 5),
  sweetness smallint check (sweetness between 1 and 5),
  woodiness smallint check (woodiness between 1 and 5),
  spice smallint check (spice between 1 and 5),
  darkness smallint check (darkness between 1 and 5),
  diffusion smallint check (diffusion between 1 and 5),
  persistence smallint check (persistence between 1 and 5),
  balance smallint check (balance between 1 and 5),
  overall_impression text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (logical_id, revision),
  unique (workspace_id, id),
  foreign key (workspace_id, owner_user_id)
    references public.workspaces(id, owner_id) on delete cascade,
  foreign key (workspace_id, session_id)
    references public.scent_memory_sessions(workspace_id, id) on delete cascade,
  foreign key (workspace_id, supersedes_id)
    references public.scent_memory_checkpoints(workspace_id, id),
  check ((checkpoint_kind = 'custom') = (custom_minutes is not null))
);

create or replace function public.validate_scent_memory_context()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare batch_product text; batch_version text; version_product text; test_batch text;
begin
  if new.formula_version_id is not null then
    select f.product_id into version_product from public.formula_versions v
      join public.formulas f on f.workspace_id = v.workspace_id and f.id = v.formula_id
      where v.workspace_id = new.workspace_id and v.id = new.formula_version_id;
    if new.product_id is not null and new.product_id <> version_product then
      raise exception 'Formula Version does not belong to the selected Product';
    end if;
  end if;
  if new.lab_batch_id is not null then
    select product_id, formula_version_id into batch_product, batch_version
      from public.lab_batches where workspace_id = new.workspace_id and id = new.lab_batch_id;
    if new.product_id is not null and new.product_id <> batch_product then
      raise exception 'Lab Batch does not belong to the selected Product';
    end if;
    if new.formula_version_id is not null and new.formula_version_id <> batch_version then
      raise exception 'Lab Batch does not use the selected Formula Version';
    end if;
  end if;
  if new.test_session_id is not null and new.lab_batch_id is not null then
    select lab_batch_id into test_batch from public.test_sessions
      where workspace_id = new.workspace_id and id = new.test_session_id;
    if test_batch <> new.lab_batch_id then
      raise exception 'Test Session does not belong to the selected Lab Batch';
    end if;
  end if;
  return new;
end $$;
create trigger validate_scent_memory_context_before_write
  before insert or update on public.scent_memory_sessions
  for each row execute function public.validate_scent_memory_context();
revoke all on function public.validate_scent_memory_context() from public, anon, authenticated;

create unique index scent_memory_one_current_revision
  on public.scent_memory_checkpoints(workspace_id, logical_id) where is_current;
create index knowledge_references_workspace_activity
  on public.knowledge_references(workspace_id, is_pinned desc, updated_at desc);
create index intelligence_runs_library
  on public.intelligence_runs(workspace_id, status, created_at desc);
create index scent_memory_sessions_library
  on public.scent_memory_sessions(workspace_id, archived_at, status, updated_at desc);
create index scent_memory_checkpoints_context
  on public.scent_memory_checkpoints(workspace_id, session_id, is_current, observed_at desc);

alter table public.knowledge_references enable row level security;
alter table public.scent_memory_sessions enable row level security;
alter table public.scent_memory_checkpoints enable row level security;

create policy knowledge_references_owner_all on public.knowledge_references
  for all to authenticated
  using (owner_user_id = auth.uid())
  with check (
    owner_user_id = auth.uid() and exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.owner_id = auth.uid() and w.lifecycle_state = 'active'
    ) and exists (
      select 1 from public.intelligence_threads t
      where t.id = source_intelligence_thread_id and t.workspace_id = workspace_id and t.owner_user_id = auth.uid()
    )
  );
create policy scent_memory_sessions_owner_all on public.scent_memory_sessions
  for all to authenticated
  using (owner_user_id = auth.uid())
  with check (
    owner_user_id = auth.uid() and exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.owner_id = auth.uid() and w.lifecycle_state = 'active'
    )
  );
create policy scent_memory_checkpoints_owner_read on public.scent_memory_checkpoints
  for select to authenticated using (owner_user_id = auth.uid());

revoke all on public.knowledge_references, public.scent_memory_sessions,
  public.scent_memory_checkpoints from anon;
grant select, insert, update on public.knowledge_references, public.scent_memory_sessions to authenticated;
grant select on public.scent_memory_checkpoints to authenticated;

create or replace function public.record_scent_memory_checkpoint(
  target_session_id uuid,
  checkpoint jsonb,
  correction_of uuid default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid(); wid uuid; logical uuid; next_revision integer; prior public.scent_memory_checkpoints; new_id uuid := gen_random_uuid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select workspace_id into wid from public.scent_memory_sessions
    where id = target_session_id and owner_user_id = uid and archived_at is null;
  if wid is null then raise exception 'Scent Memory session unavailable'; end if;
  if correction_of is not null then
    select * into prior from public.scent_memory_checkpoints
      where id = correction_of and workspace_id = wid and owner_user_id = uid and session_id = target_session_id and is_current;
    if prior.id is null then raise exception 'Current checkpoint unavailable'; end if;
    logical := prior.logical_id; next_revision := prior.revision + 1;
    update public.scent_memory_checkpoints set is_current = false where id = prior.id;
  else
    logical := gen_random_uuid(); next_revision := 1;
  end if;
  insert into public.scent_memory_checkpoints(
    id, logical_id, workspace_id, owner_user_id, session_id, revision, supersedes_id,
    checkpoint_kind, custom_minutes, observed_at, descriptors, notes, intensity,
    freshness, warmth, dryness, sweetness, woodiness, spice, darkness, diffusion,
    persistence, balance, overall_impression
  ) values (
    new_id, logical, wid, uid, target_session_id, next_revision, correction_of,
    checkpoint->>'checkpointKind', (checkpoint->>'customMinutes')::integer,
    coalesce((checkpoint->>'observedAt')::timestamptz, now()),
    coalesce(array(select jsonb_array_elements_text(checkpoint->'descriptors')), '{}'),
    nullif(checkpoint->>'notes',''), (checkpoint->>'intensity')::smallint,
    (checkpoint->>'freshness')::smallint, (checkpoint->>'warmth')::smallint,
    (checkpoint->>'dryness')::smallint, (checkpoint->>'sweetness')::smallint,
    (checkpoint->>'woodiness')::smallint, (checkpoint->>'spice')::smallint,
    (checkpoint->>'darkness')::smallint, (checkpoint->>'diffusion')::smallint,
    (checkpoint->>'persistence')::smallint, (checkpoint->>'balance')::smallint,
    nullif(checkpoint->>'overallImpression','')
  );
  update public.scent_memory_sessions set updated_at = now(), revision = revision + 1 where id = target_session_id;
  return new_id;
end $$;
revoke all on function public.record_scent_memory_checkpoint(uuid,jsonb,uuid) from public, anon;
grant execute on function public.record_scent_memory_checkpoint(uuid,jsonb,uuid) to authenticated;
