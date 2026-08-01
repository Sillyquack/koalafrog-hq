import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'

const migration=readFileSync(
  new URL('../../../supabase/migrations/20260801085016_procurement_commercial_provenance_authoring_v1.sql',import.meta.url),
  'utf8',
)
const compact=migration.replace(/\s+/g,' ')

describe('Procurement Commercial Provenance Authoring V1 migration',()=>{
  it('adds owner/workspace parity without creating another Supplier or Offer system',()=>{
    expect(compact).toContain('alter table public.packaging_supplier_products add constraint packaging_supplier_products_workspace_owner_fk foreign key (workspace_id, owner_id) references public.workspaces(id, owner_id)')
    expect(compact).toContain('alter table public.procurement_supplier_offers')
    expect(migration).not.toMatch(/create table public\.(suppliers|procurement_supplier_offers)/)
    expect(migration).not.toContain('alter table public.suppliers')
  })

  it('routes each optional source domain into a matching composite foreign key',()=>{
    for(const value of [
      'supplier_products_offer_source_identity_unique',
      'packaging_supplier_products_offer_source_identity_unique',
      'source_raw_material_product_id text',
      'source_packaging_product_id text',
      'procurement_supplier_offers_workspace_owner_fk',
      'procurement_supplier_offers_raw_material_source_fk',
      'procurement_supplier_offers_packaging_source_fk',
      'procurement_supplier_offers_raw_material_source',
      'procurement_supplier_offers_packaging_source',
    ])expect(migration).toContain(value)
    expect(compact).toContain('check (num_nonnulls(source_supplier_product_domain, source_supplier_product_id) in (0, 2))')
    expect(compact).toContain('references public.supplier_products(workspace_id, owner_id, id, supplier_id)')
    expect(compact).toContain('references public.packaging_supplier_products(workspace_id, owner_id, id, supplier_id)')
  })

  it('preserves genuine manual Offers while refusing to rewrite inconsistent history',()=>{
    expect(compact).toContain("if new.source_supplier_product_domain is null or new.source_supplier_product_id is null then return new; end if;")
    expect(compact).toContain("where (source_supplier_product_domain is null) <> (source_supplier_product_id is null)")
    expect(migration).not.toMatch(/update\s+public\.procurement_supplier_offers/i)
    expect(migration).not.toMatch(/delete\s+from\s+public\.procurement_supplier_offers/i)
  })

  it('keeps usability validation non-callable and within caller RLS authority',()=>{
    expect(compact).toContain('create function public.validate_procurement_offer_source_usability_v1() returns trigger language plpgsql security invoker set search_path =')
    expect(compact).toContain('revoke all on function public.validate_procurement_offer_source_usability_v1() from public, anon, authenticated')
    expect(compact).toContain('create trigger validate_procurement_offer_source_usability before insert or update of workspace_id, owner_id, supplier_id, source_supplier_product_domain, source_supplier_product_id')
    expect(migration).not.toContain('security definer')
    expect(migration).not.toMatch(/grant\s+execute/i)
  })
})
