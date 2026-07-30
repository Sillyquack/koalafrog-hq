export const DRAFT_PURCHASE_ORDER_HANDOFF_POLICY_VERSION='1.0.0'

export interface DraftHandoffPlan {
  status:string
  revision:number
  supplierCount:number
  lineCount:number
  supersededAt?:string|null
  cancelledAt?:string|null
}
export interface DraftHandoffCheck {severity:'required'|'advisory';resolutionState:string;verificationState:string}
export interface DraftHandoffBasket {id:string;currency:string;supplierId:string}
export interface DraftHandoffLine {basketId:string;packageCount:number;purchasedQuantity:number}

export function draftHandoffBlockers(plan:DraftHandoffPlan,baskets:DraftHandoffBasket[],lines:DraftHandoffLine[],checks:DraftHandoffCheck[]){
  const blockers:string[]=[]
  if(plan.status!=='checkout_ready')blockers.push('Purchase Plan is not checkout-ready.')
  if(plan.supersededAt)blockers.push('Purchase Plan is superseded.')
  if(plan.cancelledAt)blockers.push('Purchase Plan is cancelled.')
  if(!baskets.length||baskets.length!==plan.supplierCount)blockers.push('Supplier basket snapshot is inconsistent.')
  if(!lines.length||lines.length!==plan.lineCount)blockers.push('Purchase Plan line snapshot is inconsistent.')
  if(baskets.some(item=>!item.supplierId||!/^[A-Z]{3}$/.test(item.currency)))blockers.push('Every supplier basket requires an explicit supplier and currency.')
  const ids=new Set(baskets.map(item=>item.id))
  if(lines.some(item=>!ids.has(item.basketId)||item.packageCount<=0||item.purchasedQuantity<=0))blockers.push('Every line must belong to one basket and preserve valid quantities.')
  if(checks.some(item=>item.resolutionState!=='resolved'||['pending','changed_requires_new_plan','unavailable'].includes(item.verificationState)))blockers.push('Checkout verification still contains an unresolved blocker.')
  return blockers
}

export function effectiveDraftValue<T>(expected:T|null,verified:T|null,verificationState:string){
  if(verified!=null&&['confirmed','changed_acceptable'].includes(verificationState))return{expected,verified,effective:verified,source:'checkout_verification' as const}
  return{expected,verified,effective:expected,source:'approved_snapshot' as const}
}
