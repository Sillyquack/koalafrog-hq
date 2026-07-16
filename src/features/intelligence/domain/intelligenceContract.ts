export const INTELLIGENCE_REQUEST_SCHEMA_VERSION = 1 as const;
export const INTELLIGENCE_RESPONSE_SCHEMA_VERSION = 1 as const;
export type ClaimKind =
  "fact" | "prediction" | "observation" | "recommendation";
export interface EvidenceRef {
  entityType: string;
  entityId: string;
  label: string;
}
export interface IntelligenceClaim {
  id: string;
  kind: ClaimKind;
  text: string;
  evidenceRefs: EvidenceRef[];
}
export interface IntelligenceContextSelection {
  productId?: string;
  formulaVersionId?: string;
  selectedIngredientIds: string[];
  conceptMaterials: string[];
}
export interface IntelligenceRequest {
  schemaVersion: 1;
  mode: "scent_exploration";
  workspaceId: string;
  threadId?: string;
  userPrompt: string;
  contextSelection: IntelligenceContextSelection;
}
export interface IntelligenceResponse {
  schemaVersion: 1;
  title: string;
  summary: string;
  confidence: "low" | "medium" | "high";
  claims: IntelligenceClaim[];
  scentProfile: {
    axes: Record<
      | "fresh"
      | "woody"
      | "spicy"
      | "dark"
      | "sweet"
      | "dry"
      | "warm"
      | "aromatic"
      | "smoky"
      | "leathery",
      number
    >;
    dominantFamilies: string[];
    opening: string[];
    heart: string[];
    base: string[];
  };
  ingredientRoles: Array<{
    materialName: string;
    materialRef?: { entityType: "ingredient"; entityId: string };
    predictedRole: string;
    contribution: string;
  }>;
  strengths: string[];
  tensions: string[];
  missingDimensions: string[];
  directions: Array<{
    id: string;
    name: string;
    intent: string;
    predictedEffect: string;
    tradeoffs: string[];
    suggestedMaterials: Array<{
      name: string;
      source: "workspace" | "concept";
      ingredientId?: string;
      reason: string;
    }>;
  }>;
  experiments: Array<{
    id: string;
    name: string;
    hypothesis: string;
    changes: Array<{
      materialName: string;
      ingredientId?: string;
      action: "add" | "increase" | "decrease" | "remove";
      guidance: "trace" | "low" | "moderate" | "structural";
      reason: string;
    }>;
    observe: string[];
  }>;
  questions: string[];
  limitations: string[];
}
export interface ContextManifest {
  contextVersion: 1 | 2;
  productIds: string[];
  formulaVersionIds: string[];
  ingredientIds: string[];
  labBatchIds: string[];
  labObservationIds: string[];
  testSessionIds: string[];
  testResponseIds: string[];
  scentMemoryCheckpointIds?: string[];
}
export type IntelligenceErrorCode =
  | "ACTIVE_WORKSPACE_UNAVAILABLE"
  | "INTELLIGENCE_NOT_CONFIGURED"
  | "AUTHENTICATION_EXPIRED"
  | "UNAUTHORIZED_WORKSPACE"
  | "INVALID_REQUEST"
  | "INVALID_PROVIDER_RESPONSE"
  | "PROVIDER_FAILURE"
  | "NETWORK_FAILURE";

const strings = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
export function validateIntelligenceRequest(
  value: unknown,
): value is IntelligenceRequest {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>,
    c = v.contextSelection as Record<string, unknown> | undefined;
  return (
    v.schemaVersion === 1 &&
    v.mode === "scent_exploration" &&
    typeof v.workspaceId === "string" &&
    !!v.workspaceId &&
    typeof v.userPrompt === "string" &&
    v.userPrompt.trim().length > 0 &&
    !!c &&
    strings(c.selectedIngredientIds) &&
    strings(c.conceptMaterials)
  );
}
export function evidenceUniverse(manifest: ContextManifest) {
  return new Set([
    ...manifest.productIds.map((id) => `product:${id}`),
    ...manifest.formulaVersionIds.map((id) => `formulaVersion:${id}`),
    ...manifest.ingredientIds.map((id) => `ingredient:${id}`),
    ...manifest.labBatchIds.map((id) => `labBatch:${id}`),
    ...manifest.labObservationIds.map((id) => `labObservation:${id}`),
    ...manifest.testSessionIds.map((id) => `testSession:${id}`),
    ...manifest.testResponseIds.map((id) => `testResponse:${id}`),
    ...(manifest.scentMemoryCheckpointIds ?? []).map(
      (id) => `scentMemoryCheckpoint:${id}`,
    ),
  ]);
}
export function validateIntelligenceResponse(
  value: unknown,
  manifest: ContextManifest,
):
  | { valid: true; data: IntelligenceResponse }
  | { valid: false; errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== "object")
    return { valid: false, errors: ["Response must be an object."] };
  const v = value as Record<string, unknown>;
  for (const key of [
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
  ])
    if (v[key] == null) errors.push(`Missing ${key}.`);
  if (v.schemaVersion !== 1) errors.push("Unsupported response schema.");
  const universe = evidenceUniverse(manifest);
  if (Array.isArray(v.claims))
    for (const raw of v.claims) {
      const claim = raw as IntelligenceClaim;
      if (
        !["fact", "prediction", "observation", "recommendation"].includes(
          claim.kind,
        )
      )
        errors.push("Unknown claim category.");
      if (
        (claim.kind === "fact" || claim.kind === "observation") &&
        !claim.evidenceRefs?.length
      )
        errors.push(`${claim.kind} requires evidence.`);
      for (const ref of claim.evidenceRefs ?? [])
        if (!universe.has(`${ref.entityType}:${ref.entityId}`))
          errors.push(`Unknown evidence ${ref.entityType}:${ref.entityId}.`);
      if (
        claim.kind === "observation" &&
        claim.evidenceRefs?.some(
          (ref) =>
            ![
              "labObservation",
              "testResponse",
              "testSession",
              "labBatch",
              "scentMemoryCheckpoint",
            ].includes(ref.entityType),
        )
      )
        errors.push("Observation requires Koalafrog empirical evidence.");
    }
  const axes = (
    v.scentProfile as IntelligenceResponse["scentProfile"] | undefined
  )?.axes;
  if (!axes || Object.keys(axes).length !== 10)
    errors.push("All scent axes are required.");
  else
    for (const [axis, n] of Object.entries(axes))
      if (typeof n !== "number" || n < 0 || n > 100)
        errors.push(`${axis} axis is outside 0–100.`);
  return errors.length
    ? { valid: false, errors }
    : { valid: true, data: value as IntelligenceResponse };
}
