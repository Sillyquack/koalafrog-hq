import {
  BEARD_TRIM_OVERLAY_COORDINATE_SPACE,
  BEARD_TRIM_OVERLAY_ORIGIN,
  BEARD_TRIM_OVERLAY_VERSION,
  type BeardTrimOverlay,
  type BeardTrimOverlayAnnotation,
  beardTrimOverlayDirections,
  beardTrimOverlayGuidanceTypes,
  type BeardTrimOverlayPoint,
  beardTrimOverlaySourceViews,
  beardTrimOverlayZoneReferences,
} from "../../../src/types/beardTrimOverlay.ts";

const exactKeys = (value: Record<string, unknown>, expected: string[]) =>
  Object.keys(value).length === expected.length &&
  expected.every((key) => Object.hasOwn(value, key));
const oneOf = <T extends string>(value: unknown, allowed: readonly T[]) =>
  allowed.includes(value as T);
const normalizedCoordinate = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 &&
  value <= 1;
const equipmentGuard = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0.1 &&
  value <= 40;

const validPoint = (value: unknown): value is BeardTrimOverlayPoint => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const point = value as Record<string, unknown>;
  return exactKeys(point, ["x", "y"]) && normalizedCoordinate(point.x) &&
    normalizedCoordinate(point.y);
};

const pointKey = (point: BeardTrimOverlayPoint) => `${point.x}:${point.y}`;
const polygonArea = (points: BeardTrimOverlayPoint[]) =>
  Math.abs(
    points.reduce((area, point, index) => {
      const next = points[(index + 1) % points.length];
      return area + point.x * next.y - next.x * point.y;
    }, 0) / 2,
  );

const validAnnotation = (
  value: unknown,
): value is BeardTrimOverlayAnnotation => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const annotation = value as Record<string, unknown>;
  if (
    !exactKeys(annotation, [
      "guidanceType",
      "geometry",
      "zoneReference",
      "guardMm",
      "trimDirection",
      "confidence",
    ]) || !oneOf(annotation.guidanceType, beardTrimOverlayGuidanceTypes) ||
    !(annotation.zoneReference === null ||
      oneOf(annotation.zoneReference, beardTrimOverlayZoneReferences)) ||
    !(annotation.guardMm === null || equipmentGuard(annotation.guardMm)) ||
    !(annotation.trimDirection === null ||
      oneOf(annotation.trimDirection, beardTrimOverlayDirections)) ||
    typeof annotation.confidence !== "number" ||
    !Number.isFinite(annotation.confidence) || annotation.confidence < 0 ||
    annotation.confidence > 1 || !annotation.geometry ||
    typeof annotation.geometry !== "object" ||
    Array.isArray(annotation.geometry)
  ) return false;

  const geometry = annotation.geometry as Record<string, unknown>;
  if (
    !exactKeys(geometry, ["type", "points"]) ||
    !["polyline", "polygon"].includes(String(geometry.type)) ||
    !Array.isArray(geometry.points) || geometry.points.length > 64 ||
    !geometry.points.every(validPoint)
  ) return false;

  const points = geometry.points as BeardTrimOverlayPoint[];
  const uniquePoints = new Set(points.map(pointKey));
  const lineGuidance = annotation.guidanceType === "neckline" ||
    annotation.guidanceType === "cheek_line";
  if (lineGuidance) {
    return geometry.type === "polyline" && points.length >= 2 &&
      uniquePoints.size >= 2 && annotation.guardMm === null &&
      annotation.trimDirection === null;
  }
  if (
    geometry.type !== "polygon" || points.length < 3 ||
    uniquePoints.size < 3 || polygonArea(points) <= 0.000001
  ) return false;
  if (annotation.guidanceType === "keep_do_not_cross") {
    return annotation.guardMm === null && annotation.trimDirection === null;
  }
  return true;
};

export function validateBeardTrimOverlay(
  value: unknown,
): value is BeardTrimOverlay {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const overlay = value as Record<string, unknown>;
  if (
    !exactKeys(overlay, [
      "version",
      "coordinateSpace",
      "origin",
      "advisory",
      "provenance",
      "views",
    ]) || overlay.version !== BEARD_TRIM_OVERLAY_VERSION ||
    overlay.coordinateSpace !== BEARD_TRIM_OVERLAY_COORDINATE_SPACE ||
    overlay.origin !== BEARD_TRIM_OVERLAY_ORIGIN || overlay.advisory !== true ||
    overlay.provenance !== "ai" || !Array.isArray(overlay.views) ||
    overlay.views.length < 1 ||
    overlay.views.length > beardTrimOverlaySourceViews.length
  ) {
    return false;
  }
  const seenViews = new Set<string>();
  for (const rawView of overlay.views) {
    if (!rawView || typeof rawView !== "object" || Array.isArray(rawView)) {
      return false;
    }
    const view = rawView as Record<string, unknown>;
    if (
      !exactKeys(view, ["sourceView", "annotations"]) ||
      !oneOf(view.sourceView, beardTrimOverlaySourceViews) ||
      seenViews.has(String(view.sourceView)) ||
      !Array.isArray(view.annotations) ||
      view.annotations.length < 1 || view.annotations.length > 24 ||
      !view.annotations.every(validAnnotation)
    ) return false;
    seenViews.add(String(view.sourceView));
  }
  return true;
}

const pointSchema = {
  type: "object",
  additionalProperties: false,
  required: ["x", "y"],
  properties: {
    x: { type: "number", minimum: 0, maximum: 1 },
    y: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;

const nullableGuardSchema = {
  type: ["number", "null"],
  minimum: 0.1,
  maximum: 40,
} as const;

const nullableDirectionSchema = {
  type: ["string", "null"],
  enum: [...beardTrimOverlayDirections, null],
} as const;

const nullSchema = { type: "null" } as const;

const annotationSchema = (
  guidanceTypes: readonly string[],
  geometryType: "polyline" | "polygon",
  minimumPoints: number,
  allowToolMetadata: boolean,
) => ({
  type: "object",
  additionalProperties: false,
  required: [
    "guidanceType",
    "geometry",
    "zoneReference",
    "guardMm",
    "trimDirection",
    "confidence",
  ],
  properties: {
    guidanceType: { type: "string", enum: guidanceTypes },
    geometry: {
      type: "object",
      additionalProperties: false,
      required: ["type", "points"],
      properties: {
        type: { type: "string", const: geometryType },
        points: {
          type: "array",
          minItems: minimumPoints,
          maxItems: 64,
          items: pointSchema,
        },
      },
    },
    zoneReference: {
      type: ["string", "null"],
      enum: [...beardTrimOverlayZoneReferences, null],
    },
    guardMm: allowToolMetadata ? nullableGuardSchema : nullSchema,
    trimDirection: allowToolMetadata ? nullableDirectionSchema : nullSchema,
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
}) as const;

const overlayAnnotationProviderSchema = {
  anyOf: [
    annotationSchema(["neckline", "cheek_line"], "polyline", 2, false),
    annotationSchema(
      ["trim_remove", "blend_transition"],
      "polygon",
      3,
      true,
    ),
    annotationSchema(["keep_do_not_cross"], "polygon", 3, false),
  ],
} as const;

export const beardTrimOverlayProviderSchema = {
  type: ["object", "null"],
  additionalProperties: false,
  required: [
    "version",
    "coordinateSpace",
    "origin",
    "advisory",
    "provenance",
    "views",
  ],
  properties: {
    version: { type: "string", const: BEARD_TRIM_OVERLAY_VERSION },
    coordinateSpace: {
      type: "string",
      const: BEARD_TRIM_OVERLAY_COORDINATE_SPACE,
    },
    origin: { type: "string", const: BEARD_TRIM_OVERLAY_ORIGIN },
    advisory: { type: "boolean", const: true },
    provenance: { type: "string", const: "ai" },
    views: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourceView", "annotations"],
        properties: {
          sourceView: { type: "string", enum: beardTrimOverlaySourceViews },
          annotations: {
            type: "array",
            minItems: 1,
            maxItems: 24,
            items: overlayAnnotationProviderSchema,
          },
        },
      },
    },
  },
} as const;
