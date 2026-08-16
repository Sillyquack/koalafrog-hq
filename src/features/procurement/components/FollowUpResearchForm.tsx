import{useMemo,useState,type FormEvent}from'react'
import{Search,ShieldCheck,X}from'lucide-react'
import type{ProcurementData,ProcurementRequest}from'../domain/procurement'
import type{ResearchJob}from'../domain/assistedResearch'
import{buildFollowUpInstructionDraft,candidatesForResearchJob,requestedItemsWithoutPracticalCandidate,unresolvedFieldsForCandidates}from'../domain/followUpResearch'

export interface FollowUpResearchSubmission{
 instructions:string
 deliveryCountry:string
 liveResearchConsent:boolean
}

export function FollowUpResearchForm({request,data,priorJob,busy,onCancel,onRun}:{
 request:ProcurementRequest
 data:ProcurementData
 priorJob:ResearchJob
 busy:boolean
 onCancel:()=>void
 onRun:(submission:FollowUpResearchSubmission)=>Promise<void>
}){
 const items=useMemo(()=>data.requestedItems.filter(item=>item.procurement_request_id===request.id),[data.requestedItems,request.id])
 const priorCandidates=useMemo(()=>candidatesForResearchJob(priorJob.id,data.offerCandidates),[data.offerCandidates,priorJob.id])
 const unresolved=useMemo(()=>unresolvedFieldsForCandidates(priorCandidates),[priorCandidates])
 const unmatched=useMemo(()=>requestedItemsWithoutPracticalCandidate(items,priorCandidates),[items,priorCandidates])
 const[deliveryCountry,setDeliveryCountry]=useState(priorJob.delivery_country??'NO')
 const[instructions,setInstructions]=useState(()=>buildFollowUpInstructionDraft({request,items,priorCandidates,deliveryCountry:priorJob.delivery_country??'NO'}))
 const[consent,setConsent]=useState(false)
 const submit=async(event:FormEvent)=>{event.preventDefault();await onRun({instructions:instructions.trim(),deliveryCountry:deliveryCountry.trim().toUpperCase(),liveResearchConsent:consent})}
 return<section className="follow-up-research-form" aria-labelledby="follow-up-research-heading">
  <header><div><span className="eyebrow">Owner-directed research objective</span><h3 id="follow-up-research-heading">Follow-up research</h3><p>This creates a new job linked to the previous result. It does not edit, accept, merge or replace any candidate.</p></div><button type="button" className="icon-button" aria-label="Close follow-up research" onClick={onCancel}><X size={15}/></button></header>
  <div className="follow-up-summary">
   <article><strong>Previous job</strong><span>{priorJob.status} · {priorJob.result_count} result{priorJob.result_count===1?'':'s'} · {new Date(priorJob.created_at).toLocaleDateString()}</span></article>
   <article><strong>Unresolved fields</strong><span>{unresolved.length?unresolved.map(field=>field.replaceAll('_',' ')).join(', '):'No structured unresolved fields recorded'}</span></article>
   <article><strong>No fully resolved practical candidate</strong><span>{unmatched.length?unmatched.map(item=>item.name).join(', '):'Every requested item has at least one complete non-marketplace candidate'}</span></article>
  </div>
  <form onSubmit={event=>void submit(event)}>
   <label>Follow-up instructions<textarea required maxLength={4000} rows={7} value={instructions} onChange={event=>setInstructions(event.target.value)}/><small>The draft is derived from this request, its requested items, prior candidates, unresolved fields and supplier hints. Edit it before execution.</small></label>
   <label>Delivery country<input required pattern="[A-Za-z]{2}" maxLength={2} value={deliveryCountry} onChange={event=>{setDeliveryCountry(event.target.value.toUpperCase());setConsent(false)}}/></label>
   <label className="research-consent"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)}/><span><ShieldCheck size={13}/>I explicitly consent to sending these owner-edited instructions, requested items and prior-candidate context to the approved live research provider. Results remain unreviewed candidates.</span></label>
   <div className="follow-up-actions"><button type="button" className="button ghost" onClick={onCancel}>Cancel</button><button className="button primary" disabled={busy||!consent||instructions.trim().length===0||deliveryCountry.length!==2}><Search size={14}/>{busy?'Starting follow-up…':'Start follow-up research'}</button></div>
  </form>
 </section>
}
