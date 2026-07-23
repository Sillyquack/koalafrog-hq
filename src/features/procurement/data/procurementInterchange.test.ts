import{describe,expect,it}from'vitest'
import{emptyProcurementData}from'../domain/procurement'
import{exportProcurement,offersToCsv,parseCsv,parseProcurementJson}from'./procurementInterchange'

describe('procurement interchange',()=>{
  it('round trips versioned JSON',()=>{const exported=exportProcurement(emptyProcurementData());expect(parseProcurementJson(JSON.stringify(exported))).toEqual(exported)})
  it('rejects unversioned JSON',()=>{expect(()=>parseProcurementJson('{}')).toThrow(/invalid/i)})
  it('quotes CSV notes and parses embedded commas',()=>{const data=emptyProcurementData(),offer={id:'o',requested_item_id:'i',supplier_id:'s',source_supplier_product_domain:null,source_supplier_product_id:null,product_title:'Oil, refined',product_url:null,country_code:null,package_quantity:1,package_unit:'kg',item_price:10,currency:'NOK',moq:null,shipping_cost:null,tax_duty_estimate:null,delivery_estimate_days:null,stock_status:'unknown' as const,coa_availability:'unknown' as const,sds_availability:'unknown' as const,technical_document_availability:'unknown' as const,certification_claims:['Organic','COSMOS'],first_order_discount:null,notes:'call, first',date_checked:'2026-07-23',confidence:'unknown' as const,created_at:'',updated_at:''};data.offers=[offer];const parsed=parseCsv(offersToCsv(data.offers));expect(parsed[0].product_title).toBe('Oil, refined');expect(parsed[0].certification_claims).toBe('Organic|COSMOS')})
})
