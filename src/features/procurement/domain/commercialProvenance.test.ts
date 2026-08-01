import{describe,expect,it}from'vitest'
import type{SupplierCreateInput,SupplierOfferCreateInput}from'./procurement'
import{assertOfferReadback,assertSupplierReadback,classifySupplierIdentity,normalizeSupplierCreateInput,normalizeSupplierOfferCreateInput,supplierProductSourceUsable}from'./commercialProvenance'

const workspaceId='11111111-1111-4111-8111-111111111111'
const ownerId='22222222-2222-4222-8222-222222222222'
const supplierInput:SupplierCreateInput={
 legal_name:' Avery Norway ',trading_name:null,supplier_type:'printing',status:'research',
 website_url:'https://www.avery.no',country_code:'no',default_currency:'nok',
 verification_state:'unknown',internal_notes:'',is_preferred:false,
}
const normalizedSupplier=normalizeSupplierCreateInput(supplierInput)

const offerInput:SupplierOfferCreateInput={
 requested_item_id:'requested-item',supplier_id:'supplier',source_supplier_product_domain:'raw_material',source_supplier_product_id:'source-product',
 product_title:'Canonical jojoba 1 kg',product_url:'https://example.test/jojoba',country_code:'no',package_quantity:1,package_unit:'kg',item_price:245,currency:'nok',
 moq:null,shipping_cost:null,tax_duty_estimate:null,delivery_estimate_days:7,stock_status:'in_stock',coa_availability:'available',sds_availability:'available',technical_document_availability:'partial',certification_claims:[' COSMOS ',''],first_order_discount:null,notes:' Current observation ',date_checked:'2026-08-01',confidence:'high',
}

describe('commercial provenance authoring contracts',()=>{
 it('normalizes the complete printing Supplier fingerprint without inventing optional facts',()=>{
  expect(normalizedSupplier).toEqual({...supplierInput,legal_name:'Avery Norway',country_code:'NO',default_currency:'NOK'})
 })

 it.each([
  [{...supplierInput,website_url:'avery.no'},/absolute http or https/i],
  [{...supplierInput,country_code:'NOR'},/two uppercase letters/i],
  [{...supplierInput,default_currency:'KR'},/three uppercase letters/i],
  [{...supplierInput,supplier_type:'manufacturer'},/not supported/i],
 ] as const)('rejects malformed Supplier facts without a persistence contract',(input,error)=>{
  expect(()=>normalizeSupplierCreateInput(input as SupplierCreateInput)).toThrow(error)
 })

 it('distinguishes an exact Supplier, a normalized identity conflict, and a genuine new Supplier',()=>{
  const row={id:'supplier-a',...normalizedSupplier}
  expect(classifySupplierIdentity([row],normalizedSupplier)).toEqual({classification:'exact_existing',existingId:'supplier-a'})
  expect(classifySupplierIdentity([{...row,website_url:'https://different.example.test'}],normalizedSupplier)).toEqual({classification:'normalized_conflict',candidateIds:['supplier-a']})
  expect(classifySupplierIdentity([{...row,id:'supplier-b',legal_name:'Avery Sweden',country_code:'SE'}],normalizedSupplier)).toEqual({classification:'new'})
 })

 it('requires definitive Supplier owner/workspace readback and every submitted field',()=>{
  const row={id:'supplier-a',workspace_id:workspaceId,owner_id:ownerId,created_at:'2026-08-01T08:00:00Z',updated_at:'2026-08-01T08:00:00Z',revision:1,archived_at:null,default_lead_time_days:null,default_payment_terms:null,default_incoterm:null,minimum_order_value:null,internal_rating:null,...normalizedSupplier}
  expect(assertSupplierReadback(row,workspaceId,ownerId,normalizedSupplier).supplier_type).toBe('printing')
  expect(()=>assertSupplierReadback({...row,default_currency:'EUR'},workspaceId,ownerId,normalizedSupplier)).toThrow(/every submitted field/i)
  expect(()=>assertSupplierReadback({...row,workspace_id:'other'},workspaceId,ownerId,normalizedSupplier)).toThrow(/active owner workspace/i)
 })

 it('normalizes a linked Offer snapshot while preserving its stable source identity',()=>{
  expect(normalizeSupplierOfferCreateInput(offerInput)).toMatchObject({
   source_supplier_product_domain:'raw_material',source_supplier_product_id:'source-product',country_code:'NO',currency:'NOK',notes:'Current observation',certification_claims:['COSMOS'],
  })
 })

 it('keeps manual null/null Offers valid and rejects one-sided or hidden source types',()=>{
  const manual={...offerInput,source_supplier_product_domain:null,source_supplier_product_id:null} as SupplierOfferCreateInput
  expect(normalizeSupplierOfferCreateInput(manual)).toMatchObject({source_supplier_product_domain:null,source_supplier_product_id:null})
  expect(()=>normalizeSupplierOfferCreateInput({...offerInput,source_supplier_product_id:null} as unknown as SupplierOfferCreateInput)).toThrow(/recorded together/i)
  expect(()=>normalizeSupplierOfferCreateInput({...offerInput,source_supplier_product_domain:'equipment'} as unknown as SupplierOfferCreateInput)).toThrow(/not supported/i)
 })

 it('verifies the complete Offer snapshot and relationship fingerprint on owner readback',()=>{
  const normalized=normalizeSupplierOfferCreateInput(offerInput)
  const row={id:'offer-a',workspace_id:workspaceId,owner_id:ownerId,created_at:'2026-08-01T08:00:00Z',updated_at:'2026-08-01T08:00:00Z',...normalized}
  expect(assertOfferReadback(row,workspaceId,ownerId,normalized).source_supplier_product_id).toBe('source-product')
  expect(()=>assertOfferReadback({...row,supplier_id:'other'},workspaceId,ownerId,normalized)).toThrow(/snapshot and source relationships/i)
  expect(()=>assertOfferReadback({...row,item_price:246},workspaceId,ownerId,normalized)).toThrow(/no success receipt/i)
 })

 it('rejects stale lifecycle states while allowing a current canonical source',()=>{
  expect(supplierProductSourceUsable({discontinued:false,lifecycle_status:'available',product_status:'verified_operational'})).toBe(true)
  expect(supplierProductSourceUsable({discontinued:true,lifecycle_status:'available',product_status:'verified_operational'})).toBe(false)
  expect(supplierProductSourceUsable({discontinued:false,lifecycle_status:'rejected',product_status:'research'})).toBe(false)
  expect(supplierProductSourceUsable({discontinued:false,lifecycle_status:'candidate',product_status:'inactive'})).toBe(false)
 })
})
