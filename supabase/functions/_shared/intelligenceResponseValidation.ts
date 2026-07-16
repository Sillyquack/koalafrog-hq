/* eslint-disable @typescript-eslint/no-explicit-any */
export type ValidationStage =
  | "response_shape_validation"
  | "semantic_claim_validation"
  | "evidence_universe_validation"
  | "axis_range_validation"
  | "unknown_entity_reference"
  | "domain_validation";

export interface ValidationIssue {
  stage: ValidationStage;
  code: string;
  path: string;
  claimId?: string;
  claimKind?: string;
  evidenceRefCount?: number;
  evidenceEntityType?: string;
  evidenceIdAbsentFromManifest?: boolean;
  expectedSemanticCategory?: string;
}

export interface ResponseValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

const axes = [
  "fresh",
  "woody",
  "spicy",
  "dark",
  "sweet",
  "dry",
  "warm",
  "aromatic",
  "smoky",
  "leathery",
] as const;
const claimKinds = ["fact", "prediction", "observation", "recommendation"];
const evidenceEntityTypes = [
  "product",
  "formulaVersion",
  "ingredient",
  "labBatch",
  "labObservation",
  "testSession",
  "testResponse",
  "scentMemoryCheckpoint",
];
const empiricalEntityTypes = [
  "labObservation",
  "testResponse",
  "testSession",
  "labBatch",
  "scentMemoryCheckpoint",
];
const required = [
  "title",
  "summary",
  "confidence",
  "claims",
  "scentProfile",
  "ingredientRoles",
  "strengths",
  "tensions",
  "missingDimensions",
  "directions",
  "experiments",
  "questions",
  "limitations",
];

export function validateIntelligenceProviderResponse(
  value: unknown,
  universe: Set<string>,
): ResponseValidationResult {
  const issues: ValidationIssue[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value))
    return {
      valid: false,
      issues: [
        {
          stage: "response_shape_validation",
          code: "RESPONSE_NOT_OBJECT",
          path: "$",
        },
      ],
    };
  const v = value as any;
  if (v.schemaVersion !== 1)
    issues.push({
      stage: "response_shape_validation",
      code: "UNSUPPORTED_RESPONSE_SCHEMA_VERSION",
      path: "schemaVersion",
    });
  for (const key of required)
    if (v[key] == null)
      issues.push({
        stage: "response_shape_validation",
        code: "MISSING_REQUIRED_PROPERTY",
        path: key,
      });
  if (!Array.isArray(v.claims))
    issues.push({
      stage: "response_shape_validation",
      code: "CLAIMS_NOT_ARRAY",
      path: "claims",
    });
  else
    v.claims.forEach((claim: any, index: number) => {
      const path = `claims[${index}]`;
      const metadata = {
        claimId: typeof claim?.id === "string" ? claim.id : undefined,
        claimKind: typeof claim?.kind === "string" ? claim.kind : undefined,
        evidenceRefCount: Array.isArray(claim?.evidenceRefs)
          ? claim.evidenceRefs.length
          : 0,
      };
      if (!claimKinds.includes(claim?.kind))
        issues.push({
          stage: "semantic_claim_validation",
          code: "UNKNOWN_CLAIM_KIND",
          path: `${path}.kind`,
          ...metadata,
        });
      if (
        (claim?.kind === "fact" || claim?.kind === "observation") &&
        !claim?.evidenceRefs?.length
      )
        issues.push({
          stage: "semantic_claim_validation",
          code:
            claim.kind === "fact"
              ? "FACT_REQUIRES_EVIDENCE"
              : "OBSERVATION_REQUIRES_EVIDENCE",
          path,
          expectedSemanticCategory:
            "prediction_or_recommendation_without_workspace_evidence",
          ...metadata,
        });
      for (const [evidenceIndex, ref] of (
        Array.isArray(claim?.evidenceRefs) ? claim.evidenceRefs : []
      ).entries()) {
        const evidencePath = `${path}.evidenceRefs[${evidenceIndex}]`;
        if (!evidenceEntityTypes.includes(ref?.entityType)) {
          issues.push({
            stage: "unknown_entity_reference",
            code: "UNSUPPORTED_EVIDENCE_ENTITY_TYPE",
            path: `${evidencePath}.entityType`,
            evidenceEntityType:
              typeof ref?.entityType === "string" ? ref.entityType : undefined,
            ...metadata,
          });
          continue;
        }
        if (!universe.has(`${ref.entityType}:${ref.entityId}`))
          issues.push({
            stage: "evidence_universe_validation",
            code: "EVIDENCE_ID_NOT_IN_CONTEXT",
            path: evidencePath,
            evidenceEntityType: ref.entityType,
            evidenceIdAbsentFromManifest: true,
            ...metadata,
          });
      }
      if (
        claim?.kind === "observation" &&
        claim?.evidenceRefs?.some(
          (ref: any) => !empiricalEntityTypes.includes(ref?.entityType),
        )
      )
        issues.push({
          stage: "domain_validation",
          code: "OBSERVATION_REQUIRES_EMPIRICAL_EVIDENCE",
          path: `${path}.evidenceRefs`,
          expectedSemanticCategory: "koalafrog_empirical_record",
          ...metadata,
        });
    });
  if (!v.scentProfile?.axes)
    issues.push({
      stage: "axis_range_validation",
      code: "SCENT_AXES_MISSING",
      path: "scentProfile.axes",
    });
  else
    for (const axis of axes)
      if (
        typeof v.scentProfile.axes[axis] !== "number" ||
        v.scentProfile.axes[axis] < 0 ||
        v.scentProfile.axes[axis] > 100
      )
        issues.push({
          stage: "axis_range_validation",
          code: "SCENT_AXIS_OUT_OF_RANGE",
          path: `scentProfile.axes.${axis}`,
        });
  return { valid: issues.length === 0, issues };
}
