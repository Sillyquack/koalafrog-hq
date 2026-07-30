import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { SectionHeader } from "../../components/ui/SectionHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { useFormulaData } from "../formulas/state/FormulaDataContext";
import {
  finishedGoodsBalance,
  finishedGoodsCostBasis,
} from "./domain/finishedGoodsLogic";
export function FinishedGoodsDetailPage() {
  const { finishedGoodsBatchId } = useParams(),
    d = useFormulaData(),
    batch = d.finishedGoodsBatches.find((b) => b.id === finishedGoodsBatchId);
  if (!batch)
    return (
      <div className="empty-state">
        <h1>Finished Goods Batch not found</h1>
      </div>
    );
  const product = d.products.find((p) => p.id === batch.productId),
    run = d.productionRuns.find((r) => r.id === batch.productionRunId),
    formula = d.formulas.find((f) => f.id === run?.formulaId),
    version = d.formulaVersions.find((v) => v.id === batch.formulaVersionId),
    packVersion = d.packagingSpecificationVersions.find(
      (v) => v.id === batch.packagingSpecificationVersionId,
    ),
    packSpec = d.packagingSpecifications.find(
      (s) => s.id === packVersion?.packagingSpecificationId,
    ),
    allocations = d.packagingAllocations.filter(
      (a) => a.finishedGoodsBatchId === batch.id,
    ),
    movements = d.finishedGoodsMovements
      .filter((m) => m.finishedGoodsBatchId === batch.id)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    physicalPackagingCost = allocations
      .filter(
        (a) => a.packagingInventoryMovementId && a.unitCostSnapshot != null,
      )
      .reduce((s, a) => s + a.quantity * a.unitCostSnapshot!, 0),
    cost = finishedGoodsCostBasis(
      batch.productionCostPerUnitSnapshot,
      batch.initialQuantity,
      allocations.some((a) => a.packagingInventoryMovementId)
        ? physicalPackagingCost
        : undefined,
      batch.packagingCostSnapshot ?? 0,
    );
  return (
    <>
      <Link className="back-link" to="/finished-goods">
        <ArrowLeft size={14} />
        Finished Goods
      </Link>
      <PageHeader
        eyebrow={`${product?.name} / Legacy Finished Goods history`}
        title={batch.finishedGoodsBatchNumber}
        description="Read-only compatibility record. Active does not imply regulatory approval, quality release, or legal sale readiness."
      />
      <section className="batch-source">
        <div>
          <span>Status</span>
          <StatusPill tone="green">{batch.status}</StatusPill>
        </div>
        <div>
          <span>Available / initial</span>
          <strong>
            {finishedGoodsBalance(batch, d.finishedGoodsMovements)} /{" "}
            {batch.initialQuantity} {batch.unit}
          </strong>
        </div>
        <div>
          <span>Production source</span>
          <strong>
            <Link to={`/production/${run?.id}`}>
              {run?.productionRunNumber}
            </Link>
          </strong>
        </div>
        <div>
          <span>Formula / Packaging</span>
          <strong>
            <Link to={`/formulas/${formula?.id}?version=${version?.id}`}>
              {formula?.name} {version?.version}
            </Link>{" "}
            ·{" "}
            {packSpec ? (
              <Link to={`/packaging/specifications/${packSpec.id}`}>
                {packSpec.name} {packVersion?.version}
              </Link>
            ) : (
              "Not applied"
            )}
          </strong>
        </div>
      </section>
      {packVersion && (
        <section className="panel execution-section">
          <SectionHeader
            title="Historical packaging allocation"
            detail="Read-only evidence retained from the legacy commitment workflow"
          />
          <div className="execution-lines">
            {allocations.map((allocation) => {
              const line = d.packagingSpecificationLines.find((item) => item.id === allocation.packagingSpecificationLineId);
              const component = d.packagingComponents.find((item) => item.id === line?.packagingComponentId);
              const lot = d.packagingInventoryLots.find((item) => item.id === allocation.packagingInventoryLotId);
              return (
                <article key={allocation.id}>
                  <div className="execution-plan">
                    <h3>{component?.name ?? "Unknown component"}</h3>
                    <p>
                      {allocation.quantity} {allocation.unit} · {lot?.internalLotNumber ?? "No physical lot recorded"}
                    </p>
                  </div>
                  <StatusPill tone={allocation.packagingInventoryMovementId ? "green" : "neutral"}>
                    {allocation.packagingInventoryMovementId ? "Historically committed" : "Uncommitted legacy record"}
                  </StatusPill>
                </article>
              );
            })}
            {!allocations.length && <p className="empty-copy">No historical packaging allocations were recorded.</p>}
          </div>
        </section>
      )}
      <div className="batch-detail-grid">
        <section className="panel">
          <SectionHeader
            title="Finished Goods movement history"
            detail="ProductionReceipt and explicit manual movements"
          />
          <div className="movement-list">
            {movements.map((m) => (
              <article key={m.id}>
                <span className="movement-mark">
                  {m.type === "ProductionReceipt" || m.type === "Adjustment"
                    ? "+"
                    : "−"}
                </span>
                <div>
                  <strong>{m.type}</strong>
                  <p>{m.reason}</p>
                  <small>{m.notes || "No notes"}</small>
                </div>
                <b>
                  {m.quantity} {m.unit}
                </b>
                <time>{new Date(m.occurredAt).toLocaleString("en-GB")}</time>
              </article>
            ))}
          </div>
        </section>
        <section className="panel">
          <SectionHeader
            title="Historical cost basis"
            detail="Actual packaging consumption replaces overlapping manual packaging cost"
          />
          <div className="cost-grid compact">
            <div>
              <span>Production snapshot</span>
              <strong>
                {batch.productionCostPerUnitSnapshot != null
                  ? `${batch.productionCostPerUnitSnapshot} NOK/unit`
                  : "Unknown"}
              </strong>
            </div>
            <div>
              <span>Physical packaging</span>
              <strong>
                {allocations.some((a) => a.packagingInventoryMovementId)
                  ? `${physicalPackagingCost.toFixed(2)} NOK`
                  : "Not committed"}
              </strong>
            </div>
            <div>
              <span>Finished Goods / unit</span>
              <strong>
                {cost.perUnit != null
                  ? `${cost.perUnit.toFixed(2)} NOK`
                  : "Unknown"}
              </strong>
            </div>
          </div>
          {cost.warning && <p className="form-error">{cost.warning}</p>}
        </section>
      </div>
    </>
  );
}
