import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateIntelligenceProviderResponse } from "../supabase/functions/_shared/intelligenceResponseValidation";
import { createValidationDiagnostic } from "../supabase/functions/_shared/validationDiagnostics";

const axes = {
  fresh: 70,
  woody: 65,
  spicy: 55,
  dark: 35,
  sweet: 20,
  dry: 60,
  warm: 45,
  aromatic: 75,
  smoky: 10,
  leathery: 15,
};
const baseResponse = {
  schemaVersion: 1,
  title: "Bergamot, cardamom and cedar exploration",
  summary: "A predicted fresh aromatic opening over a dry woody base.",
  confidence: "medium",
  claims: [
    {
      id: "prediction-1",
      kind: "prediction",
      text: "The concept is likely to open fresh and aromatic.",
      evidenceRefs: [],
    },
    {
      id: "recommendation-1",
      kind: "recommendation",
      text: "Evaluate a small qualitative trial.",
      evidenceRefs: [],
    },
  ],
  scentProfile: {
    axes,
    dominantFamilies: ["citrus", "spice", "woods"],
    opening: ["Bergamot"],
    heart: ["Cardamom"],
    base: ["Cedarwood Atlas"],
  },
  ingredientRoles: [
    {
      materialName: "Bergamot",
      materialRef: null,
      predictedRole: "opening",
      contribution: "predicted freshness",
    },
  ],
  strengths: ["Clear predicted contrast"],
  tensions: [],
  missingDimensions: [],
  directions: [
    {
      id: "direction-1",
      name: "Dry aromatic woods",
      intent: "Explore contrast",
      predictedEffect: "A drier base",
      tradeoffs: ["May reduce brightness"],
      suggestedMaterials: [
        {
          name: "Cedarwood Atlas",
          source: "concept",
          ingredientId: null,
          reason: "Explore the woody base",
        },
      ],
    },
  ],
  experiments: [
    {
      id: "experiment-1",
      name: "Cardamom trace comparison",
      hypothesis: "A trace may add lift",
      changes: [
        {
          materialName: "Cardamom",
          ingredientId: null,
          action: "add",
          guidance: "trace",
          reason: "Compare predicted aromatic lift",
        },
      ],
      observe: ["Opening character"],
    },
  ],
  questions: [],
  limitations: ["Predictions require physical evaluation"],
};
const emptyUniverse = new Set<string>();

describe("provider response validation diagnostics", () => {
  it("accepts the exact zero-record concept-material scenario", () => {
    const result = validateIntelligenceProviderResponse(
      baseResponse,
      emptyUniverse,
    );
    expect(result).toEqual({ valid: true, issues: [] });
  });

  it.each([
    ["fact", "FACT_REQUIRES_EVIDENCE"],
    ["observation", "OBSERVATION_REQUIRES_EVIDENCE"],
  ])("rejects unsupported %s claims with a safe issue", (kind, code) => {
    const result = validateIntelligenceProviderResponse(
      {
        ...baseResponse,
        claims: [{ id: "claim-1", kind, text: "sensitive text", evidenceRefs: [] }],
      },
      emptyUniverse,
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        stage: "semantic_claim_validation",
        code,
        path: "claims[0]",
        claimId: "claim-1",
        claimKind: kind,
        evidenceRefCount: 0,
      }),
    );
  });

  it("rejects a concept material used as fabricated evidence", () => {
    const result = validateIntelligenceProviderResponse(
      {
        ...baseResponse,
        claims: [
          {
            id: "claim-1",
            kind: "fact",
            text: "sensitive text",
            evidenceRefs: [
              {
                entityType: "conceptMaterial",
                entityId: "Bergamot",
                label: "Bergamot",
              },
            ],
          },
        ],
      },
      emptyUniverse,
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        stage: "unknown_entity_reference",
        code: "UNSUPPORTED_EVIDENCE_ENTITY_TYPE",
        evidenceEntityType: "conceptMaterial",
      }),
    );
  });

  it("rejects an evidence ID absent from the manifest", () => {
    const result = validateIntelligenceProviderResponse(
      {
        ...baseResponse,
        claims: [
          {
            id: "claim-1",
            kind: "fact",
            text: "sensitive text",
            evidenceRefs: [
              { entityType: "ingredient", entityId: "missing", label: "X" },
            ],
          },
        ],
      },
      emptyUniverse,
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        stage: "evidence_universe_validation",
        code: "EVIDENCE_ID_NOT_IN_CONTEXT",
        evidenceIdAbsentFromManifest: true,
      }),
    );
  });

  it("accepts evidence-backed facts and lab-backed observations", () => {
    const result = validateIntelligenceProviderResponse(
      {
        ...baseResponse,
        claims: [
          {
            id: "fact-1",
            kind: "fact",
            text: "Stored ingredient data",
            evidenceRefs: [
              { entityType: "ingredient", entityId: "i-1", label: "Ingredient" },
            ],
          },
          {
            id: "observation-1",
            kind: "observation",
            text: "Recorded lab observation",
            evidenceRefs: [
              {
                entityType: "labObservation",
                entityId: "o-1",
                label: "Observation",
              },
            ],
          },
        ],
      },
      new Set(["ingredient:i-1", "labObservation:o-1"]),
    );
    expect(result).toEqual({ valid: true, issues: [] });
  });

  it("logs only capped metadata and excludes claim text and prompts", () => {
    const result = validateIntelligenceProviderResponse(
      {
        ...baseResponse,
        claims: Array.from({ length: 12 }, (_, index) => ({
          id: `claim-${index}`,
          kind: "fact",
          text: `private claim ${index}`,
          evidenceRefs: [],
        })),
      },
      emptyUniverse,
    );
    const diagnostic = createValidationDiagnostic({
      result,
      responseSchemaVersion: 1,
      contextVersion: 1,
      threadId: "thread-1",
      runId: "run-1",
    });
    const serialized = JSON.stringify(diagnostic);
    expect(diagnostic.issues).toHaveLength(10);
    expect(diagnostic).toMatchObject({
      event: "koalafrog_intelligence_validation_diagnostic",
      issueCount: 12,
      issuesTruncated: true,
      responseSchemaVersion: 1,
      contextVersion: 1,
    });
    expect(serialized).not.toContain("private claim");
    expect(serialized).not.toMatch(/userPrompt|systemPrompt|fullContext/);
  });

  it("keeps the browser-facing invalid-response error sanitized", () => {
    const source = readFileSync(
      new URL(
        "../supabase/functions/koalafrog-intelligence/index.ts",
        import.meta.url,
      ),
      "utf8",
    );
    expect(source).toContain('code: "INVALID_PROVIDER_RESPONSE"');
    expect(source).toContain(
      'message: "The analysis response could not be validated."',
    );
  });
});
