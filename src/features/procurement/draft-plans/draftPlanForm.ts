import type {
  DraftPlanSourceKind,
  DraftPurchasePlanInput,
} from "../domain/procurement";

export type NullableNumberText = string | null;

export interface DraftLineFormState {
  id: string;
  sourceDomain: "raw_material" | "packaging" | "equipment";
  sourceKind: DraftPlanSourceKind;
  sourceRecordId: string;
  productTitle: string;
  sku: string;
  packageQuantity: string;
  packageUnit: string;
  purchaseQuantity: string;
  unitPrice: NullableNumberText;
  lineTotal: NullableNumberText;
  currency: string;
  sourceUrl: string;
  checkedAt: string;
  evidenceNote: string;
}

export interface DraftBasketFormState {
  id: string;
  supplierId: string;
  currency: string;
  listSubtotal: NullableNumberText;
  verifiedDiscount: NullableNumberText;
  postDiscountSubtotal: NullableNumberText;
  shipping: NullableNumberText;
  vatAdjustment: NullableNumberText;
  importVat: NullableNumberText;
  duty: NullableNumberText;
  dangerousGoodsFee: NullableNumberText;
  brokerageHandling: NullableNumberText;
  paymentFx: NullableNumberText;
  knownMinimum: NullableNumberText;
  checkedAt: string;
  evidenceNote: string;
  lines: DraftLineFormState[];
}

export interface DraftPlanFormState {
  title: string;
  purpose: string;
  targetDate: string;
  baseCurrency: string;
  notes: string;
  targetBudget: string;
  absoluteStop: string;
  credibleRangeMinimum: NullableNumberText;
  credibleRangeMaximum: NullableNumberText;
  worstCredibleRangeMinimum: NullableNumberText;
  worstCredibleRangeMaximum: NullableNumberText;
  knownMerchandiseTotal: NullableNumberText;
  knownMinimum: NullableNumberText;
  estimatedLandedTotal: NullableNumberText;
  checkedAt: string;
  evidenceNote: string;
  baskets: DraftBasketFormState[];
}

const localDateTime = () => new Date().toISOString().slice(0, 16);

export const newDraftLine = (currency = "NOK"): DraftLineFormState => ({
  id: crypto.randomUUID(),
  sourceDomain: "raw_material",
  sourceKind: "supplier_product",
  sourceRecordId: "",
  productTitle: "",
  sku: "",
  packageQuantity: "",
  packageUnit: "",
  purchaseQuantity: "1",
  unitPrice: null,
  lineTotal: null,
  currency,
  sourceUrl: "",
  checkedAt: localDateTime(),
  evidenceNote: "",
});

export const newDraftBasket = (): DraftBasketFormState => ({
  id: crypto.randomUUID(),
  supplierId: "",
  currency: "NOK",
  listSubtotal: null,
  verifiedDiscount: null,
  postDiscountSubtotal: null,
  shipping: null,
  vatAdjustment: null,
  importVat: null,
  duty: null,
  dangerousGoodsFee: null,
  brokerageHandling: null,
  paymentFx: null,
  knownMinimum: null,
  checkedAt: localDateTime(),
  evidenceNote: "",
  lines: [newDraftLine()],
});

export const newDraftPlanForm = (): DraftPlanFormState => ({
  title: "",
  purpose: "",
  targetDate: "",
  baseCurrency: "NOK",
  notes: "",
  targetBudget: "",
  absoluteStop: "",
  credibleRangeMinimum: null,
  credibleRangeMaximum: null,
  worstCredibleRangeMinimum: null,
  worstCredibleRangeMaximum: null,
  knownMerchandiseTotal: null,
  knownMinimum: null,
  estimatedLandedTotal: null,
  checkedAt: localDateTime(),
  evidenceNote: "",
  baskets: [newDraftBasket()],
});

const requiredNumber = (value: string, label: string) => {
  const parsed = Number(value);
  if (!value.trim() || !Number.isFinite(parsed) || parsed < 0)
    throw new Error(`${label} must be a valid non-negative number.`);
  return parsed;
};

const optionalNumber = (value: NullableNumberText, label: string) => {
  if (value === null) return null;
  const parsed = Number(value);
  if (value.trim() === "" || !Number.isFinite(parsed))
    throw new Error(`${label} must be a valid number or explicitly Unknown.`);
  return parsed;
};

const checkedTimestamp = (value: string, label: string) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime()))
    throw new Error(`${label} requires a valid checked timestamp.`);
  return date.toISOString();
};

export function validateDraftPlanForm(state: DraftPlanFormState) {
  const errors: string[] = [];
  if (!state.title.trim()) errors.push("Plan name is required.");
  if (!state.purpose.trim()) errors.push("Purpose is required.");
  if (!/^[A-Z]{3}$/.test(state.baseCurrency.trim().toUpperCase()))
    errors.push("Base currency must use three letters.");
  const target = Number(state.targetBudget);
  const stop = Number(state.absoluteStop);
  if (!state.targetBudget || !Number.isFinite(target) || target <= 0)
    errors.push("Target budget must be greater than zero.");
  if (!state.absoluteStop || !Number.isFinite(stop) || stop < target)
    errors.push("Absolute stop must be at least the target budget.");
  if (!state.baskets.length)
    errors.push("At least one Supplier basket is required.");

  for (const [basketIndex, basket] of state.baskets.entries()) {
    if (!basket.supplierId)
      errors.push(`Basket ${basketIndex + 1} requires a Supplier.`);
    if (!/^[A-Z]{3}$/.test(basket.currency.trim().toUpperCase()))
      errors.push(`Basket ${basketIndex + 1} requires a three-letter currency.`);
    if (!basket.lines.length)
      errors.push(`Basket ${basketIndex + 1} requires at least one line.`);

    for (const [lineIndex, line] of basket.lines.entries()) {
      const prefix = `Basket ${basketIndex + 1}, line ${lineIndex + 1}`;
      if (line.sourceKind !== "manual" && !line.sourceRecordId)
        errors.push(`${prefix} requires a source record.`);
      if (!line.productTitle.trim())
        errors.push(`${prefix} requires an exact product title.`);
      if (!(Number(line.packageQuantity) > 0) || !line.packageUnit.trim())
        errors.push(`${prefix} requires a positive package quantity and unit.`);
      if (!(Number(line.purchaseQuantity) > 0))
        errors.push(`${prefix} requires a positive purchase quantity.`);
      if (
        line.currency.trim().toUpperCase() !==
        basket.currency.trim().toUpperCase()
      )
        errors.push(`${prefix} currency must match its basket.`);
    }
  }
  return errors;
}

export function draftPlanPayload(
  state: DraftPlanFormState,
  idempotencyKey: string,
): DraftPurchasePlanInput {
  const errors = validateDraftPlanForm(state);
  if (errors.length) throw new Error(errors.join(" "));

  const range = (
    minimum: NullableNumberText,
    maximum: NullableNumberText,
    label: string,
  ) => {
    if ((minimum === null) !== (maximum === null))
      throw new Error(`${label} requires both bounds or both Unknown.`);
    return [
      optionalNumber(minimum, `${label} minimum`),
      optionalNumber(maximum, `${label} maximum`),
    ] as const;
  };
  const [credibleMin, credibleMax] = range(
    state.credibleRangeMinimum,
    state.credibleRangeMaximum,
    "Credible range",
  );
  const [worstMin, worstMax] = range(
    state.worstCredibleRangeMinimum,
    state.worstCredibleRangeMaximum,
    "Worst credible range",
  );

  return {
    idempotencyKey,
    plan: {
      title: state.title.trim(),
      purpose: state.purpose.trim(),
      targetDate: state.targetDate || null,
      baseCurrency: state.baseCurrency.trim().toUpperCase(),
      notes: state.notes.trim(),
      targetBudget: requiredNumber(state.targetBudget, "Target budget"),
      absoluteStop: requiredNumber(state.absoluteStop, "Absolute stop"),
      credibleRangeMinimum: credibleMin,
      credibleRangeMaximum: credibleMax,
      worstCredibleRangeMinimum: worstMin,
      worstCredibleRangeMaximum: worstMax,
      knownMerchandiseTotal: optionalNumber(
        state.knownMerchandiseTotal,
        "Known merchandise total",
      ),
      knownMinimum: optionalNumber(state.knownMinimum, "Known minimum"),
      estimatedLandedTotal: optionalNumber(
        state.estimatedLandedTotal,
        "Estimated landed total",
      ),
      checkedAt: checkedTimestamp(state.checkedAt, "Plan"),
      evidence: { note: state.evidenceNote.trim() },
    },
    baskets: state.baskets.map((basket, basketIndex) => ({
      supplierId: basket.supplierId,
      currency: basket.currency.trim().toUpperCase(),
      listSubtotal: optionalNumber(
        basket.listSubtotal,
        `Basket ${basketIndex + 1} list subtotal`,
      ),
      verifiedDiscount: optionalNumber(
        basket.verifiedDiscount,
        `Basket ${basketIndex + 1} verified discount`,
      ),
      postDiscountSubtotal: optionalNumber(
        basket.postDiscountSubtotal,
        `Basket ${basketIndex + 1} post-discount subtotal`,
      ),
      shipping: optionalNumber(
        basket.shipping,
        `Basket ${basketIndex + 1} shipping`,
      ),
      vatAdjustment: optionalNumber(
        basket.vatAdjustment,
        `Basket ${basketIndex + 1} VAT adjustment`,
      ),
      importVat: optionalNumber(
        basket.importVat,
        `Basket ${basketIndex + 1} import VAT`,
      ),
      duty: optionalNumber(
        basket.duty,
        `Basket ${basketIndex + 1} duty`,
      ),
      dangerousGoodsFee: optionalNumber(
        basket.dangerousGoodsFee,
        `Basket ${basketIndex + 1} dangerous-goods fee`,
      ),
      brokerageHandling: optionalNumber(
        basket.brokerageHandling,
        `Basket ${basketIndex + 1} brokerage and handling`,
      ),
      paymentFx: optionalNumber(
        basket.paymentFx,
        `Basket ${basketIndex + 1} payment FX`,
      ),
      knownMinimum: optionalNumber(
        basket.knownMinimum,
        `Basket ${basketIndex + 1} known minimum`,
      ),
      checkedAt: checkedTimestamp(
        basket.checkedAt,
        `Basket ${basketIndex + 1}`,
      ),
      warnings: [],
      evidence: { note: basket.evidenceNote.trim() },
      lines: basket.lines.map((line, lineIndex) => ({
        sourceDomain: line.sourceDomain,
        sourceKind: line.sourceKind,
        sourceRecordId:
          line.sourceKind === "manual" ? null : line.sourceRecordId,
        productTitle: line.productTitle.trim(),
        sku: line.sku.trim() || null,
        packageQuantity: requiredNumber(
          line.packageQuantity,
          `Basket ${basketIndex + 1}, line ${lineIndex + 1} package quantity`,
        ),
        packageUnit: line.packageUnit.trim(),
        purchaseQuantity: requiredNumber(
          line.purchaseQuantity,
          `Basket ${basketIndex + 1}, line ${lineIndex + 1} purchase quantity`,
        ),
        unitPrice: optionalNumber(
          line.unitPrice,
          `Basket ${basketIndex + 1}, line ${lineIndex + 1} unit price`,
        ),
        lineTotal: optionalNumber(
          line.lineTotal,
          `Basket ${basketIndex + 1}, line ${lineIndex + 1} line total`,
        ),
        currency: line.currency.trim().toUpperCase(),
        sourceUrl: line.sourceUrl.trim() || null,
        checkedAt: checkedTimestamp(
          line.checkedAt,
          `Basket ${basketIndex + 1}, line ${lineIndex + 1}`,
        ),
        evidence: { note: line.evidenceNote.trim() },
      })),
    })),
  };
}
