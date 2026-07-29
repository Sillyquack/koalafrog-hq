export type FinishedGoodsInspectionResult = "not_tested" | "pass" | "fail" | "hold" | "not_applicable" | "inconclusive";
export type FinishedGoodsDispositionDecision = "hold" | "reject" | "release";

export interface FinishedGoodsInspectionRequirement {
  category: string;
  requirementCode: string;
  requirementState: "required" | "optional" | "not_applicable" | "unknown_blocking" | "unknown_non_blocking";
  evidenceRequired: boolean;
  specification: unknown;
}
export interface FinishedGoodsInspectionPlan {
  finishedGoodsLotId: string;
  quarantineId: string;
  policyVersion: string;
  derivedFromSnapshots: boolean;
  requirements: FinishedGoodsInspectionRequirement[];
}
export interface FinishedGoodsInspectionEvidence {
  type: string;
  reference: string;
  description: string;
}
export interface FinishedGoodsInspection {
  id: string;
  requirement_code: string;
  inspection_category: string;
  result_status: FinishedGoodsInspectionResult;
  measured_value: number | null;
  unit: string | null;
  textual_observation: string;
  evidence: FinishedGoodsInspectionEvidence[];
  inspected_by: string;
  inspected_at: string;
  supersedes_inspection_id: string | null;
  revision: number;
}
export interface FinishedGoodsDeviation {
  id: string;
  inspection_id: string | null;
  category: string;
  severity: "non_blocking" | "blocking" | "critical";
  affected_quantity: number;
  unit: string;
  description: string;
  evidence: FinishedGoodsInspectionEvidence[];
  status: "open" | "under_review" | "resolved" | "accepted" | "rejected" | "cancelled";
  disposition_impact: string;
  resolution: string | null;
  revision: number;
}
export interface FinishedGoodsReleaseBlocker {
  blockerCode: string;
  category: string;
  severity: string;
  blocksRelease: boolean;
  inspectionId?: string;
  requirementCode?: string;
  humanMessage: string;
  recommendedAction: string;
}
export interface FinishedGoodsReleaseReadiness {
  finishedGoodsLotId: string;
  quarantineId: string;
  policyVersion: string;
  readyForRelease: boolean;
  inspectionComplete: boolean;
  originalQuantity: number;
  releasedQuantity: number;
  rejectedQuantity: number;
  heldQuantity: number;
  remainingQuarantinedQuantity: number;
  undecidedQuantity: number;
  mandatoryChecks: number;
  passedChecks: number;
  failedChecks: number;
  heldChecks: number;
  inconclusiveChecks: number;
  notTestedChecks: number;
  missingEvidenceCount: number;
  quarantineRevision: number;
  expiryState: string;
  genealogyState: string;
  labelVerificationState: string;
  specificationState: string;
  costState: string;
  blockers: FinishedGoodsReleaseBlocker[];
}
export interface FinishedGoodsDispositionReview {
  id: string;
  review_sequence: number;
  decision: FinishedGoodsDispositionDecision;
  quantity: number;
  unit: string;
  policy_version: string;
  evidence: FinishedGoodsInspectionEvidence[];
  reason: string;
  reviewed_by: string;
  reviewed_at: string;
  released_inventory_lot_id: string | null;
  opening_movement_id: string | null;
}
export interface FinishedGoodsDispositionSummary {
  originalQuantity: number;
  releasedQuantity: number;
  rejectedQuantity: number;
  heldQuantity: number;
  remainingQuarantinedQuantity: number;
  undecidedQuantity: number;
}
export interface ReleasedFinishedGoodsInventoryLot {
  id: string;
  finished_goods_lot_id: string;
  release_review_id: string;
  consumer_batch_code: string;
  internal_lot_code: string;
  quantity_released: number;
  unit: string;
  status: "active";
  location: string;
  manufacturing_date: string;
  expiry_date: string;
  unit_cost: number | null;
  total_cost: number | null;
  currency: string | null;
  cost_confidence: "complete" | "provisional" | "unknown";
  released_by: string;
  released_at: string;
}
export interface FinishedGoodsOpeningMovement {
  id: string;
  released_inventory_lot_id: string;
  release_review_id: string;
  movement_type: "release_receipt";
  quantity: number;
  unit: string;
  normalized_quantity: number;
  occurred_at: string;
}
export interface FinishedGoodsReleaseResult {
  review: FinishedGoodsDispositionReview;
  inventoryLot: ReleasedFinishedGoodsInventoryLot | null;
  openingMovement: FinishedGoodsOpeningMovement | null;
  retry: boolean;
  readiness: FinishedGoodsReleaseReadiness;
}
export interface FinishedGoodsReleaseGenealogy {
  releasedInventoryLot: ReleasedFinishedGoodsInventoryLot;
  releaseReview: FinishedGoodsDispositionReview;
  openingMovement: FinishedGoodsOpeningMovement;
  movementDerivedBalance: number;
  finishedGoodsGenealogy: Record<string, unknown>;
}
export interface FinishedGoodsQualityWorkspace {
  lot: Record<string, unknown>;
  quarantine: Record<string, unknown>;
  inspectionPlan: FinishedGoodsInspectionPlan;
  inspections: FinishedGoodsInspection[];
  deviations: FinishedGoodsDeviation[];
  readiness: FinishedGoodsReleaseReadiness;
  dispositionReviews: FinishedGoodsDispositionReview[];
  inventoryLots: ReleasedFinishedGoodsInventoryLot[];
  openingMovements: FinishedGoodsOpeningMovement[];
  qualityEvents: Record<string, unknown>[];
  genealogy: Record<string, unknown>;
}
