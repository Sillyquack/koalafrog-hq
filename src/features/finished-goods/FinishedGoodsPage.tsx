import { PackageCheck, Plus, Search } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { useFormulaData } from "../formulas/state/FormulaDataContext";
import {
  finishedGoodsBalance,
  remainingProductionOutput,
} from "./domain/finishedGoodsLogic";
export function FinishedGoodsPage() {
  const d = useFormulaData(),
    navigate = useNavigate(),
    [search, setSearch] = useState("");
  const create = async () => {
    const run = d.productionRuns.find(
      (r) =>
        (r.actualUnitsProduced ?? 0) > 0 &&
        remainingProductionOutput(r, d.finishedGoodsBatches) > 0,
    );
    if (!run)
      return window.alert(
        "No Production output remains available for registration.",
      );
    const quantity = Number(
      window.prompt(
        `Quantity to register (maximum ${remainingProductionOutput(run, d.finishedGoodsBatches)})`,
      ),
    );
    if (!quantity) return;
    const approved = d.packagingSpecificationVersions.find(
      (v) =>
        v.status === "Approved" &&
        d.packagingSpecifications.find(
          (s) => s.id === v.packagingSpecificationId,
        )?.productId === run.productId,
    );
    try {
      const batch = await d.createFinishedGoodsBatch({
        productionRunId: run.id,
        quantity,
        packagingSpecificationVersionId: approved?.id,
        productionDate: new Date().toISOString().slice(0, 10),
        notes: "Explicit Finished Goods registration.",
      });
      navigate(`/finished-goods/${batch.id}`);
    } catch (e) {
      window.alert(
        e instanceof Error ? e.message : "Could not register output.",
      );
    }
  };
  const rows = d.finishedGoodsBatches.filter(
    (b) =>
      b.finishedGoodsBatchNumber.toLowerCase().includes(search.toLowerCase()) ||
      d.products
        .find((p) => p.id === b.productId)
        ?.name.toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageHeader
        eyebrow="Ledger-based packaged output"
        title="Finished Goods"
        description="Explicit Production output registrations with immutable movement history and end-to-end traceability."
        action={
          <button className="button primary" disabled={d.pendingActions.includes("createFinishedGoodsBatch")} onClick={create}>
            <Plus size={14} />
            Create Finished Goods Batch
          </button>
        }
      />
      <div className="inventory-filters">
        <label className="search-field">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search batch or product"
          />
        </label>
      </div>
      <div className="finished-goods-list">
        {rows.map((b) => {
          const p = d.products.find((p) => p.id === b.productId),
            run = d.productionRuns.find((r) => r.id === b.productionRunId),
            pack = d.packagingSpecificationVersions.find(
              (v) => v.id === b.packagingSpecificationVersionId,
            );
          return (
            <Link to={`/finished-goods/${b.id}`} key={b.id}>
              <PackageCheck />
              <div>
                <span className="eyebrow">{p?.name}</span>
                <h2>{b.finishedGoodsBatchNumber}</h2>
                <p>{b.notes}</p>
              </div>
              <dl>
                <div>
                  <dt>Available</dt>
                  <dd>
                    {finishedGoodsBalance(b, d.finishedGoodsMovements)} {b.unit}
                  </dd>
                </div>
                <div>
                  <dt>Production Run</dt>
                  <dd>{run?.productionRunNumber}</dd>
                </div>
                <div>
                  <dt>Packaging</dt>
                  <dd>{pack?.version ?? "Bulk / not applied"}</dd>
                </div>
                <div>
                  <dt>Production date</dt>
                  <dd>{b.productionDate}</dd>
                </div>
              </dl>
              <StatusPill tone={b.status === "Active" ? "green" : "neutral"}>
                {b.status}
              </StatusPill>
            </Link>
          );
        })}
      </div>
    </>
  );
}
