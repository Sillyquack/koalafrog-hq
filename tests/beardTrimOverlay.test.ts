import { describe, expect, it } from "vitest";
import {
  type BeardPhotoAnalysisResult,
  validateBeardPhotoAnalysisResult,
  validateBeardPhotoContract,
} from "../supabase/functions/_shared/beardPhotoAnalysisContract";
import {
  beardTrimOverlayProviderSchema,
  validateBeardTrimOverlay,
} from "../supabase/functions/_shared/beardTrimOverlayContract";
import { beardPhotoProviderResultSchema } from "../supabase/functions/_shared/beardPhotoProviderSchema";
import { validateStructuredValue } from "../src/intelligence/Diagnostics";
import type { BeardTrimOverlay } from "../src/types/beardTrimOverlay";

const polyline = () => [
  { x: 0.2, y: 0.4 },
  { x: 0.5, y: 0.45 },
  { x: 0.8, y: 0.4 },
];
const polygon = () => [
  { x: 0.2, y: 0.4 },
  { x: 0.6, y: 0.4 },
  { x: 0.5, y: 0.8 },
];

const overlay = (): BeardTrimOverlay => ({
  version: "beard-trim-overlay-v1",
  coordinateSpace: "normalized_0_to_1",
  origin: "top_left",
  advisory: true,
  provenance: "ai",
  views: [{
    sourceView: "front",
    annotations: [{
      guidanceType: "cheek_line",
      geometry: { type: "polyline", points: polyline() },
      zoneReference: "upper cheek",
      guardMm: null,
      trimDirection: null,
      confidence: 0.82,
    }, {
      guidanceType: "trim_remove",
      geometry: { type: "polygon", points: polygon() },
      zoneReference: "lower cheek",
      guardMm: 7,
      trimDirection: "with growth",
      confidence: 0.76,
    }, {
      guidanceType: "blend_transition",
      geometry: { type: "polygon", points: polygon() },
      zoneReference: "upper sideburn",
      guardMm: null,
      trimDirection: "across growth",
      confidence: 0.7,
    }, {
      guidanceType: "keep_do_not_cross",
      geometry: { type: "polygon", points: polygon() },
      zoneReference: "chin",
      guardMm: null,
      trimDirection: null,
      confidence: 0.9,
    }],
  }, {
    sourceView: "under_chin",
    annotations: [{
      guidanceType: "neckline",
      geometry: { type: "polyline", points: polyline() },
      zoneReference: "neckline transition",
      guardMm: null,
      trimDirection: null,
      confidence: 0.78,
    }],
  }],
});

const analysis = (): BeardPhotoAnalysisResult => ({
  analysisId: "analysis-overlay",
  schemaVersion: 2,
  contractVersion: "beard-photo-result-contract-v2",
  promptVersion: "beard-photo-analysis-v6",
  provider: "openai",
  model: "gpt-5",
  createdAt: "2026-08-16T12:00:00.000Z",
  provenance: "ai",
  status: "completed",
  photoQuality: {
    overall: "suitable",
    perView: [],
    issues: [],
    retakeRecommended: false,
  },
  observations: [],
  symmetry: [],
  densityDistribution: [],
  lineAssessment: [],
  recommendations: [],
  trimOverlay: overlay(),
  limitations: [],
  unknowns: [],
  safetyFlags: [],
  correlationId: "overlay-support",
});
const providerSchema = () => {
  const value = analysis();
  return beardPhotoProviderResultSchema({
    analysisId: value.analysisId,
    provider: value.provider,
    model: value.model,
    correlationId: value.correlationId,
  });
};

describe("beard trim overlay v1 contract", () => {
  it("accepts every required guidance kind with normalized geometry", () => {
    const value = overlay();
    expect(
      validateStructuredValue(value, beardTrimOverlayProviderSchema).success,
    )
      .toBe(true);
    expect(validateBeardTrimOverlay(value)).toBe(true);
    expect(validateBeardPhotoContract(analysis()).success).toBe(true);
    expect(validateBeardPhotoAnalysisResult(analysis())).toBe(true);
    expect(
      new Set(
        value.views.flatMap((view) =>
          view.annotations.map((annotation) => annotation.guidanceType)
        ),
      ),
    ).toEqual(
      new Set([
        "neckline",
        "cheek_line",
        "trim_remove",
        "blend_transition",
        "keep_do_not_cross",
      ]),
    );
  });

  it("gracefully accepts null or absent overlay data", () => {
    const unavailable = analysis();
    unavailable.trimOverlay = null;
    expect(validateBeardPhotoAnalysisResult(unavailable)).toBe(true);
    expect(
      validateStructuredValue(null, beardTrimOverlayProviderSchema).success,
    )
      .toBe(true);

    const historical = analysis();
    delete historical.trimOverlay;
    expect(validateBeardPhotoAnalysisResult(historical)).toBe(true);
  });

  it("requires current provider output to contain a complete overlay or null", () => {
    const complete = analysis();
    expect(validateStructuredValue(complete, providerSchema()).success).toBe(
      true,
    );

    const unavailable = analysis();
    unavailable.trimOverlay = null;
    expect(
      validateStructuredValue(unavailable, providerSchema()).success,
    ).toBe(true);

    const absent = analysis() as
      & BeardPhotoAnalysisResult
      & Record<string, unknown>;
    delete absent.trimOverlay;
    expect(validateStructuredValue(absent, providerSchema())).toMatchObject({
      success: false,
      ruleCode: "VAL-0010",
      jsonPath: "$.trimOverlay",
    });

    const incomplete = analysis();
    incomplete.trimOverlay = {
      version: "beard-trim-overlay-v1",
    } as BeardTrimOverlay;
    expect(validateStructuredValue(incomplete, providerSchema())).toMatchObject(
      {
        success: false,
        ruleCode: "VAL-0010",
        jsonPath: "$.trimOverlay.coordinateSpace",
      },
    );
  });

  it("rejects the production object/object failure class at the provider boundary", () => {
    const result = analysis();
    const region = result.trimOverlay!.views[0].annotations[1];
    region.geometry.points = region.geometry.points.slice(0, 2);

    expect(validateBeardPhotoContract(result)).toMatchObject({
      success: false,
      ruleCode: "VAL-0011",
      jsonPath: "$.trimOverlay",
      expected: "object",
      received: "object",
      validator: "beard-contract",
      stage: "ContractValidation",
    });
    expect(validateStructuredValue(result, providerSchema())).toMatchObject({
      success: false,
      ruleCode: "VAL-0017",
      jsonPath: "$.trimOverlay.views[0].annotations[1].geometry.points",
      expected: "array",
      received: "array",
      validator: "json-schema",
      stage: "SchemaValidation",
    });
    expect(validateBeardPhotoAnalysisResult(result)).toBe(false);
  });

  it.each([
    ["polygon line guidance", (value: BeardTrimOverlay) => {
      value.views[0].annotations[0].geometry.type = "polygon";
    }, "$.trimOverlay.views[0].annotations[0].geometry.type"],
    ["polyline region guidance", (value: BeardTrimOverlay) => {
      value.views[0].annotations[1].geometry.type = "polyline";
    }, "$.trimOverlay.views[0].annotations[1].geometry.type"],
    ["guard metadata on line guidance", (value: BeardTrimOverlay) => {
      value.views[0].annotations[0].guardMm = 4;
    }, undefined],
    ["direction metadata on do-not-cross guidance", (value: BeardTrimOverlay) => {
      value.views[0].annotations[3].trimDirection = "against growth";
    }, "$.trimOverlay.views[0].annotations[3].trimDirection"],
  ])("rejects malformed %s before contract validation", (_name, mutate, path) => {
    const result = analysis();
    mutate(result.trimOverlay!);

    expect(validateStructuredValue(result, providerSchema())).toMatchObject({
      success: false,
      ...(path ? { jsonPath: path } : {}),
      validator: "json-schema",
      stage: "SchemaValidation",
    });
    expect(validateBeardPhotoContract(result)).toMatchObject({
      success: false,
      ruleCode: "VAL-0011",
      jsonPath: "$.trimOverlay",
      expected: "object",
      received: "object",
      validator: "beard-contract",
      stage: "ContractValidation",
    });
    expect(validateBeardPhotoAnalysisResult(result)).toBe(false);
  });

  it.each([
    ["out-of-range coordinate", (value: BeardTrimOverlay) => {
      value.views[0].annotations[0].geometry.points[0].x = 1.01;
    }],
    ["non-finite x coordinate", (value: BeardTrimOverlay) => {
      value.views[0].annotations[0].geometry.points[0].x = Number.NaN;
    }],
    ["non-finite y coordinate", (value: BeardTrimOverlay) => {
      value.views[0].annotations[0].geometry.points[0].y =
        Number.POSITIVE_INFINITY;
    }],
    ["polygon used for line guidance", (value: BeardTrimOverlay) => {
      value.views[0].annotations[0].geometry.type = "polygon";
    }],
    ["polyline used for region guidance", (value: BeardTrimOverlay) => {
      value.views[0].annotations[1].geometry.type = "polyline";
    }],
    ["guard on line guidance", (value: BeardTrimOverlay) => {
      value.views[0].annotations[0].guardMm = 4;
    }],
    ["direction on line guidance", (value: BeardTrimOverlay) => {
      value.views[0].annotations[0].trimDirection = "with growth";
    }],
    ["guard on a do-not-cross region", (value: BeardTrimOverlay) => {
      value.views[0].annotations[3].guardMm = 4;
    }],
    ["direction on a do-not-cross region", (value: BeardTrimOverlay) => {
      value.views[0].annotations[3].trimDirection = "against growth";
    }],
    ["duplicate source view", (value: BeardTrimOverlay) => {
      value.views[1].sourceView = "front";
    }],
    ["degenerate polygon", (value: BeardTrimOverlay) => {
      value.views[0].annotations[1].geometry.points = [
        { x: 0.1, y: 0.1 },
        { x: 0.2, y: 0.2 },
        { x: 0.3, y: 0.3 },
      ];
    }],
  ])("rejects %s deterministically", (_name, mutate) => {
    const value = overlay();
    mutate(value);
    expect(validateBeardTrimOverlay(value)).toBe(false);
    const result = analysis();
    result.trimOverlay = value;
    expect(validateBeardPhotoContract(result)).toMatchObject({
      success: false,
      ruleCode: "VAL-0011",
      jsonPath: "$.trimOverlay",
      validator: "beard-contract",
    });
    expect(validateBeardPhotoAnalysisResult(result)).toBe(false);
  });

  it("contains no source path, image bytes, owner decision, or executable command", () => {
    const serialized = JSON.stringify(overlay());
    expect(serialized).not.toMatch(
      /objectPath|dataUrl|base64|imageBytes|signedUrl|accepted_for_planning|recipeId|command/i,
    );
  });
});
