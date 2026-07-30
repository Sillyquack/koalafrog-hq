import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../platform/supabase/client";
import type { Database } from "../../../platform/supabase/generated/database.types";
import {
  packagingRunError,
  type PackagingBulkAvailability,
  type PackagingCompletionReadiness,
  type PackagingEligibleLot,
  type PackagingRunRecord,
  type PackagingRunSnapshot,
} from "../domain/packagingRun";

type Client = SupabaseClient<Database>;
type Functions = Database["public"]["Functions"];

export class PackagingRunRepository {
  constructor(private readonly client: Client = requiredClient()) {}

  async runsByOutput(productionOutputId: string): Promise<PackagingRunRecord[]> {
    const result = await this.client.from("packaging_runs").select("*")
      .eq("production_output_id", productionOutputId).order("run_sequence");
    if (result.error) throw packagingRunError(result.error);
    return (result.data ?? []) as unknown as PackagingRunRecord[];
  }

  async availableBulk(productionOutputId: string): Promise<PackagingBulkAvailability> {
    const result = await this.client.rpc("get_packaging_available_bulk_v1", {
      target_production_output_id: productionOutputId,
    });
    if (result.error) throw packagingRunError(result.error);
    return camelAvailability(result.data);
  }

  async approvedSpecifications(productId: string) {
    const specifications = await this.client.from("packaging_specifications").select("id,name").eq("product_id", productId);
    if (specifications.error) throw packagingRunError(specifications.error);
    const ids = (specifications.data ?? []).map((item) => item.id);
    if (!ids.length) return [];
    const versions = await this.client.from("packaging_specification_versions").select("id,version,packaging_specification_id")
      .in("packaging_specification_id", ids).eq("status", "Approved").order("version");
    if (versions.error) throw packagingRunError(versions.error);
    return (versions.data ?? []).map((version) => ({
      ...version,
      name: specifications.data?.find((item) => item.id === version.packaging_specification_id)?.name ?? version.id,
    }));
  }

  async load(packagingRunId: string): Promise<PackagingRunSnapshot> {
    const [run, requirements, bulkAllocations, bulkTransfers, reservations, inventoryUses, reconciliations, events, readiness] =
      await Promise.all([
        this.client.from("packaging_runs").select("*").eq("id", packagingRunId).single(),
        this.client.from("packaging_run_requirements").select("*").eq("packaging_run_id", packagingRunId).order("sequence"),
        this.client.from("packaging_run_bulk_allocations").select("*").eq("packaging_run_id", packagingRunId),
        this.client.from("packaging_run_bulk_transfers").select("*").eq("packaging_run_id", packagingRunId).order("transferred_at"),
        this.client.from("packaging_run_reservations").select("*").eq("packaging_run_id", packagingRunId).order("reserved_at"),
        this.client.from("packaging_run_inventory_uses").select("*").eq("packaging_run_id", packagingRunId).order("occurred_at"),
        this.client.from("packaging_run_reconciliations").select("*").eq("packaging_run_id", packagingRunId).order("reconciliation_version"),
        this.client.from("packaging_run_events").select("*").eq("packaging_run_id", packagingRunId).order("occurred_at"),
        this.readiness(packagingRunId),
      ]);
    const failed = [run, requirements, bulkAllocations, bulkTransfers, reservations, inventoryUses, reconciliations, events]
      .find((result) => result.error);
    if (failed?.error) throw packagingRunError(failed.error);
    return {
      run: run.data as unknown as PackagingRunRecord,
      requirements: requirements.data ?? [],
      bulkAllocations: bulkAllocations.data ?? [],
      bulkTransfers: bulkTransfers.data ?? [],
      reservations: reservations.data ?? [],
      inventoryUses: inventoryUses.data ?? [],
      reconciliations: reconciliations.data ?? [],
      events: events.data ?? [],
      readiness,
    };
  }

  async eligibleLots(requirementId: string): Promise<PackagingEligibleLot[]> {
    const result = await this.client.rpc("get_packaging_eligible_lots_v1", {
      target_packaging_requirement_id: requirementId,
    });
    if (result.error) throw packagingRunError(result.error);
    return Array.isArray(result.data) ? result.data.map((item) => {
      const lot = item as Record<string, unknown>;
      return {
        lotId: String(lot.lotId), lotCode: String(lot.lotCode), supplierLot: optionalString(lot.supplierLot),
        receivedDate: String(lot.receivedDate), location: String(lot.location), unit: String(lot.unit),
        movementBalance: Number(lot.movementBalance), activeReservations: Number(lot.activeReservations),
        availableQuantity: Number(lot.availableQuantity), status: String(lot.status), eligible: lot.eligible === true,
        ineligibilityReasons: Array.isArray(lot.ineligibilityReasons) ? lot.ineligibilityReasons.map(String) : [],
        unitCost: lot.unitCost == null ? undefined : Number(lot.unitCost), costCurrency: optionalString(lot.costCurrency),
        recommendationRank: Number(lot.recommendationRank),
      };
    }) : [];
  }

  create(args: Functions["create_packaging_run_v1"]["Args"]) { return rpc(this.client.rpc("create_packaging_run_v1", args)); }
  allocateBulk(args: Functions["allocate_bulk_to_packaging_run_v1"]["Args"]) { return rpc(this.client.rpc("allocate_bulk_to_packaging_run_v1", args)); }
  releaseBulk(args: Functions["release_packaging_run_bulk_allocation_v1"]["Args"]) { return rpc(this.client.rpc("release_packaging_run_bulk_allocation_v1", args)); }
  reserve(args: Functions["reserve_packaging_run_requirement_v1"]["Args"]) { return rpc(this.client.rpc("reserve_packaging_run_requirement_v1", args)); }
  reserveAll(args: Functions["reserve_packaging_run_requirements_v1"]["Args"]) { return rpc(this.client.rpc("reserve_packaging_run_requirements_v1", args)); }
  releaseReservation(args: Functions["release_packaging_reservation_v1"]["Args"]) { return rpc(this.client.rpc("release_packaging_reservation_v1", args)); }
  transferBulk(args: Functions["record_packaging_bulk_transfer_v1"]["Args"]) { return rpc(this.client.rpc("record_packaging_bulk_transfer_v1", args)); }
  useInventory(args: Functions["record_packaging_inventory_use_v1"]["Args"]) { return rpc(this.client.rpc("record_packaging_inventory_use_v1", args)); }
  reconcile(args: Functions["reconcile_packaging_run_v1"]["Args"]) { return rpc(this.client.rpc("reconcile_packaging_run_v1", args)); }
  complete(args: Functions["complete_packaging_run_v1"]["Args"]) { return rpc(this.client.rpc("complete_packaging_run_v1", args)); }
  genealogy(packagingRunId: string) { return rpc(this.client.rpc("get_packaging_run_genealogy_v1", { target_packaging_run_id: packagingRunId })); }

  async readiness(packagingRunId: string): Promise<PackagingCompletionReadiness> {
    const result = await this.client.rpc("get_packaging_run_completion_readiness_v1", {
      target_packaging_run_id: packagingRunId,
    });
    if (result.error) throw packagingRunError(result.error);
    const value = result.data as Record<string, unknown>;
    return {
      packagingRunId: String(value.packagingRunId), productionOutputId: String(value.productionOutputId),
      policyVersion: String(value.policyVersion), state: String(value.state) as PackagingCompletionReadiness["state"],
      readyForCompletion: value.readyForCompletion === true, completed: value.completed === true,
      evaluatedAt: String(value.evaluatedAt), plannedBulk: Number(value.plannedBulk), allocatedBulk: Number(value.allocatedBulk),
      transferredBulk: Number(value.transferredBulk), remainingBulkAllocation: Number(value.remainingBulkAllocation),
      requirementCount: Number(value.requirementCount), fullyReservedCount: Number(value.fullyReservedCount),
      consumedCount: Number(value.consumedCount), activeReservations: Number(value.activeReservations),
      unresolvedWaste: Number(value.unresolvedWaste), unresolvedStagedReturns: Number(value.unresolvedStagedReturns),
      unexplainedBulkVariance: Number(value.unexplainedBulkVariance),
      unexplainedPackagingVariance: Number(value.unexplainedPackagingVariance), missingEvidence: Number(value.missingEvidence),
      costState: String(value.costState) as PackagingCompletionReadiness["costState"],
      blockers: Array.isArray(value.blockers) ? value.blockers.map((item) => {
        const blocker = item as Record<string, unknown>;
        return {
          blockerCode: String(blocker.blockerCode), category: String(blocker.category),
          severity: String(blocker.severity), blocksCompletion: blocker.blocksCompletion === true,
          humanMessage: String(blocker.humanMessage), recommendedAction: String(blocker.recommendedAction),
          metadata: blocker.metadata && typeof blocker.metadata === "object" ? blocker.metadata as Record<string, unknown> : {},
        };
      }) : [],
    };
  }
}

async function rpc(request: PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const result = await request;
  if (result.error) throw packagingRunError(result.error);
  if (!result.data || typeof result.data !== "object") throw new Error("Packaging Run RPC returned an invalid response.");
  return result.data as Record<string, unknown>;
}
function camelAvailability(value: unknown): PackagingBulkAvailability {
  const row = value as Record<string, unknown>;
  return {
    productionOutputId: String(row.productionOutputId), outputCode: String(row.outputCode),
    retainedNormalizedQuantity: Number(row.retainedNormalizedQuantity),
    allocatedNormalizedQuantity: Number(row.allocatedNormalizedQuantity),
    availableNormalizedQuantity: Number(row.availableNormalizedQuantity),
    normalizedUnit: String(row.normalizedUnit), outputRevision: Number(row.outputRevision),
  };
}
function optionalString(value: unknown) { return value == null ? undefined : String(value); }
function requiredClient(): Client {
  if (!supabase) throw new Error("Supabase Packaging Run control is not configured.");
  return supabase;
}
