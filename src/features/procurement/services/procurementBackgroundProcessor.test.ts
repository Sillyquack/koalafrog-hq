import{describe,expect,it,vi}from'vitest'
import{processProcurementBackgroundOperation}from'../../../../supabase/functions/_shared/procurementBackgroundProcessor'

const operation={
 attempt_id:'11111111-1111-4111-8111-111111111111',job_id:'job-1',
 workspace_id:'workspace-1',provider_operation_id:'resp_test',
 submission_state:'provider_in_progress',intent_created_at:new Date().toISOString(),
 reconciliation_attempt_count:0,
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
  const db=database()
  const result=await processProcurementBackgroundOperation({
   database:db,providerKey:'secret',operation,eventId:'evt_test',
   eventType:'response.completed',source:'webhook',
   fetcher:vi.fn(async()=>{throw new TypeError('network')}),
  })
  expect(result.kind).toBe('rescheduled')
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
