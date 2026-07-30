begin;
select plan(7);

select has_fk(
  'public',
  'supplier_products',
  'Supplier Products have foreign-key integrity'
);

select is(
  (
    select confrelid
    from pg_constraint
    where conrelid = 'public.supplier_products'::regclass
      and conname = 'supplier_products_workspace_owner_fk'
  ),
  'public.workspaces'::regclass::oid,
  'Supplier Product workspace ownership references workspaces'
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
      and constraint_definition.conname = 'supplier_products_workspace_owner_fk'
  ),
  array['workspace_id', 'owner_id']::name[],
  'Supplier Product workspace ownership binds both workspace and owner'
);

select policies_are('public', 'supplier_products', array['owner_all']);

select is(
  (
    select cmd
    from pg_policies
    where schemaname = 'public'
      and tablename = 'supplier_products'
      and policyname = 'owner_all'
  ),
  'ALL',
  'Supplier Product owner policy covers every write operation'
);

select is(
  (
    select roles
    from pg_policies
    where schemaname = 'public'
      and tablename = 'supplier_products'
      and policyname = 'owner_all'
  ),
  array['authenticated']::name[],
  'Supplier Product owner policy is scoped to authenticated users'
);

select matches(
  (
    select with_check
    from pg_policies
    where schemaname = 'public'
      and tablename = 'supplier_products'
      and policyname = 'owner_all'
  ),
  'lifecycle_state.*active',
  'Supplier Product writes require an active owner workspace'
);

select * from finish();
rollback;
