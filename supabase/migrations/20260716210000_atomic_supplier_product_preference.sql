do $$
begin
  if exists (
    select 1 from public.supplier_products
    where is_preferred
    group by workspace_id, ingredient_id having count(*) > 1
  ) then raise exception 'Duplicate preferred raw-material Supplier Products must be reviewed before applying this migration';
  end if;
  if exists (
    select 1 from public.packaging_supplier_products
    where is_preferred
    group by workspace_id, packaging_component_id having count(*) > 1
  ) then raise exception 'Duplicate preferred Packaging Supplier Products must be reviewed before applying this migration';
  end if;
end $$;

create unique index supplier_products_one_preferred_per_ingredient
  on public.supplier_products(workspace_id, ingredient_id) where is_preferred;
create unique index packaging_supplier_products_one_preferred_per_component
  on public.packaging_supplier_products(workspace_id, packaging_component_id) where is_preferred;

create or replace function public.mark_supplier_product_preferred(p_product_id text, p_expected_updated_at text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); selected public.supplier_products;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into selected from public.supplier_products where id=p_product_id and owner_id=uid for update;
  if selected.id is null then raise exception 'Supplier Product unavailable'; end if;
  if selected.is_preferred then return; end if;
  if selected.updated_at is distinct from p_expected_updated_at then raise exception 'Supplier Product changed; refresh and retry'; end if;
  update public.supplier_products set is_preferred=false,updated_at=transaction_timestamp()::text
    where workspace_id=selected.workspace_id and ingredient_id=selected.ingredient_id and is_preferred;
  update public.supplier_products set is_preferred=true,updated_at=transaction_timestamp()::text
    where workspace_id=selected.workspace_id and id=selected.id;
end $$;

create or replace function public.mark_packaging_supplier_product_preferred(p_product_id text, p_expected_updated_at text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); selected public.packaging_supplier_products;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select * into selected from public.packaging_supplier_products where id=p_product_id and owner_id=uid for update;
  if selected.id is null then raise exception 'Packaging Supplier Product unavailable'; end if;
  if selected.is_preferred then return; end if;
  if selected.updated_at is distinct from p_expected_updated_at then raise exception 'Packaging Supplier Product changed; refresh and retry'; end if;
  update public.packaging_supplier_products set is_preferred=false,updated_at=transaction_timestamp()::text
    where workspace_id=selected.workspace_id and packaging_component_id=selected.packaging_component_id and is_preferred;
  update public.packaging_supplier_products set is_preferred=true,updated_at=transaction_timestamp()::text
    where workspace_id=selected.workspace_id and id=selected.id;
end $$;

revoke all on function public.mark_supplier_product_preferred(text,text) from public,anon;
revoke all on function public.mark_packaging_supplier_product_preferred(text,text) from public,anon;
grant execute on function public.mark_supplier_product_preferred(text,text) to authenticated;
grant execute on function public.mark_packaging_supplier_product_preferred(text,text) to authenticated;
