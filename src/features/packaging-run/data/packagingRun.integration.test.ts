import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../../platform/supabase/generated/database.types";
import { ProductionOutputRepository } from "../../production/data/productionOutputRepository";
import { PackagingRunRepository } from "./packagingRunRepository";

const url = import.meta.env.VITE_SUPABASE_TEST_URL as string | undefined;
const serviceKey = import.meta.env.VITE_SUPABASE_TEST_SERVICE_ROLE_KEY as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_TEST_ANON_KEY as string | undefined;
const run = url && serviceKey && anonKey ? describe : describe.skip;
type Client = SupabaseClient<Database>;

run("Packaging Run Planning & Control against local Supabase", () => {
  let admin: Client;
  const users: string[] = [];
  beforeAll(() => { admin = createClient<Database>(url!, serviceKey!, { auth: { persistSession: false } }); });
  afterAll(async () => { for (const id of users) await admin.auth.admin.deleteUser(id); });

  const owner = async (label: string) => {
    const email = `packaging-run-${label}-${crypto.randomUUID()}@example.test`;
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

  const fixture = async (label: string, retained = 100) => {
    const account = await owner(label);
    const now = "2026-07-28T10:00:00.000Z";
    const owned = { workspace_id: account.workspaceId, owner_id: account.ownerId };
    const productId = `product-pkg-${label}`, formulaId = `formula-pkg-${label}`, versionId = `version-pkg-${label}`;
    const runId = `run-pkg-${label}`, specificationId = `spec-pkg-${label}`, specificationVersionId = `specv-pkg-${label}`;
    expect((await account.client.from("products").insert({ ...owned, id: productId, name: "Packaging Product", category: "beard_oil", status: "Active", development_stage: "Production", description: "", scent_profile: "", created_at: now, updated_at: now })).error).toBeNull();
    expect((await account.client.from("formulas").insert({ ...owned, id: formulaId, product_id: productId, name: "Packaging Formula", description: "", created_at: now, updated_at: now })).error).toBeNull();
    expect((await account.client.from("formula_versions").insert({ ...owned, id: versionId, formula_id: formulaId, version: "1.0", status: "Approved", description: "", target_characteristics: "", phase_definitions: [], manufacturing_process: [], created_at: now, updated_at: now })).error).toBeNull();
    expect((await account.client.from("production_runs").insert({ ...owned, id: runId, production_run_number: `PR-PKG-${label}`, product_id: productId, formula_id: formulaId, formula_version_id: versionId, status: "Completed", planned_batch_size: retained, planned_batch_unit: "g", actual_yield: retained, actual_yield_unit: "g", completed_at: now, created_at: now, updated_at: now, purpose: "Packaging integration", notes: "", summary: "" })).error).toBeNull();
    expect((await account.client.from("packaging_specifications").insert({ ...owned, id: specificationId, product_id: productId, name: "Bottle + closure", description: "Retail pack", created_at: now, updated_at: now })).error).toBeNull();
    expect((await account.client.from("packaging_specification_versions").insert({ ...owned, id: specificationVersionId, packaging_specification_id: specificationId, version: "1.0", status: "Approved", description: "10 ml retail", notes: "", created_at: now, updated_at: now })).error).toBeNull();
    for (const [index, component] of ["bottle","closure"].entries()) {
      const componentId = `${component}-component-${label}`, lotId = `${component}-lot-${label}`;
      expect((await account.client.from("packaging_components").insert({ ...owned, id: componentId, name: component, category: component, description: "", default_unit: "pcs", colour: "", material: "", notes: "", status: "Active", created_at: now, updated_at: now })).error).toBeNull();
      expect((await account.client.from("packaging_specification_lines").insert({ ...owned, id: `${component}-line-${label}`, packaging_specification_version_id: specificationVersionId, packaging_component_id: componentId, quantity_per_unit: 1, unit: "pcs", sort_order: index, purpose: component, notes: "" })).error).toBeNull();
      expect((await account.client.from("packaging_inventory_lots").insert({ ...owned, id: lotId, packaging_component_id: componentId, internal_lot_number: `PKG-${component}-${label}`, received_date: "2026-07-20", opening_quantity: 30, unit: "pcs", location: "Packaging", status: "Active", notes: "", total_acquisition_cost: 30, acquisition_cost_currency: "NOK", created_at: now, updated_at: now })).error).toBeNull();
      expect((await account.client.from("packaging_inventory_movements").insert({ ...owned, id: `${component}-receipt-${label}`, packaging_inventory_lot_id: lotId, type: "Receipt", quantity: 30, unit: "pcs", reason: "Test receipt", notes: "", occurred_at: now, created_at: now })).error).toBeNull();
    }
    const outputRepository = new ProductionOutputRepository(account.client);
    const created = await outputRepository.create({
      target_production_run_id: runId, expected_batch_revision: 1, candidate_output_type: "bulk",
      candidate_output_label: "Packaging bulk", candidate_theoretical_quantity: retained, candidate_theoretical_unit: "g",
      candidate_theoretical_basis: "Approved plan", candidate_override_reason: "", candidate_override_evidence: "",
      candidate_measurement_basis: "Net vessel", candidate_location: "Production", candidate_idempotency_key: crypto.randomUUID(),
    });
    const outputId = String(created.productionOutputId);
    await outputRepository.measure({
      target_production_output_id: outputId, expected_output_revision: 1, candidate_quantity: retained, candidate_unit: "g",
      candidate_method: "Net vessel", candidate_equipment_reference: "", candidate_vessel_reference: "",
      candidate_gross_quantity: retained, candidate_tare_quantity: 0, candidate_evidence_reference: "", candidate_note: "",
      candidate_measured_at: now, candidate_idempotency_key: crypto.randomUUID(),
    });
    let output = await outputRepository.load(runId);
    await outputRepository.component({
      target_production_output_id: outputId, expected_output_revision: output.outputs[0].revision,
      candidate_component_type: "retained_bulk", candidate_quantity: retained, candidate_unit: "g",
      candidate_reason: "Available for packaging", candidate_evidence_reference: "", candidate_approval_state: "not_required",
      candidate_recorded_at: now, candidate_idempotency_key: crypto.randomUUID(),
    });
    output = await outputRepository.load(runId);
    await outputRepository.reconcile({
      target_production_output_id: outputId, expected_output_revision: output.outputs[0].revision,
      candidate_tolerance_quantity: 0, candidate_reason: "", candidate_evidence_reference: "",
      candidate_approve_variance: false, candidate_reconciled_at: now, candidate_idempotency_key: crypto.randomUUID(),
    });
    output = await outputRepository.load(runId);
    await outputRepository.complete({
      target_production_run_id: runId, expected_batch_revision: output.batchRevision,
      candidate_completed_at: now, candidate_idempotency_key: crypto.randomUUID(),
    });
    return { ...account, productId, outputId, specificationVersionId, runId };
  };

  it("reconstructs reservation, transfer, consumption, waste, reconciliation and completion without Finished Goods", async () => {
    const account = await fixture("flow");
    const repository = new PackagingRunRepository(account.client);
    const createArgs = {
      target_production_output_id: account.outputId,
      candidate_packaging_specification_version_id: account.specificationVersionId,
      candidate_run_label: "Retail fill", candidate_planned_bulk_quantity: 100, candidate_planned_bulk_unit: "g",
      candidate_planned_unit_count: 10, candidate_nominal_fill_quantity: 10, candidate_nominal_fill_unit: "g",
      candidate_location: "Packaging", candidate_idempotency_key: crypto.randomUUID(),
    };
    const created = await repository.create(createArgs);
    expect(created).toMatchObject({ retry: false, revision: 1 });
    expect(await repository.create(createArgs)).toMatchObject({ packagingRunId: created.packagingRunId, retry: true });
    const packagingRunId = String(created.packagingRunId);
    let snapshot = await repository.load(packagingRunId);
    await repository.allocateBulk({
      target_packaging_run_id: packagingRunId, expected_run_revision: snapshot.run.revision,
      candidate_quantity: 100, candidate_unit: "g", candidate_allocation_method: "Full retained bulk",
      candidate_idempotency_key: crypto.randomUUID(),
    });
    snapshot = await repository.load(packagingRunId);
    const allocation = snapshot.bulkAllocations[0];
    await repository.transferBulk({
      target_bulk_allocation_id: String(allocation.id), expected_run_revision: snapshot.run.revision,
      candidate_quantity: 100, candidate_unit: "g", candidate_measurement_method: "Net vessel",
      candidate_equipment_reference: "", candidate_source_vessel: "BULK-1", candidate_destination_vessel: "FILL-1",
      candidate_evidence_reference: "transfer-sheet", candidate_note: "", candidate_transferred_at: "2026-07-28T11:00:00Z",
      candidate_idempotency_key: crypto.randomUUID(),
    });
    snapshot = await repository.load(packagingRunId);
    for (const [index, requirement] of snapshot.requirements.entries()) {
      const lots = await repository.eligibleLots(String(requirement.id));
      expect(lots[0]).toMatchObject({ eligible: true, movementBalance: 30, activeReservations: 0 });
      const reserveQuantity = index === 0 ? 11 : 10;
      await repository.reserve({
        target_packaging_requirement_id: String(requirement.id), target_packaging_inventory_lot_id: lots[0].lotId,
        expected_run_revision: snapshot.run.revision, candidate_quantity: reserveQuantity, candidate_unit: "pcs",
        candidate_idempotency_key: crypto.randomUUID(),
      });
      snapshot = await repository.load(packagingRunId);
      const reservation = snapshot.reservations.find((item) => item.packaging_requirement_id === requirement.id)!;
      await repository.useInventory({
        target_packaging_reservation_id: String(reservation.id), expected_run_revision: snapshot.run.revision,
        candidate_use_type: "consumption", candidate_quantity: 10, candidate_unit: "pcs", candidate_category: "",
        candidate_reason: "Productive packaging", candidate_evidence_reference: "", candidate_occurred_at: "2026-07-28T11:10:00Z",
        candidate_idempotency_key: crypto.randomUUID(),
      });
      snapshot = await repository.load(packagingRunId);
      if (index === 0) {
        await repository.useInventory({
          target_packaging_reservation_id: String(reservation.id), expected_run_revision: snapshot.run.revision,
          candidate_use_type: "waste", candidate_quantity: 1, candidate_unit: "pcs", candidate_category: "label_defect",
          candidate_reason: "Damaged during setup", candidate_evidence_reference: "waste-photo",
          candidate_occurred_at: "2026-07-28T11:11:00Z", candidate_idempotency_key: crypto.randomUUID(),
        });
        snapshot = await repository.load(packagingRunId);
      }
    }
    await repository.reconcile({
      target_packaging_run_id: packagingRunId, expected_run_revision: snapshot.run.revision,
      candidate_pending_finished_goods_quantity: 100, candidate_retained_bulk_quantity: 0,
      candidate_bulk_waste_quantity: 0, candidate_unexplained_bulk_variance: 0,
      candidate_unexplained_packaging_variance: 0, candidate_reason: "", candidate_evidence_reference: "",
      candidate_approve_variance: false, candidate_reconciled_at: "2026-07-28T11:20:00Z",
      candidate_idempotency_key: crypto.randomUUID(),
    });
    snapshot = await repository.load(packagingRunId);
    expect(snapshot.readiness).toMatchObject({ readyForCompletion: true, activeReservations: 0, consumedCount: 2 });
    const completed = await repository.complete({
      target_packaging_run_id: packagingRunId, expected_run_revision: snapshot.run.revision,
      candidate_completed_at: "2026-07-28T11:30:00Z", candidate_idempotency_key: crypto.randomUUID(),
    });
    expect(completed).toMatchObject({ state: "ready_for_finished_goods_lot_creation", finishedGoodsCreated: false, finishedGoodsMovementCreated: false });
    snapshot = await repository.load(packagingRunId);
    expect(snapshot).toMatchObject({ run: { status: "completed" }, readiness: { completed: true } });
    expect(snapshot.inventoryUses.map((item) => item.use_type).sort()).toEqual(["consumption","consumption","waste"]);
    expect(new Set(snapshot.inventoryUses.map((item) => item.packaging_inventory_movement_id)).size).toBe(3);
    expect((await account.client.from("finished_goods_batches").select("id")).data).toEqual([]);
    expect((await account.client.from("finished_goods_movements").select("id")).data).toEqual([]);
    expect((await repository.genealogy(packagingRunId)).finishedGoodsLots).toEqual([]);
  });

  it("prevents concurrent bulk over-allocation and isolates owners", async () => {
    const account = await fixture("concurrency");
    const other = await owner("other");
    const repository = new PackagingRunRepository(account.client);
    const create = async (label: string) => repository.create({
      target_production_output_id: account.outputId,
      candidate_packaging_specification_version_id: account.specificationVersionId,
      candidate_run_label: label, candidate_planned_bulk_quantity: 70, candidate_planned_bulk_unit: "g",
      candidate_planned_unit_count: 7, candidate_nominal_fill_quantity: 10, candidate_nominal_fill_unit: "g",
      candidate_location: "Packaging", candidate_idempotency_key: crypto.randomUUID(),
    });
    const [first, second] = await Promise.all([create("Run A"),create("Run B")]);
    const results = await Promise.allSettled([first,second].map((created) => repository.allocateBulk({
      target_packaging_run_id: String(created.packagingRunId), expected_run_revision: 1,
      candidate_quantity: 70, candidate_unit: "g", candidate_allocation_method: "Concurrent test",
      candidate_idempotency_key: crypto.randomUUID(),
    })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await repository.availableBulk(account.outputId)).availableNormalizedQuantity).toBe(30);
    expect((await other.client.rpc("get_packaging_available_bulk_v1", { target_production_output_id: account.outputId })).error).not.toBeNull();
    expect((await account.client.from("packaging_runs").insert({} as never)).error).not.toBeNull();
  });

  it("reserves all components atomically, releases and safely returns staged stock without positive movements", async () => {
    const account = await fixture("returns");
    const repository = new PackagingRunRepository(account.client);
    const created = await repository.create({
      target_production_output_id: account.outputId,
      candidate_packaging_specification_version_id: account.specificationVersionId,
      candidate_run_label: "Return controls", candidate_planned_bulk_quantity: 100, candidate_planned_bulk_unit: "g",
      candidate_planned_unit_count: 10, candidate_nominal_fill_quantity: 10, candidate_nominal_fill_unit: "g",
      candidate_location: "Packaging", candidate_idempotency_key: crypto.randomUUID(),
    });
    const packagingRunId = String(created.packagingRunId);
    let snapshot = await repository.load(packagingRunId);
    const candidates = await Promise.all(snapshot.requirements.map(async (requirement) => ({
      packagingRequirementId: String(requirement.id),
      packagingInventoryLotId: (await repository.eligibleLots(String(requirement.id)))[0].lotId,
      quantity: 10, unit: "pcs", idempotencyKey: crypto.randomUUID(),
    })));
    await repository.reserveAll({
      target_packaging_run_id: packagingRunId, expected_run_revision: snapshot.run.revision,
      candidates, candidate_idempotency_key: crypto.randomUUID(),
    });
    snapshot = await repository.load(packagingRunId);
    expect(snapshot.reservations).toHaveLength(2);
    const [releasedReservationId,stagedReservationId] = snapshot.reservations.map((reservation) => String(reservation.id));
    const movementsBefore = (await account.client.from("packaging_inventory_movements").select("id")).data?.length ?? 0;
    await repository.releaseReservation({
      target_packaging_reservation_id: releasedReservationId, expected_run_revision: snapshot.run.revision,
      candidate_staged_return: false, candidate_reason: "Plan changed", candidate_evidence_reference: "",
      candidate_condition_acceptable: false, candidate_idempotency_key: crypto.randomUUID(),
    });
    snapshot = await repository.load(packagingRunId);
    await repository.releaseReservation({
      target_packaging_reservation_id: stagedReservationId, expected_run_revision: snapshot.run.revision,
      candidate_staged_return: true, candidate_reason: "Unused staged closure",
      candidate_evidence_reference: "condition-check-photo", candidate_condition_acceptable: true,
      candidate_idempotency_key: crypto.randomUUID(),
    });
    snapshot = await repository.load(packagingRunId);
    expect(snapshot.reservations.every((reservation) => reservation.status === "released")).toBe(true);
    expect(snapshot.events.map((event) => event.event_type)).toEqual(expect.arrayContaining([
      "packaging_reservation_released","packaging_staged_return_recorded",
    ]));
    expect((await account.client.from("packaging_inventory_movements").select("id")).data).toHaveLength(movementsBefore);
    for (const requirement of snapshot.requirements) {
      expect((await repository.eligibleLots(String(requirement.id)))[0].activeReservations).toBe(0);
    }
  });
});
