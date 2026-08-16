import{procurementActions}from'./procurementActions'
import type{ProcurementData,ProcurementRequest}from'../domain/procurement'
import{activeResearchStatuses,canFollowUpResearch,type ResearchJob}from'../domain/assistedResearch'
import{DeterministicMockResearchProvider,mapFinding,type ProcurementResearchProvider,type ResearchConstraints}from'../services/procurementResearchService'
const defaultConstraints:ResearchConstraints={deliveryCountry:'NO',documentationRequirements:[],preferredSuppliers:[],excludedSuppliers:[]}
export async function runResearch(workspaceId:string,request:ProcurementRequest,data:ProcurementData,provider:ProcurementResearchProvider=new DeterministicMockResearchProvider(),retryOf?:string,constraints:ResearchConstraints=defaultConstraints){
 if(data.researchJobs.some(job=>job.procurement_request_id===request.id&&job.provider===provider.id&&activeResearchStatuses.includes(job.status)))throw new Error('A research job for this request and provider is already active.')
 const items=data.requestedItems.filter(item=>item.procurement_request_id===request.id)
 if(items.length>10)throw new Error('Live research supports at most 10 requested items per request/job. Split the sourcing request before starting research.')
 const job=await procurementActions.createResearchJob(workspaceId,{procurement_request_id:request.id,provider:provider.id,status:'queued',retry_of_job_id:retryOf??null}) as ResearchJob
 provider.prepareJob?.(job.id,workspaceId)
 try{
  await procurementActions.updateResearchJob(job.id,{status:'running',started_at:new Date().toISOString(),error_code:null,error_details:null,attempt_count:1})
  const result=await provider.discoverOffers({request,items,offers:data.offers.filter(offer=>items.some(item=>item.id===offer.requested_item_id)),constraints})
  if(result.asyncAccepted)return job.id
  const candidates=result.findings.map(finding=>({...mapFinding(finding,items.find(item=>item.id===finding.requestedItemId)!),research_job_id:job.id,procurement_request_id:request.id}))
  await procurementActions.publishResearchResults(workspaceId,job.id,candidates,result.partial?'partial':'completed',provider.requestMetadata?.().providerRequestId??null)
  return job.id
 }catch(cause){
  const code=typeof cause==='object'&&cause&&'code'in cause&&typeof cause.code==='string'?cause.code:'PROVIDER_ERROR'
  await procurementActions.failResearchJob(job.id,{error_code:code,error_details:cause instanceof Error?cause.message:'Unknown provider error',provider_request_id:provider.requestMetadata?.().providerRequestId??null})
  throw cause
 }
}
export async function runFollowUpResearch(workspaceId:string,request:ProcurementRequest,data:ProcurementData,priorJob:ResearchJob,instructions:string,deliveryCountry:string,liveResearchConsent:boolean,provider:ProcurementResearchProvider){
 if(!liveResearchConsent)throw new Error('Explicit live-research consent is required before follow-up research.')
 if(!canFollowUpResearch(priorJob)||priorJob.procurement_request_id!==request.id)throw new Error('Follow-up research requires a terminal live-research job for this request.')
 if(provider.id!==priorJob.provider)throw new Error('Follow-up research must use the same live provider as the prior job.')
 if(data.researchJobs.some(job=>job.procurement_request_id===request.id&&job.provider===provider.id&&activeResearchStatuses.includes(job.status)))throw new Error('A research job for this request and provider is already active.')
 const items=data.requestedItems.filter(item=>item.procurement_request_id===request.id)
 if(!items.length)throw new Error('Follow-up research requires at least one requested item.')
 if(items.length>10)throw new Error('Live research supports at most 10 requested items per request/job. Split the sourcing request before starting research.')
 const job=await procurementActions.createFollowUpResearchJob(workspaceId,{procurementRequestId:request.id,priorJobId:priorJob.id,instructions,deliveryCountry,liveResearchConsent})
 if(!job.follow_up_context||!job.follow_up_of_job_id||!job.follow_up_instructions||!job.delivery_country||!job.live_research_consent_at)throw new Error('Follow-up research provenance readback is incomplete.')
 provider.prepareJob?.(job.id,workspaceId)
 try{
  await procurementActions.updateResearchJob(job.id,{status:'running',started_at:new Date().toISOString(),error_code:null,error_details:null,attempt_count:1})
  const result=await provider.discoverOffers({
   request,items,offers:data.offers.filter(offer=>items.some(item=>item.id===offer.requested_item_id)),
   constraints:{deliveryCountry:job.delivery_country,documentationRequirements:['COA','SDS','technical document'],preferredSuppliers:[...new Set(items.map(item=>item.preferred_supplier_hint).filter((hint):hint is string=>Boolean(hint)))],excludedSuppliers:[]},
   followUp:{...job.follow_up_context,priorJobId:job.follow_up_of_job_id,instructions:job.follow_up_instructions},
  })
  if(result.asyncAccepted)return job.id
  const candidates=result.findings.map(finding=>({...mapFinding(finding,items.find(item=>item.id===finding.requestedItemId)!),research_job_id:job.id,procurement_request_id:request.id}))
  await procurementActions.publishResearchResults(workspaceId,job.id,candidates,result.partial?'partial':'completed',provider.requestMetadata?.().providerRequestId??null)
  return job.id
 }catch(cause){
  const code=typeof cause==='object'&&cause&&'code'in cause&&typeof cause.code==='string'?cause.code:'PROVIDER_ERROR'
  await procurementActions.failResearchJob(job.id,{error_code:code,error_details:cause instanceof Error?cause.message:'Unknown provider error',provider_request_id:provider.requestMetadata?.().providerRequestId??null})
  throw cause
 }
}
export const cancelResearch=(jobId:string)=>procurementActions.cancelResearchJob(jobId)
