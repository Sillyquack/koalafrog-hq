import type { ValidationFailure } from "../../../src/intelligence/Diagnostics/ValidationTrace.ts";
import { BEARD_PHOTO_SCHEMA_VERSION } from "./beardPhotoAnalysisContract.ts";

export const BEARD_FAILURE_TRACE_VERSION =
  "intelligence-failure-trace-v1" as const;

const rules = new Set([
  "VAL-0001", "VAL-0002", "VAL-0003", "VAL-0004", "VAL-0010",
  "VAL-0011", "VAL-0012", "VAL-0013", "VAL-0014", "VAL-0015",
  "VAL-0016", "VAL-0017", "VAL-0020", "VAL-0030", "SEM-0001",
  "SEM-0002", "SEM-0003", "SEM-0004", "SEM-0005", "SEM-0006",
  "SEM-0010", "SEM-0099",
]);
const stages = new Set([
  "EnvelopeParsing", "JsonParsing", "SchemaValidation",
  "ContractValidation", "SemanticValidation",
]);
const validators = new Set([
  "responses-envelope", "responses-output", "json-parser", "json-schema",
  "beard-contract", "beard-semantic-safety-v2", "legacy-beard-validator",
]);
const expectedCategories = new Set([
  "object", "array", "string", "number", "integer", "boolean", "null",
  "required", "allowed enum", "constant", "unique id", "known reference",
  "safe text", "non-calibrated grooming language", "non-medical observation",
  "non-sensitive observation", "grooming-only recommendation",
  "unambiguous safe language", "completed response",
]);
const receivedCategories = new Set([
  "object", "array", "string", "number", "integer", "boolean", "null",
  "missing", "unexpected", "duplicate", "unknown reference", "unsafe text",
  "incomplete", "unknown", "unsupported measurement claim",
  "medical assertion", "infection assertion", "biological cause assertion",
  "sensitive trait inference", "personal inference", "unsafe recommendation",
  "ambiguous sensitive reference",
]);
const safeJsonPath = /^\$(?:\.[A-Za-z][A-Za-z0-9]*|\[[0-9]+\])*$/;

export function toDurableBeardFailureDiagnostic(
  diagnostic?: ValidationFailure,
) {
  if (
    !diagnostic || !stages.has(diagnostic.stage) ||
    !rules.has(diagnostic.ruleCode) || !validators.has(diagnostic.validator) ||
    !expectedCategories.has(diagnostic.expected) ||
    !receivedCategories.has(diagnostic.received) ||
    diagnostic.jsonPath.length > 160 || !safeJsonPath.test(diagnostic.jsonPath)
  ) return {};
  return {
    failure_stage: diagnostic.stage,
    failure_rule_code: diagnostic.ruleCode,
    failure_json_path: diagnostic.jsonPath,
    failure_validator: diagnostic.validator,
    failure_expected_category: diagnostic.expected,
    failure_received_category: diagnostic.received,
    failure_schema_version: BEARD_PHOTO_SCHEMA_VERSION,
    failure_trace_version: BEARD_FAILURE_TRACE_VERSION,
  };
}
