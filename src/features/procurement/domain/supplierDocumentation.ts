import type { SupplierDocumentRecord, SupplierDocumentType } from './procurement'

export const supplierDocumentTypes:ReadonlyArray<{id:SupplierDocumentType;label:string}>=[
  {id:'coa',label:'COA'},
  {id:'sds',label:'SDS'},
  {id:'ifra',label:'IFRA certificate'},
  {id:'allergen_declaration',label:'Allergen declaration / sheet'},
  {id:'certificate',label:'Certificate'},
  {id:'batch_traceability',label:'Batch / lot traceability'},
]
export const capabilityLabels={unknown:'Unknown',available:'Available',unavailable:'Unavailable',available_on_request:'Available on request',not_applicable:'Not applicable'} as const
export const verificationLabels={unverified:'Unverified',pending_review:'Pending review',verified:'Verified',rejected:'Rejected',expired:'Expired'} as const
export const documentLabel=(record:Pick<SupplierDocumentRecord,'document_type'|'document_subtype'>)=>record.document_type==='certificate'&&record.document_subtype?record.document_subtype:supplierDocumentTypes.find(item=>item.id===record.document_type)?.label??record.document_type
export function validateSupplierDocument(input:Pick<SupplierDocumentRecord,'document_type'|'document_subtype'|'evidence_url'|'issue_date'|'expiry_date'>){
  if(input.document_type==='certificate'&&!input.document_subtype?.trim())return'Certificate title or subtype is required.'
  if(input.evidence_url){try{const url=new URL(input.evidence_url);if(!['http:','https:'].includes(url.protocol))throw new Error()}catch{return'Evidence URL must be a usable HTTP or HTTPS URL.'}}
  if(input.issue_date&&input.expiry_date&&input.expiry_date<input.issue_date)return'Expiry date cannot precede issue date.'
  return''
}
export function supplierDocumentationSummary(records:SupplierDocumentRecord[]){
  const current=records.filter(record=>!record.archived_at)
  return{
    verified:current.filter(record=>record.verification_state==='verified').length,
    expired:current.filter(record=>record.verification_state==='expired').length,
    availableOnRequest:current.filter(record=>record.capability_state==='available_on_request').length,
    unknown:current.filter(record=>record.capability_state==='unknown').length,
    recorded:current.length,
  }
}
