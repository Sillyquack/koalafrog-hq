import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Scale } from "lucide-react";
import { SectionHeader } from "../../../components/ui/SectionHeader";
import { StatusPill } from "../../../components/ui/StatusPill";
import { useActiveWorkspace } from "../../../platform/startup/ActiveWorkspaceContext";
import { ProductionInventoryControlRepository } from "../data/productionInventoryControlRepository";
import {
  emptyBatchMaterialControlSnapshot,
  type BatchMaterialKind,
  type BatchMaterialControlSnapshot,
  type EligibleMaterialLot,
  type CompletionReadiness,
  type MaterialProvenance,
} from "../domain/productionInventoryControl";

interface Requirement {
  id: string;
  name: string;
  phase: string;
  targetQuantity: number;
  unit: string;
}

export function BatchMaterialControlWorkspace({
  kind,
  batchId,
  requirements,
  editable,
  onReadinessChange,
}: {
  kind: BatchMaterialKind;
  batchId: string;
  requirements: Requirement[];
  editable: boolean;
  onReadinessChange?: (readiness: CompletionReadiness | undefined) => void;
}) {
  const workspace = useActiveWorkspace();
  const repository = useMemo(() => workspace ? new ProductionInventoryControlRepository() : undefined, [workspace]);
  const [snapshot, setSnapshot] = useState<BatchMaterialControlSnapshot>(emptyBatchMaterialControlSnapshot);
  const [eligible, setEligible] = useState<Record<string, EligibleMaterialLot[]>>({});
  const [readiness, setReadiness] = useState<CompletionReadiness>();
  const [provenance, setProvenance] = useState<Record<string, MaterialProvenance>>({});
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
      const [next, lotLists, completion, provenanceLists] = await Promise.all([
        repository.load(kind, batchId),
        Promise.all(requirements.map((requirement) => repository.eligibleLots(kind, batchId, requirement.id))),
        repository.completionReadiness(kind, batchId),
        Promise.all(requirements.map((requirement) => repository.provenance(kind, batchId, requirement.id))),
      ]);
      setSnapshot(next);
      setEligible(Object.fromEntries(requirements.map((requirement, index) => [requirement.id, lotLists[index]])));
      setReadiness(completion);
      onReadinessChange?.(completion);
      setProvenance(Object.fromEntries(requirements.map((requirement, index) => [requirement.id, provenanceLists[index]])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Material control could not be loaded.");
    }
  }, [batchId, kind, onReadinessChange, repository, requirements]);
  useEffect(() => {
    const task = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(task);
  }, [refresh]);

  if (!workspace || !repository)
    return (
      <section className="panel execution-section">
        <SectionHeader title="Controlled material inventory" detail="Available in the authoritative Supabase workspace" />
        <p className="operational-notice">Local development data does not emulate reservations or controlled consumption.</p>
      </section>
    );

  const act = async (label: string, operation: () => Promise<unknown>, fingerprint: unknown) => {
    if (pending) return;
    setPending(label);
    setError("");
    try {
      await operation();
      keys.current.delete(JSON.stringify(fingerprint));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${label} failed.`);
    } finally {
      setPending("");
    }
  };

  return (
    <section className="panel execution-section material-control">
      <SectionHeader
        title="Controlled material inventory"
        detail="Released balance minus active reservations · policy 1.0.0"
        action={<button className="button ghost" disabled={Boolean(pending)} onClick={() => void refresh()}><RefreshCw size={14} />Refresh</button>}
      />
      {error && <p className="form-error" role="alert">{error}</p>}
      {readiness && <aside className="operational-notice completion-readiness" aria-label="Completion readiness">
        <div><strong>{readiness.completed ? "Completed" : readiness.readyForCompletion ? "Ready for completion" : "Not ready for completion"}</strong>
          <p>Policy {readiness.completionPolicyVersion} · {readiness.reconciledRequirements}/{readiness.totalRequirements} requirements reconciled · {readiness.activeReservations} active reservations</p></div>
        {readiness.blockers.length > 0 && <ul>{readiness.blockers.map((blocker, index) => <li key={`${blocker.blockerCode}-${blocker.requirementId ?? "batch"}-${index}`}><b>{blocker.blockerCode}</b> · {blocker.humanMessage} <span>{blocker.recommendedAction}</span></li>)}</ul>}
      </aside>}
      <div className="execution-lines">
        {requirements.map((requirement) => {
          const reservations = snapshot.reservations.filter((row) => row.requirement_id === requirement.id);
          const weighings = snapshot.weighings.filter((row) => row.requirement_id === requirement.id);
          const consumptions = snapshot.consumptions.filter((row) => row.requirement_id === requirement.id);
          const waste = snapshot.waste.filter((row) => row.requirement_id === requirement.id);
          const returns = snapshot.returns.filter((row) => row.requirement_id === requirement.id);
          const reconciliation = snapshot.reconciliations.find((row) => row.requirement_id === requirement.id);
          const reserved = sum(reservations, "reserved_quantity");
          const remaining = sum(reservations, "remaining_quantity");
          return (
            <article key={requirement.id}>
              <div className="execution-plan">
                <span className="eyebrow">{requirement.phase}</span>
                <h3>{requirement.name}</h3>
                <p>Target <b>{requirement.targetQuantity} {requirement.unit}</b></p>
                <div className="action-row">
                  <StatusPill tone={remaining > 0 ? "blue" : reserved > 0 ? "green" : "neutral"}>
                    {remaining > 0 ? "Reserved" : reserved > 0 ? "Reservation released" : "Not reserved"}
                  </StatusPill>
                  <StatusPill tone={reconciliation?.state === "reconciled" ? "green" : "amber"}>
                    {reconciliation?.state === "reconciled" ? "Reconciled" : "Reconciliation pending"}
                  </StatusPill>
                </div>
              </div>
              <dl className="material-totals">
                <div><dt>Reserved</dt><dd>{reserved} {requirement.unit}</dd></div>
                <div><dt>Actual weighed</dt><dd>{sum(weighings, "actual_quantity")} {requirement.unit}</dd></div>
                <div><dt>Consumed</dt><dd>{sum(consumptions, "consumed_quantity")} {requirement.unit}</dd></div>
                <div><dt>Waste</dt><dd>{sum(waste, "quantity")} {requirement.unit}</dd></div>
                <div><dt>Returned</dt><dd>{sum(returns, "quantity")} {requirement.unit}</dd></div>
                <div><dt>Remaining reservation</dt><dd>{remaining} {requirement.unit}</dd></div>
                <div><dt>Variance</dt><dd>{reconciliation?.unexplained_variance ?? "—"} {requirement.unit}</dd></div>
              </dl>
              {editable && (
                <LotReservationForm
                  lots={eligible[requirement.id] ?? []}
                  disabled={Boolean(pending)}
                  onReserve={(lotId, quantity, method) => {
                    const payload = { requirementId: requirement.id, lotId, quantity, method, revision: snapshot.batchRevision };
                    return act("Reserve", () => repository.reserve({
                      target_batch_kind: kind,
                      target_batch_id: batchId,
                      target_requirement_id: requirement.id,
                      target_inventory_lot_id: lotId,
                      reservation_quantity: quantity,
                      reservation_unit: requirement.unit,
                      allocation_method: method,
                      expected_batch_revision: snapshot.batchRevision,
                      candidate_idempotency_key: keyFor(payload),
                    }), payload);
                  }}
                />
              )}
              {reservations.map((reservation) => (
                <ReservationActions
                  key={reservation.id}
                  reservation={reservation}
                  planned={weighings.filter((row) => row.reservation_id === reservation.id && row.record_type === "planned")}
                  weighing={weighings.find((row) => row.reservation_id === reservation.id && row.record_type === "actual")}
                  consumption={consumptions.find((row) => row.reservation_id === reservation.id)}
                  editable={editable}
                  pending={Boolean(pending)}
                  run={(name, operation, payload) => act(name, operation, payload)}
                  repository={repository}
                  keyFor={keyFor}
                />
              ))}
              {editable && (
                <button className="text-button" disabled={Boolean(pending)} onClick={() => {
                  const reason = window.prompt("Variance reason (leave blank only for exact reconciliation)", "") ?? "";
                  const evidence = reason ? window.prompt("Variance evidence reference", "") ?? "" : "";
                  const payload = { requirementId: requirement.id, reason, evidence };
                  void act("Reconcile", () => repository.reconcile({
                    target_batch_kind: kind, target_batch_id: batchId, target_requirement_id: requirement.id,
                    variance_reason: reason, variance_evidence: evidence,
                    variance_approval_state: reason ? "pending_review" : "documented",
                    candidate_idempotency_key: keyFor(payload),
                  }), payload);
                }}>Reconcile requirement</button>
              )}
              <details className="material-provenance">
                <summary>Material provenance</summary>
                <ol>{(provenance[requirement.id]?.nodes ?? []).map((node, index) => <li key={`${node.nodeType}-${node.immutableId ?? index}`}><strong>{node.historicalLabel}</strong><span>{node.nodeType.replaceAll("_", " ")} · {node.lifecycleStatus}</span>{node.quantity != null && <span>{node.quantity} {node.unit}</span>}{node.immutableId && <code>{node.immutableId}</code>}</li>)}</ol>
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function LotReservationForm({ lots, disabled, onReserve }: { lots: EligibleMaterialLot[]; disabled: boolean; onReserve: (lot: string, quantity: number, method: string) => Promise<void> }) {
  const [lot, setLot] = useState("");
  const [quantity, setQuantity] = useState("");
  const selected = lots.find((row) => row.inventoryLotId === lot);
  return (
    <form className="lot-reservation-form" onSubmit={(event) => {
      event.preventDefault();
      if (lot && Number(quantity) > 0) void onReserve(lot, Number(quantity), selected?.fefoRank === 1 ? "fefo" : "manual");
    }}>
      <label>Eligible released lot<select required value={lot} onChange={(event) => setLot(event.target.value)}><option value="">Select eligible lot</option>{lots.map((row) => <option key={row.inventoryLotId} value={row.inventoryLotId}>{row.fefoRank === 1 ? "Recommended by FEFO · " : ""}{row.internalLotNumber} · available {row.availableBalance} {row.unit} · reserved {row.reservedBalance} · {row.expiryOrRetestDate ?? "no expiry"} · {row.location}</option>)}</select></label>
      <label>Requested quantity<input required type="number" min="0" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
      {selected && <small>Available before {selected.availableBalance} {selected.unit} · after {selected.availableBalance - Number(quantity || 0)} · cost {selected.unitCost == null ? "Unknown" : `${selected.unitCost} ${selected.costCurrency}/${selected.unit}`}</small>}
      <button className="button ghost" disabled={disabled || !lot || Number(quantity) <= 0}>Reserve lot</button>
    </form>
  );
}

function ReservationActions({ reservation, planned, weighing, consumption, editable, pending, repository, run, keyFor }: {
  reservation: BatchMaterialControlSnapshot["reservations"][number];
  planned: BatchMaterialControlSnapshot["weighings"];
  weighing?: BatchMaterialControlSnapshot["weighings"][number];
  consumption?: BatchMaterialControlSnapshot["consumptions"][number];
  editable: boolean; pending: boolean; repository: ProductionInventoryControlRepository;
  run: (name: string, operation: () => Promise<unknown>, payload: unknown) => Promise<void>;
  keyFor: (payload: unknown) => string;
}) {
  if (!editable) return null;
  const promptQuantity = (label: string, fallback: number) => {
    const value = window.prompt(label, String(fallback));
    return value == null ? undefined : Number(value);
  };
  return <div className="reservation-actions"><span><Scale size={13} /> Reservation {reservation.id.slice(0, 8)} · revision {reservation.revision} · {reservation.remaining_quantity} {reservation.unit} remaining</span>
    <div className="planned-weighing-history"><strong>Planned weighing history</strong>{planned.length ? planned.map((record) => <span key={record.id}>Sequence {record.planned_sequence} · {record.planned_quantity} {record.unit} · {record.planned_container ?? "No vessel"} · {new Date(record.recorded_at).toLocaleString("en-GB")} · <code>{record.id}</code></span>) : <span>No planned weighing recorded.</span>}<small>Planned weighing records intent. It does not deduct inventory.</small></div>
    <button className="text-button" disabled={pending || reservation.remaining_quantity <= 0} onClick={() => {
      const quantity = promptQuantity("Planned weighing quantity", reservation.remaining_quantity); if (quantity == null) return;
      const sequence = promptQuantity("Planned sequence", planned.length + 1); if (sequence == null) return;
      const container = window.prompt("Optional container or vessel", "") ?? "";
      const note = window.prompt("Operator note", "") ?? "", evidence = window.prompt("Evidence reference", "") ?? "";
      const payload = { action: "plan", id: reservation.id, revision: reservation.revision, quantity, sequence, container, note, evidence };
      void run("Plan weighing", () => repository.weighV2({ target_reservation_id: reservation.id, expected_reservation_revision: reservation.revision, record_type: "planned", weighing_quantity: quantity, weighing_unit: reservation.unit, planned_sequence: sequence, planned_container: container, equipment_reference: "", evidence_reference: evidence, operator_note: note, candidate_idempotency_key: keyFor(payload) }), payload);
    }}>Record planned weighing</button>
    {!weighing && <button className="text-button" disabled={pending || reservation.remaining_quantity <= 0} onClick={() => {
      const quantity = promptQuantity("Actual weighed quantity", reservation.remaining_quantity); if (quantity == null) return;
      const evidence = window.prompt("Evidence reference", "") ?? "", payload = { action: "weigh", id: reservation.id, revision: reservation.revision, quantity, evidence };
      void run("Weigh", () => repository.weigh({ target_reservation_id: reservation.id, expected_reservation_revision: reservation.revision, record_type: "actual", weighing_quantity: quantity, weighing_unit: reservation.unit, equipment_reference: window.prompt("Equipment reference", "") ?? "", evidence_reference: evidence, operator_note: window.prompt("Operator note", "") ?? "", candidate_idempotency_key: keyFor(payload) }), payload);
    }}>Record weighing</button>}
    {weighing && !consumption && <button className="text-button" disabled={pending} onClick={() => {
      const productive = promptQuantity("Productive consumption", weighing.actual_quantity ?? 0); if (productive == null) return;
      const waste = promptQuantity("Waste quantity", 0); if (waste == null) return;
      const reason = window.prompt("Consumption reason", "Batch charge") ?? "", evidence = window.prompt("Evidence reference", weighing.evidence_reference ?? "") ?? "";
      if (!window.confirm(`Record irreversible inventory movements: ${productive} ${reservation.unit} productive and ${waste} ${reservation.unit} waste?`)) return;
      const payload = { action: "consume", id: reservation.id, revision: reservation.revision, weighing: weighing.id, productive, waste, reason, evidence };
      void run("Consume", () => repository.consume({ target_reservation_id: reservation.id, expected_reservation_revision: reservation.revision, target_weighing_id: weighing.id, productive_quantity: productive, waste_quantity: waste, consumption_unit: reservation.unit, waste_category: waste > 0 ? "process_loss" : "none", reason, evidence_reference: evidence, candidate_idempotency_key: keyFor(payload) }), payload);
    }}>Confirm consumption</button>}
    {reservation.remaining_quantity > 0 && <button className="text-button" disabled={pending} onClick={() => {
      const quantity = promptQuantity("Quantity to release", reservation.remaining_quantity); if (quantity == null) return;
      const reason = window.prompt("Release reason", "Unused reservation") ?? "", payload = { action: "release", id: reservation.id, revision: reservation.revision, quantity, reason };
      void run("Release", () => repository.release({ target_reservation_id: reservation.id, expected_reservation_revision: reservation.revision, release_quantity: quantity, release_reason: reason, candidate_idempotency_key: keyFor(payload) }), payload);
    }}>Release unused</button>}
    {weighing && !consumption && reservation.remaining_quantity > 0 && <button className="text-button" disabled={pending} onClick={() => {
      const quantity = promptQuantity("Staged material return quantity", reservation.remaining_quantity); if (!quantity) return;
      const condition = window.prompt("Condition and contamination assessment", "") ?? "", reason = window.prompt("Staged return reason", "") ?? "", evidence = window.prompt("Evidence reference", "") ?? "";
      if (!window.confirm("Return staged material? No positive Inventory Movement is created because this material has not previously been deducted from inventory.")) return;
      const payload = { action: "staged-return", id: reservation.id, revision: reservation.revision, weighing: weighing.id, quantity, condition, reason, evidence };
      void run("Return staged material", () => repository.recordReturn({ target_reservation_id: reservation.id, expected_reservation_revision: reservation.revision, target_weighing_id: weighing.id, original_consumption_id: null as unknown as string, return_quantity: quantity, return_unit: reservation.unit, return_kind: "staged_unconsumed", condition_assessment: condition, reason, evidence_reference: evidence, candidate_idempotency_key: keyFor(payload) }), payload);
    }}>Return staged material</button>}
    {consumption && weighing && <button className="text-button" disabled={pending} onClick={() => {
      const quantity = promptQuantity("Physical return quantity", 0); if (!quantity) return;
      const condition = window.prompt("Condition assessment", "") ?? "", reason = window.prompt("Return reason", "") ?? "", evidence = window.prompt("Evidence reference", "") ?? "";
      const payload = { action: "return", id: reservation.id, revision: reservation.revision, consumption: consumption.id, quantity, condition, reason, evidence };
      void run("Return", () => repository.recordReturn({ target_reservation_id: reservation.id, expected_reservation_revision: reservation.revision, target_weighing_id: weighing.id, original_consumption_id: consumption.id, return_quantity: quantity, return_unit: reservation.unit, return_kind: "physical_return_after_consumption", condition_assessment: condition, reason, evidence_reference: evidence, candidate_idempotency_key: keyFor(payload) }), payload);
    }}>Return previously consumed material</button>}
  </div>;
}

function sum<T extends object>(rows: T[], key: keyof T): number {
  return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
}
