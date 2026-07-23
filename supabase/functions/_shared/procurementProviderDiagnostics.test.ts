import{describe,expect,it,vi}from'vitest'
import{
 persistProcurementProviderDiagnostic,
 procurementDiagnosticArgs,
}from'./procurementProviderDiagnostics'
import type{ProcurementProviderTrace}from'./procurementProviderRuntime'

const trace=(values:Partial<ProcurementProviderTrace>={}):ProcurementProviderTrace=>({
 stage:'provider_completed',
 timeoutLimitMs:75_000,
 timeoutStage:null,
 abortSource:null,
 providerCalled:true,
 providerElapsedMs:1200,
 providerHeadersElapsedMs:300,
 providerBodyElapsedMs:800,
 providerParseElapsedMs:900,
 candidateValidationElapsedMs:1100,
 httpStatus:200,
 usagePresent:true,
 candidateCount:2,
 terminalErrorCode:null,
 ...values,
})
const input=(values:Partial<Parameters<typeof procurementDiagnosticArgs>[0]>={})=>({
 workspaceId:'workspace-1',
 jobId:'job-1',
 ownerId:'owner-1',
 trace:trace(),
 functionElapsedMs:1400,
 ...values,
})

describe('Procurement provider diagnostic persistence',()=>{
 it('maps successful completion to the allowlisted RPC contract',()=>{
  expect(procurementDiagnosticArgs(input())).toMatchObject({
   diagnostic_provider_called:true,
   diagnostic_provider_stage:'provider_completed',
   diagnostic_headers_elapsed_ms:300,
   diagnostic_body_elapsed_ms:800,
   diagnostic_parse_elapsed_ms:900,
   diagnostic_validation_elapsed_ms:1100,
   diagnostic_provider_elapsed_ms:1200,
   diagnostic_function_elapsed_ms:1400,
   diagnostic_timeout_limit_ms:75000,
   diagnostic_abort_source:'none',
   diagnostic_provider_http_status:200,
   diagnostic_usage_present:true,
   diagnostic_candidate_count:2,
   diagnostic_terminal_error_code:null,
  })
 })

 it.each([
  ['response_headers','response_headers'],
  ['response_body','response_body'],
  ['parse','parsing'],
  ['validation','validation'],
  ['completion','completion'],
]as const)('normalizes the %s timeout stage',(inputStage,expected)=>{
  const args=procurementDiagnosticArgs(input({trace:trace({
   stage:'provider_timeout_triggered',
   timeoutStage:inputStage,
   abortSource:'application_deadline',
   terminalErrorCode:'PROVIDER_TIMEOUT',
  })}))
  expect(args).toMatchObject({
   diagnostic_timeout_stage:expected,
   diagnostic_abort_source:'application_deadline',
   diagnostic_terminal_error_code:'PROVIDER_TIMEOUT',
  })
 })

 it('preserves caller abort and safe HTTP failure fields only',()=>{
  expect(procurementDiagnosticArgs(input({trace:trace({
   stage:'provider_cancelled',
   abortSource:'caller',
   terminalErrorCode:'PROVIDER_CALLER_ABORTED',
  })}))).toMatchObject({
   diagnostic_abort_source:'caller',
   diagnostic_terminal_error_code:'PROVIDER_CALLER_ABORTED',
  })
  const args=procurementDiagnosticArgs(input({trace:trace({
   stage:'provider_http_error',
   httpStatus:503,
   terminalErrorCode:'PROVIDER_HTTP_ERROR',
  })}))
  expect(args.diagnostic_provider_http_status).toBe(503)
  expect(JSON.stringify(args)).not.toMatch(/raw.?response|response.?content|prompt|authorization|bearer|token|secret|provider.?request.?id/i)
 })

 it('does not replace the provider outcome when persistence fails',async()=>{
  const error=vi.spyOn(console,'error').mockImplementation(()=>undefined)
  const rpc=vi.fn().mockResolvedValue({data:null,error:{message:'database unavailable'}})
  await expect(persistProcurementProviderDiagnostic({rpc},input())).resolves.toBe(false)
  expect(error).toHaveBeenCalledWith(expect.stringContaining('procurement_diagnostic_persistence_failed'))
  expect(JSON.stringify(error.mock.calls)).not.toContain('database unavailable')
 })
})
