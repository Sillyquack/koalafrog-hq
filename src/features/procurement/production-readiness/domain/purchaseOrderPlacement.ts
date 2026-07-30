export const PURCHASE_ORDER_PLACEMENT_POLICY_VERSION='1.0.0'
export const PLACEMENT_PRICE_INCREASE_TOLERANCE=0.05
export const PLACEMENT_SHIPPING_INCREASE_TOLERANCE=0.10

export interface PlacementComparisonInput {
  expectedTotal:number|null
  verifiedTotal:number|null
  actualTotal:number|null
  expectedShipping:number|null
  verifiedShipping:number|null
  actualShipping:number|null
  expectedDiscount:number|null
  actualDiscount:number|null
  draftCurrency:string
  actualCurrency:string
  exchangeRate?:number|null
}

export function classifyPlacement(input:PlacementComparisonInput){
  const warnings:string[]=[]
  const blockers:string[]=[]
  if(input.actualTotal==null||input.actualTotal<0)blockers.push('Actual grand total is required.')
  if(!/^[A-Z]{3}$/.test(input.actualCurrency))blockers.push('Actual currency is required.')
  if(input.actualCurrency!==input.draftCurrency&&!input.exchangeRate)blockers.push('Currency changes require an explicit exchange rate.')
  if(input.actualCurrency===input.draftCurrency){
    if(input.verifiedTotal!=null&&input.actualTotal!=null&&input.actualTotal>input.verifiedTotal*(1+PLACEMENT_PRICE_INCREASE_TOLERANCE))warnings.push('Actual total exceeds the verified total by more than 5%.')
    if(input.verifiedShipping!=null&&input.actualShipping!=null&&input.actualShipping>input.verifiedShipping*(1+PLACEMENT_SHIPPING_INCREASE_TOLERANCE))warnings.push('Actual shipping exceeds verified shipping by more than 10%.')
    if(input.expectedDiscount!=null&&input.expectedDiscount>0&&Number(input.actualDiscount??0)<input.expectedDiscount)warnings.push('Expected discount was not fully applied.')
  }
  return{classification:blockers.length?'blocked':warnings.length?'acknowledgement_required':'acceptable',warnings,blockers}
}

export function placementLineBlockers(input:{expectedPackageCount:number;actualPackageCount:number;productIdentity:'matches'|'changed';packageIdentity:'matches'|'changed';stockState:'confirmed'|'backordered'|'unavailable'}){
  const blockers:string[]=[]
  if(input.productIdentity!=='matches')blockers.push('Supplier Product identity changed.')
  if(input.packageIdentity!=='matches')blockers.push('Package identity changed.')
  if(input.actualPackageCount<input.expectedPackageCount)blockers.push('Actual package count is insufficient.')
  if(input.stockState!=='confirmed')blockers.push(`Line stock is ${input.stockState}.`)
  return blockers
}
