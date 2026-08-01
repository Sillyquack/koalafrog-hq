-- Procurement Commercial Provenance Authoring V1.
--
-- Supplier storage already supports the complete creation fingerprint and the
-- `printing` vocabulary. This migration changes only the missing Offer/source
-- authority boundary and brings packaging Supplier Products to the same
-- owner/workspace boundary as raw-material Supplier Products.

do $$
begin
  if exists (
    select 1
    from public.packaging_supplier_products supplier_product
    left join public.workspaces workspace
      on workspace.id = supplier_product.workspace_id
     and workspace.owner_id = supplier_product.owner_id
    where workspace.id is null
  ) then
    raise exception
      'Cannot enforce Packaging Supplier Product workspace ownership: inconsistent rows exist';
  end if;

  if exists (
    select 1
    from public.procurement_supplier_offers offer
    left join public.workspaces workspace
      on workspace.id = offer.workspace_id
     and workspace.owner_id = offer.owner_id
    where workspace.id is null
  ) then
    raise exception
      'Cannot enforce Procurement Offer workspace ownership: inconsistent rows exist';
  end if;

  if exists (
    select 1
    from public.procurement_supplier_offers
    where (source_supplier_product_domain is null)
       <> (source_supplier_product_id is null)
  ) then
    raise exception
      'Cannot enforce Procurement Offer source pairing: one-sided source rows exist';
  end if;

  if exists (
    select 1
    from public.procurement_supplier_offers offer
    where offer.source_supplier_product_domain = 'raw_material'
      and not exists (
        select 1
        from public.supplier_products source
        where source.workspace_id = offer.workspace_id
          and source.owner_id = offer.owner_id
          and source.id = offer.source_supplier_product_id
          and source.supplier_id = offer.supplier_id
      )
  ) then
    raise exception
      'Cannot enforce Procurement Offer provenance: inconsistent raw-material source rows exist';
  end if;

  if exists (
    select 1
    from public.procurement_supplier_offers offer
    where offer.source_supplier_product_domain = 'packaging'
      and not exists (
        select 1
        from public.packaging_supplier_products source
        where source.workspace_id = offer.workspace_id
          and source.owner_id = offer.owner_id
          and source.id = offer.source_supplier_product_id
          and source.supplier_id = offer.supplier_id
      )
  ) then
    raise exception
      'Cannot enforce Procurement Offer provenance: inconsistent packaging source rows exist';
  end if;
end
$$;

alter table public.packaging_supplier_products
  add constraint packaging_supplier_products_workspace_owner_fk
  foreign key (workspace_id, owner_id)
  references public.workspaces(id, owner_id);

drop policy owner_all on public.packaging_supplier_products;

create policy owner_all
  on public.packaging_supplier_products
  for all
  to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.workspaces workspace
      where workspace.id = packaging_supplier_products.workspace_id
        and workspace.owner_id = (select auth.uid())
    )
  )
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1
      from public.workspaces workspace
      where workspace.id = packaging_supplier_products.workspace_id
        and workspace.owner_id = (select auth.uid())
        and workspace.lifecycle_state = 'active'
    )
  );

alter table public.supplier_products
  add constraint supplier_products_offer_source_identity_unique
  unique (workspace_id, owner_id, id, supplier_id);

alter table public.packaging_supplier_products
  add constraint packaging_supplier_products_offer_source_identity_unique
  unique (workspace_id, owner_id, id, supplier_id);

alter table public.procurement_supplier_offers
  add column source_raw_material_product_id text
    generated always as (
      case
        when source_supplier_product_domain = 'raw_material'
        then source_supplier_product_id
        else null
      end
    ) stored,
  add column source_packaging_product_id text
    generated always as (
      case
        when source_supplier_product_domain = 'packaging'
        then source_supplier_product_id
        else null
      end
    ) stored,
  add constraint procurement_supplier_offers_workspace_owner_fk
    foreign key (workspace_id, owner_id)
    references public.workspaces(id, owner_id),
  add constraint procurement_supplier_offers_source_pair
    check (num_nonnulls(source_supplier_product_domain, source_supplier_product_id) in (0, 2)),
  add constraint procurement_supplier_offers_raw_material_source_fk
    foreign key (
      workspace_id, owner_id, source_raw_material_product_id, supplier_id
    )
    references public.supplier_products(workspace_id, owner_id, id, supplier_id)
    on update restrict
    on delete restrict,
  add constraint procurement_supplier_offers_packaging_source_fk
    foreign key (
      workspace_id, owner_id, source_packaging_product_id, supplier_id
    )
    references public.packaging_supplier_products(workspace_id, owner_id, id, supplier_id)
    on update restrict
    on delete restrict;

create index procurement_supplier_offers_raw_material_source
  on public.procurement_supplier_offers(
    workspace_id, owner_id, supplier_id, source_raw_material_product_id
  )
  where source_raw_material_product_id is not null;

create index procurement_supplier_offers_packaging_source
  on public.procurement_supplier_offers(
    workspace_id, owner_id, supplier_id, source_packaging_product_id
  )
  where source_packaging_product_id is not null;

create function public.validate_procurement_offer_source_usability_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_is_usable boolean := false;
begin
  -- Leave one-sided rows to the explicit pair constraint so callers receive
  -- the structural source-pair failure rather than a misleading usability one.
  if new.source_supplier_product_domain is null
     or new.source_supplier_product_id is null then
    return new;
  end if;

  if new.source_supplier_product_domain = 'raw_material' then
    select exists (
      select 1
      from public.supplier_products source
      where source.workspace_id = new.workspace_id
        and source.owner_id = new.owner_id
        and source.id = new.source_supplier_product_id
        and source.supplier_id = new.supplier_id
        and not source.discontinued
        and source.lifecycle_status not in ('discontinued', 'rejected')
        and coalesce(source.product_status, 'research') not in ('inactive', 'discontinued')
    ) into source_is_usable;
  elsif new.source_supplier_product_domain = 'packaging' then
    select exists (
      select 1
      from public.packaging_supplier_products source
      where source.workspace_id = new.workspace_id
        and source.owner_id = new.owner_id
        and source.id = new.source_supplier_product_id
        and source.supplier_id = new.supplier_id
        and not source.discontinued
        and source.lifecycle_status not in ('discontinued', 'rejected')
    ) into source_is_usable;
  end if;

  if not source_is_usable then
    raise exception using
      errcode = '23514',
      message = 'OFFER_SOURCE_PRODUCT_UNUSABLE';
  end if;

  return new;
end
$$;

revoke all on function public.validate_procurement_offer_source_usability_v1()
  from public, anon, authenticated;

create trigger validate_procurement_offer_source_usability
before insert or update of
  workspace_id,
  owner_id,
  supplier_id,
  source_supplier_product_domain,
  source_supplier_product_id
on public.procurement_supplier_offers
for each row
execute function public.validate_procurement_offer_source_usability_v1();

comment on column public.procurement_supplier_offers.source_supplier_product_domain is
  'Canonical Supplier Product domain for a dated commercial evidence snapshot; null only for a genuinely manual Offer.';

comment on column public.procurement_supplier_offers.source_supplier_product_id is
  'Stable canonical Supplier Product ID paired with source_supplier_product_domain; it is not inferred from product title text.';
