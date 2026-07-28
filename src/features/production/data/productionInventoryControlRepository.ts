import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../platform/supabase/generated/database.types";
import { supabase } from "../../../platform/supabase/client";
import {
  emptyBatchMaterialControlSnapshot,
  productionInventoryError,
  type BatchMaterialControlSnapshot,
  type BatchMaterialKind,
  type EligibleMaterialLot,
  type CompletionReadiness,
  type MaterialProvenance,
} from "../domain/productionInventoryControl";

type Client = SupabaseClient<Database>;
export class ProductionInventoryControlRepository {
  constructor(private readonly client: Client = requiredClient()) {}

  async load(kind: BatchMaterialKind, batchId: string): Promise<BatchMaterialControlSnapshot> {
    const results = await Promise.all([
      this.client.from("batch_material_lot_allocations").select("*").eq("batch_kind", kind)
        .or(kind === "lab" ? `lab_batch_id.eq.${batchId}` : `production_run_id.eq.${batchId}`),
      this.client.from("inventory_reservations").select("*").eq("batch_kind", kind).eq("batch_id", batchId),
      this.client.from("batch_material_weighings").select("*").eq("batch_kind", kind).eq("batch_id", batchId),
      this.client.from("batch_material_consumptions").select("*").eq("batch_kind", kind).eq("batch_id", batchId),
      this.client.from("batch_material_waste").select("*").eq("batch_kind", kind).eq("batch_id", batchId),
      this.client.from("batch_material_returns").select("*").eq("batch_kind", kind).eq("batch_id", batchId),
      this.client.from("batch_material_variances").select("*").eq("batch_kind", kind).eq("batch_id", batchId),
      this.client.from("batch_material_reconciliations").select("*").eq("batch_kind", kind).eq("batch_id", batchId),
      this.client.from("batch_material_events").select("*").eq("batch_kind", kind).eq("batch_id", batchId),
      kind === "lab"
        ? this.client.from("lab_batches").select("revision").eq("id", batchId).single()
        : this.client.from("production_runs").select("revision").eq("id", batchId).single(),
    ]);
    const failed = results.find((result) => result.error);
    if (failed?.error) throw productionInventoryError(failed.error);
    const snapshot = emptyBatchMaterialControlSnapshot();
    const [allocations, reservations, weighings, consumptions, waste, returns, variances, reconciliations, events, batch] =
      results.map((result) => result.data ?? []);
    return {
      ...snapshot,
      batchRevision: Number((batch as { revision?: number }).revision ?? 0),
      allocations: allocations as BatchMaterialControlSnapshot["allocations"],
      reservations: reservations as BatchMaterialControlSnapshot["reservations"],
      weighings: weighings as BatchMaterialControlSnapshot["weighings"],
      consumptions: consumptions as BatchMaterialControlSnapshot["consumptions"],
      waste: waste as BatchMaterialControlSnapshot["waste"],
      returns: returns as BatchMaterialControlSnapshot["returns"],
      variances: variances as BatchMaterialControlSnapshot["variances"],
      reconciliations: reconciliations as BatchMaterialControlSnapshot["reconciliations"],
      events: events as BatchMaterialControlSnapshot["events"],
    };
  }

  async eligibleLots(kind: BatchMaterialKind, batchId: string, requirementId: string): Promise<EligibleMaterialLot[]> {
    const result = await this.client.rpc("eligible_batch_material_lots", {
      target_batch_kind: kind,
      target_batch_id: batchId,
      target_requirement_id: requirementId,
    });
    if (result.error) throw productionInventoryError(result.error);
    return (result.data ?? []).map((row) => ({
      inventoryLotId: row.inventory_lot_id,
      internalLotNumber: row.internal_lot_number,
      supplierLotNumber: row.supplier_lot_number ?? undefined,
      receivedDate: row.received_date,
      releasedAt: row.released_at,
      expiryOrRetestDate: row.expiry_or_retest_date ?? undefined,
      location: row.location,
      unit: row.unit,
      movementBalance: Number(row.movement_balance),
      reservedBalance: Number(row.reserved_balance),
      availableBalance: Number(row.available_balance),
      unitCost: row.unit_cost == null ? undefined : Number(row.unit_cost),
      costCurrency: row.cost_currency ?? undefined,
      costConfidence: row.cost_confidence,
      fefoRank: Number(row.fefo_rank),
      eligibilityPolicyVersion: row.eligibility_policy_version,
    }));
  }

  async reserve(args: Database["public"]["Functions"]["reserve_batch_material_inventory"]["Args"]) {
    return response(await this.client.rpc("reserve_batch_material_inventory", args), "reserve_batch_material_inventory");
  }
  async release(args: Database["public"]["Functions"]["release_batch_material_reservation"]["Args"]) {
    return response(await this.client.rpc("release_batch_material_reservation", args), "release_batch_material_reservation");
  }
  async weigh(args: Database["public"]["Functions"]["record_batch_material_weighing"]["Args"]) {
    return response(await this.client.rpc("record_batch_material_weighing", args), "record_batch_material_weighing");
  }
  async weighV2(args: Database["public"]["Functions"]["record_batch_material_weighing_v2"]["Args"]) {
    return response(await this.client.rpc("record_batch_material_weighing_v2", args), "record_batch_material_weighing_v2");
  }
  async consume(args: Database["public"]["Functions"]["consume_reserved_batch_material"]["Args"]) {
    return response(await this.client.rpc("consume_reserved_batch_material", args), "consume_reserved_batch_material");
  }
  async recordReturn(args: Omit<Database["public"]["Functions"]["record_batch_material_return"]["Args"], "original_consumption_id"> & { original_consumption_id: string | null }) {
    return response(await this.client.rpc("record_batch_material_return", args), "record_batch_material_return");
  }
  async reconcile(args: Database["public"]["Functions"]["reconcile_batch_material_requirement"]["Args"]) {
    return response(await this.client.rpc("reconcile_batch_material_requirement", args), "reconcile_batch_material_requirement");
  }
  async completionReadiness(kind: BatchMaterialKind, batchId: string): Promise<CompletionReadiness> {
    const result = await this.client.rpc("get_batch_material_completion_readiness_v1", { target_batch_kind: kind, target_batch_id: batchId });
    if (result.error) throw productionInventoryError(result.error);
    return mapCompletionReadiness(result.data);
  }
  async provenance(kind: BatchMaterialKind, batchId: string, requirementId: string): Promise<MaterialProvenance> {
    const result = await this.client.rpc("get_batch_material_provenance_v1", {
      target_batch_kind: kind, target_batch_id: batchId, target_requirement_id: requirementId,
    });
    if (result.error) throw productionInventoryError(result.error);
    return mapMaterialProvenance(result.data);
  }
}

function object(value: unknown, contract: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${contract} returned an invalid object.`);
  return value as Record<string, unknown>;
}
function textValue(row: Record<string, unknown>, key: string, contract: string): string {
  if (typeof row[key] !== "string") throw new Error(`${contract} returned invalid ${key}.`);
  return row[key];
}
function numberValue(row: Record<string, unknown>, key: string, contract: string): number {
  const value = Number(row[key]);
  if (!Number.isFinite(value)) throw new Error(`${contract} returned invalid ${key}.`);
  return value;
}
function mapCompletionReadiness(value: unknown): CompletionReadiness {
  const contract = "get_batch_material_completion_readiness_v1", row = object(value, contract);
  if (!Array.isArray(row.blockers)) throw new Error(`${contract} returned invalid blockers.`);
  return {
    batchId: textValue(row, "batchId", contract),
    batchType: textValue(row, "batchType", contract) as CompletionReadiness["batchType"],
    batchRevision: numberValue(row, "batchRevision", contract),
    completionPolicyVersion: textValue(row, "completionPolicyVersion", contract),
    state: textValue(row, "state", contract) as CompletionReadiness["state"],
    readyForCompletion: row.readyForCompletion === true,
    completed: row.completed === true,
    totalRequirements: numberValue(row, "totalRequirements", contract),
    reconciledRequirements: numberValue(row, "reconciledRequirements", contract),
    blockedRequirements: numberValue(row, "blockedRequirements", contract),
    activeReservations: numberValue(row, "activeReservations", contract),
    missingPlannedWeighings: numberValue(row, "missingPlannedWeighings", contract),
    missingActualWeighings: numberValue(row, "missingActualWeighings", contract),
    missingYield: row.missingYield === true,
    blockers: row.blockers.map((value) => {
      const blocker = object(value, contract);
      return {
        blockerCode: textValue(blocker, "blockerCode", contract),
        category: textValue(blocker, "category", contract),
        severity: textValue(blocker, "severity", contract),
        blocksCompletion: blocker.blocksCompletion === true,
        requirementId: typeof blocker.requirementId === "string" ? blocker.requirementId : undefined,
        ingredientNameSnapshot: typeof blocker.ingredientNameSnapshot === "string" ? blocker.ingredientNameSnapshot : undefined,
        inventoryLotId: typeof blocker.inventoryLotId === "string" ? blocker.inventoryLotId : undefined,
        reservationId: typeof blocker.reservationId === "string" ? blocker.reservationId : undefined,
        quantity: blocker.quantity == null ? undefined : Number(blocker.quantity),
        unit: typeof blocker.unit === "string" ? blocker.unit : undefined,
        humanMessage: textValue(blocker, "humanMessage", contract),
        recommendedAction: textValue(blocker, "recommendedAction", contract),
      };
    }),
  };
}
function mapMaterialProvenance(value: unknown): MaterialProvenance {
  const contract = "get_batch_material_provenance_v1", row = object(value, contract);
  if (!Array.isArray(row.nodes)) throw new Error(`${contract} returned invalid nodes.`);
  return {
    contractVersion: textValue(row, "contractVersion", contract),
    batchId: textValue(row, "batchId", contract),
    batchType: textValue(row, "batchType", contract) as MaterialProvenance["batchType"],
    requirementId: textValue(row, "requirementId", contract),
    nodes: row.nodes.map((value) => {
      const node = object(value, contract);
      return {
        nodeType: textValue(node, "nodeType", contract),
        lifecycleStatus: textValue(node, "lifecycleStatus", contract) as MaterialProvenance["nodes"][number]["lifecycleStatus"],
        historicalLabel: textValue(node, "historicalLabel", contract),
        immutableId: typeof node.immutableId === "string" ? node.immutableId : undefined,
        parentId: typeof node.parentId === "string" ? node.parentId : undefined,
        quantity: node.quantity == null ? undefined : Number(node.quantity),
        unit: typeof node.unit === "string" ? node.unit : undefined,
        actor: typeof node.actor === "string" ? node.actor : undefined,
        timestamp: typeof node.timestamp === "string" ? node.timestamp : undefined,
        snapshot: object(node.snapshot ?? {}, contract),
        currentMasterDiffers: node.currentMasterDiffers === true,
      };
    }),
  };
}

function response(result: { data: unknown; error: { message: string } | null }, name: string): Record<string, unknown> {
  if (result.error) throw productionInventoryError(result.error);
  if (!result.data || typeof result.data !== "object" || Array.isArray(result.data))
    throw new Error(`${name} returned an invalid response.`);
  return result.data as Record<string, unknown>;
}

function requiredClient(): Client {
  if (!supabase) throw new Error("Supabase production inventory control is not configured.");
  return supabase;
}
