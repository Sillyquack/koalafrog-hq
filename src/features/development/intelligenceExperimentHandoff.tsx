/* eslint-disable react-refresh/only-export-components -- shared handoff builder and resolver intentionally live with the single control */
import { Link } from 'react-router-dom'
import type { IntelligenceResponse } from '../intelligence/domain/intelligenceContract'
import type { IntelligenceRunRecord, IntelligenceThreadRecord } from '../knowledge/domain/knowledge'

export type IntelligenceSourceItemType='direction'|'experiment'
export interface IntelligenceHandoffContext { workspaceId?:string;threadId?:string;runId?:string;productId?:string;formulaVersionId?:string }
export interface ResolvedIntelligenceSource {itemType:IntelligenceSourceItemType;itemId:string;name:string;objective:string;hypothesis:string;changes:Array<{materialName:string;ingredientId?:string;action:string;guidance:string;reason:string}>;observe:string[];productId?:string;formulaVersionId?:string}

export function buildExperimentReviewPath(context:IntelligenceHandoffContext,itemType:IntelligenceSourceItemType,itemId:string){
 const params=new URLSearchParams({workspaceId:context.workspaceId??'',threadId:context.threadId??'',runId:context.runId??'',sourceItemType:itemType,sourceItemId:itemId,productId:context.productId??'',formulaVersionId:context.formulaVersionId??''})
 return `/development/new?${params}`
}

export function IntelligenceHandoffControl({context,itemType,itemId}:{context?:IntelligenceHandoffContext;itemType:IntelligenceSourceItemType;itemId:unknown}){
 const provenanceReady=!!context?.workspaceId&&!!context.threadId&&!!context.runId
 const stableItemId=typeof itemId==='string'&&itemId.trim().length>0
 if(!provenanceReady||!stableItemId)return <p className="handoff-unavailable" role="status">Experiment review unavailable: this historical suggestion does not contain complete stable provenance.</p>
 return <Link className="button ghost intelligence-handoff" to={buildExperimentReviewPath(context,itemType,itemId)}>{itemType==='direction'?'Review direction as experiment':'Review suggested experiment'}</Link>
}

export function resolveIntelligenceSource(input:{workspaceId:string;activeWorkspaceId:string;threadId:string;runId:string;itemType:string;itemId:string;threads:IntelligenceThreadRecord[];runs:IntelligenceRunRecord[]}):ResolvedIntelligenceSource{
 if(input.workspaceId!==input.activeWorkspaceId)throw new Error('Source Intelligence workspace unavailable.')
 if(input.itemType!=='direction'&&input.itemType!=='experiment')throw new Error('Source Intelligence item type is invalid.')
 const thread=input.threads.find(item=>item.id===input.threadId)
 const run=input.runs.find(item=>item.id===input.runId&&item.thread_id===input.threadId&&item.status==='completed'&&item.response_payload)
 if(!thread||!run?.response_payload)throw new Error('Source Intelligence run unavailable.')
 const selection=run.context_selection,productId=typeof selection.productId==='string'?selection.productId:undefined,formulaVersionId=typeof selection.formulaVersionId==='string'?selection.formulaVersionId:undefined
 if(input.itemType==='direction'){
  const item=run.response_payload.directions.find(candidate=>typeof candidate.id==='string'&&candidate.id===input.itemId)
  if(!item)throw new Error('Source Intelligence item unavailable.')
  return{itemType:'direction',itemId:item.id,name:item.name,objective:item.intent,hypothesis:item.predictedEffect,changes:[],observe:[],productId,formulaVersionId}
 }
 const item=run.response_payload.experiments.find(candidate=>typeof candidate.id==='string'&&candidate.id===input.itemId)
 if(!item)throw new Error('Source Intelligence item unavailable.')
 return{itemType:'experiment',itemId:item.id,name:item.name,objective:'',hypothesis:item.hypothesis,changes:item.changes,observe:item.observe,productId,formulaVersionId}
}

export function responseHasStableHandoffIds(report:IntelligenceResponse){return[...report.directions,...report.experiments].every(item=>typeof item.id==='string'&&item.id.trim().length>0)}
