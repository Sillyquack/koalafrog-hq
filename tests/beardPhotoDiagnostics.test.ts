import { describe, expect, it } from "vitest";
import {
  type BeardPhotoAnalysisResult,
  validateBeardPhotoContract,
  validateBeardPhotoSemantics,
} from "../supabase/functions/_shared/beardPhotoAnalysisContract";

const base = (): BeardPhotoAnalysisResult => ({
  analysisId: "analysis",
  schemaVersion: 1,
  promptVersion: "v1",
  provider: "openai",
  model: "gpt-5",
  createdAt: "2026-07-21T00:00:00Z",
  provenance: "ai",
  status: "completed",
  photoQuality: {
    overall: "suitable",
    perView: [],
    issues: [],
    retakeRecommended: false,
  },
  observations: [{
    id: "observation-1",
    category: "density",
    statement: "Density appears even.",
    confidence: .8,
    supportingViews: ["front"],
    evidenceDescription: "Visible in the front view.",
    limitations: [],
    relatedBeardZones: [],
    provenance: "ai",
  }],
  symmetry: [],
  densityDistribution: [],
  lineAssessment: [],
  recommendations: [{
    id: "recommendation-1",
    title: "Review the outline",
    reason: "The outline appears uneven.",
    confidence: .7,
    priority: "low",
    expectedBenefit: "A more even outline.",
    supportingObservationIds: ["observation-1"],
    affectedZones: [],
    toolConstraints: [],
    proposedGuardStrategy: null,
    status: "undecided",
    provenance: "ai",
  }],
  limitations: [],
  unknowns: [],
  safetyFlags: [],
  correlationId: "support",
});
describe("Beard diagnostics adapters", () => {
  it("reports duplicate ids without content", () => {
    const value = base();
    value.symmetry = [{ ...value.observations[0] }];
    expect(validateBeardPhotoContract(value)).toMatchObject({
      success: false,
      ruleCode: "VAL-0013",
      jsonPath: "$.symmetry[0].id",
      received: "duplicate",
    });
  });
  it("reports broken references without the rejected id", () => {
    const value = base();
    value.recommendations[0].supportingObservationIds = ["private-reference"];
    const result = validateBeardPhotoContract(value);
    expect(result).toMatchObject({
      success: false,
      ruleCode: "VAL-0014",
      jsonPath: "$.recommendations[0].supportingObservationIds[0]",
    });
    expect(JSON.stringify(result)).not.toContain("private-reference");
  });
  it("separates semantic safety from structural validation", () => {
    const value = base();
    value.observations[0].statement = "Length appears 9 mm.";
    expect(validateBeardPhotoContract(value).success).toBe(true);
    expect(validateBeardPhotoSemantics(value)).toMatchObject({
      success: false,
      ruleCode: "VAL-0020",
      jsonPath: "$.observations[0].statement",
      received: "unsafe text",
    });
  });
});
