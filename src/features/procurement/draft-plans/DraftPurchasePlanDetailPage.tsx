import { ArrowLeft, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { PageHeader } from "../../../components/ui/PageHeader";
import { procurementActions } from "../actions/procurementActions";
import type {
  DraftPurchasePlanAggregate,
  DraftPurchasePlanReceiptBundle,
  PurchasePlanBasket,
} from "../domain/procurement";
import { useProcurement } from "../useProcurement";
import { DraftPurchasePlanReceiptPanel } from "./DraftPurchasePlanReceiptPanel";

const money = (value: number | null, currency: string | null) =>
  value == null
    ? "Unknown"
    : `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(value)} ${currency ?? ""}`.trim();

const receiptFromState = (value: unknown) => {
  if (!value || typeof value !== "object" || !("receipt" in value)) return;
  const receipt = (value as { receipt?: unknown }).receipt;
  if (!receipt || typeof receipt !== "object") return;
  const candidate = receipt as Partial<DraftPurchasePlanReceiptBundle>;
  if (
    candidate.schemaVersion === 1 &&
    candidate.plan &&
    Array.isArray(candidate.baskets) &&
    Array.isArray(candidate.lines)
  )
    return candidate as DraftPurchasePlanReceiptBundle;
};

function BasketCostSummary({ basket }: { basket: PurchasePlanBasket }) {
  const costs = [
    ["List subtotal", basket.merchandise_subtotal],
    ["Verified discount", basket.confirmed_discount],
    ["Post-discount subtotal", basket.post_discount_subtotal],
    ["Shipping", basket.shipping],
    ["VAT adjustment", basket.vat_adjustment],
    ["Import VAT", basket.import_vat],
    ["Duty", basket.customs],
    ["Dangerous-goods fee", basket.dangerous_goods_fee],
    ["Brokerage / handling", basket.handling],
    ["Payment FX", basket.payment_fx],
    ["Known minimum", basket.known_minimum],
  ] as const;
  return (
    <dl className="draft-plan-cost-grid">
      {costs.map(([label, value]) => (
        <div key={label} className={value == null ? "unknown" : "known"}>
          <dt>{label}</dt>
          <dd>{money(value, basket.currency)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DraftPurchasePlanDetailPage() {
  const { planId = "" } = useParams();
  const location = useLocation();
  const { workspace, data, error: procurementError } = useProcurement();
  const [reloadAttempt, setReloadAttempt] = useState(0);
  const [loadResult, setLoadResult] = useState<{
    requestKey: string;
    aggregate?: DraftPurchasePlanAggregate;
    error?: string;
  }>();
  const receipt = receiptFromState(location.state);
  const requestKey = `${workspace?.workspaceId ?? "pending"}:${planId}:${reloadAttempt}`;

  useEffect(() => {
    if (!workspace || !planId) return;
    let active = true;
    void procurementActions
      .loadDraftPurchasePlan(workspace.workspaceId, planId)
      .then((aggregate) => {
        if (active) setLoadResult({ requestKey, aggregate });
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setLoadResult({
          requestKey,
          error:
            cause instanceof Error
              ? cause.message
              : "Draft Purchase Plan could not be reloaded.",
        });
      });
    return () => {
      active = false;
    };
  }, [workspace, planId, requestKey]);

  const loading = loadResult?.requestKey !== requestKey;
  const aggregate = loading ? undefined : loadResult.aggregate;
  const error = loading ? "" : loadResult.error;
  const reload = () => setReloadAttempt((attempt) => attempt + 1);

  if (procurementError)
    return (
      <section className="panel procurement-state" role="alert">
        <h1>Draft plan unavailable</h1>
        <p>{procurementError}</p>
      </section>
    );
  if (loading)
    return (
      <section className="panel procurement-state" aria-busy="true">
        <p>Reloading the persisted Draft Purchase Plan…</p>
      </section>
    );
  if (error || !aggregate)
    return (
      <section className="panel procurement-state" role="alert">
        <h1>Draft Purchase Plan could not be read</h1>
        <p>{error || "No owner-workspace record was returned."}</p>
        <button className="button ghost" onClick={reload}>
          Retry readback
        </button>
      </section>
    );

  const { plan, baskets, lines } = aggregate;
  return (
    <div className="draft-plan-workspace" data-testid="draft-plan-detail">
      <Link className="back-link" to="/procurement">
        <ArrowLeft size={14} /> Procurement
      </Link>
      <PageHeader
        eyebrow="Procurement / persisted internal plan"
        title={plan.title}
        description={plan.purpose}
        action={
          <button className="button ghost" onClick={reload}>
            <RefreshCw size={14} /> Reload persisted snapshot
          </button>
        }
      />
      <section className="draft-plan-state-strip" aria-label="Plan state">
        <div><span>Status</span><strong>Draft</strong></div>
        <div><span>Placement</span><strong>Unplaced</strong></div>
        <div><span>Ordering authority</span><strong>Not authorised for ordering</strong></div>
        <div><span>External order</span><strong>None</strong></div>
      </section>
      <div className="operational-notice draft-only-warning" role="note">
        <p>
          Internal planning snapshot only. This record is not a cart, Purchase
          Order, reservation, payment, receipt, ownership record, inventory
          event, or Quality Release.
        </p>
      </div>
      {receipt && receipt.plan.recordId === plan.id && (
        <DraftPurchasePlanReceiptPanel receipt={receipt} />
      )}
      <section className="panel draft-plan-overview" aria-labelledby="plan-cost-title">
        <span className="eyebrow">Known and unresolved planning cost</span>
        <h2 id="plan-cost-title">Plan guardrails</h2>
        <dl className="draft-plan-cost-grid">
          <div><dt>Target ceiling</dt><dd>{money(plan.target_budget, plan.base_currency)}</dd></div>
          <div><dt>Absolute stop</dt><dd>{money(plan.absolute_stop, plan.base_currency)}</dd></div>
          <div className={plan.estimated_merchandise_total == null ? "unknown" : "known"}><dt>Known merchandise total</dt><dd>{money(plan.estimated_merchandise_total, plan.base_currency)}</dd></div>
          <div className={plan.known_minimum == null ? "unknown" : "known"}><dt>Known cost minimum</dt><dd>{money(plan.known_minimum, plan.base_currency)}</dd></div>
          <div className={plan.estimated_landed_total == null ? "unknown" : "known"}><dt>Estimated landed total</dt><dd>{money(plan.estimated_landed_total, plan.base_currency)}</dd></div>
          <div className={plan.credible_range_minimum == null ? "unknown" : "known"}><dt>Credible range</dt><dd>{plan.credible_range_minimum == null ? "Unknown" : `${money(plan.credible_range_minimum, plan.base_currency)}–${money(plan.credible_range_maximum, plan.base_currency)}`}</dd></div>
          <div className={plan.worst_credible_range_minimum == null ? "unknown" : "known"}><dt>Worst credible range</dt><dd>{plan.worst_credible_range_minimum == null ? "Unknown" : `${money(plan.worst_credible_range_minimum, plan.base_currency)}–${money(plan.worst_credible_range_maximum, plan.base_currency)}`}</dd></div>
          <div><dt>Commercial evidence checked</dt><dd>{plan.commercial_checked_at ?? "Unknown"}</dd></div>
        </dl>
        {plan.internal_notes && <p>{plan.internal_notes}</p>}
      </section>
      <section className="draft-plan-detail-baskets" aria-labelledby="persisted-baskets-title">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Owner-authorized readback</span>
            <h2 id="persisted-baskets-title">Supplier baskets and line snapshots</h2>
          </div>
          <span>{baskets.length} baskets · {lines.length} lines</span>
        </div>
        {baskets.map((basket) => {
          const basketLines = lines.filter(
            (line) => line.purchase_plan_basket_id === basket.id,
          );
          const supplier = data?.suppliers.find(
            (item) => item.id === basket.supplier_id,
          );
          return (
            <article className="panel draft-plan-persisted-basket" key={basket.id}>
              <header>
                <div>
                  <span className="eyebrow">{basket.currency} basket</span>
                  <h3>
                    {supplier?.trading_name ||
                      supplier?.legal_name ||
                      basket.supplier_name_snapshot}
                  </h3>
                </div>
                <span className="receipt-id">{basket.id}</span>
              </header>
              <BasketCostSummary basket={basket} />
              <div className="draft-plan-persisted-lines">
                {basketLines.map((line) => (
                  <article key={line.id}>
                    <div>
                      <span className="eyebrow">
                        {line.inventory_domain.replaceAll("_", " ")} ·{" "}
                        {(line.source_kind ?? "legacy").replaceAll("_", " ")}
                      </span>
                      <h4>
                        {line.supplier_product_name_snapshot || line.description}
                      </h4>
                      <p>
                        SKU {line.supplier_sku_snapshot ?? "Unknown"} ·{" "}
                        {line.pack_count ?? line.planned_quantity} ×{" "}
                        {line.pack_size ?? "Unknown"} {line.unit}
                      </p>
                      <p>
                        Unit price {money(line.estimated_unit_price, line.currency)} ·{" "}
                        line total {money(line.estimated_line_total, line.currency)}
                      </p>
                      {line.product_url_snapshot && (
                        <a
                          href={line.product_url_snapshot}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Open recorded source URL
                        </a>
                      )}
                    </div>
                    <span className="receipt-id">{line.id}</span>
                  </article>
                ))}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
