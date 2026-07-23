import{describe,expect,it}from'vitest'
import{calculateOffer,canTransitionProcurementRequest,type RequestedItem,type SupplierOffer}from'./procurement'

const item:RequestedItem={id:'item',procurement_request_id:'request',name:'Jojoba oil',category:'raw_material',requested_quantity:1200,unit:'g',intended_product_ids:[],intended_formula_ids:[],required_specifications:['Cosmetic grade'],acceptable_substitutes:[],priority:'high',needed_by:null,notes:'',display_order:0,created_at:'',updated_at:''}
const offer:SupplierOffer={id:'offer',requested_item_id:'item',supplier_id:'supplier',source_supplier_product_domain:null,source_supplier_product_id:null,product_title:'Jojoba 500 g',product_url:null,country_code:null,package_quantity:500,package_unit:'g',item_price:100,currency:'NOK',moq:null,shipping_cost:50,tax_duty_estimate:25,delivery_estimate_days:null,stock_status:'unknown',coa_availability:'unknown',sds_availability:'unknown',technical_document_availability:'unknown',certification_claims:[],first_order_discount:10,notes:'',date_checked:'2026-07-23',confidence:'medium',created_at:'',updated_at:''}

describe('procurement offer calculations',()=>{
  it('normalizes, rounds packs upward, and retains surplus',()=>{expect(calculateOffer(item,offer)).toMatchObject({normalizedUnitPrice:.2,quantityRequired:1200,purchaseQuantity:3,productSubtotal:300,estimatedLandedTotal:365,effectiveLandedUnitCost:365/1500,surplusQuantity:300})})
  it('does not present incomplete landed cost as a complete total',()=>{const result=calculateOffer(item,{...offer,shipping_cost:null});expect(result.estimatedLandedTotal).toBeNull();expect(result.knownLandedTotal).toBe(315)})
  it('keeps incompatible units unknown',()=>{const result=calculateOffer(item,{...offer,package_unit:'ml'});expect(result.normalizedUnitPrice).toBeNull();expect(result.purchaseQuantity).toBeNull()})
})
describe('request workflow',()=>{it('allows only explicit forward/review transitions',()=>{expect(canTransitionProcurementRequest('needed','researching')).toBe(true);expect(canTransitionProcurementRequest('needed','ordered')).toBe(false);expect(canTransitionProcurementRequest('received','ordered')).toBe(false)})})
