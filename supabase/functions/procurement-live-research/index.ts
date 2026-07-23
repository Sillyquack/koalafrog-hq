import{createClient}from'npm:@supabase/supabase-js@2'
import{corsHeaders}from'npm:@supabase/supabase-js@^2/cors'
import{buildLiveResearchPrompt,liveResearchResponseJsonSchema,type LiveResearchRequest}from'../_shared/procurementLiveResearchContract.ts'
import{authenticatedUserClientOptions}from'../_shared/authenticatedUserClient.ts'
import{ProcurementProviderRuntimeError,invokeProcurementProvider,procurementProviderTraceLog}from'../_shared/procurementProviderRuntime.ts'
import{persistProcurementProviderDiagnostic}from'../_shared/procurementProviderDiagnostics.ts'
const jsonHeaders={...corsHeaders,'content-type':'application/json'}
const safeError=(code:string,message:string,status=400)=>new Response(JSON.stringify({error:{code,message}}),{status,headers:jsonHeaders})
function validBody(value:unknown):value is LiveResearchRequest{const v=value as LiveResearchRequest;return!!v&&v.schemaVersion===1&&typeof v.workspaceId==='string'&&typeof v.jobId==='string'&&typeof v.requestId==='string'&&Array.isArray(v.items)&&v.items.length>0&&v.items.length<=10}
async function callOpenAI(body:LiveResearchRequest,key:string,model:string,clientRequestId:string,timeoutMs:number,callerSignal:AbortSignal){
 return invokeProcurementProvider({
  timeoutMs,
  callerSignal,
  request:signal=>fetch('https://api.openai.com/v1/responses',{
   method:'POST',
   signal,
   headers:{authorization:`Bearer ${key}`,'content-type':'application/json','x-client-request-id':clientRequestId},
   body:JSON.stringify({model,background:true,store:false,tools:[{type:'web_search'}],tool_choice:'required',input:buildLiveResearchPrompt(body),text:{format:{type:'json_schema',name:'koalafrog_procurement_research_v1',strict:true,schema:liveResearchResponseJsonSchema}}}),
  }),
  validate:payload=>{
   const output=payload as{id?:unknown;status?:unknown}
   if(typeof output.id!=='string'||!/^resp_[A-Za-z0-9_-]+$/.test(output.id)||!['queued','in_progress'].includes(String(output.status)))throw new Error('PROVIDER_BACKGROUND_INVALID')
   return{id:output.id,status:String(output.status)as'queued'|'in_progress'}
  },
 })
}

Deno.serve(async request=>{
 const functionStartedAt=performance.now()
 if(request.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
 if(request.method!=='POST')return safeError('METHOD_NOT_ALLOWED','POST required.',405)
 if(Deno.env.get('PROCUREMENT_LIVE_RESEARCH_ENABLED')!=='true')return safeError('LIVE_PROVIDER_DISABLED','Live procurement research is disabled.',503)
 const auth=request.headers.get('authorization')
 if(!auth)return safeError('AUTHENTICATION_REQUIRED','Sign in required.',401)
 const supabase=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,authenticatedUserClientOptions(auth))
 const user=await supabase.auth.getUser()
 if(user.error||!user.data.user)return safeError('AUTHENTICATION_REQUIRED','Sign in required.',401)
 let body:unknown
 try{body=await request.json()}catch{return safeError('INVALID_INPUT','Invalid JSON.')}
 if(!validBody(body))return safeError('INVALID_INPUT','Invalid live research request.')
 const key=Deno.env.get('OPENAI_API_KEY'),model=Deno.env.get('OPENAI_PROCUREMENT_MODEL')??'gpt-5.6'
 const max=Number(Deno.env.get('PROCUREMENT_LIVE_DAILY_LIMIT')??5)
 if(!key)return safeError('PROVIDER_NOT_CONFIGURED','Live provider is not configured.',503)
 const serviceRoleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
 if(!serviceRoleKey)return safeError('PROVIDER_NOT_CONFIGURED','Live provider is not configured.',503)
 const diagnosticClient=createClient(
  Deno.env.get('SUPABASE_URL')!,serviceRoleKey,
  {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}},
 )
 const permission=await diagnosticClient.rpc('begin_procurement_background_submission',{
  candidate_workspace_id:body.workspaceId,candidate_job_id:body.jobId,
  candidate_owner_id:user.data.user.id,maximum_daily_invocations:max,
 })
 if(permission.error||!permission.data?.[0]){
  const message=permission.error?.message??'LIVE_JOB_UNAVAILABLE'
  const code=message.includes('LIVE_DAILY_LIMIT_REACHED')?'LIVE_DAILY_LIMIT_REACHED':message.includes('LIVE_JOB_ALREADY_INVOKED')?'LIVE_JOB_ALREADY_INVOKED':message.includes('LIVE_JOB_NOT_RUNNING')?'LIVE_JOB_NOT_RUNNING':'LIVE_JOB_UNAVAILABLE'
  const status=code==='LIVE_DAILY_LIMIT_REACHED'?429:code==='LIVE_JOB_UNAVAILABLE'?404:409
  return safeError(code,code==='LIVE_DAILY_LIMIT_REACHED'?'Live research daily limit reached.':code==='LIVE_JOB_ALREADY_INVOKED'?'This research job attempt was already invoked.':code==='LIVE_JOB_NOT_RUNNING'?'The research job is not running.':'Research job unavailable.',status)
 }
 const intent=permission.data[0]as{attempt_id:string;client_request_id:string;submission_state:string}
 if(intent.submission_state!=='intent_created'){
  return new Response(JSON.stringify({accepted:true,status:'running',reconciling:true}),{status:202,headers:jsonHeaders})
 }
 console.info(JSON.stringify({event:'procurement_invocation_consumed',providerCalled:false,functionElapsedMs:Math.max(0,Math.round(performance.now()-functionStartedAt))}))
 const persistDiagnostic=async(
  trace:import('../_shared/procurementProviderRuntime.ts').ProcurementProviderTrace|null,
  terminalErrorCode?:string|null,
 )=>{
  return persistProcurementProviderDiagnostic(diagnosticClient,{
   workspaceId:body.workspaceId,
   jobId:body.jobId,
   ownerId:user.data.user.id,
   trace,
   functionElapsedMs:performance.now()-functionStartedAt,
   terminalErrorCode,
  })
 }
 await persistDiagnostic(null)
 try{
  const started=await diagnosticClient.rpc('start_procurement_background_submission',{
   candidate_attempt_id:intent.attempt_id,
  })
  if(started.error)throw new Error('BACKGROUND_STORAGE_FAILED')
  if(!started.data){
   return new Response(JSON.stringify({accepted:true,status:'running',reconciling:true}),{status:202,headers:jsonHeaders})
  }
  const output=await callOpenAI(body,key,model,intent.client_request_id,30_000,request.signal)
  let attached=false
  for(let attempt=0;attempt<3&&!attached;attempt++){
   const attachment=await diagnosticClient.rpc('attach_procurement_background_operation',{
    candidate_attempt_id:intent.attempt_id,candidate_owner_id:user.data.user.id,
    candidate_provider_operation_id:output.value.id,candidate_provider_status:output.value.status,
   })
   attached=!attachment.error
  }
  if(!attached)throw new Error('BACKGROUND_ATTACHMENT_PENDING')
  console.info(procurementProviderTraceLog(output.trace,'completed',performance.now()-functionStartedAt))
  await persistDiagnostic(output.trace)
  await diagnosticClient.rpc('acknowledge_procurement_background_submission',{
   candidate_attempt_id:intent.attempt_id,
  })
  return new Response(JSON.stringify({accepted:true,status:'running'}),{status:202,headers:jsonHeaders})
 }catch(error){
  const runtime=error instanceof ProcurementProviderRuntimeError?error:undefined
  if(runtime)console.error(procurementProviderTraceLog(runtime.trace,'failed',performance.now()-functionStartedAt))
  else console.error(JSON.stringify({event:'procurement_provider_terminal',terminalOutcome:'failed',terminalErrorCode:'PROVIDER_FAILURE',providerCalled:true,functionElapsedMs:Math.max(0,Math.round(performance.now()-functionStartedAt))}))
  const definitive=runtime?.code==='PROVIDER_HTTP_ERROR'&&
   runtime.response!=null&&![408,409,429].includes(runtime.response.status)&&runtime.response.status<500
  if(definitive){
   const workerId=crypto.randomUUID()
   const claim=await diagnosticClient.rpc('claim_procurement_background_operation',{
    candidate_attempt_id:intent.attempt_id,candidate_worker_id:workerId,
    candidate_stage:'submission_rejected',lease_seconds:30,
   })
   if(!claim.error&&claim.data)await diagnosticClient.rpc('finalize_procurement_background_operation',{
    candidate_attempt_id:intent.attempt_id,candidate_worker_id:workerId,
    candidate_event_id:null,candidate_provider_status:'failed',candidate_candidates:[],
    candidate_partial:false,candidate_error_code:'PROVIDER_SUBMISSION_REJECTED',
    candidate_error_details:'Live provider rejected the background submission.',
    candidate_terminal_source:'submission',
   })
  }else{
   await diagnosticClient.rpc('mark_procurement_background_submission_ambiguous',{
    candidate_attempt_id:intent.attempt_id,
    safe_failure_code:error instanceof Error&&error.message==='BACKGROUND_ATTACHMENT_PENDING'
     ?'BACKGROUND_ATTACHMENT_PENDING':'BACKGROUND_SUBMISSION_AMBIGUOUS',
   })
  }
  await persistDiagnostic(runtime?.trace??null,runtime?.code??'PROVIDER_FAILURE')
  const code=runtime?.code==='PROVIDER_TIMEOUT'?'PROVIDER_TIMEOUT':runtime?.code==='PROVIDER_CALLER_ABORTED'?'PROVIDER_CANCELLED':runtime?.code==='PROVIDER_HTTP_ERROR'&&runtime.response?.status===429?'PROVIDER_RATE_LIMIT':runtime?.code==='PROVIDER_PARSE_ERROR'||runtime?.code==='PROVIDER_INVALID_RESPONSE'?'PROVIDER_INVALID_RESPONSE':'PROVIDER_FAILURE'
  const status=code==='PROVIDER_RATE_LIMIT'?429:code==='PROVIDER_CANCELLED'?499:502
  return safeError(code,code==='PROVIDER_CANCELLED'?'Live research request was cancelled.':'Live research provider could not complete this job.',status)
 }
})
