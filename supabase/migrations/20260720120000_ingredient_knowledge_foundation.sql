set search_path = public, extensions;

create table public.ingredient_knowledge_profiles (
  id text not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  ingredient_id text not null,
  identity jsonb not null default '{}'::jsonb,
  physical_properties jsonb not null default '{}'::jsonb,
  sensory_profile jsonb not null default '{}'::jsonb,
  prediction_inputs jsonb not null default '{}'::jsonb,
  last_edited_source text check(last_edited_source is null or last_edited_source in ('reference','supplier_specific','internal','user')),
  created_at text not null,
  updated_at text not null,
  primary key(workspace_id,id), unique(workspace_id, ingredient_id),
  foreign key(workspace_id,ingredient_id) references public.ingredients(workspace_id,id) on delete cascade
);

create table public.ingredient_knowledge_roles (
  id text not null, workspace_id uuid not null references public.workspaces(id) on delete cascade, owner_id uuid not null references auth.users(id) on delete cascade,
  ingredient_knowledge_profile_id text not null,
  role text not null check(role in ('structuring_wax','soft_structurant','liquid_emollient','occlusive','absorbent_powder','deodorant_active','slip_modifier','texture_modifier','film_former','antioxidant','fragrance','preservative','solvent','humectant','surfactant','emulsifier','active','colourant','other')),
  level text not null check(level in ('primary','secondary','optional','context_dependent')), context text not null check(length(trim(context))>0), evidence_ids jsonb not null default '[]'::jsonb check(jsonb_typeof(evidence_ids)='array'),
  confidence text not null check(confidence in ('verified','supported','observed','assumed','unknown','conflicting')), notes text not null default '', created_at text not null, updated_at text not null,
  primary key(workspace_id,id), foreign key(workspace_id,ingredient_knowledge_profile_id) references public.ingredient_knowledge_profiles(workspace_id,id) on delete cascade
);
create table public.ingredient_knowledge_compatibility (
  id text not null, workspace_id uuid not null references public.workspaces(id) on delete cascade, owner_id uuid not null references auth.users(id) on delete cascade,
  ingredient_knowledge_profile_id text not null,
  target_type text not null check(target_type in ('ingredient','formulation_archetype','product_template','packaging_material')), target_id text, target_label text not null check(length(trim(target_label))>0), context text not null default '', rating text not null check(rating in ('excellent','good','acceptable','avoid','unknown','review_required')),
  evidence_ids jsonb not null default '[]'::jsonb check(jsonb_typeof(evidence_ids)='array'), confidence text not null check(confidence in ('verified','supported','observed','assumed','unknown','conflicting')), notes text not null default '', created_at text not null, updated_at text not null,
  check(target_type<>'ingredient' or target_id is not null),
  primary key(workspace_id,id), foreign key(workspace_id,ingredient_knowledge_profile_id) references public.ingredient_knowledge_profiles(workspace_id,id) on delete cascade
);
create table public.ingredient_knowledge_evidence (
  id text not null, workspace_id uuid not null references public.workspaces(id) on delete cascade, owner_id uuid not null references auth.users(id) on delete cascade,
  ingredient_knowledge_profile_id text not null,
  source_type text not null check(source_type in ('supplier_document','scientific_literature','patent','regulatory_document','internal_lab','internal_observation','external_observation','user_note','unknown')),
  provenance text not null check(provenance in ('reference','supplier_specific','internal','user')), title text not null check(length(trim(title))>0), document_id text, document_revision text, external_url text,
  evidence_date date, author_or_organisation text, summary text not null default '', notes text not null default '', confidence text not null,
  created_at text not null, updated_at text not null, check(confidence in ('verified','supported','observed','assumed','unknown','conflicting')),
  primary key(workspace_id,id), foreign key(workspace_id,ingredient_knowledge_profile_id) references public.ingredient_knowledge_profiles(workspace_id,id) on delete cascade
);

create index ingredient_knowledge_profiles_owner_ingredient_idx on public.ingredient_knowledge_profiles(owner_id, ingredient_id);
create index ingredient_knowledge_roles_profile_idx on public.ingredient_knowledge_roles(ingredient_knowledge_profile_id);
create index ingredient_knowledge_compatibility_profile_idx on public.ingredient_knowledge_compatibility(ingredient_knowledge_profile_id);
create index ingredient_knowledge_evidence_profile_idx on public.ingredient_knowledge_evidence(ingredient_knowledge_profile_id);
create unique index ingredient_knowledge_roles_exact_unique on public.ingredient_knowledge_roles(workspace_id,ingredient_knowledge_profile_id,role,level,context);
create unique index ingredient_knowledge_compatibility_exact_unique on public.ingredient_knowledge_compatibility(workspace_id,ingredient_knowledge_profile_id,target_type,coalesce(target_id,''),target_label,context);

alter table public.ingredient_knowledge_profiles enable row level security;
alter table public.ingredient_knowledge_roles enable row level security;
alter table public.ingredient_knowledge_compatibility enable row level security;
alter table public.ingredient_knowledge_evidence enable row level security;

grant select, insert, update, delete on public.ingredient_knowledge_profiles to authenticated;
grant select, insert, update, delete on public.ingredient_knowledge_roles to authenticated;
grant select, insert, update, delete on public.ingredient_knowledge_compatibility to authenticated;
grant select, insert, update, delete on public.ingredient_knowledge_evidence to authenticated;

create or replace function public.validate_ingredient_knowledge_evidence_links() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare evidence_id text;
begin
  for evidence_id in select jsonb_array_elements_text(new.evidence_ids) loop
    if not exists(select 1 from public.ingredient_knowledge_evidence e where e.workspace_id=new.workspace_id and e.ingredient_knowledge_profile_id=new.ingredient_knowledge_profile_id and e.id=evidence_id) then
      raise exception 'Ingredient Knowledge evidence reference % is invalid',evidence_id;
    end if;
  end loop;
  return new;
end $$;
create trigger ingredient_knowledge_roles_evidence_links before insert or update on public.ingredient_knowledge_roles for each row execute function public.validate_ingredient_knowledge_evidence_links();
create trigger ingredient_knowledge_compatibility_evidence_links before insert or update on public.ingredient_knowledge_compatibility for each row execute function public.validate_ingredient_knowledge_evidence_links();

create or replace function public.protect_linked_ingredient_knowledge_evidence() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if exists(select 1 from public.ingredient_knowledge_roles where workspace_id=old.workspace_id and evidence_ids ? old.id)
    or exists(select 1 from public.ingredient_knowledge_compatibility where workspace_id=old.workspace_id and evidence_ids ? old.id) then
    raise exception 'Evidence is still linked; remove the relationship link first';
  end if;
  return old;
end $$;
create trigger ingredient_knowledge_evidence_link_protection before delete on public.ingredient_knowledge_evidence for each row execute function public.protect_linked_ingredient_knowledge_evidence();

do $$ declare table_name text; begin
  foreach table_name in array array['ingredient_knowledge_profiles','ingredient_knowledge_roles','ingredient_knowledge_compatibility','ingredient_knowledge_evidence'] loop
    execute format('create policy %I on public.%I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid() and exists (select 1 from public.workspaces w where w.id = workspace_id and w.owner_id = auth.uid()))', table_name || '_owner_isolation', table_name);
  end loop;
end $$;

create or replace function public.save_ingredient_knowledge_aggregate(
  aggregate jsonb,
  expected_updated_at text default null
) returns jsonb
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  uid uuid:=auth.uid();
  wid uuid;
  profile jsonb:=aggregate->'profile';
  profile_id text:=profile->>'id';
  ingredient_id text:=profile->>'ingredient_id';
  current_updated_at text;
  item jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select id into wid from public.workspaces where owner_id=uid;
  if wid is null then raise exception 'Workspace not found'; end if;
  if not exists(select 1 from public.ingredients where workspace_id=wid and owner_id=uid and id=ingredient_id) then raise exception 'Workspace Ingredient not found'; end if;
  select updated_at into current_updated_at from public.ingredient_knowledge_profiles where workspace_id=wid and id=profile_id for update;
  if current_updated_at is not null and expected_updated_at is distinct from current_updated_at then raise exception 'Ingredient Knowledge changed since it was opened; refresh and retry'; end if;
  if current_updated_at is null then
    insert into public.ingredient_knowledge_profiles
    select (jsonb_populate_record(null::public.ingredient_knowledge_profiles,profile||jsonb_build_object('workspace_id',wid,'owner_id',uid))).*;
  else
    update public.ingredient_knowledge_profiles set
      identity=profile->'identity',physical_properties=profile->'physical_properties',sensory_profile=profile->'sensory_profile',
      prediction_inputs=profile->'prediction_inputs',last_edited_source=profile->>'last_edited_source',updated_at=profile->>'updated_at'
    where workspace_id=wid and owner_id=uid and id=profile_id;
  end if;
  delete from public.ingredient_knowledge_roles where workspace_id=wid and ingredient_knowledge_profile_id=profile_id;
  delete from public.ingredient_knowledge_compatibility where workspace_id=wid and ingredient_knowledge_profile_id=profile_id;
  delete from public.ingredient_knowledge_evidence where workspace_id=wid and ingredient_knowledge_profile_id=profile_id;
  for item in select value from jsonb_array_elements(coalesce(aggregate->'evidence','[]')) loop
    insert into public.ingredient_knowledge_evidence select (jsonb_populate_record(null::public.ingredient_knowledge_evidence,item||jsonb_build_object('workspace_id',wid,'owner_id',uid))).*;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(aggregate->'roles','[]')) loop
    insert into public.ingredient_knowledge_roles select (jsonb_populate_record(null::public.ingredient_knowledge_roles,item||jsonb_build_object('workspace_id',wid,'owner_id',uid))).*;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(aggregate->'compatibility','[]')) loop
    if item->>'target_type'='ingredient' and (item->>'target_id'=ingredient_id or not exists(select 1 from public.ingredients where workspace_id=wid and id=item->>'target_id')) then raise exception 'Invalid compatibility target'; end if;
    insert into public.ingredient_knowledge_compatibility select (jsonb_populate_record(null::public.ingredient_knowledge_compatibility,item||jsonb_build_object('workspace_id',wid,'owner_id',uid))).*;
  end loop;
  return jsonb_build_object('profileId',profile_id,'updatedAt',profile->>'updated_at');
end $$;
revoke all on function public.save_ingredient_knowledge_aggregate(jsonb,text) from public,anon;
grant execute on function public.save_ingredient_knowledge_aggregate(jsonb,text) to authenticated;

alter function public.import_v9_relational(jsonb) rename to import_v9_relational_pre_ingredient_knowledge;
create or replace function public.import_v9_relational(payload jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb; wid uuid; uid uuid:=auth.uid(); item jsonb; collection text;
begin
  result:=public.import_v9_relational_pre_ingredient_knowledge(payload);
  wid:=(result->>'workspaceId')::uuid;
  foreach collection in array array['ingredientKnowledgeProfiles','ingredientKnowledgeEvidence','ingredientKnowledgeRoles','ingredientKnowledgeCompatibility'] loop
    for item in select value from jsonb_array_elements(coalesce(payload->collection,'[]')) loop
      execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).*',
        case collection when 'ingredientKnowledgeProfiles' then 'ingredient_knowledge_profiles' when 'ingredientKnowledgeEvidence' then 'ingredient_knowledge_evidence' when 'ingredientKnowledgeRoles' then 'ingredient_knowledge_roles' else 'ingredient_knowledge_compatibility' end,
        case collection when 'ingredientKnowledgeProfiles' then 'ingredient_knowledge_profiles' when 'ingredientKnowledgeEvidence' then 'ingredient_knowledge_evidence' when 'ingredientKnowledgeRoles' then 'ingredient_knowledge_roles' else 'ingredient_knowledge_compatibility' end)
      using item||jsonb_build_object('workspace_id',wid,'owner_id',uid);
    end loop;
    result:=jsonb_set(result,array['counts',collection],to_jsonb(jsonb_array_length(coalesce(payload->collection,'[]'))),true);
  end loop;
  return result;
end $$;
revoke all on function public.import_v9_relational(jsonb) from public,anon;
grant execute on function public.import_v9_relational(jsonb) to authenticated;
