import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { FinishedGoodsInventoryRepository, inventoryEvidence } from "./data/finishedGoodsInventoryRepository";
import type { FinishedGoodsInventoryOperationType, FinishedGoodsInventoryWorkspace } from "./domain/finishedGoodsInventory";

const actionLabels: Record<FinishedGoodsInventoryOperationType, string> = {
  internal_transfer: "Internal transfer", hold: "Place hold", release_hold: "Release hold", block: "Block",
  unblock: "Unblock", damage_pending: "Record damage", damage_writeoff: "Write off damage",
  loss_writeoff: "Record loss", destruction_writeoff: "Record destruction",
  controlled_negative_adjustment: "Negative adjustment", controlled_positive_correction: "Positive correction",
};

export function FinishedGoodsInventoryPage() {
  const { releasedInventoryLotId = "" } = useParams(), repository = useMemo(() => new FinishedGoodsInventoryRepository(), []);
  const [workspace, setWorkspace] = useState<FinishedGoodsInventoryWorkspace>(), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void repository.workspace(releasedInventoryLotId).then(result => { if (active) { setWorkspace(result); setError(""); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Inventory could not be loaded."); });
    return () => { active = false; };
  }, [releasedInventoryLotId, repository]);
  if (!workspace) return <main><Link className="back-link" to="/finished-goods"><ArrowLeft size={14}/>Finished Goods</Link><p role="alert">{error || "Loading active inventory…"}</p></main>;
  const { snapshot } = workspace;
  const operate = async (input: Parameters<FinishedGoodsInventoryRepository["operate"]>[0]) => {
    setBusy(true); try { const result = await repository.operate(input); setWorkspace(result.workspace); setError(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Operation failed."); } finally { setBusy(false); }
  };
  return <main className="finished-goods-inventory">
    <Link className="back-link" to={`/finished-goods-lots/${snapshot.lot.finished_goods_lot_id}`}><ArrowLeft size={14}/>Quality release</Link>
    <header className="page-header"><div><span className="eyebrow">Active Finished Goods inventory · policy {snapshot.policyVersion}</span>
      <h1>{snapshot.lot.consumer_batch_code}</h1><p>{snapshot.lot.internal_lot_code} · revision {snapshot.revision}</p></div>
      <strong>{snapshot.eligible ? "Eligible" : "Unavailable"}</strong></header>
    <p><Link className="button secondary" to={`/traceability?type=released_finished_goods_inventory_lot&id=${snapshot.lot.id}`}>Open canonical Traceability</Link></p>
    {error && <p role="alert" className="form-error">{error}</p>}
    <section className="panel"><h2>Authoritative balance</h2><div className="stat-grid">
      <Metric label="On-hand" value={snapshot.onHandQuantity}/><Metric label="Available" value={snapshot.availableQuantity}/>
      <Metric label="Reserved boundary" value={snapshot.reservedQuantity}/><Metric label="Held" value={snapshot.heldQuantity}/>
      <Metric label="Blocked" value={snapshot.blockedQuantity}/><Metric label="Damaged" value={snapshot.damagedQuantity}/>
      <Metric label="Lost" value={snapshot.lostQuantity}/><Metric label="Destroyed" value={snapshot.destroyedQuantity}/>
    </div><p>{snapshot.lot.unit} · Expiry {snapshot.lot.expiry_date} · <strong>{snapshot.expiryState.replace("_", " ")}</strong></p>
      {snapshot.blockers.map(item => <p key={item.code}><strong>{item.code}</strong> — {item.message}</p>)}</section>
    <section className="panel"><h2>Locations and valuation</h2>
      {snapshot.locations.map(item => <p key={item.location}><strong>{item.location}</strong> · {item.quantity} {snapshot.lot.unit}</p>)}
      <p><strong>{snapshot.valuation.state}</strong> · {snapshot.valuation.totalCost ?? "Unknown"} {snapshot.valuation.currency ?? ""} total · {snapshot.valuation.unitCost ?? "Unknown"} per unit</p>
      <p>FEFO: expiry, release, manufacture, then inventory-lot ID. Downstream reservation is <strong>not implemented</strong>; readiness: {snapshot.reservationBoundary.downstreamReady ? "Ready" : "Blocked"}.</p></section>
    <OperationForm snapshot={snapshot} movements={workspace.movements} disabled={busy} submit={operate}/>
    <section className="panel"><h2>Immutable movement history</h2>{workspace.movements.map(item => <article key={String(item.id)} className="released-lot">
      <strong>{String(item.movement_type).replaceAll("_", " ")}</strong><p>{String(item.normalized_quantity)} {String(item.unit)} · {String(item.occurred_at)}</p><code>{String(item.id)}</code>
    </article>)}</section>
    <section className="panel"><h2>Release provenance</h2><p>Opening movement and full batch genealogy remain linked and unchanged.</p>
      <pre>{JSON.stringify(workspace.genealogy, null, 2)}</pre></section>
  </main>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }

function OperationForm({ snapshot, movements, disabled, submit }: { snapshot: FinishedGoodsInventoryWorkspace["snapshot"];
  movements: Record<string, unknown>[]; disabled: boolean; submit: (input: Parameters<FinishedGoodsInventoryRepository["operate"]>[0]) => Promise<void> }) {
  const [type, setType] = useState<FinishedGoodsInventoryOperationType>("internal_transfer"), [quantity, setQuantity] = useState(1);
  const [from, setFrom] = useState(snapshot.locations[0]?.location ?? snapshot.lot.location), [to, setTo] = useState("Finished Goods / Secondary");
  const [reason, setReason] = useState(""), [related, setRelated] = useState("");
  const negative = movements.filter(item => ["damage_writeoff","loss_writeoff","destruction_writeoff","controlled_negative_adjustment"].includes(String(item.movement_type)));
  const confirm = async () => {
    if (!window.confirm(`${actionLabels[type]}: ${quantity} ${snapshot.lot.unit}. This appends immutable audit history. Continue?`)) return;
    await submit({ lotId: snapshot.lot.id, revision: snapshot.revision, type, quantity, unit: snapshot.lot.unit, fromLocation: from || undefined,
      toLocation: to || undefined, reason, evidence: inventoryEvidence(`operator-${Date.now()}`, reason), relatedRecordId: related || undefined });
    setReason("");
  };
  return <section className="panel"><h2>Controlled operation</h2>
    <label>Action<select value={type} onChange={event => setType(event.target.value as FinishedGoodsInventoryOperationType)}>
      {Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>Quantity<input type="number" min="0.000001" step="any" value={quantity} onChange={event => setQuantity(Number(event.target.value))}/></label>
    {type === "internal_transfer" && <><label>From location<select value={from} onChange={event => setFrom(event.target.value)}>
      {snapshot.locations.map(item => <option key={item.location}>{item.location}</option>)}</select></label><label>To location<input value={to} onChange={event => setTo(event.target.value)}/></label></>}
    {["damage_writeoff","loss_writeoff","destruction_writeoff","controlled_negative_adjustment"].includes(type) &&
      <label>Physical location<select value={from} onChange={event => setFrom(event.target.value)}>{snapshot.locations.map(item => <option key={item.location}>{item.location}</option>)}</select></label>}
    {type === "controlled_positive_correction" && <label>Prior negative movement<select required value={related} onChange={event => setRelated(event.target.value)}>
      <option value="">Select correction basis</option>{negative.map(item => <option key={String(item.id)} value={String(item.id)}>{String(item.movement_type)} · {String(item.id)}</option>)}</select></label>}
    <label>Reason and evidence<input required minLength={4} value={reason} onChange={event => setReason(event.target.value)} placeholder="Document the physical finding"/></label>
    <button className="button primary" disabled={disabled || quantity <= 0 || reason.trim().length < 4 || (type === "controlled_positive_correction" && !related)} onClick={() => void confirm()}>
      {disabled ? "Recording…" : `Confirm ${actionLabels[type].toLowerCase()}`}</button></section>;
}
