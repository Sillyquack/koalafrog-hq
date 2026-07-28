export interface FinishedGoodsBlocker {
  blockerCode: string;
  category: string;
  severity: string;
  blocksLotCreation: boolean;
  humanMessage: string;
  recommendedAction: string;
}

export interface FinishedGoodsReadiness {
  packagingRunId: string;
  productionOutputId: string;
  policyVersion: string;
  state: "blocked" | "ready" | "conversion_completed";
  packagingRunCompleted: boolean;
  readyForLotCreation: boolean;
  conversionCompleted: boolean;
  totalPackagedQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  damagedQuantity: number;
  sampleQuantity: number;
  retentionQuantity: number;
  unresolvedVariance: number;
  convertedQuantity: number;
  remainingAcceptedQuantity: number;
  unit: string;
  finishedGoodsLotCount: number;
  costState: "complete" | "provisional";
  reconciliation?: Record<string, unknown>;
  blockers: FinishedGoodsBlocker[];
}

export interface FinishedGoodsLot {
  id: string;
  packaging_run_id: string;
  internal_lot_code: string;
  consumer_batch_code: string;
  lot_label: string;
  quantity: number;
  unit: string;
  manufacturing_date: string;
  shelf_life_basis: string;
  shelf_life_duration?: number | null;
  shelf_life_unit?: string | null;
  expiry_date?: string | null;
  period_after_opening_value?: number | null;
  period_after_opening_unit?: string | null;
  product_snapshot: Record<string, unknown>;
  formula_snapshot: Record<string, unknown>;
  packaging_snapshot: Record<string, unknown>;
  label_snapshot: Record<string, unknown>;
  cost_snapshot: Record<string, unknown>;
  genealogy_snapshot: Record<string, unknown>;
  quarantine_status: string;
  lifecycle_status: string;
  location: string;
  created_at: string;
}

export interface FinishedGoodsLotDetail {
  lot: FinishedGoodsLot;
  quarantine: Record<string, unknown>;
  events: Record<string, unknown>[];
  genealogy: Record<string, unknown>;
}

export function finishedGoodsError(cause: unknown): Error {
  const message = cause && typeof cause === "object" && "message" in cause ? String(cause.message) : String(cause);
  const code = message.match(/(FINISHED_GOODS_[A-Z_]+|PACKAGED_OUTPUT_[A-Z_]+|PACKAGING_RUN_[A-Z_]+|STALE_[A-Z_]+|IDEMPOTENCY_[A-Z_]+|QUARANTINE_[A-Z_]+|INVALID_[A-Z_]+|EXPIRY_[A-Z_]+|CODE_[A-Z_]+)/)?.[1];
  return new Error(code ?? message);
}
