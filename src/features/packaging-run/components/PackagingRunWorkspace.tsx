import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, PackageCheck, RefreshCw } from "lucide-react";
import { StatusPill } from "../../../components/ui/StatusPill";
import { PackagingRunRepository } from "../data/packagingRunRepository";
import type {
  PackagingBulkAvailability,
  PackagingEligibleLot,
  PackagingRunRecord,
  PackagingRunSnapshot,
} from "../domain/packagingRun";

export function PackagingRunWorkspace({ productionOutputId, productId }: { productionOutputId: string; productId: string }) {
  const repository = useMemo(() => new PackagingRunRepository(), []);
  const [availability, setAvailability] = useState<PackagingBulkAvailability>();
  const [runs, setRuns] = useState<PackagingRunRecord[]>([]);
  const [specifications, setSpecifications] = useState<Array<{ id: string; version: string; name: string }>>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [snapshot, setSnapshot] = useState<PackagingRunSnapshot>();
  const [eligibleLots, setEligibleLots] = useState<Record<string, PackagingEligibleLot[]>>({});
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
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
    setError("");
    try {
      const [nextAvailability, nextRuns, nextSpecifications] = await Promise.all([
        repository.availableBulk(productionOutputId), repository.runsByOutput(productionOutputId),
        repository.approvedSpecifications(productId),
      ]);
      setAvailability(nextAvailability); setRuns(nextRuns); setSpecifications(nextSpecifications);
      const activeId = selectedRunId || nextRuns.at(-1)?.id || "";
      setSelectedRunId(activeId);
      if (activeId) {
        const nextSnapshot = await repository.load(activeId);
        setSnapshot(nextSnapshot);
        const lotRows = await Promise.all(nextSnapshot.requirements.map(async (requirement) => [
          String(requirement.id), await repository.eligibleLots(String(requirement.id)),
        ] as const));
        setEligibleLots(Object.fromEntries(lotRows));
      } else setSnapshot(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Packaging Run could not be loaded.");
    }
  }, [productId, productionOutputId, repository, selectedRunId]);
  useEffect(() => { const task = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(task); }, [refresh]);

  const act = async (label: string, payload: unknown, operation: (key: string) => Promise<unknown>) => {
    setPending(label); setError("");
    try {
      await operation(keyFor(payload)); keys.current.delete(JSON.stringify(payload)); await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${label} failed.`);
    } finally { setPending(""); }
  };

  return <section className="packaging-run-workspace" aria-label="Packaging Run planning and control">
    <header className="packaging-run-header">
      <div><span className="eyebrow">Slice 2 · controlled packaging</span><h4>Packaging Runs</h4>
        <p>Creating or completing a Packaging Run does not create Finished Goods inventory.</p></div>
      <button className="button ghost" onClick={() => void refresh()} disabled={Boolean(pending)}><RefreshCw size={14}/>Refresh</button>
    </header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {availability && <dl className="material-totals">
      <div><dt>Retained bulk</dt><dd>{availability.retainedNormalizedQuantity} {availability.normalizedUnit}</dd></div>
      <div><dt>Allocated elsewhere</dt><dd>{availability.allocatedNormalizedQuantity} {availability.normalizedUnit}</dd></div>
      <div><dt>Available now</dt><dd>{availability.availableNormalizedQuantity} {availability.normalizedUnit}</dd></div>
    </dl>}
    {availability && specifications.length > 0 && <CreateRunForm availability={availability} specifications={specifications}
      pending={pending} onSubmit={(input) => act("Creating Packaging Run", input, (key) => repository.create({
        target_production_output_id: productionOutputId,
        candidate_packaging_specification_version_id: input.specificationId,
        candidate_run_label: input.label, candidate_planned_bulk_quantity: input.bulkQuantity,
        candidate_planned_bulk_unit: availability.normalizedUnit, candidate_planned_unit_count: input.unitCount,
        candidate_nominal_fill_quantity: input.nominalFill, candidate_nominal_fill_unit: input.nominalFillUnit,
        candidate_location: input.location, candidate_idempotency_key: key,
      }))}/>}
    {specifications.length === 0 && <p className="operational-notice">An Approved Packaging Specification Version is required.</p>}
    {runs.length > 0 && <label>Packaging Run
      <select value={selectedRunId} onChange={(event) => { setSelectedRunId(event.target.value); setSnapshot(undefined); }}>
        {runs.map((run) => <option key={run.id} value={run.id}>{run.internal_run_code} · {run.status}</option>)}
      </select>
    </label>}
    {snapshot && <PackagingRunDetail snapshot={snapshot} eligibleLots={eligibleLots} pending={pending} act={act} repository={repository}/>}
  </section>;
}

function PackagingRunDetail({ snapshot, eligibleLots, pending, act, repository }: {
  snapshot: PackagingRunSnapshot; eligibleLots: Record<string, PackagingEligibleLot[]>; pending: string;
  act: (label: string, payload: unknown, operation: (key: string) => Promise<unknown>) => Promise<void>;
  repository: PackagingRunRepository;
}) {
  const { run, readiness } = snapshot;
  const allocation = snapshot.bulkAllocations.find((item) => item.status !== "released");
  const readOnly = run.status === "completed";
  return <article className="packaging-run-card">
    <header><div><span className="eyebrow">{run.internal_run_code}</span><h4>{run.run_label}</h4></div>
      <StatusPill tone={readOnly || run.status === "reconciled" ? "green" : run.status === "in_progress" ? "blue" : "amber"}>{run.status}</StatusPill></header>
    <dl className="material-totals">
      <div><dt>Planned bulk</dt><dd>{run.planned_bulk_normalized_quantity} {run.planned_bulk_normalized_unit}</dd></div>
      <div><dt>Transferred</dt><dd>{run.actual_transferred_normalized_quantity} {run.planned_bulk_normalized_unit}</dd></div>
      <div><dt>Planned units</dt><dd>{run.planned_unit_count}</dd></div>
      <div><dt>Nominal fill</dt><dd>{run.nominal_fill_quantity} {run.nominal_fill_unit}</dd></div>
      <div><dt>Bulk cost</dt><dd>{run.bulk_material_cost_snapshot == null ? "Unknown" : `${run.bulk_material_cost_snapshot} ${run.bulk_material_cost_currency}`} · {run.bulk_cost_confidence}</dd></div>
      <div><dt>Packaging cost</dt><dd>{readiness.costState}</dd></div>
    </dl>
    <aside className="operational-notice completion-readiness">
      <div><strong>{readiness.completed ? "Ready for Finished Goods Lot Creation" : readiness.readyForCompletion ? "Ready to complete Packaging Run" : "Packaging control incomplete"}</strong>
        <p>Policy {readiness.policyVersion} · {readiness.activeReservations} active reservations · {readiness.remainingBulkAllocation} unexplained bulk allocation</p></div>
      {readiness.blockers.length > 0 && <ul>{readiness.blockers.map((blocker) =>
        <li key={blocker.blockerCode}><b>{blocker.blockerCode}</b> · {blocker.humanMessage} <span>{blocker.recommendedAction}</span></li>)}</ul>}
    </aside>
    {!readOnly && !allocation && <SimpleForm title="Allocate bulk" fields={[
      ["quantity","Requested allocation","number",String(run.planned_bulk_normalized_quantity)],
      ["method","Allocation method","text","Measured retained bulk allocation"],
    ]} pending={pending} onSubmit={(values) => act("Allocating bulk", values, (key) => repository.allocateBulk({
      target_packaging_run_id: run.id, expected_run_revision: run.revision, candidate_quantity: Number(values.quantity),
      candidate_unit: run.planned_bulk_normalized_unit, candidate_allocation_method: values.method, candidate_idempotency_key: key,
    }))}/>}
    {!readOnly && allocation && run.actual_transferred_normalized_quantity === 0 && <SimpleForm title="Record bulk transfer" fields={[
      ["quantity","Actual transfer","number",String(allocation.allocated_quantity)],
      ["method","Measurement method","text","Net vessel measurement"],["source","Source vessel","text",""],
      ["destination","Destination vessel","text",""],["evidence","Evidence","text",""],["note","Note","text",""],
    ]} pending={pending} onSubmit={(values) => act("Recording bulk transfer", values, (key) => repository.transferBulk({
      target_bulk_allocation_id: String(allocation.id), expected_run_revision: run.revision,
      candidate_quantity: Number(values.quantity), candidate_unit: String(allocation.unit),
      candidate_measurement_method: values.method, candidate_equipment_reference: "",
      candidate_source_vessel: values.source, candidate_destination_vessel: values.destination,
      candidate_evidence_reference: values.evidence, candidate_note: values.note,
      candidate_transferred_at: new Date().toISOString(), candidate_idempotency_key: key,
    }))}/>}
    <div className="packaging-requirement-list">{snapshot.requirements.map((requirement) => {
      const reservations = snapshot.reservations.filter((item) => item.packaging_requirement_id === requirement.id);
      const uses = snapshot.inventoryUses.filter((item) => item.packaging_requirement_id === requirement.id);
      return <section key={String(requirement.id)} className="packaging-requirement">
        <header><div><b>{String(requirement.component_name_snapshot)}</b><p>{String(requirement.component_role_snapshot)}</p></div>
          <span>{String(requirement.total_required_quantity)} {String(requirement.unit)} required</span></header>
        <dl className="material-totals">
          <div><dt>Reserved</dt><dd>{sum(reservations,"reserved_quantity")}</dd></div>
          <div><dt>Consumed</dt><dd>{sum(uses.filter((item) => item.use_type === "consumption"),"quantity")}</dd></div>
          <div><dt>Waste</dt><dd>{sum(uses.filter((item) => item.use_type === "waste"),"quantity")}</dd></div>
          <div><dt>Available lots</dt><dd>{(eligibleLots[String(requirement.id)] ?? []).filter((lot) => lot.eligible).length}</dd></div>
        </dl>
        {!readOnly && <ReservationForm requirement={requirement} lots={eligibleLots[String(requirement.id)] ?? []}
          pending={pending} onReserve={(input) => act("Reserving packaging", input, (key) => repository.reserve({
            target_packaging_requirement_id: String(requirement.id), target_packaging_inventory_lot_id: input.lotId,
            expected_run_revision: run.revision, candidate_quantity: input.quantity, candidate_unit: String(requirement.unit),
            candidate_idempotency_key: key,
          }))}/>}
        {reservations.map((reservation) => <ReservationActions key={String(reservation.id)} reservation={reservation}
          run={run} pending={pending} act={act} repository={repository}/>)}
      </section>;
    })}</div>
    {!readOnly && run.actual_transferred_normalized_quantity > 0 && <SimpleForm title="Reconcile Packaging Run" fields={[
      ["pending","Pending Finished Goods conversion","number",String(run.actual_transferred_normalized_quantity)],
      ["retained","Retained transferred bulk","number","0"],["waste","Process bulk waste","number","0"],
      ["bulkVariance","Unexplained bulk variance","number","0"],["packagingVariance","Unexplained packaging variance","number","0"],
      ["reason","Variance reason","text",""],["evidence","Evidence","text",""],
    ]} pending={pending} onSubmit={(values) => act("Reconciling Packaging Run", values, (key) => repository.reconcile({
      target_packaging_run_id: run.id, expected_run_revision: run.revision,
      candidate_pending_finished_goods_quantity: Number(values.pending), candidate_retained_bulk_quantity: Number(values.retained),
      candidate_bulk_waste_quantity: Number(values.waste), candidate_unexplained_bulk_variance: Number(values.bulkVariance),
      candidate_unexplained_packaging_variance: Number(values.packagingVariance), candidate_reason: values.reason,
      candidate_evidence_reference: values.evidence,
      candidate_approve_variance: Number(values.bulkVariance) !== 0 || Number(values.packagingVariance) !== 0,
      candidate_reconciled_at: new Date().toISOString(), candidate_idempotency_key: key,
    }))}/>}
    {!readOnly && readiness.readyForCompletion && <button className="button primary" disabled={Boolean(pending)}
      onClick={() => void act("Completing Packaging Run", { runId: run.id, revision: run.revision }, (key) => repository.complete({
        target_packaging_run_id: run.id, expected_run_revision: run.revision,
        candidate_completed_at: new Date().toISOString(), candidate_idempotency_key: key,
      }))}><Check size={14}/>Complete Packaging Run</button>}
    {readOnly && <p className="success-message"><PackageCheck size={16}/><b>Ready for Finished Goods Lot Creation.</b> No Finished Goods Lot or movement was created.</p>}
    <details><summary>Audit history ({snapshot.events.length})</summary><ol>{snapshot.events.map((event) =>
      <li key={String(event.id)}>{String(event.event_type)} · {new Date(String(event.occurred_at)).toLocaleString("en-GB")}</li>)}</ol></details>
  </article>;
}

function ReservationActions({ reservation, run, pending, act, repository }: {
  reservation: Record<string, unknown>; run: PackagingRunRecord; pending: string;
  act: (label: string, payload: unknown, operation: (key: string) => Promise<unknown>) => Promise<void>;
  repository: PackagingRunRepository;
}) {
  const remaining = Number(reservation.reserved_in_lot_unit)-Number(reservation.consumed_in_lot_unit)-Number(reservation.waste_in_lot_unit);
  if (!["active","partially_used"].includes(String(reservation.status))) return <p>{String(reservation.status)} · no remaining reservation</p>;
  return <details><summary>Reservation {String(reservation.packaging_inventory_lot_id)} · {remaining} remaining</summary>
    <SimpleForm title="Consume packaging" fields={[["quantity","Productive consumption","number",String(remaining)],["reason","Reason","text","Packaging Run productive consumption"],["evidence","Evidence","text",""]]}
      pending={pending} onSubmit={(values) => act("Consuming packaging", values, (key) => repository.useInventory({
        target_packaging_reservation_id: String(reservation.id), expected_run_revision: run.revision,
        candidate_use_type: "consumption", candidate_quantity: Number(values.quantity), candidate_unit: String(reservation.unit),
        candidate_category: "", candidate_reason: values.reason, candidate_evidence_reference: values.evidence,
        candidate_occurred_at: new Date().toISOString(), candidate_idempotency_key: key,
      }))}/>
    <SimpleForm title="Record waste or damage" fields={[["quantity","Waste quantity","number","0"],["category","Category","text","damaged_during_filling"],["reason","Reason","text",""],["evidence","Evidence","text",""]]}
      pending={pending} onSubmit={(values) => act("Recording packaging waste", values, (key) => repository.useInventory({
        target_packaging_reservation_id: String(reservation.id), expected_run_revision: run.revision,
        candidate_use_type: "waste", candidate_quantity: Number(values.quantity), candidate_unit: String(reservation.unit),
        candidate_category: values.category, candidate_reason: values.reason, candidate_evidence_reference: values.evidence,
        candidate_occurred_at: new Date().toISOString(), candidate_idempotency_key: key,
      }))}/>
    <SimpleForm title="Release or return unused packaging" fields={[["reason","Reason","text","Unused packaging"],["evidence","Staged-return evidence","text",""],["staged","Physically staged? (yes/no)","text","no"]]}
      pending={pending} onSubmit={(values) => act("Releasing packaging reservation", values, (key) => repository.releaseReservation({
        target_packaging_reservation_id: String(reservation.id), expected_run_revision: run.revision,
        candidate_staged_return: values.staged.toLowerCase() === "yes", candidate_reason: values.reason,
        candidate_evidence_reference: values.evidence, candidate_condition_acceptable: values.staged.toLowerCase() === "yes",
        candidate_idempotency_key: key,
      }))}/>
  </details>;
}

function CreateRunForm({ availability, specifications, pending, onSubmit }: {
  availability: PackagingBulkAvailability; specifications: Array<{ id: string; version: string; name: string }>;
  pending: string; onSubmit: (input: { specificationId: string; label: string; bulkQuantity: number; unitCount: number; nominalFill: number; nominalFillUnit: string; location: string }) => void;
}) {
  return <details><summary>Create Packaging Run</summary><form onSubmit={(event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); onSubmit({
      specificationId: String(data.get("specificationId")), label: String(data.get("label")),
      bulkQuantity: Number(data.get("bulkQuantity")), unitCount: Number(data.get("unitCount")),
      nominalFill: Number(data.get("nominalFill")), nominalFillUnit: String(data.get("nominalFillUnit")),
      location: String(data.get("location")),
    });
  }}>
    <label>Approved specification<select name="specificationId">{specifications.map((item) =>
      <option value={item.id} key={item.id}>{item.name} · {item.version}</option>)}</select></label>
    <label>Run label<input required name="label" defaultValue={`${availability.outputCode} packaging`}/></label>
    <label>Bulk quantity<input required name="bulkQuantity" type="number" step="any" min="0.0001" max={availability.availableNormalizedQuantity} defaultValue={availability.availableNormalizedQuantity}/><span>{availability.normalizedUnit}</span></label>
    <label>Planned units<input required name="unitCount" type="number" step="1" min="1"/></label>
    <label>Nominal fill<input required name="nominalFill" type="number" step="any" min="0.0001"/></label>
    <label>Fill unit<select name="nominalFillUnit"><option>g</option><option>ml</option></select></label>
    <label>Location<input required name="location" defaultValue="Packaging"/></label>
    <button className="button primary" disabled={Boolean(pending)}>Create controlled Packaging Run</button>
  </form></details>;
}

function ReservationForm({ requirement, lots, pending, onReserve }: {
  requirement: Record<string, unknown>; lots: PackagingEligibleLot[]; pending: string;
  onReserve: (input: { lotId: string; quantity: number }) => void;
}) {
  const eligible = lots.filter((lot) => lot.eligible);
  return <details><summary>Reserve packaging</summary><form onSubmit={(event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    onReserve({ lotId: String(data.get("lotId")), quantity: Number(data.get("quantity")) });
  }}>
    <label>Eligible lot<select name="lotId" required>{eligible.map((lot) => <option value={lot.lotId} key={lot.lotId}>
      {lot.lotCode} · available {lot.availableQuantity} {lot.unit} · reserved {lot.activeReservations} · {lot.unitCost == null ? "cost Unknown" : `${lot.unitCost} ${lot.costCurrency}`} · FEFO {lot.recommendationRank}
    </option>)}</select></label>
    <label>Quantity<input name="quantity" type="number" min="0.0001" step="any" max={eligible.at(0)?.availableQuantity} defaultValue={String(requirement.total_required_quantity)}/></label>
    <button className="button secondary" disabled={Boolean(pending) || eligible.length === 0}>Reserve selected lot</button>
    {lots.filter((lot) => !lot.eligible).map((lot) => <p key={lot.lotId}>{lot.lotCode}: {lot.ineligibilityReasons.join(", ")}</p>)}
  </form></details>;
}

function SimpleForm({ title, fields, pending, onSubmit }: {
  title: string; fields: Array<[string,string,"number"|"text",string]>; pending: string;
  onSubmit: (values: Record<string,string>) => void;
}) {
  return <details><summary>{title}</summary><form onSubmit={(event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    onSubmit(Object.fromEntries(fields.map(([name]) => [name,String(data.get(name) ?? "")])));
  }}>{fields.map(([name,label,type,value]) => <label key={name}>{label}<input name={name} type={type} step={type === "number" ? "any" : undefined} defaultValue={value}/></label>)}
    <button className="button secondary" disabled={Boolean(pending)}>{title}</button></form></details>;
}
function sum(rows: Record<string, unknown>[], key: string) { return rows.reduce((total,row) => total+Number(row[key] ?? 0),0); }
