import{describe,expect,it,vi}from'vitest'
import{runResearchWithRefresh}from'./researchPanelState'

describe('research panel refresh',()=>{
 it('reloads persisted job state after a provider failure and preserves the provider error',async()=>{
  const providerError=new Error('Live research provider could not complete this job.')
  const refresh=vi.fn().mockResolvedValue(undefined)

  await expect(runResearchWithRefresh(
   vi.fn().mockRejectedValue(providerError),
   refresh,
  )).rejects.toBe(providerError)

  expect(refresh).toHaveBeenCalledOnce()
 })

 it('does not replace a provider failure when the follow-up refresh also fails',async()=>{
  const providerError=new Error('Provider failed.')

  await expect(runResearchWithRefresh(
   vi.fn().mockRejectedValue(providerError),
   vi.fn().mockRejectedValue(new Error('Refresh failed.')),
  )).rejects.toBe(providerError)
 })
})
