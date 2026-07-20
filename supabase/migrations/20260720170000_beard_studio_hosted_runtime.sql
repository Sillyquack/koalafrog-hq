-- Hosted Beard Studio write boundary and relational Product references.
-- The RPC is security-invoker and therefore remains subject to the existing RLS
-- policies while making parent/child replacement and Active transitions atomic.
create table public.trim_recipe_product_links (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  recipe_id uuid not null,
  product_id text,
  product_name_snapshot text not null,
  product_category_snapshot text not null default '',
  usage_role text not null,
  display_order integer not null check (display_order > 0),
  foreign key (recipe_id, workspace_id) references public.trim_recipes(id, workspace_id) on delete cascade,
  foreign key (workspace_id, product_id) references public.products(workspace_id, id) on delete set null,
  unique (recipe_id, display_order)
);

create table public.beard_log_product_links (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  beard_log_entry_id uuid not null references public.beard_log_entries(id) on delete cascade,
  product_id text,
  product_name_snapshot text not null,
  product_category_snapshot text not null default '',
  usage_role text not null,
  display_order integer not null check (display_order > 0),
  unique (beard_log_entry_id, display_order),
  foreign key (workspace_id, product_id) references public.products(workspace_id, id) on delete set null
);

create index trim_recipe_product_links_product_idx on public.trim_recipe_product_links(workspace_id, product_id);
create index beard_log_product_links_product_idx on public.beard_log_product_links(workspace_id, product_id);
alter table public.trim_recipe_product_links enable row level security;
alter table public.beard_log_product_links enable row level security;
create policy trim_recipe_product_links_owner_all on public.trim_recipe_product_links for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid() and exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=auth.uid() and w.lifecycle_state='active'));
create policy beard_log_product_links_owner_all on public.beard_log_product_links for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid() and exists(select 1 from public.workspaces w where w.id=workspace_id and w.owner_id=auth.uid() and w.lifecycle_state='active'));
revoke all on public.trim_recipe_product_links, public.beard_log_product_links from anon;
grant select, insert, update, delete on public.trim_recipe_product_links to authenticated;
grant select, insert on public.beard_log_product_links to authenticated;

create or replace function public.save_beard_studio_workspace(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := auth.uid();
  v_workspace uuid := (payload->>'workspace_id')::uuid;
  item jsonb;
  child jsonb;
  parent_id uuid;
  position integer;
begin
  if v_owner is null then raise exception 'Authenticated owner required.'; end if;
  if not exists(select 1 from public.workspaces where id=v_workspace and owner_id=v_owner and lifecycle_state='active') then
    raise exception 'Active owned workspace required.';
  end if;

  -- Clear constrained flags before applying the intended state.
  update public.beard_profiles set status='Draft' where workspace_id=v_workspace and status='Active';
  update public.trim_recipes set status='Draft' where workspace_id=v_workspace and status='Active';
  update public.grooming_tools set is_primary=false where workspace_id=v_workspace and is_primary;

  for item in select value from jsonb_array_elements(coalesce(payload->'profiles','[]')) loop
    insert into public.beard_profiles(id,workspace_id,owner_id,name,status,style_name,description,target_look,maintenance_frequency_days,preferred_overall_length_mm,density,texture,profile_details,created_at,updated_at)
    values ((item->>'id')::uuid,v_workspace,v_owner,item->>'name',item->>'status',item->>'style_name',coalesce(item->>'description',''),coalesce(item->>'target_look',''),(item->>'maintenance_frequency_days')::integer,(item->>'preferred_overall_length_mm')::numeric,item->>'density',item->>'texture',coalesce(item->'profile_details','{}'),(item->>'created_at')::timestamptz,(item->>'updated_at')::timestamptz)
    on conflict(id) do update set name=excluded.name,status=excluded.status,style_name=excluded.style_name,description=excluded.description,target_look=excluded.target_look,maintenance_frequency_days=excluded.maintenance_frequency_days,preferred_overall_length_mm=excluded.preferred_overall_length_mm,density=excluded.density,texture=excluded.texture,profile_details=excluded.profile_details,updated_at=excluded.updated_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(payload->'tools','[]')) loop
    parent_id := (item->>'id')::uuid;
    insert into public.grooming_tools(id,workspace_id,owner_id,name,brand,model,tool_type,minimum_length_mm,maximum_length_mm,adjustment_increment_mm,washable,notes,is_primary,status,created_at,updated_at)
    values (parent_id,v_workspace,v_owner,item->>'name',coalesce(item->>'brand',''),coalesce(item->>'model',''),item->>'tool_type',(item->>'minimum_length_mm')::numeric,(item->>'maximum_length_mm')::numeric,(item->>'adjustment_increment_mm')::numeric,coalesce((item->>'washable')::boolean,false),coalesce(item->>'notes',''),coalesce((item->>'is_primary')::boolean,false),item->>'status',(item->>'created_at')::timestamptz,(item->>'updated_at')::timestamptz)
    on conflict(id) do update set name=excluded.name,brand=excluded.brand,model=excluded.model,tool_type=excluded.tool_type,minimum_length_mm=excluded.minimum_length_mm,maximum_length_mm=excluded.maximum_length_mm,adjustment_increment_mm=excluded.adjustment_increment_mm,washable=excluded.washable,notes=excluded.notes,is_primary=excluded.is_primary,status=excluded.status,updated_at=excluded.updated_at;
    delete from public.grooming_tool_attachments where tool_id=parent_id;
    position:=0;
    for child in select value from jsonb_array_elements(coalesce(item->'attachments','[]')) loop
      position:=position+1;
      insert into public.grooming_tool_attachments(id,workspace_id,tool_id,name,display_order) values((child->>'id')::uuid,v_workspace,parent_id,child->>'name',position);
    end loop;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(payload->'length_maps','[]')) loop
    parent_id := (item->>'id')::uuid;
    insert into public.beard_length_maps(id,workspace_id,owner_id,profile_id,created_at,updated_at)
    values(parent_id,v_workspace,v_owner,(item->>'profile_id')::uuid,(item->>'created_at')::timestamptz,(item->>'updated_at')::timestamptz)
    on conflict(id) do update set profile_id=excluded.profile_id,updated_at=excluded.updated_at;
    delete from public.beard_length_map_zones where length_map_id=parent_id;
    for child in select value from jsonb_array_elements(coalesce(item->'zones','[]')) loop
      insert into public.beard_length_map_zones(id,workspace_id,length_map_id,zone_name,target_length_mm,minimum_length_mm,maximum_length_mm,trim_direction,tool_id,attachment_id,notes,display_order,enabled)
      values((child->>'id')::uuid,v_workspace,parent_id,child->>'zone_name',(child->>'target_length_mm')::numeric,(child->>'minimum_length_mm')::numeric,(child->>'maximum_length_mm')::numeric,child->>'trim_direction',nullif(child->>'tool_id','')::uuid,nullif(child->>'attachment_id','')::uuid,coalesce(child->>'notes',''),(child->>'display_order')::integer,coalesce((child->>'enabled')::boolean,true));
    end loop;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(payload->'recipes','[]')) loop
    parent_id := (item->>'id')::uuid;
    insert into public.trim_recipes(id,workspace_id,owner_id,profile_id,name,status,version,estimated_duration_minutes,starting_condition,preparation_instructions,finishing_instructions,preferred_products,notes,created_at,updated_at)
    values(parent_id,v_workspace,v_owner,(item->>'profile_id')::uuid,item->>'name',item->>'status',(item->>'version')::integer,(item->>'estimated_duration_minutes')::integer,coalesce(item->>'starting_condition',''),coalesce(item->>'preparation_instructions',''),coalesce(item->>'finishing_instructions',''),coalesce(item->'preferred_products','[]'),coalesce(item->>'notes',''),(item->>'created_at')::timestamptz,(item->>'updated_at')::timestamptz)
    on conflict(id) do update set profile_id=excluded.profile_id,name=excluded.name,status=excluded.status,version=excluded.version,estimated_duration_minutes=excluded.estimated_duration_minutes,starting_condition=excluded.starting_condition,preparation_instructions=excluded.preparation_instructions,finishing_instructions=excluded.finishing_instructions,preferred_products=excluded.preferred_products,notes=excluded.notes,updated_at=excluded.updated_at;
    delete from public.trim_recipe_steps where recipe_id=parent_id;
    for child in select value from jsonb_array_elements(coalesce(item->'steps','[]')) loop
      insert into public.trim_recipe_steps(id,workspace_id,recipe_id,display_order,title,zones,target_length_mm,tool_id,attachment_id,trim_direction,technique,instruction,caution,completion_required)
      values((child->>'id')::uuid,v_workspace,parent_id,(child->>'display_order')::integer,child->>'title',array(select jsonb_array_elements_text(coalesce(child->'zones','[]'))),(child->>'target_length_mm')::numeric,nullif(child->>'tool_id','')::uuid,nullif(child->>'attachment_id','')::uuid,nullif(child->>'trim_direction',''),child->>'technique',child->>'instruction',coalesce(child->>'caution',''),coalesce((child->>'completion_required')::boolean,false));
    end loop;
    delete from public.trim_recipe_product_links where recipe_id=parent_id;
    position:=0;
    for child in select value from jsonb_array_elements(coalesce(item->'preferred_products','[]')) loop
      position:=position+1;
      insert into public.trim_recipe_product_links(id,workspace_id,owner_id,recipe_id,product_id,product_name_snapshot,product_category_snapshot,usage_role,display_order)
      values(gen_random_uuid(),v_workspace,v_owner,parent_id,nullif(child->>'product_id',''),child->>'name_snapshot',coalesce(child->>'category_snapshot',''),child->>'role',position);
    end loop;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(payload->'sessions','[]')) loop
    insert into public.beard_trim_sessions(id,workspace_id,owner_id,recipe_id,recipe_version,status,current_step_index,completed_step_ids,skipped_step_ids,started_at,updated_at,completed_at)
    values((item->>'id')::uuid,v_workspace,v_owner,(item->>'recipe_id')::uuid,(item->>'recipe_version')::integer,item->>'status',(item->>'current_step_index')::integer,array(select jsonb_array_elements_text(coalesce(item->'completed_step_ids','[]')))::uuid[],array(select jsonb_array_elements_text(coalesce(item->'skipped_step_ids','[]')))::uuid[],(item->>'started_at')::timestamptz,(item->>'updated_at')::timestamptz,nullif(item->>'completed_at','')::timestamptz)
    on conflict(id) do update set status=excluded.status,current_step_index=excluded.current_step_index,completed_step_ids=excluded.completed_step_ids,skipped_step_ids=excluded.skipped_step_ids,updated_at=excluded.updated_at,completed_at=excluded.completed_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(payload->'logs','[]')) loop
    parent_id := (item->>'id')::uuid;
    insert into public.beard_log_entries(id,workspace_id,owner_id,session_id,profile_id,recipe_id,recipe_version,occurred_at,starting_condition,days_since_previous_trim,duration_minutes,overall_rating,fade_rating,line_sharpness_rating,symmetry_rating,comfort_rating,notes,what_worked,change_next_time,snapshot_schema_version,immutable_snapshot,image_references,created_at,updated_at)
    values(parent_id,v_workspace,v_owner,nullif(item->>'session_id','')::uuid,(item->>'profile_id')::uuid,nullif(item->>'recipe_id','')::uuid,(item->>'recipe_version')::integer,(item->>'occurred_at')::timestamptz,coalesce(item->>'starting_condition',''),(item->>'days_since_previous_trim')::integer,(item->>'duration_minutes')::integer,(item->>'overall_rating')::integer,(item->>'fade_rating')::integer,(item->>'line_sharpness_rating')::integer,(item->>'symmetry_rating')::integer,(item->>'comfort_rating')::integer,coalesce(item->>'notes',''),coalesce(item->>'what_worked',''),coalesce(item->>'change_next_time',''),coalesce((item->>'snapshot_schema_version')::integer,1),item->'immutable_snapshot',coalesce(item->'image_references','[]'),(item->>'created_at')::timestamptz,(item->>'updated_at')::timestamptz)
    on conflict(id) do nothing;
    if found then
      position:=0;
      for child in select value from jsonb_array_elements(coalesce(item->'products','[]')) loop
        position:=position+1;
        insert into public.beard_log_product_links(id,workspace_id,owner_id,beard_log_entry_id,product_id,product_name_snapshot,product_category_snapshot,usage_role,display_order)
        values(gen_random_uuid(),v_workspace,v_owner,parent_id,nullif(child->>'product_id',''),child->>'name_snapshot',coalesce(child->>'category_snapshot',''),child->>'role',position);
      end loop;
    end if;
  end loop;
  return jsonb_build_object('workspace_id',v_workspace,'saved_at',now());
end $$;
revoke all on function public.save_beard_studio_workspace(jsonb) from public, anon;
grant execute on function public.save_beard_studio_workspace(jsonb) to authenticated;
