import { describe, expect, it } from "vitest";
import {
  type BeardPhotoAnalysisResult,
  validateBeardPhotoContract,
  validateBeardPhotoSemantics,
} from "../supabase/functions/_shared/beardPhotoAnalysisContract";
import { toDurableBeardFailureDiagnostic } from "../supabase/functions/_shared/beardPhotoFailureDiagnostics";
import type { ValidationFailure } from "../src/intelligence/Diagnostics/ValidationTrace";

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
      ruleCode: "SEM-0001",
      jsonPath: "$.observations[0].statement",
      received: "unsupported measurement claim",
    });
  });

  it("replays deterministic semantic safety v3 fixtures without provider content", () => {
    const fixtures: Array<{
      name: string;
      mutate: (value: BeardPhotoAnalysisResult) => void;
      success: boolean;
      ruleCode?: string;
      jsonPath?: string;
    }> = [
      {
        name: "valid grooming analysis",
        mutate: () => undefined,
        success: true,
      },
      {
        name: "diagnosis limitation",
        mutate: (value) => {
          value.limitations = ["These photos cannot diagnose a medical condition."];
        },
        success: true,
      },
      {
        name: "medical assertion",
        mutate: (value) => {
          value.observations[0].statement = "You have a medical condition.";
        },
        success: false,
        ruleCode: "SEM-0002",
        jsonPath: "$.observations[0].statement",
      },
      {
        name: "measurement unavailable",
        mutate: (value) => {
          value.limitations = ["Exact millimetre length cannot be determined from these photos."];
        },
        success: true,
      },
      {
        name: "exact visual measurement",
        mutate: (value) => {
          value.observations[0].statement = "The beard is 12 mm long.";
        },
        success: false,
        ruleCode: "SEM-0001",
        jsonPath: "$.observations[0].statement",
      },
      {
        name: "existing guard setting",
        mutate: (value) => {
          value.recommendations[0].proposedGuardStrategy =
            "Use the existing 8 mm Beard Studio guard setting.";
        },
        success: true,
      },
      {
        name: "hormonal cause assertion",
        mutate: (value) => {
          value.observations[0].statement = "This is caused by hormones.";
        },
        success: false,
        ruleCode: "SEM-0004",
        jsonPath: "$.observations[0].statement",
      },
      {
        name: "professional care guidance",
        mutate: (value) => {
          value.limitations = ["Consult a clinician for medical concerns."];
        },
        success: true,
      },
      {
        name: "ambiguous sensitive wording",
        mutate: (value) => {
          value.unknowns = ["Hormonal factors are relevant."];
        },
        success: false,
        ruleCode: "SEM-0099",
        jsonPath: "$.unknowns[0]",
      },
      {
        name: "stable first violation",
        mutate: (value) => {
          value.observations[0].statement = "The beard measures 12 mm.";
          value.limitations = ["You have an infection."];
        },
        success: false,
        ruleCode: "SEM-0001",
        jsonPath: "$.observations[0].statement",
      },
    ];
    for (const fixture of fixtures) {
      const value = base();
      fixture.mutate(value);
      const result = validateBeardPhotoSemantics(value);
      expect(result.success, fixture.name).toBe(fixture.success);
      if (!fixture.success) {
        expect(result, fixture.name).toMatchObject({
          ruleCode: fixture.ruleCode,
          jsonPath: fixture.jsonPath,
          validator: "beard-semantic-safety-v3",
        });
        expect(JSON.stringify(result)).not.toContain(
          value.observations[0].statement,
        );
      }
    }
  });

  it.each([
    "Use the 5 mm guard on the sideburns.",
    "Start one guard step longer, then reduce if needed.",
    "Keep the current Length Map setting.",
    "The active recipe uses a 7 mm guard.",
    "Test a proposed 6 mm guard as a conservative starting point.",
    "Start with a proposed 4 mm guard, test it, and increase if needed.",
    "Your current Length Map lists a user-supplied 5 mm side setting.",
  ])("allows guard instructions and workspace context: %s", (strategy) => {
    const value = base();
    value.recommendations[0].proposedGuardStrategy = strategy;
    expect(validateBeardPhotoSemantics(value).success).toBe(true);
  });

  it("allows exact-measurement limitations", () => {
    const value = base();
    value.limitations = ["Exact beard length cannot be determined from photos."];
    expect(validateBeardPhotoSemantics(value).success).toBe(true);
  });

  it.each([
    ["The beard is exactly 12 mm long.", "$.observations[0].statement"],
    ["The image shows 10 mm growth.", "$.observations[0].statement"],
    [
      "Use an 8 mm guard because the beard visibly measures 11 mm.",
      "$.recommendations[0].proposedGuardStrategy",
    ],
    [
      "This will leave exactly 8 mm of physical beard.",
      "$.recommendations[0].proposedGuardStrategy",
    ],
    [
      "The photo shows the beard is 9 mm long.",
      "$.recommendations[0].proposedGuardStrategy",
    ],
    [
      "Exact length cannot be measured, but the image shows 10 mm growth.",
      "$.recommendations[0].proposedGuardStrategy",
    ],
  ])("rejects unsupported measurement claim: %s", (statement, path) => {
    const value = base();
    if (path.includes("proposedGuardStrategy")) {
      value.recommendations[0].proposedGuardStrategy = statement;
    } else value.observations[0].statement = statement;
    const result = validateBeardPhotoSemantics(value);
    expect(result).toMatchObject({
      success: false,
      ruleCode: "SEM-0001",
      jsonPath: path,
      validator: "beard-semantic-safety-v3",
    });
    expect(JSON.stringify(result)).not.toContain(statement);
  });

  it("allows narrow limitations but rejects mixed disclaimers and assertions", () => {
    for (const limitation of [
      "Images cannot establish hormonal causes.",
      "No signs of infection can be determined from these photos.",
      "This is not a calibrated measurement.",
    ]) {
      const value = base();
      value.limitations = [limitation];
      expect(validateBeardPhotoSemantics(value).success, limitation).toBe(true);
    }
    const mixed = base();
    mixed.limitations = [
      "These photos cannot diagnose a medical condition, but you have an infection.",
    ];
    expect(validateBeardPhotoSemantics(mixed)).toMatchObject({
      success: false,
      ruleCode: "SEM-0003",
      jsonPath: "$.limitations[0]",
    });
    const mixedMeasurement = base();
    mixedMeasurement.recommendations[0].proposedGuardStrategy =
      "The beard is 12 mm long; use the existing Beard Studio guard setting.";
    expect(validateBeardPhotoSemantics(mixedMeasurement)).toMatchObject({
      success: false,
      ruleCode: "SEM-0001",
      jsonPath: "$.recommendations[0].proposedGuardStrategy",
    });
  });

  it("keeps semantic assertion and recommendation subcodes stable", () => {
    const fixtures = [
      ["You have an infection.", "observation", "SEM-0003"],
      ["The person's ethnicity is likely Scandinavian.", "observation", "SEM-0005"],
      ["The person's personality is confident.", "observation", "SEM-0006"],
      ["Treat the infection with medication.", "recommendation", "SEM-0010"],
    ] as const;
    for (const [statement, target, ruleCode] of fixtures) {
      const value = base();
      if (target === "observation") value.observations[0].statement = statement;
      else value.recommendations[0].reason = statement;
      const result = validateBeardPhotoSemantics(value);
      expect(result, statement).toMatchObject({ success: false, ruleCode });
      expect(JSON.stringify(result)).not.toContain(statement);
    }
  });

  it("persists only allowlisted metadata and never the rejected value", () => {
    const rejectedValue = "private rejected provider wording";
    const safe = toDurableBeardFailureDiagnostic({
      success: false,
      ruleCode: "SEM-0003",
      jsonPath: "$.limitations[0]",
      expected: "non-medical observation",
      received: "infection assertion",
      validator: "beard-semantic-safety-v2",
      stage: "SemanticValidation",
    });
    expect(safe).toEqual({
      failure_stage: "SemanticValidation",
      failure_rule_code: "SEM-0003",
      failure_json_path: "$.limitations[0]",
      failure_validator: "beard-semantic-safety-v2",
      failure_expected_category: "non-medical observation",
      failure_received_category: "infection assertion",
      failure_schema_version: 1,
      failure_trace_version: "intelligence-failure-trace-v1",
    });
    expect(JSON.stringify(safe)).not.toContain(rejectedValue);
    expect(
      toDurableBeardFailureDiagnostic({
        success: false,
        ruleCode: "SEM-0003",
        jsonPath: `$.limitations[0].${rejectedValue}`,
        expected: "non-medical observation",
        received: "infection assertion",
        validator: "beard-semantic-safety-v2",
        stage: "SemanticValidation",
      } as ValidationFailure),
    ).toEqual({});
  });
});
