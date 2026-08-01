begin;
select plan(45);

select has_column(
  'public','procurement_supplier_offers','source_raw_material_product_id',
  'Offers expose the routed raw-material source ID'
);
select has_column(
  'public','procurement_supplier_offers','source_packaging_product_id',
  'Offers expose the routed packaging source ID'
);
select is(
  (
    select attgenerated
    from pg_attribute
    where attrelid = 'public.procurement_supplier_offers'::regclass
      and attname = 'source_raw_material_product_id'
  ),
  's',
  'Raw-material source routing is a stored generated column'
);
select is(
  (
    select attgenerated
    from pg_attribute
    where attrelid = 'public.procurement_supplier_offers'::regclass
      and attname = 'source_packaging_product_id'
  ),
  's',
  'Packaging source routing is a stored generated column'
);
select matches(
  (
    select pg_get_expr(attribute_default.adbin, attribute_default.adrelid)
    from pg_attribute attribute
    join pg_attrdef attribute_default
      on attribute_default.adrelid = attribute.attrelid
     and attribute_default.adnum = attribute.attnum
    where attribute.attrelid = 'public.procurement_supplier_offers'::regclass
      and attribute.attname = 'source_raw_material_product_id'
  ),
  'raw_material',
  'Raw-material routing depends on the explicit source domain'
);
select matches(
  (
    select pg_get_expr(attribute_default.adbin, attribute_default.adrelid)
    from pg_attribute attribute
    join pg_attrdef attribute_default
      on attribute_default.adrelid = attribute.attrelid
     and attribute_default.adnum = attribute.attnum
    where attribute.attrelid = 'public.procurement_supplier_offers'::regclass
      and attribute.attname = 'source_packaging_product_id'
  ),
  'packaging',
  'Packaging routing depends on the explicit source domain'
);

select ok(
  exists(
    select 1 from pg_constraint
    where conrelid = 'public.packaging_supplier_products'::regclass
      and conname = 'packaging_supplier_products_workspace_owner_fk'
      and contype = 'f'
  ),
  'Packaging Supplier Products have an owner/workspace foreign key'
);
select is(
  (
    select confrelid
    from pg_constraint
    where conrelid = 'public.packaging_supplier_products'::regclass
      and conname = 'packaging_supplier_products_workspace_owner_fk'
  ),
  'public.workspaces'::regclass::oid,
  'Packaging Supplier Product ownership references workspaces'
);
select is(
  (
    select array_agg(attribute.attname order by key.ordinality)
    from pg_constraint constraint_definition
    cross join unnest(constraint_definition.conkey) with ordinality key(attnum, ordinality)
    join pg_attribute attribute
      on attribute.attrelid = constraint_definition.conrelid
     and attribute.attnum = key.attnum
    where constraint_definition.conrelid = 'public.packaging_supplier_products'::regclass
      and constraint_definition.conname = 'packaging_supplier_products_workspace_owner_fk'
  ),
  array['workspace_id','owner_id']::name[],
  'Packaging Supplier Product ownership binds workspace and owner'
);

select ok(
  exists(
    select 1 from pg_constraint
    where conrelid = 'public.supplier_products'::regclass
      and conname = 'supplier_products_offer_source_identity_unique'
      and contype = 'u'
  ),
  'Raw-material source identity has a composite unique key'
);
select is(
  (
    select array_agg(attribute.attname order by key.ordinality)
    from pg_constraint constraint_definition
    cross join unnest(constraint_definition.conkey) with ordinality key(attnum, ordinality)
    join pg_attribute attribute
      on attribute.attrelid = constraint_definition.conrelid
     and attribute.attnum = key.attnum
    where constraint_definition.conrelid = 'public.supplier_products'::regclass
      and constraint_definition.conname = 'supplier_products_offer_source_identity_unique'
  ),
  array['workspace_id','owner_id','id','supplier_id']::name[],
  'Raw-material source identity includes workspace, owner, ID, and Supplier'
);
select ok(
  exists(
    select 1 from pg_constraint
    where conrelid = 'public.packaging_supplier_products'::regclass
      and conname = 'packaging_supplier_products_offer_source_identity_unique'
      and contype = 'u'
  ),
  'Packaging source identity has a composite unique key'
);
select is(
  (
    select array_agg(attribute.attname order by key.ordinality)
    from pg_constraint constraint_definition
    cross join unnest(constraint_definition.conkey) with ordinality key(attnum, ordinality)
    join pg_attribute attribute
      on attribute.attrelid = constraint_definition.conrelid
     and attribute.attnum = key.attnum
    where constraint_definition.conrelid = 'public.packaging_supplier_products'::regclass
      and constraint_definition.conname = 'packaging_supplier_products_offer_source_identity_unique'
  ),
  array['workspace_id','owner_id','id','supplier_id']::name[],
  'Packaging source identity includes workspace, owner, ID, and Supplier'
);

select ok(
  exists(
    select 1 from pg_constraint
    where conrelid = 'public.procurement_supplier_offers'::regclass
      and conname = 'procurement_supplier_offers_workspace_owner_fk'
      and contype = 'f'
  ),
  'Offers have an owner/workspace foreign key'
);
select is(
  (
    select array_agg(attribute.attname order by key.ordinality)
    from pg_constraint constraint_definition
    cross join unnest(constraint_definition.conkey) with ordinality key(attnum, ordinality)
    join pg_attribute attribute
      on attribute.attrelid = constraint_definition.conrelid
     and attribute.attnum = key.attnum
    where constraint_definition.conrelid = 'public.procurement_supplier_offers'::regclass
      and constraint_definition.conname = 'procurement_supplier_offers_workspace_owner_fk'
  ),
  array['workspace_id','owner_id']::name[],
  'Offer ownership binds workspace and owner'
);
select ok(
  exists(
    select 1 from pg_constraint
    where conrelid = 'public.procurement_supplier_offers'::regclass
      and conname = 'procurement_supplier_offers_source_pair'
      and contype = 'c'
  ),
  'Offers have an explicit source-pair check'
);
select matches(
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conrelid = 'public.procurement_supplier_offers'::regclass
      and conname = 'procurement_supplier_offers_source_pair'
  ),
  'num_nonnulls.*0, 2',
  'Offer source pair accepts exactly zero or two source fields'
);

select ok(
  exists(
    select 1 from pg_constraint
    where conrelid = 'public.procurement_supplier_offers'::regclass
      and conname = 'procurement_supplier_offers_raw_material_source_fk'
      and contype = 'f'
  ),
  'Offers have a raw-material source foreign key'
);
select is(
  (
    select confrelid
    from pg_constraint
    where conrelid = 'public.procurement_supplier_offers'::regclass
      and conname = 'procurement_supplier_offers_raw_material_source_fk'
  ),
  'public.supplier_products'::regclass::oid,
  'Raw-material Offer sources reference canonical Supplier Products'
);
select is(
  (
    select array_agg(attribute.attname order by key.ordinality)
    from pg_constraint constraint_definition
    cross join unnest(constraint_definition.conkey) with ordinality key(attnum, ordinality)
    join pg_attribute attribute
      on attribute.attrelid = constraint_definition.conrelid
     and attribute.attnum = key.attnum
    where constraint_definition.conrelid = 'public.procurement_supplier_offers'::regclass
      and constraint_definition.conname = 'procurement_supplier_offers_raw_material_source_fk'
  ),
  array['workspace_id','owner_id','source_raw_material_product_id','supplier_id']::name[],
  'Raw-material Offer source binds workspace, owner, routed ID, and Supplier'
);
select is(
  (
    select array_agg(attribute.attname order by key.ordinality)
    from pg_constraint constraint_definition
    cross join unnest(constraint_definition.confkey) with ordinality key(attnum, ordinality)
    join pg_attribute attribute
      on attribute.attrelid = constraint_definition.confrelid
     and attribute.attnum = key.attnum
    where constraint_definition.conrelid = 'public.procurement_supplier_offers'::regclass
      and constraint_definition.conname = 'procurement_supplier_offers_raw_material_source_fk'
  ),
  array['workspace_id','owner_id','id','supplier_id']::name[],
  'Raw-material source target uses the same full identity'
);

select ok(
  exists(
    select 1 from pg_constraint
    where conrelid = 'public.procurement_supplier_offers'::regclass
      and conname = 'procurement_supplier_offers_packaging_source_fk'
      and contype = 'f'
  ),
  'Offers have a packaging source foreign key'
);
select is(
  (
    select confrelid
    from pg_constraint
    where conrelid = 'public.procurement_supplier_offers'::regclass
      and conname = 'procurement_supplier_offers_packaging_source_fk'
  ),
  'public.packaging_supplier_products'::regclass::oid,
  'Packaging Offer sources reference canonical Packaging Supplier Products'
);
select is(
  (
    select array_agg(attribute.attname order by key.ordinality)
    from pg_constraint constraint_definition
    cross join unnest(constraint_definition.conkey) with ordinality key(attnum, ordinality)
    join pg_attribute attribute
      on attribute.attrelid = constraint_definition.conrelid
     and attribute.attnum = key.attnum
    where constraint_definition.conrelid = 'public.procurement_supplier_offers'::regclass
      and constraint_definition.conname = 'procurement_supplier_offers_packaging_source_fk'
  ),
  array['workspace_id','owner_id','source_packaging_product_id','supplier_id']::name[],
  'Packaging Offer source binds workspace, owner, routed ID, and Supplier'
);
select is(
  (
    select array_agg(attribute.attname order by key.ordinality)
    from pg_constraint constraint_definition
    cross join unnest(constraint_definition.confkey) with ordinality key(attnum, ordinality)
    join pg_attribute attribute
      on attribute.attrelid = constraint_definition.confrelid
     and attribute.attnum = key.attnum
    where constraint_definition.conrelid = 'public.procurement_supplier_offers'::regclass
      and constraint_definition.conname = 'procurement_supplier_offers_packaging_source_fk'
  ),
  array['workspace_id','owner_id','id','supplier_id']::name[],
  'Packaging source target uses the same full identity'
);

select has_index(
  'public','procurement_supplier_offers','procurement_supplier_offers_raw_material_source',
  'Linked raw-material Offers have a focused lookup index'
);
select matches(
  (
    select pg_get_expr(indpred, indrelid)
    from pg_index
    where indexrelid = 'public.procurement_supplier_offers_raw_material_source'::regclass
  ),
  'source_raw_material_product_id IS NOT NULL',
  'Raw-material Offer index excludes manual and packaging Offers'
);
select has_index(
  'public','procurement_supplier_offers','procurement_supplier_offers_packaging_source',
  'Linked packaging Offers have a focused lookup index'
);
select matches(
  (
    select pg_get_expr(indpred, indrelid)
    from pg_index
    where indexrelid = 'public.procurement_supplier_offers_packaging_source'::regclass
  ),
  'source_packaging_product_id IS NOT NULL',
  'Packaging Offer index excludes manual and raw-material Offers'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.packaging_supplier_products'::regclass),
  true,
  'Packaging Supplier Products retain RLS'
);
select policies_are('public','packaging_supplier_products',array['owner_all']);
select is(
  (
    select cmd from pg_policies
    where schemaname = 'public'
      and tablename = 'packaging_supplier_products'
      and policyname = 'owner_all'
  ),
  'ALL',
  'Packaging Supplier Product policy covers all owner operations'
);
select is(
  (
    select roles from pg_policies
    where schemaname = 'public'
      and tablename = 'packaging_supplier_products'
      and policyname = 'owner_all'
  ),
  array['authenticated']::name[],
  'Packaging Supplier Product policy is authenticated-only'
);
select ok(
  (
    select position('auth.uid' in qual) > 0 and position('workspaces' in qual) > 0
    from pg_policies
    where schemaname = 'public'
      and tablename = 'packaging_supplier_products'
      and policyname = 'owner_all'
  ),
  'Packaging Supplier Product reads bind owner and workspace'
);
select matches(
  (
    select with_check from pg_policies
    where schemaname = 'public'
      and tablename = 'packaging_supplier_products'
      and policyname = 'owner_all'
  ),
  'lifecycle_state.*active',
  'Packaging Supplier Product writes require the active owner workspace'
);

select has_function(
  'public','validate_procurement_offer_source_usability_v1',array[]::text[],
  'Offer source usability trigger function exists'
);
select is(
  (
    select prosecdef
    from pg_proc
    where oid = 'public.validate_procurement_offer_source_usability_v1()'::regprocedure
  ),
  false,
  'Offer source usability validation is security invoker'
);
select is(
  (
    select proconfig[1]
    from pg_proc
    where oid = 'public.validate_procurement_offer_source_usability_v1()'::regprocedure
  ),
  'search_path=""',
  'Offer source usability validation has an empty fixed search path'
);
select is(
  has_function_privilege(
    'public','public.validate_procurement_offer_source_usability_v1()','EXECUTE'
  ),
  false,
  'PUBLIC cannot call the trigger function'
);
select is(
  has_function_privilege(
    'anon','public.validate_procurement_offer_source_usability_v1()','EXECUTE'
  ),
  false,
  'Anonymous callers cannot call the trigger function'
);
select is(
  has_function_privilege(
    'authenticated','public.validate_procurement_offer_source_usability_v1()','EXECUTE'
  ),
  false,
  'Authenticated callers cannot call the trigger function directly'
);
select ok(
  exists(
    select 1 from pg_trigger
    where tgrelid = 'public.procurement_supplier_offers'::regclass
      and tgname = 'validate_procurement_offer_source_usability'
      and not tgisinternal
  ),
  'Offer source usability validation is installed as a trigger'
);
select is(
  (
    select tgfoid
    from pg_trigger
    where tgrelid = 'public.procurement_supplier_offers'::regclass
      and tgname = 'validate_procurement_offer_source_usability'
      and not tgisinternal
  ),
  'public.validate_procurement_offer_source_usability_v1()'::regprocedure::oid,
  'Offer source trigger invokes only the non-callable usability function'
);

insert into auth.users(id,email,created_at,updated_at)
values(
  '10000000-0000-4000-8000-000000000098',
  'commercial-provenance-pgtap@example.invalid',
  clock_timestamp(),clock_timestamp()
);
insert into public.workspaces(id,owner_id,name,lifecycle_state)
values(
  '20000000-0000-4000-8000-000000000098',
  '10000000-0000-4000-8000-000000000098',
  'Commercial provenance pgTAP','active'
);
insert into public.suppliers(
  id,workspace_id,owner_id,legal_name,supplier_type,status,internal_notes,is_preferred
) values(
  '30000000-0000-4000-8000-000000000098',
  '20000000-0000-4000-8000-000000000098',
  '10000000-0000-4000-8000-000000000098',
  'Manual Offer Supplier','general','research','',false
);
insert into public.procurement_requests(id,workspace_id,owner_id,title)
values(
  '40000000-0000-4000-8000-000000000098',
  '20000000-0000-4000-8000-000000000098',
  '10000000-0000-4000-8000-000000000098',
  'Manual Offer request'
);
insert into public.procurement_requested_items(
  id,workspace_id,owner_id,procurement_request_id,name,category,
  requested_quantity,unit
) values(
  '50000000-0000-4000-8000-000000000098',
  '20000000-0000-4000-8000-000000000098',
  '10000000-0000-4000-8000-000000000098',
  '40000000-0000-4000-8000-000000000098',
  'Manual Offer item','raw_material',1,'kg'
);

select lives_ok(
  $sql$
    insert into public.procurement_supplier_offers(
      id,workspace_id,owner_id,requested_item_id,supplier_id,
      source_supplier_product_domain,source_supplier_product_id,
      product_title,package_quantity,package_unit,date_checked
    ) values(
      '60000000-0000-4000-8000-000000000098',
      '20000000-0000-4000-8000-000000000098',
      '10000000-0000-4000-8000-000000000098',
      '50000000-0000-4000-8000-000000000098',
      '30000000-0000-4000-8000-000000000098',
      null,null,'Manual commercial observation',1,'kg','2026-08-01'
    )
  $sql$,
  'A genuine manual Offer with a NULL/NULL source remains valid'
);
select is(
  (
    select count(*)::integer
    from public.procurement_supplier_offers
    where id = '60000000-0000-4000-8000-000000000098'
      and source_supplier_product_domain is null
      and source_supplier_product_id is null
      and source_raw_material_product_id is null
      and source_packaging_product_id is null
  ),
  1,
  'Manual Offer source and generated routing columns remain NULL'
);

select * from finish();
rollback;
