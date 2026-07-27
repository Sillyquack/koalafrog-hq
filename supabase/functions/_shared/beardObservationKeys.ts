import type {
  BeardPhotoAnalysisResult,
  BeardPhotoItem,
} from "./beardPhotoAnalysisContract.ts";

export const BEARD_OBSERVATION_KEY_NORMALIZER_VERSION =
  "beard-observation-key-normalizer-v1" as const;

const sections = [
  ["observations", "observation"],
  ["symmetry", "symmetry"],
  ["densityDistribution", "density"],
  ["lineAssessment", "line"],
] as const;

type SectionName = typeof sections[number][0];
type ObservationRef = {
  section: SectionName;
  sectionRank: number;
  index: number;
  item: BeardPhotoItem;
  providerKey: string;
  base: string;
  sortKey: string;
};

export type BeardObservationKeyCollision = {
  code: "OBSERVATION_KEY_NORMALIZATION_COLLISION";
  keyCategory: string;
  first: { section: SectionName; index: number };
  second: { section: SectionName; index: number };
  keySource: "server_generated";
  providerCollisionDetected: boolean;
  normalizerVersion: typeof BEARD_OBSERVATION_KEY_NORMALIZER_VERSION;
};

export type BeardObservationKeyNormalization =
  | {
    success: true;
    result: BeardPhotoAnalysisResult;
    provenance: {
      observationKeySource: "server_generated";
      observationKeyNormalizerVersion:
        typeof BEARD_OBSERVATION_KEY_NORMALIZER_VERSION;
      providerCollisionDetected: boolean;
    };
  }
  | { success: false; collision: BeardObservationKeyCollision };

export function beardObservationKeyCollisionLog(
  collision: BeardObservationKeyCollision,
) {
  return JSON.stringify({
    event: "beard_observation_key_normalization_collision",
    code: collision.code,
    keyCategory: collision.keyCategory,
    firstSection: collision.first.section,
    firstIndex: collision.first.index,
    secondSection: collision.second.section,
    secondIndex: collision.second.index,
    keySource: collision.keySource,
    providerCollisionDetected: collision.providerCollisionDetected,
    normalizerVersion: collision.normalizerVersion,
  });
}

function slug(value: string, fallback: string) {
  const normalized = value.toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

function shortHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function boundedKey(base: string, ordinal: number) {
  const suffix = `_${ordinal}`;
  if (base.length + suffix.length <= 64) return `${base}${suffix}`;
  const hash = `_${shortHash(base)}`;
  return `${base.slice(0, 64 - suffix.length - hash.length)}${hash}${suffix}`;
}

export function normalizeBeardObservationKeys(
  value: BeardPhotoAnalysisResult,
  createKey: (base: string, ordinal: number) => string = boundedKey,
): BeardObservationKeyNormalization {
  const refs: ObservationRef[] = [];
  const providerOccurrences = new Map<string, ObservationRef[]>();

  sections.forEach(([section, sectionSlug], sectionRank) => {
    value[section].forEach((item, index) => {
      const providerKey = typeof item.observationKey === "string"
        ? item.observationKey.trim()
        : "";
      const regions = [...item.relatedBeardZones].map((zone) =>
        slug(zone, "overall")
      ).sort();
      const region = regions.join("_") || "overall";
      const category = slug(item.category, "general");
      const base = `${sectionSlug}_${category}_${region}`;
      const views = [...item.supportingViews].sort().join("_");
      const ref = {
        section,
        sectionRank,
        index,
        item,
        providerKey,
        base,
        sortKey: `${sectionRank}|${region}|${category}|${views}|${index}`,
      };
      refs.push(ref);
      if (providerKey) {
        providerOccurrences.set(
          providerKey,
          [...(providerOccurrences.get(providerKey) ?? []), ref],
        );
      }
    });
  });

  const providerCollisionDetected = [...providerOccurrences.values()].some(
    (matches) => matches.length > 1,
  );
  const assigned = new Map<ObservationRef, string>();
  const seen = new Map<string, ObservationRef>();
  const ordinalByBase = new Map<string, number>();
  for (
    const ref of [...refs].sort((left, right) =>
      left.sortKey < right.sortKey ? -1 : left.sortKey > right.sortKey ? 1 : 0
    )
  ) {
    const ordinal = ordinalByBase.get(ref.base) ?? 0;
    ordinalByBase.set(ref.base, ordinal + 1);
    const key = createKey(ref.base, ordinal);
    const first = seen.get(key);
    if (first) {
      return {
        success: false,
        collision: {
          code: "OBSERVATION_KEY_NORMALIZATION_COLLISION",
          keyCategory: ref.base,
          first: { section: first.section, index: first.index },
          second: { section: ref.section, index: ref.index },
          keySource: "server_generated",
          providerCollisionDetected,
          normalizerVersion: BEARD_OBSERVATION_KEY_NORMALIZER_VERSION,
        },
      };
    }
    seen.set(key, ref);
    assigned.set(ref, key);
  }

  const providerToCanonical = new Map<string, string[]>();
  for (const ref of refs) {
    if (!ref.providerKey) continue;
    providerToCanonical.set(ref.providerKey, [
      ...(providerToCanonical.get(ref.providerKey) ?? []),
      assigned.get(ref)!,
    ]);
  }
  const normalizedGroups = Object.fromEntries(
    sections.map(([section]) => [
      section,
      refs.filter((ref) => ref.section === section)
        .sort((left, right) => left.index - right.index)
        .map((ref) => ({ ...ref.item, observationKey: assigned.get(ref)! })),
    ]),
  ) as Pick<
    BeardPhotoAnalysisResult,
    "observations" | "symmetry" | "densityDistribution" | "lineAssessment"
  >;

  return {
    success: true,
    result: {
      ...value,
      ...normalizedGroups,
      recommendations: value.recommendations.map((recommendation) => ({
        ...recommendation,
        supportingObservationKeys: [
          ...new Set(recommendation.supportingObservationKeys.flatMap((key) =>
            providerToCanonical.get(key.trim()) ?? [key]
          )),
        ],
      })),
    },
    provenance: {
      observationKeySource: "server_generated",
      observationKeyNormalizerVersion:
        BEARD_OBSERVATION_KEY_NORMALIZER_VERSION,
      providerCollisionDetected,
    },
  };
}
