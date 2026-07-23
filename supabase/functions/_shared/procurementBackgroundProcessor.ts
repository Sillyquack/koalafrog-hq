import{
 BACKGROUND_MAX_AGE_MS,BACKGROUND_MAX_ATTEMPTS,BACKGROUND_RETRIEVAL_TIMEOUT_MS,normalizedCandidateRows,
 outputText,reconciliationDelaySeconds,retryableRetrievalStatus,
 terminalStatusFromEvent,type ProcessingOutcome,type TerminalSource,
}from'./procurementBackgroundLifecycle.ts'

/* eslint-disable @typescript-eslint/no-explicit-any -- shared Edge Function boundary accepts the generated Supabase client without coupling this module to one generated schema */
type Database={
 from:(table:string)=>any
 rpc:(name:string,args:Record<string,unknown>)=>any
}

interface Operation{
 attempt_id:string
 job_id:string
 workspace_id:string
 provider_operation_id:string|null
 submission_state:string
 intent_created_at:string
 reconciliation_attempt_count:number
}

const safeLog=(event:string,detail:Record<string,unknown>={})=>
 console.info(JSON.stringify({event,...detail}))

async function reschedule(
 database:Database,
 operation:Operation,
 workerId:string,
 eventId:string|null,
 code:string,
 incrementFailure=true,
){
 const delay=reconciliationDelaySeconds(operation.reconciliation_attempt_count,operation.attempt_id)
 const result=await database.rpc('reschedule_procurement_background_operation',{
  candidate_attempt_id:operation.attempt_id,candidate_worker_id:workerId,
  safe_failure_code:code,delay_seconds:delay,increment_failure:incrementFailure,
 })
 if(result.error)throw new Error('BACKGROUND_RESCHEDULE_FAILED')
 if(eventId){
  const inbox=await database.rpc('mark_procurement_background_webhook_retry',{
   candidate_event_id:eventId,safe_failure_code:code,delay_seconds:delay,
  })
  if(inbox.error)throw new Error('BACKGROUND_INBOX_RESCHEDULE_FAILED')
 }
 return{kind:'rescheduled',code}as const
}

async function finalize(
 database:Database,
 operation:Operation,
 workerId:string,
 eventId:string|null,
 status:string,
 source:TerminalSource,
 candidates:Record<string,unknown>[],
 partial:boolean,
 errorCode:string|null,
 errorDetails:string|null,
):Promise<ProcessingOutcome>{
 const result=await database.rpc('finalize_procurement_background_operation',{
  candidate_attempt_id:operation.attempt_id,candidate_worker_id:workerId,
  candidate_event_id:eventId,candidate_provider_status:status,
  candidate_candidates:candidates,candidate_partial:partial,
  candidate_error_code:errorCode,candidate_error_details:errorDetails,
  candidate_terminal_source:source,
 })
 if(result.error)throw new Error('BACKGROUND_FINALIZE_FAILED')
 return{kind:result.data as'finalized'|'duplicate'|'discarded',candidateCount:candidates.length}
}

export async function processProcurementBackgroundOperation(options:{
 database:Database
 providerKey:string
 operation:Operation
 eventId?:string|null
 eventType?:string|null
 source:TerminalSource
 fetcher?:typeof fetch
 now?:()=>number
}):Promise<ProcessingOutcome>{
 const{database,providerKey,operation,eventId=null,eventType=null,source}=options
 const workerId=crypto.randomUUID()
 const claim=await database.rpc('claim_procurement_background_operation',{
  candidate_attempt_id:operation.attempt_id,candidate_worker_id:workerId,
  candidate_stage:eventId?'webhook_processing':'reconciliation_processing',lease_seconds:60,
 })
 if(claim.error)throw new Error('BACKGROUND_CLAIM_FAILED')
 if(!claim.data)return{kind:'busy'}

 const age=(options.now?.()??Date.now())-new Date(operation.intent_created_at).getTime()
 if(!operation.provider_operation_id){
  if(age<30*60*1000){
   return reschedule(database,operation,workerId,eventId,'BACKGROUND_ATTACHMENT_PENDING',false)
  }
  return finalize(
   database,operation,workerId,eventId,'failed','expiry',[],false,
   'BACKGROUND_SUBMISSION_AMBIGUOUS',
   'Provider submission could not be confirmed; no automatic resubmission was attempted.',
  )
 }

 if(eventType&&eventType!=='response.completed'){
  const status=terminalStatusFromEvent(eventType)
  const code=status==='failed'?'PROVIDER_FAILED':
   status==='incomplete'?'PROVIDER_INCOMPLETE':'PROVIDER_CANCELLED'
  return finalize(database,operation,workerId,eventId,status,source,[],false,code,'Background provider reached a terminal state.')
 }

 let response:Response
 try{
  response=await(options.fetcher??fetch)(
   `https://api.openai.com/v1/responses/${encodeURIComponent(operation.provider_operation_id)}`,
   {
    headers:{authorization:`Bearer ${providerKey}`},
    signal:AbortSignal.timeout(BACKGROUND_RETRIEVAL_TIMEOUT_MS),
   },
  )
 }catch{
  if(age>=BACKGROUND_MAX_AGE_MS||operation.reconciliation_attempt_count>=BACKGROUND_MAX_ATTEMPTS){
   return finalize(database,operation,workerId,eventId,'failed','expiry',[],false,
    'BACKGROUND_RECONCILIATION_EXHAUSTED','Background response retrieval could not be recovered.')
  }
  return reschedule(database,operation,workerId,eventId,'BACKGROUND_RETRIEVAL_TRANSIENT')
 }

 if(!response.ok){
  if(retryableRetrievalStatus(response.status)){
   if(age>=BACKGROUND_MAX_AGE_MS||operation.reconciliation_attempt_count>=BACKGROUND_MAX_ATTEMPTS){
    return finalize(database,operation,workerId,eventId,'failed','expiry',[],false,
     'BACKGROUND_RECONCILIATION_EXHAUSTED','Background response retrieval could not be recovered.')
   }
   return reschedule(database,operation,workerId,eventId,
    response.status===404?'BACKGROUND_PROVIDER_MISSING':'BACKGROUND_RETRIEVAL_TRANSIENT')
  }
  return finalize(database,operation,workerId,eventId,'failed',source,[],false,
   'PROVIDER_RETRIEVAL_REJECTED','Background provider response could not be retrieved.')
 }

 let providerResponse:unknown
 try{providerResponse=await response.json()}catch{
  return reschedule(database,operation,workerId,eventId,'BACKGROUND_RETRIEVAL_TRANSIENT')
 }
 const providerStatus=String((providerResponse as{status?:unknown}).status??'')
 if(providerStatus==='queued'||providerStatus==='in_progress'){
  return reschedule(database,operation,workerId,eventId,'BACKGROUND_PROVIDER_RUNNING',false)
 }
 if(['failed','incomplete','cancelled'].includes(providerStatus)){
  const code=providerStatus==='failed'?'PROVIDER_FAILED':
   providerStatus==='incomplete'?'PROVIDER_INCOMPLETE':'PROVIDER_CANCELLED'
  return finalize(database,operation,workerId,eventId,providerStatus,source,[],false,code,'Background provider reached a terminal state.')
 }
 if(providerStatus!=='completed'){
  return finalize(database,operation,workerId,eventId,'failed',source,[],false,
   'PROVIDER_INVALID_RESPONSE','Background provider returned an invalid terminal status.')
 }

 let items:Array<{id:string;required_specifications:string[]}>
 try{
  const job=await database.from('procurement_research_jobs')
   .select('procurement_request_id').eq('id',operation.job_id)
   .eq('workspace_id',operation.workspace_id).single()
  if(job.error||!job.data)throw new Error('JOB_LOOKUP_FAILED')
  const itemResult=await database.from('procurement_requested_items')
   .select('id,required_specifications').eq('workspace_id',operation.workspace_id)
   .eq('procurement_request_id',job.data.procurement_request_id)
  if(itemResult.error)throw new Error('ITEM_LOOKUP_FAILED')
  items=itemResult.data??[]
 }catch{
  return reschedule(database,operation,workerId,eventId,'BACKGROUND_STORAGE_TRANSIENT')
 }
 let normalized:ReturnType<typeof normalizedCandidateRows>
 try{
  const text=outputText(providerResponse)
  if(!text)throw new Error('EMPTY_PROVIDER_OUTPUT')
  normalized=normalizedCandidateRows(JSON.parse(text),items)
 }catch{
  return finalize(database,operation,workerId,eventId,'failed',source,[],false,
   'PROVIDER_INVALID_RESPONSE','Background research completed without a safe, valid result.')
 }
 try{
  const outcome=await finalize(
   database,operation,workerId,eventId,'completed',source,
   normalized.candidates,normalized.partial,null,null,
  )
  safeLog('procurement_background_processed',{outcome:outcome.kind,candidateCount:normalized.candidates.length})
  return outcome
 }catch{
  return reschedule(database,operation,workerId,eventId,'BACKGROUND_STORAGE_TRANSIENT')
 }
}
