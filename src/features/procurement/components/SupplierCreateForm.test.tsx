import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SupplierCreateForm } from './SupplierCreateForm'
import { initialSupplierCreateDraft, supplierCreateInputFromDraft, supplierCreateValidationError } from './supplierCreateFormState'

describe('SupplierCreateForm', () => {
  it('renders the complete accessible create fingerprint and safe defaults', () => {
    const html = renderToStaticMarkup(
      <SupplierCreateForm workspaceId="workspace-id" onCancel={() => undefined} onConfirmed={() => undefined} />,
    )

    for (const label of ['Legal name', 'Trading name', 'Supplier type', 'Status', 'Website', 'Country', 'Default currency', 'Verification state', 'Internal notes', 'Preferred Supplier']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('<option value="printing">printing</option>')
    expect(html).toContain('<option value="research" selected="">research</option>')
    expect(html).toContain('<option value="unknown" selected="">unknown</option>')
    expect(html).toContain('Review before creating')
    expect(html).toContain('Create supplier')
    expect(html).toContain('aria-busy="false"')
    expect(html).toContain('No follow-up update')
  })

  it('builds the complete printing fingerprint in one create input', () => {
    expect(supplierCreateInputFromDraft({
      ...initialSupplierCreateDraft,
      legalName: '  Avery Norway  ',
      supplierType: 'printing',
      websiteUrl: 'https://www.avery.no',
      countryCode: 'no',
      defaultCurrency: 'nok',
    })).toEqual({
      legal_name: 'Avery Norway',
      trading_name: null,
      supplier_type: 'printing',
      status: 'research',
      website_url: 'https://www.avery.no',
      country_code: 'NO',
      default_currency: 'NOK',
      verification_state: 'unknown',
      internal_notes: '',
      is_preferred: false,
    })
  })

  it('keeps missing optional facts null and rejects malformed identity metadata before persistence', () => {
    const emptyOptional = supplierCreateInputFromDraft({ ...initialSupplierCreateDraft, legalName: 'Supplier AS' })
    expect(emptyOptional).toMatchObject({ trading_name: null, website_url: null, country_code: null, default_currency: null })
    expect(supplierCreateValidationError(emptyOptional)).toBeNull()
    expect(supplierCreateValidationError({ ...emptyOptional, legal_name: '' })).toMatch(/Legal name/)
    expect(supplierCreateValidationError({ ...emptyOptional, website_url: '/relative' })).toMatch(/absolute HTTP/)
    expect(supplierCreateValidationError({ ...emptyOptional, country_code: 'NOR' })).toMatch(/two-letter/)
    expect(supplierCreateValidationError({ ...emptyOptional, default_currency: 'NO' })).toMatch(/three-letter/)
  })
})
