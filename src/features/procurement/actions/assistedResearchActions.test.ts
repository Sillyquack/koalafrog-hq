import{describe,expect,it,vi}from'vitest'

const actions=vi.hoisted(()=>({
 createResearchJob:vi.fn(),
 updateResearchJob:vi.fn(),
 publishResearchResults:vi.fn(),
 failResearchJob:vi.fn(),
}))
vi.mock('./procurementActions',()=>({procurementActions:actions}))

import type{ProcurementData,ProcurementRequest}from'../domain/procurement'
import type{ProcurementResearchProvider}from'../services/procurementResearchService'
import{runResearch}from'./assistedResearchActions'

const request:ProcurementRequest={id:'request-1',title:'Jojoba',status:'researching',category:'raw_material',priority:'normal',needed_by:null,notes:'',revision:1,created_at:'',updated_at:''}
const data={researchJobs:[],requestedItems:[{id:'item-1',procurement_request_id:'request-1'}],offers:[]}as unknown as ProcurementData

describe('assisted research terminal safety',()=>{
 it('does not publish candidates or retry after a provider timeout',async()=>{
  actions.createResearchJob.mockResolvedValue({id:'job-1'})
  actions.updateResearchJob.mockResolvedValue(undefined)
  actions.failResearchJob.mockResolvedValue(undefined)
  const discoverOffers=vi.fn().mockRejectedValue(Object.assign(new Error('Timed out'),{code:'PROVIDER_TIMEOUT'}))
  const provider={id:'openai-web-search-v1',prepareJob:vi.fn(),discoverOffers}as unknown as ProcurementResearchProvider

  await expect(runResearch('workspace-1',request,data,provider)).rejects.toMatchObject({code:'PROVIDER_TIMEOUT'})

  expect(discoverOffers).toHaveBeenCalledOnce()
  expect(actions.publishResearchResults).not.toHaveBeenCalled()
  expect(actions.failResearchJob).toHaveBeenCalledWith('job-1',expect.objectContaining({error_code:'PROVIDER_TIMEOUT'}))
 })
})
