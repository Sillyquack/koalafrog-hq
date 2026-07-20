-- Direct Beard Log edits remain forbidden. Referential cascades caused by an
-- explicit workspace/owner deletion must be able to complete.
create or replace function public.prevent_beard_log_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op='DELETE' and pg_trigger_depth()>1 then
    return old;
  end if;
  raise exception 'Beard Log entries are immutable; create a correction entry.';
end
$$;

-- Owner deletion cascades through both workspaces and owner-scoped Beard rows.
-- Defer non-cascading cross-table checks so the workspace cascade can remove
-- the complete aggregate before PostgreSQL validates those relationships.
alter table public.beard_length_map_zones
  alter constraint beard_length_map_zones_tool_id_workspace_id_fkey
  deferrable initially deferred;
alter table public.trim_recipes
  alter constraint trim_recipes_profile_id_workspace_id_fkey
  deferrable initially deferred;
alter table public.trim_recipe_steps
  alter constraint trim_recipe_steps_tool_id_workspace_id_fkey
  deferrable initially deferred;
alter table public.beard_trim_sessions
  alter constraint beard_trim_sessions_recipe_id_workspace_id_fkey
  deferrable initially deferred;
alter table public.beard_log_entries
  alter constraint beard_log_entries_profile_id_workspace_id_fkey
  deferrable initially deferred,
  alter constraint beard_log_entries_recipe_id_workspace_id_fkey
  deferrable initially deferred,
  alter constraint beard_log_entries_session_workspace_fkey
  deferrable initially deferred;
alter table public.trim_recipe_product_links
  alter constraint trim_recipe_product_links_workspace_id_product_id_fkey
  deferrable initially deferred;
alter table public.beard_log_product_links
  alter constraint beard_log_product_links_workspace_id_product_id_fkey
  deferrable initially deferred;
