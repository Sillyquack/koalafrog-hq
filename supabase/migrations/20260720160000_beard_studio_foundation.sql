-- Beard Studio is owner-private grooming data. Historical log snapshots are
-- intentionally JSONB: relational sources remain normalized and the snapshot
-- carries an explicit schema version so later edits cannot rewrite history.
create table public.beard_profiles (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  status text not null check (status in ('Draft','Active','Archived')),
  style_name text not null,
  description text not null default '',
  target_look text not null default '',
  maintenance_frequency_days integer not null check (maintenance_frequency_days > 0),
  preferred_overall_length_mm numeric not null check (preferred_overall_length_mm >= 0),
  density text not null check (density in ('light','medium','dense','mixed')),
  texture text not null check (texture in ('straight','wavy','curly','coarse','mixed')),
  profile_details jsonb not null default '{}'::jsonb check (jsonb_typeof(profile_details) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create unique index beard_profiles_one_active_per_workspace on public.beard_profiles(workspace_id) where status = 'Active';

create table public.grooming_tools (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  brand text not null default '',
  model text not null default '',
  tool_type text not null,
  minimum_length_mm numeric check (minimum_length_mm >= 0),
  maximum_length_mm numeric check (maximum_length_mm >= minimum_length_mm),
  adjustment_increment_mm numeric check (adjustment_increment_mm > 0),
  washable boolean not null default false,
  notes text not null default '',
  is_primary boolean not null default false,
  status text not null check (status in ('active','retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create unique index grooming_tools_one_primary_per_type on public.grooming_tools(workspace_id, tool_type) where is_primary and status = 'active';

create table public.grooming_tool_attachments (
  id uuid primary key,
  workspace_id uuid not null,
  tool_id uuid not null,
  name text not null check (length(btrim(name)) > 0),
  display_order integer not null default 1 check (display_order > 0),
  foreign key (tool_id, workspace_id) references public.grooming_tools(id, workspace_id) on delete cascade
);

create table public.beard_length_maps (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (profile_id, workspace_id) references public.beard_profiles(id, workspace_id) on delete cascade,
  unique (profile_id),
  unique (id, workspace_id)
);
create table public.beard_length_map_zones (
  id uuid primary key,
  workspace_id uuid not null,
  length_map_id uuid not null,
  zone_name text not null,
  target_length_mm numeric not null check (target_length_mm >= 0),
  minimum_length_mm numeric check (minimum_length_mm >= 0),
  maximum_length_mm numeric check (maximum_length_mm >= minimum_length_mm),
  trim_direction text not null check (trim_direction in ('with growth','against growth','across growth','detail only')),
  tool_id uuid,
  attachment_id uuid,
  notes text not null default '',
  display_order integer not null check (display_order > 0),
  enabled boolean not null default true,
  foreign key (length_map_id, workspace_id) references public.beard_length_maps(id, workspace_id) on delete cascade,
  foreign key (tool_id, workspace_id) references public.grooming_tools(id, workspace_id),
  foreign key (attachment_id) references public.grooming_tool_attachments(id),
  unique (length_map_id, zone_name)
);

create table public.trim_recipes (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null,
  name text not null check (length(btrim(name)) > 0),
  status text not null check (status in ('Draft','Active','Archived')),
  version integer not null check (version > 0),
  estimated_duration_minutes integer not null check (estimated_duration_minutes > 0),
  starting_condition text not null default '',
  preparation_instructions text not null default '',
  finishing_instructions text not null default '',
  preferred_products jsonb not null default '[]'::jsonb check (jsonb_typeof(preferred_products) = 'array'),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (profile_id, workspace_id) references public.beard_profiles(id, workspace_id),
  unique (id, workspace_id)
);
create unique index trim_recipes_one_active_per_profile on public.trim_recipes(profile_id) where status = 'Active';
create table public.trim_recipe_steps (
  id uuid primary key,
  workspace_id uuid not null,
  recipe_id uuid not null,
  display_order integer not null check (display_order > 0),
  title text not null check (length(btrim(title)) > 0),
  zones text[] not null default '{}',
  target_length_mm numeric check (target_length_mm >= 0),
  tool_id uuid,
  attachment_id uuid,
  trim_direction text check (trim_direction in ('with growth','against growth','across growth','detail only')),
  technique text not null,
  instruction text not null,
  caution text not null default '',
  completion_required boolean not null default false,
  foreign key (recipe_id, workspace_id) references public.trim_recipes(id, workspace_id) on delete cascade,
  foreign key (tool_id, workspace_id) references public.grooming_tools(id, workspace_id),
  foreign key (attachment_id) references public.grooming_tool_attachments(id),
  unique (recipe_id, display_order)
);

create table public.beard_trim_sessions (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null,
  recipe_version integer not null,
  status text not null check (status in ('in_progress','paused','completed','abandoned')),
  current_step_index integer not null default 0 check (current_step_index >= 0),
  completed_step_ids uuid[] not null default '{}',
  skipped_step_ids uuid[] not null default '{}',
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (recipe_id, workspace_id) references public.trim_recipes(id, workspace_id)
);

create table public.beard_log_entries (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.beard_trim_sessions(id),
  profile_id uuid not null,
  recipe_id uuid,
  recipe_version integer,
  occurred_at timestamptz not null,
  starting_condition text not null default '',
  days_since_previous_trim integer check (days_since_previous_trim >= 0),
  duration_minutes integer check (duration_minutes > 0),
  overall_rating integer not null check (overall_rating between 1 and 5),
  fade_rating integer check (fade_rating between 1 and 5),
  line_sharpness_rating integer check (line_sharpness_rating between 1 and 5),
  symmetry_rating integer check (symmetry_rating between 1 and 5),
  comfort_rating integer check (comfort_rating between 1 and 5),
  notes text not null default '',
  what_worked text not null default '',
  change_next_time text not null default '',
  snapshot_schema_version integer not null default 1,
  immutable_snapshot jsonb not null check (jsonb_typeof(immutable_snapshot) = 'object'),
  image_references jsonb not null default '[]'::jsonb check (jsonb_typeof(image_references) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (profile_id, workspace_id) references public.beard_profiles(id, workspace_id),
  foreign key (recipe_id, workspace_id) references public.trim_recipes(id, workspace_id)
);

alter table public.beard_profiles enable row level security;
alter table public.grooming_tools enable row level security;
alter table public.grooming_tool_attachments enable row level security;
alter table public.beard_length_maps enable row level security;
alter table public.beard_length_map_zones enable row level security;
alter table public.trim_recipes enable row level security;
alter table public.trim_recipe_steps enable row level security;
alter table public.beard_trim_sessions enable row level security;
alter table public.beard_log_entries enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array['beard_profiles','grooming_tools','beard_length_maps','trim_recipes','beard_trim_sessions','beard_log_entries']
  loop
    execute format('create policy %I on public.%I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid() and exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid() and w.lifecycle_state = ''active''))', table_name || '_owner_all', table_name);
    execute format('revoke all on public.%I from anon', table_name);
    execute format('grant select, insert, update on public.%I to authenticated', table_name);
  end loop;
end $$;
create policy grooming_tool_attachments_owner_all on public.grooming_tool_attachments for all to authenticated using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid())) with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid() and w.lifecycle_state = 'active'));
create policy beard_length_map_zones_owner_all on public.beard_length_map_zones for all to authenticated using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid())) with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid() and w.lifecycle_state = 'active'));
create policy trim_recipe_steps_owner_all on public.trim_recipe_steps for all to authenticated using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid())) with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid() and w.lifecycle_state = 'active'));
revoke all on public.grooming_tool_attachments, public.beard_length_map_zones, public.trim_recipe_steps from anon;
grant select, insert, update on public.grooming_tool_attachments, public.beard_length_map_zones, public.trim_recipe_steps to authenticated;

-- Historical outcomes are append-only. Corrections are represented by a new entry.
create function public.prevent_beard_log_mutation() returns trigger language plpgsql as $$
begin raise exception 'Beard Log entries are immutable; create a correction entry.'; end $$;
create trigger beard_log_entries_immutable before update or delete on public.beard_log_entries for each row execute function public.prevent_beard_log_mutation();
