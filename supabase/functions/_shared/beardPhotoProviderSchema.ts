import {
  beardGuardRegions,
  beardGuardRelativeInstructions,
  beardGuardStrategyTypes,
  beardGuardUncertainties,
} from "./beardGuardStrategy.ts";
import {
  BEARD_PHOTO_CONTRACT_VERSION,
  BEARD_PHOTO_PROMPT_VERSION,
  beardPhotoViews,
} from "./beardPhotoAnalysisContract.ts";
import { beardTrimOverlayProviderSchema } from "./beardTrimOverlayContract.ts";

const outputItem = {
  type: "object",
  additionalProperties: false,
  required: [
    "observationKey",
    "category",
    "statement",
    "confidence",
    "supportingViews",
    "evidenceDescription",
    "limitations",
    "relatedBeardZones",
    "provenance",
  ],
  properties: {
    observationKey: {
      type: "string",
      minLength: 3,
      maxLength: 64,
      pattern: "^[a-z][a-z0-9_]{2,63}$",
    },
    category: { type: "string" },
    statement: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    supportingViews: {
      type: "array",
      items: { type: "string", enum: beardPhotoViews },
    },
    evidenceDescription: { type: "string" },
    limitations: { type: "array", items: { type: "string" } },
    relatedBeardZones: { type: "array", items: { type: "string" } },
    provenance: { type: "string", const: "ai" },
  },
} as const;

const structuredGuardStrategyObject = {
  type: "object",
  additionalProperties: false,
  required: [
    "strategyType",
    "region",
    "guardMm",
    "guardRangeMm",
    "relativeInstruction",
    "uncertainty",
    "freeformTechnique",
  ],
  properties: {
    strategyType: { type: "string", enum: beardGuardStrategyTypes },
    region: { type: ["string", "null"], enum: [...beardGuardRegions, null] },
    guardMm: { type: ["integer", "null"], minimum: 1, maximum: 40 },
    guardRangeMm: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["min", "max"],
      properties: {
        min: { type: "integer", minimum: 1, maximum: 40 },
        max: { type: "integer", minimum: 1, maximum: 40 },
      },
    },
    relativeInstruction: {
      type: ["string", "null"],
      enum: [...beardGuardRelativeInstructions, null],
    },
    uncertainty: { type: "string", enum: beardGuardUncertainties },
    freeformTechnique: {
      type: ["string", "null"],
      enum: ["shorten_gradually", null],
    },
  },
} as const;

const structuredGuardStrategy = {
  anyOf: [
    { type: "string" },
    { type: "null" },
    structuredGuardStrategyObject,
  ],
} as const;

export const beardPhotoProviderResultSchema = (
  meta: {
    analysisId: string;
    provider: string;
    model: string;
    correlationId: string;
  },
) => ({
  type: "object",
  additionalProperties: false,
  required: [
    "analysisId",
    "schemaVersion",
    "contractVersion",
    "promptVersion",
    "provider",
    "model",
    "createdAt",
    "provenance",
    "status",
    "photoQuality",
    "observations",
    "symmetry",
    "densityDistribution",
    "lineAssessment",
    "recommendations",
    "trimOverlay",
    "limitations",
    "unknowns",
    "safetyFlags",
    "correlationId",
  ],
  properties: {
    analysisId: { type: "string", const: meta.analysisId },
    schemaVersion: { type: "integer", const: 2 },
    contractVersion: {
      type: "string",
      const: BEARD_PHOTO_CONTRACT_VERSION,
    },
    promptVersion: { type: "string", const: BEARD_PHOTO_PROMPT_VERSION },
    provider: { type: "string", const: meta.provider },
    model: { type: "string", const: meta.model },
    createdAt: { type: "string" },
    provenance: { type: "string", const: "ai" },
    status: { type: "string", const: "completed" },
    photoQuality: {
      type: "object",
      additionalProperties: false,
      required: ["overall", "perView", "issues", "retakeRecommended"],
      properties: {
        overall: {
          type: "string",
          enum: ["suitable", "limited", "unsuitable"],
        },
        perView: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["view", "quality", "issues"],
            properties: {
              view: { type: "string", enum: beardPhotoViews },
              quality: {
                type: "string",
                enum: ["suitable", "limited", "unsuitable"],
              },
              issues: { type: "array", items: { type: "string" } },
            },
          },
        },
        issues: { type: "array", items: { type: "string" } },
        retakeRecommended: { type: "boolean" },
      },
    },
    observations: { type: "array", items: outputItem },
    symmetry: { type: "array", items: outputItem },
    densityDistribution: { type: "array", items: outputItem },
    lineAssessment: { type: "array", items: outputItem },
    recommendations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "title",
          "reason",
          "confidence",
          "priority",
          "expectedBenefit",
          "supportingObservationKeys",
          "affectedZones",
          "toolConstraints",
          "proposedGuardStrategy",
          "status",
          "provenance",
        ],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          reason: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          expectedBenefit: { type: "string" },
          supportingObservationKeys: {
            type: "array",
            minItems: 1,
            items: {
              type: "string",
              minLength: 3,
              maxLength: 64,
              pattern: "^[a-z][a-z0-9_]{2,63}$",
            },
          },
          affectedZones: { type: "array", items: { type: "string" } },
          toolConstraints: { type: "array", items: { type: "string" } },
          proposedGuardStrategy: structuredGuardStrategy,
          status: { type: "string", const: "undecided" },
          provenance: { type: "string", const: "ai" },
        },
      },
    },
    trimOverlay: beardTrimOverlayProviderSchema,
    limitations: { type: "array", items: { type: "string" } },
    unknowns: { type: "array", items: { type: "string" } },
    safetyFlags: { type: "array", items: { type: "string" } },
    correlationId: { type: "string", const: meta.correlationId },
  },
});
