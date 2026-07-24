import{describe,expect,it}from'vitest'
import{
 reconciliationDelaySeconds,retryableRetrievalStatus,terminalStatusFromEvent,
}from'../../../../supabase/functions/_shared/procurementBackgroundLifecycle'

describe('durable Procurement background lifecycle policy',()=>{
 it('classifies only retry-safe retrieval statuses as transient',()=>{
  for(const status of[404,408,409,429,500,502,503,504]){
   expect(retryableRetrievalStatus(status)).toBe(true)
  }
  for(const status of[400,401,403,422]){
   expect(retryableRetrievalStatus(status)).toBe(false)
  }
 })

 it('uses deterministic bounded exponential backoff with jitter',()=>{
  const delays=Array.from({length:20},(_,attempt)=>reconciliationDelaySeconds(attempt,'attempt-a'))
  expect(delays[0]).toBeGreaterThanOrEqual(15)
  expect(delays.at(-1)).toBeLessThanOrEqual(21_600)
  expect(reconciliationDelaySeconds(4,'attempt-a')).toBe(reconciliationDelaySeconds(4,'attempt-a'))
  expect(delays[4]).toBeGreaterThan(delays[1])
 })

 it('maps authenticated terminal events without accepting arbitrary types',()=>{
  expect(terminalStatusFromEvent('response.completed')).toBe('completed')
  expect(terminalStatusFromEvent('response.failed')).toBe('failed')
  expect(terminalStatusFromEvent('response.incomplete')).toBe('incomplete')
  expect(terminalStatusFromEvent('response.cancelled')).toBe('cancelled')
 })
})
