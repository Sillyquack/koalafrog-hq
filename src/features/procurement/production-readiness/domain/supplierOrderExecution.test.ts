import { describe,expect,it } from 'vitest'
import { classifySupplierConfirmationLine,confirmationNeedsOwnerDecision,orderExecutionState,shipmentEligibility } from './supplierOrderExecution'

const exact={orderedProduct:'Oil',confirmedProduct:'Oil',orderedPackageCount:2,confirmedPackageCount:2,orderedPackageSize:500,confirmedPackageSize:500,orderedUnit:'g',confirmedUnit:'g',placementUnitPrice:100,confirmedUnitPrice:100,availability:'confirmed' as const}
describe('supplier order execution policy',()=>{
  it('classifies exact, partial, increased, price, backorder, unavailable, package and substitution cases',()=>{
    expect(classifySupplierConfirmationLine(exact)).toBe('exact')
    expect(classifySupplierConfirmationLine({...exact,confirmedPackageCount:1})).toBe('quantity_reduced')
    expect(classifySupplierConfirmationLine({...exact,confirmedPackageCount:3})).toBe('quantity_increased')
    expect(classifySupplierConfirmationLine({...exact,confirmedUnitPrice:106})).toBe('price_changed')
    expect(classifySupplierConfirmationLine({...exact,availability:'backordered'})).toBe('backordered')
    expect(classifySupplierConfirmationLine({...exact,availability:'unavailable'})).toBe('unavailable')
    expect(classifySupplierConfirmationLine({...exact,confirmedPackageSize:250})).toBe('package_changed')
    expect(classifySupplierConfirmationLine({...exact,availability:'substitution_proposed',confirmedProduct:'Other'})).toBe('substitution_requires_review')
  })
  it('requires a decision for every non-exact mismatch',()=>expect(confirmationNeedsOwnerDecision('quantity_reduced')).toBe(true))
  it('blocks unsafe or exhausted shipment allocations',()=>{
    expect(shipmentEligibility([{mismatch:'substitution_requires_review',ownerDecision:'pending',confirmedQuantity:1,shippedQuantity:0}]).eligible).toBe(false)
    expect(shipmentEligibility([{mismatch:'exact',ownerDecision:'accepted',confirmedQuantity:2,shippedQuantity:1}]).eligible).toBe(true)
  })
  it('keeps delivery reporting as a logistics state',()=>expect(orderExecutionState([], [{status:'delivery_reported'}])).toBe('delivery_reported'))
})
