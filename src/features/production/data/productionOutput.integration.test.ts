import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../../platform/supabase/generated/database.types";
import { ProductionOutputRepository } from "./productionOutputRepository";

const url = import.meta.env.VITE_SUPABASE_TEST_URL as string | undefined;
const serviceKey = import.meta.env.VITE_SUPABASE_TEST_SERVICE_ROLE_KEY as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_TEST_ANON_KEY as string | undefined;
const run = url && serviceKey && anonKey ? describe : describe.skip;
type Client = SupabaseClient<Database>;

run("Production Output & Yield against local Supabase", () => {
  let admin: Client;
  const users: string[] = [];
  beforeAll(() => { admin = createClient<Database>(url!, serviceKey!, { auth: { persistSession: false } }); });
  afterAll(async () => { for (const id of users) await admin.auth.admin.deleteUser(id); });

  const owner = async (label: string) => {
    const email = `production-output-${label}-${crypto.randomUUID()}@example.test`;
    const password = `Local-${crypto.randomUUID()}-9a!`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    users.push(created.data.user.id);
    const client = createClient<Database>(url!, anonKey!, { auth: { persistSession: false } });
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error) throw signed.error;
    const workspace = await client.rpc("create_clean_workspace");
    if (workspace.error) throw workspace.error;
    return { client, ownerId: created.data.user.id, workspaceId: String(workspace.data) };
  };
  const fixture = async (label: string) => {
    const account = await owner(label);
    const now = "2026-07-28T10:00:00.000Z";
    const owned = { workspace_id: account.workspaceId, owner_id: account.ownerId };
    expect((await account.client.from("products").insert({ ...owned, id: `product-output-${label}`, name: "Output Product", category: "beard_oil", status: "Active", development_stage: "Production", description: "", scent_profile: "", created_at: now, updated_at: now })).error).toBeNull();
    expect((await account.client.from("formulas").insert({ ...owned, id: `formula-output-${label}`, product_id: `product-output-${label}`, name: "Output Formula", description: "", created_at: now, updated_at: now })).error).toBeNull();
    expect((await account.client.from("formula_versions").insert({ ...owned, id: `version-output-${label}`, formula_id: `formula-output-${label}`, version: "1.0", status: "Approved", description: "", target_characteristics: "", phase_definitions: [], manufacturing_process: [], created_at: now, updated_at: now })).error).toBeNull();
    expect((await account.client.from("production_runs").insert({ ...owned, id: `run-output-${label}`, production_run_number: `PR-OUTPUT-${label}`, product_id: `product-output-${label}`, formula_id: `formula-output-${label}`, formula_version_id: `version-output-${label}`, status: "Completed", planned_batch_size: 100, planned_batch_unit: "g", actual_yield: 100, actual_yield_unit: "g", completed_at: now, created_at: now, updated_at: now, purpose: "Output integration", notes: "", summary: "" })).error).toBeNull();
    return account;
  };

  it("creates, measures, reconciles, completes, refreshes and preserves genealogy without Finished Goods", async () => {
    const account = await fixture("flow");
    const repository = new ProductionOutputRepository(account.client);
    const createKey = crypto.randomUUID();
    const createArgs = {
      target_production_run_id: "run-output-flow", expected_batch_revision: 1, candidate_output_type: "bulk",
      candidate_output_label: "Primary bulk", candidate_theoretical_quantity: 100, candidate_theoretical_unit: "g",
      candidate_theoretical_basis: "Approved Production plan", candidate_override_reason: "", candidate_override_evidence: "",
      candidate_measurement_basis: "Net vessel measurement", candidate_location: "Production", candidate_idempotency_key: createKey,
    };
    const created = await repository.create(createArgs);
    expect(created).toMatchObject({ retry: false, revision: 1 });
    expect(await repository.create(createArgs)).toMatchObject({ productionOutputId: created.productionOutputId, retry: true });
    await expect(repository.create({ ...createArgs, candidate_output_label: "Changed" })).rejects.toThrow(/action key|IDEMPOTENCY_CONFLICT/);
    const outputId = String(created.productionOutputId);
    let snapshot = await repository.load("run-output-flow");
    expect(snapshot.outputs[0]).toMatchObject({ theoretical_quantity: 100, product_name_snapshot: "Output Product", formula_version_snapshot: "1.0" });
    expect(snapshot.measurements).toHaveLength(0);
    const measurementKey = crypto.randomUUID();
    const measurement = await repository.measure({
      target_production_output_id: outputId, expected_output_revision: 1, candidate_quantity: 100, candidate_unit: "g",
      candidate_method: "Net vessel measurement", candidate_equipment_reference: "SCALE-01", candidate_vessel_reference: "VESSEL-A",
      candidate_gross_quantity: 120, candidate_tare_quantity: 20, candidate_evidence_reference: "weight-photo",
      candidate_note: "Stable", candidate_measured_at: "2026-07-28T11:00:00Z", candidate_idempotency_key: measurementKey,
    });
    expect(await repository.measure({
      target_production_output_id: outputId, expected_output_revision: 1, candidate_quantity: 100, candidate_unit: "g",
      candidate_method: "Net vessel measurement", candidate_equipment_reference: "SCALE-01", candidate_vessel_reference: "VESSEL-A",
      candidate_gross_quantity: 120, candidate_tare_quantity: 20, candidate_evidence_reference: "weight-photo",
      candidate_note: "Stable", candidate_measured_at: "2026-07-28T11:00:00Z", candidate_idempotency_key: measurementKey,
    })).toMatchObject({ measurementId: measurement.measurementId, retry: true });
    for (const [type, quantity, reason, approval] of [
      ["retained_bulk", 95, "Available for later packaging", "not_required"],
      ["bulk_waste", 3, "Vessel residue", "not_required"],
      ["unexplained_variance", 2, "Measured variance reviewed", "approved"],
    ] as const) {
      snapshot = await repository.load("run-output-flow");
      await repository.component({
        target_production_output_id: outputId, expected_output_revision: snapshot.outputs[0].revision,
        candidate_component_type: type, candidate_quantity: quantity, candidate_unit: "g", candidate_reason: reason,
        candidate_evidence_reference: type === "unexplained_variance" ? "variance-review" : "",
        candidate_approval_state: approval, candidate_recorded_at: "2026-07-28T11:10:00Z", candidate_idempotency_key: crypto.randomUUID(),
      });
    }
    snapshot = await repository.load("run-output-flow");
    await repository.reconcile({
      target_production_output_id: outputId, expected_output_revision: snapshot.outputs[0].revision,
      candidate_tolerance_quantity: 0.01, candidate_reason: "Two grams documented variance",
      candidate_evidence_reference: "variance-review", candidate_approve_variance: true,
      candidate_reconciled_at: "2026-07-28T11:20:00Z", candidate_idempotency_key: crypto.randomUUID(),
    });
    snapshot = await repository.load("run-output-flow");
    expect(snapshot.readiness).toMatchObject({ readyForCompletion: true, incompleteOutputRecords: 0 });
    expect((await repository.genealogy(outputId)).materialRequirements).toEqual([]);
    await repository.complete({
      target_production_run_id: "run-output-flow", expected_batch_revision: snapshot.batchRevision,
      candidate_completed_at: "2026-07-28T11:30:00Z", candidate_idempotency_key: crypto.randomUUID(),
    });
    snapshot = await repository.load("run-output-flow");
    expect(snapshot).toMatchObject({ outputStageStatus: "completed", readiness: { completed: true } });
    expect(snapshot.outputs[0].status).toBe("completed");
    expect((await account.client.from("finished_goods_batches").select("id").eq("production_run_id", "run-output-flow")).data).toEqual([]);
    expect((await account.client.from("finished_goods_movements").select("id")).data).toEqual([]);
    expect((await account.client.from("packaging_inventory_movements").select("id").eq("reference_id", outputId)).data).toEqual([]);
  });

  it("denies pre-completion, direct writes, anonymous and cross-owner access", async () => {
    const account = await fixture("security");
    const other = await owner("security-other");
    const anonymous = createClient<Database>(url!, anonKey!, { auth: { persistSession: false } });
    await account.client.from("production_runs").update({ status: "In Progress" }).eq("id", "run-output-security");
    const args = {
      target_production_run_id: "run-output-security", expected_batch_revision: 1, candidate_output_type: "bulk",
      candidate_output_label: "Blocked", candidate_theoretical_quantity: 100, candidate_theoretical_unit: "g",
      candidate_theoretical_basis: "Plan", candidate_override_reason: "", candidate_override_evidence: "",
      candidate_measurement_basis: "Net", candidate_location: "Production", candidate_idempotency_key: crypto.randomUUID(),
    };
    expect((await account.client.rpc("create_production_output_v1", args)).error?.message).toContain("PRODUCTION_MATERIAL_NOT_COMPLETE");
    expect((await anonymous.rpc("create_production_output_v1", args)).error).not.toBeNull();
    expect((await other.client.rpc("get_production_output_completion_readiness_v1", { target_production_run_id: "run-output-security" })).error).not.toBeNull();
    expect((await account.client.from("production_outputs").insert({} as never)).error).not.toBeNull();
    expect((await account.client.from("production_output_events").insert({} as never)).error).not.toBeNull();
  });
});
