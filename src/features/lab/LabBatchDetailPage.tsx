import { useState } from "react";
import { ArrowLeft, Check, FlaskConical, Plus, Scale } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { useFormulaData } from "../formulas/state/FormulaDataContext";
import { expiryState, lotBalance } from "../inventory/domain/inventoryLogic";
import {
  completionWarnings,
  observationDueState,
  yieldVariance,
} from "./domain/labLogic";
import { ObservationForm } from "./components/ObservationForm";
import { TestSessionForm } from "../testing/components/TestSessionForm";

export function LabBatchDetailPage() {
  const { labBatchId } = useParams();
  const data = useFormulaData();
  const [message, setMessage] = useState("");
  const [observing, setObserving] = useState(false);
  const [testing, setTesting] = useState(false);
  const batch = data.labBatches.find((b) => b.id === labBatchId);
  if (!batch)
    return (
      <div className="empty-state">
        <h1>Lab batch not found</h1>
      </div>
    );
  const product = data.products.find((p) => p.id === batch.productId);
  const formula = data.formulas.find((f) => f.id === batch.formulaId);
  const version = data.formulaVersions.find(
    (v) => v.id === batch.formulaVersionId,
  );
  const lines = data.labBatchLines
    .filter((l) => l.labBatchId === batch.id)
    .sort((a, b) => a.phase.localeCompare(b.phase));
  const steps = data.processSteps
    .filter((s) => s.labBatchId === batch.id)
    .sort((a, b) => a.stepNumber - b.stepNumber);
  const observations = data.labObservations.filter(
    (o) => o.labBatchId === batch.id,
  );
  const sessions = data.testSessions.filter((s) => s.labBatchId === batch.id);
  const readOnly = ["Completed", "Archived"].includes(batch.status);
  const yv = yieldVariance(batch.actualYield, batch.plannedBatchSize);
  const complete = () => {
    const warnings = completionWarnings(
      batch,
      data.labBatchLines,
      data.labBatchAllocations,
    );
    if (
      warnings.length &&
      !window.confirm(
        `${warnings.join("\n")}\n\nComplete this experimental batch anyway?`,
      )
    )
      return;
    data.transitionBatch(batch.id, "Completed");
  };
  const commit = async () => {
    try {
      const errors = await Promise.resolve(
        data.commitBatchConsumption(batch.id),
      );
      setMessage(
        errors.length
          ? errors.join(" ")
          : "Consumption committed to the immutable inventory ledger.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Consumption failed.",
      );
    }
  };
  return (
    <>
      <Link className="back-link" to="/lab">
        <ArrowLeft size={14} />
        Lab notebook
      </Link>
      <PageHeader
        eyebrow={`${product?.name} / ${formula?.name} ${version?.version}`}
        title={batch.batchNumber}
        description={batch.purpose}
        action={
          <div className="action-row">
            {batch.status === "Planned" && (
              <button
                className="button primary"
                onClick={() => data.transitionBatch(batch.id, "In Progress")}
              >
                <FlaskConical size={15} />
                Begin execution
              </button>
            )}
            {batch.status === "In Progress" && (
              <button className="button primary" onClick={complete}>
                <Check size={15} />
                Complete Batch
              </button>
            )}
            <button className="button ghost" onClick={() => setObserving(true)}>
              Add observation
            </button>
            <button className="button ghost" onClick={() => setTesting(true)}>
              Create Test Session
            </button>
          </div>
        }
      />
      <section className="batch-source">
        <div>
          <span>Status</span>
          <StatusPill
            tone={
              batch.status === "Completed"
                ? "green"
                : batch.status === "In Progress"
                  ? "blue"
                  : "neutral"
            }
          >
            {batch.status}
          </StatusPill>
        </div>
        <div>
          <span>Immutable source</span>
          <strong>
            {formula?.name} · {version?.version} {version?.status}
          </strong>
        </div>
        <div>
          <span>Planned size</span>
          <strong>
            {batch.plannedBatchSize} {batch.plannedBatchUnit}
          </strong>
        </div>
        <div>
          <span>Target</span>
          <strong>{batch.targetCharacteristics}</strong>
        </div>
      </section>
      <section className="panel execution-section">
        <SectionHeader
          title="Execution weigh-ins"
          detail="Actual quantities and explicit lot allocations; no stock changes until commit"
          action={
            !readOnly && batch.status === "In Progress" ? (
              <button
                className="button ghost"
                disabled={data.pendingActions.includes(
                  "commitBatchConsumption",
                )}
                onClick={commit}
              >
                <Scale size={15} />
                <span>
                  {data.pendingActions.includes("commitBatchConsumption")
                    ? "Committing…"
                    : "Commit Weigh-ins"}
                </span>
              </button>
            ) : undefined
          }
        />
        {(message || data.actionError) && (
          <p
            className={
              message.includes("committed") ? "success-message" : "form-error"
            }
          >
            {message || data.actionError}
          </p>
        )}
        <div className="execution-lines">
          {lines.map((line) => {
            const allocations = data.labBatchAllocations.filter(
              (a) => a.labBatchLineId === line.id,
            );
            const compatibleLots = data.inventoryLots.filter(
              (l) =>
                l.ingredientId === line.ingredientId && l.status === "Active",
            );
            return (
              <article key={line.id}>
                <div className="execution-plan">
                  <span className="eyebrow">{line.phase}</span>
                  <h3>{line.ingredientNameSnapshot}</h3>
                  <p>
                    {line.plannedPercentage}% · planned{" "}
                    <b>
                      {line.plannedQuantity} {line.unit}
                    </b>
                  </p>
                </div>
                <label>
                  Actual quantity
                  <input
                    disabled={readOnly || batch.status !== "In Progress"}
                    type="number"
                    step="0.01"
                    value={line.actualQuantity ?? ""}
                    onChange={(e) =>
                      data.updateBatchLine(line.id, {
                        actualQuantity: Number(e.target.value),
                        status: "Weighed",
                      })
                    }
                  />
                  <small>
                    {line.variance != null
                      ? `${line.variance > 0 ? "+" : ""}${line.variance} ${line.unit} variance`
                      : "Not weighed"}
                  </small>
                </label>
                <label>
                  Execution notes
                  <input
                    disabled={readOnly || batch.status !== "In Progress"}
                    value={line.notes}
                    onChange={(e) =>
                      data.updateBatchLine(line.id, { notes: e.target.value })
                    }
                  />
                </label>
                <div className="allocations">
                  {allocations.map((allocation) => (
                    <div key={allocation.id}>
                      <select
                        aria-label={`Lot for ${line.ingredientNameSnapshot}`}
                        disabled={!!allocation.inventoryMovementId || readOnly}
                        value={allocation.inventoryLotId ?? ""}
                        onChange={(e) =>
                          data.updateAllocation(allocation.id, {
                            inventoryLotId: e.target.value,
                          })
                        }
                      >
                        <option value="">Select actual lot</option>
                        {compatibleLots.map((l) => (
                          <option value={l.id} key={l.id}>
                            {l.internalLotNumber} ·{" "}
                            {lotBalance(l, data.inventoryMovements)} {l.unit} ·{" "}
                            {expiryState(l, new Date("2026-07-14T12:00:00"))}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label={`Allocation for ${line.ingredientNameSnapshot}`}
                        disabled={!!allocation.inventoryMovementId || readOnly}
                        type="number"
                        step="0.01"
                        value={allocation.quantity || ""}
                        onChange={(e) =>
                          data.updateAllocation(allocation.id, {
                            quantity: Number(e.target.value),
                          })
                        }
                      />
                      <span>{allocation.unit}</span>
                      {allocation.inventoryMovementId && (
                        <StatusPill tone="green">Committed</StatusPill>
                      )}
                    </div>
                  ))}
                  {!readOnly && batch.status === "In Progress" && (
                    <button
                      className="text-button"
                      onClick={() => data.addAllocation(line.id)}
                    >
                      <Plus size={13} />
                      Add lot allocation
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <div className="batch-detail-grid">
        <section className="panel">
          <SectionHeader
            title="Process steps"
            action={
              !readOnly ? (
                <button
                  className="text-button"
                  onClick={() => {
                    const text = window.prompt("Process instruction");
                    if (text) data.addProcessStep(batch.id, text);
                  }}
                >
                  <Plus size={13} />
                  Add step
                </button>
              ) : undefined
            }
          />
          <div className="process-list">
            {steps.map((step) => (
              <label key={step.id}>
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={step.status === "Completed"}
                  onChange={(e) =>
                    data.updateProcessStep(step.id, {
                      status: e.target.checked ? "Completed" : "Pending",
                    })
                  }
                />
                <span>
                  <b>
                    {step.stepNumber}. {step.instruction}
                  </b>
                  <small>{step.status}</small>
                </span>
              </label>
            ))}
          </div>
        </section>
        <section className="panel yield-card">
          <SectionHeader title="Final yield" />
          <label>
            Actual final yield
            <input
              disabled={readOnly}
              type="number"
              step="0.1"
              value={batch.actualYield ?? ""}
              onChange={(e) =>
                data.updateLabBatch(batch.id, {
                  actualYield: Number(e.target.value),
                  yieldUnit: batch.plannedBatchUnit,
                })
              }
            />
            <span>{batch.plannedBatchUnit}</span>
          </label>
          <dl>
            <div>
              <dt>Planned</dt>
              <dd>
                {batch.plannedBatchSize} {batch.plannedBatchUnit}
              </dd>
            </div>
            <div>
              <dt>Variance</dt>
              <dd>
                {yv
                  ? `${yv.amount > 0 ? "+" : ""}${yv.amount} ${batch.plannedBatchUnit} · ${yv.percentage}%`
                  : "Not available"}
              </dd>
            </div>
          </dl>
        </section>
      </div>
      <section className="panel observation-section">
        <SectionHeader
          title="Observations"
          detail="Immediate and scheduled development checks"
          action={
            <button className="text-button" onClick={() => setObserving(true)}>
              <Plus size={13} />
              Add observation
            </button>
          }
        />
        <div className="observation-cards">
          {observations.map((o) => (
            <article key={o.id}>
              <StatusPill
                tone={
                  observationDueState(
                    o.targetDate,
                    o.observedAt,
                    new Date("2026-07-14T12:00:00"),
                  ) === "Overdue"
                    ? "red"
                    : observationDueState(
                          o.targetDate,
                          o.observedAt,
                          new Date("2026-07-14T12:00:00"),
                        ) === "Completed"
                      ? "green"
                      : "amber"
                }
              >
                {observationDueState(
                  o.targetDate,
                  o.observedAt,
                  new Date("2026-07-14T12:00:00"),
                )}
              </StatusPill>
              <div>
                <span className="eyebrow">{o.observationType}</span>
                <h3>
                  {o.observedAt
                    ? new Date(o.observedAt).toLocaleDateString("en-GB")
                    : `Target ${o.targetDate ?? "unscheduled"}`}
                </h3>
                <p>{o.notes || "Awaiting observation"}</p>
              </div>
              {o.rating && <strong>{o.rating}/5</strong>}
            </article>
          ))}
        </div>
      </section>
      <section className="panel linked-testing">
        <SectionHeader
          title="Linked testing"
          detail="Feedback tied to this exact physical batch"
          action={
            <button className="text-button" onClick={() => setTesting(true)}>
              <Plus size={13} />
              Create session
            </button>
          }
        />
        {sessions.map((s) => (
          <Link to={`/testing?session=${s.id}`} key={s.id}>
            <strong>{s.name}</strong>
            <StatusPill tone={s.status === "Completed" ? "green" : "blue"}>
              {s.status}
            </StatusPill>
          </Link>
        ))}
      </section>
      {observing && (
        <ObservationForm
          batchId={batch.id}
          onClose={() => setObserving(false)}
        />
      )}{" "}
      {testing && (
        <TestSessionForm batchId={batch.id} onClose={() => setTesting(false)} />
      )}
    </>
  );
}
