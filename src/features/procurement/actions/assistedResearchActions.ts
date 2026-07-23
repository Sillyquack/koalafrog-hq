import{procurementActions}from'./procurementActions'
import type{ProcurementData,ProcurementRequest}from'../domain/procurement'
import type{ResearchJob}from'../domain/assistedResearch'
import{DeterministicMockResearchProvider,mapFinding,type ProcurementResearchProvider,type ResearchConstraints}from'../services/procurementResearchService'
const defaultConstraints:ResearchConstraints={deliveryCountry:'NO',documentationRequirements:[],preferredSuppliers:[],excludedSuppliers:[]}
export async function runResearch(workspaceId:string,request:ProcurementRequest,data:ProcurementData,provider:ProcurementResearchProvider=new DeterministicMockResearchProvider(),retryOf?:string,constraints:ResearchConstraints=defaultConstraints){
 if(data.researchJobs.some(job=>job.procurement_request_id===request.id&&job.provider===provider.id&&['queued','running','partial'].includes(job.status)))throw new Error('A research job for this request and provider is already active.')
 const job=await procurementActions.createResearchJob(workspaceId,{procurement_request_id:request.id,provider:provider.id,status:'queued',retry_of_job_id:retryOf??null}) as ResearchJob
 provider.prepareJob?.(job.id,workspaceId)
 try{
  await procurementActions.updateResearchJob(job.id,{status:'running',started_at:new Date().toISOString(),error_code:null,error_details:null,attempt_count:1})
  const items=data.requestedItems.filter(item=>item.procurement_request_id===request.id)
  const result=await provider.discoverOffers({request,items,offers:data.offers.filter(offer=>items.some(item=>item.id===offer.requested_item_id)),constraints})
  const candidates=result.findings.map(finding=>({...mapFinding(finding,items.find(item=>item.id===finding.requestedItemId)!),research_job_id:job.id,procurement_request_id:request.id}))
  await procurementActions.createOfferCandidates(workspaceId,candidates)
  await procurementActions.updateResearchJob(job.id,{status:result.partial?'partial':'completed',result_count:candidates.length,provider_request_id:provider.requestMetadata?.().providerRequestId??null,completed_at:new Date().toISOString()})
  return job.id
 }catch(cause){
  const code=typeof cause==='object'&&cause&&'code'in cause&&typeof cause.code==='string'?cause.code:'PROVIDER_ERROR'
  await procurementActions.updateResearchJob(job.id,{status:'failed',error_code:code,error_details:cause instanceof Error?cause.message:'Unknown provider error',provider_request_id:provider.requestMetadata?.().providerRequestId??null,completed_at:new Date().toISOString()})
  throw cause
 }
}
export const cancelResearch=(jobId:string)=>procurementActions.updateResearchJob(jobId,{status:'cancelled',completed_at:new Date().toISOString()})
