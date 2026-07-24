import{createClient}from'npm:@supabase/supabase-js@2'
import{BACKGROUND_BATCH_SIZE}from'../_shared/procurementBackgroundLifecycle.ts'
import{processProcurementBackgroundOperation}from'../_shared/procurementBackgroundProcessor.ts'

const headers={'content-type':'application/json'}
const reply=(status:number,body:Record<string,unknown>)=>
 new Response(JSON.stringify(body),{status,headers})
const safeEqual=(left:string,right:string)=>{
 if(left.length!==right.length)return false
 let difference=0
 for(let index=0;index<left.length;index++)difference|=left.charCodeAt(index)^right.charCodeAt(index)
 return difference===0
}

Deno.serve(async request=>{
 if(request.method!=='POST')return reply(405,{status:'method_not_allowed'})
 const expected=Deno.env.get('PROCUREMENT_RECONCILER_SECRET')
 const supplied=request.headers.get('x-procurement-reconciler-secret')??''
 if(!expected||!supplied||!safeEqual(expected,supplied))return reply(401,{status:'unauthorized'})
 const url=Deno.env.get('SUPABASE_URL'),serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
 const providerKey=Deno.env.get('OPENAI_API_KEY')
 if(!url||!serviceKey||!providerKey)return reply(503,{status:'not_configured'})
 const database=createClient(url,serviceKey,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
 })
 const due=await database.from('procurement_background_operations')
  .select('attempt_id,job_id,workspace_id,provider_operation_id,submission_state,intent_created_at,reconciliation_attempt_count,transient_failure_count')
  .is('terminal_at',null).lte('next_reconciliation_at',new Date().toISOString())
  .order('next_reconciliation_at',{ascending:true}).limit(BACKGROUND_BATCH_SIZE)
 if(due.error)return reply(503,{status:'storage_error'})
 const results:{outcome:string}[]=[]
 for(const operation of due.data??[]){
  const inbox=operation.provider_operation_id
   ?await database.from('procurement_background_webhook_inbox')
    .select('event_id,terminal_event_type').eq('provider_operation_id',operation.provider_operation_id)
    .in('processing_state',['received','unmatched_pending','transient_failure'])
    .order('received_at',{ascending:true}).limit(1).maybeSingle()
   :{data:null,error:null}
  try{
   const outcome=await processProcurementBackgroundOperation({
    database,providerKey,operation,eventId:inbox.data?.event_id??null,
    eventType:inbox.data?.terminal_event_type??null,source:'reconciler',
   })
   results.push({outcome:outcome.kind})
  }catch{
   results.push({outcome:'transient_failure'})
  }
 }
 console.info(JSON.stringify({
  event:'procurement_reconciliation_batch',processed:results.length,
  outcomes:results.reduce<Record<string,number>>((counts,result)=>{
   counts[result.outcome]=(counts[result.outcome]??0)+1
   return counts
  },{}),
 }))
 return reply(200,{status:'ok',processed:results.length})
})
