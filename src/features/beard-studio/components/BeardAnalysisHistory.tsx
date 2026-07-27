import {useEffect,useRef,useState}from'react'
import {Clipboard,ExternalLink}from'lucide-react'
import {listBeardAnalysisHistory,reopenBeardAnalysis,type BeardAnalysisHistoryItem,type ReopenedBeardAnalysis}from'../../../intelligence/Vision/beardPhotoClient'
import type{BeardStudioState}from'../../../types/beardStudio'
import{targetStyleLabel}from'../domain/beardPhotoIntelligenceV2'
import{BeardPhotoReview}from'./BeardPhotoAnalysisFlow'
import{BeardPhotoSupportDiagnosticPanel}from'./BeardPhotoSupportDiagnosticPanel'

export function BeardAnalysisHistory({workspaceId,state}:{workspaceId?:string;state:BeardStudioState}) {
 const[items,setItems]=useState<BeardAnalysisHistoryItem[]>([]),[opened,setOpened]=useState<ReopenedBeardAnalysis>(),[loading,setLoading]=useState(false),[error,setError]=useState('')
 const reopenedRef=useRef<HTMLDivElement>(null)
 const load=async(before?:Pick<BeardAnalysisHistoryItem,'createdAt'|'analysisId'>)=>{if(!workspaceId)return;setLoading(true);try{const next=await listBeardAnalysisHistory(workspaceId,before,20);setItems(current=>before?[...current,...next.filter(item=>!current.some(existing=>existing.analysisId===item.analysisId))]:next)}catch{setError('Analysis history could not be loaded.')}finally{setLoading(false)}}
 useEffect(()=>{if(!workspaceId)return;let active=true;void listBeardAnalysisHistory(workspaceId,undefined,20).then(next=>{if(active)setItems(next)}).catch(()=>{if(active)setError('Analysis history could not be loaded.')});return()=>{active=false}},[workspaceId]) // bounded owner-safe metadata RPC; no image access
 useEffect(()=>{if(opened?.analysisId)reopenedRef.current?.scrollIntoView({block:'start'})},[opened?.analysisId])
 const open=async(id:string)=>{if(!workspaceId)return;setOpened(undefined);setLoading(true);try{setOpened(await reopenBeardAnalysis(workspaceId,id))}catch{setError('The persisted analysis could not be reopened.')}finally{setLoading(false)}}
 const result=opened?.result&&opened.decisions?{...opened.result,recommendations:opened.result.recommendations.map(item=>({...item,status:opened.decisions?.find(decision=>decision.recommendationId===item.id)?.status??item.status}))}:opened?.result
 const openedTarget=opened?.targetStyle===undefined?null:opened.targetStyle
 return <section className="beard-analysis-history panel" aria-labelledby="analysis-history-title"><header><div><span className="eyebrow">Photo analysis history</span><h3 id="analysis-history-title">Completed and failed analyses</h3><p>Owner-safe metadata only. Photos are never loaded for this list or when reopening a result.</p></div></header>
  {error&&<p className="form-error" role="alert">{error}</p>}
  <div className="analysis-history-list">{items.map(item=><article key={item.analysisId}><div><strong>{new Date(item.createdAt).toLocaleString()}</strong><span className="history-status">{item.status.replaceAll('_',' ')}</span></div><p>{item.status==='failed'?(item.failureCategory??'Safe failure details available'):item.overallSummary??'Complete analysis — finish review to save a concise summary.'}</p><dl><div><dt>Target</dt><dd>{targetStyleLabel(item.targetStyle)}</dd></div><div><dt>Review</dt><dd>{item.acceptedCount} accepted · {item.undecidedCount} undecided · {item.dismissedCount} dismissed</dd></div><div><dt>Photo quality</dt><dd>{item.photoQuality??'Unknown'}</dd></div><div><dt>Cleanup</dt><dd>{item.cleanupState}</dd></div></dl><div className="history-actions"><button className="button" onClick={()=>void open(item.analysisId)}><ExternalLink/>Open analysis</button><button className="button" aria-label={`Copy support ID ${item.supportId}`} onClick={()=>void navigator.clipboard.writeText(item.supportId)}><Clipboard/>Copy support ID</button></div></article>)}</div>
  {!items.length&&!loading&&<p className="muted">No persisted analyses yet.</p>}
  {items.length>0&&items.length%20===0&&<button className="button" disabled={loading} onClick={()=>{const last=items.at(-1);if(last)void load(last)}}>Load older analyses</button>}
  {loading&&<p role="status">Loading analysis history…</p>}
  {opened?.status==='failed'&&workspaceId&&<div className="history-reopen"><h3>Failed analysis diagnostics</h3><BeardPhotoSupportDiagnosticPanel workspaceId={workspaceId} supportId={opened.supportId}/></div>}
  {result&&opened?.status!=='failed'&&<div className="history-reopen" ref={reopenedRef}><button className="button" onClick={()=>setOpened(undefined)}>Close reopened analysis</button><BeardPhotoReview result={result} target={openedTarget} persistedSummary={opened?.summarySnapshot} persistedPlan={opened?.trimPlanSnapshot} tool={state.tools.find(item=>item.primary&&item.status==='active')} workspaceId={workspaceId} onReview={async(item,status)=>{if(!opened)return;setOpened({...opened,summarySnapshot:null,trimPlanSnapshot:null,decisions:(opened.decisions??[]).map(decision=>decision.recommendationId===item.id?{...decision,status}:decision)})}} onClose={()=>setOpened(undefined)}/></div>}
 </section>
}
