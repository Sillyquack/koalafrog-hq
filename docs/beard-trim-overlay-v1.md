# Beard trim overlay v1

## VAL-0011 production trace

The safe diagnostic for support ID
`ab4588c9-f3bb-4cdd-9478-e6522d98ff2d` recorded a completed OpenAI response
that passed JSON parsing and provider schema validation, then failed
`ContractValidation` at `$.trimOverlay` with VAL-0011. Both the expected and
received categories were `object`, and no rejected result payload was stored.
The private annotation values therefore cannot and should not be reconstructed.

The internal mismatch was structural. The provider schema treated
`guidanceType`, `geometry.type`, `guardMm`, and `trimDirection` as independent
fields and allowed two points for every geometry. The v1 contract instead
treats them as a discriminated shape: line guidance requires a polyline with at
least two distinct points and no tool metadata; trim/blend regions require a
polygon with at least three distinct, non-collinear points; and do-not-cross
regions also prohibit tool metadata. A schema-admitted object could therefore
be rejected as an object by the stricter contract validator.

The provider schema now encodes the line, trim/blend, and do-not-cross variants
separately and applies the correct minimum point count. The in-process schema
validator enforces array cardinality as well. Geometry properties that JSON
Schema cannot prove, including distinct points, non-zero polygon area, and
unique source views, remain fail-closed in the v1 contract validator. Rejected
results are still never persisted.

## VAL-0030 production trace

The 2026-08-16 failure at
`$.recommendations[3].proposedGuardStrategy` crossed two incompatible runtime
contracts. The provider schema admitted a structured object with
`strategyType`, `region`, `guardMm`, `guardRangeMm`, `relativeInstruction`,
`uncertainty`, and `freeformTechnique`, while `BeardPhotoAnalysisResult` and
the v4 semantic scanner treated the same field as `string | null`. The scanner
called the string-only `.split()` operation, so an object that escaped the
normalization boundary raised an exception and was reduced to VAL-0030.

The exact private field values cannot be recovered: the provider request used
`store: false`, rejected result content was intentionally not persisted or
logged, and the durable diagnostic retained only its safe JSON path and type
categories. Regression coverage therefore replays the full schema-defined
object at recommendation index 3 without inventing private output text.

The provider and canonical contracts are now distinct. Provider output accepts
the current structured guard object, the already-supported legacy string, or
`null`; the server converts every accepted non-null value to a canonical safe
sentence before semantic validation. Malformed objects fail at
schema/normalization, and a non-string that somehow reaches the semantic
scanner produces a deterministic path-specific VAL-0030 instead of throwing.
The in-process schema validator now evaluates every `anyOf` alternative rather
than silently skipping the provider union. No rejected content is retained.

Provider usage persistence remains unchanged. The adapter returns usage only
with a fully validated result, and the atomic persistence call writes both
together. Persisting usage for a rejected downstream result would change the
billing/audit contract and requires a separately designed metadata-only failure
path; this fix does not silently introduce that behavior.

`beard-trim-overlay-v1` is an advisory, machine-readable addition to a Beard
Photo Analysis result. It contains geometry only. The application renders that
geometry over the original temporary photo preview; the contract does not
contain image bytes, object paths, signed URLs, or modified image binaries.

The result-level `trimOverlay` field is nullable. New provider responses must
return either a complete v1 overlay or `null` when lighting, occlusion, framing,
or uncertainty prevents safe localization. Historical schema-v2 results that
predate the field remain readable when it is absent.

## Coordinate and geometry rules

- `coordinateSpace` is `normalized_0_to_1` and `origin` is `top_left`.
- Every point is finite and inclusive within `0 <= x,y <= 1`, independent of
  the source image's pixel dimensions.
- Each view uses the original `sourceView` identity: `front`, `left_profile`,
  `right_profile`, or `under_chin`.
- `neckline` and `cheek_line` use non-degenerate polylines with at least two
  points.
- `trim_remove`, `blend_transition`, and `keep_do_not_cross` use non-degenerate
  polygons with at least three points.
- Source views are unique. A present overlay contains at least one annotation;
  uncertainty is represented by a `null` overlay instead of guessed geometry.

Each annotation may reference one canonical Length Map zone. `guardMm` is an
optional equipment setting only, never a measured or guaranteed hair length.
Guard and trim-direction metadata are prohibited on line guidance and on
`keep_do_not_cross` regions.

## Authority and retention boundary

The envelope fixes `advisory: true` and `provenance: "ai"`. Overlay annotations
do not update the Beard Profile, Length Map, Trim Recipe, recommendation review
status, or any other owner-reviewed workspace record. They are stored only as
part of an already validated intelligence result payload. Temporary source
images retain the existing private-storage and terminal-cleanup lifecycle.
