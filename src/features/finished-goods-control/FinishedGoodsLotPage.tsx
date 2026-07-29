import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { FinishedGoodsLotRepository } from "./data/finishedGoodsLotRepository";
import type { FinishedGoodsLotDetail } from "./domain/finishedGoodsLot";
import { FinishedGoodsQualityWorkspaceView } from "./components/FinishedGoodsQualityWorkspace";

export function FinishedGoodsLotPage(){
  const {finishedGoodsLotId}=useParams(),repository=useMemo(()=>new FinishedGoodsLotRepository(),[]),[detail,setDetail]=useState<FinishedGoodsLotDetail>(),[error,setError]=useState("");
  useEffect(()=>{if(finishedGoodsLotId)void repository.load(finishedGoodsLotId).then(setDetail).catch((cause)=>setError(cause instanceof Error?cause.message:"Lot could not be loaded."));},[finishedGoodsLotId,repository]);
  if(!detail)return <div className="empty-state"><h1>{error||"Loading Finished Goods Lot…"}</h1></div>;
  const {lot,quarantine,genealogy}=detail,packaging=(genealogy.packagingRun??{}) as Record<string,unknown>;
  const raw=Array.isArray(genealogy.rawMaterialConsumptions)?genealogy.rawMaterialConsumptions:[],packagingUses=Array.isArray(packaging.inventoryUses)?packaging.inventoryUses:[];
  return <><Link className="back-link" to="/finished-goods"><ArrowLeft size={14}/>Finished Goods</Link>
    <PageHeader eyebrow="Traceable Finished Goods Lot" title={lot.consumer_batch_code} description="Immutable identity with server-controlled inspection, disposition, and quality release."/>
    <section className="batch-source"><div><span>Status</span><StatusPill tone="amber">Inspection required</StatusPill></div>
      <div><span>Internal lot</span><strong>{lot.internal_lot_code}</strong></div><div><span>Quantity</span><strong>{lot.quantity} {lot.unit}</strong></div>
      <div><span>Manufactured / expiry</span><strong>{lot.manufacturing_date} / {lot.expiry_date??"Unknown"}</strong></div></section>
    <div className="batch-detail-grid"><Snapshot title="Product snapshot" value={lot.product_snapshot}/><Snapshot title="Formula snapshot" value={lot.formula_snapshot}/>
      <Snapshot title="Packaging snapshot" value={lot.packaging_snapshot}/><Snapshot title="Intended label snapshot" value={lot.label_snapshot}/>
      <Snapshot title="Historical cost snapshot" value={lot.cost_snapshot}/><Snapshot title="Quarantine" value={quarantine}/></div>
    <section className="panel"><h2>Backward genealogy</h2><p>Finished Goods Lot → Packaging Run → Production Output → Production Batch → Formula Version → physical lots.</p>
      <h3>Raw-material lots</h3><ul>{raw.map((item,index)=><li key={index}>{String((item as Record<string,unknown>).inventoryLotId)} · movement {String((item as Record<string,unknown>).movementId)}</li>)}</ul>
      <h3>Packaging lots</h3><ul>{packagingUses.map((item,index)=><li key={index}>{String((item as Record<string,unknown>).packaging_inventory_lot_id)} · movement {String((item as Record<string,unknown>).packaging_inventory_movement_id)}</li>)}</ul>
      <details><summary>Technical genealogy</summary><pre>{JSON.stringify(genealogy,null,2)}</pre></details></section>
    <FinishedGoodsQualityWorkspaceView lotId={lot.id}/>
    <section className="panel"><h2>Audit history</h2><ol>{detail.events.map((event)=><li key={String(event.id)}>{String(event.event_type)} · {new Date(String(event.occurred_at)).toLocaleString("en-GB")}</li>)}</ol></section>
  </>;
}
function Snapshot({title,value}:{title:string;value:Record<string,unknown>}){return <section className="panel"><h2>{title}</h2><dl>{Object.entries(value).map(([key,item])=><div key={key}><dt>{key}</dt><dd>{typeof item==="object"?JSON.stringify(item):String(item??"Unknown")}</dd></div>)}</dl></section>;}
