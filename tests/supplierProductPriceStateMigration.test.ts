import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260730123820_workspace_foundation_authoring_v1.sql',
  'utf8',
)

describe('Supplier Product price-state migration ordering', () => {
  it('normalizes deterministic legacy state before enforcing the final constraint', () => {
    const normalization = migration.indexOf('update public.supplier_products')
    const enforcement = migration.indexOf('add constraint supplier_products_price_state_consistency')

    expect(normalization).toBeGreaterThan(-1)
    expect(enforcement).toBeGreaterThan(normalization)
    expect(migration).toContain("when price is not null then 'recorded'")
    expect(migration).toContain("else 'unknown'")
  })

  it('fails explicitly for contradictory commercial facts', () => {
    expect(migration).toContain('(price is null) <> (currency is null)')
    expect(migration).toContain('contain price without currency or currency without price')
    expect(migration).toContain('contain a zero or negative price')
  })

  it('preserves the final authoring invariant for both supplier-product domains', () => {
    expect(migration).toContain('supplier_products_price_state_consistency check')
    expect(migration).toContain('packaging_supplier_products_price_state_consistency check')
    expect(migration.match(/price_state = 'recorded' and price is not null/g)).toHaveLength(2)
    expect(migration.match(/price_state <> 'recorded' and price is null/g)).toHaveLength(2)
  })
})
