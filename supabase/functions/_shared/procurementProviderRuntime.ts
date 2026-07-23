export const PROCUREMENT_PROVIDER_TIMEOUT_DEFAULT_MS = 75_000
export const PROCUREMENT_PROVIDER_TIMEOUT_MIN_MS = 30_000
export const PROCUREMENT_PROVIDER_TIMEOUT_MAX_MS = 120_000

export type ProcurementAbortSource = 'application_deadline'|'caller'
export type ProcurementTimeoutStage = 'response_headers'|'response_body'|'parse'|'validation'|'completion'
export type ProcurementProviderStage =
 |'provider_request_started'
 |'provider_response_headers_received'
 |'provider_response_body_completed'
 |'provider_response_parsed'
 |'candidate_validation_completed'
 |'provider_completed'
 |'provider_timeout_triggered'
 |'provider_cancelled'
 |'provider_transport_failed'
 |'provider_http_error'
 |'provider_response_invalid'

export type ProcurementProviderErrorCode =
 |'PROVIDER_TIMEOUT'
 |'PROVIDER_CALLER_ABORTED'
 |'PROVIDER_NETWORK_ERROR'
 |'PROVIDER_HTTP_ERROR'
 |'PROVIDER_PARSE_ERROR'
 |'PROVIDER_INVALID_RESPONSE'

export interface ProcurementProviderTrace{
 stage:ProcurementProviderStage
 timeoutLimitMs:number
 timeoutStage:ProcurementTimeoutStage|null
 abortSource:ProcurementAbortSource|null
 providerCalled:boolean
 providerElapsedMs:number
 providerHeadersElapsedMs:number|null
 providerBodyElapsedMs:number|null
 providerParseElapsedMs:number|null
 candidateValidationElapsedMs:number|null
 httpStatus:number|null
 usagePresent:boolean
 candidateCount:number|null
 terminalErrorCode:ProcurementProviderErrorCode|null
}

export class ProcurementProviderRuntimeError extends Error{
 constructor(
  public readonly code:ProcurementProviderErrorCode,
  public readonly trace:ProcurementProviderTrace,
  public readonly response?:Response,
 ){super(code);this.name='ProcurementProviderRuntimeError'}
}

const usagePresent=(value:unknown)=>Boolean(
 value&&typeof value==='object'&&!Array.isArray(value)&&
 'usage'in value&&value.usage&&typeof value.usage==='object'&&!Array.isArray(value.usage)
)

export function parseProcurementProviderTimeout(raw:string|undefined|null){
 if(raw==null||raw.trim()==='')return PROCUREMENT_PROVIDER_TIMEOUT_DEFAULT_MS
 const value=Number(raw.trim())
 return /^\d+$/.test(raw.trim())&&Number.isSafeInteger(value)&&
  value>=PROCUREMENT_PROVIDER_TIMEOUT_MIN_MS&&value<=PROCUREMENT_PROVIDER_TIMEOUT_MAX_MS
  ?value:PROCUREMENT_PROVIDER_TIMEOUT_DEFAULT_MS
}

export async function invokeProcurementProvider<T>(options:{
 request:(signal:AbortSignal)=>Promise<Response>
 validate:(value:unknown)=>T
 timeoutMs:number
 callerSignal?:AbortSignal
 parse?:(body:string)=>unknown
 candidateCount?:(value:T)=>number
 now?:()=>number
}):Promise<{value:T;trace:ProcurementProviderTrace}>{
 const now=options.now??(()=>performance.now()),startedAt=now(),controller=new AbortController()
 let releaseAbort:()=>void=()=>undefined
 const abortBoundary=new Promise<void>(resolve=>{releaseAbort=resolve})
 const trace:ProcurementProviderTrace={
  stage:'provider_request_started',timeoutLimitMs:options.timeoutMs,timeoutStage:null,abortSource:null,
  providerCalled:false,providerElapsedMs:0,providerHeadersElapsedMs:null,providerBodyElapsedMs:null,
  providerParseElapsedMs:null,candidateValidationElapsedMs:null,httpStatus:null,usagePresent:false,
  candidateCount:null,terminalErrorCode:null,
 }
 const elapsed=()=>Math.max(0,Math.round(now()-startedAt))
 const fail=(code:ProcurementProviderErrorCode,stage:ProcurementProviderStage,response?:Response):never=>{
  trace.stage=stage;trace.providerElapsedMs=elapsed();trace.terminalErrorCode=code
  throw new ProcurementProviderRuntimeError(code,{...trace},response)
 }
 const abort=(source:ProcurementAbortSource)=>{
  if(trace.abortSource)return
  trace.abortSource=source
  controller.abort(source)
  releaseAbort()
 }
 const timeoutCode=(stage:ProcurementTimeoutStage)=>{
  trace.timeoutStage=stage
  return fail('PROVIDER_TIMEOUT','provider_timeout_triggered')
 }
 const rejectAborted=(stage:ProcurementTimeoutStage):never=>{
  if(trace.abortSource==='caller')return fail('PROVIDER_CALLER_ABORTED','provider_cancelled')
  return timeoutCode(stage)
 }
 const enforce=(stage:ProcurementTimeoutStage)=>{
  if(!trace.abortSource&&now()-startedAt>=options.timeoutMs)abort('application_deadline')
  if(trace.abortSource)return rejectAborted(stage)
 }
 const awaitBoundary=async<V>(promise:Promise<V>,stage:ProcurementTimeoutStage)=>{
  const result=await Promise.race([
   promise.then(value=>({kind:'value' as const,value})),
   abortBoundary.then(()=>({kind:'abort' as const})),
  ])
  if(result.kind==='abort')return rejectAborted(stage)
  return result.value
 }
 const timer=setTimeout(()=>abort('application_deadline'),options.timeoutMs)
 const callerAbort=()=>abort('caller')
 options.callerSignal?.addEventListener('abort',callerAbort,{once:true})
 try{
  if(options.callerSignal?.aborted){abort('caller');return fail('PROVIDER_CALLER_ABORTED','provider_cancelled')}
  trace.providerCalled=true
  let response:Response
  try{response=await awaitBoundary(options.request(controller.signal),'response_headers')}
  catch{
   if(trace.abortSource==='caller')return fail('PROVIDER_CALLER_ABORTED','provider_cancelled')
   if(trace.abortSource==='application_deadline')return timeoutCode('response_headers')
   return fail('PROVIDER_NETWORK_ERROR','provider_transport_failed')
  }
  enforce('response_headers')
  trace.httpStatus=response.status
  trace.providerHeadersElapsedMs=elapsed()
  trace.stage='provider_response_headers_received'
  if(!response.ok)return fail('PROVIDER_HTTP_ERROR','provider_http_error',response)
  let body:string
  try{body=await awaitBoundary(response.text(),'response_body')}
  catch{
   if(trace.abortSource==='caller')return fail('PROVIDER_CALLER_ABORTED','provider_cancelled')
   if(trace.abortSource==='application_deadline')return timeoutCode('response_body')
   return fail('PROVIDER_NETWORK_ERROR','provider_transport_failed')
  }
  enforce('response_body')
  trace.providerBodyElapsedMs=elapsed()
  trace.stage='provider_response_body_completed'
  let parsed:unknown
  try{parsed=(options.parse??JSON.parse)(body)}
  catch{enforce('parse');return fail('PROVIDER_PARSE_ERROR','provider_response_invalid')}
  enforce('parse')
  trace.providerParseElapsedMs=elapsed()
  trace.usagePresent=usagePresent(parsed)
  trace.stage='provider_response_parsed'
  let value:T
  try{value=options.validate(parsed)}
  catch{enforce('validation');return fail('PROVIDER_INVALID_RESPONSE','provider_response_invalid')}
  enforce('validation')
  trace.candidateValidationElapsedMs=elapsed()
  trace.candidateCount=options.candidateCount?.(value)??null
  trace.stage='candidate_validation_completed'
  enforce('completion')
  trace.stage='provider_completed'
  trace.providerElapsedMs=elapsed()
  return{value,trace:{...trace}}
 }finally{
  clearTimeout(timer)
  options.callerSignal?.removeEventListener('abort',callerAbort)
 }
}

export function procurementProviderTraceLog(
 trace:ProcurementProviderTrace,
 terminalOutcome:'completed'|'failed',
 functionElapsedMs:number,
){
 return JSON.stringify({
  event:'procurement_provider_terminal',
  stage:trace.stage,
  terminalOutcome,
  terminalErrorCode:trace.terminalErrorCode,
  providerCalled:trace.providerCalled,
  providerElapsedMs:trace.providerElapsedMs,
  functionElapsedMs:Math.max(0,Math.round(functionElapsedMs)),
  timeoutLimitMs:trace.timeoutLimitMs,
  timeoutStage:trace.timeoutStage,
  abortSource:trace.abortSource,
  providerHeadersElapsedMs:trace.providerHeadersElapsedMs,
  providerBodyElapsedMs:trace.providerBodyElapsedMs,
  providerParseElapsedMs:trace.providerParseElapsedMs,
  candidateValidationElapsedMs:trace.candidateValidationElapsedMs,
  httpStatus:trace.httpStatus,
  usagePresent:trace.usagePresent,
  candidateCount:trace.candidateCount,
 })
}
