import { supabase } from "../../platform/supabase/client";
import {
  beardPhotoExtension,
  type SelectedBeardPhoto,
  validateBeardPhotoFile,
} from "./beardPhotoAnalysis";
import type { BeardAnalysisTarget, GroomingSummarySnapshot, TrimPlanSnapshot } from "../../features/beard-studio/domain/beardPhotoIntelligenceV2";
import {
  type BeardPhotoAnalysisResult,
  type RecommendationReviewStatus,
  validateBeardPhotoAnalysisResult,
} from "./beardPhotoAnalysis";

const BUCKET = "beard-analysis-images";
export type BeardPhotoErrorCode =
  | "NOT_SIGNED_IN"
  | "MISSING_WORKSPACE"
  | "NO_BEARD_PROFILE"
  | "MISSING_REQUIRED_VIEWS"
  | "UNSUPPORTED_IMAGE"
  | "FILE_TOO_LARGE"
  | "INVALID_IMAGE"
  | "UPLOAD_FAILED"
  | "STORAGE_AUTHORIZATION_FAILED"
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_RATE_LIMIT"
  | "PROVIDER_RATE_LIMIT_REQUESTS"
  | "PROVIDER_RATE_LIMIT_TOKENS"
  | "PROVIDER_QUOTA_EXHAUSTED"
  | "PROVIDER_BILLING_LIMIT"
  | "PROVIDER_MODEL_LIMIT"
  | "PROVIDER_RATE_LIMIT_UNKNOWN"
  | "PROVIDER_RESPONSE_ENVELOPE_INVALID"
  | "PROVIDER_STRUCTURED_OUTPUT_MISSING"
  | "PROVIDER_STRUCTURED_OUTPUT_AMBIGUOUS"
  | "PROVIDER_OUTPUT_TEXT_MISSING"
  | "PROVIDER_OUTPUT_JSON_INVALID"
  | "PROVIDER_OUTPUT_REFUSAL"
  | "PROVIDER_OUTPUT_SCHEMA_MISMATCH"
  | "PROVIDER_RESPONSE_PARSE_INTERNAL_ERROR"
  | "PROVIDER_REFUSAL"
  | "INVALID_STRUCTURED_OUTPUT"
  | "INVALID_ENVELOPE"
  | "MISSING_OUTPUT_TEXT"
  | "PROVIDER_INCOMPLETE"
  | "INVALID_JSON"
  | "SCHEMA_VALIDATION_FAILED"
  | "CONTRACT_VALIDATION_FAILED"
  | "SEMANTIC_VALIDATION_FAILED"
  | "SEMANTIC_VALIDATOR_INTERNAL_ERROR"
  | "UNKNOWN_VALIDATION_FAILURE"
  | "ANALYSIS_CANCELLED"
  | "CLEANUP_FAILURE"
  | "CLEANUP_VERIFICATION_FAILED"
  | "NETWORK_FAILURE"
  | "ANALYSIS_IN_PROGRESS"
  | "ATTEMPT_PROVENANCE_FAILED"
  | "SNAPSHOT_TARGET_MISMATCH"
  | "UNEXPECTED_ERROR";
export class BeardPhotoAnalysisError extends Error {
  constructor(
    public code: BeardPhotoErrorCode,
    message: string,
    public correlationId?: string,
  ) {
    super(message);
  }
}
const validationFailures = new Set<BeardPhotoErrorCode>([
  "INVALID_STRUCTURED_OUTPUT",
  "INVALID_ENVELOPE",
  "MISSING_OUTPUT_TEXT",
  "PROVIDER_INCOMPLETE",
  "INVALID_JSON",
  "SCHEMA_VALIDATION_FAILED",
  "CONTRACT_VALIDATION_FAILED",
  "SEMANTIC_VALIDATION_FAILED",
  "SEMANTIC_VALIDATOR_INTERNAL_ERROR",
  "UNKNOWN_VALIDATION_FAILURE",
]);
const messageFor = (code: BeardPhotoErrorCode) =>
  validationFailures.has(code)
    ? "The provider response failed safety validation."
    : ({
      NOT_SIGNED_IN: "Sign in again to analyze photos.",
      MISSING_WORKSPACE: "The active hosted workspace is unavailable.",
      NO_BEARD_PROFILE: "Create or activate a Beard Studio profile first.",
      MISSING_REQUIRED_VIEWS:
        "Front, left profile and right profile photos are required.",
      UNSUPPORTED_IMAGE: "Use a JPEG, PNG or WebP image.",
      FILE_TOO_LARGE: "One or more images exceed the upload limit.",
      INVALID_IMAGE: "One or more images could not be read.",
      UPLOAD_FAILED: "Photos could not be uploaded privately.",
      STORAGE_AUTHORIZATION_FAILED:
        "Private image access could not be verified.",
      PROVIDER_NOT_CONFIGURED: "Beard photo analysis is not configured.",
      PROVIDER_TIMEOUT:
        "The analysis took too long, so no result was stored. You may start a new analysis.",
      PROVIDER_RATE_LIMIT: "The analysis limit was reached. Try again later.",
      PROVIDER_RATE_LIMIT_REQUESTS:
        "The provider request rate limit was reached. Wait and try again later.",
      PROVIDER_RATE_LIMIT_TOKENS:
        "The provider token rate limit was reached. Wait and try again later.",
      PROVIDER_RATE_LIMIT_UNKNOWN:
        "The provider returned an unidentified rate limit. Check provider diagnostics before trying again.",
      PROVIDER_QUOTA_EXHAUSTED:
        "The OpenAI project quota is exhausted. Correct API billing or project quota before trying again.",
      PROVIDER_BILLING_LIMIT:
        "The OpenAI project billing limit was reached. Correct the project billing limit before trying again.",
      PROVIDER_MODEL_LIMIT:
        "The selected OpenAI model is not available within the project limit. Correct model access or limits before trying again.",
      PROVIDER_RESPONSE_ENVELOPE_INVALID:
        "The provider returned an invalid response envelope.",
      PROVIDER_STRUCTURED_OUTPUT_MISSING:
        "The provider response did not contain the required structured result.",
      PROVIDER_STRUCTURED_OUTPUT_AMBIGUOUS:
        "The provider returned conflicting structured results.",
      PROVIDER_OUTPUT_TEXT_MISSING:
        "The provider response did not contain the expected output text.",
      PROVIDER_OUTPUT_JSON_INVALID:
        "The provider output was not valid structured JSON.",
      PROVIDER_OUTPUT_REFUSAL:
        "The provider declined to analyze these photos.",
      PROVIDER_OUTPUT_SCHEMA_MISMATCH:
        "The provider result did not match the Beard Photo Analysis schema.",
      PROVIDER_RESPONSE_PARSE_INTERNAL_ERROR:
        "The provider response could not be processed safely.",
      PROVIDER_REFUSAL: "The provider could not complete this analysis.",
      ANALYSIS_CANCELLED: "Analysis was cancelled before provider execution.",
      CLEANUP_FAILURE: "Temporary image cleanup requires attention.",
      CLEANUP_VERIFICATION_FAILED:
        "Temporary image cleanup requires attention.",
      NETWORK_FAILURE: "The analysis service could not be reached.",
      ANALYSIS_IN_PROGRESS: "Another photo analysis is already active.",
      ATTEMPT_PROVENANCE_FAILED:
        "The provider attempt could not be recorded, so no analysis was sent.",
      SNAPSHOT_TARGET_MISMATCH:
        "The review snapshots do not match the analysis target.",
      UNEXPECTED_ERROR: "Beard photo analysis could not be completed.",
    } as Partial<Record<BeardPhotoErrorCode, string>>)[code] ??
      "Beard photo analysis could not be completed.";

export async function runBeardPhotoAnalysis(
  input: {
    workspaceId: string;
    profileId: string;
    photos: SelectedBeardPhoto[];
    analysisId: string;
    idempotencyKey: string;
    signal?: AbortSignal;
    onStage?: (stage: string) => void;
    targetStyle?: BeardAnalysisTarget;
  },
): Promise<{ result: BeardPhotoAnalysisResult; cleanupWarning?: string }> {
  if (!supabase) {
    throw new BeardPhotoAnalysisError(
      "PROVIDER_NOT_CONFIGURED",
      messageFor("PROVIDER_NOT_CONFIGURED"),
    );
  }
  const required = ["front", "left_profile", "right_profile"];
  if (
    !required.every((view) => input.photos.some((photo) => photo.view === view))
  ) {
    throw new BeardPhotoAnalysisError(
      "MISSING_REQUIRED_VIEWS",
      messageFor("MISSING_REQUIRED_VIEWS"),
    );
  }
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    throw new BeardPhotoAnalysisError(
      "NOT_SIGNED_IN",
      messageFor("NOT_SIGNED_IN"),
    );
  }
  const paths: string[] = [];
  let invoked = false;
  try {
    input.onStage?.("Preparing images");
    for (const photo of input.photos) {
      const validation = validateBeardPhotoFile(photo.file);
      if (validation) {
        throw new BeardPhotoAnalysisError(
          photo.file.size > 8 * 1024 * 1024
            ? "FILE_TOO_LARGE"
            : "UNSUPPORTED_IMAGE",
          validation,
        );
      }
    }
    if (input.signal?.aborted) {
      throw new BeardPhotoAnalysisError(
        "ANALYSIS_CANCELLED",
        messageFor("ANALYSIS_CANCELLED"),
      );
    }
    input.onStage?.("Uploading privately");
    const rows = [];
    for (const photo of input.photos) {
      if (input.signal?.aborted) {
        throw new BeardPhotoAnalysisError(
          "ANALYSIS_CANCELLED",
          messageFor("ANALYSIS_CANCELLED"),
        );
      }
      const path =
        `${input.workspaceId}/${auth.data.user.id}/${input.analysisId}/${photo.view}.${
          beardPhotoExtension(photo.file.type)
        }`;
      const uploaded = await supabase.storage.from(BUCKET).upload(
        path,
        photo.file,
        { contentType: photo.file.type, upsert: false },
      );
      if (uploaded.error) {
        const code = uploaded.error.message.toLowerCase().includes("policy")
          ? "STORAGE_AUTHORIZATION_FAILED"
          : "UPLOAD_FAILED";
        throw new BeardPhotoAnalysisError(code, messageFor(code));
      }
      paths.push(path);
      rows.push({
        view: photo.view,
        objectPath: path,
        mimeType: photo.file.type,
        byteSize: photo.file.size,
      });
    }
    if (input.signal?.aborted) {
      throw new BeardPhotoAnalysisError(
        "ANALYSIS_CANCELLED",
        messageFor("ANALYSIS_CANCELLED"),
      );
    }
    input.onStage?.("Analyzing visible beard characteristics");
    invoked = true;
    const response = await supabase.functions.invoke('analyze-beard-photos', {
      body: {
        schemaVersion: 2,
        workspaceId: input.workspaceId,
        analysisId: input.analysisId,
        idempotencyKey: input.idempotencyKey,
        profileId: input.profileId,
        targetStyle: input.targetStyle,
        inputs: rows,
      },
    });
    if (response.error) {
      const payload = response.error.context?.json
        ? await response.error.context.json().catch(() => undefined)
        : undefined;
      const controlled = (payload as {
        error?: {
          code?: BeardPhotoErrorCode;
          message?: string;
          correlationId?: string;
        };
      } | undefined)?.error;
      const code = controlled?.code ?? "NETWORK_FAILURE";
      throw new BeardPhotoAnalysisError(
        code,
        controlled?.message ?? messageFor(code),
        controlled?.correlationId,
      );
    }
    input.onStage?.("Validating response");
    const result =
      (response.data as { result?: unknown; cleanupWarning?: string } | null)
        ?.result;
    if (!validateBeardPhotoAnalysisResult(result)) {
      throw new BeardPhotoAnalysisError(
        "INVALID_STRUCTURED_OUTPUT",
        messageFor("INVALID_STRUCTURED_OUTPUT"),
      );
    }
    input.onStage?.("Preparing review");
    return {
      result,
      cleanupWarning:
        (response.data as { cleanupWarning?: string }).cleanupWarning,
    };
  } catch (error) {
    const cleanup = !invoked && paths.length
      ? await supabase.storage.from(BUCKET).remove(paths)
      : { error: null };
    if (cleanup.error) {
      throw new BeardPhotoAnalysisError(
        "CLEANUP_FAILURE",
        `${
          error instanceof Error ? error.message : "Analysis failed."
        } Temporary image cleanup also failed.`,
      );
    }
    if (error instanceof BeardPhotoAnalysisError) throw error;
    throw new BeardPhotoAnalysisError(
      "UNEXPECTED_ERROR",
      messageFor("UNEXPECTED_ERROR"),
    );
  }
}

export interface BeardAnalysisHistoryItem {
  analysisId:string;supportId:string;createdAt:string;completedAt:string|null;status:'completed'|'completed_cleanup_required'|'failed';
  targetStyle:BeardAnalysisTarget|null;provider:string|null;model:string|null;overallSummary:string|null;acceptedCount:number;undecidedCount:number;dismissedCount:number;
  photoQuality:string|null;cleanupState:string;failureCategory:string|null;analysisVersion:string
}
export interface ReopenedBeardAnalysis {
  analysisId:string;supportId:string;status:string;createdAt:string;completedAt?:string|null;targetStyle?:BeardAnalysisTarget|null;
  result?:BeardPhotoAnalysisResult;summarySnapshot?:GroomingSummarySnapshot|null;trimPlanSnapshot?:TrimPlanSnapshot|null;analysisVersion?:string;
  decisions?:Array<{recommendationId:string;status:RecommendationReviewStatus}>;errorCode?:string|null
}
export async function listBeardAnalysisHistory(workspaceId:string,before?:Pick<BeardAnalysisHistoryItem,'createdAt'|'analysisId'>,limit=20):Promise<BeardAnalysisHistoryItem[]> {
  if(!supabase)return[]
  const response=await supabase.rpc('list_beard_analysis_history' as never,{candidate_workspace_id:workspaceId,candidate_limit:limit,candidate_before:before?.createdAt??null,candidate_before_id:before?.analysisId??null} as never)
  if(response.error)throw new BeardPhotoAnalysisError('NETWORK_FAILURE','Analysis history could not be loaded.')
  return response.data as unknown as BeardAnalysisHistoryItem[]
}
export async function reopenBeardAnalysis(workspaceId:string,analysisId:string):Promise<ReopenedBeardAnalysis> {
  if(!supabase)throw new BeardPhotoAnalysisError('PROVIDER_NOT_CONFIGURED',messageFor('PROVIDER_NOT_CONFIGURED'))
  const response=await supabase.rpc('reopen_beard_analysis' as never,{candidate_workspace_id:workspaceId,candidate_analysis_id:analysisId} as never)
  const data:unknown=response.data
  if(response.error||!data)throw new BeardPhotoAnalysisError('NETWORK_FAILURE','The analysis could not be reopened.')
  return data as ReopenedBeardAnalysis
}
export async function finishBeardAnalysisReview(workspaceId:string,analysisId:string,recommendations:BeardPhotoAnalysisResult['recommendations'],summary:GroomingSummarySnapshot,plan:TrimPlanSnapshot) {
  if(!supabase)throw new BeardPhotoAnalysisError('PROVIDER_NOT_CONFIGURED',messageFor('PROVIDER_NOT_CONFIGURED'))
  const decisions=recommendations.map(item=>({recommendationId:item.id,status:item.status}))
  const response=await supabase.rpc('finish_beard_analysis_review' as never,{candidate_workspace_id:workspaceId,candidate_analysis_id:analysisId,candidate_decisions:decisions,candidate_summary_snapshot:summary,candidate_trim_plan_snapshot:plan} as never)
  if(response.error){
    const targetMismatch=[response.error.message,response.error.details,response.error.hint].some(value=>value?.includes('SNAPSHOT_TARGET_MISMATCH'))
    const code=targetMismatch?'SNAPSHOT_TARGET_MISMATCH':'NETWORK_FAILURE'
    throw new BeardPhotoAnalysisError(code,messageFor(code))
  }
  return response.data
}

export async function reviewBeardPhotoRecommendation(
  workspaceId: string,
  recommendationId: string,
  status: RecommendationReviewStatus,
) {
  if (!supabase) {
    throw new BeardPhotoAnalysisError(
      "PROVIDER_NOT_CONFIGURED",
      messageFor("PROVIDER_NOT_CONFIGURED"),
    );
  }
  const updated = await supabase.from("intelligence_recommendations" as never)
    .update(
      { review_status: status, updated_at: new Date().toISOString() } as never,
    ).eq("workspace_id", workspaceId).eq("id", recommendationId);
  if (updated.error) {
    throw new BeardPhotoAnalysisError(
      "NETWORK_FAILURE",
      "Recommendation review state could not be saved.",
    );
  }
}
