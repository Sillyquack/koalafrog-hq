import{createClient}from'npm:@supabase/supabase-js@2'
import{parseOpenAIResponseEvent,verifyOpenAIWebhook}from'../_shared/openAIWebhook.ts'
import{processProcurementBackgroundOperation}from'../_shared/procurementBackgroundProcessor.ts'

const jsonHeaders={'content-type':'application/json'}
const reply=(status:number,code:string)=>new Response(JSON.stringify({status:code}),{status,headers:jsonHeaders})

Deno.serve(async request=>{
 if(request.method!=='POST')return reply(405,'method_not_allowed')
 const declaredLength=Number(request.headers.get('content-length')??0)
 if(!Number.isFinite(declaredLength)||declaredLength<0||declaredLength>262_144){
  return reply(413,'payload_too_large')
 }
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
 const database=createClient(url,serviceKey,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
 })

 // A valid event is acknowledged only after its safe metadata is durable.
 const stored=await database.rpc('store_procurement_background_webhook',{
  candidate_event_id:event.id,candidate_provider_operation_id:event.responseId,
  candidate_event_type:event.type,
 })
 if(stored.error){
  console.error(JSON.stringify({event:'procurement_webhook_store_failed',code:'BACKGROUND_INBOX_UNAVAILABLE'}))
  return reply(503,'storage_error')
 }

 const operation=await database.from('procurement_background_operations')
  .select('attempt_id,job_id,workspace_id,provider_operation_id,submission_state,intent_created_at,reconciliation_attempt_count,transient_failure_count')
  .eq('provider_operation_id',event.responseId).maybeSingle()
 if(operation.error)return reply(200,'stored_pending')
 if(!operation.data)return reply(200,'stored_pending')

 try{
  const outcome=await processProcurementBackgroundOperation({
   database,providerKey,operation:operation.data,eventId:event.id,
   eventType:event.type,source:'webhook',
  })
  return reply(200,outcome.kind)
 }catch{
  // The event is already durable. Reconciliation owns subsequent processing.
  await database.rpc('mark_procurement_background_webhook_retry',{
   candidate_event_id:event.id,safe_failure_code:'BACKGROUND_PROCESSING_TRANSIENT',
   delay_seconds:60,
  })
  return reply(200,'stored_pending')
 }
})
