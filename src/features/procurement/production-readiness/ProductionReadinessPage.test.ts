import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page=readFileSync(new URL('./ProductionReadinessPage.tsx',import.meta.url),'utf8')
const css=readFileSync(new URL('../../../styles/index.css',import.meta.url),'utf8')

describe('durable Production Readiness UI contract',()=>{
  it('keeps the four-product scope and deodorant mandatory',()=>{
    for(const label of ['Beard Oil','Beard Butter','Beard Balm','Deodorant'])expect(page).toContain(label)
    expect(page).toContain('mandatory')
    expect(page).toContain('deodorantStructure')
  })
  it('supports create, reopen, save, regenerate, revision feedback, requirements, gaps, and explicit cancellation',()=>{
    for(const operation of ['createProductionRound','listProductionRounds','loadProductionRound','saveProductionRound','regenerateProductionRound','cancelProductionRound'])expect(page).toContain(operation)
    expect(page).toContain('Draft revision')
    expect(page).toContain('Purchasing specifications and Supplier Product matches')
    expect(page).toContain("window.confirm('Cancel this production procurement round?")
  })
  it('shows specifications, durable candidate actions, documentation, freshness, package count, and surplus',()=>{
    for(const value of ['Purchasing specification','Generate candidates','Accept mapping','Select','Reject','Needs research','Clear selection','Documentation: SDS','Freshness: price','packs · purchased','surplus'])expect(page).toContain(value)
    expect(page).toContain('rel="noopener noreferrer"')
  })
  it('shows six durable strategy semantics, commercial uncertainty, detail, regeneration, and explicit publication',()=>{
    for(const value of ['Minimum immediate cash','Best overall value','First-order discount utilization','Fewest suppliers','Lowest procurement risk','Recommended balanced plan','Known minimum','Confirmed total','Estimated total','Unknown components','View supplier baskets and lines','Generate or regenerate scenarios','Publish comparison snapshot','Mixed currency'])expect(page).toContain(value)
    for(const handoff of ['Refresh price','Verify stock','Verify shipping','Verify Norway delivery','Verify first-order discount','Verify tax/import assumption'])expect(page).toContain(handoff)
    expect(page).toContain("navigate('/procurement')")
    expect(css).toContain('.scenario-grid{grid-template-columns:1fr}')
  })
  it('exposes immutable approval and verification without any order creation action',()=>{
    for(const value of ['Approve immutable plan','Immutable purchase plans','Confirm','Record change','Unavailable','Not applicable','Mark checkout ready','Cancel plan','Open procurement research'])expect(page).toContain(value)
    for(const operation of ['approveProductionScenario','recordPlanVerification','waivePlanVerification','markPlanCheckoutReady','cancelInternalPlan'])expect(page).toContain(operation)
    expect(page).toContain('checkout readiness never creates a Purchase Order')
    expect(page).not.toContain('createPurchaseOrder')
    expect(page).toContain('Create draft Purchase Orders')
    expect(page).toContain('Internal draft')
    expect(page).toContain('Not placed')
    expect(page).toContain('No external checkout')
    expect(page).toContain('Cancel draft')
    for(const text of ['Record external placement','External action warning','Expected / verified / actual comparison','Placed externally','No receiving yet. No inventory yet.','First-order discount applied','Evidence reference'])expect(page).toContain(text)
  })
  it('distinguishes unknown, zero, and not-calculated states accessibly',()=>{
    expect(page).toContain("'Unknown'")
    expect(page).toContain('Not calculated')
    expect(page).toContain('role="alert"')
    expect(page).toContain('role="status"')
  })
  it('shows confirmation, split-shipment and delivery-report boundaries without receipt language',()=>{
    for(const value of ['Record supplier confirmation','Accept confirmation','Mark for replanning','Create shipment record','Record dispatch','Record delivery reported','Carrier reports delivery. Physical receipt and inspection have not been recorded.','Audit history'])expect(page).toContain(value)
    for(const operation of ['recordSupplierConfirmation','decideSupplierConfirmation','createOrderShipment','recordShipmentStatus'])expect(page).toContain(operation)
    expect(page).toContain('rel="noopener noreferrer"')
    expect(page).toContain('No Receipt, lot, movement, or stock was created.')
  })
  it('has a 390px-compatible single-column layout and full-width keyboard buttons',()=>{
    expect(css).toContain('@media(max-width:520px)')
    expect(css).toContain('.readiness-round-meta{grid-template-columns:1fr}')
    expect(css).toContain('.readiness-actions .button{width:100%}')
    expect(page).not.toContain('tabIndex={-1}')
  })
})
