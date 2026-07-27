export const BEARD_FUNCTION_WALL_CLOCK_LIMIT_MS = 400_000;
export const BEARD_FUNCTION_NON_PROVIDER_RESERVE_MS = 100_000;
export const BEARD_PROVIDER_TIMEOUT_DEFAULT_MS = 180_000;
export const BEARD_PROVIDER_TIMEOUT_MIN_MS = 60_000;
export const BEARD_PROVIDER_TIMEOUT_MAX_MS =
  BEARD_FUNCTION_WALL_CLOCK_LIMIT_MS - BEARD_FUNCTION_NON_PROVIDER_RESERVE_MS;

export class InvalidProviderTimeoutError extends Error {}

export type ProviderStage =
  | "provider_prepare_started"
  | "provider_dispatch_started"
  | "provider_dispatched"
  | "provider_response_headers_received"
  | "provider_response_body_started"
  | "provider_response_body_completed"
  | "provider_response_parsed"
  | "provider_timeout_triggered"
  | "provider_transport_failed"
  | "provider_http_error_received"
  | "provider_completed";

export type ProviderFailureClassification =
  | "PROVIDER_TIMEOUT_RESPONSE_HEADERS"
  | "PROVIDER_TIMEOUT_RESPONSE_BODY"
  | "PROVIDER_TRANSPORT_NETWORK"
  | "PROVIDER_HTTP_ERROR"
  | "PROVIDER_RESPONSE_PARSE_FAILED"
  | "PROVIDER_CALLER_ABORTED";

export interface ProviderInvocationTrace {
  stage: ProviderStage;
  failureClassification: ProviderFailureClassification | null;
  timeoutSource: "application_deadline" | "caller" | null;
  timeoutBudgetMs: number;
  elapsedMs: number;
  requestDispatched: boolean;
  responseHeadersReceived: boolean;
  responseBodyCompleted: boolean;
  httpStatusClass: "2xx" | "4xx" | "5xx" | "other" | null;
  abortSignalAborted: boolean;
  abortReasonCode: "application_deadline" | "caller" | null;
  transportErrorCategory: "network" | null;
  providerRequestIdPresent: boolean;
  responsePresent: boolean;
  usagePresent: boolean;
}

export type SafeProviderRateLimitCode =
  | "PROVIDER_RATE_LIMIT_REQUESTS"
  | "PROVIDER_RATE_LIMIT_TOKENS"
  | "PROVIDER_QUOTA_EXHAUSTED"
  | "PROVIDER_BILLING_LIMIT"
  | "PROVIDER_MODEL_LIMIT"
  | "PROVIDER_RATE_LIMIT_UNKNOWN";

export interface SafeProviderHttpError {
  httpStatus: number;
  type: string | null;
  code: string | null;
  category: SafeProviderRateLimitCode | "PROVIDER_HTTP_ERROR";
  retryAfter: string | null;
  requestLimit: string | null;
  requestRemaining: string | null;
  requestReset: string | null;
  tokenLimit: string | null;
  tokenRemaining: string | null;
  tokenReset: string | null;
  requestId: string | null;
  projectIdRedacted: string | null;
  organizationIdRedacted: string | null;
}

export class ProviderInvocationError extends Error {
  constructor(
    public classification: ProviderFailureClassification,
    public trace: ProviderInvocationTrace,
    public response?: Response,
    public httpError?: SafeProviderHttpError,
  ) {
    super(classification);
  }
}

const safeProviderToken = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 && value.length <= 96 &&
    /^[a-zA-Z0-9_.:/ -]+$/.test(value)
    ? value
    : null;

const redactProviderIdentifier = (value: string | null): string | null => {
  const safe = safeProviderToken(value);
  if (!safe) return null;
  return safe.length <= 8 ? "redacted" : `${safe.slice(0, 4)}…${safe.slice(-4)}`;
};

export function classifyOpenAIRateLimit(input: {
  status: number;
  type?: unknown;
  code?: unknown;
  param?: unknown;
  message?: unknown;
  headers?: Headers;
}): SafeProviderHttpError {
  const type = safeProviderToken(input.type);
  const code = safeProviderToken(input.code);
  const param = safeProviderToken(input.param);
  const message = typeof input.message === "string"
    ? input.message.toLowerCase().slice(0, 2_000)
    : "";
  const headers = input.headers ?? new Headers();
  const lowerType = type?.toLowerCase() ?? "";
  const lowerCode = code?.toLowerCase() ?? "";
  const lowerParam = param?.toLowerCase() ?? "";
  const combined = `${lowerType} ${lowerCode}`;
  let category: SafeProviderHttpError["category"] = "PROVIDER_HTTP_ERROR";
  if (input.status === 429) {
    category = combined.includes("billing_hard_limit")
      ? "PROVIDER_BILLING_LIMIT"
      : combined.includes("insufficient_quota")
      ? "PROVIDER_QUOTA_EXHAUSTED"
      : combined.includes("model") &&
          (combined.includes("limit") || combined.includes("rate"))
        ? "PROVIDER_MODEL_LIMIT"
      : lowerParam === "model" &&
          (combined.includes("limit") || message.includes("rate limit"))
      ? "PROVIDER_MODEL_LIMIT"
      : message.includes("billing hard limit") ||
          message.includes("billing limit")
      ? "PROVIDER_BILLING_LIMIT"
      : message.includes("quota") && !message.includes("rate limit")
      ? "PROVIDER_QUOTA_EXHAUSTED"
      : message.includes("tokens per") || message.includes("token rate") ||
          message.includes("tokens/min")
      ? "PROVIDER_RATE_LIMIT_TOKENS"
      : message.includes("requests per") ||
          message.includes("request rate") || message.includes("requests/min")
      ? "PROVIDER_RATE_LIMIT_REQUESTS"
      : "PROVIDER_RATE_LIMIT_UNKNOWN";
  }
  return {
    httpStatus: input.status,
    type,
    code,
    category,
    retryAfter: safeProviderToken(headers.get("retry-after")),
    requestLimit: safeProviderToken(headers.get("x-ratelimit-limit-requests")),
    requestRemaining: safeProviderToken(
      headers.get("x-ratelimit-remaining-requests"),
    ),
    requestReset: safeProviderToken(headers.get("x-ratelimit-reset-requests")),
    tokenLimit: safeProviderToken(headers.get("x-ratelimit-limit-tokens")),
    tokenRemaining: safeProviderToken(
      headers.get("x-ratelimit-remaining-tokens"),
    ),
    tokenReset: safeProviderToken(headers.get("x-ratelimit-reset-tokens")),
    requestId: safeProviderToken(headers.get("x-request-id")),
    projectIdRedacted: redactProviderIdentifier(
      headers.get("openai-project") ?? headers.get("x-openai-project"),
    ),
    organizationIdRedacted: redactProviderIdentifier(
      headers.get("openai-organization") ??
        headers.get("x-openai-organization"),
    ),
  };
}

const statusClass = (
  status: number,
): ProviderInvocationTrace["httpStatusClass"] =>
  status >= 200 && status < 300
    ? "2xx"
    : status >= 400 && status < 500
    ? "4xx"
    : status >= 500 && status < 600
    ? "5xx"
    : "other";

export async function invokeProviderJson(options: {
  request: (signal: AbortSignal) => Promise<Response>;
  timeoutMs: number;
  callerSignal?: AbortSignal;
  now?: () => number;
}): Promise<{ response: Response; json: unknown; trace: ProviderInvocationTrace }> {
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  const controller = new AbortController();
  const trace: ProviderInvocationTrace = {
    stage: "provider_prepare_started",
    failureClassification: null,
    timeoutSource: null,
    timeoutBudgetMs: options.timeoutMs,
    elapsedMs: 0,
    requestDispatched: false,
    responseHeadersReceived: false,
    responseBodyCompleted: false,
    httpStatusClass: null,
    abortSignalAborted: false,
    abortReasonCode: null,
    transportErrorCategory: null,
    providerRequestIdPresent: false,
    responsePresent: false,
    usagePresent: false,
  };
  const fail = (
    classification: ProviderFailureClassification,
    stage: ProviderStage,
    response?: Response,
    httpError?: SafeProviderHttpError,
  ): never => {
    trace.stage = stage;
    trace.failureClassification = classification;
    trace.elapsedMs = Math.max(0, Math.round(now() - startedAt));
    trace.abortSignalAborted = controller.signal.aborted;
    throw new ProviderInvocationError(
      classification,
      { ...trace },
      response,
      httpError,
    );
  };
  const abort = (source: "application_deadline" | "caller") => {
    if (controller.signal.aborted) return;
    trace.timeoutSource = source;
    trace.abortReasonCode = source;
    controller.abort(source);
  };
  const enforceDeadline = (
    phase: "response_headers" | "response_body",
  ) => {
    if (!controller.signal.aborted && now() - startedAt >= options.timeoutMs) {
      abort("application_deadline");
    }
    if (!controller.signal.aborted) return;
    if (trace.timeoutSource === "caller") {
      return fail("PROVIDER_CALLER_ABORTED", "provider_transport_failed");
    }
    return fail(
      phase === "response_headers"
        ? "PROVIDER_TIMEOUT_RESPONSE_HEADERS"
        : "PROVIDER_TIMEOUT_RESPONSE_BODY",
      "provider_timeout_triggered",
    );
  };
  const timer = setTimeout(() => abort("application_deadline"), options.timeoutMs);
  const callerAbort = () => abort("caller");
  options.callerSignal?.addEventListener("abort", callerAbort, { once: true });
  try {
    if (options.callerSignal?.aborted) {
      abort("caller");
      return fail("PROVIDER_CALLER_ABORTED", "provider_transport_failed");
    }
    trace.stage = "provider_dispatch_started";
    trace.requestDispatched = true;
    trace.stage = "provider_dispatched";
    let response: Response;
    try {
      response = await options.request(controller.signal);
    } catch {
      if (trace.timeoutSource === "caller") {
        return fail("PROVIDER_CALLER_ABORTED", "provider_transport_failed");
      }
      if (trace.timeoutSource === "application_deadline") {
        return fail(
          "PROVIDER_TIMEOUT_RESPONSE_HEADERS",
          "provider_timeout_triggered",
        );
      }
      trace.transportErrorCategory = "network";
      return fail("PROVIDER_TRANSPORT_NETWORK", "provider_transport_failed");
    }
    enforceDeadline("response_headers");
    trace.responsePresent = true;
    trace.responseHeadersReceived = true;
    trace.stage = "provider_response_headers_received";
    trace.httpStatusClass = statusClass(response.status);
    trace.providerRequestIdPresent = response.headers.has("x-request-id");
    if (!response.ok) {
      let errorBody: unknown = null;
      try {
        const body = await response.text();
        enforceDeadline("response_body");
        trace.responseBodyCompleted = true;
        errorBody = body.length <= 65_536 ? JSON.parse(body) : null;
      } catch {
        // Missing or malformed provider error bodies are classified safely below.
      }
      enforceDeadline("response_body");
      const error = errorBody && typeof errorBody === "object" &&
          !Array.isArray(errorBody) &&
          (errorBody as Record<string, unknown>).error &&
          typeof (errorBody as Record<string, unknown>).error === "object" &&
          !Array.isArray((errorBody as Record<string, unknown>).error)
        ? (errorBody as { error: Record<string, unknown> }).error
        : {};
      const httpError = classifyOpenAIRateLimit({
        status: response.status,
        type: error.type,
        code: error.code,
        param: error.param,
        message: error.message,
        headers: response.headers,
      });
      return fail(
        "PROVIDER_HTTP_ERROR",
        "provider_http_error_received",
        response,
        httpError,
      );
    }
    trace.stage = "provider_response_body_started";
    let body: string;
    try {
      body = await response.text();
    } catch {
      if (trace.timeoutSource === "caller") {
        return fail("PROVIDER_CALLER_ABORTED", "provider_transport_failed");
      }
      if (trace.timeoutSource === "application_deadline") {
        return fail(
          "PROVIDER_TIMEOUT_RESPONSE_BODY",
          "provider_timeout_triggered",
        );
      }
      trace.transportErrorCategory = "network";
      return fail("PROVIDER_TRANSPORT_NETWORK", "provider_transport_failed");
    }
    enforceDeadline("response_body");
    trace.responseBodyCompleted = true;
    trace.stage = "provider_response_body_completed";
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return fail("PROVIDER_RESPONSE_PARSE_FAILED", "provider_transport_failed");
    }
    trace.stage = "provider_response_parsed";
    trace.usagePresent = Boolean(
      json && typeof json === "object" && !Array.isArray(json) &&
        (json as Record<string, unknown>).usage &&
        typeof (json as Record<string, unknown>).usage === "object" &&
        !Array.isArray((json as Record<string, unknown>).usage),
    );
    enforceDeadline("response_body");
    trace.stage = "provider_completed";
    trace.elapsedMs = Math.max(0, Math.round(now() - startedAt));
    return { response, json, trace: { ...trace } };
  } finally {
    clearTimeout(timer);
    options.callerSignal?.removeEventListener("abort", callerAbort);
  }
}

export function parseBeardProviderTimeout(
  raw: string | undefined | null,
): number {
  if (raw == null || raw.trim() === "") {
    return BEARD_PROVIDER_TIMEOUT_DEFAULT_MS;
  }
  if (!/^\d+$/.test(raw.trim())) {
    throw new InvalidProviderTimeoutError("INVALID_PROVIDER_TIMEOUT");
  }
  const timeoutMs = Number(raw);
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < BEARD_PROVIDER_TIMEOUT_MIN_MS ||
    timeoutMs > BEARD_PROVIDER_TIMEOUT_MAX_MS
  ) {
    throw new InvalidProviderTimeoutError("INVALID_PROVIDER_TIMEOUT");
  }
  return timeoutMs;
}

export type BeardAnalysisStage =
  | "authentication_completed"
  | "context_loaded"
  | "images_loaded"
  | "provider_request_started"
  | "provider_response_received"
  | "validation_completed"
  | "cleanup_completed";

export function beardStageLog(event: {
  correlationId: string;
  analysisId: string;
  stage: BeardAnalysisStage;
  elapsedMs: number;
  outcomeCode?: string;
  provider?: string;
  model?: string;
}): string {
  return JSON.stringify({
    event: "beard_photo_analysis_stage",
    correlationId: event.correlationId,
    analysisId: event.analysisId,
    stage: event.stage,
    elapsedMs: Math.max(0, Math.round(event.elapsedMs)),
    ...(event.outcomeCode ? { outcomeCode: event.outcomeCode } : {}),
    ...(event.provider ? { provider: event.provider } : {}),
    ...(event.model ? { model: event.model } : {}),
  });
}

export function beardProviderHttpErrorLog(event: {
  correlationId: string;
  analysisId: string;
  provider: string;
  model: string;
  diagnostic: SafeProviderHttpError | undefined;
}): string {
  return JSON.stringify({
    event: "beard_provider_http_error",
    correlationId: event.correlationId,
    analysisId: event.analysisId,
    provider: event.provider,
    model: event.model,
    ...(event.diagnostic ?? {}),
  });
}
