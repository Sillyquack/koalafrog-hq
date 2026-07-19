-- Product Studio Formula handoff must commit Product, Formula, Version, Lines, and concept link atomically.
create or replace function public.create_product_studio_formula_handoff(
  concept_id text,
  product jsonb,
  formula jsonb,
  formula_version jsonb,
  formula_lines jsonb
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  uid uuid:=auth.uid();
  wid uuid;
  concept public.product_studio_concepts;
  line jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select id into wid from public.workspaces where owner_id=uid and lifecycle_state='active';
  if wid is null then raise exception 'Active workspace required'; end if;

  select * into concept
  from public.product_studio_concepts
  where workspace_id=wid and owner_id=uid and id=concept_id
  for update;
  if concept.id is null then raise exception 'Product Studio concept unavailable'; end if;

  if concept.generated_product_id is not null
    and concept.generated_formula_id is not null
    and concept.generated_formula_version_id is not null then
    return jsonb_build_object(
      'productId',concept.generated_product_id,
      'formulaId',concept.generated_formula_id,
      'formulaVersionId',concept.generated_formula_version_id
    );
  end if;

  insert into public.products(
    workspace_id,owner_id,id,name,category,status,development_stage,description,
    scent_profile,created_at,updated_at
  ) values(
    wid,uid,product->>'id',product->>'name',product->>'category',product->>'status',
    product->>'development_stage',product->>'description',product->>'scent_profile',
    product->>'created_at',product->>'updated_at'
  );

  insert into public.formulas(
    workspace_id,owner_id,id,product_id,name,description,created_at,updated_at
  ) values(
    wid,uid,formula->>'id',formula->>'product_id',formula->>'name',
    formula->>'description',formula->>'created_at',formula->>'updated_at'
  );

  insert into public.formula_versions(
    workspace_id,owner_id,id,formula_id,version,status,description,target_characteristics,
    process_instructions,development_notes,phase_definitions,manufacturing_process,
    created_at,updated_at
  ) values(
    wid,uid,formula_version->>'id',formula_version->>'formula_id',
    formula_version->>'version',formula_version->>'status',formula_version->>'description',
    formula_version->>'target_characteristics',formula_version->>'process_instructions',
    formula_version->>'development_notes',
    coalesce(nullif(formula_version->'phase_definitions','null'::jsonb),'[]'::jsonb),
    coalesce(nullif(formula_version->'manufacturing_process','null'::jsonb),'[]'::jsonb),
    formula_version->>'created_at',formula_version->>'updated_at'
  );

  for line in select value from jsonb_array_elements(coalesce(formula_lines,'[]'::jsonb)) loop
    insert into public.formula_lines(
      workspace_id,owner_id,id,formula_version_id,ingredient_id,percentage,phase,
      sort_order,notes,formulation_role
    ) values(
      wid,uid,line->>'id',line->>'formula_version_id',line->>'ingredient_id',
      (line->>'percentage')::numeric,line->>'phase',(line->>'sort_order')::integer,
      line->>'notes',line->>'formulation_role'
    );
  end loop;

  update public.products
  set current_development_formula_version_id=formula_version->>'id'
  where workspace_id=wid and owner_id=uid and id=product->>'id';

  update public.product_studio_concepts
  set generated_product_id=product->>'id',
      generated_formula_id=formula->>'id',
      generated_formula_version_id=formula_version->>'id',
      updated_at=coalesce((product->>'updated_at')::timestamptz,updated_at)
  where workspace_id=wid and owner_id=uid and id=concept_id;

  return jsonb_build_object(
    'productId',product->>'id',
    'formulaId',formula->>'id',
    'formulaVersionId',formula_version->>'id'
  );
end $$;

revoke all on function public.create_product_studio_formula_handoff(text,jsonb,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.create_product_studio_formula_handoff(text,jsonb,jsonb,jsonb,jsonb) to authenticated;
