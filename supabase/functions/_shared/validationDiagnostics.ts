import type {
  ResponseValidationResult,
  ValidationIssue,
} from "./intelligenceResponseValidation.ts";

const MAX_VALIDATION_ISSUES = 10;
const safeText = (value: unknown) =>
  typeof value === "string" && value
    ? value
        .slice(0, 200)
        .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
        .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]")
        .replace(
          /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
          "[REDACTED]",
        )
    : undefined;

function sanitizeIssue(issue: ValidationIssue) {
  return {
    validationStage: issue.stage,
    code: safeText(issue.code),
    path: safeText(issue.path),
    ...(safeText(issue.claimId) ? { claimId: safeText(issue.claimId) } : {}),
    ...(safeText(issue.claimKind)
      ? { claimKind: safeText(issue.claimKind) }
      : {}),
    ...(issue.evidenceRefCount != null
      ? { evidenceRefCount: issue.evidenceRefCount }
      : {}),
    ...(safeText(issue.evidenceEntityType)
      ? { evidenceEntityType: safeText(issue.evidenceEntityType) }
      : {}),
    ...(issue.evidenceIdAbsentFromManifest != null
      ? {
          evidenceIdAbsentFromManifest:
            issue.evidenceIdAbsentFromManifest,
        }
      : {}),
    ...(safeText(issue.expectedSemanticCategory)
      ? { expectedSemanticCategory: safeText(issue.expectedSemanticCategory) }
      : {}),
  };
}

export function createValidationDiagnostic(input: {
  result: ResponseValidationResult;
  responseSchemaVersion?: number;
  contextVersion?: number;
  threadId?: string;
  runId?: string;
}) {
  return {
    event: "koalafrog_intelligence_validation_diagnostic",
    responseSchemaVersion: input.responseSchemaVersion,
    contextVersion: input.contextVersion,
    ...(safeText(input.threadId) ? { threadId: safeText(input.threadId) } : {}),
    ...(safeText(input.runId) ? { runId: safeText(input.runId) } : {}),
    issueCount: input.result.issues.length,
    issuesTruncated: input.result.issues.length > MAX_VALIDATION_ISSUES,
    issues: input.result.issues
      .slice(0, MAX_VALIDATION_ISSUES)
      .map(sanitizeIssue),
  };
}
