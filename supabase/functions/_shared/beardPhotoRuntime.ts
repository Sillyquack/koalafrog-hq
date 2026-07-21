export const BEARD_PROVIDER_TIMEOUT_DEFAULT_MS = 110_000;
export const BEARD_PROVIDER_TIMEOUT_MIN_MS = 60_000;
export const BEARD_PROVIDER_TIMEOUT_MAX_MS = 120_000;

export class InvalidProviderTimeoutError extends Error {}
export class ProviderDeadlineError extends Error {}

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

export async function withProviderDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await operation(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ProviderDeadlineError("PROVIDER_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
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
