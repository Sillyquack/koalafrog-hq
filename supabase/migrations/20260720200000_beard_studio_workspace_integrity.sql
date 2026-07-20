-- Every Beard Studio child relationship is workspace-scoped. RLS controls
-- visibility; these constraints independently prevent cross-workspace links.
alter table public.grooming_tool_attachments
  add constraint grooming_tool_attachments_id_workspace_unique unique (id, workspace_id);
alter table public.beard_trim_sessions
  add constraint beard_trim_sessions_id_workspace_unique unique (id, workspace_id);
alter table public.beard_log_entries
  add constraint beard_log_entries_id_workspace_unique unique (id, workspace_id);

alter table public.beard_length_map_zones
  drop constraint beard_length_map_zones_attachment_id_fkey,
  add constraint beard_length_map_zones_attachment_workspace_fkey
    foreign key (attachment_id, workspace_id)
    references public.grooming_tool_attachments(id, workspace_id)
    on delete set null (attachment_id);

alter table public.trim_recipe_steps
  drop constraint trim_recipe_steps_attachment_id_fkey,
  add constraint trim_recipe_steps_attachment_workspace_fkey
    foreign key (attachment_id, workspace_id)
    references public.grooming_tool_attachments(id, workspace_id)
    on delete set null (attachment_id);

alter table public.beard_log_entries
  drop constraint beard_log_entries_session_id_fkey,
  add constraint beard_log_entries_session_workspace_fkey
    foreign key (session_id, workspace_id)
    references public.beard_trim_sessions(id, workspace_id);

alter table public.beard_log_product_links
  drop constraint beard_log_product_links_beard_log_entry_id_fkey,
  add constraint beard_log_product_links_log_workspace_fkey
    foreign key (beard_log_entry_id, workspace_id)
    references public.beard_log_entries(id, workspace_id)
    on delete cascade;
