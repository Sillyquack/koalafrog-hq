import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./SupplierProductForm.tsx', import.meta.url), 'utf8')

describe('SupplierProductForm price input', () => {
  it('accepts approved positive decimal prices without a step-base mismatch', () => {
    expect(source).toContain('name="price" type="number" min="0.000001" step="any"')
    expect(source).not.toContain('name="price" type="number" min="0.000001" step="0.01"')
  })
})
