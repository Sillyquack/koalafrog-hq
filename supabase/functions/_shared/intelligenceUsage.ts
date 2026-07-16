export interface NormalizedProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
  providerUsageVersion: "openai-responses-v1";
  estimatedCostUsd?: number;
  pricingSnapshotVersion?: string;
}

const nonnegativeInteger = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
const nonnegativeNumber = (value: string | undefined) => {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

export function normalizeOpenAIUsage(
  value: unknown,
  pricing?: {
    inputUsdPerMillion?: string;
    cachedInputUsdPerMillion?: string;
    outputUsdPerMillion?: string;
    snapshotVersion?: string;
  },
): NormalizedProviderUsage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const usage = value as Record<string, unknown>;
  const inputDetails = usage.input_tokens_details as
    | Record<string, unknown>
    | undefined;
  const outputDetails = usage.output_tokens_details as
    | Record<string, unknown>
    | undefined;
  const inputTokens = nonnegativeInteger(usage.input_tokens);
  const outputTokens = nonnegativeInteger(usage.output_tokens);
  const totalTokens = nonnegativeInteger(usage.total_tokens);
  const cachedInputTokens = nonnegativeInteger(inputDetails?.cached_tokens);
  const reasoningTokens = nonnegativeInteger(outputDetails?.reasoning_tokens);
  if (inputTokens == null && outputTokens == null && totalTokens == null)
    return undefined;
  const normalized: NormalizedProviderUsage = {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens,
    reasoningTokens,
    providerUsageVersion: "openai-responses-v1",
  };
  const inputRate = nonnegativeNumber(pricing?.inputUsdPerMillion);
  const cachedRate = nonnegativeNumber(pricing?.cachedInputUsdPerMillion);
  const outputRate = nonnegativeNumber(pricing?.outputUsdPerMillion);
  if (
    inputTokens != null &&
    outputTokens != null &&
    inputRate != null &&
    outputRate != null &&
    pricing?.snapshotVersion
  ) {
    const cached = cachedInputTokens ?? 0;
    normalized.estimatedCostUsd =
      ((inputTokens - cached) * inputRate +
        cached * (cachedRate ?? inputRate) +
        outputTokens * outputRate) /
      1_000_000;
    normalized.pricingSnapshotVersion = pricing.snapshotVersion;
  }
  return normalized;
}
