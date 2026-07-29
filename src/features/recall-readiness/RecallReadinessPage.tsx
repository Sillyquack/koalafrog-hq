import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ClipboardCheck, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { RecallReadinessRepository } from "./data/recallReadinessRepository";
import type {
  ExposureState, RecallCaseListItem, RecallCaseWorkspace, RecallConcernCategory, RecallDecisionReadiness,
  RecallInitiatingIdentityType, RecallLiveComparison, RecallRevisionComparison, RecallSeverity, RecallUrgency,
  RecommendedAction,
} from "./domain/recallReadiness";

const categories: RecallConcernCategory[] = ["raw_material_quality","packaging_quality","microbiological_concern","contamination_concern","allergen_concern","formulation_error","manufacturing_deviation","packaging_failure","label_error","missing_warning","expiry_or_shelf_life","supplier_notification","consumer_safety_concern","regulatory_nonconformity","traceability_gap","counterfeit_or_identity_concern","other"];
const sources: RecallInitiatingIdentityType[] = ["raw_material_inventory_lot","supplier_raw_material_lot","packaging_inventory_lot","supplier_packaging_lot","production_batch","production_output","packaging_run","finished_goods_lot","released_finished_goods_inventory_lot","consumer_batch_code","finished_goods_quality_review","traceability_integrity_finding","other_documented_source"];

export function RecallReadinessPage() {
  const repository = useMemo(() => new RecallReadinessRepository(), []), [params, setParams] = useSearchParams();
  const caseId = params.get("case"), [cases, setCases] = useState<RecallCaseListItem[]>([]);
  const [workspace, setWorkspace] = useState<RecallCaseWorkspace>(), [readiness, setReadiness] = useState<RecallDecisionReadiness>();
  const [live, setLive] = useState<RecallLiveComparison>(), [comparison, setComparison] = useState<RecallRevisionComparison>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), status = useRef<HTMLDivElement>(null);
  const loadList = async () => setCases(await repository.list());
  const loadCase = async (id: string) => {
    const value = await repository.get(id); setWorkspace(value);
    const latest = value.revisions.at(-1); if (latest) setReadiness(await repository.readiness(id, latest.id));
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); await loadList(); if (caseId) await loadCase(caseId); requestAnimationFrame(() => status.current?.focus()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Recall Readiness operation failed."); requestAnimationFrame(() => status.current?.focus()); }
    finally { setBusy(false); }
  };
  useEffect(() => { let active = true; void (async () => { try {
    const list = await repository.list(); if (active) setCases(list);
    if (caseId) { const value = await repository.get(caseId); if (active) { setWorkspace(value); const latest = value.revisions.at(-1); if (latest) setReadiness(await repository.readiness(caseId, latest.id)); } }
  } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Recall Readiness could not be reconstructed."); } })(); return () => { active = false; }; }, [caseId, repository]);
  return <main className="traceability-workspace recall-readiness-workspace">
    <header className="page-header"><div><span className="eyebrow">Recall Readiness V1 · Internal assessment only</span><h1>Recall readiness</h1>
      <p>Assess and freeze affected internal inventory without executing a recall, stock block, shipment, notification, return, or destruction.</p></div><ClipboardCheck aria-hidden="true"/></header>
    <section className="panel safety-boundary" aria-labelledby="distribution-boundary"><AlertTriangle aria-hidden="true"/>
      <div><h2 id="distribution-boundary">Distribution limitation</h2><p><strong>Customer and distribution tracing are not implemented in the current platform.</strong></p>
      <p>An approved assessment is an internal frozen scope. It is not a legal determination or operational recall action.</p></div></section>
    <div ref={status} tabIndex={-1} role="status">{error && <p className="form-error" role="alert">{error}</p>}</div>
    {!caseId ? <><CreateCaseForm busy={busy} repository={repository}
      initialSourceType={params.get("sourceType") as RecallInitiatingIdentityType | null}
      initialSourceId={params.get("sourceId") ?? ""}
      onError={cause => { setError(cause instanceof Error ? cause.message : "Case creation failed."); requestAnimationFrame(() => status.current?.focus()); }}
      onCreated={id => { setParams({ case: id }); requestAnimationFrame(() => status.current?.focus()); }}/>
      <CaseList cases={cases} onOpen={id => setParams({ case: id })}/></> :
      workspace && <CaseWorkspace value={workspace} readiness={readiness} busy={busy} run={run}
        compareLive={async revision => { setLive(await repository.compareLive(revision)); }}
        compareRevisions={async (left, right) => { setComparison(await repository.compareRevisions(left, right)); }}
        live={live} comparison={comparison} repository={repository} back={() => { setParams({}); setWorkspace(undefined); setReadiness(undefined); }}/>}
  </main>;
}

function CreateCaseForm({ busy, repository, onCreated, onError, initialSourceType, initialSourceId }: { busy: boolean; repository: RecallReadinessRepository; onCreated: (id: string) => void; onError: (cause: unknown) => void; initialSourceType: RecallInitiatingIdentityType | null; initialSourceId: string }) {
  const [title, setTitle] = useState(""), [summary, setSummary] = useState(""), [category, setCategory] = useState<RecallConcernCategory>("raw_material_quality");
  const [sourceType, setSourceType] = useState<RecallInitiatingIdentityType>(() => initialSourceType && sources.includes(initialSourceType) ? initialSourceType : "raw_material_inventory_lot"), [sourceId, setSourceId] = useState(initialSourceId);
  const [evidencePending, setEvidencePending] = useState(false);
  return <form className="panel operator-form" onSubmit={event => { event.preventDefault(); void repository.createCase({
    title, issueSummary: summary, concernCategory: category, discoveryAt: new Date().toISOString(), sourceType, sourceId, evidencePending,
  }).then(result => onCreated(result.case.id)).catch(onError); }}>
    <h2><Plus size={18}/> Open controlled assessment</h2>
    <label>Case title<input required minLength={3} value={title} onChange={event => setTitle(event.target.value)}/></label>
    <label>Issue summary<textarea required minLength={3} value={summary} onChange={event => setSummary(event.target.value)}/></label>
    <div className="form-grid"><label>Concern category<select value={category} onChange={event => setCategory(event.target.value as RecallConcernCategory)}>{categories.map(item => <option key={item} value={item}>{label(item)}</option>)}</select></label>
      <label>Initiating identity type<select value={sourceType} onChange={event => setSourceType(event.target.value as RecallInitiatingIdentityType)}>{sources.map(item => <option key={item} value={item}>{label(item)}</option>)}</select></label></div>
    <label>Canonical identity or exact batch code<input required value={sourceId} onChange={event => setSourceId(event.target.value)} aria-describedby="identity-help"/></label>
    <p id="identity-help" className="helper-text">The server validates this identity against the active workspace; arbitrary cross-workspace identifiers are rejected.</p>
    <label className="check-row"><input type="checkbox" checked={evidencePending} onChange={event => setEvidencePending(event.target.checked)}/> Evidence is pending and uncertainty is acknowledged</label>
    <button className="button primary" disabled={busy || !title.trim() || !summary.trim() || !sourceId.trim()}>Create case after validation</button>
  </form>;
}

function CaseList({ cases, onOpen }: { cases: RecallCaseListItem[]; onOpen: (id: string) => void }) {
  return <section className="panel"><h2>Assessment cases</h2>{cases.length === 0 ? <p>No Recall Readiness cases exist.</p> :
    <div className="trace-search-results">{cases.map(item => <article key={item.id}><span className="eyebrow">{item.caseCode}</span><h3>{item.title}</h3>
      <p>{label(item.concernCategory)} · {label(item.state)}</p><p>Severity {label(item.severity ?? "not_assessed")} · urgency {label(item.urgency ?? "not_assessed")}</p>
      <p>{item.affectedFinishedGoodsLotCount} affected Finished Goods lot(s) · {item.activeOnHandImpact} active on-hand</p>
      <p>Confidence: {label(item.scopeConfidence ?? "scope_not_generated")} · revision {item.revision}</p>
      <button className="button secondary" onClick={() => onOpen(item.id)}>Open assessment</button></article>)}</div>}</section>;
}

function CaseWorkspace({ value, readiness, busy, run, repository, live, comparison, compareLive, compareRevisions, back }: {
  value: RecallCaseWorkspace; readiness?: RecallDecisionReadiness; busy: boolean; run: (action: () => Promise<void>) => Promise<void>;
  repository: RecallReadinessRepository; live?: RecallLiveComparison; comparison?: RecallRevisionComparison;
  compareLive: (revision: string) => Promise<void>; compareRevisions: (left: string, right: string) => Promise<void>; back: () => void;
}) {
  const latest = value.revisions.at(-1), scope = value.scopes.find(item => item.revision_id === latest?.id);
  return <div className="trace-result">
    <button className="button secondary" onClick={back}>Back to cases</button>
    <section className="panel"><span className="eyebrow">{value.case.case_code}</span><h2>{value.case.title}</h2><p>{value.case.issue_summary}</p>
      <dl className="detail-grid"><div><dt>State</dt><dd>{label(value.case.lifecycle_state)}</dd></div><div><dt>Concern</dt><dd>{label(value.case.concern_category)}</dd></div>
      <div><dt>Initiating identity</dt><dd>{label(value.case.initiating_source_type)} · <code>{value.case.initiating_source_code}</code></dd></div>
      <div><dt>Case revision</dt><dd>{value.case.revision}</dd></div></dl></section>
    {!latest && <RevisionForm value={value} busy={busy} run={run} repository={repository}/>}
    {latest && <><AssessmentSummary revision={latest}/><EvidencePanel value={value} busy={busy} run={run} repository={repository}/>
      {!scope && latest.status === "draft" && <section className="panel"><h2>Generate immutable scope</h2><p>Policy 1.0.0 reuses canonical traceability and freezes current inventory at generation time.</p>
        <p><strong>This creates irreversible audit history, but no inventory or communication action.</strong></p>
        <button className="button primary" disabled={busy} onClick={() => void run(async () => { await repository.generateScope(value.case.id, latest.id, value.case.revision); })}>Generate and freeze scope</button></section>}
      {scope && <ScopePanel value={value} scopeId={scope.id}/>}
      {readiness && <ReadinessPanel readiness={readiness}/>}
      {scope && <ReviewApproval value={value} readiness={readiness} busy={busy} run={run} repository={repository}/>}
      {scope && <FrozenLive value={value} live={live} compare={() => compareLive(latest.id)}/>}
      {value.revisions.length > 1 && <RevisionComparison value={value} comparison={comparison} compare={compareRevisions}/>}
      {latest.status === "approved" && <RevisionForm value={value} busy={busy} run={run} repository={repository} superseding/>}
      <AuditPanel value={value}/></>}
  </div>;
}

function RevisionForm({ value, busy, run, repository, superseding = false }: { value: RecallCaseWorkspace; busy: boolean; run: (action: () => Promise<void>) => Promise<void>; repository: RecallReadinessRepository; superseding?: boolean }) {
  const [severity, setSeverity] = useState<RecallSeverity>("unknown"), [urgency, setUrgency] = useState<RecallUrgency>("unknown");
  const [exposure, setExposure] = useState<ExposureState>("unknown"), [health, setHealth] = useState(""), [compliance, setCompliance] = useState("");
  const [recommendation, setRecommendation] = useState(""), [action, setAction] = useState<RecommendedAction>("continue_investigation");
  const [distributionAck, setDistributionAck] = useState(false), [unknownAck, setUnknownAck] = useState(false), [evidencePending, setEvidencePending] = useState(false), [reason, setReason] = useState("");
  return <form className="panel operator-form" onSubmit={event => { event.preventDefault(); void run(async () => { await repository.createRevision({
    caseId: value.case.id, caseRevision: value.case.revision, severity, urgency, exposure, exposureUnknownAcknowledged: unknownAck,
    healthHazard: health, compliance, recommendation, action, distributionAcknowledged: distributionAck,
    evidencePendingAcknowledged: evidencePending, supersessionReason: superseding ? reason : undefined,
  }); }); }}><h2>{superseding ? "Create superseding assessment revision" : "Assessment revision"}</h2>
    {superseding && <label>Supersession reason<input required value={reason} onChange={event => setReason(event.target.value)}/></label>}
    <div className="form-grid"><label>Severity<select value={severity} onChange={event => setSeverity(event.target.value as RecallSeverity)}>{["unknown","low","moderate","serious","critical"].map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Urgency<select value={urgency} onChange={event => setUrgency(event.target.value as RecallUrgency)}>{["unknown","routine","prompt","urgent","immediate"].map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Exposure state<select value={exposure} onChange={event => setExposure(event.target.value as ExposureState)}>{["unknown","no_known_exposure","possible_exposure","confirmed_internal_distribution_only","possible_consumer_exposure","confirmed_consumer_exposure"].map(item => <option key={item}>{item}</option>)}</select></label>
      <label>Recommended action<select value={action} onChange={event => setAction(event.target.value as RecommendedAction)}>{["continue_investigation","no_action_recommended","internal_hold_recommended","withdrawal_assessment_recommended","recall_assessment_recommended","supplier_escalation_recommended","regulatory_review_recommended","destruction_assessment_recommended","other"].map(item => <option key={item}>{item}</option>)}</select></label></div>
    <label>Health-hazard assessment<textarea value={health} onChange={event => setHealth(event.target.value)}/></label>
    <label>Compliance assessment<textarea value={compliance} onChange={event => setCompliance(event.target.value)}/></label>
    <label>Operator recommendation<textarea required value={recommendation} onChange={event => setRecommendation(event.target.value)}/></label>
    <label className="check-row"><input type="checkbox" checked={unknownAck} onChange={event => setUnknownAck(event.target.checked)}/> Acknowledge unknown exposure where selected</label>
    <label className="check-row"><input type="checkbox" checked={distributionAck} onChange={event => setDistributionAck(event.target.checked)}/> I acknowledge customer and distribution tracing is unavailable</label>
    <label className="check-row"><input type="checkbox" checked={evidencePending} onChange={event => setEvidencePending(event.target.checked)}/> Evidence pending is explicitly acknowledged</label>
    <button className="button primary" disabled={busy || !recommendation.trim() || !distributionAck}>{superseding ? "Create immutable superseding revision" : "Create immutable revision"}</button>
  </form>;
}

function AssessmentSummary({ revision }: { revision: RecallCaseWorkspace["revisions"][number] }) {
  return <section className="panel"><h2>Assessment revision {revision.revision_number}</h2><p>{label(revision.status)} · fingerprint <code>{revision.fingerprint}</code></p>
    <p>Severity {label(revision.severity)} · urgency {label(revision.urgency)} · exposure {label(revision.exposure_state)}</p>
    <p>Recommendation: {label(revision.recommended_action)} — {revision.operator_recommendation}</p></section>;
}
function EvidencePanel({ value, busy, run, repository }: { value: RecallCaseWorkspace; busy: boolean; run: (action: () => Promise<void>) => Promise<void>; repository: RecallReadinessRepository }) {
  const [title, setTitle] = useState(""), [description, setDescription] = useState(""), [reference, setReference] = useState("");
  const latest = value.revisions.at(-1);
  return <section className="panel"><h2>Evidence</h2>{value.evidence.map(item => <article key={item.id}><strong>{item.title}</strong><p>{item.description}</p><code>{item.document_reference ?? "Private metadata only"}</code></article>)}
    <form className="operator-form" onSubmit={event => { event.preventDefault(); void run(async () => { await repository.addEvidence({ caseId: value.case.id, revisionId: latest?.id, type: "internal_note", title, description, reference }); setTitle(""); setDescription(""); }); }}>
      <label>Evidence title<input required value={title} onChange={event => setTitle(event.target.value)}/></label><label>Description<textarea required value={description} onChange={event => setDescription(event.target.value)}/></label>
      <label>Private document or storage reference<input value={reference} onChange={event => setReference(event.target.value)}/></label><button className="button secondary" disabled={busy}>Register immutable evidence metadata</button></form></section>;
}
function ScopePanel({ value, scopeId }: { value: RecallCaseWorkspace; scopeId: string }) {
  const scope = value.scopes.find(item => item.id === scopeId)!, affected = value.affectedGoods.filter(item => item.scope_snapshot_id === scopeId);
  return <><section className="panel"><h2>Frozen scope</h2><p><strong>{label(scope.scope_confidence)}</strong> · policy {scope.policy_version}</p><p>Evaluated {new Date(scope.evaluated_at).toLocaleString()} · fingerprint <code>{scope.fingerprint}</code></p>
    <p>Exact lifecycle quantities remain separate from unknown cross-level attribution.</p></section>
    <section className="panel"><h2>Affected Finished Goods</h2>{affected.map(item => <article key={item.id}><span className="eyebrow">Consumer batch</span><h3>{item.consumer_batch_code}</h3>
      <p>Created {quantity(item.quantity_created,item.unit)} · released {quantity(item.quantity_released,item.unit)} · quarantined {quantity(item.quantity_quarantined,item.unit)}</p>
      <p>Active on-hand {quantity(item.quantity_active_on_hand,item.unit)} · available {quantity(item.quantity_available,item.unit)} · held {quantity(item.quantity_held,item.unit)} · blocked {quantity(item.quantity_blocked,item.unit)}</p>
      <p>Damaged {quantity(item.quantity_damaged,item.unit)} · lost {quantity(item.quantity_lost,item.unit)} · destroyed {quantity(item.quantity_destroyed,item.unit)} · expired {quantity(item.quantity_expired,item.unit)}</p>
      <p><strong>Unknown attribution: {quantity(item.quantity_unknown,item.unit)}</strong> · {label(item.attribution_type)}</p></article>)}</section>
    <section className="panel"><h2>Traceability gaps</h2>{value.gaps.filter(item => item.scope_snapshot_id === scopeId).map(item => <article key={item.id}><strong>{label(item.severity)} · {label(item.code)}</strong><p>{item.reason}</p><p>Readiness: {item.readiness_impact}</p></article>)}</section></>;
}
function ReadinessPanel({ readiness }: { readiness: RecallDecisionReadiness }) {
  return <section className="panel"><h2>Decision readiness</h2><p><strong>{readiness.readyForApproval ? "Ready for approval" : readiness.readyForReview ? "Ready for review" : "Not ready"}</strong> · policy {readiness.scopePolicyVersion} · evaluated {new Date(readiness.evaluatedAt).toLocaleString()}</p>
    {readiness.blockers.length > 0 && <div><h3>Blockers</h3><ul>{readiness.blockers.map(item => <li key={item}>{label(item)}</li>)}</ul></div>}
    <h3>Warnings</h3><ul>{readiness.warnings.map(item => <li key={item}>{label(item)}</li>)}</ul></section>;
}
function ReviewApproval({ value, readiness, busy, run, repository }: { value: RecallCaseWorkspace; readiness?: RecallDecisionReadiness; busy: boolean; run: (action: () => Promise<void>) => Promise<void>; repository: RecallReadinessRepository }) {
  const revision = value.revisions.at(-1)!, scope = value.scopes.find(item => item.revision_id === revision.id)!, [rationale, setRationale] = useState("");
  const [approveScope, setApproveScope] = useState(false), [nonExecution, setNonExecution] = useState(false);
  return <section className="panel"><h2>Review and approval</h2><p>Revision fingerprint <code>{revision.fingerprint}</code></p><p>Scope fingerprint <code>{scope.fingerprint}</code></p>
    {value.reviews.filter(item => item.revision_fingerprint === revision.fingerprint).map(item => <article key={item.id}><strong>{label(item.decision)} · {label(item.reviewer_role)}</strong><p>{item.rationale}</p></article>)}
    <form className="operator-form" onSubmit={event => { event.preventDefault(); void run(async () => { await repository.submitReview({ caseId: value.case.id, revisionId: revision.id, fingerprint: revision.fingerprint, role: "owner", decision: "approve_readiness", rationale, evidenceIds: value.evidence.map(item => item.id) }); }); }}>
      <label>Review rationale<textarea required value={rationale} onChange={event => setRationale(event.target.value)}/></label><button className="button secondary" disabled={busy || !rationale.trim()}>Submit readiness review</button></form>
    <div className="approval-confirmation"><h3>Irreversible internal approval</h3>
      <label className="check-row"><input type="checkbox" checked={approveScope} onChange={event => setApproveScope(event.target.checked)}/> I accept this exact revision and frozen scope, including the distribution limitation</label>
      <label className="check-row"><input type="checkbox" checked={nonExecution} onChange={event => setNonExecution(event.target.checked)}/> I understand approval creates no recall, block, shipment, notification, return, or destruction</label>
      <button className="button primary" disabled={busy || !readiness?.readyForApproval || !approveScope || !nonExecution} onClick={() => void run(async () => { await repository.approve({ caseId: value.case.id, revisionId: revision.id, revisionFingerprint: revision.fingerprint, scopeFingerprint: scope.fingerprint, caseRevision: value.case.revision }); })}><ShieldCheck size={16}/> Approve frozen readiness assessment</button>
      {!readiness?.readyForApproval && <p>Server blockers must be resolved before approval; the server will reject a bypass attempt.</p>}</div></section>;
}
function FrozenLive({ value, live, compare }: { value: RecallCaseWorkspace; live?: RecallLiveComparison; compare: () => Promise<void> }) {
  const scope = value.scopes.at(-1)!;
  return <section className="panel"><h2>Frozen versus live inventory</h2><div className="comparison-grid"><article><h3>Frozen assessment</h3><p>{new Date(scope.evaluated_at).toLocaleString()}</p><code>{scope.fingerprint}</code></article>
    <article><h3>Current live comparison</h3><button className="button secondary" onClick={() => void compare()}><RefreshCw size={15}/> Compare without mutation</button>{live && <><p>Compared {new Date(live.comparedAt).toLocaleString()}</p><p>{live.changes.length} released tranche comparison(s)</p><pre>{JSON.stringify(live.changes,null,2)}</pre></>}</article></div></section>;
}
function RevisionComparison({ value, comparison, compare }: { value: RecallCaseWorkspace; comparison?: RecallRevisionComparison; compare: (left: string, right: string) => Promise<void> }) {
  const left=value.revisions.at(-2)!,right=value.revisions.at(-1)!;
  return <section className="panel"><h2>Revision comparison</h2><button className="button secondary" onClick={() => void compare(left.id,right.id)}>Compare revision {left.revision_number} with {right.revision_number}</button>
    {comparison && <div className="comparison-grid"><article><h3>Changed assessment fields</h3><ul>{Object.entries(comparison.fieldChanges).map(([field,changed]) => <li key={field}>{label(field)}: {changed ? "Changed" : "Unchanged"}</li>)}</ul></article>
      <article><h3>Affected identity changes</h3><p>Added {comparison.addedFinishedGoods.length} · removed {comparison.removedFinishedGoods.length}</p><p>Scope fingerprint: {comparison.scopeFingerprintChanged ? "Changed" : "Unchanged"}</p></article></div>}</section>;
}
function AuditPanel({ value }: { value: RecallCaseWorkspace }) {
  return <section className="panel"><h2>Technical audit</h2><ol>{value.events.map(item => <li key={item.id}><strong>{label(item.event_type)}</strong> · {new Date(item.occurred_at).toLocaleString()}<details><summary>Structured metadata</summary><pre>{JSON.stringify(item.metadata,null,2)}</pre></details></li>)}</ol>
    <p><Link to={`/traceability?type=${value.case.initiating_source_type}&id=${encodeURIComponent(value.case.initiating_source_id)}`}>Open canonical traceability root</Link></p></section>;
}
const label = (value: string) => value.replaceAll("_"," ").replace(/\b\w/g, character => character.toUpperCase());
const quantity = (value: number | null, unit: string | null) => value === null ? "Unknown" : `${value} ${unit ?? ""}`.trim();
