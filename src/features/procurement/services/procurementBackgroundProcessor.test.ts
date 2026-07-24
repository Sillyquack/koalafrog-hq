import{describe,expect,it,vi}from'vitest'
import{processProcurementBackgroundOperation}from'../../../../supabase/functions/_shared/procurementBackgroundProcessor'
import fixture from'../domain/fixtures/liveResearchResponse.v1.json'

const operation={
 attempt_id:'11111111-1111-4111-8111-111111111111',job_id:'job-1',
 workspace_id:'workspace-1',provider_operation_id:'resp_test',
 submission_state:'provider_in_progress',intent_created_at:new Date().toISOString(),
 reconciliation_attempt_count:0,transient_failure_count:0,
}

function database(){
 const calls:Array<{name:string;args:Record<string,unknown>}>=[]
 return{
  calls,
  rpc:vi.fn(async(name:string,args:Record<string,unknown>)=>{
   calls.push({name,args})
   if(name==='claim_procurement_background_operation')return{data:true,error:null}
   if(name==='reschedule_procurement_background_operation')return{data:true,error:null}
   if(name==='mark_procurement_background_webhook_retry')return{data:true,error:null}
   if(name==='finalize_procurement_background_operation')return{data:'finalized',error:null}
   return{data:null,error:null}
  }),
  from:vi.fn(),
 }
}

function completedDatabase(){
 const db=database()
 db.from=vi.fn((table:string)=>{
  if(table==='procurement_research_jobs'){
   const query={
    select:vi.fn(()=>query),eq:vi.fn(()=>query),
    single:vi.fn(async()=>({data:{procurement_request_id:'request-1'},error:null})),
   }
   return query
  }
  const query={
   select:vi.fn(()=>query),eq:vi.fn(()=>query),
   then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({
    data:[{id:'item-1',required_specifications:['COA']}],error:null,
   }).then(resolve),
  }
  return query
 })
 return db
}

describe('background terminal processor',()=>{
 it('reschedules 429 without terminalizing or submitting again',async()=>{
  const db=database()
  const result=await processProcurementBackgroundOperation({
   database:db,providerKey:'secret',operation,eventId:'evt_test',
   eventType:'response.completed',source:'webhook',
   fetcher:vi.fn(async()=>new Response('',{status:429})),
  })
  expect(result).toEqual({kind:'rescheduled',code:'BACKGROUND_RETRIEVAL_TRANSIENT'})
  expect(db.calls.some(call=>call.name==='finalize_procurement_background_operation')).toBe(false)
  expect(db.calls.map(call=>call.name)).not.toContain('begin_procurement_background_submission')
 })

 it('reschedules network failure and preserves the durable event',async()=>{
  const db=database(),fetcher=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>{
   expect(init?.signal).toBeInstanceOf(AbortSignal)
   throw new DOMException('timed out','TimeoutError')
  })
  const result=await processProcurementBackgroundOperation({
   database:db,providerKey:'secret',operation,eventId:'evt_test',
   eventType:'response.completed',source:'webhook',
   fetcher,
  })
  expect(result.kind).toBe('rescheduled')
  expect(fetcher).toHaveBeenCalledOnce()
  expect(db.calls.some(call=>call.name==='mark_procurement_background_webhook_retry')).toBe(true)
 })

 it('terminalizes an authenticated provider failure without retrieval',async()=>{
  const db=database(),fetcher=vi.fn()
  const result=await processProcurementBackgroundOperation({
   database:db,providerKey:'secret',operation,eventId:'evt_failed',
   eventType:'response.failed',source:'webhook',fetcher,
  })
  expect(result.kind).toBe('finalized')
  expect(fetcher).not.toHaveBeenCalled()
  expect(db.calls.find(call=>call.name==='finalize_procurement_background_operation')?.args)
   .toEqual(expect.objectContaining({candidate_provider_status:'failed',candidate_error_code:'PROVIDER_FAILED'}))
 })

 for(const status of['failed','incomplete','cancelled']as const){
  it(`discovers provider ${status} by polling when no webhook is delivered`,async()=>{
   const db=database()
   const result=await processProcurementBackgroundOperation({
    database:db,providerKey:'secret',operation,source:'reconciler',
    fetcher:vi.fn(async()=>Response.json({id:'resp_test',status})),
   })
   expect(result.kind).toBe('finalized')
   expect(db.calls.find(call=>call.name==='finalize_procurement_background_operation')?.args)
    .toEqual(expect.objectContaining({
     candidate_provider_status:status,candidate_terminal_source:'reconciler',
    }))
  })
 }

 it('discovers and publishes a completed response by polling without a webhook',async()=>{
  const db=completedDatabase()
  const result=await processProcurementBackgroundOperation({
   database:db,providerKey:'secret',operation,source:'reconciler',
   fetcher:vi.fn(async()=>Response.json({
    id:'resp_test',status:'completed',
    output:[{content:[{type:'output_text',text:JSON.stringify(fixture)}]}],
   })),
  })
  expect(result).toEqual({kind:'finalized',candidateCount:1})
  expect(db.calls.find(call=>call.name==='finalize_procurement_background_operation')?.args)
   .toEqual(expect.objectContaining({
    candidate_provider_status:'completed',candidate_terminal_source:'reconciler',
   }))
 })

 it('resets consecutive retrieval failures after a successful running poll',async()=>{
  const db=database()
  await processProcurementBackgroundOperation({
   database:db,providerKey:'secret',
   operation:{...operation,transient_failure_count:5},source:'reconciler',
   fetcher:vi.fn(async()=>Response.json({id:'resp_test',status:'in_progress'})),
  })
  expect(db.calls.find(call=>call.name==='reschedule_procurement_background_operation')?.args)
   .toEqual(expect.objectContaining({increment_failure:false}))
 })

 it('expires safely before repeated retrieval failures exceed provider retention',async()=>{
  const db=database()
  const result=await processProcurementBackgroundOperation({
   database:db,providerKey:'secret',
   operation:{...operation,transient_failure_count:3},source:'reconciler',
   fetcher:vi.fn(async()=>new Response('',{status:404})),
  })
  expect(result.kind).toBe('finalized')
  expect(db.calls.find(call=>call.name==='finalize_procurement_background_operation')?.args)
   .toEqual(expect.objectContaining({
    candidate_error_code:'BACKGROUND_RESPONSE_RETENTION_EXHAUSTED',
    candidate_terminal_source:'expiry',
   }))
 })

 it('expires an unbound ambiguous intent without a second provider submission',async()=>{
  const db=database(),old={...operation,provider_operation_id:null,
   intent_created_at:new Date(Date.now()-31*60*1000).toISOString()}
  const result=await processProcurementBackgroundOperation({
   database:db,providerKey:'secret',operation:old,source:'reconciler',
  })
  expect(result.kind).toBe('finalized')
  expect(db.calls.find(call=>call.name==='finalize_procurement_background_operation')?.args)
   .toEqual(expect.objectContaining({candidate_error_code:'BACKGROUND_SUBMISSION_AMBIGUOUS'}))
  expect(db.calls.map(call=>call.name)).not.toContain('begin_procurement_background_submission')
 })
})
