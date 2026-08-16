import{describe,expect,it}from'vitest'
import type{OfferCandidate}from'./assistedResearch'
import type{ProcurementRequest,RequestedItem}from'./procurement'
import{buildFollowUpInstructionDraft,fieldsResolvedByFollowUp,requestedItemsWithoutPracticalCandidate,unresolvedFieldsForCandidates}from'./followUpResearch'

const request={id:'request-1',title:'Workshop cleansing concentrate',status:'researching',category:'raw_material',priority:'normal',needed_by:null,notes:'',revision:1,created_at:'',updated_at:''}satisfies ProcurementRequest
const items=[
 {id:'item-1',procurement_request_id:'request-1',name:'Cleansing surfactant',category:'surfactant',requested_quantity:1,unit:'kg',intended_product_ids:[],intended_formula_ids:[],required_specifications:['COA'],acceptable_substitutes:[],preferred_supplier_hint:'Nordic Materials',priority:'normal',needed_by:null,notes:'',display_order:0,created_at:'',updated_at:''},
 {id:'item-2',procurement_request_id:'request-1',name:'Preservative system',category:'preservative',requested_quantity:0.1,unit:'kg',intended_product_ids:[],intended_formula_ids:[],required_specifications:['SDS'],acceptable_substitutes:[],preferred_supplier_hint:null,priority:'normal',needed_by:null,notes:'',display_order:1,created_at:'',updated_at:''},
]satisfies RequestedItem[]
const prior={id:'candidate-prior',research_job_id:'job-prior',procurement_request_id:'request-1',requested_item_id:'item-1',follow_up_to_candidate_id:null,supplier_name:'Earlier Supplier',matched_supplier_id:null,product_title:'Cleansing surfactant 1 kg',source_url:'https://supplier.test/surfactant',package_quantity:1,package_unit:'kg',item_price:210,currency:'NOK',moq:1,shipping_cost:null,tax_duty_estimate:null,delivery_estimate_days:null,stock_status:'unknown',coa_availability:'available',sds_availability:'unknown',technical_document_availability:'unknown',first_order_discount:null,source_date:'2026-08-15',evidence_snippets:['COA listed.'],source_notes:'Earlier research.',confidence:'medium',freshness:'fresh',field_states:{},field_evidence:{},is_marketplace_listing:false,unresolved_fields:['shipping_cost','tax_duty_estimate','delivery_estimate_days'],review_status:'pending',accepted_offer_id:null,duplicate_of_candidate_id:null,merged_into_offer_id:null,review_notes:'',reviewed_at:null,created_at:'',updated_at:''}satisfies OfferCandidate

describe('follow-up research objective',()=>{
 it('generates a generic editable draft from request, gaps, requested items, country and supplier hints',()=>{
  const draft=buildFollowUpInstructionDraft({request,items,priorCandidates:[prior],deliveryCountry:'SE'})
  expect(draft).toContain('Workshop cleansing concentrate')
  expect(draft).toContain('shipping cost')
  expect(draft).toContain('tax/duty estimate')
  expect(draft).toContain('Do not infer destination tax or duty')
  expect(draft).toContain('Preservative system')
  expect(draft).toContain('Sweden')
  expect(draft).toContain('Nordic Materials')
  expect(draft).toContain('without treating them as mandatory suppliers')
  expect(draft).not.toMatch(/Foot Care|Mystic Moments/i)
 })

 it('reports unresolved gaps, practical-candidate misses and newly resolved fields without overwriting the prior candidate',()=>{
  expect(unresolvedFieldsForCandidates([prior])).toEqual(['delivery_estimate_days','shipping_cost','tax_duty_estimate'])
  expect(requestedItemsWithoutPracticalCandidate(items,[prior]).map(item=>item.id)).toEqual(['item-1','item-2'])
  const followUp={...prior,id:'candidate-follow-up',research_job_id:'job-follow-up',follow_up_to_candidate_id:prior.id,shipping_cost:79,tax_duty_estimate:62,unresolved_fields:['delivery_estimate_days']}
  expect(fieldsResolvedByFollowUp(followUp,prior)).toEqual(['shipping_cost','tax_duty_estimate'])
  expect(prior.shipping_cost).toBeNull()
  expect(prior.tax_duty_estimate).toBeNull()
  expect(prior.unresolved_fields).toEqual(['shipping_cost','tax_duty_estimate','delivery_estimate_days'])
 })
})
