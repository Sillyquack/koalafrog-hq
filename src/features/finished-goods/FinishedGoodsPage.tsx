import { PackageCheck, Search } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { useFormulaData } from "../formulas/state/FormulaDataContext";
import { finishedGoodsBalance } from "./domain/finishedGoodsLogic";
export function FinishedGoodsPage() {
  const d = useFormulaData(),
    [search, setSearch] = useState("");
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
        eyebrow="Legacy compatibility history"
        title="Legacy Finished Goods"
        description="Read-only records retained for historical reconciliation. New output is registered through the controlled Production and Finished Goods Lot workflows."
      />
      <div className="inventory-filters">
        <label className="search-field">
          <Search size={15} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search legacy batch or product"
            aria-label="Search legacy Finished Goods history"
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
