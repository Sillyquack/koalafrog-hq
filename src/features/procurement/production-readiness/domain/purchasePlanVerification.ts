export const PURCHASE_PLAN_VERIFICATION_POLICY = {
  version: '1.0.0',
  priceIncreaseTolerance: 0.05,
  shippingIncreaseTolerance: 0.10,
} as const

export type VerificationField =
  | 'package_price'
  | 'shipping_amount'
  | 'stock_availability'
  | 'package_identity'
  | 'delivery_to_norway'
  | 'required_documents'
  | 'first_order_discount'
  | 'tax_import'

export type MismatchClassification = 'match' | 'acceptable' | 'requires_new_plan' | 'unavailable' | 'not_applicable'

export interface VerificationGateItem {
  severity: 'required' | 'advisory'
  verificationState: string
  resolutionState: string
}

export function isScenarioApprovable(scenario: { status:string; feasibility:string; blocker_count:number; supplier_count:number; line_count:number }){
  return scenario.status === 'published'
    && ['complete', 'complete_with_warnings'].includes(scenario.feasibility)
    && scenario.blocker_count === 0
    && scenario.supplier_count > 0
    && scenario.line_count > 0
}

export function classifyVerificationMismatch(field:VerificationField,expected:unknown,actual:unknown):MismatchClassification {
  if(actual == null)return 'unavailable'
  if(JSON.stringify(expected) === JSON.stringify(actual))return 'match'
  if((field === 'package_price' || field === 'shipping_amount') && typeof expected === 'number' && typeof actual === 'number'){
    const tolerance=field === 'package_price'
      ? PURCHASE_PLAN_VERIFICATION_POLICY.priceIncreaseTolerance
      : PURCHASE_PLAN_VERIFICATION_POLICY.shippingIncreaseTolerance
    return actual <= expected * (1 + tolerance) ? 'acceptable' : 'requires_new_plan'
  }
  if(field === 'stock_availability' && ['in_stock','available','confirmed'].includes(String(actual)))return 'acceptable'
  return 'requires_new_plan'
}

export function purchasePlanGate(items:VerificationGateItem[]){
  const unresolvedRequired=items.filter(item=>item.severity === 'required' && (
    item.resolutionState !== 'resolved'
    || !['confirmed','changed_acceptable','not_applicable'].includes(item.verificationState)
  ))
  return { ready:unresolvedRequired.length === 0, unresolvedRequired }
}

export const canWaiveVerification=(severity:'required'|'advisory')=>severity === 'advisory'
