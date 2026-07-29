import { useEffect, useMemo, useRef, useState } from "react";
import { StatusPill } from "../../../components/ui/StatusPill";
import { FinishedGoodsQualityRepository, qualityEvidence } from "../data/finishedGoodsQualityRepository";
import type {
  FinishedGoodsDispositionDecision, FinishedGoodsInspectionRequirement, FinishedGoodsQualityWorkspace,
} from "../domain/finishedGoodsQuality";

export function FinishedGoodsQualityWorkspaceView({lotId}:{lotId:string}) {
  const repository=useMemo(()=>new FinishedGoodsQualityRepository(),[]);
  const [workspace,setWorkspace]=useState<FinishedGoodsQualityWorkspace>(),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const status=useRef<HTMLDivElement>(null);
  const refresh=async()=>{try{setWorkspace(await repository.workspace(lotId));setError("");}catch(cause){setError(cause instanceof Error?cause.message:"Quality workspace could not be loaded.");}};
  useEffect(()=>{void refresh();},[lotId]);
  const run=async(command:()=>Promise<unknown>)=>{setBusy(true);setError("");try{await command();await refresh();requestAnimationFrame(()=>status.current?.focus());}catch(cause){setError(cause instanceof Error?cause.message:"Quality action failed.");requestAnimationFrame(()=>status.current?.focus());}finally{setBusy(false);}};
  if(!workspace)return <section className="panel" aria-busy={!error}><h2>Finished-product quality</h2><p>{error||"Loading authoritative inspection policy…"}</p></section>;
  const {readiness,inspectionPlan,inspections,deviations,dispositionReviews,inventoryLots,openingMovements}=workspace;
  const current=new Map<string,(typeof inspections)[number]>();
  inspections.forEach(item=>{if(!current.has(item.requirement_code)||current.get(item.requirement_code)!.revision<item.revision)current.set(item.requirement_code,item);});
  return <section className="quality-workspace" aria-labelledby="quality-title">
    <div ref={status} tabIndex={-1} role="status" className="operational-notice">
      <div><h2 id="quality-title">Finished-product inspection & quality release</h2>
        <p>Policy {readiness.policyVersion} · server-authoritative · {readiness.readyForRelease?"Ready for controlled release":"Release blocked"}</p></div>
      <StatusPill tone={readiness.readyForRelease?"green":"amber"}>{readiness.readyForRelease?"Inspection passed":"Inspection required"}</StatusPill>
    </div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <section className="panel quality-quantity"><h3>Quarantine quantity accounting</h3>
      <dl><Metric label="Original" value={readiness.originalQuantity}/><Metric label="Released" value={readiness.releasedQuantity}/>
        <Metric label="Rejected" value={readiness.rejectedQuantity}/><Metric label="Held" value={readiness.heldQuantity}/>
        <Metric label="Remaining quarantine" value={readiness.remainingQuarantinedQuantity}/><Metric label="Undecided" value={readiness.undecidedQuantity}/></dl>
      <p>{readiness.originalQuantity} = {readiness.releasedQuantity} released + {readiness.rejectedQuantity} rejected + {readiness.remainingQuarantinedQuantity} remaining.</p>
    </section>
    <section className="panel"><h3>Authoritative release readiness</h3>
      <p>{readiness.passedChecks}/{readiness.mandatoryChecks} mandatory checks passed · expiry {readiness.expiryState} · genealogy {readiness.genealogyState} · cost {readiness.costState}.</p>
      {readiness.blockers.length===0?<p>No release blockers.</p>:<div className="blocker-list">{readiness.blockers.map((blocker,index)=><article key={`${blocker.blockerCode}-${index}`}>
        <strong>{blocker.blockerCode}</strong><span>{blocker.category} · {blocker.severity}</span><p>{blocker.humanMessage}</p><small>Next: {blocker.recommendedAction}</small>
      </article>)}</div>}
    </section>
    <section className="panel"><h3>Inspection plan</h3><p>Not tested, Not applicable, and Inconclusive are distinct recorded states.</p>
      <div className="inspection-grid">{inspectionPlan.requirements.map(requirement=><InspectionCard key={requirement.requirementCode}
        requirement={requirement} current={current.get(requirement.requirementCode)} revision={readiness.quarantineRevision}
        disabled={busy} record={(values)=>run(()=>repository.recordInspection({...values,target_finished_goods_lot_id:lotId,expected_quarantine_revision:readiness.quarantineRevision}))}/>)}</div>
    </section>
    <DeviationPanel disabled={busy} lotId={lotId} revision={readiness.quarantineRevision} deviations={deviations} run={run} repository={repository}/>
    <DispositionPanel disabled={busy} lotId={lotId} readiness={readiness} run={run} repository={repository}/>
    <section className="panel"><h3>Disposition history</h3>{dispositionReviews.length===0?<p>No disposition reviews recorded.</p>:<ol>{dispositionReviews.map(review=><li key={review.id}>
      <strong>{review.decision.toUpperCase()} {review.quantity} {review.unit}</strong> · review {review.review_sequence} · policy {review.policy_version}<br/><small>{review.reason} · {new Date(review.reviewed_at).toLocaleString("en-GB")}</small>
    </li>)}</ol>}</section>
    <section className="panel"><h3>Active Finished Goods inventory</h3>{inventoryLots.length===0?<p>No active inventory. Quarantine is not saleable stock.</p>:inventoryLots.map(item=>{
      const movement=openingMovements.find(candidate=>candidate.released_inventory_lot_id===item.id);
      return <article className="released-lot" key={item.id}><StatusPill tone="green">Active</StatusPill><h4>{item.consumer_batch_code} · {item.quantity_released} {item.unit}</h4>
        <p>Inventory lot <code>{item.id}</code><br/>Release review <code>{item.release_review_id}</code><br/>Opening movement <code>{movement?.id}</code></p>
        <p>{item.manufacturing_date} → {item.expiry_date} · {item.location}</p>
        <p>Cost: {item.total_cost==null?"Unknown":`${item.total_cost} ${item.currency}`} · {item.cost_confidence}</p></article>;
    })}</section>
  </section>;
}

function InspectionCard({requirement,current,revision,disabled,record}:{requirement:FinishedGoodsInspectionRequirement;current?:{id:string;result_status:string;revision:number;inspected_at:string};revision:number;disabled:boolean;record:(values:Record<string,never>)=>Promise<void>}) {
  const submit=(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();const data=new FormData(event.currentTarget),reference=String(data.get("evidence")??"").trim();
    void record({candidate_requirement_code:requirement.requirementCode,candidate_result_status:String(data.get("result")),candidate_measured_value:data.get("measured")?Number(data.get("measured")):null,
      candidate_unit:String(data.get("unit")??"")||null,candidate_textual_observation:String(data.get("note")??""),candidate_evidence:reference?qualityEvidence(reference,String(data.get("note")??"")):[],
      candidate_equipment_reference:null,candidate_method_reference:null,candidate_sample_quantity:null,candidate_inspected_at:new Date().toISOString(),
      candidate_supersedes_inspection_id:current?.id??null,candidate_idempotency_key:crypto.randomUUID()} as never);};
  return <form className="inspection-card" onSubmit={submit}><h4>{label(requirement.requirementCode)}</h4>
    <p><strong>{requirement.requirementState.replaceAll("_"," ")}</strong>{requirement.evidenceRequired?" · Evidence required":""}</p>
    <details><summary>Specification</summary><pre>{JSON.stringify(requirement.specification,null,2)}</pre></details>
    <label>Result<select name="result" defaultValue="pass"><option value="pass">Pass</option><option value="fail">Fail</option><option value="hold">Hold</option><option value="inconclusive">Inconclusive</option><option value="not_applicable">Not applicable</option><option value="not_tested">Not tested</option></select></label>
    <div className="field-row"><label>Measured value<input name="measured" inputMode="decimal"/></label><label>Unit<input name="unit"/></label></div>
    <label>Evidence reference<input name="evidence" required={requirement.evidenceRequired}/></label><label>Observation or note<textarea name="note"/></label>
    {current&&<p>Current: <strong>{current.result_status.replaceAll("_"," ")}</strong> · revision {current.revision} · {new Date(current.inspected_at).toLocaleString("en-GB")}</p>}
    <button className="button secondary" disabled={disabled} type="submit">{current?"Record superseding inspection":"Record inspection"}</button>
    <input type="hidden" value={revision}/></form>;
}

function DeviationPanel({disabled,lotId,revision,deviations,run,repository}:{disabled:boolean;lotId:string;revision:number;deviations:FinishedGoodsQualityWorkspace["deviations"];run:(command:()=>Promise<unknown>)=>Promise<void>;repository:FinishedGoodsQualityRepository}) {
  const open=(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();const d=new FormData(event.currentTarget),reference=String(d.get("evidence"));
    void run(()=>repository.openDeviation({target_finished_goods_lot_id:lotId,expected_quarantine_revision:revision,candidate_inspection_id:null,candidate_category:String(d.get("category")),candidate_severity:String(d.get("severity")),candidate_affected_quantity:Number(d.get("quantity")),candidate_unit:"pcs",candidate_description:String(d.get("description")),candidate_evidence:qualityEvidence(reference,String(d.get("description"))),candidate_disposition_impact:"Blocks release when blocking or critical",candidate_opened_at:new Date().toISOString(),candidate_idempotency_key:crypto.randomUUID()}));};
  return <section className="panel"><h3>Deviations</h3><form className="operator-form" onSubmit={open}><div className="field-row"><label>Category<input name="category" required/></label><label>Severity<select name="severity"><option value="blocking">Blocking</option><option value="non_blocking">Non-blocking</option><option value="critical">Critical</option></select></label><label>Affected quantity<input name="quantity" required inputMode="decimal"/></label></div>
    <label>Description<textarea name="description" required/></label><label>Evidence reference<input name="evidence" required/></label><button className="button secondary" disabled={disabled}>Open deviation</button></form>
    {deviations.map(item=><article key={item.id} className="deviation-card"><strong>{item.category} · {item.severity}</strong><StatusPill tone={item.status==="resolved"?"green":"red"}>{item.status.replaceAll("_"," ")}</StatusPill><p>{item.description}</p>
      {item.status==="open"&&<button className="button ghost" disabled={disabled} onClick={()=>void run(()=>repository.resolveDeviation({target_deviation_id:item.id,candidate_resolution:"Owner-reviewed corrective evidence accepted.",candidate_evidence:qualityEvidence(`resolution:${item.id}`,"Controlled owner resolution"),candidate_approval:{state:"approved",actor:"authenticated_owner"},candidate_resolved_at:new Date().toISOString(),candidate_idempotency_key:crypto.randomUUID()}))}>Resolve with controlled evidence</button>}</article>)}</section>;
}

function DispositionPanel({disabled,lotId,readiness,run,repository}:{disabled:boolean;lotId:string;readiness:FinishedGoodsQualityWorkspace["readiness"];run:(command:()=>Promise<unknown>)=>Promise<void>;repository:FinishedGoodsQualityRepository}) {
  const [decision,setDecision]=useState<FinishedGoodsDispositionDecision>("hold");
  const submit=(event:React.FormEvent<HTMLFormElement>)=>{event.preventDefault();const d=new FormData(event.currentTarget),args={target_finished_goods_lot_id:lotId,expected_quarantine_revision:readiness.quarantineRevision,candidate_quantity:Number(d.get("quantity")),candidate_unit:"pcs",candidate_reason:String(d.get("reason")),candidate_evidence:qualityEvidence(String(d.get("evidence")),String(d.get("reason"))),candidate_location:"Finished Goods",candidate_acknowledged:d.get("acknowledged")==="on",candidate_reviewed_at:new Date().toISOString(),candidate_idempotency_key:crypto.randomUUID()};
    const command=decision==="release"?repository.releaseQuantity(args):decision==="reject"?repository.rejectQuantity(args):repository.holdQuantity(args);void run(()=>command);};
  const consequence=decision==="release"?"Release creates active Finished Goods inventory and an immutable opening movement.":decision==="reject"?"Reject creates no active inventory and does not itself record destruction.":"Hold creates no active inventory or inventory movement.";
  return <section className="panel"><h3>Controlled disposition</h3><div className="segmented-actions" role="group" aria-label="Disposition decision">
    {(["hold","reject","release"] as const).map(value=><button type="button" className={`button ${decision===value?"primary":"ghost"}`} aria-pressed={decision===value} onClick={()=>setDecision(value)} key={value}>{label(value)} quantity</button>)}</div>
    <form className="operator-form" onSubmit={submit}><p><strong>{consequence}</strong></p><p>Original {readiness.originalQuantity} · released {readiness.releasedQuantity} · rejected {readiness.rejectedQuantity} · held {readiness.heldQuantity} · remaining {readiness.remainingQuarantinedQuantity}.</p>
      <label>Requested quantity<input name="quantity" required inputMode="decimal" min="0.0001" max={readiness.remainingQuarantinedQuantity}/></label><label>Reason<textarea name="reason" required/></label><label>Evidence reference<input name="evidence" required/></label>
      {(decision==="release"||decision==="reject")&&<label className="check-row"><input type="checkbox" name="acknowledged" required/>I acknowledge this controlled {decision} decision and its inventory consequence.</label>}
      {decision==="release"&&readiness.blockers.length>0&&<p className="form-error">Release is blocked by {readiness.blockers.length} authoritative policy item(s).</p>}
      <button className="button primary" disabled={disabled||(decision==="release"&&!readiness.readyForRelease)}>Confirm {label(decision)}</button></form></section>;
}
function Metric({label:caption,value}:{label:string;value:number}){return <div><dt>{caption}</dt><dd>{value}</dd></div>;}
function label(value:string){return value.replaceAll("_"," ").replace(/\b\w/g,character=>character.toUpperCase());}
