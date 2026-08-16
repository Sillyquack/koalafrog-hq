import { describe, expect, it } from "vitest";
import {
  BEARD_GUARD_NORMALIZER_VERSION,
  normalizeBeardGuardStrategies,
  parseLegacyBeardGuardStrategy,
  renderCanonicalBeardGuardStrategy,
  type BeardPhotoProviderResult,
  type StructuredBeardGuardStrategy,
} from "../supabase/functions/_shared/beardGuardStrategy";
import {
  validateBeardPhotoAnalysisResult,
  validateBeardPhotoContract,
  validateBeardPhotoSemantics,
  type BeardPhotoAnalysisResult,
} from "../supabase/functions/_shared/beardPhotoAnalysisContract";
import { extractBeardResponsesResult } from "../supabase/functions/_shared/beardResponsesExtraction";
import { beardPhotoProviderResultSchema } from "../supabase/functions/_shared/beardPhotoProviderSchema";
import { structuredOutputSchemaErrors } from "../supabase/functions/_shared/structuredOutputSchema";
import { validateStructuredValue } from "../src/intelligence/Diagnostics";

const structured = (
  value: Partial<StructuredBeardGuardStrategy>,
): StructuredBeardGuardStrategy => ({
  strategyType: "guard_setting",
  region: "cheeks",
  guardMm: 7,
  guardRangeMm: null,
  relativeInstruction: null,
  uncertainty: "starting_point",
  freeformTechnique: null,
  ...value,
});

const fixture = (strategy: unknown): BeardPhotoAnalysisResult => ({
  analysisId: "4d9e50b3-dda2-4c91-8c9f-d71c3f42a245",
  schemaVersion: 2,
  contractVersion: "beard-photo-result-contract-v2",
  promptVersion: "beard-photo-analysis-v6",
  provider: "openai",
  model: "gpt-5",
  createdAt: "2026-07-26T10:00:00.000Z",
  provenance: "ai",
  status: "completed",
  photoQuality: {
    overall: "suitable",
    perView: [
      { view: "front", quality: "suitable", issues: [] },
      { view: "left_profile", quality: "suitable", issues: [] },
      { view: "right_profile", quality: "suitable", issues: [] },
    ],
    issues: [],
    retakeRecommended: false,
  },
  observations: [{
    observationKey: "front_visual_balance",
    category: "visible balance",
    statement: "The front view appears visually balanced.",
    confidence: 0.8,
    supportingViews: ["front"],
    evidenceDescription: "Visible in the supplied front view.",
    limitations: [],
    relatedBeardZones: ["cheeks"],
    provenance: "ai",
  }],
  symmetry: [],
  densityDistribution: [],
  lineAssessment: [],
  recommendations: [{
    id: "a2257a31-3d8b-42d0-ad07-cf81e83e2b41",
    title: "Test a conservative guard setting",
    reason: "A reversible equipment setting supports cautious planning.",
    confidence: 0.7,
    priority: "low",
    expectedBenefit: "Preserve the visible balance while testing a small change.",
    supportingObservationKeys: ["front_visual_balance"],
    affectedZones: ["cheeks"],
    toolConstraints: [],
    proposedGuardStrategy: strategy as string,
    status: "undecided",
    provenance: "ai",
  }],
  limitations: ["Photos cannot provide calibrated measurement."],
  unknowns: [],
  safetyFlags: [],
  correlationId: "719465a3-9ba6-4bbc-90d2-36e2406b70bc",
});

describe("deterministic beard guard strategy boundary", () => {
  it("reproduces the production object-at-recommendation-3 validator exception safely", () => {
    const escaped = fixture(null);
    escaped.recommendations = Array.from({ length: 4 }, (_, index) => ({
      ...escaped.recommendations[0],
      id: `a2257a3${index}-3d8b-42d0-ad07-cf81e83e2b4${index}`,
      proposedGuardStrategy: index === 3
        ? structured({}) as unknown as string
        : null,
    }));

    expect(() => validateBeardPhotoSemantics(escaped)).not.toThrow();
    expect(validateBeardPhotoSemantics(escaped)).toMatchObject({
      success: false,
      ruleCode: "VAL-0030",
      jsonPath: "$.recommendations[3].proposedGuardStrategy",
      expected: "string",
      received: "object",
      validator: "beard-semantic-safety-v4",
    });
  });

  it("normalizes the exact provider object shape before canonical semantic validation", () => {
    const provider = {
      ...fixture(null),
      trimOverlay: null,
      recommendations: Array.from({ length: 4 }, (_, index) => ({
        ...fixture(null).recommendations[0],
        id: `provider-recommendation-${index}`,
        proposedGuardStrategy: index === 3 ? structured({}) : null,
      })),
    } as BeardPhotoProviderResult;
    const schema = beardPhotoProviderResultSchema({
      analysisId: provider.analysisId,
      provider: provider.provider,
      model: provider.model,
      correlationId: provider.correlationId,
    });

    expect(structuredOutputSchemaErrors(schema)).toEqual([]);
    expect(validateStructuredValue(provider, schema).success).toBe(true);
    const normalized = normalizeBeardGuardStrategies(provider);
    expect(normalized.success).toBe(true);
    if (!normalized.success) return;
    expect(normalized.result.recommendations[3].proposedGuardStrategy).toBe(
      "Try a 7 mm guard on the cheeks as a starting point.",
    );
    expect(validateBeardPhotoSemantics(normalized.result).success).toBe(true);
  });

  it("preserves the successful legacy provider string path", () => {
    const provider = {
      ...fixture(null),
      trimOverlay: null,
      recommendations: [{
        ...fixture(null).recommendations[0],
        proposedGuardStrategy: "Use a 7 mm guard on the cheeks.",
      }],
    } as BeardPhotoProviderResult;
    expect(validateStructuredValue(
      provider,
      beardPhotoProviderResultSchema({
        analysisId: provider.analysisId,
        provider: provider.provider,
        model: provider.model,
        correlationId: provider.correlationId,
      }),
    ).success).toBe(true);
    const normalized = normalizeBeardGuardStrategies(provider);
    expect(normalized.success).toBe(true);
    if (!normalized.success) return;
    expect(normalized.result.recommendations[0].proposedGuardStrategy).toBe(
      "Try a 7 mm guard on the cheeks as a starting point.",
    );
  });

  it.each([
    {
      name: "array value",
      value: [],
      ruleCode: "VAL-0011",
      suffix: "",
    },
    {
      name: "missing structured property",
      value: {
        strategyType: "guard_setting",
        region: "cheeks",
        guardMm: 7,
        guardRangeMm: null,
        relativeInstruction: null,
        freeformTechnique: null,
      },
      ruleCode: "VAL-0010",
      suffix: ".uncertainty",
    },
    {
      name: "fractional guard",
      value: structured({ guardMm: 7.5 }),
      ruleCode: "VAL-0011",
      suffix: ".guardMm",
    },
  ])("rejects $name at the provider schema boundary", ({ value, ruleCode, suffix }) => {
    const provider = {
      ...fixture(null),
      trimOverlay: null,
      recommendations: Array.from({ length: 4 }, (_, index) => ({
        ...fixture(null).recommendations[0],
        id: `provider-recommendation-${index}`,
        proposedGuardStrategy: index === 3 ? value : null,
      })),
    } as unknown as BeardPhotoProviderResult;
    const validation = validateStructuredValue(
      provider,
      beardPhotoProviderResultSchema({
        analysisId: provider.analysisId,
        provider: provider.provider,
        model: provider.model,
        correlationId: provider.correlationId,
      }),
    );
    expect(validation).toMatchObject({
      success: false,
      ruleCode,
      jsonPath: `$.recommendations[3].proposedGuardStrategy${suffix}`,
      validator: "json-schema",
      stage: "SchemaValidation",
    });
  });

  it.each([
    ["Use a 7 mm guard on the cheeks.", "Try a 7 mm guard on the cheeks as a starting point."],
    ["Try 7–9 mm on the sides.", "Try a 7–9 mm guard range on the sides and check the result after each pass."],
    ["Keep the chin one setting longer than the sides.", "Keep the chin one guard setting longer than the sides."],
    ["Start with the longest guard and reduce gradually.", "Begin with the longest suitable guard and shorten gradually."],
    ["Start at 10 mm and work downward.", "Try a 10 mm guard overall as a starting point, then shorten gradually."],
  ])("canonicalizes legacy equipment instruction %s", (input, expected) => {
    const normalized = normalizeBeardGuardStrategies(fixture(input));
    expect(normalized.success).toBe(true);
    if (!normalized.success) return;
    expect(normalized.result.recommendations[0].proposedGuardStrategy).toBe(expected);
    expect(normalized.metadata[0]).toEqual({
      recommendationIndex: 0,
      guardStrategySource: "parsed_legacy",
      guardStrategyNormalized: true,
      normalizerVersion: BEARD_GUARD_NORMALIZER_VERSION,
    });
    expect(validateBeardPhotoContract(normalized.result).success).toBe(true);
    expect(validateBeardPhotoSemantics(normalized.result).success).toBe(true);
    expect(validateBeardPhotoAnalysisResult(normalized.result)).toBe(true);
  });

  it.each([
    [structured({}), "Try a 7 mm guard on the cheeks as a starting point."],
    [structured({ strategyType: "guard_range", region: "sides", guardMm: null,
      guardRangeMm: { min: 7, max: 9 }, uncertainty: "adjust_after_each_pass" }),
    "Try a 7–9 mm guard range on the sides and check the result after each pass."],
    [structured({ strategyType: "relative_guard", region: "chin", guardMm: null,
      relativeInstruction: "longer_than_sides" }),
    "Keep the chin one guard setting longer than the sides."],
    [structured({ strategyType: "longest_first", region: "overall", guardMm: null,
      relativeInstruction: "longest_first", freeformTechnique: "shorten_gradually" }),
    "Begin with the longest suitable guard and shorten gradually."],
  ])("renders structured provider strategy deterministically", (input, expected) => {
    expect(renderCanonicalBeardGuardStrategy(input as StructuredBeardGuardStrategy)).toBe(expected);
    const normalized = normalizeBeardGuardStrategies(fixture(input));
    expect(normalized.success).toBe(true);
    if (normalized.success) {
      expect(normalized.result.recommendations[0].proposedGuardStrategy).toBe(expected);
      expect(normalized.metadata[0].guardStrategySource).toBe("structured_provider");
      expect(validateBeardPhotoSemantics(normalized.result).success).toBe(true);
    }
  });

  it.each([
    "The cheeks are 7 mm long.",
    "The beard currently measures 9 mm.",
    "The chin is 2 mm longer.",
    "7 mm is objectively correct based on the photo.",
    "This guarantees a final length of 8 mm.",
    "There is 7 mm around the lower area.",
    "The density is 80%.",
    "The facial angle is 35 degrees.",
    "Growth is 2 mm per day.",
  ])("fails closed for unsafe or ambiguous clause %s", (input) => {
    expect(parseLegacyBeardGuardStrategy(input)).toBeUndefined();
    expect(normalizeBeardGuardStrategies(fixture(input))).toEqual({
      success: false,
      recommendationIndex: 0,
    });
  });

  it("does not retain raw provider grammar in the canonical result", () => {
    const raw = "Use a 7 mm guard on the cheeks.";
    const normalized = normalizeBeardGuardStrategies(fixture(raw));
    expect(normalized.success).toBe(true);
    if (normalized.success) {
      expect(JSON.stringify(normalized.result)).not.toContain(raw);
      expect(normalized.result.recommendations).toHaveLength(1);
    }
  });

  it("runs the repeated provider fixture through normalization, canonical validation, and hydration", () => {
    const providerResult = fixture("Use a 7 mm guard on the cheeks.");
    const normalized = normalizeBeardGuardStrategies(providerResult);
    expect(normalized.success).toBe(true);
    if (!normalized.success) return;
    const canonical = normalized.result;
    expect(validateBeardPhotoContract(canonical).success).toBe(true);
    expect(validateBeardPhotoSemantics(canonical).success).toBe(true);
    expect(validateBeardPhotoAnalysisResult(canonical)).toBe(true);
    const persistedJson = JSON.stringify(canonical);
    const hydrated = JSON.parse(persistedJson);
    expect(validateBeardPhotoAnalysisResult(hydrated)).toBe(true);
    expect(hydrated.recommendations[0].proposedGuardStrategy).toBe(
      "Try a 7 mm guard on the cheeks as a starting point.",
    );
    expect(persistedJson).not.toContain("Use a 7 mm guard on the cheeks.");
  });

  it("runs a realistic v6 Responses envelope through extraction, normalization, persistence, hydration, and reopen", () => {
    let providerCalls = 0;
    const response = {
      id: "resp_safe",
      object: "response",
      status: "completed",
      output: [
        { id: "rs_safe", type: "reasoning", summary: [] },
        {
          id: "msg_safe",
          type: "message",
          role: "assistant",
          content: [{
            type: "output_text",
            text: JSON.stringify(fixture("Use a 7 mm guard on the cheeks.")),
            annotations: [],
          }],
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    };
    const invokeProvider = () => {
      providerCalls += 1;
      return response;
    };
    const extracted = extractBeardResponsesResult(invokeProvider());
    const providerTyped = extracted.result as unknown as BeardPhotoAnalysisResult;
    expect(providerTyped.promptVersion).toBe("beard-photo-analysis-v6");
    const normalized = normalizeBeardGuardStrategies(providerTyped);
    expect(normalized.success).toBe(true);
    if (!normalized.success) return;
    expect(validateBeardPhotoContract(normalized.result).success).toBe(true);
    expect(validateBeardPhotoSemantics(normalized.result).success).toBe(true);
    expect(validateBeardPhotoAnalysisResult(normalized.result)).toBe(true);

    const analyses = new Map<string, string>();
    analyses.set(normalized.result.analysisId, JSON.stringify(normalized.result));
    const terminalTimestamp = "2026-07-27T05:31:38.365Z";
    const reopen = () => {
      const stored = analyses.get(normalized.result.analysisId);
      if (!stored) throw new Error("missing persisted analysis");
      return { result: JSON.parse(stored), terminalTimestamp };
    };
    const first = reopen();
    const second = reopen();
    expect(validateBeardPhotoAnalysisResult(first.result)).toBe(true);
    expect(second).toEqual(first);
    expect(analyses).toHaveLength(1);
    expect(providerCalls).toBe(1);
  });
});
