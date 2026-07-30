export const SUPPLIER_CONFIRMATION_POLICY_VERSION='1.0.0'
export const ACCEPTABLE_CONFIRMATION_PRICE_VARIANCE=0.05

export type ConfirmationAvailability='confirmed'|'partially_confirmed'|'backordered'|'unavailable'|'supplier_cancelled'|'substitution_proposed'|'pending_supplier_response'
export type ConfirmationMismatch='exact'|'quantity_reduced'|'quantity_increased'|'price_changed'|'package_changed'|'product_changed'|'unavailable'|'backordered'|'substitution_requires_review'

export interface ConfirmationComparison {
  orderedProduct:string;confirmedProduct:string;orderedPackageCount:number;confirmedPackageCount:number
  orderedPackageSize:number;confirmedPackageSize:number;orderedUnit:string;confirmedUnit:string
  placementUnitPrice:number|null;confirmedUnitPrice:number;availability:ConfirmationAvailability
}

export function classifySupplierConfirmationLine(value:ConfirmationComparison):ConfirmationMismatch {
  if(value.availability==='unavailable')return'unavailable'
  if(value.availability==='backordered')return'backordered'
  if(value.availability==='substitution_proposed')return'substitution_requires_review'
  if(value.confirmedProduct!==value.orderedProduct)return'product_changed'
  if(value.confirmedPackageSize!==value.orderedPackageSize||value.confirmedUnit!==value.orderedUnit)return'package_changed'
  if(value.confirmedPackageCount<value.orderedPackageCount)return'quantity_reduced'
  if(value.confirmedPackageCount>value.orderedPackageCount)return'quantity_increased'
  if(value.placementUnitPrice!==null&&Math.abs(value.confirmedUnitPrice-value.placementUnitPrice)>Math.max(.01,value.placementUnitPrice*ACCEPTABLE_CONFIRMATION_PRICE_VARIANCE))return'price_changed'
  return'exact'
}

export function confirmationNeedsOwnerDecision(mismatch:ConfirmationMismatch){
  return mismatch!=='exact'
}

export function shipmentEligibility(lines:Array<{mismatch:ConfirmationMismatch;ownerDecision:string;confirmedQuantity:number;shippedQuantity:number}>){
  const blockers=lines.flatMap(line=>{
    if(['unavailable','substitution_requires_review','product_changed','package_changed'].includes(line.mismatch)&&line.ownerDecision!=='accepted')return[`Resolve ${line.mismatch.replaceAll('_',' ')} before shipment.`]
    if(line.confirmedQuantity<=line.shippedQuantity)return['No accepted confirmed quantity remains to ship.']
    return[]
  })
  return {eligible:blockers.length===0,blockers}
}

export function orderExecutionState(confirmations:Array<{classification:string;acceptance_status:string}>,shipments:Array<{status:string}>) {
  if(shipments.some(item=>item.status==='delivery_reported'))return'delivery_reported'
  if(shipments.some(item=>item.status==='carrier_exception'))return'carrier_exception'
  if(shipments.some(item=>item.status==='delayed'))return'delayed'
  if(shipments.some(item=>['dispatched','in_transit'].includes(item.status)))return shipments.some(item=>item.status==='preparing')?'partially_shipped':'shipped'
  if(shipments.some(item=>item.status==='preparing'))return'shipment_preparing'
  const active=confirmations[0]
  if(!active)return'awaiting_supplier_confirmation'
  if(active.classification==='partial')return'partially_confirmed'
  if(active.acceptance_status.startsWith('accepted_'))return'supplier_confirmed'
  return'confirmation_exception'
}
