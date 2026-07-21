import type { IntelligenceRuleCode } from "./TraceCodes";
export const intelligenceStages = [
  "Authentication",
  "WorkspaceValidation",
  "ContextBuild",
  "InputValidation",
  "ProviderConfiguration",
  "ImageRetrieval",
  "ProviderInvocation",
  "ProviderResponse",
  "EnvelopeParsing",
  "JsonParsing",
  "SchemaValidation",
  "ContractValidation",
  "SemanticValidation",
  "Persistence",
  "CleanupDeleteRequested",
  "CleanupDeleteAcknowledged",
  "CleanupDeleteVerified",
  "CleanupMetadataUpdated",
  "Completed",
] as const;
export type IntelligenceStage = typeof intelligenceStages[number];
export type TraceResult = "started" | "succeeded" | "failed" | "skipped";
export type SafeExpected =
  | "object"
  | "array"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null"
  | "required"
  | "allowed enum"
  | "constant"
  | "unique id"
  | "known reference"
  | "safe text"
  | "deleted object"
  | "empty prefix"
  | "completed response";
export type SafeReceived =
  | "object"
  | "array"
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "null"
  | "missing"
  | "unexpected"
  | "duplicate"
  | "unknown reference"
  | "unsafe text"
  | "incomplete"
  | "not deleted"
  | "unknown";
export interface IntelligenceTraceEvent {
  stage: IntelligenceStage;
  result: TraceResult;
  ruleCode?: IntelligenceRuleCode;
  jsonPath?: string;
  expectedType?: SafeExpected;
  receivedType?: SafeReceived;
  validator?: string;
  provider?: string;
  model?: string;
  elapsedMs: number;
  supportId: string;
  analysisId: string;
  timestamp: string;
}
export interface IntelligenceTrace {
  supportId: string;
  analysisId: string;
  events: readonly IntelligenceTraceEvent[];
}
export type IntelligenceFailureCode =
  | "INVALID_ENVELOPE"
  | "MISSING_OUTPUT_TEXT"
  | "PROVIDER_INCOMPLETE"
  | "INVALID_JSON"
  | "SCHEMA_VALIDATION_FAILED"
  | "CONTRACT_VALIDATION_FAILED"
  | "SEMANTIC_VALIDATION_FAILED"
  | "UNKNOWN_VALIDATION_FAILURE"
  | "CLEANUP_VERIFICATION_FAILED";
