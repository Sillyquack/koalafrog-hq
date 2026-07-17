alter table public.ingredients
  add column reference_entry_id text,
  add column adopted_reference_version integer,
  add column adopted_reference_snapshot jsonb,
  add column reference_adoption_key uuid;

create unique index ingredients_reference_entry_once
  on public.ingredients(workspace_id,reference_entry_id) where reference_entry_id is not null;
create unique index ingredients_reference_adoption_idempotency
  on public.ingredients(workspace_id,reference_adoption_key) where reference_adoption_key is not null;

comment on column public.ingredients.reference_entry_id is 'Application-shipped Ingredient Reference Library provenance; never stock or regulatory approval.';
