import type{LiveResearchRequest}from'../domain/liveResearchContract'
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
  const sessionResult=await supabase.auth.getSession()
  const accessToken=sessionResult.data.session?.access_token
  if(sessionResult.error||!accessToken)throw new LiveProviderError('AUTHENTICATION_REQUIRED','Your authenticated session is unavailable. Sign in again before starting live research.')
  const input:LiveResearchRequest={schemaVersion:1,workspaceId:this.workspaceId,jobId:this.jobId,requestId:crypto.randomUUID(),deliveryCountry:snapshot.constraints.deliveryCountry,documentationRequirements:snapshot.constraints.documentationRequirements,preferredSuppliers:snapshot.constraints.preferredSuppliers,excludedSuppliers:snapshot.constraints.excludedSuppliers,items:snapshot.items.map(item=>({id:item.id,name:item.name,category:item.category,quantity:item.requested_quantity,unit:item.unit,requiredSpecifications:item.required_specifications,acceptableSubstitutes:item.acceptable_substitutes,neededBy:item.needed_by,priority:item.priority,notes:item.notes}))}
  const response=await supabase.functions.invoke('procurement-live-research',{headers:{Authorization:`Bearer ${accessToken}`},body:input})
  if(response.error){
   const context=response.error.context as Response|undefined
   const payload:{error?:{code?:string;message?:string}}=await context?.json().catch(()=>({}))??{}
   const definitive=Boolean(context&&[400,401,403,404,409,422,429].includes(context.status))
   if(!definitive){
    const state=await supabase.from('procurement_research_jobs')
     .select('status,provider_invocation_count,background_lifecycle_status')
     .eq('id',this.jobId).eq('workspace_id',this.workspaceId).maybeSingle()
    if(!state.error&&state.data?.status==='running'&&
      (state.data.provider_invocation_count===1||state.data.background_lifecycle_status)){
     return{partial:false,providerNotes:'Research submission status is being reconciled.',findings:[],asyncAccepted:true}
    }
   }
   throw new LiveProviderError(payload.error?.code??'PROVIDER_FAILURE',payload.error?.message??'Live research could not be completed.')
  }
  const raw=response.data as Record<string,unknown>
  if(raw.accepted!==true||raw.status!=='running')throw new LiveProviderError('PROVIDER_INVALID_RESPONSE','Live research did not acknowledge the background job.')
  return{partial:false,providerNotes:'Background research accepted.',findings:[],asyncAccepted:true}
 }
 async refreshOffer():Promise<ResearchFinding>{throw new LiveProviderError('REFRESH_NOT_AVAILABLE','Live offer refresh is not available in this first provider slice.')}
 sourceAttribution(finding:ResearchFinding){return{url:finding.sourceUrl,date:finding.sourceDate,notes:finding.sourceNotes}}
}
