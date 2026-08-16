import type{OfferCandidate,ResearchJob}from'./assistedResearch'
import type{ProcurementRequest,RequestedItem}from'./procurement'

const fieldLabels:Record<string,string>={
 shipping_cost:'shipping cost',
 tax_duty_estimate:'tax/duty estimate',
 taxDutyEstimate:'tax/duty estimate',
 delivery_estimate_days:'delivery estimate',
 required_specification_evidence:'required specification evidence',
 item_price:'item price',
 currency:'currency',
 package_quantity:'package quantity',
 package_unit:'package unit',
 source_url:'source URL',
 coa_availability:'COA verification',
 sds_availability:'SDS verification',
 technical_document_availability:'technical-document verification',
 stock_status:'availability',
}

export const researchFieldLabel=(field:string)=>fieldLabels[field]??field.replaceAll('_',' ')

export const candidatesForResearchJob=(jobId:string,candidates:OfferCandidate[])=>
 candidates.filter(candidate=>candidate.research_job_id===jobId)

export function unresolvedFieldsForCandidates(candidates:OfferCandidate[]){
 return[...new Set(candidates.flatMap(candidate=>candidate.unresolved_fields))].sort()
}

export function requestedItemsWithoutPracticalCandidate(items:RequestedItem[],candidates:OfferCandidate[]){
 return items.filter(item=>!candidates.some(candidate=>
  candidate.requested_item_id===item.id
  &&!['rejected','duplicate'].includes(candidate.review_status)
  &&!candidate.is_marketplace_listing
  &&candidate.package_quantity!=null
  &&Boolean(candidate.package_unit)
  &&candidate.item_price!=null
  &&Boolean(candidate.currency)
  &&candidate.unresolved_fields.length===0
 ))
}

const countryName=(country:string)=>{
 try{return new Intl.DisplayNames(['en'],{type:'region'}).of(country.toUpperCase())??country.toUpperCase()}
 catch{return country.toUpperCase()}
}

export function buildFollowUpInstructionDraft(input:{
 request:ProcurementRequest
 items:RequestedItem[]
 priorCandidates:OfferCandidate[]
 deliveryCountry:string
}){
 const unresolved=unresolvedFieldsForCandidates(input.priorCandidates)
 const unresolvedText=unresolved.length
  ?unresolved.map(researchFieldLabel).join(', ')
  :'remaining supplier and commercial evidence gaps'
 const unmatched=requestedItemsWithoutPracticalCandidate(input.items,input.priorCandidates)
 const unmatchedText=unmatched.length
  ?` Pay particular attention to requested items without a fully resolved practical candidate: ${unmatched.map(item=>item.name).join(', ')}.`
  :''
 const preferred=[...new Set(input.items.map(item=>item.preferred_supplier_hint).filter((hint):hint is string=>Boolean(hint)))]
 const preferredText=preferred.length
  ?` Recheck relevant preferred-supplier hints (${preferred.join(', ')}) without treating them as mandatory suppliers.`
  :''
 return`Resolve unresolved fields from the previous research job for “${input.request.title}”: ${unresolvedText}.${unmatchedText} Confirm evidence-based availability, documentation, shipping, tax/duty and delivery for ${countryName(input.deliveryCountry)}. Do not infer destination tax or duty without current evidence.${preferredText} Prefer manufacturers, established distributors and specialist cosmetic/raw-material suppliers over marketplaces. Find better practical candidates where earlier matches are unsuitable, but do not replace strong existing candidates merely to create more results. Avoid duplicate candidates and keep every value unknown when it cannot be verified.`
}

export function fieldsResolvedByFollowUp(candidate:OfferCandidate,prior:OfferCandidate|undefined){
 if(!prior)return[]
 return prior.unresolved_fields.filter(field=>!candidate.unresolved_fields.includes(field))
}

export function followUpLineageLabel(job:ResearchJob,jobs:ResearchJob[]){
 if(!job.follow_up_of_job_id)return''
 const prior=jobs.find(candidate=>candidate.id===job.follow_up_of_job_id)
 if(!prior)return'Follow-up to an earlier research job'
 return`Follow-up to job from ${new Date(prior.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`
}
