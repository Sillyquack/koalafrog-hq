-- Mutable attachment collections are replaced transactionally. Existing zone
-- and step references become null briefly inside the same transaction, then the
-- intended references are restored when those child collections are replaced.
alter table public.beard_length_map_zones drop constraint beard_length_map_zones_attachment_id_fkey;
alter table public.beard_length_map_zones add constraint beard_length_map_zones_attachment_id_fkey foreign key (attachment_id) references public.grooming_tool_attachments(id) on delete set null;
alter table public.trim_recipe_steps drop constraint trim_recipe_steps_attachment_id_fkey;
alter table public.trim_recipe_steps add constraint trim_recipe_steps_attachment_id_fkey foreign key (attachment_id) references public.grooming_tool_attachments(id) on delete set null;

grant delete on public.grooming_tool_attachments, public.beard_length_map_zones, public.trim_recipe_steps to authenticated;
