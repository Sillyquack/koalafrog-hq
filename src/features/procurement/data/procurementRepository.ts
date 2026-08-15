/* eslint-disable @typescript-eslint/no-explicit-any -- Phase 10A tables are accessed through this adapter until generated types refresh */
import { supabase } from '../../../platform/supabase/client'
import { emptyProcurementData, type DraftPurchasePlanAggregate, type DraftPurchasePlanInput, type DraftPurchasePlanReceiptBundle, type ProcurementData, type Supplier, type SupplierCreateInput, type SupplierOffer, type SupplierOfferCreateInput, type SupplierProductSource } from '../domain/procurement'
import type { ProcurementExport } from './procurementInterchange'
import type { OfferCandidate } from '../domain/assistedResearch'
import {receiptFromPersistedRow,type ProcurementSupplierOfferOperationReceipt,type SupplierOperationReceipt} from '../../../platform/operations/ownerOperationReceipt'
import {assertOfferReadback,assertSupplierReadback,classifySupplierIdentity,normalizeSupplierCreateInput,normalizeSupplierOfferCreateInput,supplierProductSourceTable,supplierProductSourceUsable} from '../domain/commercialProvenance'
const client=()=>{if(!supabase)throw new Error('Hosted procurement requires Supabase.');return supabase as any}
const tableMap={suppliers:'suppliers',contacts:'supplier_contacts',candidates:'supplier_research_candidates',quotes:'supplier_quotes',quoteLines:'supplier_quote_lines',stockPolicies:'stock_policies',purchasePlans:'purchase_plans',purchasePlanBaskets:'purchase_plan_baskets',purchasePlanLines:'purchase_plan_lines',purchaseOrders:'purchase_orders',purchaseOrderLines:'purchase_order_lines',equipment:'equipment_items',capabilities:'equipment_capabilities',equipmentPolicies:'equipment_policies',serviceEvents:'equipment_service_events',processRequirements:'process_equipment_requirements',requests:'procurement_requests',requestedItems:'procurement_requested_items',offers:'procurement_supplier_offers',recommendations:'procurement_recommendations',supplierDiscounts:'procurement_supplier_discounts',supplierShippingRules:'procurement_supplier_shipping_rules',supplierDocuments:'supplier_document_records',supplierEvents:'supplier_events',cartScenarios:'procurement_cart_scenarios',cartScenarioItems:'procurement_cart_scenario_items',researchJobs:'procurement_research_jobs',researchDiagnostics:'procurement_provider_diagnostics',offerCandidates:'procurement_offer_candidates'} as const
export async function loadProcurement(workspaceId:string){
 const[entries,rawSources,packagingSources]=await Promise.all([
  Promise.all(Object.entries(tableMap).map(async([key,table])=>{const result=await client().from(table).select('*').eq('workspace_id',workspaceId).order('created_at',{ascending:false});if(result.error)throw new Error(result.error.message);return[key,result.data??[]]})),
  client().from('supplier_products').select('id,supplier_id,supplier_name,product_name,supplier_sku,package_quantity,package_unit,price,currency,product_url,country_code,lifecycle_status,product_status,discontinued,updated_at').eq('workspace_id',workspaceId).order('updated_at',{ascending:false}),
  client().from('packaging_supplier_products').select('id,supplier_id,supplier_name,product_name,supplier_sku,package_quantity,package_unit,price,currency,product_url,lifecycle_status,discontinued,updated_at').eq('workspace_id',workspaceId).order('updated_at',{ascending:false}),
 ])
 const sourceError=rawSources.error??packagingSources.error
 if(sourceError)throw new Error(sourceError.message)
 const supplierProductSources:SupplierProductSource[]=[
  ...(rawSources.data??[]).filter((row:any)=>Boolean(row.supplier_id)).map((row:any)=>({...row,domain:'raw_material' as const,product_status:row.product_status??null,country_code:row.country_code??null})),
  ...(packagingSources.data??[]).filter((row:any)=>Boolean(row.supplier_id)).map((row:any)=>({...row,domain:'packaging' as const,product_status:null,country_code:null})),
 ]
 return Object.assign(emptyProcurementData(),Object.fromEntries(entries),{supplierProductSources}) as ProcurementData
}
const owner=async()=>{const result=await client().auth.getUser();if(result.error||!result.data.user)throw new Error('Authenticated owner required.');return result.data.user.id}
const activeOwnerWorkspace=async(workspaceId:string)=>{const ownerId=await owner(),workspace=await client().from('workspaces').select('id').eq('id',workspaceId).eq('owner_id',ownerId).eq('lifecycle_state','active').single();if(workspace.error||!workspace.data)throw new Error('Active owner workspace could not be resolved.');return ownerId}
async function insert(table:string,workspaceId:string,values:Record<string,unknown>){const result=await client().from(table).insert({workspace_id:workspaceId,owner_id:await owner(),...values}).select().single();if(result.error)throw new Error(result.error.message);return result.data}
export type SupplierCreateResult=
 |{state:'confirmed';supplier:Supplier;receipt:SupplierOperationReceipt}
 |{state:'rejected_duplicate';entityType:'supplier';existingId:string;message:string}
 |{state:'ambiguous_conflict';entityType:'supplier';candidateIds:string[];message:string}

export async function createSupplier(workspaceId:string,input:SupplierCreateInput):Promise<SupplierCreateResult>{
 const values=normalizeSupplierCreateInput(input),ownerId=await activeOwnerWorkspace(workspaceId)
 const existing=await client().from('suppliers').select('id,legal_name,trading_name,supplier_type,status,website_url,country_code,default_currency,verification_state,internal_notes,is_preferred').eq('workspace_id',workspaceId).eq('owner_id',ownerId)
 if(existing.error)throw new Error(existing.error.message)
 const identity=classifySupplierIdentity(existing.data??[],values)
 if(identity.classification==='exact_existing')return{state:'rejected_duplicate',entityType:'supplier',existingId:identity.existingId,message:'An exact Supplier with this complete fingerprint already exists. No Supplier was created or merged.'}
 if(identity.classification==='normalized_conflict')return{state:'ambiguous_conflict',entityType:'supplier',candidateIds:identity.candidateIds,message:'A Supplier with the same normalized legal or trading identity already exists. Review the existing record; no Supplier was created or merged.'}
 const inserted=await client().from('suppliers').insert({workspace_id:workspaceId,owner_id:ownerId,...values}).select('id').single()
 if(inserted.error||!inserted.data)throw new Error(inserted.error?.message??'Supplier persistence returned no stable ID.')
 const readback=await client().from('suppliers').select('*').eq('id',inserted.data.id).eq('workspace_id',workspaceId).eq('owner_id',ownerId).single()
 if(readback.error||!readback.data)throw new Error(readback.error?.message??'Supplier owner readback failed after persistence.')
 const supplier=assertSupplierReadback(readback.data,workspaceId,ownerId,values)
 const naturalIdentity:Record<string,string>={legal_name:values.legal_name,supplier_type:values.supplier_type}
 if(values.trading_name)naturalIdentity.trading_name=values.trading_name
 if(values.country_code)naturalIdentity.country_code=values.country_code
 const receipt:SupplierOperationReceipt={schemaVersion:1,entityType:'supplier',recordId:String(readback.data.id),workspaceId,operation:'created',persistedAt:String(readback.data.created_at),naturalIdentity}
 return{state:'confirmed',supplier,receipt}
}
export const createContact=(workspaceId:string,values:Record<string,unknown>)=>insert('supplier_contacts',workspaceId,values)
export const createCandidate=(workspaceId:string,values:Record<string,unknown>)=>insert('supplier_research_candidates',workspaceId,values)
export const createQuote=(workspaceId:string,values:Record<string,unknown>)=>insert('supplier_quotes',workspaceId,values)
export const createStockPolicy=(workspaceId:string,values:Record<string,unknown>)=>insert('stock_policies',workspaceId,values)
export async function createProductStudioPurchasePlan(conceptId:string,lines:Record<string,unknown>[]){const result=await client().rpc('create_product_studio_purchase_plan',{concept_id:conceptId,lines});if(result.error)throw new Error(result.error.message);return result.data as string}

export interface FootCareProcurementHandoffReceipt {
  schemaVersion:1
  conceptId:string
  registryVersion:string
  groups:Array<{groupId:string;requestId:string;operation:'created'|'reused';createdItemCount:number;itemIds:string[]}>
  researchStarted:false
  candidateAccepted:false
  orderCreated:false
}

const isFootCareHandoffReceipt=(value:unknown):value is FootCareProcurementHandoffReceipt=>{
 const receipt=value as Partial<FootCareProcurementHandoffReceipt>|null
 return Boolean(receipt&&receipt.schemaVersion===1&&receipt.conceptId&&receipt.registryVersion&&Array.isArray(receipt.groups)&&receipt.groups.every(group=>group&&typeof group.requestId==='string'&&['created','reused'].includes(group.operation)&&Array.isArray(group.itemIds)&&group.itemIds.length<=10)&&receipt.researchStarted===false&&receipt.candidateAccepted===false&&receipt.orderCreated===false)
}

export async function createFootCareProcurementHandoff(workspaceId:string,conceptId:string,registryVersion:string,groups:unknown[]):Promise<FootCareProcurementHandoffReceipt>{
 const result=await client().rpc('create_foot_care_procurement_handoff',{candidate_workspace_id:workspaceId,candidate_concept_id:conceptId,candidate_registry_version:registryVersion,candidate_groups:groups})
 if(result.error)throw new Error(result.error.message)
 if(!isFootCareHandoffReceipt(result.data))throw new Error('Foot Care Procurement handoff returned an invalid safety receipt.')
 return result.data
}

const isDraftReceiptBundle=(value:unknown):value is DraftPurchasePlanReceiptBundle=>{
 if(!value||typeof value!=='object')return false
 const bundle=value as Partial<DraftPurchasePlanReceiptBundle>
 return bundle.schemaVersion===1&&['created','reused'].includes(String(bundle.operation))&&!!bundle.plan&&bundle.plan.entityType==='purchase_plan'&&bundle.plan.status==='draft'&&bundle.plan.placementState==='unplaced'&&bundle.plan.orderAuthorized===false&&Array.isArray(bundle.baskets)&&Array.isArray(bundle.lines)
}

export async function loadDraftPurchasePlan(workspaceId:string,planId:string):Promise<DraftPurchasePlanAggregate>{
 const userId=await owner(),workspace=await client().from('workspaces').select('id').eq('id',workspaceId).eq('owner_id',userId).eq('lifecycle_state','active').single()
 if(workspace.error||!workspace.data)throw new Error('Active owner workspace could not be resolved.')
 const[plan,baskets,lines]=await Promise.all([
  client().from('purchase_plans').select('*').eq('workspace_id',workspaceId).eq('id',planId).single(),
  client().from('purchase_plan_baskets').select('*').eq('workspace_id',workspaceId).eq('purchase_plan_id',planId).order('supplier_name_snapshot').order('currency'),
  client().from('purchase_plan_lines').select('*').eq('workspace_id',workspaceId).eq('purchase_plan_id',planId).order('display_order'),
 ])
 const error=plan.error??baskets.error??lines.error
 if(error)throw new Error(error.message)
 if(plan.data.status!=='draft'||plan.data.placement_state!=='unplaced'||plan.data.order_authorized!==false)throw new Error('Persisted plan readback did not preserve Draft, unplaced, unauthorised semantics.')
 return{plan:plan.data,baskets:baskets.data??[],lines:lines.data??[]} as DraftPurchasePlanAggregate
}

export async function createDraftPurchasePlan(workspaceId:string,input:DraftPurchasePlanInput):Promise<{receipt:DraftPurchasePlanReceiptBundle;aggregate:DraftPurchasePlanAggregate}>{
 const result=await client().rpc('create_draft_purchase_plan_v1',{candidate_workspace_id:workspaceId,candidate_idempotency_key:input.idempotencyKey,candidate_plan:input.plan,candidate_baskets:input.baskets})
 if(result.error)throw new Error(result.error.message)
 if(!isDraftReceiptBundle(result.data))throw new Error('Draft Purchase Plan creation returned an invalid receipt bundle.')
 const aggregate=await loadDraftPurchasePlan(workspaceId,result.data.plan.recordId)
 const basketIds=new Set(aggregate.baskets.map(item=>item.id)),lineIds=new Set(aggregate.lines.map(item=>item.id))
 if(aggregate.baskets.length!==result.data.baskets.length||result.data.baskets.some((item:{recordId:string})=>!basketIds.has(item.recordId)))throw new Error('Draft Purchase Plan basket readback did not match the receipt bundle.')
 if(aggregate.lines.length!==result.data.lines.length||result.data.lines.some((item:{recordId:string})=>!lineIds.has(item.recordId)))throw new Error('Draft Purchase Plan line readback did not match the receipt bundle.')
 return{receipt:result.data,aggregate}
}
export const createEquipment=async(workspaceId:string,values:Record<string,unknown>)=>receiptFromPersistedRow('equipment',workspaceId,await insert('equipment_items',workspaceId,values),{name:String(values.name??''),equipment_type:String(values.equipment_type??'')})
export const recordService=(workspaceId:string,values:Record<string,unknown>)=>insert('equipment_service_events',workspaceId,values)
export const createRequest=async(workspaceId:string,values:Record<string,unknown>)=>receiptFromPersistedRow('procurement_request',workspaceId,await insert('procurement_requests',workspaceId,values),{title:String(values.title??''),category:String(values.category??'')})
export const createRequestedItem=async(workspaceId:string,values:Record<string,unknown>)=>{const parentId=String(values.procurement_request_id??'');return receiptFromPersistedRow('procurement_requested_item',workspaceId,await insert('procurement_requested_items',workspaceId,values),{procurement_request_id:parentId,name:String(values.name??''),category:String(values.category??'')},parentId)}
async function validateOfferRelationships(workspaceId:string,ownerId:string,values:SupplierOfferCreateInput){
 const sourcePromise=values.source_supplier_product_domain===null
  ?Promise.resolve(null)
  :client().from(supplierProductSourceTable(values.source_supplier_product_domain)).select('*').eq('workspace_id',workspaceId).eq('owner_id',ownerId).eq('id',values.source_supplier_product_id).maybeSingle()
 const[item,supplier,source]=await Promise.all([
  client().from('procurement_requested_items').select('id').eq('workspace_id',workspaceId).eq('owner_id',ownerId).eq('id',values.requested_item_id).maybeSingle(),
  client().from('suppliers').select('id,archived_at').eq('workspace_id',workspaceId).eq('owner_id',ownerId).eq('id',values.supplier_id).maybeSingle(),
  sourcePromise,
 ])
 if(item.error||!item.data)throw new Error('Requested item is unavailable in the active owner workspace.')
 if(supplier.error||!supplier.data||supplier.data.archived_at)throw new Error('Supplier is unavailable in the active owner workspace.')
 if(values.source_supplier_product_domain!==null){
  if(!source||source.error||!source.data)throw new Error('Selected Supplier Product is stale or unavailable in the active owner workspace.')
  if(source.data.supplier_id!==values.supplier_id)throw new Error('Selected Supplier Product belongs to a different Supplier.')
  if(!supplierProductSourceUsable({discontinued:Boolean(source.data.discontinued),lifecycle_status:String(source.data.lifecycle_status??''),product_status:source.data.product_status==null?null:String(source.data.product_status)}))throw new Error('Selected Supplier Product is discontinued, rejected, inactive, or otherwise unavailable for new Offer provenance.')
 }
}

export async function createOffer(workspaceId:string,input:SupplierOfferCreateInput):Promise<{offer:SupplierOffer;receipt:ProcurementSupplierOfferOperationReceipt}>{
 const values=normalizeSupplierOfferCreateInput(input),ownerId=await activeOwnerWorkspace(workspaceId)
 await validateOfferRelationships(workspaceId,ownerId,values)
 const inserted=await client().from('procurement_supplier_offers').insert({workspace_id:workspaceId,owner_id:ownerId,...values}).select('id').single()
 if(inserted.error||!inserted.data)throw new Error(inserted.error?.message??'Offer persistence returned no stable ID.')
 const readback=await client().from('procurement_supplier_offers').select('*').eq('id',inserted.data.id).eq('workspace_id',workspaceId).eq('owner_id',ownerId).single()
 if(readback.error||!readback.data)throw new Error(readback.error?.message??'Offer owner readback failed after persistence.')
 const offer=assertOfferReadback(readback.data,workspaceId,ownerId,values)
 const receipt:ProcurementSupplierOfferOperationReceipt={
  schemaVersion:1,entityType:'procurement_supplier_offer',recordId:String(readback.data.id),workspaceId,operation:'created',persistedAt:String(readback.data.created_at),
  parent:{entityType:'procurement_requested_item',recordId:values.requested_item_id},supplierId:values.supplier_id,
  sourceSupplierProductDomain:values.source_supplier_product_domain,sourceSupplierProductId:values.source_supplier_product_id,
  naturalIdentity:{product_title:values.product_title,package_quantity:String(values.package_quantity),package_unit:values.package_unit,date_checked:values.date_checked},
 }
 return{offer,receipt}
}
export const createRecommendation=(workspaceId:string,values:Record<string,unknown>)=>insert('procurement_recommendations',workspaceId,values)
export const createSupplierDiscount=(workspaceId:string,values:Record<string,unknown>)=>insert('procurement_supplier_discounts',workspaceId,values)
export const createSupplierShippingRule=(workspaceId:string,values:Record<string,unknown>)=>insert('procurement_supplier_shipping_rules',workspaceId,values)
export const createSupplierDocument=(workspaceId:string,values:Record<string,unknown>)=>insert('supplier_document_records',workspaceId,values)
export const createSupplierEvent=(workspaceId:string,values:Record<string,unknown>)=>insert('supplier_events',workspaceId,values)
export const createCartScenario=(workspaceId:string,values:Record<string,unknown>)=>insert('procurement_cart_scenarios',workspaceId,values)
export const createCartScenarioItem=(workspaceId:string,values:Record<string,unknown>)=>insert('procurement_cart_scenario_items',workspaceId,values)
export const createResearchJob=(workspaceId:string,values:Record<string,unknown>)=>insert('procurement_research_jobs',workspaceId,values)
export const createOfferCandidates=async(workspaceId:string,values:Record<string,unknown>[])=>{const ownerId=await owner(),result=await client().from('procurement_offer_candidates').insert(values.map(value=>({workspace_id:workspaceId,owner_id:ownerId,...value}))).select();if(result.error)throw new Error(result.error.message);return result.data}
export async function updateResearchJob(id:string,values:Record<string,unknown>){const result=await client().from('procurement_research_jobs').update({...values,updated_at:new Date().toISOString()}).eq('id',id).select().single();if(result.error)throw new Error(result.error.message);return result.data}
export async function failResearchJob(id:string,values:Record<string,unknown>){const result=await client().from('procurement_research_jobs').update({...values,status:'failed',completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id).eq('status','running').select().maybeSingle();if(result.error)throw new Error(result.error.message);return result.data}
export async function cancelResearchJob(id:string){const now=new Date().toISOString(),result=await client().from('procurement_research_jobs').update({status:'cancelled',cancellation_requested_at:now,completed_at:now,updated_at:now}).eq('id',id).in('status',['queued','running']).select().maybeSingle();if(result.error)throw new Error(result.error.message);if(!result.data)throw new Error('Only a queued or running research job can be cancelled.');return result.data}
export async function publishResearchResults(workspaceId:string,jobId:string,candidates:Record<string,unknown>[],status:'partial'|'completed',providerRequestId:string|null){const result=await client().rpc('publish_procurement_research_results',{candidate_workspace_id:workspaceId,candidate_job_id:jobId,candidates,terminal_status:status,provider_request_id:providerRequestId});if(result.error)throw new Error(result.error.message);return result.data as number}
export async function updateOfferCandidate(id:string,values:Record<string,unknown>){const result=await client().from('procurement_offer_candidates').update({...values,updated_at:new Date().toISOString()}).eq('id',id).eq('review_status','pending').select().single();if(result.error)throw new Error(result.error.message);return result.data}
export async function acceptCandidate(candidate:OfferCandidate,workspaceId:string,selectedSupplierId?:string){if(candidate.review_status!=='pending')throw new Error('Candidate has already been reviewed.');const result=await client().rpc('accept_procurement_offer_candidate',{candidate_workspace_id:workspaceId,candidate_id:candidate.id,selected_supplier_id:selectedSupplierId??candidate.matched_supplier_id,create_supplier:true});if(result.error)throw new Error(result.error.message);return result.data?.[0] as{supplier_id:string;offer_id:string}}
export async function reviewCandidate(candidate:OfferCandidate,decision:'rejected'|'duplicate'|'merged',_workspaceId:string,options:{targetOfferId?:string;duplicateCandidateId?:string;notes?:string}={}){if(candidate.review_status!=='pending')throw new Error('Candidate has already been reviewed.');if(decision==='merged'&&!options.targetOfferId)throw new Error('A target offer is required.');if(decision==='duplicate'&&!options.duplicateCandidateId)throw new Error('A duplicate candidate is required.');const result=await client().from('procurement_offer_candidates').update({review_status:decision,duplicate_of_candidate_id:decision==='duplicate'?options.duplicateCandidateId:null,merged_into_offer_id:decision==='merged'?options.targetOfferId:null,review_notes:options.notes??'',reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',candidate.id).eq('review_status','pending').select().single();if(result.error)throw new Error(result.error.message);return result.data}
export async function importOffers(workspaceId:string,offers:SupplierOfferCreateInput[]):Promise<SupplierOffer[]>{
 if(!offers.length)return[]
 const ownerId=await activeOwnerWorkspace(workspaceId),values=offers.map(normalizeSupplierOfferCreateInput)
 await Promise.all(values.map(offer=>validateOfferRelationships(workspaceId,ownerId,offer)))
 const result=await client().from('procurement_supplier_offers').insert(values.map(offer=>({workspace_id:workspaceId,owner_id:ownerId,...offer}))).select()
 if(result.error)throw new Error(result.error.message)
 return(result.data??[]) as SupplierOffer[]
}
export async function importSnapshot(workspaceId:string,snapshot:ProcurementExport){const result=await client().rpc('import_procurement_purchasing_snapshot',{candidate_workspace_id:workspaceId,payload:snapshot});if(result.error)throw new Error(result.error.message)}
export async function linkSupplierProduct(table:'supplier_products'|'packaging_supplier_products',id:string,supplierId:string,updatedAt:string){const result=await client().from(table).update({supplier_id:supplierId,updated_at:new Date().toISOString()}).eq('id',id).eq('updated_at',updatedAt).select('id').maybeSingle();if(result.error)throw new Error(result.error.message);if(!result.data)throw new Error('This Supplier Product changed. Refresh and retry.');return result.data}
export async function createPurchaseOrderFromPlan(id:string){const result=await client().rpc('create_purchase_order_from_plan',{target_plan_id:id,candidate_handoff_key:crypto.randomUUID()});if(result.error)throw new Error(result.error.message);return result.data as string}
export async function recordPurchaseOrderPlacement(id:string,revision:number,reference:string){const result=await client().rpc('record_purchase_order_placement',{target_order_id:id,expected_revision:revision,external_reference:reference,placed_at:new Date().toISOString()});if(result.error)throw new Error(result.error.message);return result.data as number}
export async function updateRecord(table:string,id:string,revision:number,values:Record<string,unknown>){const result=await client().from(table).update({...values,revision:revision+1,updated_at:new Date().toISOString()}).eq('id',id).eq('revision',revision).select().maybeSingle();if(result.error)throw new Error(result.error.message);if(!result.data)throw new Error('This record changed. Reload and retry.');return result.data}
export async function updatePurchasingRecord(table:'procurement_supplier_discounts'|'procurement_supplier_shipping_rules'|'procurement_cart_scenarios'|'procurement_cart_scenario_items',id:string,values:Record<string,unknown>){const result=await client().from(table).update({...values,updated_at:new Date().toISOString()}).eq('id',id).select().single();if(result.error)throw new Error(result.error.message);return result.data}
export async function loadProcurementBackup(ownerId:string){const entries=await Promise.all(Object.entries(tableMap).map(async([key,table])=>{const result=await client().from(table).select('*').eq('owner_id',ownerId);if(result.error)throw new Error(result.error.message);return[key,result.data??[]]}));return Object.fromEntries(entries)}
