import { describe, expect, it } from "vitest";
import {
  BEARD_PHOTO_SEMANTIC_RULE_VERSION,
  type BeardPhotoAnalysisResult,
  validateBeardPhotoContract,
  validateBeardPhotoSemantics,
  validateBeardPhotoSemanticsV3,
} from "../supabase/functions/_shared/beardPhotoAnalysisContract";
import { toDurableBeardFailureDiagnostic } from "../supabase/functions/_shared/beardPhotoFailureDiagnostics";

const result = (strategy: string): BeardPhotoAnalysisResult => ({
  analysisId: "analysis-v4",
  schemaVersion: 2,
  contractVersion: "beard-photo-result-contract-v2",
  promptVersion: "beard-photo-analysis-v4",
  provider: "openai",
  model: "gpt-5",
  createdAt: "2026-07-23T00:00:00Z",
  provenance: "ai",
  status: "completed",
  photoQuality: {
    overall: "suitable",
    perView: [{
      view: "front",
      quality: "suitable",
      issues: [],
    }],
    issues: [],
    retakeRecommended: false,
  },
  observations: [{
    observationKey: "side_fullness",
    category: "visible fullness",
    statement: "The sides appear less full than the chin.",
    confidence: 0.7,
    supportingViews: ["front", "left_profile", "right_profile"],
    evidenceDescription: "Visible comparison across the supplied views.",
    limitations: ["Lighting may affect the visible contrast."],
    relatedBeardZones: ["left_side", "right_side", "chin"],
    provenance: "ai",
  }],
  symmetry: [],
  densityDistribution: [],
  lineAssessment: [],
  recommendations: [{
    id: "recommendation-v4",
    title: "Preserve side fullness",
    reason: "A conservative tool setting can be reviewed after trimming.",
    confidence: 0.7,
    priority: "medium",
    expectedBenefit: "May preserve a fuller visual balance.",
    supportingObservationKeys: ["side_fullness"],
    affectedZones: ["left_side", "right_side"],
    toolConstraints: ["Confirm the attachment fits the selected trimmer."],
    proposedGuardStrategy: strategy,
    status: "undecided",
    provenance: "ai",
  }],
  limitations: ["Photos cannot provide calibrated measurement."],
  unknowns: ["The actual trimmed result remains unknown until reviewed."],
  safetyFlags: [],
  correlationId: "support-v4",
});

describe("beard semantic safety v4 guard strategies", () => {
  it("routes new semantic validation to v4", () => {
    expect(BEARD_PHOTO_SEMANTIC_RULE_VERSION).toBe(
      "beard-semantic-safety-v4",
    );
  });

  it.each([
    "Use a longer guard first.",
    "Try guard 4 on the sides.",
    "Try the 6 mm guard on the sides.",
    "Test the 6–9 mm guards and keep the fuller option.",
    "A 9 mm attachment may preserve more fullness.",
    "Use the longer Philips Beard Trimmer 7000 attachment first.",
    "Use one setting shorter around the sideburns.",
    "Suggested guard setting: 8 mm.",
    "Start with the 10 mm comb and reassess before going shorter.",
    "Try the longer attachment first, then blend down one numbered setting.",
    "A 7 mm trimmer setting could be tested around the sides.",
    "Use the attachment closest to the preferred fullness recorded in the recipe.",
    "Keep the current Length Map setting.",
    "The actual result can vary with hair texture and tool technique.",
  ])("allows a role-aware equipment proposal: %s", (strategy) => {
    const value = result(strategy);
    const before = structuredClone(value);
    expect(validateBeardPhotoContract(value).success).toBe(true);
    expect(validateBeardPhotoSemantics(value).success).toBe(true);
    expect(value).toEqual(before);
  });

  it.each([
    "Your beard is exactly 8 mm long.",
    "The image shows the cheek hair measures 6.4 mm.",
    "Your left side is 2 mm shorter than your right.",
    "The photograph proves the chin section is 12 mm.",
    "Your beard grows 0.35 mm per day.",
    "Clearly exactly 8 mm based on the photo.",
    "Measured from the uploaded image.",
    "The image was used to calculate exact hair dimensions.",
    "This beard density is exactly 42 hairs per square centimetre.",
    "Your beard has 17 percent greater density on the right side.",
    "This will produce exactly 10 mm of visible beard.",
    "A 6 mm guard will leave exactly 6 mm everywhere.",
    "This setting guarantees a final physical length of 8 mm.",
    "The result will definitely be 9 mm across the whole beard.",
    "Use guard 8 and the final beard length will be precisely 8 mm.",
    "Use the 8 mm guard because the image proves your beard is currently 12 mm.",
    "Try guard 4; your cheek hair clearly measures exactly 6 mm.",
    "A 9 mm attachment may help because the photograph confirms a 10.2 mm current length.",
    "Use the longer comb, which guarantees exactly 9 mm everywhere.",
  ])("rejects physical measurements, guarantees, and mixed claims: %s", (strategy) => {
    const value = result(strategy);
    expect(validateBeardPhotoContract(value).success).toBe(true);
    expect(validateBeardPhotoSemantics(value)).toMatchObject({
      success: false,
      ruleCode: "SEM-0001",
      jsonPath: "$.recommendations[0].proposedGuardStrategy",
      validator: "beard-semantic-safety-v4",
    });
  });

  it("preserves v3 behavior while v4 admits attachment vocabulary", () => {
    const value = result("A 9 mm attachment may preserve more fullness.");
    expect(validateBeardPhotoSemanticsV3(value)).toMatchObject({
      success: false,
      ruleCode: "SEM-0001",
      validator: "beard-semantic-safety-v3",
    });
    expect(validateBeardPhotoSemantics(value).success).toBe(true);
  });

  it("keeps historical v3 diagnostic identity separate from v4 routing", () => {
    const unsafe = result("The photograph proves the chin section is 12 mm.");
    expect(validateBeardPhotoSemanticsV3(unsafe)).toMatchObject({
      success: false,
      validator: "beard-semantic-safety-v3",
    });
    expect(validateBeardPhotoSemantics(unsafe)).toMatchObject({
      success: false,
      validator: "beard-semantic-safety-v4",
    });
  });

  it("admits only allowlisted v4 failure metadata without rejected text", () => {
    const rejectedText = "private rejected measurement wording";
    const diagnostic = toDurableBeardFailureDiagnostic({
      success: false,
      ruleCode: "SEM-0001",
      jsonPath: "$.recommendations[0].proposedGuardStrategy",
      expected: "non-calibrated grooming language",
      received: "unsupported measurement claim",
      validator: "beard-semantic-safety-v4",
      stage: "SemanticValidation",
    });
    expect(diagnostic).toMatchObject({
      failure_validator: "beard-semantic-safety-v4",
      failure_rule_code: "SEM-0001",
    });
    expect(JSON.stringify(diagnostic)).not.toContain(rejectedText);
  });

  it("keeps contract integrity independent from semantic rejection", () => {
    const unsafe = result(
      "Use the 8 mm guard because the image proves your beard is currently 12 mm.",
    );
    expect(validateBeardPhotoContract(unsafe).success).toBe(true);
    expect(validateBeardPhotoSemantics(unsafe).success).toBe(false);
    expect(unsafe.recommendations[0].supportingObservationKeys).toEqual([
      "side_fullness",
    ]);
  });
});
