-- Phase 9: durable Product Studio drafts. Curated architectures and rules remain code-backed.
create table public.product_studio_concepts (
  id text primary key,
  workspace_id uuid not null,
  owner_id uuid not null,
  name text not null check(length(trim(name))>0),
  product_type text not null check(product_type in('beard_oil')),
  intent_mode text not null check(intent_mode in('make_today','design')),
  desired_properties text[] not null default '{}',
  selected_ingredients jsonb not null default '[]'::jsonb check(jsonb_typeof(selected_ingredients)='array'),
  scent_directions text[] not null default '{}',
  candidate_substitutes jsonb not null default '{}'::jsonb check(jsonb_typeof(candidate_substitutes)='object'),
  notes text not null default '',
  analysis jsonb not null default '{}'::jsonb check(jsonb_typeof(analysis)='object'),
  generated_product_id text,
  generated_formula_id text,
  generated_formula_version_id text,
  procurement_plan_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id,id),
  foreign key(workspace_id,owner_id) references public.workspaces(id,owner_id) on delete cascade,
  foreign key(workspace_id,generated_product_id) references public.products(workspace_id,id),
  foreign key(workspace_id,generated_formula_id) references public.formulas(workspace_id,id),
  foreign key(workspace_id,generated_formula_version_id) references public.formula_versions(workspace_id,id),
  foreign key(workspace_id,procurement_plan_id) references public.purchase_plans(workspace_id,id)
);

create index product_studio_concepts_recent on public.product_studio_concepts(workspace_id,updated_at desc);
alter table public.product_studio_concepts enable row level security;
create policy product_studio_concepts_owner_all on public.product_studio_concepts
  for all to authenticated
  using(owner_id=auth.uid())
  with check(owner_id=auth.uid() and exists(
    select 1 from public.workspaces w
    where w.id=workspace_id and w.owner_id=auth.uid() and w.lifecycle_state='active'
  ));
revoke all on public.product_studio_concepts from anon;
grant select,insert,update,delete on public.product_studio_concepts to authenticated;

create or replace function public.create_product_studio_purchase_plan(concept_id text, lines jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); concept product_studio_concepts; plan_id uuid; item jsonb; domain text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into concept from product_studio_concepts where id=concept_id and owner_id=uid for update;
  if concept.id is null then raise exception 'Product Studio concept unavailable'; end if;
  if concept.procurement_plan_id is not null then return concept.procurement_plan_id; end if;
  insert into purchase_plans(workspace_id,owner_id,title,status,purpose,source_type,source_id,internal_notes,creation_key)
  values(concept.workspace_id,uid,concept.name||' — missing items','draft','Product Studio design target; review before any external order.','product_studio_concept',concept.id,'Predicted requirements only. No purchase, receipt or stock movement has occurred.',gen_random_uuid())
  returning id into plan_id;
  for item in select * from jsonb_array_elements(coalesce(lines,'[]'::jsonb)) loop
    domain:=coalesce(item->>'inventoryDomain','raw_material');
    insert into purchase_plan_lines(workspace_id,owner_id,purchase_plan_id,inventory_domain,supplier_product_id,description,planned_quantity,unit,requirement_reason,requirement_basis,display_order)
    values(concept.workspace_id,uid,plan_id,domain,nullif(item->>'supplierProductId',''),item->>'description',greatest(coalesce((item->>'quantity')::numeric,1),0.000001),coalesce(item->>'unit','pcs'),coalesce(item->>'reason','Product Studio requirement'),coalesce(item->'basis','{}'::jsonb),coalesce((item->>'displayOrder')::integer,0));
  end loop;
  update product_studio_concepts set procurement_plan_id=plan_id,updated_at=now() where id=concept.id;
  return plan_id;
end $$;
revoke all on function public.create_product_studio_purchase_plan(text,jsonb) from public,anon;
grant execute on function public.create_product_studio_purchase_plan(text,jsonb) to authenticated;
