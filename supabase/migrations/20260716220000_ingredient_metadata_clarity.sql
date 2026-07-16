alter table public.ingredients
  add column cosing_functions text[],
  add column cosing_verification_status text check(cosing_verification_status in('unverified','verified_from_cosing','needs_review')),
  add column cosing_verified_at text,
  add column cosing_source_reference text;

alter table public.formula_lines
  add column formulation_role text;

comment on column public.ingredients.functions is 'Legacy ambiguous v9 functions; preserved for compatibility and never treated as verified CosIng metadata.';
comment on column public.ingredients.cosing_functions is 'Informational classifications copied from the exact active CosIng ingredient entry; not safety or regulatory approval.';
comment on column public.formula_lines.formulation_role is 'Human-authored, Formula-Version-specific reason for using this Ingredient.';
