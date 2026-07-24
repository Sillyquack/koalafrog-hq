import{BACKGROUND_BATCH_SIZE}from'./procurementBackgroundLifecycle.ts'
import{processProcurementBackgroundOperation}from'./procurementBackgroundProcessor.ts'

/* eslint-disable @typescript-eslint/no-explicit-any -- the shared worker boundary
accepts the generated Supabase client without coupling Edge Functions to the
browser's generated schema */
type Database={
 from:(table:string)=>any
 rpc:(name:string,args:Record<string,unknown>)=>any
}

export interface ReconciliationBatchResult{
 expiredUnmatched:number
 processed:number
 sweepStatus:'ok'|'error'
 outcomes:Record<string,number>
}

export async function reconcileProcurementBackgroundBatch(options:{
 database:Database
 providerKey:string
}):Promise<ReconciliationBatchResult>{
 const sweep=await options.database.rpc('expire_procurement_unmatched_webhooks',{
  maximum_rows:25,
 })
 const sweepStatus=sweep.error?'error':'ok'
 const expiredUnmatched=sweep.error?0:Number(sweep.data??0)
 if(sweep.error){
  console.info(JSON.stringify({
   event:'procurement_unmatched_webhook_sweep_failed',
   code:'BACKGROUND_WEBHOOK_SWEEP_FAILED',
  }))
 }

 const due=await options.database.from('procurement_background_operations')
  .select('attempt_id,job_id,workspace_id,provider_operation_id,submission_state,intent_created_at,reconciliation_attempt_count,transient_failure_count')
  .is('terminal_at',null).lte('next_reconciliation_at',new Date().toISOString())
  .order('next_reconciliation_at',{ascending:true}).limit(BACKGROUND_BATCH_SIZE)
 if(due.error)throw new Error('BACKGROUND_OPERATION_QUERY_FAILED')

 const outcomes:Record<string,number>={}
 for(const operation of due.data??[]){
  const inbox=operation.provider_operation_id
   ?await options.database.from('procurement_background_webhook_inbox')
    .select('event_id,terminal_event_type').eq('provider_operation_id',operation.provider_operation_id)
    .in('processing_state',['received','unmatched_pending','transient_failure'])
    .order('received_at',{ascending:true}).limit(1).maybeSingle()
   :{data:null,error:null}
  let outcome:string
  try{
   const result=await processProcurementBackgroundOperation({
    database:options.database,providerKey:options.providerKey,operation,
    eventId:inbox.data?.event_id??null,
    eventType:inbox.data?.terminal_event_type??null,source:'reconciler',
   })
   outcome=result.kind
  }catch{
   outcome='transient_failure'
  }
  outcomes[outcome]=(outcomes[outcome]??0)+1
 }

 return{
  expiredUnmatched,
  processed:(due.data??[]).length,
  sweepStatus,
  outcomes,
 }
}
