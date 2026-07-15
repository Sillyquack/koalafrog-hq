export type ProviderFailureCategory =
  | "provider_authentication"
  | "quota_billing_rate_limit"
  | "model_unavailable"
  | "invalid_provider_request"
  | "provider_server_failure"
  | "provider_response_parsing"
  | "provider_response_validation"
  | "provider_failure";
export interface ProviderDiagnosticInput {
  providerName: string;
  modelName: string;
  category: ProviderFailureCategory;
  httpStatus?: number;
  errorType?: string;
  errorCode?: string;
  requestId?: string;
  safeMessage?: string;
  threadId?: string;
  runId?: string;
}
const safeText = (value: unknown) => {
  if (typeof value !== "string" || !value) return undefined;
  return value
    .slice(0, 500)
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(
      /(api[_ -]?key|authorization|token|secret)\s*[:=]\s*\S+/gi,
      "$1=[REDACTED]",
    );
};
export function classifyProviderFailure(
  status?: number,
  type?: string,
  code?: string,
): ProviderFailureCategory {
  const signal = `${type ?? ""} ${code ?? ""}`.toLowerCase();
  if (
    status === 401 ||
    status === 403 ||
    signal.includes("authentication") ||
    signal.includes("invalid_api_key")
  )
    return "provider_authentication";
  if (
    status === 429 ||
    signal.includes("quota") ||
    signal.includes("billing") ||
    signal.includes("rate_limit")
  )
    return "quota_billing_rate_limit";
  if (
    status === 404 ||
    signal.includes("model_not_found") ||
    signal.includes("model unavailable")
  )
    return "model_unavailable";
  if (status === 400 || status === 422 || signal.includes("invalid_request"))
    return "invalid_provider_request";
  if (status != null && status >= 500) return "provider_server_failure";
  return "provider_failure";
}
export function sanitizeProviderDiagnostic(input: ProviderDiagnosticInput) {
  return {
    event: "koalafrog_intelligence_provider_diagnostic",
    providerName: safeText(input.providerName),
    modelName: safeText(input.modelName),
    category: input.category,
    ...(input.httpStatus != null ? { httpStatus: input.httpStatus } : {}),
    ...(safeText(input.errorType)
      ? { errorType: safeText(input.errorType) }
      : {}),
    ...(safeText(input.errorCode)
      ? { errorCode: safeText(input.errorCode) }
      : {}),
    ...(safeText(input.requestId)
      ? { requestId: safeText(input.requestId) }
      : {}),
    ...(safeText(input.safeMessage)
      ? { safeMessage: safeText(input.safeMessage) }
      : {}),
    ...(safeText(input.threadId) ? { threadId: safeText(input.threadId) } : {}),
    ...(safeText(input.runId) ? { runId: safeText(input.runId) } : {}),
  };
}
