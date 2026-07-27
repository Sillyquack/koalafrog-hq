import { describe, expect, it } from "vitest";
import {
  BeardResponsesExtractionError,
  extractBeardResponsesResult,
} from "./beardResponsesExtraction";

const result = { analysisId: "analysis", schemaVersion: 2 };
const envelope = (content: unknown[]) => ({
  id: "resp_safe",
  object: "response",
  status: "completed",
  output: [
    { id: "rs_safe", type: "reasoning", summary: [] },
    { id: "msg_safe", type: "message", role: "assistant", content },
  ],
  usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
});
const failure = (value: unknown) => {
  try {
    extractBeardResponsesResult(value);
    throw new Error("expected extraction failure");
  } catch (error) {
    expect(error).toBeInstanceOf(BeardResponsesExtractionError);
    return error as BeardResponsesExtractionError;
  }
};

describe("canonical Beard Responses extraction", () => {
  it("extracts the raw REST output_text JSON shape", () => {
    const extracted = extractBeardResponsesResult(envelope([
      { type: "output_text", text: JSON.stringify(result), annotations: [] },
    ]));
    expect(extracted.result).toEqual(result);
    expect(extracted.diagnostic).toMatchObject({
      outputItemCount: 2,
      outputItemTypes: ["reasoning", "message"],
      contentBlockTypes: ["output_text"],
      outputTextPresent: true,
      jsonParsingAttempted: true,
      extractionStage: "structured_output_extracted",
    });
  });

  it("accepts SDK-shaped nested parsed output", () => {
    expect(extractBeardResponsesResult(envelope([
      { type: "output_text", parsed: result },
    ])).result).toEqual(result);
  });

  it("accepts matching parsed and textual output exactly once", () => {
    expect(extractBeardResponsesResult(envelope([
      { type: "output_text", parsed: result, text: JSON.stringify(result) },
    ])).result).toEqual(result);
  });

  it.each([
    ["empty output", { object: "response", status: "completed", output: [] }, "PROVIDER_STRUCTURED_OUTPUT_MISSING"],
    ["unexpected content", envelope([{ type: "tool_result" }]), "PROVIDER_STRUCTURED_OUTPUT_MISSING"],
    ["missing output text", envelope([{ type: "output_text", text: "" }]), "PROVIDER_OUTPUT_TEXT_MISSING"],
    ["malformed JSON", envelope([{ type: "output_text", text: "{" }]), "PROVIDER_OUTPUT_JSON_INVALID"],
    ["refusal", envelope([{ type: "refusal", refusal: "not retained" }]), "PROVIDER_OUTPUT_REFUSAL"],
    ["text-only response", envelope([{ type: "output_text", text: "plain text" }]), "PROVIDER_OUTPUT_JSON_INVALID"],
    ["invalid envelope", { object: "response" }, "PROVIDER_RESPONSE_ENVELOPE_INVALID"],
  ])("classifies %s", (_label, value, code) => {
    const error = failure(value);
    expect(error.code).toBe(code);
    expect(JSON.stringify(error.diagnostic)).not.toMatch(/not retained|plain text/);
  });

  it("rejects multiple or disagreeing structured objects", () => {
    expect(failure(envelope([
      { type: "output_text", text: JSON.stringify(result) },
      { type: "output_text", text: JSON.stringify({ ...result, schemaVersion: 3 }) },
    ])).code).toBe("PROVIDER_STRUCTURED_OUTPUT_AMBIGUOUS");
    expect(failure(envelope([
      {
        type: "output_text",
        parsed: result,
        text: JSON.stringify({ ...result, schemaVersion: 3 }),
      },
    ])).code).toBe("PROVIDER_STRUCTURED_OUTPUT_AMBIGUOUS");
  });
});
