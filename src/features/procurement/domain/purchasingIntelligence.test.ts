import{describe,expect,it}from'vitest'
import{calculateCartScenario,type ProcurementCartScenario,type ProcurementCartScenarioItem,type SupplierDiscount,type SupplierShippingRule}from'./procurement'

const scenario:ProcurementCartScenario={id:'scenario',supplier_id:'supplier',name:'Oliemeesters first order',destination_country_code:'NO',currency:'EUR',shipping_rule_id:'shipping',discount_id:'discount',manual_shipping_cost:null,manual_tax_estimate:0,manual_duty_estimate:0,payment_fee:0,additional_cost:0,status:'draft',notes:'',calculated_at:null,created_at:'2026-07-25',updated_at:'2026-07-25'}
const items:ProcurementCartScenarioItem[]=[{id:'line',scenario_id:'scenario',supplier_offer_id:'offer',requested_item_id:'item',package_count:2,unit_price:24.9,line_discount:0,display_order:0,notes:'',created_at:'2026-07-25',updated_at:'2026-07-25'}]
const discount:SupplierDiscount={id:'discount',supplier_id:'supplier',name:'Welcome 5%',discount_type:'percentage',percentage:5,fixed_amount:null,currency:null,coupon_code:'5KORTING',minimum_order_value:null,maximum_discount:null,first_purchase_only:true,requires_newsletter:true,valid_from:null,expires_at:null,status:'available',source_url:null,evidence_notes:'',verified_at:'2026-07-25',used_at:null,created_at:'2026-07-25',updated_at:'2026-07-25'}
const shipping:SupplierShippingRule={id:'shipping',supplier_id:'supplier',destination_country_code:null,destination_region:'EU',shipping_method:null,currency:'EUR',flat_rate:14.95,free_shipping_threshold:95,minimum_order_value:null,delivery_estimate_min_days:1,delivery_estimate_max_days:5,tax_handling:'unknown',duty_handling:'unknown',status:'needs_verification',source_url:null,evidence_notes:'Does not prove delivery to Norway.',verified_at:'2026-07-25',created_at:'2026-07-25',updated_at:'2026-07-25'}

describe('calculateCartScenario',()=>{
  it('applies an eligible percentage discount before shipping',()=>{
    const result=calculateCartScenario({scenario,items,discount,shipping,now:new Date('2026-07-25T10:00:00Z')})
    expect(result.components.merchandise).toBeCloseTo(49.8)
    expect(result.components.orderDiscount).toBeCloseTo(2.49)
    expect(result.components.shipping).toBeCloseTo(14.95)
    expect(result.knownTotal).toBeCloseTo(62.26)
    expect(result.complete).toBe(true)
  })

  it('uses free shipping only after the discounted merchandise crosses the threshold',()=>{
    const largerItems=[{...items[0],package_count:5}]
    const result=calculateCartScenario({scenario,items:largerItems,discount,shipping})
    expect(result.components.discountedMerchandise).toBeCloseTo(118.275)
    expect(result.freeShipping).toBe(true)
    expect(result.components.shipping).toBe(0)
  })

  it('keeps landed cost incomplete when destination shipping is unknown',()=>{
    const result=calculateCartScenario({scenario:{...scenario,manual_shipping_cost:null},items,discount,shipping:null})
    expect(result.components.shipping).toBeNull()
    expect(result.missing).toContain('shipping')
    expect(result.complete).toBe(false)
  })

  it('does not reuse a used first-order discount',()=>{
    const result=calculateCartScenario({scenario,items,discount:{...discount,status:'used'},shipping})
    expect(result.discountEligible).toBe(false)
    expect(result.components.orderDiscount).toBe(0)
  })
})
