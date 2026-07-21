import type { IntelligenceTrace, IntelligenceTraceEvent } from "./TraceTypes";
export function traceSummary(trace: IntelligenceTrace) {
  const completed = trace.events.filter((x) => x.result !== "started");
  return {
    supportId: trace.supportId,
    analysisId: trace.analysisId,
    eventCount: trace.events.length,
    lastFailure: [...completed].reverse().find((x) => x.result === "failed"),
    stageDurations: completed.map((x) => ({
      stage: x.stage,
      durationMs: x.elapsedMs,
      result: x.result,
    })),
  };
}
export function ruleFrequencies(events: readonly IntelligenceTraceEvent[]) {
  return events.reduce<Record<string, number>>((out, event) => {
    if (event.ruleCode) out[event.ruleCode] = (out[event.ruleCode] ?? 0) + 1;
    return out;
  }, {});
}
export function topFailures(
  events: readonly IntelligenceTraceEvent[],
  limit = 5,
) {
  return Object.entries(ruleFrequencies(events)).sort((a, b) =>
    b[1] - a[1] || a[0].localeCompare(b[0])
  ).slice(0, Math.max(0, limit)).map(([ruleCode, count]) => ({
    ruleCode,
    count,
  }));
}
export function providerDurationStats(
  events: readonly IntelligenceTraceEvent[],
) {
  const values = events.filter((x) =>
    x.stage === "ProviderInvocation" && x.result === "succeeded"
  ).map((x) => x.elapsedMs).sort((a, b) => a - b);
  if (!values.length) return { count: 0, averageMs: null, medianMs: null };
  const middle = Math.floor(values.length / 2),
    median = values.length % 2
      ? values[middle]
      : (values[middle - 1] + values[middle]) / 2;
  return {
    count: values.length,
    averageMs: values.reduce((a, b) => a + b, 0) / values.length,
    medianMs: median,
  };
}
