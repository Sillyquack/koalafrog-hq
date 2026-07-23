import { intelligenceRuleCodes } from "../../../src/intelligence/Diagnostics/TraceCodes.ts";
import {
  validationFailure,
  validationSuccess,
  type ValidationTrace,
} from "../../../src/intelligence/Diagnostics/ValidationTrace.ts";

export const BEARD_PHOTO_SCHEMA_VERSION = 2 as const;
export const BEARD_PHOTO_CONTRACT_VERSION =
  "beard-photo-result-contract-v2" as const;
export const BEARD_PHOTO_PROMPT_VERSION = "beard-photo-analysis-v4" as const;
export const BEARD_PHOTO_SEMANTIC_RULE_VERSION =
  "beard-semantic-safety-v4" as const;
export const BEARD_PHOTO_SEMANTIC_RULE_VERSION_V3 =
  "beard-semantic-safety-v3" as const;
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
  observationKey: string;
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
  supportingObservationKeys: string[];
  affectedZones: string[];
  toolConstraints: string[];
  proposedGuardStrategy: string | null;
  status: RecommendationReviewStatus;
  provenance: "ai";
}
export interface BeardPhotoAnalysisResult {
  analysisId: string;
  schemaVersion: 2;
  contractVersion: typeof BEARD_PHOTO_CONTRACT_VERSION;
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
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
const strings = (v: unknown) =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
const text = (v: unknown) => typeof v === "string";
export const beardObservationKeyPattern = /^[a-z][a-z0-9_]{2,63}$/;
const views = (v: unknown) =>
  Array.isArray(v) &&
  v.every((x) => (beardPhotoViews as readonly string[]).includes(String(x)));
function validItem(value: unknown): value is BeardPhotoItem {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return keys(v, [
    "observationKey",
    "category",
    "statement",
    "confidence",
    "supportingViews",
    "evidenceDescription",
    "limitations",
    "relatedBeardZones",
    "provenance",
  ]) && typeof v.observationKey === "string" &&
    beardObservationKeyPattern.test(v.observationKey) &&
    typeof v.category === "string" &&
    text(v.statement) && (v.statement as string).length > 0 &&
    typeof v.confidence === "number" && v.confidence >= 0 &&
    v.confidence <= 1 && views(v.supportingViews) &&
    text(v.evidenceDescription) && strings(v.limitations) &&
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
    "supportingObservationKeys",
    "affectedZones",
    "toolConstraints",
    "proposedGuardStrategy",
    "status",
    "provenance",
  ]) && text(v.title) && text(v.reason) &&
    typeof v.confidence === "number" && v.confidence >= 0 &&
    v.confidence <= 1 &&
    ["low", "medium", "high"].includes(String(v.priority)) &&
    text(v.expectedBenefit) && strings(v.supportingObservationKeys) &&
    v.supportingObservationKeys.length > 0 &&
    new Set(v.supportingObservationKeys).size ===
      v.supportingObservationKeys.length &&
    v.supportingObservationKeys.every((key) => ids.has(key)) &&
    strings(v.affectedZones) && strings(v.toolConstraints) &&
    (v.proposedGuardStrategy === null || text(v.proposedGuardStrategy)) &&
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
      "limitations",
      "unknowns",
      "safetyFlags",
      "correlationId",
    ])
  ) return false;
  if (
    typeof v.analysisId !== "string" || v.schemaVersion !== 2 ||
    v.contractVersion !== BEARD_PHOTO_CONTRACT_VERSION ||
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
        strings(x.issues);
    }) || !strings(q.issues) || typeof q.retakeRecommended !== "boolean"
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
    ids = new Set(allItems.map((x) => x.observationKey));
  const structurallyValid = ids.size === allItems.length &&
    Array.isArray(v.recommendations) &&
    v.recommendations.every((x) => validRecommendation(x, ids)) &&
    strings(v.limitations) && strings(v.unknowns) && strings(v.safetyFlags);
  return structurallyValid &&
    validateBeardPhotoSemantics(v as unknown as BeardPhotoAnalysisResult)
      .success;
}

export function validateReadableHistoricalBeardPhotoResult(value: unknown) {
  if (validateBeardPhotoAnalysisResult(value)) return true;
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== 1) return false;
  const groups = [
    v.observations,
    v.symmetry,
    v.densityDistribution,
    v.lineAssessment,
  ];
  if (!groups.every((group) => Array.isArray(group))) return false;
  const observations = groups.flat() as Array<Record<string, unknown>>;
  if (!observations.every((item) => typeof item.id === "string")) return false;
  const ids = new Set(observations.map((item) => item.id as string));
  if (ids.size !== observations.length || !Array.isArray(v.recommendations)) {
    return false;
  }
  return (v.recommendations as Array<Record<string, unknown>>).every((item) =>
    strings(item.supportingObservationIds) &&
    (item.supportingObservationIds as string[]).every((id) => ids.has(id))
  );
}

export function validateBeardPhotoContract(
  value: BeardPhotoAnalysisResult,
): ValidationTrace<BeardPhotoAnalysisResult> {
  const groups = [
    ["observations", value.observations],
    ["symmetry", value.symmetry],
    ["densityDistribution", value.densityDistribution],
    ["lineAssessment", value.lineAssessment],
  ] as const;
  const ids = new Set<string>();
  for (const [groupName, group] of groups) {
    for (const [index, item] of group.entries()) {
      if (!beardObservationKeyPattern.test(item.observationKey)) {
        return validationFailure({
          ruleCode: intelligenceRuleCodes.invalidObservationKey,
          jsonPath: `$.${groupName}[${index}].observationKey`,
          expected: "valid observation key",
          received: "invalid observation key",
          validator: "beard-contract",
          stage: "ContractValidation",
        });
      }
      if (ids.has(item.observationKey)) {
        return validationFailure({
          ruleCode: intelligenceRuleCodes.duplicateObservationId,
          jsonPath: `$.${groupName}[${index}].observationKey`,
          expected: "unique observation key",
          received: "duplicate",
          validator: "beard-contract",
          stage: "ContractValidation",
        });
      }
      ids.add(item.observationKey);
    }
  }
  for (
    const [recommendationIndex, recommendation] of value.recommendations
      .entries()
  ) {
    for (
      const [referenceIndex, reference] of recommendation
        .supportingObservationKeys.entries()
    ) {
      if (!beardObservationKeyPattern.test(reference)) {
        return validationFailure({
          ruleCode: intelligenceRuleCodes.invalidObservationKey,
          jsonPath:
            `$.recommendations[${recommendationIndex}].supportingObservationKeys[${referenceIndex}]`,
          expected: "valid observation key",
          received: "invalid observation key",
          validator: "beard-contract",
          stage: "ContractValidation",
        });
      }
      if (
        recommendation.supportingObservationKeys.indexOf(reference) !==
          referenceIndex
      ) {
        return validationFailure({
          ruleCode: intelligenceRuleCodes.duplicateObservationId,
          jsonPath:
            `$.recommendations[${recommendationIndex}].supportingObservationKeys[${referenceIndex}]`,
          expected: "unique observation key",
          received: "duplicate",
          validator: "beard-contract",
          stage: "ContractValidation",
        });
      }
      if (!ids.has(reference)) {
        return validationFailure({
          ruleCode: intelligenceRuleCodes.brokenRecommendationReference,
          jsonPath:
            `$.recommendations[${recommendationIndex}].supportingObservationKeys[${referenceIndex}]`,
          expected: "known reference",
          received: "unknown reference",
          validator: "beard-contract",
          stage: "ContractValidation",
        });
      }
    }
  }
  return validationSuccess(value);
}

function validateBeardPhotoSemanticsVersion(
  value: BeardPhotoAnalysisResult,
  semanticVersion:
    | typeof BEARD_PHOTO_SEMANTIC_RULE_VERSION_V3
    | typeof BEARD_PHOTO_SEMANTIC_RULE_VERSION,
): ValidationTrace<BeardPhotoAnalysisResult> {
  type FieldRole =
    | "observation"
    | "limitation"
    | "recommendation"
    | "guard_strategy";
  const exactMeasurement =
    /\b\d+(?:\.\d+)?\s*(?:mm|millimet(?:er|re)s?)\b/i;
  const guardReference =
    /\bguard\b|\b(?:length map|recipe)\b.{0,80}\b(?:setting|guard)\b|\b(?:existing|current|recorded|saved|user[- ]supplied)\b.{0,80}\b(?:setting|guard)\b/i;
  const guardReferenceV4 =
    /\b(?:guards?(?:\s+setting)?|combs?|(?:clipper|trimmer)\s+attachments?|attachments?|(?:numbered|length|longer|shorter|trimmer)\s+settings?|one\s+setting\s+shorter|equipment\s+instruction|tool[- ]setting\s+proposal)\b|\b(?:length map|recipe)\b.{0,80}\b(?:setting|guard|comb|attachment|fullness|length)\b|\b(?:existing|current|recorded|saved|user[- ]supplied|workspace[- ]known|preferred)\b.{0,80}\b(?:setting|guard|comb|attachment|tool|fullness|length)\b/i;
  const visualMeasurementAssertion =
    /\b(?:photo|image|visually|visible|appears?|shows?|indicates?|confirms?|measures?|measurement|growth|beard|length)\b.{0,100}\b\d+(?:\.\d+)?\s*(?:mm|millimet(?:er|re)s?)\b|\b\d+(?:\.\d+)?\s*(?:mm|millimet(?:er|re)s?)\b.{0,100}\b(?:beard|growth|length|measures?|measurement|visible|visually|photo|image)\b/i;
  const exactResultGuarantee =
    /\b(?:will|would|shall|guarantee[sd]?|ensure[sd]?|leave[sd]?|produce[sd]?|result(?:s|ed)? in)\b.{0,80}\b(?:exactly|precisely|objective(?:ly)?)?\s*\d+(?:\.\d+)?\s*(?:mm|millimet(?:er|re)s?)\b|\b(?:exactly|precisely)\s*\d+(?:\.\d+)?\s*(?:mm|millimet(?:er|re)s?)\b.{0,80}\b(?:leave|remaining|physical beard|result)\b/i;
  const unsupportedPhysicalMeasurementV4 =
    /\b(?:measured from|calculated? from|used to calculate)\b.{0,80}\b(?:photo|image|hair|beard|dimension|length)\b|\b(?:photo|image|photograph)\b.{0,100}\b(?:proves?|confirms?|shows?|calculate[sd]?|measures?|measured)\b.{0,100}\b(?:exact|length|dimension|growth|density|symmetr|shorter|longer)\b|\b(?:beard|hair|cheek|chin|left side|right side)\b.{0,100}\b\d+(?:\.\d+)?\s*(?:mm|millimet(?:er|re)s?|percent|%|hairs?\s+per\s+square\s+centimet(?:er|re))\b|\b\d+(?:\.\d+)?\s*(?:mm|millimet(?:er|re)s?)\s+per\s+day\b|\b(?:density|symmetr|dimension|growth)\b.{0,100}\b(?:exactly|precisely|greater|less|shorter|longer|measures?|measurement)\b.{0,100}\b\d+(?:\.\d+)?\s*(?:percent|%|mm|millimet(?:er|re)s?|hairs?\s+per\s+square\s+centimet(?:er|re))\b/i;
  const limitationAction =
    /\b(?:cannot|can't|can not|could not|unable to|not possible to|do not|does not|don't|doesn't|is not|isn't|are not|aren't|no)\b.{0,100}\b(?:diagnos|determin|establish|infer|identify|confirm|assess|conclude|measure|estimate|calibrat)|\b(?:diagnos|determin|establish|infer|identify|confirm|assess|conclude|measure|estimate|calibrat)[a-z]*\b.{0,100}\b(?:cannot|can't|can not|could not|unable|not possible|is not|isn't|are not|aren't|unknown|unavailable)\b/i;
  const professionalGuidance =
    /\b(?:consult|contact|seek|speak with|talk to)\b.{0,100}\b(?:clinician|doctor|dermatologist|medical professional|healthcare professional|qualified professional)\b/i;
  const unsafeCareDirective =
    /\b(?:treat|medicat|prescrib|dose|therapy|remedy|cure)\w*\b/i;
  const causeAssertion =
    /\b(?:caused by|due to|results? from|because of|hormonal cause|biological cause)\b/i;
  const directAssertion =
    /\b(?:you|the person|this|it|the beard|the images?)\s+(?:have|has|is|are|shows?|indicates?|confirms?|suggests?|appears to have)\b|\b(?:is|are)\s+(?:present|detected|likely)\b|\b(?:medical condition|infection|alopecia|identity|ethnicity|race|religion|sexual orientation|gender identity|age|attractiveness|personality)\b.{0,30}\b(?:is|are|appears?|seems?)\b/i;
  const medical = /\b(?:medical condition|diagnos(?:e|ed|es|ing|is|tic)?|alopecia)\b/i;
  const infection = /\binfection\b/i;
  const biological = /\b(?:hormonal|hormones?|biological cause)\b/i;
  const sensitiveTrait =
    /\b(?:identity|ethnicity|race|religion|sexual orientation|gender identity|age)\b|\bidentify(?:ing)?\s+(?:the\s+)?person\b/i;
  const personal = /\b(?:attractiveness|personality)\b/i;
  const isPermittedLimitation = (clause: string, role: FieldRole) =>
    role === "limitation" && limitationAction.test(clause);
  const fail = (
    ruleCode: Parameters<typeof validationFailure>[0]["ruleCode"],
    path: string,
    expected: Parameters<typeof validationFailure>[0]["expected"],
    received: Parameters<typeof validationFailure>[0]["received"],
  ) =>
    validationFailure({
      ruleCode,
      jsonPath: path,
      expected,
      received,
      validator: semanticVersion,
      stage: "SemanticValidation",
    });
  const check = (value: string, path: string, role: FieldRole) => {
    const clauses = value.split(
      /[.!?;]|\b(?:but|however|although|yet)\b/i,
    ).map((clause) => clause.trim()).filter(Boolean);
    for (const clause of clauses) {
      const guardClause = clause.replace(/\bbeard studio\b|\blength map\b/gi, "workspace");
      const activeGuardReference = semanticVersion ===
          BEARD_PHOTO_SEMANTIC_RULE_VERSION
        ? guardReferenceV4
        : guardReference;
      const permittedGuardInstruction = role === "guard_strategy" &&
        activeGuardReference.test(clause) &&
        !visualMeasurementAssertion.test(guardClause) &&
        !exactResultGuarantee.test(clause) &&
        !(semanticVersion === BEARD_PHOTO_SEMANTIC_RULE_VERSION &&
          unsupportedPhysicalMeasurementV4.test(clause));
      if (
        ((exactMeasurement.test(clause) && !permittedGuardInstruction) ||
          (semanticVersion === BEARD_PHOTO_SEMANTIC_RULE_VERSION &&
            unsupportedPhysicalMeasurementV4.test(clause))) &&
        !(role === "limitation" && limitationAction.test(clause))
      ) {
        return fail(
          intelligenceRuleCodes.unsupportedExactMeasurement,
          path,
          "non-calibrated grooming language",
          "unsupported measurement claim",
        );
      }
      const matches = [
        { pattern: medical, code: intelligenceRuleCodes.medicalAssertion, received: "medical assertion" as const },
        { pattern: infection, code: intelligenceRuleCodes.infectionAssertion, received: "infection assertion" as const },
        { pattern: biological, code: intelligenceRuleCodes.biologicalCauseAssertion, received: "biological cause assertion" as const },
        { pattern: sensitiveTrait, code: intelligenceRuleCodes.sensitiveTraitInference, received: "sensitive trait inference" as const },
        { pattern: personal, code: intelligenceRuleCodes.personalInference, received: "personal inference" as const },
      ];
      const matched = matches.find(({ pattern }) => pattern.test(clause));
      if (!matched) continue;
      const permittedLimitation = isPermittedLimitation(clause, role);
      const permittedGuidance = professionalGuidance.test(clause) &&
        !directAssertion.test(clause) && !causeAssertion.test(clause);
      if (permittedLimitation || permittedGuidance) continue;
      if (role === "recommendation" && unsafeCareDirective.test(clause)) {
        return fail(
          intelligenceRuleCodes.unsafeRecommendation,
          path,
          "grooming-only recommendation",
          "unsafe recommendation",
        );
      }
      if (directAssertion.test(clause) || causeAssertion.test(clause)) {
        return fail(
          matched.code,
          path,
          matched.code === intelligenceRuleCodes.sensitiveTraitInference ||
              matched.code === intelligenceRuleCodes.personalInference
            ? "non-sensitive observation"
            : "non-medical observation",
          matched.received,
        );
      }
      return fail(
        intelligenceRuleCodes.ambiguousSemanticViolation,
        path,
        "unambiguous safe language",
        "ambiguous sensitive reference",
      );
    }
    return undefined;
  };
  for (const [index, text] of value.photoQuality.issues.entries()) {
    const failure = check(text, `$.photoQuality.issues[${index}]`, "limitation");
    if (failure) return failure;
  }
  for (const [viewIndex, view] of value.photoQuality.perView.entries()) {
    for (const [issueIndex, text] of view.issues.entries()) {
      const failure = check(
        text,
        `$.photoQuality.perView[${viewIndex}].issues[${issueIndex}]`,
        "limitation",
      );
      if (failure) return failure;
    }
  }
  const groups = [
    ["observations", value.observations],
    ["symmetry", value.symmetry],
    ["densityDistribution", value.densityDistribution],
    ["lineAssessment", value.lineAssessment],
  ] as const;
  for (const [groupName, group] of groups) {
    for (const [index, item] of group.entries()) {
      for (
        const [field, text] of [["statement", item.statement], [
          "evidenceDescription",
          item.evidenceDescription,
        ]] as const
      ) {
        const failure = check(
          text,
          `$.${groupName}[${index}].${field}`,
          "observation",
        );
        if (failure) return failure;
      }
      for (const [limitationIndex, text] of item.limitations.entries()) {
        const failure = check(
          text,
          `$.${groupName}[${index}].limitations[${limitationIndex}]`,
          "limitation",
        );
        if (failure) return failure;
      }
    }
  }
  for (const [index, item] of value.recommendations.entries()) {
    for (
      const [field, text] of [["title", item.title], ["reason", item.reason], [
        "expectedBenefit",
        item.expectedBenefit,
      ]] as const
    ) {
      const failure = check(
        text,
        `$.recommendations[${index}].${field}`,
        "recommendation",
      );
      if (failure) return failure;
    }
    for (const [constraintIndex, text] of item.toolConstraints.entries()) {
      const failure = check(
        text,
        `$.recommendations[${index}].toolConstraints[${constraintIndex}]`,
        "recommendation",
      );
      if (failure) return failure;
    }
    if (item.proposedGuardStrategy !== null) {
      const failure = check(
        item.proposedGuardStrategy,
        `$.recommendations[${index}].proposedGuardStrategy`,
        "guard_strategy",
      );
      if (failure) return failure;
    }
  }
  for (
    const [field, values] of [["limitations", value.limitations], [
      "unknowns",
      value.unknowns,
    ], ["safetyFlags", value.safetyFlags]] as const
  ) {
    for (const [index, text] of values.entries()) {
      const failure = check(text, `$.${field}[${index}]`, "limitation");
      if (failure) return failure;
    }
  }
  return validationSuccess(value);
}

export function validateBeardPhotoSemanticsV3(
  value: BeardPhotoAnalysisResult,
): ValidationTrace<BeardPhotoAnalysisResult> {
  return validateBeardPhotoSemanticsVersion(
    value,
    BEARD_PHOTO_SEMANTIC_RULE_VERSION_V3,
  );
}

export function validateBeardPhotoSemantics(
  value: BeardPhotoAnalysisResult,
): ValidationTrace<BeardPhotoAnalysisResult> {
  return validateBeardPhotoSemanticsVersion(
    value,
    BEARD_PHOTO_SEMANTIC_RULE_VERSION,
  );
}
