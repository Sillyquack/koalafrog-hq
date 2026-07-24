import{freshnessFromSourceDate,validateLiveResearchResponse}from'./procurementLiveResearchContract.ts'

export const BACKGROUND_BATCH_SIZE=5
// OpenAI retains background Response data for roughly ten minutes. With the
// production scheduler running every minute, four consecutive failed
// retrievals keep the final attempt inside that provider window.
export const BACKGROUND_MAX_CONSECUTIVE_RETRIEVAL_FAILURES=4
export const BACKGROUND_RETRIEVAL_TIMEOUT_MS=20_000

export type TerminalSource='webhook'|'reconciler'|'cancellation'|'expiry'|'submission'
export type ProcessingOutcome=
 |{kind:'finalized'|'duplicate'|'discarded';candidateCount:number}
 |{kind:'rescheduled';code:string}
 |{kind:'busy'}

export const retryableRetrievalStatus=(status:number)=>
 status===404||status===408||status===409||status===429||status>=500

export function reconciliationDelaySeconds(attempt:number,seed=''){
 const bounded=Math.max(0,Math.min(attempt,2))
 const base=Math.min(15*2**bounded,60)
 let hash=0
 for(const character of seed)hash=(hash*31+character.charCodeAt(0))>>>0
 const jitter=Math.round(base*((hash%21)-10)/100)
 return Math.max(15,Math.min(base+jitter,60))
}

export const terminalStatusFromEvent=(type:string)=>
 type==='response.completed'?'completed':
 type==='response.failed'?'failed':
 type==='response.incomplete'?'incomplete':'cancelled'

export const outputText=(payload:unknown)=>{
 const response=payload as{output?:Array<{content?:Array<{type?:unknown;text?:unknown}>}>}
 const item=response.output?.flatMap(output=>output.content??[])
  .find(content=>content.type==='output_text')
 return typeof item?.text==='string'?item.text:null
}

export function normalizedCandidateRows(
 payload:unknown,
 items:Array<{id:string;required_specifications:string[]}>,
){
 const validated=validateLiveResearchResponse(payload,items.map(item=>item.id))
 const candidates=validated.candidates.map(candidate=>{
  const evidenceSnippets=candidate.evidence.flatMap(evidence=>evidence.snippet?[evidence.snippet]:[])
  const unresolved=[
   ['source_url',candidate.sourceUrl],['package_quantity',candidate.packageQuantity],
   ['package_unit',candidate.packageUnit],['item_price',candidate.itemPrice],
   ['currency',candidate.currency],['shipping_cost',candidate.shippingCost],
   ['delivery_estimate_days',candidate.deliveryEstimateDays],
  ].filter(([,value])=>value==null||value==='').map(([field])=>field as string)
  if((items.find(item=>item.id===candidate.requestedItemId)?.required_specifications.length??0)>0&&!evidenceSnippets.length){
   unresolved.push('required_specification_evidence')
  }
  return{
   requested_item_id:candidate.requestedItemId,supplier_name:candidate.supplierName,
   product_title:candidate.productTitle,source_url:candidate.sourceUrl,
   package_quantity:candidate.packageQuantity,package_unit:candidate.packageUnit,
   item_price:candidate.itemPrice,currency:candidate.currency,moq:candidate.moq,
   shipping_cost:candidate.shippingCost,delivery_estimate_days:candidate.deliveryEstimateDays,
   stock_status:candidate.stockStatus,coa_availability:candidate.coaAvailability,
   sds_availability:candidate.sdsAvailability,
   technical_document_availability:candidate.technicalDocumentAvailability,
   first_order_discount:candidate.firstOrderDiscount,source_date:candidate.sourceDate,
   evidence_snippets:evidenceSnippets,source_notes:candidate.sourceNotes,
   confidence:candidate.confidence,freshness:freshnessFromSourceDate(candidate.sourceDate),
   field_states:Object.fromEntries(candidate.evidence.map(evidence=>[evidence.field,evidence.state])),
   field_evidence:Object.fromEntries(candidate.evidence.map(evidence=>[
    evidence.field,{state:evidence.state,sourceUrl:evidence.sourceUrl,snippet:evidence.snippet},
   ])),
   is_marketplace_listing:candidate.supplierType==='marketplace',unresolved_fields:unresolved,
  }
 })
 return{partial:validated.partial,candidates}
}
