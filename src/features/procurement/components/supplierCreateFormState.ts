import type { SupplierCreateInput } from '../domain/procurement'

export interface SupplierCreateDraft {
  legalName: string
  tradingName: string
  supplierType: SupplierCreateInput['supplier_type']
  status: SupplierCreateInput['status']
  websiteUrl: string
  countryCode: string
  defaultCurrency: string
  verificationState: SupplierCreateInput['verification_state']
  internalNotes: string
  isPreferred: boolean
}

export const initialSupplierCreateDraft: SupplierCreateDraft = {
  legalName: '',
  tradingName: '',
  supplierType: 'raw_material',
  status: 'research',
  websiteUrl: '',
  countryCode: '',
  defaultCurrency: '',
  verificationState: 'unknown',
  internalNotes: '',
  isPreferred: false,
}

const countryCodePattern = /^[A-Z]{2}$/
const currencyPattern = /^[A-Z]{3}$/
const nullableText = (value: string) => value.trim() || null

export function supplierCreateInputFromDraft(draft: SupplierCreateDraft): SupplierCreateInput {
  return {
    legal_name: draft.legalName.trim(),
    trading_name: nullableText(draft.tradingName),
    supplier_type: draft.supplierType,
    status: draft.status,
    website_url: nullableText(draft.websiteUrl),
    country_code: nullableText(draft.countryCode)?.toUpperCase() ?? null,
    default_currency: nullableText(draft.defaultCurrency)?.toUpperCase() ?? null,
    verification_state: draft.verificationState,
    internal_notes: draft.internalNotes.trim(),
    is_preferred: draft.isPreferred,
  }
}

export function supplierCreateValidationError(input: SupplierCreateInput): string | null {
  if (!input.legal_name) return 'Legal name is required.'
  if (input.website_url) {
    try {
      const url = new URL(input.website_url)
      if (!['http:', 'https:'].includes(url.protocol)) return 'Website must be an absolute HTTP or HTTPS URL.'
    } catch {
      return 'Website must be an absolute HTTP or HTTPS URL.'
    }
  }
  if (input.country_code && !countryCodePattern.test(input.country_code)) return 'Country must be a two-letter code.'
  if (input.default_currency && !currencyPattern.test(input.default_currency)) return 'Default currency must be a three-letter code.'
  return null
}
