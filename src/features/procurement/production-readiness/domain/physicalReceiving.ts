export const RECEIVING_POLICY_VERSION='1.0.0'

export type ReceivingResult='quarantine_ready'|'conditional_hold'|'blocked'

export interface ReceivingLineAssessment{
  received:number
  damaged:number
  held:number
  rejected:number
  identityMatches:boolean
  packageIntegrity:boolean
  sealIntegrity:boolean
  contaminationConcern:boolean
  supplierLotRecorded:boolean
  expired:boolean
  shortExpiry:boolean
  requiredDocumentationComplete:boolean
}

export function assessReceivingLine(line:ReceivingLineAssessment){
  const hardBlockers:string[]=[]
  const holds:string[]=[]
  if(!line.identityMatches)hardBlockers.push('Received identity does not match the accepted Supplier Product.')
  if(line.contaminationConcern)hardBlockers.push('Visible contamination concern requires rejection or investigation.')
  if(!line.packageIntegrity)hardBlockers.push('Primary package integrity failed.')
  if(!line.sealIntegrity)hardBlockers.push('Required seal integrity failed.')
  if(!line.supplierLotRecorded)hardBlockers.push('Supplier lot traceability is missing.')
  if(line.expired)hardBlockers.push('Received material is expired.')
  if(line.shortExpiry)holds.push('Expiry is shorter than the receiving-policy threshold.')
  if(!line.requiredDocumentationComplete)holds.push('Required received-lot documentation is incomplete.')
  if(line.damaged>0||line.held>0)holds.push('A received subset is damaged or held.')
  const eligible=Math.max(0,line.received-line.damaged-line.held-line.rejected)
  const result:ReceivingResult=hardBlockers.length?'blocked':holds.length?'conditional_hold':'quarantine_ready'
  return{policyVersion:RECEIVING_POLICY_VERSION,result,eligibleQuarantineQuantity:hardBlockers.length?0:eligible,hardBlockers,holds}
}

export function receiptEligible(orderStatus:string,shipmentStatuses:string[]){
  return !['draft','cancelled'].includes(orderStatus)&&shipmentStatuses.some(status=>['dispatched','in_transit','delayed','carrier_exception','delivery_reported','physically_received'].includes(status))
}
