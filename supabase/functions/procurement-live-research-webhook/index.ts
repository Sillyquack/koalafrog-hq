import{createClient}from'npm:@supabase/supabase-js@2'
import{freshnessFromSourceDate,validateLiveResearchResponse}from'../_shared/procurementLiveResearchContract.ts'
import{parseOpenAIResponseEvent,verifyOpenAIWebhook}from'../_shared/openAIWebhook.ts'

const jsonHeaders={'content-type':'application/json'}
const reply=(status:number,code:string)=>new Response(JSON.stringify({status:code}),{status,headers:jsonHeaders})
const terminalStatus=(type:string)=>type.slice('response.'.length)
const outputText=(payload:unknown)=>{
 const response=payload as{output?:Array<{content?:Array<{type?:unknown;text?:unknown}>}>}
 const item=response.output?.flatMap(output=>output.content??[]).find(content=>content.type==='output_text')
 return typeof item?.text==='string'?item.text:null
}
const candidateRow=(candidate:ReturnType<typeof validateLiveResearchResponse>['candidates'][number],requiredSpecifications:string[])=>{
 const evidenceSnippets=candidate.evidence.flatMap(evidence=>evidence.snippet?[evidence.snippet]:[])
 const unresolved=[
  ['source_url',candidate.sourceUrl],['package_quantity',candidate.packageQuantity],
  ['package_unit',candidate.packageUnit],['item_price',candidate.itemPrice],
  ['currency',candidate.currency],['shipping_cost',candidate.shippingCost],
  ['delivery_estimate_days',candidate.deliveryEstimateDays],
 ].filter(([,value])=>value==null||value==='').map(([field])=>field as string)
 if(requiredSpecifications.length&&!evidenceSnippets.length)unresolved.push('required_specification_evidence')
 return{
  requested_item_id:candidate.requestedItemId,supplier_name:candidate.supplierName,
  product_title:candidate.productTitle,source_url:candidate.sourceUrl,
  package_quantity:candidate.packageQuantity,package_unit:candidate.packageUnit,
  item_price:candidate.itemPrice,currency:candidate.currency,moq:candidate.moq,
  shipping_cost:candidate.shippingCost,delivery_estimate_days:candidate.deliveryEstimateDays,
  stock_status:candidate.stockStatus,coa_availability:candidate.coaAvailability,
  sds_availability:candidate.sdsAvailability,
  technical_document_availability:candidate.technicalDocumentAvailability,
  first_order_discount:candidate.firstOrderDiscount,source_date:candidate.sourceDate,
  evidence_snippets:evidenceSnippets,source_notes:candidate.sourceNotes,
  confidence:candidate.confidence,freshness:freshnessFromSourceDate(candidate.sourceDate),
  field_states:Object.fromEntries(candidate.evidence.map(evidence=>[evidence.field,evidence.state])),
  field_evidence:Object.fromEntries(candidate.evidence.map(evidence=>[evidence.field,{state:evidence.state,sourceUrl:evidence.sourceUrl,snippet:evidence.snippet}])),
  is_marketplace_listing:candidate.supplierType==='marketplace',unresolved_fields:unresolved,
 }
}

Deno.serve(async request=>{
 if(request.method!=='POST')return reply(405,'method_not_allowed')
 const declaredLength=Number(request.headers.get('content-length')??0)
 if(!Number.isFinite(declaredLength)||declaredLength<0||declaredLength>262_144)return reply(413,'payload_too_large')
 const secret=Deno.env.get('OPENAI_WEBHOOK_SECRET')
 if(!secret)return reply(503,'not_configured')
 const raw=await request.text()
 if(raw.length>262_144)return reply(413,'payload_too_large')
 if(!await verifyOpenAIWebhook(raw,request.headers,secret))return reply(400,'invalid_signature')
 let parsed:unknown
 try{parsed=JSON.parse(raw)}catch{return reply(400,'invalid_event')}
 const event=parseOpenAIResponseEvent(parsed)
 if(!event)return reply(200,'ignored')

 const url=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
 const providerKey=Deno.env.get('OPENAI_API_KEY')
 if(!url||!serviceKey||!providerKey)return reply(503,'not_configured')
 const database=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
 const operation=await database.from('procurement_background_operations')
  .select('job_id,workspace_id,owner_id,terminal_event_id')
  .eq('provider_operation_id',event.responseId).maybeSingle()
 if(operation.error)return reply(500,'storage_error')
 if(!operation.data)return reply(200,'unmatched')
 if(operation.data.terminal_event_id)return reply(200,'duplicate')

 const status=terminalStatus(event.type)
 let candidates:Record<string,unknown>[]=[]
 let partial=false,errorCode:string|null=null,errorDetails:string|null=null
 if(status==='completed'){
  try{
   const response=await fetch(`https://api.openai.com/v1/responses/${encodeURIComponent(event.responseId)}`,{
    headers:{authorization:`Bearer ${providerKey}`},
   })
   if(!response.ok)throw new Error('PROVIDER_RETRIEVAL_FAILED')
   const providerResponse=await response.json()
   const text=outputText(providerResponse)
   if(!text)throw new Error('PROVIDER_EMPTY_OUTPUT')
   const items=await database.from('procurement_requested_items')
    .select('id,required_specifications').eq('workspace_id',operation.data.workspace_id)
    .eq('procurement_request_id',(await database.from('procurement_research_jobs').select('procurement_request_id').eq('id',operation.data.job_id).single()).data?.procurement_request_id)
   if(items.error)throw new Error('JOB_ITEMS_UNAVAILABLE')
   const itemIds=(items.data??[]).map(item=>item.id)
   const validated=validateLiveResearchResponse(JSON.parse(text),itemIds)
   partial=validated.partial
   candidates=validated.candidates.map(candidate=>candidateRow(candidate,(items.data??[]).find(item=>item.id===candidate.requestedItemId)?.required_specifications??[]))
  }catch{
   errorCode='PROVIDER_INVALID_RESPONSE'
   errorDetails='Background research completed without a safe, valid result.'
  }
 }else{
  errorCode=status==='incomplete'?'PROVIDER_INCOMPLETE':status==='failed'?'PROVIDER_FAILURE':null
  errorDetails=errorCode?'Background research did not complete.':null
 }
 const effectiveStatus=errorCode?'failed':status
 const finalized=await database.rpc('finalize_procurement_background_operation',{
  candidate_provider_operation_id:event.responseId,candidate_event_id:event.id,
  candidate_provider_status:effectiveStatus,candidate_candidates:candidates,
  candidate_partial:partial,candidate_error_code:errorCode,candidate_error_details:errorDetails,
 })
 if(finalized.error){
  console.error(JSON.stringify({event:'procurement_background_finalize_failed',code:'DATABASE_FINALIZE_FAILED'}))
  return reply(500,'storage_error')
 }
 console.info(JSON.stringify({event:'procurement_background_terminal',outcome:finalized.data,candidateCount:candidates.length}))
 return reply(200,String(finalized.data))
})
