export interface PackagingBulkAvailability {
  productionOutputId: string;
  outputCode: string;
  retainedNormalizedQuantity: number;
  allocatedNormalizedQuantity: number;
  availableNormalizedQuantity: number;
  normalizedUnit: string;
  outputRevision: number;
}

export interface PackagingBlocker {
  blockerCode: string;
  category: string;
  severity: string;
  blocksCompletion: boolean;
  humanMessage: string;
  recommendedAction: string;
  metadata: Record<string, unknown>;
}

export interface PackagingCompletionReadiness {
  packagingRunId: string;
  productionOutputId: string;
  policyVersion: string;
  state: "blocked" | "ready" | "completed";
  readyForCompletion: boolean;
  completed: boolean;
  evaluatedAt: string;
  plannedBulk: number;
  allocatedBulk: number;
  transferredBulk: number;
  remainingBulkAllocation: number;
  requirementCount: number;
  fullyReservedCount: number;
  consumedCount: number;
  activeReservations: number;
  unresolvedWaste: number;
  unresolvedStagedReturns: number;
  unexplainedBulkVariance: number;
  unexplainedPackagingVariance: number;
  missingEvidence: number;
  costState: "complete" | "unknown";
  blockers: PackagingBlocker[];
}

export interface PackagingEligibleLot {
  lotId: string;
  lotCode: string;
  supplierLot?: string;
  receivedDate: string;
  location: string;
  unit: string;
  movementBalance: number;
  activeReservations: number;
  availableQuantity: number;
  status: string;
  eligible: boolean;
  ineligibilityReasons: string[];
  unitCost?: number;
  costCurrency?: string;
  recommendationRank: number;
}

export interface PackagingRunRecord {
  id: string;
  production_output_id: string;
  production_run_id: string;
  internal_run_code: string;
  run_label: string;
  status: string;
  revision: number;
  planned_bulk_normalized_quantity: number;
  planned_bulk_normalized_unit: string;
  actual_transferred_normalized_quantity: number;
  planned_unit_count: number;
  nominal_fill_quantity: number;
  nominal_fill_unit: string;
  packaging_specification_snapshot: Record<string, unknown>;
  bulk_material_cost_snapshot?: number | null;
  bulk_material_cost_currency?: string | null;
  bulk_cost_confidence: string;
  completed_at?: string | null;
}

export interface PackagingRunSnapshot {
  run: PackagingRunRecord;
  requirements: Record<string, unknown>[];
  bulkAllocations: Record<string, unknown>[];
  bulkTransfers: Record<string, unknown>[];
  reservations: Record<string, unknown>[];
  inventoryUses: Record<string, unknown>[];
  reconciliations: Record<string, unknown>[];
  events: Record<string, unknown>[];
  readiness: PackagingCompletionReadiness;
}

export function packagingRunError(cause: unknown): Error {
  const message = cause && typeof cause === "object" && "message" in cause ? String(cause.message) : String(cause);
  return new Error(message.replace(/^.*?(AUTHENTICATION_REQUIRED|ACTIVE_WORKSPACE_REQUIRED|PACKAGING_[A-Z_]+|OUTPUT_[A-Z_]+|STALE_[A-Z_]+|IDEMPOTENCY_[A-Z_]+).*$/, "$1"));
}
