import { Check, RefreshCw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FinishedGoodsLotRepository } from "../data/finishedGoodsLotRepository";
import type { FinishedGoodsLot, FinishedGoodsReadiness } from "../domain/finishedGoodsLot";

export function FinishedGoodsHandoff({ packagingRunId, packagingRunRevision }: { packagingRunId: string; packagingRunRevision: number }) {
  const repository = useMemo(() => new FinishedGoodsLotRepository(), []);
  const [readiness, setReadiness] = useState<FinishedGoodsReadiness>();
  const [lots, setLots] = useState<FinishedGoodsLot[]>([]);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const keys = useRef(new Map<string,string>());
  const keyFor = (payload: unknown) => {
    const fingerprint = JSON.stringify(payload), existing = keys.current.get(fingerprint);
    if (existing) return existing;
    const key = crypto.randomUUID(); keys.current.set(fingerprint,key); return key;
  };
  const refresh = useCallback(async () => {
    try {
      const [nextReadiness,nextLots] = await Promise.all([repository.readiness(packagingRunId),repository.lotsByRun(packagingRunId)]);
      setReadiness(nextReadiness); setLots(nextLots); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Finished Goods handoff could not be loaded."); }
  },[packagingRunId,repository]);
  useEffect(() => { const task=window.setTimeout(()=>void refresh(),0);return()=>window.clearTimeout(task); },[refresh]);
  const act = async (label:string,payload:unknown,operation:(key:string)=>Promise<unknown>) => {
    setPending(label);setError("");
    try { await operation(keyFor(payload));keys.current.delete(JSON.stringify(payload));await refresh(); }
    catch(cause){setError(cause instanceof Error?cause.message:`${label} failed.`);}
    finally{setPending("");}
  };
  if(!readiness)return <p>{error||"Loading Finished Goods readiness…"}</p>;
  return <section className="finished-goods-handoff" aria-label="Finished Goods Lot creation and quarantine">
    <header><div><span className="eyebrow">Slice 3 · quarantine boundary</span><h4>Packaged output and Finished Goods Lots</h4>
      <p>Creating a Finished Goods Lot places it in quarantine. It does not create saleable inventory.</p></div>
      <button className="button ghost" onClick={()=>void refresh()} disabled={Boolean(pending)}><RefreshCw size={14}/>Refresh</button></header>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <dl className="material-totals">
      <div><dt>Total packaged</dt><dd>{readiness.totalPackagedQuantity} {readiness.unit}</dd></div>
      <div><dt>Accepted</dt><dd>{readiness.acceptedQuantity} {readiness.unit}</dd></div>
      <div><dt>Rejected / damaged</dt><dd>{readiness.rejectedQuantity} / {readiness.damagedQuantity}</dd></div>
      <div><dt>Samples / retention</dt><dd>{readiness.sampleQuantity} / {readiness.retentionQuantity}</dd></div>
      <div><dt>Converted</dt><dd>{readiness.convertedQuantity} {readiness.unit}</dd></div>
      <div><dt>Remaining accepted</dt><dd>{readiness.remainingAcceptedQuantity} {readiness.unit}</dd></div>
    </dl>
    <aside className="operational-notice"><ShieldAlert size={17}/><div><strong>{readiness.readyForLotCreation?"Ready for quarantined lot creation":readiness.conversionCompleted?"Accepted output fully converted":"Lot creation blocked"}</strong>
      <p>Policy {readiness.policyVersion} · cost {readiness.costState}</p></div></aside>
    {readiness.blockers.length>0&&<ul>{readiness.blockers.map((blocker)=><li key={blocker.blockerCode}><b>{blocker.blockerCode}</b> · {blocker.humanMessage}</li>)}</ul>}
    <ReconciliationForm revision={packagingRunRevision} pending={pending} onSubmit={(input)=>act("Recording packaged output",input,(key)=>repository.recordReconciliation({
      target_packaging_run_id:packagingRunId,expected_run_revision:packagingRunRevision,
      candidate_total_packaged_quantity:input.total,candidate_accepted_quantity:input.accepted,candidate_rejected_quantity:input.rejected,
      candidate_damaged_quantity:input.damaged,candidate_sample_quantity:input.samples,candidate_retention_quantity:input.retention,
      candidate_unresolved_variance:input.variance,candidate_unit:"pcs",candidate_evidence_reference:input.evidence,
      candidate_note:input.note,candidate_recorded_at:new Date().toISOString(),candidate_idempotency_key:key,
    }))}/>
    {readiness.readyForLotCreation&&<LotForm readiness={readiness} revision={packagingRunRevision} pending={pending} onSubmit={(input)=>act("Creating quarantined Finished Goods Lot",input,(key)=>repository.createLot({
      target_packaging_run_id:packagingRunId,expected_run_revision:packagingRunRevision,candidate_quantity:input.quantity,candidate_unit:readiness.unit,
      candidate_internal_lot_code:input.internalCode,candidate_consumer_batch_code:input.batchCode,candidate_lot_label:input.label,
      candidate_manufacturing_date:input.manufacturingDate,candidate_shelf_life_basis:input.shelfLifeBasis,
      candidate_shelf_life_duration:input.shelfLifeDuration,candidate_shelf_life_unit:input.shelfLifeUnit,
      candidate_expiry_override:null,candidate_expiry_override_reason:"",candidate_expiry_override_evidence:"",
      candidate_pao_value:input.paoValue,candidate_pao_unit:input.paoUnit,candidate_location:input.location,
      candidate_manual_code_override:Boolean(input.batchCode),candidate_code_override_reason:input.batchCode?"Owner-assigned consumer batch code":"",
      candidate_code_override_evidence:input.batchCode?"operator:acknowledgement":"",candidate_acknowledged:input.acknowledged,
      candidate_created_at:new Date().toISOString(),candidate_idempotency_key:key,
    }))}/>}
    <div className="finished-goods-lot-list">{lots.map((lot)=><article key={lot.id}><div><span className="eyebrow">{lot.internal_lot_code}</span><h4>{lot.consumer_batch_code}</h4>
      <p>{lot.quantity} {lot.unit} · manufactured {lot.manufacturing_date} · {lot.expiry_date?`expires ${lot.expiry_date}`:"expiry Unknown"}</p></div>
      <strong>Inspection required</strong><Link className="button secondary" to={`/finished-goods-lots/${lot.id}`}>Open genealogy</Link></article>)}</div>
  </section>;
}

function ReconciliationForm({revision,pending,onSubmit}:{revision:number;pending:string;onSubmit:(input:{total:number;accepted:number;rejected:number;damaged:number;samples:number;retention:number;variance:number;evidence:string;note:string})=>void}){
  return <details><summary>Record packaged-output reconciliation</summary><form onSubmit={(event)=>{event.preventDefault();const d=new FormData(event.currentTarget);onSubmit({
    total:Number(d.get("total")),accepted:Number(d.get("accepted")),rejected:Number(d.get("rejected")),damaged:Number(d.get("damaged")),
    samples:Number(d.get("samples")),retention:Number(d.get("retention")),variance:Number(d.get("variance")),evidence:String(d.get("evidence")),note:String(d.get("note"))});}}>
    <p>Equation: total = accepted + rejected + damaged + samples + retention + unresolved variance. Revision {revision}.</p>
    {["total","accepted","rejected","damaged","samples","retention","variance"].map((name)=><label key={name}>{name[0].toUpperCase()+name.slice(1)}<input name={name} type="number" min="0" step="1" defaultValue={name==="total"||name==="accepted"?"0":"0"} required/></label>)}
    <label>Evidence<input name="evidence"/></label><label>Note<input name="note"/></label>
    <button className="button secondary" disabled={Boolean(pending)}>Record authoritative reconciliation</button>
  </form></details>;
}

function LotForm({readiness,pending,onSubmit}:{readiness:FinishedGoodsReadiness;revision:number;pending:string;onSubmit:(input:{quantity:number;internalCode:string;batchCode:string;label:string;manufacturingDate:string;shelfLifeBasis:string;shelfLifeDuration:number|null;shelfLifeUnit:string|null;paoValue:number|null;paoUnit:string|null;location:string;acknowledged:boolean})=>void}){
  return <details><summary>Create Finished Goods Lot</summary><form onSubmit={(event)=>{event.preventDefault();const d=new FormData(event.currentTarget),duration=Number(d.get("shelfLifeDuration")),pao=Number(d.get("paoValue"));onSubmit({
    quantity:Number(d.get("quantity")),internalCode:String(d.get("internalCode")),batchCode:String(d.get("batchCode")),label:String(d.get("label")),
    manufacturingDate:String(d.get("manufacturingDate")),shelfLifeBasis:String(d.get("shelfLifeBasis")),shelfLifeDuration:duration||null,
    shelfLifeUnit:duration?String(d.get("shelfLifeUnit")):null,paoValue:pao||null,paoUnit:pao?String(d.get("paoUnit")):null,
    location:String(d.get("location")),acknowledged:d.get("acknowledged")==="on"});}}>
    <p>Available accepted quantity: <b>{readiness.remainingAcceptedQuantity} {readiness.unit}</b>. Cost state: {readiness.costState}.</p>
    <label>Lot quantity<input name="quantity" type="number" min="1" step="1" max={readiness.remainingAcceptedQuantity} required/></label>
    <label>Internal lot code (optional)<input name="internalCode" pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,63}"/></label>
    <label>Consumer batch code (optional)<input name="batchCode" pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}"/></label>
    <label>Lot label<input name="label" required defaultValue="Quarantined packaged product"/></label>
    <label>Manufacturing date<input name="manufacturingDate" type="date" required defaultValue={new Date().toISOString().slice(0,10)}/></label>
    <label>Shelf-life basis<input name="shelfLifeBasis" required defaultValue="Unknown — inspection review required"/></label>
    <label>Shelf-life duration (optional)<input name="shelfLifeDuration" type="number" min="1"/></label>
    <label>Shelf-life unit<select name="shelfLifeUnit"><option value="months">months</option><option value="days">days</option><option value="years">years</option></select></label>
    <label>PAO value (optional)<input name="paoValue" type="number" min="1"/></label>
    <label>PAO unit<select name="paoUnit"><option value="months">months</option><option value="days">days</option><option value="years">years</option></select></label>
    <label>Quarantine location<input name="location" required defaultValue="Finished Goods Quarantine"/></label>
    <label><input name="acknowledged" type="checkbox" required/>This creates an immutable Finished Goods Lot in quarantine. It does not release inventory for sale.</label>
    <button className="button primary" disabled={Boolean(pending)}><Check size={14}/>Create quarantined Finished Goods Lot</button>
  </form></details>;
}
