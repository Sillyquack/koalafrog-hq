export const BEARD_RESPONSES_PARSER_VERSION =
  "beard-responses-parser-v1" as const;

export type BeardResponsesExtractionCode =
  | "PROVIDER_RESPONSE_ENVELOPE_INVALID"
  | "PROVIDER_STRUCTURED_OUTPUT_MISSING"
  | "PROVIDER_STRUCTURED_OUTPUT_AMBIGUOUS"
  | "PROVIDER_OUTPUT_TEXT_MISSING"
  | "PROVIDER_OUTPUT_JSON_INVALID"
  | "PROVIDER_OUTPUT_REFUSAL"
  | "PROVIDER_RESPONSE_PARSE_INTERNAL_ERROR";

export interface BeardResponsesStructuralDiagnostic {
  outerBodyJson: boolean;
  topLevelType: "object" | "array" | "null" | "other";
  outputItemCount: number | null;
  outputItemTypes: string[];
  contentBlockTypes: string[];
  parsedObjectPresent: boolean;
  outputTextPresent: boolean;
  refusalPresent: boolean;
  jsonParsingAttempted: boolean;
  extractionStage:
    | "envelope_validation"
    | "structured_output_location"
    | "output_json_parsing"
    | "structured_output_extracted";
  expectedLocation: "$.output[].content[]";
  receivedCategory:
    | "object"
    | "array"
    | "null"
    | "missing"
    | "unexpected"
    | "duplicate"
    | "unknown";
  parserVersion: typeof BEARD_RESPONSES_PARSER_VERSION;
}

export class BeardResponsesExtractionError extends Error {
  constructor(
    public code: BeardResponsesExtractionCode,
    public diagnostic: BeardResponsesStructuralDiagnostic,
  ) {
    super(code);
    this.name = "BeardResponsesExtractionError";
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const safeType = (value: unknown) =>
  typeof value === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(value)
    ? value
    : "unknown";
const category = (
  value: unknown,
): BeardResponsesStructuralDiagnostic["receivedCategory"] =>
  value === null
    ? "null"
    : Array.isArray(value)
    ? "array"
    : record(value)
    ? "object"
    : value === undefined
    ? "missing"
    : "unknown";

export function extractBeardResponsesResult(
  raw: unknown,
): {
  result: Record<string, unknown>;
  usage?: unknown;
  diagnostic: BeardResponsesStructuralDiagnostic;
} {
  const diagnostic: BeardResponsesStructuralDiagnostic = {
    outerBodyJson: true,
    topLevelType: category(raw) === "object"
      ? "object"
      : category(raw) === "array"
      ? "array"
      : category(raw) === "null"
      ? "null"
      : "other",
    outputItemCount: null,
    outputItemTypes: [],
    contentBlockTypes: [],
    parsedObjectPresent: false,
    outputTextPresent: false,
    refusalPresent: false,
    jsonParsingAttempted: false,
    extractionStage: "envelope_validation",
    expectedLocation: "$.output[].content[]",
    receivedCategory: category(raw),
    parserVersion: BEARD_RESPONSES_PARSER_VERSION,
  };
  if (!record(raw) || !Array.isArray(raw.output)) {
    throw new BeardResponsesExtractionError(
      "PROVIDER_RESPONSE_ENVELOPE_INVALID",
      diagnostic,
    );
  }

  diagnostic.outputItemCount = raw.output.length;
  diagnostic.outputItemTypes = raw.output.map((item) =>
    record(item) ? safeType(item.type) : "unknown"
  );
  diagnostic.extractionStage = "structured_output_location";
  const content = raw.output.flatMap((item) =>
    record(item) && Array.isArray(item.content) ? item.content : []
  );
  diagnostic.contentBlockTypes = content.map((item) =>
    record(item) ? safeType(item.type) : "unknown"
  );
  diagnostic.refusalPresent = content.some((item) =>
    record(item) && item.type === "refusal"
  );
  if (diagnostic.refusalPresent) {
    diagnostic.receivedCategory = "unexpected";
    throw new BeardResponsesExtractionError(
      "PROVIDER_OUTPUT_REFUSAL",
      diagnostic,
    );
  }

  const candidates: Record<string, unknown>[] = [];
  try {
    for (const block of content) {
      if (!record(block) || block.type !== "output_text") continue;
      const parsed = record(block.parsed) ? block.parsed : undefined;
      const text = typeof block.text === "string" && block.text.length > 0
        ? block.text
        : undefined;
      diagnostic.parsedObjectPresent ||= Boolean(parsed);
      diagnostic.outputTextPresent ||= Boolean(text);
      let textResult: Record<string, unknown> | undefined;
      if (text) {
        diagnostic.jsonParsingAttempted = true;
        diagnostic.extractionStage = "output_json_parsing";
        let value: unknown;
        try {
          value = JSON.parse(text);
        } catch {
          diagnostic.receivedCategory = "unknown";
          throw new BeardResponsesExtractionError(
            "PROVIDER_OUTPUT_JSON_INVALID",
            diagnostic,
          );
        }
        if (!record(value)) {
          diagnostic.receivedCategory = category(value);
          throw new BeardResponsesExtractionError(
            "PROVIDER_OUTPUT_JSON_INVALID",
            diagnostic,
          );
        }
        textResult = value;
      }
      if (parsed && textResult &&
        JSON.stringify(parsed) !== JSON.stringify(textResult)) {
        diagnostic.receivedCategory = "duplicate";
        throw new BeardResponsesExtractionError(
          "PROVIDER_STRUCTURED_OUTPUT_AMBIGUOUS",
          diagnostic,
        );
      }
      if (textResult ?? parsed) candidates.push((textResult ?? parsed)!);
    }
  } catch (error) {
    if (error instanceof BeardResponsesExtractionError) throw error;
    diagnostic.receivedCategory = "unknown";
    throw new BeardResponsesExtractionError(
      "PROVIDER_RESPONSE_PARSE_INTERNAL_ERROR",
      diagnostic,
    );
  }

  if (candidates.length > 1) {
    diagnostic.receivedCategory = "duplicate";
    throw new BeardResponsesExtractionError(
      "PROVIDER_STRUCTURED_OUTPUT_AMBIGUOUS",
      diagnostic,
    );
  }
  if (candidates.length === 0) {
    diagnostic.receivedCategory = "missing";
    throw new BeardResponsesExtractionError(
      diagnostic.contentBlockTypes.includes("output_text")
        ? "PROVIDER_OUTPUT_TEXT_MISSING"
        : "PROVIDER_STRUCTURED_OUTPUT_MISSING",
      diagnostic,
    );
  }
  diagnostic.extractionStage = "structured_output_extracted";
  diagnostic.receivedCategory = "object";
  return { result: candidates[0], usage: raw.usage, diagnostic };
}
