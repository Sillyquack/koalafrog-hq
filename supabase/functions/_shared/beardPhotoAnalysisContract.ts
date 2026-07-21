export const BEARD_PHOTO_SCHEMA_VERSION = 1 as const;
export const BEARD_PHOTO_PROMPT_VERSION = "beard-photo-analysis-v1" as const;
export const beardPhotoViews = [
  "front",
  "left_profile",
  "right_profile",
  "under_chin",
] as const;
export const requiredBeardPhotoViews = beardPhotoViews.slice(0, 3);
export type BeardPhotoView = typeof beardPhotoViews[number];
export type RecommendationReviewStatus =
  | "undecided"
  | "accepted_for_planning"
  | "dismissed";
export interface BeardPhotoItem {
  id: string;
  category: string;
  statement: string;
  confidence: number;
  supportingViews: BeardPhotoView[];
  evidenceDescription: string;
  limitations: string[];
  relatedBeardZones: string[];
  provenance: "ai";
}
export interface BeardPhotoRecommendation {
  id: string;
  title: string;
  reason: string;
  confidence: number;
  priority: "low" | "medium" | "high";
  expectedBenefit: string;
  supportingObservationIds: string[];
  affectedZones: string[];
  toolConstraints: string[];
  proposedGuardStrategy: string | null;
  status: RecommendationReviewStatus;
  provenance: "ai";
}
export interface BeardPhotoAnalysisResult {
  analysisId: string;
  schemaVersion: 1;
  promptVersion: string;
  provider: string;
  model: string;
  createdAt: string;
  provenance: "ai";
  status: "completed" | "completed_cleanup_required";
  photoQuality: {
    overall: "suitable" | "limited" | "unsuitable";
    perView: Array<
      {
        view: BeardPhotoView;
        quality: "suitable" | "limited" | "unsuitable";
        issues: string[];
      }
    >;
    issues: string[];
    retakeRecommended: boolean;
  };
  observations: BeardPhotoItem[];
  symmetry: BeardPhotoItem[];
  densityDistribution: BeardPhotoItem[];
  lineAssessment: BeardPhotoItem[];
  recommendations: BeardPhotoRecommendation[];
  limitations: string[];
  unknowns: string[];
  safetyFlags: string[];
  correlationId: string;
}
const exactMeasurement = /\b\d+(?:\.\d+)?\s*(?:mm|millimet(?:er|re)s?)\b/i;
const forbidden =
  /(identify|ethnicity|medical condition|diagnos|alopecia|infection|hormonal|attractiveness|personality)/i;
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
const strings = (v: unknown) =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
const safeText = (v: unknown) =>
  typeof v === "string" && !exactMeasurement.test(v) && !forbidden.test(v);
const safeStrings = (v: unknown) =>
  strings(v) && (v as string[]).every(safeText);
const views = (v: unknown) =>
  Array.isArray(v) &&
  v.every((x) => (beardPhotoViews as readonly string[]).includes(String(x)));
function validItem(value: unknown): value is BeardPhotoItem {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return keys(v, [
    "id",
    "category",
    "statement",
    "confidence",
    "supportingViews",
    "evidenceDescription",
    "limitations",
    "relatedBeardZones",
    "provenance",
  ]) && typeof v.id === "string" && typeof v.category === "string" &&
    safeText(v.statement) && (v.statement as string).length > 0 &&
    typeof v.confidence === "number" && v.confidence >= 0 &&
    v.confidence <= 1 && views(v.supportingViews) &&
    safeText(v.evidenceDescription) && safeStrings(v.limitations) &&
    strings(v.relatedBeardZones) && v.provenance === "ai";
}
function validRecommendation(
  value: unknown,
  ids: Set<string>,
): value is BeardPhotoRecommendation {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return keys(v, [
    "id",
    "title",
    "reason",
    "confidence",
    "priority",
    "expectedBenefit",
    "supportingObservationIds",
    "affectedZones",
    "toolConstraints",
    "proposedGuardStrategy",
    "status",
    "provenance",
  ]) && safeText(v.title) && safeText(v.reason) &&
    typeof v.confidence === "number" && v.confidence >= 0 &&
    v.confidence <= 1 &&
    ["low", "medium", "high"].includes(String(v.priority)) &&
    safeText(v.expectedBenefit) && strings(v.supportingObservationIds) &&
    v.supportingObservationIds.every((id) => ids.has(id)) &&
    strings(v.affectedZones) && safeStrings(v.toolConstraints) &&
    (v.proposedGuardStrategy === null || safeText(v.proposedGuardStrategy)) &&
    ["undecided", "accepted_for_planning", "dismissed"].includes(
      String(v.status),
    ) && v.provenance === "ai";
}
export function validateBeardPhotoAnalysisResult(
  value: unknown,
): value is BeardPhotoAnalysisResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (
    !keys(v, [
      "analysisId",
      "schemaVersion",
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
      "limitations",
      "unknowns",
      "safetyFlags",
      "correlationId",
    ])
  ) return false;
  if (
    typeof v.analysisId !== "string" || v.schemaVersion !== 1 ||
    typeof v.promptVersion !== "string" || typeof v.provider !== "string" ||
    typeof v.model !== "string" || typeof v.createdAt !== "string" ||
    v.provenance !== "ai" ||
    !["completed", "completed_cleanup_required"].includes(String(v.status)) ||
    typeof v.correlationId !== "string"
  ) return false;
  const q = v.photoQuality as Record<string, unknown>;
  if (
    !q || !keys(q, ["overall", "perView", "issues", "retakeRecommended"]) ||
    !["suitable", "limited", "unsuitable"].includes(String(q.overall)) ||
    !Array.isArray(q.perView) || !q.perView.every((raw) => {
      const x = raw as Record<string, unknown>;
      return keys(x, ["view", "quality", "issues"]) &&
        (beardPhotoViews as readonly string[]).includes(String(x.view)) &&
        ["suitable", "limited", "unsuitable"].includes(String(x.quality)) &&
        safeStrings(x.issues);
    }) || !safeStrings(q.issues) || typeof q.retakeRecommended !== "boolean"
  ) return false;
  const groups = [
    v.observations,
    v.symmetry,
    v.densityDistribution,
    v.lineAssessment,
  ];
  if (
    !groups.every((group) => Array.isArray(group) && group.every(validItem))
  ) return false;
  const allItems = groups.flat() as BeardPhotoItem[],
    ids = new Set(allItems.map((x) => x.id));
  return ids.size === allItems.length && Array.isArray(v.recommendations) &&
    v.recommendations.every((x) => validRecommendation(x, ids)) &&
    safeStrings(v.limitations) && safeStrings(v.unknowns) &&
    safeStrings(v.safetyFlags);
}
