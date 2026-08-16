import type { BeardZoneName, TrimDirection } from "./beardStudio";

export const BEARD_TRIM_OVERLAY_VERSION = "beard-trim-overlay-v1" as const;
export const BEARD_TRIM_OVERLAY_COORDINATE_SPACE = "normalized_0_to_1" as const;
export const BEARD_TRIM_OVERLAY_ORIGIN = "top_left" as const;

export const beardTrimOverlaySourceViews = [
  "front",
  "left_profile",
  "right_profile",
  "under_chin",
] as const;

export const beardTrimOverlayGuidanceTypes = [
  "neckline",
  "cheek_line",
  "trim_remove",
  "blend_transition",
  "keep_do_not_cross",
] as const;

export const beardTrimOverlayZoneReferences = [
  "upper sideburn",
  "lower sideburn",
  "upper cheek",
  "lower cheek",
  "jaw left",
  "jaw right",
  "chin",
  "under-chin",
  "moustache",
  "soul patch",
  "neckline transition",
] as const satisfies readonly BeardZoneName[];

export const beardTrimOverlayDirections = [
  "with growth",
  "against growth",
  "across growth",
  "detail only",
] as const satisfies readonly TrimDirection[];

export type BeardTrimOverlayGuidanceType =
  typeof beardTrimOverlayGuidanceTypes[number];

export interface BeardTrimOverlayPoint {
  x: number;
  y: number;
}

export interface BeardTrimOverlayGeometry {
  type: "polyline" | "polygon";
  points: BeardTrimOverlayPoint[];
}

export interface BeardTrimOverlayAnnotation {
  guidanceType: BeardTrimOverlayGuidanceType;
  geometry: BeardTrimOverlayGeometry;
  zoneReference: BeardZoneName | null;
  guardMm: number | null;
  trimDirection: TrimDirection | null;
  confidence: number;
}

export interface BeardTrimOverlayView {
  sourceView: typeof beardTrimOverlaySourceViews[number];
  annotations: BeardTrimOverlayAnnotation[];
}

/**
 * Advisory geometry over the original source views. It never represents an
 * edited image or an accepted Beard Studio plan.
 */
export interface BeardTrimOverlay {
  version: typeof BEARD_TRIM_OVERLAY_VERSION;
  coordinateSpace: typeof BEARD_TRIM_OVERLAY_COORDINATE_SPACE;
  origin: typeof BEARD_TRIM_OVERLAY_ORIGIN;
  advisory: true;
  provenance: "ai";
  views: BeardTrimOverlayView[];
}
