import { safeRuntimeType } from "../SafeDiagnostics.ts";
import { intelligenceRuleCodes } from "../TraceCodes.ts";
import {
  validationFailure,
  validationSuccess,
  type ValidationTrace,
} from "../ValidationTrace.ts";

export interface StructuredSchemaNode {
  type?: string | readonly string[];
  const?: unknown;
  enum?: readonly unknown[];
  minimum?: number;
  maximum?: number;
  properties?: Readonly<Record<string, StructuredSchemaNode>>;
  required?: readonly string[];
  additionalProperties?: boolean;
  items?: StructuredSchemaNode;
}
const expectedType = (type: string) =>
  type === "object" || type === "array" || type === "string" ||
    type === "number" || type === "integer" || type === "boolean" ||
    type === "null"
    ? type
    : "object";
const matches = (value: unknown, type: string) =>
  type === "null"
    ? value === null
    : type === "array"
    ? Array.isArray(value)
    : type === "integer"
    ? Number.isInteger(value)
    : type === "object"
    ? Boolean(value) && typeof value === "object" && !Array.isArray(value)
    : typeof value === type;

export function validateStructuredValue(
  value: unknown,
  schema: StructuredSchemaNode,
  path = "$",
): ValidationTrace {
  const types = (Array.isArray(schema.type) ? schema.type : [schema.type])
    .filter((x): x is string => Boolean(x));
  if (types.length && !types.some((type) => matches(value, type))) {
    return validationFailure({
      ruleCode: intelligenceRuleCodes.wrongType,
      jsonPath: path,
      expected: expectedType(types[0]),
      received: safeRuntimeType(value),
      validator: "json-schema",
      stage: "SchemaValidation",
    });
  }
  if (schema.enum && !schema.enum.includes(value)) {
    return validationFailure({
      ruleCode: intelligenceRuleCodes.enumMismatch,
      jsonPath: path,
      expected: "allowed enum",
      received: safeRuntimeType(value),
      validator: "json-schema",
      stage: "SchemaValidation",
    });
  }
  if ("const" in schema && value !== schema.const) {
    return validationFailure({
      ruleCode: intelligenceRuleCodes.constMismatch,
      jsonPath: path,
      expected: "constant",
      received: safeRuntimeType(value),
      validator: "json-schema",
      stage: "SchemaValidation",
    });
  }
  if (
    typeof value === "number" &&
    ((schema.minimum != null && value < schema.minimum) ||
      (schema.maximum != null && value > schema.maximum))
  ) {
    return validationFailure({
      ruleCode: intelligenceRuleCodes.rangeViolation,
      jsonPath: path,
      expected: "number",
      received: safeRuntimeType(value),
      validator: "json-schema",
      stage: "SchemaValidation",
    });
  }
  if (
    value && typeof value === "object" && !Array.isArray(value) &&
    schema.properties
  ) {
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in record)) {
        return validationFailure({
          ruleCode: intelligenceRuleCodes.missingRequiredProperty,
          jsonPath: `${path}.${key}`,
          expected: "required",
          received: "missing",
          validator: "json-schema",
          stage: "SchemaValidation",
        });
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(record)) {
        if (!(key in schema.properties)) {
          return validationFailure({
            ruleCode: intelligenceRuleCodes.unexpectedProperty,
            jsonPath: `${path}.${key}`,
            expected: "object",
            received: "unexpected",
            validator: "json-schema",
            stage: "SchemaValidation",
          });
        }
      }
    }
    for (const [key, child] of Object.entries(schema.properties)) {
      if (key in record) {
        const result = validateStructuredValue(
          record[key],
          child,
          `${path}.${key}`,
        );
        if (!result.success) return result;
      }
    }
  }
  if (Array.isArray(value) && schema.items) {
    for (const [index, item] of value.entries()) {
      const result = validateStructuredValue(
        item,
        schema.items,
        `${path}[${index}]`,
      );
      if (!result.success) {
        return result;
      }
    }
  }
  return validationSuccess(value);
}
