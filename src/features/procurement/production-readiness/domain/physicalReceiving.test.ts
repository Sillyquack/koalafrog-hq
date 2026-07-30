import{describe,expect,it}from'vitest'
import{assessReceivingLine,receiptEligible}from'./physicalReceiving'

const exact={received:100,damaged:0,held:0,rejected:0,identityMatches:true,packageIntegrity:true,sealIntegrity:true,contaminationConcern:false,supplierLotRecorded:true,expired:false,shortExpiry:false,requiredDocumentationComplete:true}

describe('physical receiving policy',()=>{
  it('requires an execution-stage order and an eligible shipment',()=>{
    expect(receiptEligible('draft',['delivery_reported'])).toBe(false)
    expect(receiptEligible('shipped',['preparing'])).toBe(false)
    expect(receiptEligible('shipped',['delivery_reported'])).toBe(true)
  })
  it('keeps carrier delivery distinct from explicit received quantity',()=>expect(receiptEligible('shipped',['delivery_reported'])).toBe(true))
  it('calculates exact and partial quarantine quantities',()=>{
    expect(assessReceivingLine(exact)).toMatchObject({result:'quarantine_ready',eligibleQuarantineQuantity:100})
    expect(assessReceivingLine({...exact,damaged:10,held:20,rejected:5})).toMatchObject({result:'conditional_hold',eligibleQuarantineQuantity:65})
  })
  it.each([
    [{identityMatches:false},'Received identity'],
    [{packageIntegrity:false},'package integrity'],
    [{sealIntegrity:false},'seal integrity'],
    [{contaminationConcern:true},'contamination'],
    [{supplierLotRecorded:false},'traceability'],
    [{expired:true},'expired'],
  ])('blocks critical receiving failure %o',(patch,message)=>{
    const result=assessReceivingLine({...exact,...patch})
    expect(result.result).toBe('blocked')
    expect(result.eligibleQuarantineQuantity).toBe(0)
    expect(result.hardBlockers.join(' ')).toContain(message)
  })
  it('holds short expiry and missing lot-specific documentation',()=>{
    expect(assessReceivingLine({...exact,shortExpiry:true,requiredDocumentationComplete:false})).toMatchObject({result:'conditional_hold',eligibleQuarantineQuantity:100})
  })
})
