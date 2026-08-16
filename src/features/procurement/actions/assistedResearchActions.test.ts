import{beforeEach,describe,expect,it,vi}from'vitest'

const actions=vi.hoisted(()=>({
 createResearchJob:vi.fn(),
 createFollowUpResearchJob:vi.fn(),
 updateResearchJob:vi.fn(),
 publishResearchResults:vi.fn(),
 failResearchJob:vi.fn(),
}))
vi.mock('./procurementActions',()=>({procurementActions:actions}))

import type{ProcurementData,ProcurementRequest}from'../domain/procurement'
import type{ResearchJob}from'../domain/assistedResearch'
import type{ProcurementResearchProvider}from'../services/procurementResearchService'
import{runFollowUpResearch,runResearch}from'./assistedResearchActions'

const request:ProcurementRequest={id:'request-1',title:'Jojoba',status:'researching',category:'raw_material',priority:'normal',needed_by:null,notes:'',revision:1,created_at:'',updated_at:''}
const data={researchJobs:[],requestedItems:[{id:'item-1',procurement_request_id:'request-1'}],offers:[]}as unknown as ProcurementData
const priorJob={id:'job-prior',procurement_request_id:'request-1',provider:'openai-web-search-v1',status:'partial',started_at:'2026-08-15T10:00:00Z',completed_at:'2026-08-15T10:05:00Z',cancellation_requested_at:null,provider_stopped_at:'2026-08-15T10:05:00Z',error_code:null,error_details:null,result_count:1,reviewed_count:0,retry_of_job_id:null,follow_up_of_job_id:null,follow_up_instructions:null,follow_up_context:null,delivery_country:null,live_research_consent_at:null,provider_request_id:null,correlation_id:'correlation-prior',attempt_count:1,created_at:'2026-08-15T10:00:00Z',updated_at:'2026-08-15T10:05:00Z'}satisfies ResearchJob
const followUpContext={schemaVersion:1 as const,unresolvedFields:['shipping_cost'],priorCandidates:[],itemsWithoutPracticalCandidate:[{requestedItemId:'item-1',name:'Jojoba oil'}]}

describe('assisted research terminal safety',()=>{
 beforeEach(()=>vi.clearAllMocks())
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

 it('leaves an acknowledged background job running without client publication',async()=>{
  actions.createResearchJob.mockResolvedValue({id:'job-1'})
  actions.updateResearchJob.mockResolvedValue(undefined)
  const discoverOffers=vi.fn().mockResolvedValue({findings:[],partial:false,asyncAccepted:true})
  const provider={id:'openai-web-search-v1',prepareJob:vi.fn(),discoverOffers}as unknown as ProcurementResearchProvider

  await expect(runResearch('workspace-1',request,data,provider)).resolves.toBe('job-1')

  expect(discoverOffers).toHaveBeenCalledOnce()
  expect(actions.publishResearchResults).not.toHaveBeenCalled()
  expect(actions.failResearchJob).not.toHaveBeenCalled()
 })

 it('rejects requests above the 10-item provider contract before creating a research job',async()=>{
  const oversized={...data,requestedItems:Array.from({length:11},(_,index)=>({id:`item-${index}`,procurement_request_id:'request-1'}))}as unknown as ProcurementData
  const provider={id:'openai-web-search-v1'}as unknown as ProcurementResearchProvider

  await expect(runResearch('workspace-1',request,oversized,provider)).rejects.toThrow('at most 10 requested items')

  expect(actions.createResearchJob).not.toHaveBeenCalled()
 expect(actions.publishResearchResults).not.toHaveBeenCalled()
 })

 it('requires fresh explicit consent before any follow-up job is created',async()=>{
  const provider={id:'openai-web-search-v1'}as unknown as ProcurementResearchProvider

  await expect(runFollowUpResearch('workspace-1',request,{...data,researchJobs:[priorJob]}as ProcurementData,priorJob,'Resolve shipping.','NO',false,provider)).rejects.toThrow('Explicit live-research consent')

  expect(actions.createFollowUpResearchJob).not.toHaveBeenCalled()
  expect(actions.updateResearchJob).not.toHaveBeenCalled()
 })

 it('creates a separate linked job and sends persisted follow-up context to the provider',async()=>{
  const original=structuredClone(priorJob)
  actions.createFollowUpResearchJob.mockResolvedValue({...priorJob,id:'job-follow-up',status:'queued',follow_up_of_job_id:priorJob.id,follow_up_instructions:'Resolve shipping.',follow_up_context:followUpContext,delivery_country:'SE',live_research_consent_at:'2026-08-16T10:00:00Z'})
  actions.updateResearchJob.mockResolvedValue(undefined)
  const discoverOffers=vi.fn().mockResolvedValue({findings:[],partial:false,asyncAccepted:true})
  const provider={id:'openai-web-search-v1',prepareJob:vi.fn(),discoverOffers}as unknown as ProcurementResearchProvider

  await expect(runFollowUpResearch('workspace-1',request,{...data,researchJobs:[priorJob]}as ProcurementData,priorJob,'Resolve shipping.','SE',true,provider)).resolves.toBe('job-follow-up')

  expect(actions.createFollowUpResearchJob).toHaveBeenCalledWith('workspace-1',{procurementRequestId:'request-1',priorJobId:'job-prior',instructions:'Resolve shipping.',deliveryCountry:'SE',liveResearchConsent:true})
  expect(discoverOffers).toHaveBeenCalledWith(expect.objectContaining({
   followUp:expect.objectContaining({priorJobId:'job-prior',instructions:'Resolve shipping.',unresolvedFields:['shipping_cost']}),
   constraints:expect.objectContaining({deliveryCountry:'SE'}),
  }))
  expect(actions.publishResearchResults).not.toHaveBeenCalled()
  expect(priorJob).toEqual(original)
 })

 it('keeps ordinary retry on retry_of_job_id without follow-up provenance',async()=>{
  actions.createResearchJob.mockResolvedValue({id:'job-retry'})
  actions.updateResearchJob.mockResolvedValue(undefined)
  const provider={id:'openai-web-search-v1',discoverOffers:vi.fn().mockResolvedValue({findings:[],partial:false,asyncAccepted:true})}as unknown as ProcurementResearchProvider

  await runResearch('workspace-1',request,data,provider,'job-prior')

  expect(actions.createResearchJob).toHaveBeenCalledWith('workspace-1',{procurement_request_id:'request-1',provider:'openai-web-search-v1',status:'queued',retry_of_job_id:'job-prior'})
  expect(actions.createFollowUpResearchJob).not.toHaveBeenCalled()
 })
})
