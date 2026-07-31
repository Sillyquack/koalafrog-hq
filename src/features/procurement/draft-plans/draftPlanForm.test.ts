import { describe, expect, it } from "vitest";
import {
  draftPlanPayload,
  newDraftPlanForm,
  validateDraftPlanForm,
} from "./draftPlanForm";

const validState = () => {
  const state = newDraftPlanForm();
  state.title = "First internal plan";
  state.purpose = "Owner planning snapshot";
  state.targetBudget = "3500";
  state.absoluteStop = "4000";
  state.baskets[0].supplierId = "11111111-1111-4111-8111-111111111111";
  state.baskets[0].lines[0] = {
    ...state.baskets[0].lines[0],
    sourceKind: "manual",
    sourceDomain: "equipment",
    productTitle: "Exact local item",
    packageQuantity: "1",
    packageUnit: "pcs",
    purchaseQuantity: "2",
  };
  return state;
};

describe("Draft Purchase Plan form contract", () => {
  it("preserves every explicit Unknown cost as null", () => {
    const payload = draftPlanPayload(
      validState(),
      "22222222-2222-4222-8222-222222222222",
    );
    expect(payload.plan.estimatedLandedTotal).toBeNull();
    expect(payload.baskets[0]).toMatchObject({
      shipping: null,
      vatAdjustment: null,
      importVat: null,
      duty: null,
      dangerousGoodsFee: null,
      brokerageHandling: null,
      paymentFx: null,
    });
    expect(payload.baskets[0].lines[0]).toMatchObject({
      sourceRecordId: null,
      unitPrice: null,
      lineTotal: null,
    });
  });

  it("requires reviewable identity, budgets, a Supplier, and exact lines", () => {
    expect(validateDraftPlanForm(newDraftPlanForm())).toEqual(
      expect.arrayContaining([
        "Plan name is required.",
        "Purpose is required.",
        "Target budget must be greater than zero.",
        "Basket 1 requires a Supplier.",
      ]),
    );
  });

  it("rejects a partial range instead of inventing its missing bound", () => {
    const state = validState();
    state.credibleRangeMinimum = "2100";
    expect(() =>
      draftPlanPayload(state, "22222222-2222-4222-8222-222222222222"),
    ).toThrow(/both bounds or both Unknown/);
  });
});
