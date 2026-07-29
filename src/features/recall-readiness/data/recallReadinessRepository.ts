import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../platform/supabase/client";
import type { Database, Json } from "../../../platform/supabase/generated/database.types";
import type {
  ExposureState, RecallCaseListItem, RecallCaseWorkspace, RecallConcernCategory, RecallDecisionReadiness,
  RecallInitiatingIdentityType, RecallLiveComparison, RecallRevisionComparison, RecallSeverity, RecallUrgency,
  RecommendedAction,
} from "../domain/recallReadiness";

type Client = SupabaseClient<Database>;
type FunctionName = keyof Database["public"]["Functions"];

export class RecallReadinessRepository {
  constructor(private readonly client: Client = requiredClient()) {}
  list(filters: Record<string, string> = {}) {
    return this.call<RecallCaseListItem[]>("list_recall_readiness_cases_v1", { candidate_filters: filters, candidate_limit: 50, candidate_offset: 0 });
  }
  get(caseId: string) { return this.call<RecallCaseWorkspace>("get_recall_readiness_case_v1", { target_case_id: caseId }); }
  createCase(input: { title: string; issueSummary: string; concernCategory: RecallConcernCategory; discoveryAt: string; sourceType: RecallInitiatingIdentityType; sourceId: string; evidencePending: boolean }) {
    return this.call<{ case: RecallCaseWorkspace["case"]; retry: boolean }>("create_recall_readiness_case_v1", {
      candidate_title: input.title, candidate_issue_summary: input.issueSummary, candidate_concern_category: input.concernCategory,
      candidate_discovery_at: input.discoveryAt, candidate_source_type: input.sourceType, candidate_source_id: input.sourceId,
      candidate_evidence_pending: input.evidencePending, candidate_idempotency_key: crypto.randomUUID(),
    });
  }
  createRevision(input: { caseId: string; caseRevision: number; severity: RecallSeverity; urgency: RecallUrgency; exposure: ExposureState; exposureUnknownAcknowledged: boolean; healthHazard: string; compliance: string; recommendation: string; action: RecommendedAction; distributionAcknowledged: boolean; evidencePendingAcknowledged: boolean; supersessionReason?: string }) {
    return this.call<{ revision: RecallCaseWorkspace["revisions"][number]; case: RecallCaseWorkspace["case"]; retry: boolean }>("create_recall_readiness_revision_v1", {
      target_case_id: input.caseId, expected_case_revision: input.caseRevision, candidate_severity: input.severity,
      candidate_urgency: input.urgency, candidate_exposure_state: input.exposure,
      candidate_exposure_unknown_acknowledged: input.exposureUnknownAcknowledged,
      candidate_health_hazard_narrative: input.healthHazard, candidate_compliance_narrative: input.compliance,
      candidate_operator_recommendation: input.recommendation, candidate_recommended_action: input.action,
      candidate_distribution_limitation_acknowledged: input.distributionAcknowledged,
      candidate_evidence_pending_acknowledged: input.evidencePendingAcknowledged,
      candidate_supersession_reason: input.supersessionReason ?? null, candidate_idempotency_key: crypto.randomUUID(),
    });
  }
  addEvidence(input: { caseId: string; revisionId?: string; type: string; title: string; description: string; reference?: string }) {
    return this.call("register_recall_readiness_evidence_v1", {
      target_case_id: input.caseId, target_revision_id: input.revisionId ?? null, candidate_type: input.type,
      candidate_title: input.title, candidate_description: input.description, candidate_storage_reference: null,
      candidate_document_reference: input.reference ?? null, candidate_content_hash: null, candidate_metadata: {} as Json,
      candidate_idempotency_key: crypto.randomUUID(),
    });
  }
  generateScope(caseId: string, revisionId: string, caseRevision: number) {
    return this.call("generate_recall_readiness_scope_v1", { target_case_id: caseId, target_revision_id: revisionId,
      candidate_scope_policy_version: "1.0.0", candidate_idempotency_key: crypto.randomUUID(), expected_case_revision: caseRevision });
  }
  readiness(caseId: string, revisionId: string) {
    return this.call<RecallDecisionReadiness>("get_recall_readiness_decision_readiness_v1", { target_case_id: caseId, target_revision_id: revisionId });
  }
  submitReview(input: { caseId: string; revisionId: string; fingerprint: string; role: string; decision: string; rationale: string; evidenceIds: string[] }) {
    return this.call("submit_recall_readiness_review_v1", { target_case_id: input.caseId, target_revision_id: input.revisionId,
      candidate_revision_fingerprint: input.fingerprint, candidate_role: input.role, candidate_decision: input.decision,
      candidate_rationale: input.rationale, candidate_evidence_reviewed: input.evidenceIds as unknown as Json,
      candidate_idempotency_key: crypto.randomUUID() });
  }
  approve(input: { caseId: string; revisionId: string; revisionFingerprint: string; scopeFingerprint: string; caseRevision: number }) {
    return this.call("approve_recall_readiness_revision_v1", { target_case_id: input.caseId, target_revision_id: input.revisionId,
      candidate_revision_fingerprint: input.revisionFingerprint, candidate_scope_fingerprint: input.scopeFingerprint,
      candidate_distribution_acknowledged: true, candidate_non_execution_acknowledged: true,
      expected_case_revision: input.caseRevision, candidate_idempotency_key: crypto.randomUUID() });
  }
  compareLive(revisionId: string) { return this.call<RecallLiveComparison>("compare_recall_scope_to_live_inventory_v1", { target_revision_id: revisionId }); }
  compareRevisions(left: string, right: string) { return this.call<RecallRevisionComparison>("compare_recall_readiness_revisions_v1", { target_left_revision_id: left, target_right_revision_id: right }); }
  close(caseId: string, caseRevision: number, state: string, reason: string) {
    return this.call("close_recall_readiness_case_v1", { target_case_id: caseId, expected_case_revision: caseRevision,
      candidate_closure_state: state, candidate_reason: reason, candidate_idempotency_key: crypto.randomUUID() });
  }
  private async call<T = Record<string, unknown>>(name: FunctionName, args: Record<string, unknown>): Promise<T> {
    const rpc = this.client.rpc as unknown as (functionName: string, functionArgs: Record<string, unknown>) =>
      Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
    const result = await rpc.call(this.client, name, args);
    if (result.error) throw recallReadinessError(result.error.message);
    if (result.data === null || typeof result.data !== "object") throw new Error("RECALL_READINESS_INVALID_RESPONSE");
    return result.data as T;
  }
}

export function recallReadinessError(message: string) {
  const codes = ["AUTHENTICATION_REQUIRED","WORKSPACE_NOT_FOUND","CASE_NOT_FOUND","SOURCE_NOT_FOUND","UNSUPPORTED_SOURCE_TYPE",
    "REVISION_CONFLICT","IDEMPOTENCY_CONFLICT","TRACEABILITY_BLOCKED","SCOPE_INTEGRITY_FAILURE","EVIDENCE_MISSING",
    "READINESS_BLOCKED","STALE_REVISION","REVISION_IMMUTABLE","FINGERPRINT_MISMATCH","SCOPE_ALREADY_FROZEN"];
  return new Error(codes.find(code => message.includes(code)) ?? `RECALL_READINESS_SERVER_ERROR: ${message}`);
}
function requiredClient(): Client {
  if (!supabase) throw new Error("Supabase Recall Readiness is not configured.");
  return supabase;
}
