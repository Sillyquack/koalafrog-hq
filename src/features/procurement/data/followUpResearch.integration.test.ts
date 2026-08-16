/* eslint-disable @typescript-eslint/no-explicit-any -- migration intentionally precedes generated Supabase type refresh */
import{createClient}from'@supabase/supabase-js'
import{afterAll,beforeAll,describe,expect,it}from'vitest'
import{supabase}from'../../../platform/supabase/client'
import type{Database}from'../../../platform/supabase/generated/database.types'

const url=import.meta.env.VITE_SUPABASE_TEST_URL as string|undefined
const serviceKey=import.meta.env.VITE_SUPABASE_TEST_SERVICE_ROLE_KEY as string|undefined
const anonKey=import.meta.env.VITE_SUPABASE_TEST_ANON_KEY as string|undefined
const run=url&&serviceKey&&anonKey&&supabase?describe:describe.skip

run('targeted Procurement follow-up research against local Supabase',()=>{
 const createdUsers:string[]=[]
 let admin:ReturnType<typeof createClient<Database>>

 beforeAll(()=>{admin=createClient<Database>(url!,serviceKey!,{auth:{persistSession:false}})})
 afterAll(async()=>{
  await supabase!.auth.signOut()
  for(const id of createdUsers)await admin.auth.admin.deleteUser(id)
 })

 it('creates owner-scoped lineage with tax/duty evidence and has zero downstream side effects until explicit acceptance',async()=>{
  const email=`follow-up-owner-${crypto.randomUUID()}@example.test`,password=`Local-${crypto.randomUUID()}-9a!`
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true})
  if(created.error)throw created.error
  const ownerId=created.data.user.id
  createdUsers.push(ownerId)
  expect((await supabase!.auth.signInWithPassword({email,password})).error).toBeNull()
  const workspace=await supabase!.rpc('create_clean_workspace')
  if(workspace.error)throw workspace.error
  const workspaceId=workspace.data
  const owned={workspace_id:workspaceId,owner_id:ownerId}

  const request=await (supabase as any).from('procurement_requests').insert({...owned,title:'Workshop cleansing concentrate',status:'researching',category:'raw_material'}).select('id').single()
  if(request.error)throw request.error
  const items=await (supabase as any).from('procurement_requested_items').insert([
   {...owned,procurement_request_id:request.data.id,name:'Cleansing surfactant',category:'surfactant',requested_quantity:1,unit:'kg',required_specifications:['COA'],preferred_supplier_hint:'Nordic Materials',display_order:0},
   {...owned,procurement_request_id:request.data.id,name:'Preservative system',category:'preservative',requested_quantity:0.1,unit:'kg',required_specifications:['SDS'],display_order:1},
  ]).select('id,name')
  if(items.error)throw items.error
  const surfactantItem=items.data.find((item:{name:string})=>item.name==='Cleansing surfactant')!
  const preservativeItem=items.data.find((item:{name:string})=>item.name==='Preservative system')!
  const priorJob=await (supabase as any).from('procurement_research_jobs').insert({...owned,procurement_request_id:request.data.id,provider:'openai-web-search-v1',status:'partial',started_at:'2026-08-15T10:00:00Z',completed_at:'2026-08-15T10:05:00Z',result_count:1}).select('*').single()
  if(priorJob.error)throw priorJob.error
  const priorCandidate=await (supabase as any).from('procurement_offer_candidates').insert({...owned,research_job_id:priorJob.data.id,procurement_request_id:request.data.id,requested_item_id:surfactantItem.id,supplier_name:'Earlier Supplier',product_title:'Cleansing surfactant 1 kg',source_url:'https://supplier.test/surfactant',package_quantity:1,package_unit:'kg',item_price:210,currency:'NOK',shipping_cost:null,tax_duty_estimate:null,delivery_estimate_days:null,stock_status:'unknown',coa_availability:'available',sds_availability:'unknown',technical_document_availability:'unknown',source_date:'2026-08-15',evidence_snippets:['COA listed.'],source_notes:'Earlier evidence.',confidence:'medium',freshness:'fresh',field_states:{coa_availability:'reported'},field_evidence:{coa_availability:{state:'reported',sourceUrl:'https://supplier.test/surfactant',snippet:'COA listed.'}},is_marketplace_listing:false,unresolved_fields:['shipping_cost','tax_duty_estimate','delivery_estimate_days'],review_status:'pending'}).select('*').single()
  if(priorCandidate.error)throw priorCandidate.error
  const originalJob=structuredClone(priorJob.data),originalCandidate=structuredClone(priorCandidate.data)

  const count=async(table:string)=>(await (admin as any).from(table).select('*',{count:'exact',head:true}).eq('owner_id',ownerId)).count as number
  const sideEffectTables=['suppliers','procurement_supplier_offers','purchase_plans','purchase_orders','purchase_order_receipts','inventory_movements','packaging_inventory_movements']
  const sideEffectsBefore=Object.fromEntries(await Promise.all(sideEffectTables.map(async table=>[table,await count(table)])))
  const jobsBefore=await count('procurement_research_jobs')

  const refused=await (supabase as any).rpc('create_procurement_follow_up_research_job',{candidate_workspace_id:workspaceId,candidate_procurement_request_id:request.data.id,candidate_prior_job_id:priorJob.data.id,candidate_instructions:'Verify current shipping and delivery evidence.',candidate_delivery_country:'SE',candidate_live_research_consent:false})
  expect(refused.error?.message).toContain('PROCUREMENT_FOLLOW_UP_CONSENT_REQUIRED')
  expect(await count('procurement_research_jobs')).toBe(jobsBefore)

  const otherEmail=`follow-up-other-${crypto.randomUUID()}@example.test`,otherPassword=`Local-${crypto.randomUUID()}-9a!`
  const otherCreated=await admin.auth.admin.createUser({email:otherEmail,password:otherPassword,email_confirm:true})
  if(otherCreated.error)throw otherCreated.error
  createdUsers.push(otherCreated.data.user.id)
  const otherClient=createClient(url!,anonKey!,{auth:{persistSession:false}})
  expect((await otherClient.auth.signInWithPassword({email:otherEmail,password:otherPassword})).error).toBeNull()
  const isolated=await (otherClient as any).rpc('create_procurement_follow_up_research_job',{candidate_workspace_id:workspaceId,candidate_procurement_request_id:request.data.id,candidate_prior_job_id:priorJob.data.id,candidate_instructions:'Cross-owner attempt.',candidate_delivery_country:'SE',candidate_live_research_consent:true})
  expect(isolated.error?.message).toContain('PROCUREMENT_FOLLOW_UP_WORKSPACE_UNAVAILABLE')
  expect(await count('procurement_research_jobs')).toBe(jobsBefore)

  const createdFollowUp=await (supabase as any).rpc('create_procurement_follow_up_research_job',{candidate_workspace_id:workspaceId,candidate_procurement_request_id:request.data.id,candidate_prior_job_id:priorJob.data.id,candidate_instructions:'  Verify current shipping and delivery evidence.  ',candidate_delivery_country:'se',candidate_live_research_consent:true})
  if(createdFollowUp.error)throw createdFollowUp.error
  const followUpJob=await (supabase as any).from('procurement_research_jobs').select('*').eq('id',createdFollowUp.data).single()
  if(followUpJob.error)throw followUpJob.error
  expect(followUpJob.data).toMatchObject({status:'queued',provider:'openai-web-search-v1',follow_up_of_job_id:priorJob.data.id,retry_of_job_id:null,follow_up_instructions:'Verify current shipping and delivery evidence.',delivery_country:'SE'})
  expect(followUpJob.data.live_research_consent_at).toBeTruthy()
  expect(followUpJob.data.follow_up_context).toMatchObject({
   schemaVersion:1,unresolvedFields:['delivery_estimate_days','shipping_cost','tax_duty_estimate'],
   priorCandidates:[expect.objectContaining({id:priorCandidate.data.id,requestedItemId:surfactantItem.id,taxDutyEstimate:null,unresolvedFields:['shipping_cost','tax_duty_estimate','delivery_estimate_days']})],
   itemsWithoutPracticalCandidate:expect.arrayContaining([{requestedItemId:surfactantItem.id,name:'Cleansing surfactant'},{requestedItemId:preservativeItem.id,name:'Preservative system'}]),
  })
  expect((await (supabase as any).from('procurement_research_jobs').select('*').eq('id',priorJob.data.id).single()).data).toEqual(originalJob)
  expect((await (supabase as any).from('procurement_offer_candidates').select('*').eq('id',priorCandidate.data.id).single()).data).toEqual(originalCandidate)

  expect((await (supabase as any).from('procurement_research_jobs').update({status:'running',started_at:'2026-08-16T10:00:00Z'}).eq('id',followUpJob.data.id)).error).toBeNull()
  const resultCandidate={requested_item_id:surfactantItem.id,follow_up_to_candidate_id:null,supplier_name:'Earlier Supplier',matched_supplier_id:null,product_title:'Cleansing surfactant 1 kg',source_url:'https://supplier.test/surfactant',package_quantity:1,package_unit:'kg',item_price:210,currency:'NOK',moq:1,shipping_cost:79,tax_duty_estimate:62,delivery_estimate_days:null,stock_status:'in_stock',coa_availability:'available',sds_availability:'unknown',technical_document_availability:'unknown',first_order_discount:null,source_date:'2026-08-16',evidence_snippets:['Current shipping price is NOK 79.','Combined tax and duty estimate is NOK 62.'],source_notes:'Targeted follow-up evidence.',confidence:'medium',freshness:'fresh',field_states:{shipping_cost:'verified',taxDutyEstimate:'verified'},field_evidence:{shipping_cost:{state:'verified',sourceUrl:'https://supplier.test/surfactant',snippet:'Current shipping price is NOK 79.'},taxDutyEstimate:{state:'verified',sourceUrl:'https://supplier.test/import-cost',snippet:'Combined tax and duty estimate is NOK 62.'}},is_marketplace_listing:false,unresolved_fields:['delivery_estimate_days']}
  const published=await (supabase as any).rpc('publish_procurement_research_results',{candidate_workspace_id:workspaceId,candidate_job_id:followUpJob.data.id,candidates:[resultCandidate],terminal_status:'partial',provider_request_id:null})
  if(published.error)throw published.error
  expect(published.data).toBe(1)
  const linked=await (supabase as any).from('procurement_offer_candidates').select('*').eq('research_job_id',followUpJob.data.id).single()
  if(linked.error)throw linked.error
  expect(linked.data).toMatchObject({review_status:'pending',follow_up_to_candidate_id:priorCandidate.data.id,shipping_cost:79,tax_duty_estimate:62,unresolved_fields:['delivery_estimate_days'],field_evidence:{taxDutyEstimate:{state:'verified',sourceUrl:'https://supplier.test/import-cost',snippet:'Combined tax and duty estimate is NOK 62.'}}})
  expect((await (supabase as any).from('procurement_offer_candidates').select('*').eq('id',priorCandidate.data.id).single()).data).toEqual(originalCandidate)

  const retry=await (supabase as any).from('procurement_research_jobs').insert({...owned,procurement_request_id:request.data.id,provider:'openai-web-search-v1',status:'queued',retry_of_job_id:priorJob.data.id}).select('id,retry_of_job_id,follow_up_of_job_id,follow_up_context,follow_up_instructions,live_research_consent_at').single()
  if(retry.error)throw retry.error
  expect(retry.data).toMatchObject({retry_of_job_id:priorJob.data.id,follow_up_of_job_id:null,follow_up_context:null,follow_up_instructions:null,live_research_consent_at:null})

  for(const table of sideEffectTables)expect(await count(table),`${table} must not change`).toBe(sideEffectsBefore[table])

  expect((await (supabase as any).from('procurement_research_jobs').update({status:'running'}).eq('id',retry.data.id)).error).toBeNull()
  const forgedPublication=await (supabase as any).rpc('publish_procurement_research_results',{candidate_workspace_id:workspaceId,candidate_job_id:retry.data.id,candidates:[{...resultCandidate,field_states:{shipping_cost:'verified'},field_evidence:{shipping_cost:resultCandidate.field_evidence.shipping_cost},unresolved_fields:['delivery_estimate_days']}],terminal_status:'partial',provider_request_id:null})
  expect(forgedPublication.error?.message).toContain('procurement_offer_candidates_tax_duty_evidence_check')
  expect((await (supabase as any).from('procurement_offer_candidates').select('*',{count:'exact',head:true}).eq('research_job_id',retry.data.id)).count).toBe(0)
  expect((await (supabase as any).from('procurement_research_jobs').select('status,result_count').eq('id',retry.data.id).single()).data).toEqual({status:'running',result_count:0})

  const accepted=await (supabase as any).rpc('accept_procurement_offer_candidate',{candidate_workspace_id:workspaceId,candidate_id:linked.data.id,selected_supplier_id:null,create_supplier:true})
  if(accepted.error)throw accepted.error
  const acceptedOffer=await (supabase as any).from('procurement_supplier_offers').select('*').eq('id',accepted.data[0].offer_id).single()
  if(acceptedOffer.error)throw acceptedOffer.error
  expect(acceptedOffer.data).toMatchObject({tax_duty_estimate:62,currency:'NOK',shipping_cost:79})
  expect((await (supabase as any).from('procurement_offer_candidates').select('review_status,accepted_offer_id,tax_duty_estimate').eq('id',linked.data.id).single()).data).toEqual({review_status:'accepted',accepted_offer_id:accepted.data[0].offer_id,tax_duty_estimate:62})
  expect((await (supabase as any).from('procurement_offer_candidates').select('*').eq('id',priorCandidate.data.id).single()).data).toEqual(originalCandidate)
  for(const table of sideEffectTables.filter(table=>!['suppliers','procurement_supplier_offers'].includes(table)))expect(await count(table),`${table} must not change after acceptance`).toBe(sideEffectsBefore[table])
 })

 it('rejects a follow-up above the 10-item live contract atomically',async()=>{
  const email=`follow-up-limit-${crypto.randomUUID()}@example.test`,password=`Local-${crypto.randomUUID()}-9a!`
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true})
  if(created.error)throw created.error
  const ownerId=created.data.user.id
  createdUsers.push(ownerId)
  expect((await supabase!.auth.signInWithPassword({email,password})).error).toBeNull()
  const workspace=await supabase!.rpc('create_clean_workspace')
  if(workspace.error)throw workspace.error
  const owned={workspace_id:workspace.data,owner_id:ownerId}
  const request=await (supabase as any).from('procurement_requests').insert({...owned,title:'Oversized research request',status:'researching',category:'raw_material'}).select('id').single()
  if(request.error)throw request.error
  const itemInsert=await (supabase as any).from('procurement_requested_items').insert(Array.from({length:11},(_,index)=>({...owned,procurement_request_id:request.data.id,name:`Requested item ${index+1}`,category:'raw_material',requested_quantity:1,unit:'kg',display_order:index})))
  if(itemInsert.error)throw itemInsert.error
  const prior=await (supabase as any).from('procurement_research_jobs').insert({...owned,procurement_request_id:request.data.id,provider:'openai-web-search-v1',status:'failed',completed_at:'2026-08-16T09:00:00Z',error_code:'PROVIDER_INCOMPLETE'}).select('id').single()
  if(prior.error)throw prior.error
  const before=(await (admin as any).from('procurement_research_jobs').select('*',{count:'exact',head:true}).eq('owner_id',ownerId)).count

  const result=await (supabase as any).rpc('create_procurement_follow_up_research_job',{candidate_workspace_id:workspace.data,candidate_procurement_request_id:request.data.id,candidate_prior_job_id:prior.data.id,candidate_instructions:'Investigate remaining items.',candidate_delivery_country:'NO',candidate_live_research_consent:true})

  expect(result.error?.message).toContain('PROCUREMENT_FOLLOW_UP_ITEM_COUNT_INVALID')
  expect((await (admin as any).from('procurement_research_jobs').select('*',{count:'exact',head:true}).eq('owner_id',ownerId)).count).toBe(before)
 })
})
