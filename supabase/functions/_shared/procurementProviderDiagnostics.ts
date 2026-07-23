import type{ProcurementProviderTrace}from'./procurementProviderRuntime.ts'

export interface ProcurementDiagnosticRpcClient{
 rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:{message:string}|null}>
}

const timeoutStage=(stage:ProcurementProviderTrace['timeoutStage'])=>
 stage==='parse'?'parsing':stage??null

export function procurementDiagnosticArgs(input:{
 workspaceId:string
 jobId:string
 ownerId:string
 trace:ProcurementProviderTrace|null
 functionElapsedMs:number
 terminalErrorCode?:string|null
}){
 const trace=input.trace
 return{
  candidate_workspace_id:input.workspaceId,
  candidate_job_id:input.jobId,
  candidate_owner_id:input.ownerId,
  diagnostic_provider_called:trace?.providerCalled??false,
  diagnostic_provider_stage:trace?.stage??null,
  diagnostic_headers_elapsed_ms:trace?.providerHeadersElapsedMs??null,
  diagnostic_body_elapsed_ms:trace?.providerBodyElapsedMs??null,
  diagnostic_parse_elapsed_ms:trace?.providerParseElapsedMs??null,
  diagnostic_validation_elapsed_ms:trace?.candidateValidationElapsedMs??null,
  diagnostic_provider_elapsed_ms:trace?.providerElapsedMs??null,
  diagnostic_function_elapsed_ms:Math.max(0,Math.round(input.functionElapsedMs)),
  diagnostic_timeout_limit_ms:trace?.timeoutLimitMs??null,
  diagnostic_timeout_stage:timeoutStage(trace?.timeoutStage??null),
  diagnostic_abort_source:trace?.abortSource??'none',
  diagnostic_provider_http_status:trace?.httpStatus??null,
  diagnostic_usage_present:trace?.usagePresent??null,
  diagnostic_candidate_count:trace?.candidateCount??null,
  diagnostic_terminal_error_code:input.terminalErrorCode??trace?.terminalErrorCode??null,
 }
}

export async function persistProcurementProviderDiagnostic(
 client:ProcurementDiagnosticRpcClient,
 input:Parameters<typeof procurementDiagnosticArgs>[0],
){
 try{
  const result=await client.rpc(
   'persist_procurement_provider_diagnostic',
   procurementDiagnosticArgs(input),
  )
  if(result.error||result.data!==true){
   console.error(JSON.stringify({
    event:'procurement_diagnostic_persistence_failed',
    failure:'rpc_rejected',
   }))
   return false
  }
  return true
 }catch{
  console.error(JSON.stringify({
   event:'procurement_diagnostic_persistence_failed',
   failure:'rpc_unavailable',
  }))
  return false
 }
}
