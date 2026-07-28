import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, RefreshCw, Scale } from "lucide-react";
import { SectionHeader } from "../../../components/ui/SectionHeader";
import { StatusPill } from "../../../components/ui/StatusPill";
import { useActiveWorkspace } from "../../../platform/startup/ActiveWorkspaceContext";
import type { ProductionRun } from "../../../types/domain";
import { ProductionOutputRepository } from "../data/productionOutputRepository";
import type { ProductionOutputComponentType, ProductionOutputSnapshot } from "../domain/productionOutput";

export function ProductionOutputWorkspace({ run }: { run: ProductionRun }) {
  const workspace = useActiveWorkspace();
  const repository = useMemo(() => workspace ? new ProductionOutputRepository() : undefined, [workspace]);
  const [snapshot, setSnapshot] = useState<ProductionOutputSnapshot>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const keys = useRef(new Map<string, string>());
  const keyFor = (payload: unknown) => {
    const fingerprint = JSON.stringify(payload);
    const existing = keys.current.get(fingerprint);
    if (existing) return existing;
    const key = crypto.randomUUID();
    keys.current.set(fingerprint, key);
    return key;
  };
  const refresh = useCallback(async () => {
    if (!repository) return;
    setError("");
    try {
      setSnapshot(await repository.load(run.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Production Output could not be loaded.");
    }
  }, [repository, run.id]);
  useEffect(() => {
    const task = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(task);
  }, [refresh]);

  if (!workspace || !repository) return (
    <section className="panel production-output-workspace">
      <SectionHeader title="Output & Yield" detail="Available in the authoritative Supabase workspace" />
      <p className="operational-notice">Local development data does not emulate controlled Production Output.</p>
    </section>
  );
  if (run.status !== "Completed") return (
    <section className="panel production-output-workspace">
      <SectionHeader title="Output & Yield" detail="Controlled bulk identity after material completion" />
      <p className="operational-notice"><b>Awaiting material completion.</b> Completing Production does not create bulk or Finished Goods inventory.</p>
    </section>
  );

  const act = async (label: string, payload: unknown, operation: (idempotencyKey: string) => Promise<unknown>) => {
    setPending(label); setError("");
    try {
      await operation(keyFor(payload));
      keys.current.delete(JSON.stringify(payload));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${label} failed.`);
    } finally {
      setPending("");
    }
  };
  const complete = () => {
    if (!snapshot) return;
    const payload = { runId: run.id, revision: snapshot.batchRevision, action: "complete-output-stage" };
    void act("Completing output stage", payload, (key) => repository.complete({
      target_production_run_id: run.id,
      expected_batch_revision: snapshot.batchRevision,
      candidate_completed_at: new Date().toISOString(),
      candidate_idempotency_key: key,
    }));
  };

  return (
    <section className="panel production-output-workspace" aria-labelledby="production-output-heading">
      <SectionHeader
        title="Output & Yield"
        detail="Actual bulk identity · reconciliation policy 1.0.0 · no Finished Goods inventory"
        action={<button className="button ghost" disabled={Boolean(pending)} onClick={() => void refresh()}><RefreshCw size={14}/>Refresh</button>}
      />
      <h2 id="production-output-heading" className="sr-only">Production Output and Yield</h2>
      {error && <p className="form-error" role="alert">{error}</p>}
      {snapshot && <aside className="operational-notice completion-readiness">
        <div>
          <strong>{snapshot.readiness.completed ? "Output stage complete" : snapshot.readiness.readyForCompletion ? "Ready to complete output stage" : snapshot.outputs.length ? "Reconciliation required" : "Ready to record"}</strong>
          <p>Policy {snapshot.readiness.policyVersion} · {snapshot.readiness.activeOutputRecords} active outputs · {snapshot.readiness.incompleteOutputRecords} incomplete</p>
        </div>
        {snapshot.readiness.blockers.length > 0 && <ul>{snapshot.readiness.blockers.map((blocker) =>
          <li key={blocker.blockerCode}><b>{blocker.blockerCode}</b> · {blocker.humanMessage} <span>{blocker.recommendedAction}</span></li>)}</ul>}
      </aside>}
      {snapshot?.outputStageStatus !== "completed" && snapshot && <CreateOutputForm run={run} batchRevision={snapshot.batchRevision} pending={pending}
        onSubmit={(input) => act("Creating output", input, (key) => repository.create({
          target_production_run_id: run.id,
          expected_batch_revision: snapshot.batchRevision,
          candidate_output_type: input.outputType,
          candidate_output_label: input.label,
          candidate_theoretical_quantity: input.theoreticalQuantity,
          candidate_theoretical_unit: run.plannedBatchUnit,
          candidate_theoretical_basis: "Immutable approved Production plan batch scale",
          candidate_override_reason: input.theoreticalQuantity === run.plannedBatchSize ? "" : input.overrideReason,
          candidate_override_evidence: "",
          candidate_measurement_basis: input.measurementBasis,
          candidate_location: input.location,
          candidate_idempotency_key: key,
        }))}/>}
      <div className="production-output-list">
        {snapshot?.outputs.map((output) => {
          const measurements = snapshot.measurements.filter((item) => item.production_output_id === output.id);
          const components = snapshot.components.filter((item) => item.production_output_id === output.id);
          const latest = measurements.at(-1);
          const reconciliation = snapshot.reconciliations.filter((item) => item.production_output_id === output.id).at(-1);
          const readOnly = output.status === "completed";
          return <article key={output.id} className="production-output-card">
            <header>
              <div><span className="eyebrow">{output.output_type} · sequence {output.output_sequence}</span><h3>{output.internal_output_code}</h3><p>{output.output_label} · {output.location}</p></div>
              <StatusPill tone={output.status === "completed" || output.status === "reconciled" ? "green" : output.status === "measured" ? "blue" : "amber"}>{output.status}</StatusPill>
            </header>
            <dl className="material-totals">
              <div><dt>Theoretical</dt><dd>{output.theoretical_quantity} {output.theoretical_unit}</dd></div>
              <div><dt>Actual measured</dt><dd>{latest ? `${latest.quantity} ${latest.unit}` : "Unknown"}</dd></div>
              <div><dt>Retained bulk</dt><dd>{componentQuantity(components, "retained_bulk")} {output.theoretical_normalized_unit}</dd></div>
              <div><dt>Bulk waste</dt><dd>{componentQuantity(components, "bulk_waste")} {output.theoretical_normalized_unit}</dd></div>
              <div><dt>Transferred</dt><dd>{componentQuantity(components, "transferred")} {output.theoretical_normalized_unit}</dd></div>
              <div><dt>Unexplained variance</dt><dd>{componentQuantity(components, "unexplained_variance")} {output.theoretical_normalized_unit}</dd></div>
              <div><dt>Yield</dt><dd>{reconciliation ? `${reconciliation.yield_percentage}%` : "Not reconciled"}</dd></div>
              <div><dt>Material cost</dt><dd>{output.material_cost_snapshot == null ? "Unknown" : `${output.material_cost_snapshot} ${output.material_cost_currency}`} · {output.material_cost_confidence}</dd></div>
            </dl>
            <p className="operational-notice">Actual = retained + transferred + waste + unexplained variance. Recording output does not create Finished Goods inventory.</p>
            {measurements.length > 0 && <details><summary>Measurement history ({measurements.length})</summary><ol>{measurements.map((item) =>
              <li key={item.id}>v{item.measurement_version} · {item.quantity} {item.unit} · {item.measurement_method} · {new Date(item.measured_at).toLocaleString("en-GB")}</li>)}</ol></details>}
            {!readOnly && <OutputActions output={output} pending={pending}
              measure={(input) => act("Recording measurement", input, (key) => repository.measure({
                target_production_output_id: output.id, expected_output_revision: output.revision,
                candidate_quantity: input.quantity, candidate_unit: output.theoretical_unit, candidate_method: input.method,
                candidate_equipment_reference: input.equipment, candidate_vessel_reference: input.vessel,
                candidate_gross_quantity: null as unknown as number, candidate_tare_quantity: null as unknown as number, candidate_evidence_reference: input.evidence,
                candidate_note: input.note, candidate_measured_at: new Date().toISOString(), candidate_idempotency_key: key,
              }))}
              component={(input) => act("Recording component", input, (key) => repository.component({
                target_production_output_id: output.id, expected_output_revision: output.revision,
                candidate_component_type: input.type, candidate_quantity: input.quantity, candidate_unit: output.theoretical_unit,
                candidate_reason: input.reason, candidate_evidence_reference: input.evidence,
                candidate_approval_state: input.type === "unexplained_variance" && input.quantity > 0 ? "approved" : "not_required",
                candidate_recorded_at: new Date().toISOString(), candidate_idempotency_key: key,
              }))}
              reconcile={(input) => act("Reconciling output", input, (key) => repository.reconcile({
                target_production_output_id: output.id, expected_output_revision: output.revision,
                candidate_tolerance_quantity: input.tolerance, candidate_reason: input.reason,
                candidate_evidence_reference: input.evidence, candidate_approve_variance: input.approveVariance,
                candidate_reconciled_at: new Date().toISOString(), candidate_idempotency_key: key,
              }))}/>}
          </article>;
        })}
      </div>
      {snapshot?.readiness.readyForCompletion && !snapshot.readiness.completed &&
        <button className="button primary" disabled={Boolean(pending)} onClick={complete}><Check size={14}/>Complete Output Stage</button>}
      {snapshot?.readiness.completed && <p className="success-message"><b>Ready for Packaging Planning.</b> No Packaging Run or Finished Goods inventory was created.</p>}
    </section>
  );
}

function CreateOutputForm({ run, batchRevision, pending, onSubmit }: {
  run: ProductionRun; batchRevision: number; pending: string;
  onSubmit: (input: { outputType: "bulk" | "intermediate"; label: string; theoreticalQuantity: number; overrideReason: string; measurementBasis: string; location: string; batchRevision: number }) => void;
}) {
  return <details className="output-action-form"><summary><Plus size={14}/>Create Production Output</summary>
    <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({
      outputType: String(form.get("outputType")) as "bulk" | "intermediate", label: String(form.get("label")).trim(),
      theoreticalQuantity: Number(form.get("theoreticalQuantity")), overrideReason: String(form.get("overrideReason")).trim(),
      measurementBasis: String(form.get("measurementBasis")).trim(), location: String(form.get("location")).trim(), batchRevision,
    }); }}>
      <p>Formula and Production snapshots will be immutable. This creates no inventory movement.</p>
      <label>Output type<select name="outputType"><option value="bulk">Bulk</option><option value="intermediate">Intermediate</option></select></label>
      <label>Output label<input name="label" required defaultValue={`${run.productionRunNumber} bulk output`}/></label>
      <label>Theoretical quantity<input name="theoreticalQuantity" required type="number" min="0.0001" step="any" defaultValue={run.plannedBatchSize}/><span>{run.plannedBatchUnit}</span></label>
      <label>Override reason<input name="overrideReason" placeholder="Required when theoretical quantity differs"/></label>
      <label>Measurement basis<input name="measurementBasis" required defaultValue="Net vessel measurement"/></label>
      <label>Location<input name="location" required defaultValue="Production"/></label>
      <button className="button primary" disabled={Boolean(pending)} type="submit">Create controlled output</button>
    </form>
  </details>;
}

function OutputActions({ output, pending, measure, component, reconcile }: {
  output: { theoretical_unit: string };
  pending: string;
  measure: (value: { quantity: number; method: string; equipment: string; vessel: string; evidence: string; note: string }) => void;
  component: (value: { type: ProductionOutputComponentType; quantity: number; reason: string; evidence: string }) => void;
  reconcile: (value: { tolerance: number; reason: string; evidence: string; approveVariance: boolean }) => void;
}) {
  return <div className="output-actions">
    <details className="output-action-form"><summary><Scale size={14}/>Record actual measurement</summary><form onSubmit={(event) => {
      event.preventDefault(); const form = new FormData(event.currentTarget); measure({ quantity: Number(form.get("quantity")), method: String(form.get("method")), equipment: String(form.get("equipment")), vessel: String(form.get("vessel")), evidence: String(form.get("evidence")), note: String(form.get("note")) });
    }}>
      <label>Net quantity<input name="quantity" required min="0.0001" step="any" type="number"/><span>{output.theoretical_unit}</span></label>
      <label>Method<input name="method" required defaultValue="Net vessel measurement"/></label><label>Equipment<input name="equipment"/></label>
      <label>Vessel<input name="vessel"/></label><label>Evidence<input name="evidence"/></label><label>Note<input name="note"/></label>
      <button className="button" disabled={Boolean(pending)} type="submit">Record versioned measurement</button>
    </form></details>
    <details className="output-action-form"><summary>Record retained bulk, waste, transfer or variance</summary><form onSubmit={(event) => {
      event.preventDefault(); const form = new FormData(event.currentTarget); component({ type: String(form.get("type")) as ProductionOutputComponentType, quantity: Number(form.get("quantity")), reason: String(form.get("reason")), evidence: String(form.get("evidence")) });
    }}>
      <label>Component<select name="type"><option value="retained_bulk">Retained bulk</option><option value="bulk_waste">Bulk waste</option><option value="transferred">Transferred</option><option value="unexplained_variance">Unexplained variance</option></select></label>
      <label>Quantity<input name="quantity" required min="0" step="any" type="number"/><span>{output.theoretical_unit}</span></label>
      <label>Reason<input name="reason" required/></label><label>Evidence<input name="evidence"/></label>
      <button className="button" disabled={Boolean(pending)} type="submit">Record immutable component</button>
    </form></details>
    <details className="output-action-form"><summary>Reconcile equation</summary><form onSubmit={(event) => {
      event.preventDefault(); const form = new FormData(event.currentTarget); reconcile({ tolerance: Number(form.get("tolerance")), reason: String(form.get("reason")), evidence: String(form.get("evidence")), approveVariance: form.get("approveVariance") === "on" });
    }}>
      <p>Actual = retained + transferred + bulk waste + unexplained variance.</p>
      <label>Tolerance<input name="tolerance" type="number" min="0" step="any" defaultValue="0.01"/><span>{output.theoretical_unit}</span></label>
      <label>Variance reason<input name="reason"/></label><label>Evidence<input name="evidence"/></label>
      <label><input name="approveVariance" type="checkbox"/>Approve documented unexplained variance</label>
      <button className="button primary" disabled={Boolean(pending)} type="submit">Run authoritative reconciliation</button>
    </form></details>
  </div>;
}

function componentQuantity(rows: ProductionOutputSnapshot["components"], type: ProductionOutputComponentType) {
  return rows.filter((item) => item.component_type === type).reduce((total, item) => total + Number(item.normalized_quantity), 0);
}
