-- Keep the atomic RPC timestamp identical to the committed workspace state so
-- repeated preference switches remain concurrency-safe without a forced refresh.
create or replace function public.mark_supplier_product_preferred(p_product_id text,p_expected_updated_at text,p_new_updated_at text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); selected public.supplier_products;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_new_updated_at is null or p_new_updated_at='' then raise exception 'New timestamp required'; end if;
  select * into selected from public.supplier_products where id=p_product_id and owner_id=uid for update;
  if selected.id is null then raise exception 'Supplier Product unavailable'; end if;
  if selected.is_preferred then return; end if;
  if selected.updated_at is distinct from p_expected_updated_at then raise exception 'Supplier Product changed; refresh and retry'; end if;
  update public.supplier_products set is_preferred=false,updated_at=p_new_updated_at
    where workspace_id=selected.workspace_id and ingredient_id=selected.ingredient_id and is_preferred;
  update public.supplier_products set is_preferred=true,updated_at=p_new_updated_at
    where workspace_id=selected.workspace_id and id=selected.id;
end $$;

create or replace function public.mark_packaging_supplier_product_preferred(p_product_id text,p_expected_updated_at text,p_new_updated_at text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); selected public.packaging_supplier_products;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_new_updated_at is null or p_new_updated_at='' then raise exception 'New timestamp required'; end if;
  select * into selected from public.packaging_supplier_products where id=p_product_id and owner_id=uid for update;
  if selected.id is null then raise exception 'Packaging Supplier Product unavailable'; end if;
  if selected.is_preferred then return; end if;
  if selected.updated_at is distinct from p_expected_updated_at then raise exception 'Packaging Supplier Product changed; refresh and retry'; end if;
  update public.packaging_supplier_products set is_preferred=false,updated_at=p_new_updated_at
    where workspace_id=selected.workspace_id and packaging_component_id=selected.packaging_component_id and is_preferred;
  update public.packaging_supplier_products set is_preferred=true,updated_at=p_new_updated_at
    where workspace_id=selected.workspace_id and id=selected.id;
end $$;

revoke all on function public.mark_supplier_product_preferred(text,text,text) from public,anon;
revoke all on function public.mark_packaging_supplier_product_preferred(text,text,text) from public,anon;
grant execute on function public.mark_supplier_product_preferred(text,text,text) to authenticated;
grant execute on function public.mark_packaging_supplier_product_preferred(text,text,text) to authenticated;
