-- v0.12.0 Phase 1: allow the registry-backed Natural Deodorant Product Studio template.
alter table public.product_studio_concepts
  drop constraint product_studio_concepts_product_type_check,
  add constraint product_studio_concepts_product_type_check
    check(product_type in('beard_oil','beard_butter','natural_deodorant'));
