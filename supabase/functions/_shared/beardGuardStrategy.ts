import type {
  BeardPhotoAnalysisResult,
  BeardPhotoRecommendation,
} from "./beardPhotoAnalysisContract.ts";

export const BEARD_GUARD_NORMALIZER_VERSION =
  "beard-guard-strategy-normalizer-v1" as const;

export type BeardGuardRegion =
  | "cheeks" | "sides" | "chin" | "moustache" | "neckline" | "overall";
export type BeardGuardStrategySource =
  | "structured_provider" | "parsed_legacy" | "canonical_default";
export interface StructuredBeardGuardStrategy {
  strategyType:
    | "guard_setting" | "guard_range" | "relative_guard"
    | "longest_first" | "no_numeric_setting";
  region: BeardGuardRegion | null;
  guardMm: number | null;
  guardRangeMm: { min: number; max: number } | null;
  relativeInstruction:
    | "longer_than_sides" | "shorter_than_chin"
    | "longest_first" | "reduce_gradually" | null;
  uncertainty: "starting_point" | "adjust_after_each_pass";
  freeformTechnique: "shorten_gradually" | null;
}
export interface BeardGuardNormalizationMetadata {
  recommendationIndex: number;
  guardStrategySource: BeardGuardStrategySource;
  guardStrategyNormalized: boolean;
  normalizerVersion: typeof BEARD_GUARD_NORMALIZER_VERSION;
}
export type BeardGuardNormalizationResult =
  | { success: true; result: BeardPhotoAnalysisResult; metadata: BeardGuardNormalizationMetadata[] }
  | { success: false; recommendationIndex: number };

const regions = ["cheeks", "sides", "chin", "moustache", "neckline", "overall"] as const;
const strategyTypes = ["guard_setting", "guard_range", "relative_guard", "longest_first", "no_numeric_setting"] as const;
const relativeInstructions = ["longer_than_sides", "shorter_than_chin", "longest_first", "reduce_gradually"] as const;
const uncertainties = ["starting_point", "adjust_after_each_pass"] as const;
const exactKeys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).length === expected.length &&
  expected.every((key) => Object.hasOwn(value, key));
const oneOf = <T extends string>(value: unknown, allowed: readonly T[]) =>
  allowed.includes(value as T);
const safeMillimetres = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 40;

export function isStructuredBeardGuardStrategy(value: unknown): value is StructuredBeardGuardStrategy {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (!exactKeys(item, ["strategyType", "region", "guardMm", "guardRangeMm", "relativeInstruction", "uncertainty", "freeformTechnique"]) ||
    !oneOf(item.strategyType, strategyTypes) ||
    !(item.region === null || oneOf(item.region, regions)) ||
    !(item.guardMm === null || safeMillimetres(item.guardMm)) ||
    !(item.relativeInstruction === null || oneOf(item.relativeInstruction, relativeInstructions)) ||
    !oneOf(item.uncertainty, uncertainties) ||
    !(item.freeformTechnique === null || item.freeformTechnique === "shorten_gradually")) return false;
  if (item.guardRangeMm !== null) {
    if (typeof item.guardRangeMm !== "object" || Array.isArray(item.guardRangeMm) ||
      !exactKeys(item.guardRangeMm as Record<string, unknown>, ["min", "max"])) return false;
    const range = item.guardRangeMm as Record<string, unknown>;
    if (!safeMillimetres(range.min) || !safeMillimetres(range.max) ||
      Number(range.min) >= Number(range.max)) return false;
  }
  if (item.strategyType === "guard_setting" &&
    (item.region === null || !safeMillimetres(item.guardMm))) return false;
  if (item.strategyType === "guard_range" &&
    (item.region === null || item.guardRangeMm === null)) return false;
  if (item.strategyType === "relative_guard" &&
    item.relativeInstruction === null) return false;
  return true;
}

const regionLabel = (region: BeardGuardRegion | null) =>
  region === "overall" || region === null ? "overall" : `on the ${region}`;
export function renderCanonicalBeardGuardStrategy(strategy: StructuredBeardGuardStrategy): string {
  if (strategy.strategyType === "guard_setting") {
    const suffix = strategy.uncertainty === "adjust_after_each_pass"
      ? " and check the result after each pass" : " as a starting point";
    const gradual = strategy.freeformTechnique === "shorten_gradually"
      ? ", then shorten gradually" : "";
    return `Try a ${strategy.guardMm} mm guard ${regionLabel(strategy.region)}${suffix}${gradual}.`;
  }
  if (strategy.strategyType === "guard_range") {
    const range = strategy.guardRangeMm!;
    const suffix = strategy.uncertainty === "adjust_after_each_pass"
      ? " and check the result after each pass" : " as a starting point";
    return `Try a ${range.min}–${range.max} mm guard range ${regionLabel(strategy.region)}${suffix}.`;
  }
  if (strategy.strategyType === "relative_guard" &&
    strategy.relativeInstruction === "longer_than_sides") {
    return "Keep the chin one guard setting longer than the sides.";
  }
  if (strategy.strategyType === "relative_guard" &&
    strategy.relativeInstruction === "shorter_than_chin") {
    return "Keep the sides one guard setting shorter than the chin.";
  }
  if (strategy.strategyType === "relative_guard" &&
    strategy.relativeInstruction === "reduce_gradually") {
    return "Reduce the guard setting gradually and check the result after each pass.";
  }
  if (strategy.strategyType === "no_numeric_setting") {
    return "Choose a suitable guard without assigning a numeric setting and check the result after each pass.";
  }
  return "Begin with the longest suitable guard and shorten gradually.";
}

const unsafeLegacy =
  /\b(?:beard|cheeks?|chin|sides?|moustache|neckline)\b.{0,45}\b(?:is|are|measures?|currently|length)\b.{0,25}\d+(?:\.\d+)?\s*mm\b|\b(?:photo|image|photograph)\b.{0,80}\b(?:objectively|correct|proves?|shows?|measures?)\b|\b(?:guarantee|exactly|final length|will leave)\b.{0,60}\d+(?:\.\d+)?\s*mm\b|\b\d+(?:\.\d+)?\s*mm\b.{0,35}\b(?:longer|shorter)\b/i;
const parseRegion = (value: string): BeardGuardRegion =>
  regions.find((region) => region !== "overall" &&
    new RegExp(`\\b${region}\\b`, "i").test(value)) ?? "overall";
const base = (overrides: Partial<StructuredBeardGuardStrategy>): StructuredBeardGuardStrategy => ({
  strategyType: "no_numeric_setting", region: "overall", guardMm: null,
  guardRangeMm: null, relativeInstruction: null, uncertainty: "starting_point",
  freeformTechnique: null, ...overrides,
});

export function parseLegacyBeardGuardStrategy(clause: string): StructuredBeardGuardStrategy | undefined {
  const value = clause.trim();
  if (!value || unsafeLegacy.test(value)) return undefined;
  if (/\b(?:start|begin)\b.{0,30}\blongest\b.{0,25}\bguard\b/i.test(value) &&
    /\b(?:reduce|shorten|work)\b.{0,20}\b(?:gradually|downward)\b/i.test(value)) {
    return base({ strategyType: "longest_first", relativeInstruction: "longest_first", freeformTechnique: "shorten_gradually" });
  }
  if (/\b(?:keep|use|try)\b.{0,20}\bchin\b.{0,25}\bone\s+(?:guard\s+)?setting\s+longer\b.{0,20}\bsides\b/i.test(value)) {
    return base({ strategyType: "relative_guard", region: "chin", relativeInstruction: "longer_than_sides" });
  }
  const range = value.match(/\b(?:use|try|trim|start|begin)\b.{0,35}?(\d+(?:\.\d+)?)\s*[–-]\s*(\d+(?:\.\d+)?)\s*mm\b/i);
  if (range && safeMillimetres(Number(range[1])) && safeMillimetres(Number(range[2])) &&
    Number(range[1]) < Number(range[2])) {
    return base({ strategyType: "guard_range", region: parseRegion(value),
      guardRangeMm: { min: Number(range[1]), max: Number(range[2]) },
      uncertainty: "adjust_after_each_pass" });
  }
  const setting = value.match(/\b(?:use|try|trim|start|begin)\b.{0,35}?(\d+(?:\.\d+)?)\s*mm\b/i);
  if (setting && safeMillimetres(Number(setting[1]))) {
    return base({ strategyType: "guard_setting", region: parseRegion(value),
      guardMm: Number(setting[1]),
      freeformTechnique: /\b(?:work downward|reduce gradually|shorten gradually)\b/i.test(value)
        ? "shorten_gradually" : null });
  }
  return undefined;
}

export function normalizeBeardGuardStrategies(value: BeardPhotoAnalysisResult): BeardGuardNormalizationResult {
  const metadata: BeardGuardNormalizationMetadata[] = [];
  const recommendations: BeardPhotoRecommendation[] = [];
  for (const [recommendationIndex, recommendation] of value.recommendations.entries()) {
    const raw = recommendation.proposedGuardStrategy as unknown;
    if (raw === null) {
      recommendations.push(recommendation);
      continue;
    }
    const structured = isStructuredBeardGuardStrategy(raw);
    const strategy = structured ? raw
      : typeof raw === "string" ? parseLegacyBeardGuardStrategy(raw) : undefined;
    if (!strategy) return { success: false, recommendationIndex };
    recommendations.push({ ...recommendation,
      proposedGuardStrategy: renderCanonicalBeardGuardStrategy(strategy) });
    metadata.push({ recommendationIndex,
      guardStrategySource: structured ? "structured_provider" : "parsed_legacy",
      guardStrategyNormalized: true, normalizerVersion: BEARD_GUARD_NORMALIZER_VERSION });
  }
  return { success: true, result: { ...value, recommendations }, metadata };
}
