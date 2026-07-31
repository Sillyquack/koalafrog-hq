import { ArrowLeft, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "../../../components/ui/PageHeader";
import { useFormulaData } from "../../formulas/state/FormulaDataContext";
import { procurementActions } from "../actions/procurementActions";
import { useProcurement } from "../useProcurement";
import {
  draftPlanPayload,
  newDraftBasket,
  newDraftLine,
  newDraftPlanForm,
  type DraftBasketFormState,
  type DraftLineFormState,
  type DraftPlanFormState,
  type NullableNumberText,
  validateDraftPlanForm,
} from "./draftPlanForm";

type SourceOption = {
  id: string;
  title: string;
  sku: string;
  packageQuantity: string;
  packageUnit: string;
  price: NullableNumberText;
  currency: string;
  url: string;
};

function UnknownNumberField({
  label,
  value,
  onChange,
  allowNegative = false,
}: {
  label: string;
  value: NullableNumberText;
  onChange: (value: NullableNumberText) => void;
  allowNegative?: boolean;
}) {
  const unknown = value === null;
  return (
    <label className="unknown-number-field">
      <span>{label}</span>
      <span className="unknown-toggle">
        <input
          type="checkbox"
          checked={unknown}
          onChange={(event) => onChange(event.target.checked ? null : "")}
        />
        Unknown
      </span>
      <input
        type="number"
        min={allowNegative ? undefined : "0"}
        step="any"
        value={value ?? ""}
        disabled={unknown}
        aria-label={`${label} amount`}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function LineEditor({
  line,
  basketCurrency,
  sourceOptions,
  onChange,
  onRemove,
  canRemove,
}: {
  line: DraftLineFormState;
  basketCurrency: string;
  sourceOptions: SourceOption[];
  onChange: (patch: Partial<DraftLineFormState>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const selectSource = (sourceRecordId: string) => {
    const source = sourceOptions.find((item) => item.id === sourceRecordId);
    onChange(
      source
        ? {
            sourceRecordId,
            productTitle: source.title,
            sku: source.sku,
            packageQuantity: source.packageQuantity,
            packageUnit: source.packageUnit,
            unitPrice: source.price,
            currency: basketCurrency || source.currency,
            sourceUrl: source.url,
          }
        : { sourceRecordId },
    );
  };

  return (
    <fieldset className="draft-plan-line">
      <legend>Commercial line snapshot</legend>
      <div className="draft-plan-form-grid">
        <label>
          Source kind
          <select
            value={line.sourceKind}
            onChange={(event) => {
              const sourceKind = event.target.value as DraftLineFormState["sourceKind"];
              onChange({
                sourceKind,
                sourceRecordId: "",
                sourceDomain:
                  sourceKind === "supplier_product"
                    ? "raw_material"
                    : sourceKind === "manual"
                      ? line.sourceDomain
                      : "packaging",
              });
            }}
          >
            <option value="supplier_product">Supplier Product</option>
            <option value="packaging_supplier_product">
              Packaging Supplier Product
            </option>
            <option value="packaging_component">Packaging Component</option>
            <option value="manual">Manual evidence snapshot</option>
          </select>
        </label>
        {line.sourceKind === "manual" ? (
          <label>
            Source domain
            <select
              value={line.sourceDomain}
              onChange={(event) =>
                onChange({
                  sourceDomain: event.target
                    .value as DraftLineFormState["sourceDomain"],
                })
              }
            >
              <option value="raw_material">Raw material</option>
              <option value="packaging">Packaging</option>
              <option value="equipment">Equipment</option>
            </select>
          </label>
        ) : (
          <label>
            Source record
            <select
              value={line.sourceRecordId}
              onChange={(event) => selectSource(event.target.value)}
              required
            >
              <option value="">Select an owner-workspace source…</option>
              {sourceOptions.map((source) => (
                <option value={source.id} key={source.id}>
                  {source.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="span-2">
          Exact product title
          <input
            value={line.productTitle}
            required
            onChange={(event) => onChange({ productTitle: event.target.value })}
          />
        </label>
        <label>
          SKU
          <input
            value={line.sku}
            onChange={(event) => onChange({ sku: event.target.value })}
          />
        </label>
        <label>
          Package quantity
          <input
            type="number"
            min="0"
            step="any"
            value={line.packageQuantity}
            required
            onChange={(event) =>
              onChange({ packageQuantity: event.target.value })
            }
          />
        </label>
        <label>
          Package unit
          <input
            value={line.packageUnit}
            required
            onChange={(event) => onChange({ packageUnit: event.target.value })}
          />
        </label>
        <label>
          Purchase quantity
          <input
            type="number"
            min="0"
            step="any"
            value={line.purchaseQuantity}
            required
            onChange={(event) =>
              onChange({ purchaseQuantity: event.target.value })
            }
          />
        </label>
        <UnknownNumberField
          label="Unit price"
          value={line.unitPrice}
          onChange={(unitPrice) => onChange({ unitPrice })}
        />
        <UnknownNumberField
          label="Line total"
          value={line.lineTotal}
          onChange={(lineTotal) => onChange({ lineTotal })}
        />
        <label>
          Currency
          <input value={line.currency} readOnly aria-readonly="true" />
        </label>
        <label className="span-2">
          Source URL
          <input
            type="url"
            value={line.sourceUrl}
            onChange={(event) => onChange({ sourceUrl: event.target.value })}
          />
        </label>
        <label>
          Commercial evidence checked
          <input
            type="datetime-local"
            value={line.checkedAt}
            required
            onChange={(event) => onChange({ checkedAt: event.target.value })}
          />
        </label>
        <label className="span-2">
          Selected evidence note
          <textarea
            rows={2}
            value={line.evidenceNote}
            onChange={(event) => onChange({ evidenceNote: event.target.value })}
          />
        </label>
      </div>
      <button
        className="button ghost destructive"
        type="button"
        disabled={!canRemove}
        onClick={onRemove}
      >
        <Trash2 size={14} /> Remove line
      </button>
    </fieldset>
  );
}

function BasketEditor({
  basket,
  index,
  suppliers,
  sourceOptions,
  onChange,
  onRemove,
  canRemove,
}: {
  basket: DraftBasketFormState;
  index: number;
  suppliers: Array<{ id: string; name: string }>;
  sourceOptions: (line: DraftLineFormState, supplierId: string) => SourceOption[];
  onChange: (basket: DraftBasketFormState) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const patch = (value: Partial<DraftBasketFormState>) =>
    onChange({ ...basket, ...value });
  const updateLine = (id: string, value: Partial<DraftLineFormState>) =>
    patch({
      lines: basket.lines.map((line) =>
        line.id === id ? { ...line, ...value } : line,
      ),
    });

  return (
    <fieldset className="panel draft-plan-basket">
      <legend>Supplier basket {index + 1}</legend>
      <div className="draft-plan-form-grid">
        <label>
          Workspace Supplier
          <select
            value={basket.supplierId}
            required
            onChange={(event) => patch({ supplierId: event.target.value })}
          >
            <option value="">Select Supplier…</option>
            {suppliers.map((supplier) => (
              <option value={supplier.id} key={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Basket currency
          <input
            value={basket.currency}
            maxLength={3}
            required
            onChange={(event) => {
              const currency = event.target.value.toUpperCase();
              patch({
                currency,
                lines: basket.lines.map((line) => ({ ...line, currency })),
              });
            }}
          />
        </label>
        <UnknownNumberField
          label="List subtotal"
          value={basket.listSubtotal}
          onChange={(listSubtotal) => patch({ listSubtotal })}
        />
        <UnknownNumberField
          label="Verified discount"
          value={basket.verifiedDiscount}
          onChange={(verifiedDiscount) => patch({ verifiedDiscount })}
        />
        <UnknownNumberField
          label="Post-discount subtotal"
          value={basket.postDiscountSubtotal}
          onChange={(postDiscountSubtotal) => patch({ postDiscountSubtotal })}
        />
        <UnknownNumberField
          label="Shipping"
          value={basket.shipping}
          onChange={(shipping) => patch({ shipping })}
        />
        <UnknownNumberField
          label="VAT adjustment"
          value={basket.vatAdjustment}
          allowNegative
          onChange={(vatAdjustment) => patch({ vatAdjustment })}
        />
        <UnknownNumberField
          label="Import VAT"
          value={basket.importVat}
          onChange={(importVat) => patch({ importVat })}
        />
        <UnknownNumberField
          label="Duty"
          value={basket.duty}
          onChange={(duty) => patch({ duty })}
        />
        <UnknownNumberField
          label="Dangerous-goods fee"
          value={basket.dangerousGoodsFee}
          onChange={(dangerousGoodsFee) => patch({ dangerousGoodsFee })}
        />
        <UnknownNumberField
          label="Brokerage / handling"
          value={basket.brokerageHandling}
          onChange={(brokerageHandling) => patch({ brokerageHandling })}
        />
        <UnknownNumberField
          label="Payment FX"
          value={basket.paymentFx}
          onChange={(paymentFx) => patch({ paymentFx })}
        />
        <UnknownNumberField
          label="Known minimum"
          value={basket.knownMinimum}
          onChange={(knownMinimum) => patch({ knownMinimum })}
        />
        <label>
          Basket evidence checked
          <input
            type="datetime-local"
            value={basket.checkedAt}
            required
            onChange={(event) => patch({ checkedAt: event.target.value })}
          />
        </label>
        <label className="span-2">
          Basket evidence note
          <textarea
            rows={2}
            value={basket.evidenceNote}
            onChange={(event) => patch({ evidenceNote: event.target.value })}
          />
        </label>
      </div>
      <div className="draft-plan-lines">
        {basket.lines.map((line) => (
          <LineEditor
            key={line.id}
            line={line}
            basketCurrency={basket.currency}
            sourceOptions={sourceOptions(line, basket.supplierId)}
            onChange={(value) => updateLine(line.id, value)}
            onRemove={() =>
              patch({ lines: basket.lines.filter((item) => item.id !== line.id) })
            }
            canRemove={basket.lines.length > 1}
          />
        ))}
      </div>
      <div className="action-row">
        <button
          className="button ghost"
          type="button"
          onClick={() =>
            patch({ lines: [...basket.lines, newDraftLine(basket.currency)] })
          }
        >
          <Plus size={14} /> Add line
        </button>
        <button
          className="button ghost destructive"
          type="button"
          disabled={!canRemove}
          onClick={onRemove}
        >
          <Trash2 size={14} /> Remove basket
        </button>
      </div>
    </fieldset>
  );
}

function ReviewSummary({ state }: { state: DraftPlanFormState }) {
  const unknown = state.baskets.reduce(
    (count, basket) =>
      count +
      [
        basket.shipping,
        basket.vatAdjustment,
        basket.importVat,
        basket.duty,
        basket.dangerousGoodsFee,
        basket.brokerageHandling,
        basket.paymentFx,
      ].filter((value) => value === null).length +
      basket.lines.flatMap((line) => [line.unitPrice, line.lineTotal]).filter(
        (value) => value === null,
      ).length,
    0,
  );
  const lines = state.baskets.reduce(
    (count, basket) => count + basket.lines.length,
    0,
  );
  return (
    <section className="panel draft-plan-review" aria-labelledby="review-title">
      <span className="eyebrow">Review before persistence</span>
      <h2 id="review-title">Confirm this internal Draft snapshot</h2>
      <dl>
        <div><dt>Plan</dt><dd>{state.title}</dd></div>
        <div><dt>Supplier baskets</dt><dd>{state.baskets.length}</dd></div>
        <div><dt>Line snapshots</dt><dd>{lines}</dd></div>
        <div><dt>Explicit Unknown cost fields</dt><dd>{unknown}</dd></div>
        <div><dt>Target ceiling</dt><dd>{state.targetBudget} {state.baseCurrency}</dd></div>
        <div><dt>Absolute stop</dt><dd>{state.absoluteStop} {state.baseCurrency}</dd></div>
        <div><dt>Order effect</dt><dd>None</dd></div>
      </dl>
      <p>
        This writes only one internal Draft Purchase Plan and its dependent
        basket/line snapshots. It creates no order, cart, payment, receipt,
        ownership, inventory, scenario publication, or Quality Release.
      </p>
    </section>
  );
}

export function DraftPurchasePlanBuilderPage() {
  const { workspace, data, error: procurementError } = useProcurement();
  const domain = useFormulaData();
  const navigate = useNavigate();
  const [state, setState] = useState(newDraftPlanForm);
  const [reviewing, setReviewing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const suppliers = useMemo(
    () =>
      (data?.suppliers ?? []).map((supplier) => ({
        id: supplier.id,
        name: supplier.trading_name || supplier.legal_name,
      })),
    [data],
  );
  const sources = (
    line: DraftLineFormState,
    supplierId: string,
  ): SourceOption[] => {
    if (line.sourceKind === "supplier_product")
      return domain.supplierProducts
        .filter((item) => !supplierId || item.supplierId === supplierId)
        .map((item) => ({
          id: item.id,
          title: item.productName,
          sku: item.supplierSku ?? "",
          packageQuantity: item.packageQuantity?.toString() ?? "",
          packageUnit: item.packageUnit ?? "",
          price: item.price?.toString() ?? null,
          currency: item.currency ?? "",
          url: item.productUrl ?? "",
        }));
    if (line.sourceKind === "packaging_supplier_product")
      return domain.packagingSupplierProducts
        .filter((item) => !supplierId || item.supplierId === supplierId)
        .map((item) => ({
          id: item.id,
          title: item.productName,
          sku: item.supplierSku ?? "",
          packageQuantity: item.packageQuantity?.toString() ?? "",
          packageUnit: item.packageUnit ?? "",
          price: item.price?.toString() ?? null,
          currency: item.currency ?? "",
          url: item.productUrl ?? "",
        }));
    if (line.sourceKind === "packaging_component")
      return domain.packagingComponents
        .filter((item) => !supplierId || !item.supplierId || item.supplierId === supplierId)
        .map((item) => ({
          id: item.id,
          title: item.name,
          sku: "",
          packageQuantity: item.capacity?.toString() ?? "1",
          packageUnit: item.capacityUnit ?? item.defaultUnit,
          price: null,
          currency: "",
          url: "",
        }));
    return [];
  };

  const updateBasket = (id: string, basket: DraftBasketFormState) =>
    setState((current) => ({
      ...current,
      baskets: current.baskets.map((item) => (item.id === id ? basket : item)),
    }));

  const review = () => {
    const errors = validateDraftPlanForm(state);
    if (errors.length) {
      setError(errors.join(" "));
      return;
    }
    try {
      draftPlanPayload(state, idempotencyKey);
      setError("");
      setReviewing(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Review failed.");
    }
  };

  const create = async () => {
    if (!workspace || pending) return;
    setPending(true);
    setError("");
    try {
      const result = await procurementActions.createDraftPurchasePlan(
        workspace.workspaceId,
        draftPlanPayload(state, idempotencyKey),
      );
      navigate(`/procurement/draft-plans/${result.aggregate.plan.id}`, {
        state: { receipt: result.receipt },
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Draft Purchase Plan could not be confirmed.",
      );
    } finally {
      setPending(false);
    }
  };

  if (procurementError)
    return (
      <section className="panel procurement-state" role="alert">
        <h1>Draft plan authoring unavailable</h1>
        <p>{procurementError}</p>
      </section>
    );
  if (!data)
    return (
      <section className="panel procurement-state" aria-busy="true">
        <p>Loading owner-authorized planning records…</p>
      </section>
    );

  return (
    <div className="draft-plan-workspace">
      <Link className="back-link" to="/procurement">
        <ArrowLeft size={14} /> Procurement
      </Link>
      <PageHeader
        eyebrow="Procurement / internal planning"
        title="Create Draft Purchase Plan"
        description="Author a supplier-basket snapshot without approving, placing, paying for, receiving, or owning anything."
      />
      <div className="operational-notice draft-only-warning" role="note">
        <ShieldCheck />
        <p>
          <strong>Draft only — does not place an order.</strong> Unknown costs
          remain Unknown. No supplier receives this plan.
        </p>
      </div>
      {error && (
        <p className="form-message error" role="alert">
          {error}
        </p>
      )}
      {reviewing ? (
        <>
          <ReviewSummary state={state} />
          <div className="draft-plan-sticky-actions">
            <button
              className="button ghost"
              type="button"
              disabled={pending}
              onClick={() => setReviewing(false)}
            >
              Back to edit
            </button>
            <button
              className="button primary"
              type="button"
              disabled={pending}
              onClick={() => void create()}
            >
              {pending ? "Confirming persistence…" : "Create Draft Purchase Plan"}
            </button>
          </div>
        </>
      ) : (
        <form
          className="draft-plan-builder"
          onSubmit={(event) => {
            event.preventDefault();
            review();
          }}
        >
          <section className="panel" aria-labelledby="draft-plan-details-title">
            <span className="eyebrow">Plan identity and guardrails</span>
            <h2 id="draft-plan-details-title">Draft plan details</h2>
            <div className="draft-plan-form-grid">
              <label className="span-2">
                Plan name
                <input
                  value={state.title}
                  required
                  onChange={(event) =>
                    setState({ ...state, title: event.target.value })
                  }
                />
              </label>
              <label className="span-2">
                Purpose
                <textarea
                  rows={2}
                  value={state.purpose}
                  required
                  onChange={(event) =>
                    setState({ ...state, purpose: event.target.value })
                  }
                />
              </label>
              <label>
                Target ceiling
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={state.targetBudget}
                  required
                  onChange={(event) =>
                    setState({ ...state, targetBudget: event.target.value })
                  }
                />
              </label>
              <label>
                Absolute stop
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={state.absoluteStop}
                  required
                  onChange={(event) =>
                    setState({ ...state, absoluteStop: event.target.value })
                  }
                />
              </label>
              <label>
                Base currency
                <input
                  value={state.baseCurrency}
                  maxLength={3}
                  required
                  onChange={(event) =>
                    setState({
                      ...state,
                      baseCurrency: event.target.value.toUpperCase(),
                    })
                  }
                />
              </label>
              <label>
                Target date
                <input
                  type="date"
                  value={state.targetDate}
                  onChange={(event) =>
                    setState({ ...state, targetDate: event.target.value })
                  }
                />
              </label>
              <UnknownNumberField
                label="Credible range minimum"
                value={state.credibleRangeMinimum}
                onChange={(credibleRangeMinimum) =>
                  setState({ ...state, credibleRangeMinimum })
                }
              />
              <UnknownNumberField
                label="Credible range maximum"
                value={state.credibleRangeMaximum}
                onChange={(credibleRangeMaximum) =>
                  setState({ ...state, credibleRangeMaximum })
                }
              />
              <UnknownNumberField
                label="Worst credible range minimum"
                value={state.worstCredibleRangeMinimum}
                onChange={(worstCredibleRangeMinimum) =>
                  setState({ ...state, worstCredibleRangeMinimum })
                }
              />
              <UnknownNumberField
                label="Worst credible range maximum"
                value={state.worstCredibleRangeMaximum}
                onChange={(worstCredibleRangeMaximum) =>
                  setState({ ...state, worstCredibleRangeMaximum })
                }
              />
              <UnknownNumberField
                label="Known merchandise total"
                value={state.knownMerchandiseTotal}
                onChange={(knownMerchandiseTotal) =>
                  setState({ ...state, knownMerchandiseTotal })
                }
              />
              <UnknownNumberField
                label="Known minimum"
                value={state.knownMinimum}
                onChange={(knownMinimum) =>
                  setState({ ...state, knownMinimum })
                }
              />
              <UnknownNumberField
                label="Estimated landed total"
                value={state.estimatedLandedTotal}
                onChange={(estimatedLandedTotal) =>
                  setState({ ...state, estimatedLandedTotal })
                }
              />
              <label>
                Commercial evidence checked
                <input
                  type="datetime-local"
                  value={state.checkedAt}
                  required
                  onChange={(event) =>
                    setState({ ...state, checkedAt: event.target.value })
                  }
                />
              </label>
              <label className="span-2">
                Notes
                <textarea
                  rows={3}
                  value={state.notes}
                  onChange={(event) =>
                    setState({ ...state, notes: event.target.value })
                  }
                />
              </label>
              <label className="span-2">
                Evidence note
                <textarea
                  rows={2}
                  value={state.evidenceNote}
                  onChange={(event) =>
                    setState({ ...state, evidenceNote: event.target.value })
                  }
                />
              </label>
            </div>
          </section>
          <section className="draft-plan-baskets" aria-labelledby="baskets-title">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Atomic dependent snapshots</span>
                <h2 id="baskets-title">Supplier baskets</h2>
              </div>
              <button
                className="button ghost"
                type="button"
                onClick={() =>
                  setState({
                    ...state,
                    baskets: [...state.baskets, newDraftBasket()],
                  })
                }
              >
                <Plus size={14} /> Add Supplier basket
              </button>
            </div>
            {state.baskets.map((basket, index) => (
              <BasketEditor
                key={basket.id}
                basket={basket}
                index={index}
                suppliers={suppliers}
                sourceOptions={sources}
                onChange={(value) => updateBasket(basket.id, value)}
                onRemove={() =>
                  setState({
                    ...state,
                    baskets: state.baskets.filter((item) => item.id !== basket.id),
                  })
                }
                canRemove={state.baskets.length > 1}
              />
            ))}
          </section>
          <div className="draft-plan-sticky-actions">
            <Link className="button ghost" to="/procurement">
              Cancel
            </Link>
            <button className="button primary" type="submit">
              Review Draft Purchase Plan
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
