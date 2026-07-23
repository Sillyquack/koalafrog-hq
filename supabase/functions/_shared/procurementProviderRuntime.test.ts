import{afterEach,beforeEach,describe,expect,it,vi}from'vitest'
import{
 PROCUREMENT_PROVIDER_TIMEOUT_DEFAULT_MS,
 PROCUREMENT_PROVIDER_TIMEOUT_MAX_MS,
 PROCUREMENT_PROVIDER_TIMEOUT_MIN_MS,
 ProcurementProviderRuntimeError,
 invokeProcurementProvider,
 parseProcurementProviderTimeout,
 procurementProviderTraceLog,
}from'./procurementProviderRuntime'

const valid={schemaVersion:1,candidates:[{id:'candidate'}],usage:{input_tokens:1}}
const validate=(value:unknown)=>value as typeof valid
const count=(value:typeof valid)=>value.candidates.length
const response=()=>new Response(JSON.stringify(valid),{status:200,headers:{'content-type':'application/json'}})
const deferred=<T>()=>{let resolve!:(value:T)=>void,reject!:(reason?:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no});return{promise,resolve,reject}}

describe('Procurement provider timeout runtime',()=>{
 beforeEach(()=>vi.useFakeTimers())
 afterEach(()=>vi.useRealTimers())

 it('accepts one successful provider response before the deadline and records safe trace fields',async()=>{
  const request=vi.fn(async()=>response())
  const result=await invokeProcurementProvider({request,validate,candidateCount:count,timeoutMs:75_000})
  expect(request).toHaveBeenCalledOnce()
  expect(result.trace).toMatchObject({stage:'provider_completed',providerCalled:true,httpStatus:200,usagePresent:true,candidateCount:1,terminalErrorCode:null})
 })

 it('times out when headers do not arrive and rejects an abort-insensitive late success',async()=>{
  const pending=deferred<Response>(),request=vi.fn(()=>pending.promise),validator=vi.fn(validate)
  const invocation=invokeProcurementProvider({request,validate:validator,timeoutMs:75_000})
  const rejected=expect(invocation).rejects.toMatchObject({code:'PROVIDER_TIMEOUT',trace:{timeoutStage:'response_headers',abortSource:'application_deadline'}})
  await vi.advanceTimersByTimeAsync(75_000)
  await rejected
  pending.resolve(response())
  await vi.runAllTimersAsync()
  expect(request).toHaveBeenCalledOnce()
  expect(validator).not.toHaveBeenCalled()
 })

 it('times out when headers arrive but the body completes after the deadline',async()=>{
  const stream=new ReadableStream({start(controller){setTimeout(()=>{controller.enqueue(new TextEncoder().encode(JSON.stringify(valid)));controller.close()},75_001)}})
  const invocation=invokeProcurementProvider({request:async()=>new Response(stream,{status:200}),validate,timeoutMs:75_000})
  const rejected=expect(invocation).rejects.toMatchObject({code:'PROVIDER_TIMEOUT',trace:{timeoutStage:'response_body',abortSource:'application_deadline'}})
  await vi.advanceTimersByTimeAsync(75_000)
  await rejected
 })

 it('rejects parsing and validation that finish after the deadline',async()=>{
  let now=0
  const parseLate=invokeProcurementProvider({request:async()=>response(),validate,timeoutMs:75_000,now:()=>now,parse:body=>{now=75_001;return JSON.parse(body)}})
  await expect(parseLate).rejects.toMatchObject({code:'PROVIDER_TIMEOUT',trace:{timeoutStage:'parse'}})
  now=0
  const validateLate=invokeProcurementProvider({request:async()=>response(),validate:value=>{now=75_001;return validate(value)},timeoutMs:75_000,now:()=>now})
  await expect(validateLate).rejects.toMatchObject({code:'PROVIDER_TIMEOUT',trace:{timeoutStage:'validation'}})
 })

 it('rejects final completion after the deadline',async()=>{
  let now=0
  const late=invokeProcurementProvider({
   request:async()=>response(),
   validate,
   timeoutMs:75_000,
   now:()=>now,
   candidateCount:value=>{now=75_001;return count(value)},
  })
  await expect(late).rejects.toMatchObject({
   code:'PROVIDER_TIMEOUT',
   trace:{timeoutStage:'completion',abortSource:'application_deadline'},
  })
 })

 it('keeps the first abort source immutable',async()=>{
  const caller=new AbortController(),pending=deferred<Response>()
  const deadlineFirst=invokeProcurementProvider({request:()=>pending.promise,validate,timeoutMs:75_000,callerSignal:caller.signal})
  const deadlineRejected=expect(deadlineFirst).rejects.toMatchObject({code:'PROVIDER_TIMEOUT',trace:{abortSource:'application_deadline'}})
  await vi.advanceTimersByTimeAsync(75_000)
  caller.abort()
  await deadlineRejected

  const callerFirstController=new AbortController(),secondPending=deferred<Response>()
  const callerFirst=invokeProcurementProvider({request:()=>secondPending.promise,validate,timeoutMs:75_000,callerSignal:callerFirstController.signal})
  const callerRejected=expect(callerFirst).rejects.toMatchObject({code:'PROVIDER_CALLER_ABORTED',trace:{abortSource:'caller'}})
  callerFirstController.abort()
  await vi.advanceTimersByTimeAsync(75_000)
  await callerRejected
 })

 it('makes no retry and performs no validation after an HTTP failure',async()=>{
  const request=vi.fn(async()=>new Response('temporary',{status:503})),validator=vi.fn(validate)
  await expect(invokeProcurementProvider({request,validate:validator,timeoutMs:75_000})).rejects.toMatchObject({code:'PROVIDER_HTTP_ERROR'})
  expect(request).toHaveBeenCalledOnce()
  expect(validator).not.toHaveBeenCalled()
 })

 it('uses the bounded default for missing or invalid configuration',()=>{
  expect(parseProcurementProviderTimeout(undefined)).toBe(PROCUREMENT_PROVIDER_TIMEOUT_DEFAULT_MS)
  expect(parseProcurementProviderTimeout('bad')).toBe(PROCUREMENT_PROVIDER_TIMEOUT_DEFAULT_MS)
  expect(parseProcurementProviderTimeout(String(PROCUREMENT_PROVIDER_TIMEOUT_MIN_MS-1))).toBe(PROCUREMENT_PROVIDER_TIMEOUT_DEFAULT_MS)
  expect(parseProcurementProviderTimeout(String(PROCUREMENT_PROVIDER_TIMEOUT_MAX_MS+1))).toBe(PROCUREMENT_PROVIDER_TIMEOUT_DEFAULT_MS)
  expect(parseProcurementProviderTimeout(String(PROCUREMENT_PROVIDER_TIMEOUT_MIN_MS))).toBe(PROCUREMENT_PROVIDER_TIMEOUT_MIN_MS)
  expect(parseProcurementProviderTimeout('90000')).toBe(90_000)
  expect(parseProcurementProviderTimeout(String(PROCUREMENT_PROVIDER_TIMEOUT_MAX_MS))).toBe(PROCUREMENT_PROVIDER_TIMEOUT_MAX_MS)
 })

 it('reports usage only when supplied and logs only allowlisted diagnostics',async()=>{
  const withoutUsage=await invokeProcurementProvider({request:async()=>new Response(JSON.stringify({schemaVersion:1,candidates:[]})),validate:value=>value as{candidates:unknown[]},timeoutMs:75_000})
  expect(withoutUsage.trace.usagePresent).toBe(false)
  const log=procurementProviderTraceLog(withoutUsage.trace,'completed',84)
  expect(JSON.parse(log)).toMatchObject({event:'procurement_provider_terminal',terminalOutcome:'completed',functionElapsedMs:84})
  expect(log).not.toMatch(/authorization|bearer|prompt|raw|response body|request.?id|token|secret|supplier/i)
 })

 it('returns sanitized errors without provider data',async()=>{
  const secret='raw-provider-secret'
  let caught:unknown
  try{await invokeProcurementProvider({request:async()=>{throw new Error(secret)},validate,timeoutMs:75_000})}catch(error){caught=error}
  expect(caught).toBeInstanceOf(ProcurementProviderRuntimeError)
  expect(JSON.stringify(caught)).not.toContain(secret)
 })
})
