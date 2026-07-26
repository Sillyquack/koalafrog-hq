import { describe, expect, it } from 'vitest'
import type { SupplierDocumentRecord } from './procurement'
import { supplierDocumentationSummary, validateSupplierDocument } from './supplierDocumentation'

const record=(values:Partial<SupplierDocumentRecord>={}):SupplierDocumentRecord=>({id:'document-1',supplier_id:'supplier-1',document_type:'coa',document_subtype:null,capability_state:'unknown',verification_state:'unverified',evidence_url:null,document_title:null,issuer:null,issue_date:null,expiry_date:null,checked_date:null,source_reference:null,notes:'',scope_type:'supplier_wide',revision:1,archived_at:null,created_at:'2026-07-26',updated_at:'2026-07-26',...values})

describe('structured supplier documentation',()=>{
  it('keeps capability semantics distinct and counts only explicit active records',()=>{
    const records=[record(),record({id:'2',capability_state:'unavailable'}),record({id:'3',capability_state:'not_applicable'}),record({id:'4',capability_state:'available_on_request'}),record({id:'5',verification_state:'verified'}),record({id:'6',verification_state:'expired'}),record({id:'7',verification_state:'verified',archived_at:'2026-07-26'})]
    expect(new Set(records.map(item=>item.capability_state)).size).toBe(4)
    expect(supplierDocumentationSummary(records)).toEqual({verified:1,expired:1,availableOnRequest:1,unknown:3,recorded:6})
  })
  it('allows on-request capability and nullable dates without evidence',()=>{
    expect(validateSupplierDocument(record({capability_state:'available_on_request'}))).toBe('')
    expect(validateSupplierDocument(record({issue_date:null,expiry_date:null}))).toBe('')
  })
  it('does not infer verification from a URL or checked date',()=>{
    const input=record({evidence_url:'https://supplier.example/coa.pdf',checked_date:'2026-07-26'})
    expect(validateSupplierDocument(input)).toBe('')
    expect(input.verification_state).toBe('unverified')
  })
  it('requires certificate subtype and validates URLs and date order',()=>{
    expect(validateSupplierDocument(record({document_type:'certificate'}))).toMatch(/subtype/)
    expect(validateSupplierDocument(record({evidence_url:'file:///coa.pdf'}))).toMatch(/HTTP/)
    expect(validateSupplierDocument(record({issue_date:'2026-07-26',expiry_date:'2026-07-25'}))).toMatch(/precede/)
  })
})
