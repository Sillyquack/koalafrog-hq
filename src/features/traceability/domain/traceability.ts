export type TraceabilityNodeState = "present" | "not_yet_applicable" | "not_applicable" | "missing_expected_link" | "unavailable_legacy_data";
export type TraceabilityConfidenceState = "complete" | "complete_with_optional_gaps" | "partial" | "blocked" | "legacy_incomplete";

export interface TraceabilityGap {
  expectedNodeType: string; parentId: string; state: TraceabilityNodeState;
  reason: string; severity: "warning" | "blocked"; policyVersion: string;
}
export interface TraceabilityConfidence {
  state: TraceabilityConfidenceState; policyVersion: string; missingRequiredLinks: TraceabilityGap[];
  optionalGaps: TraceabilityGap[]; legacyGaps: TraceabilityGap[]; evaluatedAt: string;
}
export interface TraceabilityNode {
  nodeType: string; immutableId: string; historicalLabel: string; currentLabel?: string;
  lifecycleStatus?: string; quantity?: number; unit?: string; actor?: string; timestamp?: string;
  snapshot?: Record<string, unknown>; currentMasterDiffers?: boolean; relationshipState: TraceabilityNodeState;
  metadata?: Record<string, unknown>;
}
export interface TraceabilityEdge { edgeType: string; fromId: string; toId: string; state: TraceabilityNodeState }
export interface TraceabilitySearchResult {
  identityType: string; immutableId: string; code: string; product: string; status: string;
  quantity: number | null; unit: string | null; location: string | null; expiryDate: string | null;
  matchRank: number; availableActions: string[];
}
export interface BackwardGenealogy {
  contractVersion: string; policyVersion: string; direction: "backward";
  root: { nodeType: string; immutableId: string; code: string }; nodes: TraceabilityNode[]; edges: TraceabilityEdge[];
  rawMaterialLots: TraceabilityNode[]; packagingLots: TraceabilityNode[]; quality: Record<string, unknown>;
  releasedInventory: Record<string, unknown>[]; procurementProvenance: Record<string, unknown>[];
  missingLinks: TraceabilityGap[]; confidence: TraceabilityConfidence;
  quantityAttribution: Record<string, string>; evaluatedAt: string; fingerprint: string;
}
export interface AffectedFinishedGoodsLot {
  finishedGoodsLotId: string; consumerBatchCode: string; product: Record<string, unknown>;
  exactFinishedGoodsLotQuantity: number; unit: string; productionBatchId: string; productionOutputId: string;
  packagingRunId: string; exactConsumedQuantity: number; consumedUnit: string; componentRole?: string;
  quantityAttribution: string; currentInventoryImpact: Record<string, unknown>[]; tracePath: string[];
}
export interface ForwardTrace {
  contractVersion: string; policyVersion: string; direction: "forward";
  source: Record<string, unknown>; affectedFinishedGoods: AffectedFinishedGoodsLot[];
  distinctAffectedFinishedGoodsCount: number; missingLinks: TraceabilityGap[];
  confidence: TraceabilityConfidence; evaluatedAt: string; fingerprint: string;
}
export interface TraceabilityReadiness {
  rootId: string; policyVersion: string; backwardTraceReady: boolean; forwardTraceReady: boolean;
  recallScopeInputReady: boolean; confidence: TraceabilityConfidence; missingLinks: TraceabilityGap[];
  blockers: TraceabilityGap[]; warnings: TraceabilityGap[]; evaluatedAt: string;
}
export interface TraceabilityIntegrityResult {
  policyVersion: string; rootId: string; findings: TraceabilityGap[]; findingCount: number; evaluatedAt: string;
}
export interface TraceabilitySnapshot {
  root: Record<string, unknown>; evaluatedAt: string; policyVersion: string; nodes: TraceabilityNode[];
  edges: TraceabilityEdge[]; affectedQuantities: Record<string, unknown>; currentStates: Record<string, unknown>[];
  missingLinks: TraceabilityGap[]; confidence: TraceabilityConfidence; queryParameters: Record<string, unknown>; fingerprint: string;
}
