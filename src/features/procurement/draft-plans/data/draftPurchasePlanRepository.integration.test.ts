/* eslint-disable @typescript-eslint/no-explicit-any -- local-only rehearsal spans newly generated relational surfaces */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadOwnerOperationEvidence } from "../../../../platform/operations/ownerOperationEvidenceRepository";
import { executeWorkspaceAction } from "../../../../platform/actions/workspaceActionExecutor";
import { SupabaseWorkspaceRepository } from "../../../../platform/repository/supabaseWorkspaceRepository";
import { supabase } from "../../../../platform/supabase/client";
import { confirmedPackagingUpdateReceipt } from "../../../packaging/domain/confirmedPackagingUpdate";
import type { DraftPurchasePlanInput } from "../../domain/procurement";
import {
  createDraftPurchasePlan,
  loadDraftPurchasePlan,
} from "../../data/procurementRepository";

const url = import.meta.env.VITE_SUPABASE_TEST_URL as string | undefined;
const serviceKey = import.meta.env.VITE_SUPABASE_TEST_SERVICE_ROLE_KEY as
  | string
  | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_TEST_ANON_KEY as string | undefined;
const run = url && serviceKey && anonKey && supabase ? describe : describe.skip;

run("owner-authored Draft Purchase Plan against local Supabase", () => {
  let admin: SupabaseClient;
  const users: string[] = [];

  beforeAll(() => {
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
  });
  afterAll(async () => {
    await supabase!.auth.signOut();
    for (const id of users) await admin.auth.admin.deleteUser(id);
  });

  const createOwner = async (label: string, shared = false) => {
    const email = `draft-plan-${label}-${crypto.randomUUID()}@example.test`;
    const password = `Local-${crypto.randomUUID()}-9a!`;
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (created.error) throw created.error;
    users.push(created.data.user.id);
    const client = shared
      ? supabase!
      : createClient(url!, anonKey!, { auth: { persistSession: false } });
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
    const workspace = await client.rpc("create_clean_workspace");
    if (workspace.error) throw workspace.error;
    return {
      client: client as SupabaseClient,
      email,
      password,
      ownerId: created.data.user.id,
      workspaceId: workspace.data as string,
    };
  };

  it("rehearses three baskets and twelve lines with null Unknowns, receipts, readback, export, denial, and no side effects", async () => {
    const owner = await createOwner("owner", true);
    const other = await createOwner("other");
    const now = "2026-07-31T12:00:00.000Z";
    const owned = { workspace_id: owner.workspaceId, owner_id: owner.ownerId };
    const otherOwned = {
      workspace_id: other.workspaceId,
      owner_id: other.ownerId,
    };

    expect(
      (
        await owner.client.from("ingredients").insert({
          ...owned,
          id: "draft-plan-ingredient",
          common_name: "Local rehearsal material",
          inci_name: "LOCAL REHEARSAL MATERIAL",
          category: "Planning",
          functions: ["Planning"],
          description: "Local-only source fixture",
          default_unit: "g",
          notes: "",
          status: "Active",
          created_at: now,
          updated_at: now,
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await other.client.from("ingredients").insert({
          ...otherOwned,
          id: "other-draft-plan-ingredient",
          common_name: "Other workspace material",
          inci_name: "OTHER WORKSPACE MATERIAL",
          category: "Planning",
          functions: ["Planning"],
          description: "Cross-workspace fixture",
          default_unit: "g",
          notes: "",
          status: "Active",
          created_at: now,
          updated_at: now,
        })
      ).error,
    ).toBeNull();

    const supplierRows = ["One", "Two", "Three"].map((name, index) => ({
      ...owned,
      legal_name: `Local Supplier ${name}`,
      trading_name: `Supplier ${name}`,
      supplier_type: "raw_material",
      status: "active",
      default_currency: ["NOK", "GBP", "USD"][index],
      internal_notes: "Local Draft authoring rehearsal only",
    }));
    const suppliers = await owner.client
      .from("suppliers")
      .insert(supplierRows)
      .select("id,trading_name,default_currency")
      .order("trading_name");
    expect(suppliers.error).toBeNull();
    expect(suppliers.data).toHaveLength(3);

    const otherSupplier = await other.client
      .from("suppliers")
      .insert({
        ...otherOwned,
        legal_name: "Other Supplier",
        supplier_type: "raw_material",
        status: "active",
      })
      .select("id")
      .single();
    expect(otherSupplier.error).toBeNull();

    const sourceRows = suppliers.data!.flatMap((supplier, supplierIndex) =>
      Array.from({ length: 4 }, (_, lineIndex) => ({
        ...owned,
        id: `draft-source-${supplierIndex + 1}-${lineIndex + 1}`,
        ingredient_id: "draft-plan-ingredient",
        supplier_id: supplier.id,
        supplier_name: supplier.trading_name!,
        product_name: `Exact local product ${supplierIndex + 1}.${lineIndex + 1}`,
        supplier_sku: `LOCAL-${supplierIndex + 1}-${lineIndex + 1}`,
        package_quantity: 100 + lineIndex,
        package_unit: "g",
        price: 20 + supplierIndex * 10 + lineIndex,
        currency: supplier.default_currency,
        product_url: `https://example.test/local/${supplierIndex + 1}/${lineIndex + 1}`,
        notes: "Local-only selected commercial source",
        is_preferred: false,
        created_at: now,
        updated_at: now,
      })),
    );
    expect(
      (await owner.client.from("supplier_products").insert(sourceRows)).error,
    ).toBeNull();
    expect(
      (
        await other.client.from("supplier_products").insert({
          ...otherOwned,
          id: "other-draft-source",
          ingredient_id: "other-draft-plan-ingredient",
          supplier_id: otherSupplier.data!.id,
          supplier_name: "Other Supplier",
          product_name: "Other source",
          package_quantity: 1,
          package_unit: "g",
          price: 1,
          currency: "NOK",
          notes: "Cross-workspace fixture",
          is_preferred: true,
          created_at: now,
          updated_at: now,
        })
      ).error,
    ).toBeNull();

    expect(
      (
        await owner.client.from("packaging_components").insert({
          ...owned,
          id: "draft-plan-packaging-component",
          name: "Local bottle candidate",
          category: "bottle",
          description: null,
          default_unit: "pcs",
          colour: null,
          material: null,
          capacity: 30,
          capacity_unit: "ml",
          notes: null,
          status: "selected",
          ownership_state: "not_owned",
          stock_state: "none",
          created_at: now,
          updated_at: now,
        })
      ).error,
    ).toBeNull();
    const workspaceRepository = new SupabaseWorkspaceRepository();
    const packagingBeforeState = await workspaceRepository.load(owner.ownerId);
    const packagingBefore = packagingBeforeState.packagingComponents.find(
      (item) => item.id === "draft-plan-packaging-component",
    )!;
    let packagingCommittedState = packagingBeforeState;
    await executeWorkspaceAction(
      workspaceRepository,
      packagingBeforeState,
      "updatePackagingComponent",
      (current) => ({
        ...current,
        packagingComponents: current.packagingComponents.map((item) =>
          item.id === packagingBefore.id
            ? {
                ...item,
                sourcingNotes: "Confirmed local source evidence",
                updatedAt: "2026-07-31T12:05:00.000Z",
              }
            : item,
        ),
      }),
      {
        pending: () => {},
        failed: () => {},
        committed: (next) => {
          packagingCommittedState = next;
        },
      },
    );
    const packagingPersisted = packagingCommittedState.packagingComponents.find(
      (item) => item.id === packagingBefore.id,
    );
    const packagingReceipt = confirmedPackagingUpdateReceipt(
      owner.workspaceId,
      packagingBefore,
      { sourcingNotes: "Confirmed local source evidence" },
      packagingPersisted,
    );
    expect(packagingReceipt).toMatchObject({
      entityType: "packaging_component",
      recordId: packagingBefore.id,
      workspaceId: owner.workspaceId,
      operation: "updated",
    });
    expect(
      (
        await owner.client
          .from("packaging_components")
          .select("id,sourcing_notes,ownership_state,stock_state")
          .eq("id", packagingBefore.id)
          .single()
      ).data,
    ).toEqual({
      id: packagingBefore.id,
      sourcing_notes: "Confirmed local source evidence",
      ownership_state: "not_owned",
      stock_state: "none",
    });

    let staleCommittedState = packagingBeforeState;
    let staleReceipt: unknown;
    await expect(
      executeWorkspaceAction(
        workspaceRepository,
        packagingBeforeState,
        "updatePackagingComponent",
        (current) => ({
          ...current,
          packagingComponents: current.packagingComponents.map((item) =>
            item.id === packagingBefore.id
              ? {
                  ...item,
                  sourcingNotes: "Stale unconfirmed edit",
                  updatedAt: "2026-07-31T12:06:00.000Z",
                }
              : item,
          ),
        }),
        {
          pending: () => {},
          failed: () => {},
          committed: (next) => {
            staleCommittedState = next;
            staleReceipt = confirmedPackagingUpdateReceipt(
              owner.workspaceId,
              packagingBefore,
              { sourcingNotes: "Stale unconfirmed edit" },
              next.packagingComponents.find(
                (item) => item.id === packagingBefore.id,
              ),
            );
          },
        },
      ),
    ).rejects.toThrow(/Conflict updating packaging_components/);
    expect(staleCommittedState).toBe(packagingBeforeState);
    expect(staleReceipt).toBeUndefined();

    const sideEffectTables = [
      "purchase_orders",
      "production_procurement_rounds",
      "production_procurement_scenarios",
      "production_procurement_scenario_baskets",
      "production_procurement_scenario_lines",
      "purchase_plan_verifications",
      "procurement_recommendations",
      "inventory_lots",
      "inventory_movements",
      "packaging_inventory_lots",
      "packaging_inventory_movements",
    ];
    const counts = async () =>
      Promise.all(
        sideEffectTables.map(async (table) => ({
          table,
          count: (
            await (admin.from(table) as any)
              .select("id", { count: "exact", head: true })
              .eq("workspace_id", owner.workspaceId)
          ).count,
        })),
      );
    const before = await counts();

    const basketLineTotals = suppliers.data!.map((_, supplierIndex) =>
      Array.from({ length: 4 }, (__, lineIndex) =>
        20 + supplierIndex * 10 + lineIndex,
      ),
    );
    const payload: DraftPurchasePlanInput = {
      idempotencyKey: crypto.randomUUID(),
      plan: {
        title: "Local Final Approval V2 structural rehearsal",
        purpose: "Prove generic owner-authored Draft plan capability locally.",
        targetDate: null,
        baseCurrency: "NOK",
        notes: "No order or supplier contact.",
        targetBudget: 3500,
        absoluteStop: 4000,
        credibleRangeMinimum: 2100,
        credibleRangeMaximum: 3100,
        worstCredibleRangeMinimum: 3100,
        worstCredibleRangeMaximum: 4000,
        knownMerchandiseTotal: 1602.65,
        knownMinimum: 1712.65,
        estimatedLandedTotal: null,
        checkedAt: now,
        evidence: { scope: "local-only structural rehearsal" },
      },
      baskets: suppliers.data!.map((supplier, supplierIndex) => {
        const lineTotals = basketLineTotals[supplierIndex];
        const listSubtotal = lineTotals.reduce((sum, value) => sum + value, 0);
        const first = supplierIndex === 0;
        return {
          supplierId: supplier.id,
          currency: supplier.default_currency!,
          listSubtotal,
          verifiedDiscount: first ? 5 : null,
          postDiscountSubtotal: first ? listSubtotal - 5 : null,
          shipping: first ? 110 : null,
          vatAdjustment: null,
          importVat: supplierIndex === 1 ? 25 : null,
          duty: supplierIndex === 2 ? 4 : null,
          dangerousGoodsFee: supplierIndex === 2 ? 6 : null,
          brokerageHandling: supplierIndex === 1 ? 3 : null,
          paymentFx: supplierIndex === 1 ? 2 : null,
          knownMinimum: first ? listSubtotal - 5 + 110 : null,
          checkedAt: now,
          warnings: first ? [] : ["Shipping and import costs remain Unknown."],
          evidence: { scope: `local basket ${supplierIndex + 1}` },
          lines: lineTotals.map((lineTotal, lineIndex) => ({
            sourceDomain: "raw_material" as const,
            sourceKind: "supplier_product" as const,
            sourceRecordId: `draft-source-${supplierIndex + 1}-${lineIndex + 1}`,
            productTitle: `Exact local product ${supplierIndex + 1}.${lineIndex + 1}`,
            sku: `LOCAL-${supplierIndex + 1}-${lineIndex + 1}`,
            packageQuantity: 100 + lineIndex,
            packageUnit: "g",
            purchaseQuantity: 1,
            unitPrice: lineTotal,
            lineTotal,
            currency: supplier.default_currency!,
            sourceUrl: `https://example.test/local/${supplierIndex + 1}/${lineIndex + 1}`,
            checkedAt: now,
            evidence: { selected: true, stock: "local_fixture" },
          })),
        };
      }),
    };

    const created = await createDraftPurchasePlan(owner.workspaceId, payload);
    expect(created.receipt.operation).toBe("created");
    expect(created.receipt.plan).toMatchObject({
      recordId: created.aggregate.plan.id,
      status: "draft",
      placementState: "unplaced",
      orderAuthorized: false,
    });
    expect(created.receipt.baskets).toHaveLength(3);
    expect(created.receipt.lines).toHaveLength(12);
    expect(new Set(created.receipt.lines.map((line) => line.recordId)).size).toBe(
      12,
    );
    expect(created.aggregate.plan).toMatchObject({
      status: "draft",
      placement_state: "unplaced",
      order_authorized: false,
      target_budget: 3500,
      absolute_stop: 4000,
      estimated_landed_total: null,
    });
    expect(created.aggregate.baskets).toHaveLength(3);
    expect(created.aggregate.lines).toHaveLength(12);
    const basketBySupplier = new Map(
      created.aggregate.baskets.map((basket) => [basket.supplier_id, basket]),
    );
    expect(basketBySupplier.get(suppliers.data![1].id)).toMatchObject({
      shipping: null,
      import_vat: 25,
      customs: null,
      dangerous_goods_fee: null,
      handling: 3,
      payment_fx: 2,
    });
    expect(basketBySupplier.get(suppliers.data![2].id)).toMatchObject({
      shipping: null,
      import_vat: null,
      customs: 4,
      dangerous_goods_fee: 6,
      handling: null,
      payment_fx: null,
    });

    const reloaded = await loadDraftPurchasePlan(
      owner.workspaceId,
      created.aggregate.plan.id,
    );
    expect(reloaded).toEqual(created.aggregate);

    const exported = await loadOwnerOperationEvidence(owner.workspaceId);
    expect(
      exported.records.purchase_plan?.map((row) => row.id),
    ).toContain(created.aggregate.plan.id);
    expect(
      exported.records.purchase_plan_basket?.map((row) => row.id),
    ).toEqual(created.aggregate.baskets.map((basket) => basket.id).sort());
    expect(
      exported.records.purchase_plan_line?.map((row) => row.id),
    ).toEqual(created.aggregate.lines.map((line) => line.id).sort());
    expect(
      exported.records.purchase_plan_basket?.filter(
        (row) => row.shipping === null,
      ),
    ).toHaveLength(2);
    expect(JSON.stringify(exported)).not.toMatch(
      /access_token|refresh_token|service_role|connection_string/i,
    );

    const aggregateCounts = async () => {
      const [plans, baskets, lines] = await Promise.all(
        ["purchase_plans", "purchase_plan_baskets", "purchase_plan_lines"].map(
          (table) =>
            owner.client
              .from(table)
              .select("id", { count: "exact", head: true })
              .eq("workspace_id", owner.workspaceId),
        ),
      );
      return {
        plans: plans.count,
        baskets: baskets.count,
        lines: lines.count,
      };
    };
    const createdCounts = await aggregateCounts();

    const replayed = await createDraftPurchasePlan(owner.workspaceId, payload);
    expect(replayed.receipt.operation).toBe("reused");
    expect(replayed.aggregate).toEqual(created.aggregate);
    expect(
      replayed.receipt.baskets.map((receipt) => receipt.recordId),
    ).toEqual(created.receipt.baskets.map((receipt) => receipt.recordId));
    expect(replayed.receipt.lines.map((line) => line.recordId)).toEqual(
      created.receipt.lines.map((line) => line.recordId),
    );
    expect(await aggregateCounts()).toEqual(createdCounts);

    await expect(
      createDraftPurchasePlan(owner.workspaceId, {
        ...payload,
        plan: { ...payload.plan, purpose: "Changed retry payload" },
      }),
    ).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
    expect(await aggregateCounts()).toEqual(createdCounts);

    const beforeInvalid = await aggregateCounts();
    const invalidBasket = structuredClone(payload);
    invalidBasket.idempotencyKey = crypto.randomUUID();
    invalidBasket.plan.title = "Invalid basket rollback";
    invalidBasket.baskets[1].currency = "NO";
    await expect(
      createDraftPurchasePlan(owner.workspaceId, invalidBasket),
    ).rejects.toThrow(/DRAFT_BASKET_CURRENCY_INVALID/);
    expect(await aggregateCounts()).toEqual(beforeInvalid);

    const invalidLine = structuredClone(payload);
    invalidLine.idempotencyKey = crypto.randomUUID();
    invalidLine.plan.title = "Invalid line rollback";
    invalidLine.baskets[2].lines[3].purchaseQuantity = -1;
    await expect(
      createDraftPurchasePlan(owner.workspaceId, invalidLine),
    ).rejects.toThrow(/DRAFT_LINE_QUANTITY_INVALID/);
    expect(await aggregateCounts()).toEqual(beforeInvalid);

    const crossSupplier = structuredClone(payload);
    crossSupplier.idempotencyKey = crypto.randomUUID();
    crossSupplier.plan.title = "Cross-workspace supplier denial";
    crossSupplier.baskets[0].supplierId = otherSupplier.data!.id;
    await expect(
      createDraftPurchasePlan(owner.workspaceId, crossSupplier),
    ).rejects.toThrow(/DRAFT_BASKET_SUPPLIER_UNAVAILABLE/);
    expect(await aggregateCounts()).toEqual(beforeInvalid);

    const crossSource = structuredClone(payload);
    crossSource.idempotencyKey = crypto.randomUUID();
    crossSource.plan.title = "Cross-workspace source denial";
    crossSource.baskets[0].lines[0].sourceRecordId = "other-draft-source";
    await expect(
      createDraftPurchasePlan(owner.workspaceId, crossSource),
    ).rejects.toThrow(/DRAFT_LINE_SOURCE_UNAVAILABLE/);
    expect(await aggregateCounts()).toEqual(beforeInvalid);

    const directPlan = await owner.client.from("purchase_plans").insert({
      ...owned,
      title: "Denied direct plan",
      status: "draft",
      purpose: "Denied",
    });
    expect(directPlan.error).not.toBeNull();

    const directBasket = await owner.client.from("purchase_plan_baskets").insert({
      ...owned,
      purchase_plan_id: created.aggregate.plan.id,
      supplier_id: suppliers.data![0].id,
      supplier_name_snapshot: "Denied",
      currency: "NOK",
    });
    expect(directBasket.error).not.toBeNull();
    const directLine = await owner.client.from("purchase_plan_lines").insert({
      ...owned,
      purchase_plan_id: created.aggregate.plan.id,
      inventory_domain: "raw_material",
      description: "Denied",
      planned_quantity: 1,
      unit: "g",
    });
    expect(directLine.error).not.toBeNull();
    for (const table of [
      "purchase_plans",
      "purchase_plan_baskets",
      "purchase_plan_lines",
    ]) {
      expect(
        (
          await owner.client
            .from(table)
            .update({ owner_id: owner.ownerId })
            .eq("workspace_id", owner.workspaceId)
        ).error,
      ).not.toBeNull();
      expect(
        (
          await owner.client
            .from(table)
            .delete()
            .eq("workspace_id", owner.workspaceId)
        ).error,
      ).not.toBeNull();
    }
    expect(await aggregateCounts()).toEqual(beforeInvalid);

    const anonymous = createClient(url!, anonKey!, {
      auth: { persistSession: false },
    });
    const anonymousAttempt = await anonymous.rpc("create_draft_purchase_plan_v1", {
      candidate_workspace_id: owner.workspaceId,
      candidate_idempotency_key: crypto.randomUUID(),
      candidate_plan: payload.plan,
      candidate_baskets: payload.baskets,
    });
    expect(anonymousAttempt.error).not.toBeNull();
    const nonOwnerAttempt = await other.client.rpc(
      "create_draft_purchase_plan_v1",
      {
        candidate_workspace_id: owner.workspaceId,
        candidate_idempotency_key: crypto.randomUUID(),
        candidate_plan: { ...payload.plan, title: "Non-owner denial" },
        candidate_baskets: payload.baskets,
      },
    );
    expect(nonOwnerAttempt.error?.message).toContain("WORKSPACE_UNAVAILABLE");

    expect(await counts()).toEqual(before);
    expect((await aggregateCounts()).plans).toBe(1);
    expect(
      (
        await owner.client
          .from("purchase_plans")
          .select("id", { count: "exact", head: true })
          .eq("status", "verification_required")
      ).count,
    ).toBe(0);
  });
});
