import type { Tables } from "../../../platform/supabase/generated/database.types";

export type ProductionOutput = Tables<"production_outputs">;
export type ProductionOutputMeasurement = Tables<"production_output_measurements">;
export type ProductionOutputComponent = Tables<"production_output_components">;
export type ProductionOutputReconciliation = Tables<"production_output_reconciliations">;
export type ProductionOutputEvent = Tables<"production_output_events">;
export type ProductionOutputType = "bulk" | "intermediate";
export type ProductionOutputComponentType =
  | "retained_bulk"
  | "bulk_waste"
  | "transferred"
  | "unexplained_variance";

export interface ProductionOutputBlocker {
  blockerCode: string;
  category: string;
  severity: string;
  blocksCompletion: boolean;
  productionOutputId?: string;
  quantity?: number;
  unit?: string;
  humanMessage: string;
  recommendedAction: string;
  metadata: Record<string, unknown>;
}
export interface ProductionOutputReadinessSummary {
  productionOutputId: string;
  outputCode: string;
  status: string;
  theoreticalQuantity: number;
  theoreticalUnit: string;
  actualQuantity?: number;
  actualUnit?: string;
  retainedQuantity: number;
  wasteQuantity: number;
  transferredQuantity: number;
  unexplainedVariance: number;
  yieldPercentage?: number;
}

export interface ProductionOutputCompletionReadiness {
  productionBatchId: string;
  policyVersion: string;
  state: "not_ready_for_completion" | "ready_for_completion" | "completed";
  readyForCompletion: boolean;
  completed: boolean;
  evaluatedAt: string;
  outputRecordCount: number;
  activeOutputRecords: number;
  incompleteOutputRecords: number;
  outputs: ProductionOutputReadinessSummary[];
  blockers: ProductionOutputBlocker[];
}

export interface ProductionOutputGenealogy {
  contractVersion: string;
  productionOutputId: string;
  productionBatchId: string;
  formulaVersionId: string;
  outputCode: string;
  materialRequirements: Array<{
    requirementId: string;
    ingredientId: string;
    ingredientNameSnapshot: string;
    consumptions: Array<{
      consumptionId: string;
      inventoryLotId: string;
      inventoryMovementId: string;
      quantity: number;
      unit: string;
      unitCostSnapshot?: number;
    }>;
  }>;
}

export interface ProductionOutputSnapshot {
  batchRevision: number;
  outputStageStatus: string;
  outputStageCompletedAt?: string;
  outputs: ProductionOutput[];
  measurements: ProductionOutputMeasurement[];
  components: ProductionOutputComponent[];
  reconciliations: ProductionOutputReconciliation[];
  events: ProductionOutputEvent[];
  readiness: ProductionOutputCompletionReadiness;
}

export function productionOutputError(cause: unknown): Error {
  const message = cause && typeof cause === "object" && "message" in cause
    ? String(cause.message)
    : "Production Output operation failed.";
  const known = [
    ["PRODUCTION_MATERIAL_NOT_COMPLETE", "Complete controlled material reconciliation first."],
    ["STALE_", "This record changed in another session. Refresh and try again."],
    ["IDEMPOTENCY_CONFLICT", "This action key was already used with different details."],
    ["OUTPUT_EQUATION_UNBALANCED", "The output equation is not balanced within tolerance."],
    ["OUTPUT_VARIANCE_APPROVAL_REQUIRED", "Document and approve the unexplained variance."],
    ["OUTPUT_STAGE_COMPLETION_BLOCKED", "Resolve the authoritative output blockers before completion."],
  ] as const;
  const detail = known.find(([code]) => message.includes(code))?.[1];
  return new Error(detail ? `${detail} (${message})` : message);
}
