export type RecallReadinessCaseState =
  | "draft" | "under_assessment" | "awaiting_review" | "approved_readiness"
  | "closed_no_action" | "superseded" | "cancelled";
export type RecallConcernCategory =
  | "raw_material_quality" | "packaging_quality" | "microbiological_concern" | "contamination_concern"
  | "allergen_concern" | "formulation_error" | "manufacturing_deviation" | "packaging_failure"
  | "label_error" | "missing_warning" | "expiry_or_shelf_life" | "supplier_notification"
  | "consumer_safety_concern" | "regulatory_nonconformity" | "traceability_gap"
  | "counterfeit_or_identity_concern" | "other";
export type RecallSeverity = "low" | "moderate" | "serious" | "critical" | "unknown";
export type RecallUrgency = "routine" | "prompt" | "urgent" | "immediate" | "unknown";
export type ExposureState =
  | "no_known_exposure" | "possible_exposure" | "confirmed_internal_distribution_only"
  | "possible_consumer_exposure" | "confirmed_consumer_exposure" | "unknown";
export type RecommendedAction =
  | "continue_investigation" | "no_action_recommended" | "internal_hold_recommended"
  | "withdrawal_assessment_recommended" | "recall_assessment_recommended"
  | "supplier_escalation_recommended" | "regulatory_review_recommended"
  | "destruction_assessment_recommended" | "other";
export type RecallInitiatingIdentityType =
  | "raw_material_inventory_lot" | "supplier_raw_material_lot" | "packaging_inventory_lot"
  | "supplier_packaging_lot" | "production_batch" | "production_output" | "packaging_run"
  | "finished_goods_lot" | "released_finished_goods_inventory_lot" | "consumer_batch_code"
  | "finished_goods_quality_review" | "traceability_integrity_finding" | "other_documented_source";
export interface RecallInitiatingIdentity { type: RecallInitiatingIdentityType; id: string; code: string }
export type RecallScopeConfidence =
  | "complete_for_internal_inventory" | "complete_with_optional_gaps" | "partial" | "blocked"
  | "legacy_incomplete" | "distribution_incomplete";

export interface RecallReadinessCase {
  id: string; case_code: string; title: string; issue_summary: string; concern_category: RecallConcernCategory;
  initiating_source_type: RecallInitiatingIdentityType; initiating_source_id: string; initiating_source_code: string;
  initial_discovery_at: string; lifecycle_state: RecallReadinessCaseState; revision: number;
  latest_revision_id: string | null; approved_revision_id: string | null; updated_at: string;
}
export interface RecallReadinessRevision {
  id: string; case_id: string; revision_number: number; supersedes_revision_id: string | null;
  status: "draft" | "awaiting_review" | "approved" | "superseded"; severity: RecallSeverity;
  urgency: RecallUrgency; exposure_state: ExposureState; exposure_unknown_acknowledged: boolean;
  health_hazard_narrative: string; compliance_narrative: string; operator_recommendation: string;
  recommended_action: RecommendedAction; distribution_limitation_acknowledged: boolean;
  evidence_pending_acknowledged: boolean; fingerprint: string; created_at: string;
}
export interface RecallScopeSnapshot {
  id: string; revision_id: string; policy_version: string; traceability_policy_version: string;
  traceability_fingerprint: string; traceability_snapshot: Record<string, unknown>;
  distribution_boundary: string; scope_confidence: RecallScopeConfidence;
  quantity_totals: Record<string, unknown>; fingerprint: string; evaluated_at: string;
}
export interface RecallAffectedFinishedGoods {
  id: string; scope_snapshot_id: string; finished_goods_lot_id: string; consumer_batch_code: string;
  product_snapshot: Record<string, unknown>; quantity_created: number | null; quantity_quarantined: number | null;
  quantity_released: number | null; quantity_rejected: number | null; quantity_active_on_hand: number | null;
  quantity_available: number | null; quantity_held: number | null; quantity_blocked: number | null;
  quantity_damaged: number | null; quantity_lost: number | null; quantity_destroyed: number | null;
  quantity_expired: number | null; quantity_unavailable: number | null; quantity_unknown: number | null;
  unit: string | null; locations: unknown[]; operational_state: string; attribution_type: string; confidence: string;
}
export interface RecallInventoryImpact {
  id: string; scope_snapshot_id: string; released_inventory_lot_id: string; location: string | null;
  on_hand_quantity: number; available_quantity: number; reserved_quantity: number; held_quantity: number;
  blocked_quantity: number; damaged_quantity: number; lost_quantity: number; destroyed_quantity: number;
  expired_quantity: number; operational_readiness: string; evaluated_at: string;
}
export interface RecallScopeGap { id: string; scope_snapshot_id: string | null; code: string; severity: "warning" | "blocked"; reason: string; scope_impact: string; readiness_impact: string }
export interface RecallEvidence { id: string; evidence_type: string; title: string; description: string; storage_reference: string | null; document_reference: string | null; uploaded_at: string; superseded: boolean }
export interface RecallReview { id: string; reviewer_role: string; decision: string; rationale: string; revision_fingerprint: string; reviewed_at: string }
export interface RecallApproval { id: string; revision_id: string; revision_fingerprint: string; scope_fingerprint: string; approved_at: string }
export interface RecallEvent { id: string; event_type: string; occurred_at: string; metadata: Record<string, unknown> }
export interface RecallDecisionReadiness {
  caseId: string; revisionId: string; scopePolicyVersion: string; scopeGenerated: boolean;
  scopeFingerprint: string | null; affectedGoodsIdentified: boolean; quantityReconciliationComplete: boolean;
  currentInventoryCaptured: boolean; scopeConfidence: RecallScopeConfidence | null; evidenceSufficient: boolean;
  severityAssessed: boolean; urgencyAssessed: boolean; exposureAssessed: boolean; recommendationPresent: boolean;
  distributionLimitationAcknowledged: boolean; requiredReviewerPresent: boolean; blockers: string[];
  warnings: string[]; readyForReview: boolean; readyForApproval: boolean; evaluatedAt: string;
}
export interface RecallLiveComparison { revisionId: string; scopeFingerprint: string; frozenEvaluatedAt: string; comparedAt: string; label: string; changes: Record<string, unknown>[] }
export interface RecallRevisionComparison { leftRevision: RecallReadinessRevision; rightRevision: RecallReadinessRevision; fieldChanges: Record<string, boolean>; scopeFingerprintChanged: boolean; addedFinishedGoods: RecallAffectedFinishedGoods[]; removedFinishedGoods: RecallAffectedFinishedGoods[] }
export interface RecallCaseWorkspace {
  case: RecallReadinessCase; revisions: RecallReadinessRevision[]; scopes: RecallScopeSnapshot[];
  affectedGoods: RecallAffectedFinishedGoods[]; inventoryImpacts: RecallInventoryImpact[]; gaps: RecallScopeGap[];
  evidence: RecallEvidence[]; reviews: RecallReview[]; approvals: RecallApproval[]; events: RecallEvent[];
}
export interface RecallCaseListItem {
  id: string; caseCode: string; title: string; concernCategory: RecallConcernCategory; state: RecallReadinessCaseState;
  initiatingIdentity: RecallInitiatingIdentity; revision: number; latestRevisionId: string | null;
  approvedRevisionId: string | null; severity: RecallSeverity | null; urgency: RecallUrgency | null;
  scopeConfidence: RecallScopeConfidence | null; affectedFinishedGoodsLotCount: number; activeOnHandImpact: number; updatedAt: string;
}
