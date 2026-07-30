import type { Tables } from "../../../platform/supabase/generated/database.types";

export type BatchMaterialKind = "lab" | "production";
export type MaterialAllocation = Tables<"batch_material_lot_allocations">;
export type MaterialReservation = Tables<"inventory_reservations">;
export type MaterialWeighing = Tables<"batch_material_weighings">;
export type MaterialConsumption = Tables<"batch_material_consumptions">;
export type MaterialWaste = Tables<"batch_material_waste">;
export type MaterialReturn = Tables<"batch_material_returns">;
export type MaterialVariance = Tables<"batch_material_variances">;
export type MaterialReconciliation = Tables<"batch_material_reconciliations">;
export type MaterialEvent = Tables<"batch_material_events">;

export interface EligibleMaterialLot {
  inventoryLotId: string;
  internalLotNumber: string;
  supplierLotNumber?: string;
  receivedDate: string;
  releasedAt: string;
  expiryOrRetestDate?: string;
  location: string;
  unit: string;
  movementBalance: number;
  reservedBalance: number;
  availableBalance: number;
  unitCost?: number;
  costCurrency?: string;
  costConfidence: string;
  fefoRank: number;
  eligibilityPolicyVersion: string;
}

export interface BatchMaterialControlSnapshot {
  batchRevision: number;
  allocations: MaterialAllocation[];
  reservations: MaterialReservation[];
  weighings: MaterialWeighing[];
  consumptions: MaterialConsumption[];
  waste: MaterialWaste[];
  returns: MaterialReturn[];
  variances: MaterialVariance[];
  reconciliations: MaterialReconciliation[];
  events: MaterialEvent[];
}

export interface CompletionBlocker {
  blockerCode: string;
  category: string;
  severity: string;
  blocksCompletion: boolean;
  requirementId?: string;
  ingredientNameSnapshot?: string;
  inventoryLotId?: string;
  reservationId?: string;
  quantity?: number;
  unit?: string;
  humanMessage: string;
  recommendedAction: string;
}

export interface CompletionReadiness {
  batchId: string;
  batchType: BatchMaterialKind;
  batchRevision: number;
  completionPolicyVersion: string;
  state: "ready_for_completion" | "not_ready_for_completion" | "completed";
  readyForCompletion: boolean;
  completed: boolean;
  totalRequirements: number;
  reconciledRequirements: number;
  blockedRequirements: number;
  activeReservations: number;
  missingPlannedWeighings: number;
  missingActualWeighings: number;
  missingYield: boolean;
  blockers: CompletionBlocker[];
}

export interface ProvenanceNode {
  nodeType: string;
  lifecycleStatus: "present" | "not_yet_applicable" | "not_applicable" | "missing_expected_link";
  historicalLabel: string;
  immutableId?: string;
  parentId?: string;
  quantity?: number;
  unit?: string;
  actor?: string;
  timestamp?: string;
  snapshot: Record<string, unknown>;
  currentMasterDiffers: boolean;
}

export interface MaterialProvenance {
  contractVersion: string;
  batchId: string;
  batchType: BatchMaterialKind;
  requirementId: string;
  nodes: ProvenanceNode[];
}

export const emptyBatchMaterialControlSnapshot = (): BatchMaterialControlSnapshot => ({
  batchRevision: 0,
  allocations: [],
  reservations: [],
  weighings: [],
  consumptions: [],
  waste: [],
  returns: [],
  variances: [],
  reconciliations: [],
  events: [],
});

export function productionInventoryError(cause: unknown): Error {
  const message =
    cause && typeof cause === "object" && "message" in cause
      ? String(cause.message)
      : "Production inventory control failed.";
  const known = [
    ["STALE_", "This record changed in another session. Refresh and try again."],
    ["INSUFFICIENT_AVAILABLE_INVENTORY", "The lot no longer has enough available inventory."],
    ["IDEMPOTENCY_CONFLICT", "This action key was already used with different details."],
    ["LOT_NOT_ELIGIBLE", "The selected lot is not eligible for production."],
  ] as const;
  const detail = known.find(([code]) => message.includes(code))?.[1];
  return new Error(detail ? `${detail} (${message})` : message);
}
