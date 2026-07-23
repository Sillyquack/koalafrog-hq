import{validateLiveResearchResponse,type LiveResearchRequest}from'../domain/liveResearchContract'
import{supabase}from'../../../platform/supabase/client'
import type{ProcurementResearchProvider,ProcurementResearchSnapshot,ResearchFinding,ResearchResult}from'./procurementResearchService'

export class LiveProviderError extends Error{
 constructor(public readonly code:string,message:string){super(message);this.name='LiveProviderError'}
}

export class OpenAIWebResearchProvider implements ProcurementResearchProvider{
 readonly id='openai-web-search-v1'
 private jobId=''
 private workspaceId=''
 private providerRequestId?:string
 prepareJob(jobId:string,workspaceId:string){this.jobId=jobId;this.workspaceId=workspaceId}
 requestMetadata(){return{providerRequestId:this.providerRequestId}}
 discoverSuppliers(snapshot:ProcurementResearchSnapshot){return this.discoverOffers(snapshot)}
 async discoverOffers(snapshot:ProcurementResearchSnapshot):Promise<ResearchResult>{
  if(!supabase)throw new LiveProviderError('PROVIDER_NOT_CONFIGURED','The hosted workspace connection is required for live research.')
  if(!this.jobId||!this.workspaceId)throw new LiveProviderError('JOB_UNAVAILABLE','The live research job was not prepared.')
  const input:LiveResearchRequest={schemaVersion:1,workspaceId:this.workspaceId,jobId:this.jobId,requestId:crypto.randomUUID(),deliveryCountry:snapshot.constraints.deliveryCountry,documentationRequirements:snapshot.constraints.documentationRequirements,preferredSuppliers:snapshot.constraints.preferredSuppliers,excludedSuppliers:snapshot.constraints.excludedSuppliers,items:snapshot.items.map(item=>({id:item.id,name:item.name,category:item.category,quantity:item.requested_quantity,unit:item.unit,requiredSpecifications:item.required_specifications,acceptableSubstitutes:item.acceptable_substitutes,neededBy:item.needed_by,priority:item.priority,notes:item.notes}))}
  const response=await supabase.functions.invoke('procurement-live-research',{body:input})
  if(response.error){const context=response.error.context as Response|undefined;const payload:{error?:{code?:string;message?:string}}=await context?.json().catch(()=>({}))??{};throw new LiveProviderError(payload.error?.code??'PROVIDER_FAILURE',payload.error?.message??'Live research could not be completed.')}
  const raw=response.data as Record<string,unknown>
  this.providerRequestId=typeof raw.providerRequestId==='string'?raw.providerRequestId:undefined
  const result=validateLiveResearchResponse(raw,snapshot.items.map(item=>item.id))
  return{partial:result.partial,providerNotes:result.providerNotes,findings:result.candidates.map(candidate=>this.mapCandidate(candidate))}
 }
 async refreshOffer():Promise<ResearchFinding>{throw new LiveProviderError('REFRESH_NOT_AVAILABLE','Live offer refresh is not available in this first provider slice.')}
 sourceAttribution(finding:ResearchFinding){return{url:finding.sourceUrl,date:finding.sourceDate,notes:finding.sourceNotes}}
 private mapCandidate(candidate:ReturnType<typeof validateLiveResearchResponse>['candidates'][number]):ResearchFinding{
  const fieldEvidence=Object.fromEntries(candidate.evidence.map(evidence=>[evidence.field,{state:evidence.state,sourceUrl:evidence.sourceUrl,snippet:evidence.snippet}]))
  return{requestedItemId:candidate.requestedItemId,supplierName:candidate.supplierName,productTitle:candidate.productTitle,sourceUrl:candidate.sourceUrl,packageQuantity:candidate.packageQuantity,packageUnit:candidate.packageUnit,itemPrice:candidate.itemPrice,currency:candidate.currency,moq:candidate.moq,shippingCost:candidate.shippingCost,deliveryEstimateDays:candidate.deliveryEstimateDays,stockStatus:candidate.stockStatus,coaAvailability:candidate.coaAvailability,sdsAvailability:candidate.sdsAvailability,technicalDocumentAvailability:candidate.technicalDocumentAvailability,firstOrderDiscount:candidate.firstOrderDiscount,sourceDate:candidate.sourceDate,evidenceSnippets:candidate.evidence.flatMap(evidence=>evidence.snippet?[evidence.snippet]:[]),sourceNotes:candidate.sourceNotes,confidence:candidate.confidence,freshness:'fresh',fieldStates:Object.fromEntries(candidate.evidence.map(evidence=>[evidence.field,evidence.state])),fieldEvidence,isMarketplaceListing:candidate.supplierType==='marketplace'}
 }
}
