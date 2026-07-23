import{createClient}from'npm:@supabase/supabase-js@2'
import{corsHeaders}from'npm:@supabase/supabase-js@^2/cors'
import{buildLiveResearchPrompt,LIVE_RESEARCH_SCHEMA_VERSION,validateLiveResearchResponse,type LiveResearchRequest}from'../_shared/procurementLiveResearchContract.ts'
import{authenticatedUserClientOptions}from'../_shared/authenticatedUserClient.ts'
import{ProcurementProviderRuntimeError,invokeProcurementProvider,parseProcurementProviderTimeout,procurementProviderTraceLog}from'../_shared/procurementProviderRuntime.ts'
import{persistProcurementProviderDiagnostic}from'../_shared/procurementProviderDiagnostics.ts'
const jsonHeaders={...corsHeaders,'content-type':'application/json'}
const safeError=(code:string,message:string,status=400)=>new Response(JSON.stringify({error:{code,message}}),{status,headers:jsonHeaders})
const responseSchema={type:'object',additionalProperties:false,required:['schemaVersion','partial','candidates','providerNotes'],properties:{schemaVersion:{type:'integer',const:LIVE_RESEARCH_SCHEMA_VERSION},partial:{type:'boolean'},providerNotes:{type:'string'},candidates:{type:'array',maxItems:20,items:{type:'object',additionalProperties:false,required:['requestedItemId','supplierName','supplierType','productTitle','sourceUrl','packageQuantity','packageUnit','itemPrice','currency','moq','shippingCost','deliveryEstimateDays','stockStatus','coaAvailability','sdsAvailability','technicalDocumentAvailability','firstOrderDiscount','sourceDate','evidence','sourceNotes','confidence'],properties:{requestedItemId:{type:'string'},supplierName:{type:'string'},supplierType:{type:'string',enum:['manufacturer','distributor','specialist_cosmetic_supplier','marketplace','unknown']},productTitle:{type:'string'},sourceUrl:{type:'string'},packageQuantity:{type:['number','null']},packageUnit:{type:['string','null']},itemPrice:{type:['number','null']},currency:{type:['string','null']},moq:{type:['number','null']},shippingCost:{type:['number','null']},deliveryEstimateDays:{type:['integer','null']},stockStatus:{type:'string',enum:['unknown','in_stock','limited','backorder','out_of_stock']},coaAvailability:{type:'string',enum:['unknown','available','unavailable','partial']},sdsAvailability:{type:'string',enum:['unknown','available','unavailable','partial']},technicalDocumentAvailability:{type:'string',enum:['unknown','available','unavailable','partial']},firstOrderDiscount:{type:['number','null']},sourceDate:{type:'string'},sourceNotes:{type:'string'},confidence:{type:'string',enum:['low','medium','high','unknown']},evidence:{type:'array',items:{type:'object',additionalProperties:false,required:['field','state','sourceUrl','snippet'],properties:{field:{type:'string'},state:{type:'string',enum:['unknown','inferred','reported','verified']},sourceUrl:{type:['string','null']},snippet:{type:['string','null']}}}}}}}}}
function validBody(value:unknown):value is LiveResearchRequest{const v=value as LiveResearchRequest;return!!v&&v.schemaVersion===1&&typeof v.workspaceId==='string'&&typeof v.jobId==='string'&&typeof v.requestId==='string'&&Array.isArray(v.items)&&v.items.length>0&&v.items.length<=10}
async function callOpenAI(body:LiveResearchRequest,key:string,model:string,timeoutMs:number,callerSignal:AbortSignal){
 return invokeProcurementProvider({
  timeoutMs,
  callerSignal,
  request:signal=>fetch('https://api.openai.com/v1/responses',{
   method:'POST',
   signal,
   headers:{authorization:`Bearer ${key}`,'content-type':'application/json'},
   body:JSON.stringify({model,store:false,tools:[{type:'web_search'}],tool_choice:'required',input:buildLiveResearchPrompt(body),text:{format:{type:'json_schema',name:'koalafrog_procurement_research_v1',strict:true,schema:responseSchema}}}),
  }),
  validate:payload=>{
   const output=payload as{output?:Array<{content?:Array<{type:string;text?:string}>}>}
   const text=output.output?.flatMap(item=>item.content??[]).find(content=>content.type==='output_text')?.text
   if(!text)throw new Error('PROVIDER_EMPTY_OUTPUT')
   return validateLiveResearchResponse(JSON.parse(text),body.items.map(item=>item.id))
  },
  candidateCount:result=>result.candidates.length,
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
 const permission=await supabase.rpc('begin_procurement_live_invocation',{candidate_workspace_id:body.workspaceId,candidate_job_id:body.jobId,maximum_daily_invocations:max})
 if(permission.error){
  const message=permission.error.message
  const code=message.includes('LIVE_DAILY_LIMIT_REACHED')?'LIVE_DAILY_LIMIT_REACHED':message.includes('LIVE_JOB_ALREADY_INVOKED')?'LIVE_JOB_ALREADY_INVOKED':message.includes('LIVE_JOB_NOT_RUNNING')?'LIVE_JOB_NOT_RUNNING':'LIVE_JOB_UNAVAILABLE'
  const status=code==='LIVE_DAILY_LIMIT_REACHED'?429:code==='LIVE_JOB_UNAVAILABLE'?404:409
  return safeError(code,code==='LIVE_DAILY_LIMIT_REACHED'?'Live research daily limit reached.':code==='LIVE_JOB_ALREADY_INVOKED'?'This research job attempt was already invoked.':code==='LIVE_JOB_NOT_RUNNING'?'The research job is not running.':'Research job unavailable.',status)
 }
 console.info(JSON.stringify({event:'procurement_invocation_consumed',providerCalled:false,functionElapsedMs:Math.max(0,Math.round(performance.now()-functionStartedAt))}))
 const serviceRoleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
 const diagnosticClient=serviceRoleKey?createClient(
  Deno.env.get('SUPABASE_URL')!,
  serviceRoleKey,
  {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}},
 ):null
 const persistDiagnostic=async(
  trace:import('../_shared/procurementProviderRuntime.ts').ProcurementProviderTrace|null,
  terminalErrorCode?:string|null,
 )=>{
  if(!diagnosticClient){
   console.error(JSON.stringify({event:'procurement_diagnostic_persistence_failed',failure:'service_unavailable'}))
   return false
  }
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
  const output=await callOpenAI(body,key,model,parseProcurementProviderTimeout(Deno.env.get('PROCUREMENT_LIVE_TIMEOUT_MS')),request.signal)
  console.info(procurementProviderTraceLog(output.trace,'completed',performance.now()-functionStartedAt))
  await persistDiagnostic(output.trace)
  return new Response(JSON.stringify(output.value),{headers:jsonHeaders})
 }catch(error){
  const runtime=error instanceof ProcurementProviderRuntimeError?error:undefined
  if(runtime)console.error(procurementProviderTraceLog(runtime.trace,'failed',performance.now()-functionStartedAt))
  else console.error(JSON.stringify({event:'procurement_provider_terminal',terminalOutcome:'failed',terminalErrorCode:'PROVIDER_FAILURE',providerCalled:true,functionElapsedMs:Math.max(0,Math.round(performance.now()-functionStartedAt))}))
  await persistDiagnostic(runtime?.trace??null,runtime?.code??'PROVIDER_FAILURE')
  const code=runtime?.code==='PROVIDER_TIMEOUT'?'PROVIDER_TIMEOUT':runtime?.code==='PROVIDER_CALLER_ABORTED'?'PROVIDER_CANCELLED':runtime?.code==='PROVIDER_HTTP_ERROR'&&runtime.response?.status===429?'PROVIDER_RATE_LIMIT':runtime?.code==='PROVIDER_PARSE_ERROR'||runtime?.code==='PROVIDER_INVALID_RESPONSE'?'PROVIDER_INVALID_RESPONSE':'PROVIDER_FAILURE'
  const status=code==='PROVIDER_RATE_LIMIT'?429:code==='PROVIDER_CANCELLED'?499:502
  return safeError(code,code==='PROVIDER_CANCELLED'?'Live research request was cancelled.':'Live research provider could not complete this job.',status)
 }
})
