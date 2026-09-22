alter table public.product_studio_concepts
  drop constraint if exists product_studio_concepts_product_type_check;

alter table public.product_studio_concepts
  add constraint product_studio_concepts_product_type_check
  check (
    product_type = any (
      array[
        'beard_oil'::text,
        'natural_deodorant'::text,
        'solid_cologne'::text,
        'hard_surface_cleaner'::text,
        'face_moisturizer'::text,
        'liquid_hand_wash'::text,
        'lip_balm'::text,
        'beard_butter'::text,
        'foot_care'::text,
        'fragrance'::text
      ]
    )
  );
