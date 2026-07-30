import { describe, expect, it } from 'vitest'
import { canWaiveVerification, classifyVerificationMismatch, isScenarioApprovable, purchasePlanGate, PURCHASE_PLAN_VERIFICATION_POLICY } from './purchasePlanVerification'

describe('purchase plan approval and checkout verification policy',()=>{
  it('approves only a published, feasible, non-empty scenario without blockers',()=>{
    const eligible={status:'published',feasibility:'complete_with_warnings',blocker_count:0,supplier_count:2,line_count:4}
    expect(isScenarioApprovable(eligible)).toBe(true)
    for(const patch of [
      {status:'draft'},{feasibility:'blocked'},{blocker_count:1},{supplier_count:0},{line_count:0},
    ])expect(isScenarioApprovable({...eligible,...patch})).toBe(false)
  })

  it('uses the versioned 5% price and 10% shipping increase policy',()=>{
    expect(PURCHASE_PLAN_VERIFICATION_POLICY.version).toBe('1.0.0')
    expect(classifyVerificationMismatch('package_price',100,105)).toBe('acceptable')
    expect(classifyVerificationMismatch('package_price',100,105.01)).toBe('requires_new_plan')
    expect(classifyVerificationMismatch('shipping_amount',100,110)).toBe('acceptable')
    expect(classifyVerificationMismatch('shipping_amount',100,110.01)).toBe('requires_new_plan')
    expect(classifyVerificationMismatch('package_price',100,90)).toBe('acceptable')
  })

  it('requires a new plan for identity changes and accepts explicitly available stock',()=>{
    expect(classifyVerificationMismatch('package_identity',{size:500},{size:1000})).toBe('requires_new_plan')
    expect(classifyVerificationMismatch('stock_availability',null,'in_stock')).toBe('acceptable')
    expect(classifyVerificationMismatch('stock_availability',null,'sold_out')).toBe('requires_new_plan')
    expect(classifyVerificationMismatch('required_documents',{},null)).toBe('unavailable')
  })

  it('opens the gate only when every required item is resolved in an allowed state',()=>{
    expect(purchasePlanGate([
      {severity:'required',verificationState:'confirmed',resolutionState:'resolved'},
      {severity:'required',verificationState:'changed_acceptable',resolutionState:'resolved'},
      {severity:'advisory',verificationState:'pending',resolutionState:'pending'},
    ]).ready).toBe(true)
    expect(purchasePlanGate([
      {severity:'required',verificationState:'changed_requires_new_plan',resolutionState:'blocking'},
    ]).ready).toBe(false)
  })

  it('never waives required checks',()=>{
    expect(canWaiveVerification('required')).toBe(false)
    expect(canWaiveVerification('advisory')).toBe(true)
  })
})
