-- Make relational Product links the only recipe Product source and enforce the
-- remaining Beard Studio closed sets at the database boundary.
do $migration$
declare
  definition text;
begin
  select pg_get_functiondef('public.save_beard_studio_workspace(jsonb)'::regprocedure)
  into definition;

  definition := replace(
    definition,
    'finishing_instructions,preferred_products,notes,created_at,updated_at)',
    'finishing_instructions,notes,created_at,updated_at)'
  );
  definition := replace(
    definition,
    'coalesce(item->>''finishing_instructions'',''''),coalesce(item->''preferred_products'',''[]''),coalesce(item->>''notes'','''')',
    'coalesce(item->>''finishing_instructions'',''''),coalesce(item->>''notes'','''')'
  );
  definition := replace(
    definition,
    ',preferred_products=excluded.preferred_products,notes=excluded.notes',
    ',notes=excluded.notes'
  );
  definition := replace(
    definition,
    'item->''preferred_products''',
    'item->''product_links'''
  );

  if definition like '%preferred_products%' then
    raise exception 'Could not remove deprecated trim_recipes.preferred_products handling from save RPC';
  end if;
  execute definition;
end
$migration$;

alter table public.trim_recipes drop column preferred_products;

alter table public.grooming_tools
  add constraint grooming_tools_tool_type_check
  check (tool_type in ('beard trimmer','detail trimmer','foil shaver','razor','scissors','comb','brush','other'));

alter table public.trim_recipe_steps
  add constraint trim_recipe_steps_technique_check
  check (technique in ('full pass','light pass','flick-out','blend','define line','detail','freehand','scissors'));

alter table public.beard_length_map_zones
  add constraint beard_length_map_zones_zone_name_check
  check (zone_name in ('upper sideburn','lower sideburn','upper cheek','lower cheek','jaw left','jaw right','chin','under-chin','moustache','soul patch','neckline transition'));

alter table public.trim_recipe_product_links
  add constraint trim_recipe_product_links_usage_role_check
  check (usage_role in ('pre-trim','beard wash','conditioner','beard oil','beard butter','beard balm','styling product','post-trim soothing','fragrance'));

alter table public.beard_log_product_links
  add constraint beard_log_product_links_usage_role_check
  check (usage_role in ('pre-trim','beard wash','conditioner','beard oil','beard butter','beard balm','styling product','post-trim soothing','fragrance'));
