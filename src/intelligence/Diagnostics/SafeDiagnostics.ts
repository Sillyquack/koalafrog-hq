import {
  type IntelligenceStage,
  intelligenceStages,
  type IntelligenceTraceEvent,
  type SafeExpected,
  type SafeReceived,
  type TraceResult,
} from "./TraceTypes";
import { type IntelligenceRuleCode, intelligenceRuleCodes } from "./TraceCodes";
const results = new Set<TraceResult>([
    "started",
    "succeeded",
    "failed",
    "skipped",
  ]),
  stages = new Set<IntelligenceStage>(intelligenceStages),
  rules = new Set<IntelligenceRuleCode>(Object.values(intelligenceRuleCodes));
const expected = new Set<SafeExpected>([
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
  "null",
  "required",
  "allowed enum",
  "constant",
  "unique id",
  "known reference",
  "safe text",
  "deleted object",
  "empty prefix",
  "completed response",
]);
const received = new Set<SafeReceived>([
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
  "null",
  "missing",
  "unexpected",
  "duplicate",
  "unknown reference",
  "unsafe text",
  "incomplete",
  "not deleted",
  "unknown",
]);
const identifier = (value: string) =>
  /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : "redacted";
const safePath = (value: string | undefined) =>
  value && /^\$(?:\.[A-Za-z][A-Za-z0-9]*|\[\d+\])*$/.test(value)
    ? value
    : undefined;
export function safeTraceEvent(
  value: IntelligenceTraceEvent,
): IntelligenceTraceEvent {
  const path = safePath(value.jsonPath);
  return {
    stage: stages.has(value.stage) ? value.stage : "Completed",
    result: results.has(value.result) ? value.result : "failed",
    ...(value.ruleCode && rules.has(value.ruleCode)
      ? { ruleCode: value.ruleCode }
      : {}),
    ...(path ? { jsonPath: path } : {}),
    ...(value.expectedType && expected.has(value.expectedType)
      ? { expectedType: value.expectedType }
      : {}),
    ...(value.receivedType && received.has(value.receivedType)
      ? { receivedType: value.receivedType }
      : {}),
    ...(value.validator ? { validator: identifier(value.validator) } : {}),
    ...(value.provider ? { provider: identifier(value.provider) } : {}),
    ...(value.model ? { model: identifier(value.model) } : {}),
    elapsedMs: Math.max(0, Math.round(value.elapsedMs)),
    supportId: identifier(value.supportId),
    analysisId: identifier(value.analysisId),
    timestamp: Number.isNaN(Date.parse(value.timestamp))
      ? new Date(0).toISOString()
      : value.timestamp,
  };
}
export function safeRuntimeType(value: unknown): SafeReceived {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  const type = typeof value;
  return type === "object" || type === "string" || type === "number" ||
      type === "boolean"
    ? type
    : "unknown";
}
