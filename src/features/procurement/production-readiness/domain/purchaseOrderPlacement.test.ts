import {describe,expect,it} from 'vitest'
import {classifyPlacement,placementLineBlockers,PURCHASE_ORDER_PLACEMENT_POLICY_VERSION} from './purchaseOrderPlacement'

const basis={expectedTotal:100,verifiedTotal:100,actualTotal:100,expectedShipping:10,verifiedShipping:10,actualShipping:10,expectedDiscount:5,actualDiscount:5,draftCurrency:'GBP',actualCurrency:'GBP'}
describe('external Purchase Order placement policy',()=>{
  it('is versioned and accepts exact or lower actual values',()=>{
    expect(PURCHASE_ORDER_PLACEMENT_POLICY_VERSION).toBe('1.0.0')
    expect(classifyPlacement(basis).classification).toBe('acceptable')
    expect(classifyPlacement({...basis,actualTotal:95,actualShipping:8}).classification).toBe('acceptable')
  })
  it('requires acknowledgement for material price, shipping, or discount differences',()=>{
    expect(classifyPlacement({...basis,actualTotal:106}).classification).toBe('acknowledgement_required')
    expect(classifyPlacement({...basis,actualShipping:12}).warnings).toContain('Actual shipping exceeds verified shipping by more than 10%.')
    expect(classifyPlacement({...basis,actualDiscount:0}).warnings).toContain('Expected discount was not fully applied.')
  })
  it('blocks missing totals and mixed-currency comparison without an exchange rate',()=>{
    expect(classifyPlacement({...basis,actualTotal:null}).classification).toBe('blocked')
    expect(classifyPlacement({...basis,actualCurrency:'EUR'}).blockers).toContain('Currency changes require an explicit exchange rate.')
    expect(classifyPlacement({...basis,actualCurrency:'EUR',exchangeRate:1.1}).blockers).toEqual([])
  })
  it('blocks identity, package, quantity, backorder, and unavailable changes',()=>{
    expect(placementLineBlockers({expectedPackageCount:2,actualPackageCount:1,productIdentity:'changed',packageIdentity:'changed',stockState:'unavailable'})).toHaveLength(4)
    expect(placementLineBlockers({expectedPackageCount:2,actualPackageCount:2,productIdentity:'matches',packageIdentity:'matches',stockState:'confirmed'})).toEqual([])
  })
})
