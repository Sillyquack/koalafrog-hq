do $$
begin
  if exists (
    select 1
    from public.supplier_products supplier_product
    left join public.workspaces workspace
      on workspace.id = supplier_product.workspace_id
     and workspace.owner_id = supplier_product.owner_id
    where workspace.id is null
  ) then
    raise exception
      'Cannot enforce Supplier Product workspace ownership: inconsistent rows exist';
  end if;
end
$$;

alter table public.supplier_products
  add constraint supplier_products_workspace_owner_fk
  foreign key (workspace_id, owner_id)
  references public.workspaces(id, owner_id);

drop policy owner_all on public.supplier_products;

create policy owner_all
  on public.supplier_products
  for all
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.workspaces workspace
      where workspace.id = supplier_products.workspace_id
        and workspace.owner_id = (select auth.uid())
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.workspaces workspace
      where workspace.id = supplier_products.workspace_id
        and workspace.owner_id = (select auth.uid())
        and workspace.lifecycle_state = 'active'
    )
  );
