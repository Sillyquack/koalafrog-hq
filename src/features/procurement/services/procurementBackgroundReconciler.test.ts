import{describe,expect,it,vi}from'vitest'
import{reconcileProcurementBackgroundBatch}from'../../../../supabase/functions/_shared/procurementBackgroundReconciler'

const operation={
 attempt_id:'11111111-1111-4111-8111-111111111111',
 job_id:'job-1',workspace_id:'workspace-1',
 provider_operation_id:'resp_test',submission_state:'provider_in_progress',
 intent_created_at:new Date().toISOString(),reconciliation_attempt_count:0,
 transient_failure_count:0,
}

function operationQuery(rows:typeof operation[]){
 const query={
  select:vi.fn(()=>query),is:vi.fn(()=>query),lte:vi.fn(()=>query),
  order:vi.fn(()=>query),
  limit:vi.fn(async()=>({data:rows,error:null})),
 }
 return query
}

function inboxQuery(){
 const query={
  select:vi.fn(()=>query),eq:vi.fn(()=>query),in:vi.fn(()=>query),
  order:vi.fn(()=>query),limit:vi.fn(()=>query),
  maybeSingle:vi.fn(async()=>({data:null,error:null})),
 }
 return query
}

function database(options:{
 expired?:number
 sweepError?:boolean
 operations?:typeof operation[]
}={}){
 const rpc=vi.fn(async(name:string)=>{
  if(name==='expire_procurement_unmatched_webhooks'){
   return options.sweepError?{data:null,error:{message:'hidden'}}:
    {data:options.expired??0,error:null}
  }
  if(name==='claim_procurement_background_operation')return{data:false,error:null}
  return{data:null,error:null}
 })
 const from=vi.fn((table:string)=>table==='procurement_background_operations'
  ?operationQuery(options.operations??[]):inboxQuery())
 return{rpc,from}
}

describe('Procurement background reconciler',()=>{
 it('sweeps expired unmatched rows before an empty operation batch',async()=>{
  const db=database({expired:2})
  const result=await reconcileProcurementBackgroundBatch({
   database:db,providerKey:'local-test-key',
  })
  expect(result).toEqual({
   expiredUnmatched:2,processed:0,sweepStatus:'ok',outcomes:{},
  })
  expect(db.rpc).toHaveBeenNthCalledWith(1,'expire_procurement_unmatched_webhooks',{
   maximum_rows:25,
  })
  expect(db.from).toHaveBeenCalledWith('procurement_background_operations')
 })

 it('bounds the sweep and never performs provider work for unmatched rows',async()=>{
  const db=database({expired:25})
  const fetchSpy=vi.spyOn(globalThis,'fetch')
  const result=await reconcileProcurementBackgroundBatch({
   database:db,providerKey:'local-test-key',
  })
  expect(result.expiredUnmatched).toBe(25)
  expect(fetchSpy).not.toHaveBeenCalled()
  expect(db.rpc).toHaveBeenCalledTimes(1)
  fetchSpy.mockRestore()
 })

 it('isolates sweep failure so due operation recovery is not starved',async()=>{
  const db=database({sweepError:true,operations:[operation]})
  const result=await reconcileProcurementBackgroundBatch({
   database:db,providerKey:'local-test-key',
  })
  expect(result).toEqual({
   expiredUnmatched:0,processed:1,sweepStatus:'error',outcomes:{busy:1},
  })
  expect(db.rpc.mock.calls.map(call=>call[0])).toEqual([
   'expire_procurement_unmatched_webhooks',
   'claim_procurement_background_operation',
  ])
 })

 it('returns aggregate-only results without internal identifiers',async()=>{
  const result=await reconcileProcurementBackgroundBatch({
   database:database({expired:2}),providerKey:'local-test-key',
  })
  expect(JSON.stringify(result)).not.toMatch(/evt_|resp_|attempt|workspace|provider_operation/)
 })

 it('overlapping empty invocations remain independently bounded',async()=>{
  const db=database({expired:0})
  const results=await Promise.all([
   reconcileProcurementBackgroundBatch({database:db,providerKey:'local-test-key'}),
   reconcileProcurementBackgroundBatch({database:db,providerKey:'local-test-key'}),
  ])
  expect(results).toEqual([
   {expiredUnmatched:0,processed:0,sweepStatus:'ok',outcomes:{}},
   {expiredUnmatched:0,processed:0,sweepStatus:'ok',outcomes:{}},
  ])
  expect(db.rpc).toHaveBeenCalledTimes(2)
 })
})
