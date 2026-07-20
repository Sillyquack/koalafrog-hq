import {
  benchmarkLabReadiness,
  createBenchmarkLabDocument,
  isRequirementReviewed,
  type BenchmarkLabDocument,
} from "../domain/benchmarkLab";

export type ResearchMaturity =
  | "Idea"
  | "Guided research"
  | "Requirements defined"
  | "Draft ready"
  | "Draft created";

export interface ResearchProgressItem {
  id: string;
  label: string;
  complete: boolean;
}

const untouched = createBenchmarkLabDocument();
const hasText = (value: string | undefined) => Boolean(value?.trim());
const differsFromUntouched = (
  value: string | undefined,
  defaultValue: string | undefined,
) => hasText(value) && value?.trim() !== defaultValue?.trim();

export function countOpenResearchQuestions(document: BenchmarkLabDocument) {
  const systemQuestions = document.systemHypothesis.openQuestions.filter(hasText);
  const requirementQuestions = document.functionalRequirements.filter(
    (requirement) => hasText(requirement.openQuestions),
  );
  return systemQuestions.length + requirementQuestions.length;
}

/**
 * Eleven equally weighted workflow checks. Seeded explanatory content is not
 * completion, and no check assesses formula quality, safety, efficacy, or
 * market readiness.
 */
export function deriveResearchProgress(
  document: BenchmarkLabDocument,
  draftCreated = false,
) {
  const readiness = benchmarkLabReadiness(document);
  const conceptDefined =
    differsFromUntouched(document.workingTitle, untouched.workingTitle) ||
    differsFromUntouched(document.objective, untouched.objective);
  const benchmarkLinked =
    conceptDefined &&
    document.benchmarkLink.benchmarkId === untouched.benchmarkLink.benchmarkId;
  const observationReviewed = Object.values(document.scorecard.scores).some(
    (score) => score.state !== "not_tested",
  );
  const briefStarted = [
    document.brief.userNeed,
    document.brief.intendedUse,
    document.brief.intendedUser,
    document.brief.usageContext,
    document.brief.desiredPositioning,
  ].some(hasText);
  const constraintReviewed = document.brief.constraints.some(
    (constraint) => constraint.state !== "unknown",
  );
  const knownTarget = document.brief.targets.some(
    (target) => target.targetState === "known" && hasText(target.targetValue),
  );
  const criticalTarget = document.brief.targets.some(
    (target) =>
      target.priority === "critical" &&
      target.targetState === "known" &&
      hasText(target.targetValue),
  );
  const hypothesisReviewed =
    document.systemHypothesis.reviewStatus !== "unreviewed";
  const requirementReviewed = document.functionalRequirements.some(
    isRequirementReviewed,
  );
  const questionsReviewed =
    countOpenResearchQuestions(document) > 0 ||
    document.systemHypothesis.reviewStatus === "reviewed";

  const items: ResearchProgressItem[] = [
    { id: "concept", label: "Product concept defined", complete: conceptDefined },
    { id: "benchmark", label: "Benchmark linked", complete: benchmarkLinked },
    {
      id: "observation",
      label: "At least one observation reviewed",
      complete: observationReviewed,
    },
    { id: "brief", label: "Development brief started", complete: briefStarted },
    {
      id: "constraint",
      label: "At least one constraint reviewed",
      complete: constraintReviewed,
    },
    { id: "target", label: "At least one known target defined", complete: knownTarget },
    {
      id: "critical-target",
      label: "At least one critical target defined",
      complete: criticalTarget,
    },
    {
      id: "hypothesis",
      label: "System hypothesis reviewed",
      complete: hypothesisReviewed,
    },
    {
      id: "requirement",
      label: "At least one functional requirement reviewed",
      complete: requirementReviewed,
    },
    {
      id: "question",
      label: "Open questions recorded or explicitly reviewed",
      complete: questionsReviewed,
    },
    { id: "draft", label: "Draft Formula created", complete: draftCreated },
  ];
  const completed = items.filter((item) => item.complete).length;
  const percent = Math.round((completed / items.length) * 100);

  let maturity: ResearchMaturity = "Idea";
  const gateChecksComplete = readiness.items.every((item) => item.ready);
  if (draftCreated) maturity = "Draft created";
  else if (gateChecksComplete) maturity = "Draft ready";
  else if (constraintReviewed && criticalTarget && requirementReviewed)
    maturity = "Requirements defined";
  else if (completed > 0) maturity = "Guided research";

  return { items, completed, total: items.length, percent, maturity };
}
