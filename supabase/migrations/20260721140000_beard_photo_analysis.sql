-- Additive Beard Photo Analysis migration. The workflow uses analysis records,
-- not conversation threads, so existing intelligence thread constraints remain unchanged.

create table public.intelligence_analyses (
  id uuid primary key,
  workspace_id uuid not null,
  owner_user_id uuid not null,
  source_module text not null check (source_module = 'beard-studio'),
  analysis_type text not null check (analysis_type = 'beard_photo_analysis'),
  schema_version integer not null check (schema_version = 1),
  prompt_version text not null,
  provider_name text,
  model_name text,
  status text not null check (status in ('staging','analyzing','completed','completed_cleanup_required','failed','cancelled')),
  idempotency_key uuid not null,
  profile_id uuid not null,
  context_manifest jsonb not null default '{}'::jsonb check (jsonb_typeof(context_manifest) = 'object'),
  result_payload jsonb check (result_payload is null or jsonb_typeof(result_payload) = 'object'),
  error_code text,
  correlation_id uuid not null,
  provider_usage jsonb check (provider_usage is null or jsonb_typeof(provider_usage) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (workspace_id, owner_user_id, idempotency_key),
  unique (workspace_id, id),
  foreign key (workspace_id,owner_user_id) references public.workspaces(id,owner_id) on delete cascade,
  foreign key (profile_id,workspace_id) references public.beard_profiles(id,workspace_id)
);

create table public.intelligence_analysis_inputs (
  id uuid primary key,
  workspace_id uuid not null,
  owner_user_id uuid not null,
  analysis_id uuid not null,
  view text not null check (view in ('front','left_profile','right_profile','under_chin')),
  bucket text not null check (bucket = 'beard-analysis-images'),
  object_path text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 8388608),
  cleanup_state text not null default 'pending' check (cleanup_state in ('pending','deleted','cleanup_required')),
  created_at timestamptz not null default now(),
  cleaned_at timestamptz,
  unique (analysis_id,view),
  unique (object_path),
  foreign key (workspace_id,analysis_id) references public.intelligence_analyses(workspace_id,id) on delete cascade,
  foreign key (workspace_id,owner_user_id) references public.workspaces(id,owner_id) on delete cascade
);

create table public.intelligence_observations (
  id uuid primary key,
  workspace_id uuid not null,
  owner_user_id uuid not null,
  analysis_id uuid not null,
  category text not null,
  statement text not null,
  confidence numeric not null check (confidence between 0 and 1),
  supporting_views text[] not null,
  evidence_description text not null,
  limitations text[] not null default '{}',
  related_beard_zones text[] not null default '{}',
  provenance text not null check (provenance = 'ai'),
  created_at timestamptz not null default now(),
  foreign key (workspace_id,analysis_id) references public.intelligence_analyses(workspace_id,id) on delete cascade,
  foreign key (workspace_id,owner_user_id) references public.workspaces(id,owner_id) on delete cascade
);

create table public.intelligence_recommendations (
  id uuid primary key,
  workspace_id uuid not null,
  owner_user_id uuid not null,
  analysis_id uuid not null,
  title text not null,
  reason text not null,
  confidence numeric not null check (confidence between 0 and 1),
  priority text not null check (priority in ('low','medium','high')),
  expected_benefit text not null,
  supporting_observation_ids uuid[] not null,
  affected_zones text[] not null default '{}',
  tool_constraints text[] not null default '{}',
  proposed_guard_strategy text,
  review_status text not null default 'undecided' check (review_status in ('undecided','accepted_for_planning','dismissed')),
  provenance text not null check (provenance = 'ai'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id,analysis_id) references public.intelligence_analyses(workspace_id,id) on delete cascade,
  foreign key (workspace_id,owner_user_id) references public.workspaces(id,owner_id) on delete cascade
);

create unique index intelligence_analyses_one_active_per_owner
on public.intelligence_analyses(workspace_id,owner_user_id)
where status in ('staging','analyzing');

create function public.enforce_beard_analysis_limits()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,pg_temp
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.workspace_id::text||':'||new.owner_user_id::text,0)
  );
  if exists(
    select 1 from public.intelligence_analyses
    where workspace_id=new.workspace_id and owner_user_id=new.owner_user_id
      and status in ('staging','analyzing')
  ) then
    raise exception using errcode='P0001',message='ANALYSIS_IN_PROGRESS';
  end if;
  if (
    select count(*) from public.intelligence_analyses
    where workspace_id=new.workspace_id and owner_user_id=new.owner_user_id
      and created_at>=pg_catalog.now()-interval '1 hour'
  )>=5 then
    raise exception using errcode='P0001',message='RATE_LIMITED';
  end if;
  return new;
end
$$;
revoke all on function public.enforce_beard_analysis_limits() from public,anon,authenticated;
create trigger enforce_beard_analysis_limits_before_insert
before insert on public.intelligence_analyses
for each row execute function public.enforce_beard_analysis_limits();

alter table public.intelligence_analyses enable row level security;
alter table public.intelligence_analysis_inputs enable row level security;
alter table public.intelligence_observations enable row level security;
alter table public.intelligence_recommendations enable row level security;

do $$ declare table_name text; begin
  foreach table_name in array array['intelligence_analyses','intelligence_analysis_inputs','intelligence_observations','intelligence_recommendations'] loop
    execute format('create policy %I on public.%I for all to authenticated using (owner_user_id=auth.uid() and exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=auth.uid())) with check (owner_user_id=auth.uid() and exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=auth.uid() and w.lifecycle_state=''active''))',table_name||'_owner_all',table_name);
    execute format('revoke all on public.%I from anon',table_name);
    execute format('grant select,insert on public.%I to authenticated',table_name);
  end loop;
end $$;
grant update(review_status,updated_at) on public.intelligence_recommendations to authenticated;
grant update(status,result_payload,error_code,provider_name,model_name,provider_usage,completed_at) on public.intelligence_analyses to authenticated;
grant update(cleanup_state,cleaned_at) on public.intelligence_analysis_inputs to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('beard-analysis-images','beard-analysis-images',false,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;

do $$ begin
  if not exists(
    select 1 from storage.buckets
    where id='beard-analysis-images'
      and name='beard-analysis-images'
      and public=false
      and file_size_limit=8388608
      and allowed_mime_types=array['image/jpeg','image/png','image/webp']
  ) then
    raise exception 'beard-analysis-images exists with an unexpected configuration';
  end if;
end $$;

create function public.is_active_owned_workspace(candidate_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path=pg_catalog,public,pg_temp
as $$
  select exists(
    select 1 from public.workspaces
    where id=candidate_workspace_id and owner_id=auth.uid() and lifecycle_state='active'
  )
$$;
revoke all on function public.is_active_owned_workspace(uuid) from public,anon;
grant execute on function public.is_active_owned_workspace(uuid) to authenticated;

create policy beard_analysis_owner_insert on storage.objects for insert to authenticated with check (
  bucket_id='beard-analysis-images' and (storage.foldername(name))[2]=auth.uid()::text and
  public.is_active_owned_workspace((storage.foldername(name))[1]::uuid)
);
create policy beard_analysis_owner_read on storage.objects for select to authenticated using (
  bucket_id='beard-analysis-images' and (storage.foldername(name))[2]=auth.uid()::text and
  public.is_active_owned_workspace((storage.foldername(name))[1]::uuid)
);
create policy beard_analysis_owner_delete on storage.objects for delete to authenticated using (
  bucket_id='beard-analysis-images' and (storage.foldername(name))[2]=auth.uid()::text and
  public.is_active_owned_workspace((storage.foldername(name))[1]::uuid)
);
