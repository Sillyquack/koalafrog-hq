import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { GitBranch, Search } from "lucide-react";
import { TraceabilityRepository } from "./data/traceabilityRepository";
import type { BackwardGenealogy, ForwardTrace, TraceabilityIntegrityResult, TraceabilitySearchResult } from "./domain/traceability";

type TraceResult = { kind: "backward"; value: BackwardGenealogy; integrity: TraceabilityIntegrityResult }
  | { kind: "forward"; value: ForwardTrace }
  | { kind: "technical"; value: Record<string, unknown> };

export function TraceabilityPage() {
  const repository = useMemo(() => new TraceabilityRepository(), []), [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? ""), [results, setResults] = useState<TraceabilitySearchResult[]>([]);
  const [trace, setTrace] = useState<TraceResult>(), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const status = useRef<HTMLDivElement>(null), selectedType = params.get("type"), selectedId = params.get("id");
  const open = async (type: string, id: string) => {
    setBusy(true); setError("");
    try {
      if (type === "finished_goods_lot") {
        const [value, integrity] = await Promise.all([repository.backward(id), repository.integrity(id)]);
        setTrace({ kind: "backward", value, integrity });
      } else if (type === "released_finished_goods_inventory_lot") {
        const [value, integrity] = await Promise.all([repository.backward(undefined, id), repository.integrity(undefined, id)]);
        setTrace({ kind: "backward", value, integrity });
      } else if (type === "raw_material_inventory_lot") setTrace({ kind: "forward", value: await repository.rawMaterialForward(id) });
      else if (type === "packaging_inventory_lot") setTrace({ kind: "forward", value: await repository.packagingForward(id) });
      else if (type === "production_batch") setTrace({ kind: "technical", value: await repository.productionBatch(id) });
      else if (type === "packaging_run") setTrace({ kind: "technical", value: await repository.packagingRun(id) });
      else throw new Error("This identity has no direct trace action.");
      setParams(current => {
        const next = new URLSearchParams(current);
        next.set("type", type);
        next.set("id", id);
        return next;
      });
      requestAnimationFrame(() => status.current?.focus());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Traceability could not be loaded."); requestAnimationFrame(() => status.current?.focus()); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!selectedType || !selectedId) return;
    let active = true;
    const load = async () => {
      try {
        let next: TraceResult;
        if (selectedType === "finished_goods_lot") {
          const [value, integrity] = await Promise.all([repository.backward(selectedId), repository.integrity(selectedId)]);
          next = { kind: "backward", value, integrity };
        } else if (selectedType === "released_finished_goods_inventory_lot") {
          const [value, integrity] = await Promise.all([repository.backward(undefined, selectedId), repository.integrity(undefined, selectedId)]);
          next = { kind: "backward", value, integrity };
        } else if (selectedType === "raw_material_inventory_lot") next = { kind: "forward", value: await repository.rawMaterialForward(selectedId) };
        else if (selectedType === "packaging_inventory_lot") next = { kind: "forward", value: await repository.packagingForward(selectedId) };
        else if (selectedType === "production_batch") next = { kind: "technical", value: await repository.productionBatch(selectedId) };
        else if (selectedType === "packaging_run") next = { kind: "technical", value: await repository.packagingRun(selectedId) };
        else return;
        if (active) setTrace(next);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Traceability could not be reconstructed."); }
    };
    void load(); return () => { active = false; };
  }, [repository, selectedId, selectedType]);
  const search = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { const found = await repository.search(query); setResults(found); setParams({ q: query }); requestAnimationFrame(() => status.current?.focus()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Search failed."); } finally { setBusy(false); }
  };
  return <main className="traceability-workspace">
    <header className="page-header"><div><span className="eyebrow">Finished Goods & Batch Genealogy V1 · Slice 6</span>
      <h1>Traceability</h1><p>Read-only backward genealogy, forward lot impact, current inventory, and integrity.</p></div><GitBranch aria-hidden="true"/></header>
    <form className="panel operator-form" role="search" onSubmit={search}><h2>Search traceability</h2>
      <label>Batch, run, output, or lot code<input autoFocus value={query} onChange={event => setQuery(event.target.value)}
        placeholder="Consumer batch, internal lot, supplier lot, Production Batch…"/></label>
      <button className="button primary" disabled={busy || query.trim().length < 2}><Search size={15}/>{busy ? "Searching…" : "Search exact identities"}</button></form>
    <div ref={status} tabIndex={-1} role="status">{error && <p className="form-error" role="alert">{error}</p>}</div>
    {results.length > 0 && <section className="panel"><h2>Exact and controlled-prefix results</h2><div className="trace-search-results">
      {results.map(item => <article key={`${item.identityType}-${item.immutableId}`}><span className="eyebrow">{label(item.identityType)}</span>
        <h3>{item.code}</h3><p>{item.product || "Historical identity"} · {item.status}</p>
        <p>{item.quantity ?? "Quantity unavailable"} {item.unit ?? ""} · {item.location ?? "No current location"} · expiry {item.expiryDate ?? "Not applicable"}</p>
        <button className="button secondary" onClick={() => void open(item.identityType, item.immutableId)}>Open {item.availableActions[0]?.replaceAll("_", " ") ?? "trace"}</button></article>)}
    </div></section>}
    {trace?.kind === "backward" && <BackwardView trace={trace.value} integrity={trace.integrity} open={open}/>}
    {trace?.kind === "forward" && <ForwardView trace={trace.value}/>}
    {trace?.kind === "technical" && <TechnicalView value={trace.value}/>}
  </main>;
}

function BackwardView({ trace, integrity, open }: { trace: BackwardGenealogy; integrity: TraceabilityIntegrityResult; open: (type: string, id: string) => Promise<void> }) {
  return <div className="trace-result">
    <section className="panel"><h2>Overview</h2><p><strong>{trace.root.code}</strong> · Backward genealogy · policy {trace.policyVersion}</p>
      <p>Confidence: <strong>{label(trace.confidence.state)}</strong> · fingerprint <code>{trace.fingerprint}</code></p>
      <p>This is a read-only reconstruction. It creates no recall, block, reservation, shipment, or allocation.</p>
      <Link className="button secondary" to={`/recall-readiness?sourceType=${trace.root.nodeType}&sourceId=${encodeURIComponent(trace.root.immutableId)}`}>Assess recall readiness</Link></section>
    <section className="panel"><h2>Backward genealogy</h2><ol className="trace-node-list">{trace.nodes.map(node => <li key={`${node.nodeType}-${node.immutableId}`}>
      <div><span className="eyebrow">{label(node.nodeType)}</span><strong>{node.historicalLabel || node.immutableId}</strong>
        <p>{node.lifecycleStatus || node.relationshipState} · {node.quantity ?? "Quantity unavailable"} {node.unit ?? ""}</p></div>
      <details><summary>Technical and snapshot detail</summary><code>{node.immutableId}</code><pre>{JSON.stringify(node.snapshot ?? node.metadata, null, 2)}</pre></details>
    </li>)}</ol></section>
    <section className="panel"><h2>Raw-material lots</h2>{trace.rawMaterialLots.map(node => <article key={node.immutableId}>
      <h3>{node.historicalLabel}</h3><p>Exact consumed quantity: {node.quantity} {node.unit}</p>
      <button className="button secondary" onClick={() => void open("raw_material_inventory_lot", node.immutableId)}>Open forward trace</button></article>)}</section>
    <section className="panel"><h2>Packaging lots</h2>{trace.packagingLots.map(node => <article key={node.immutableId}>
      <h3>{node.historicalLabel}</h3><p>{String(node.snapshot?.componentRole ?? "other")} · Exact consumed quantity: {node.quantity} {node.unit}</p>
      <button className="button secondary" onClick={() => void open("packaging_inventory_lot", node.immutableId)}>Open forward trace</button></article>)}</section>
    <section className="panel"><h2>Current inventory impact</h2>{trace.releasedInventory.length === 0 ? <p>Not yet applicable — no released inventory tranche.</p> :
      trace.releasedInventory.map((item, index) => <InventoryImpact key={String((item.lot as Record<string, unknown>)?.id ?? index)} item={item}/>)}</section>
    <section className="panel"><h2>Quantities</h2><p>Raw-material and packaging usage are exact direct quantities. Finished Goods and release quantities are exact identities. Cross-level mass-to-unit attribution is <strong>unknown</strong>, never presented as exact.</p></section>
    <section className="panel"><h2>Integrity</h2><p>{integrity.findingCount} finding(s).</p>{integrity.findings.length === 0 ? <p>No required-link gaps detected.</p> :
      integrity.findings.map((gap, index) => <article key={`${gap.expectedNodeType}-${index}`}><strong>{label(gap.state)} · {gap.expectedNodeType}</strong><p>{gap.reason}</p></article>)}</section>
    <section className="panel"><h2>Technical audit</h2><details><summary>Nodes, edges, procurement, quality, and snapshot contract</summary>
      <pre>{JSON.stringify({ edges: trace.edges, procurement: trace.procurementProvenance, quality: trace.quality, snapshot: trace }, null, 2)}</pre></details></section>
  </div>;
}

function ForwardView({ trace }: { trace: ForwardTrace }) {
  return <div className="trace-result"><section className="panel"><h2>Forward trace</h2>
    <p><strong>{String(trace.source.code)}</strong> · {label(String(trace.source.nodeType))}</p>
    <p>Confidence: <strong>{label(trace.confidence.state)}</strong> · {trace.distinctAffectedFinishedGoodsCount} distinct affected Finished Goods lot(s)</p>
    <Link className="button secondary" to={`/recall-readiness?sourceType=${String(trace.source.nodeType)}&sourceId=${encodeURIComponent(String(trace.source.immutableId))}`}>Assess recall readiness</Link></section>
    <section className="panel"><h2>Affected Finished Goods</h2>{trace.affectedFinishedGoods.length === 0 ? <p>Not yet applicable — no productive downstream identity.</p> :
      trace.affectedFinishedGoods.map(item => <article key={item.finishedGoodsLotId}><span className="eyebrow">Consumer batch</span><h3>{item.consumerBatchCode}</h3>
        <p>Exact consumed quantity: {item.exactConsumedQuantity} {item.consumedUnit}</p><p>Exact Finished Goods Lot quantity: {item.exactFinishedGoodsLotQuantity} {item.unit}</p>
        {item.componentRole && <p>Packaging role: {item.componentRole}</p>}<p>Production Batch {item.productionBatchId} → Packaging Run {item.packagingRunId}</p>
        {item.currentInventoryImpact.map((impact, index) => <InventoryImpact key={index} item={impact}/>)}
        <details><summary>Trace path and attribution</summary><p>{item.quantityAttribution}</p><code>{item.tracePath.join(" → ")}</code></details></article>)}</section>
    <section className="panel"><h2>Confidence and gaps</h2>{trace.missingLinks.length === 0 ? <p>Complete under policy {trace.policyVersion}.</p> :
      trace.missingLinks.map((gap, index) => <p key={index}><strong>{label(gap.state)}</strong> — {gap.reason}</p>)}</section></div>;
}

function TechnicalView({ value }: { value: Record<string, unknown> }) {
  return <div className="trace-result"><section className="panel"><h2>Production or Packaging trace</h2><p>Bounded read-only audit reconstruction.</p></section>
    <section className="panel"><h2>Technical audit</h2><pre>{JSON.stringify(value, null, 2)}</pre></section></div>;
}
function InventoryImpact({ item }: { item: Record<string, unknown> }) {
  const lot = (item.lot ?? {}) as Record<string, unknown>, locations = Array.isArray(item.locations) ? item.locations : [];
  return <article><h3>{String(lot.consumer_batch_code ?? lot.internal_lot_code ?? "Released inventory")}</h3>
    <p>Exact current on-hand: {String(item.onHandQuantity)} {String(lot.unit ?? "")} · available {String(item.availableQuantity)}</p>
    <p>Held {String(item.heldQuantity)} · blocked {String(item.blockedQuantity)} · damaged {String(item.damagedQuantity)} · lost {String(item.lostQuantity)} · destroyed {String(item.destroyedQuantity)}</p>
    <p>Expiry {String(lot.expiry_date ?? "Not applicable")} · {String(item.expiryState)} · locations {locations.map(location => String((location as Record<string, unknown>).location)).join(", ")}</p></article>;
}
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, character => character.toUpperCase());
