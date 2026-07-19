# Core Formulation Engine

Ingredient classification prefers explicit Ingredient Knowledge physical form and primary roles. Missing profiles fall back to legacy Workspace Ingredient metadata at lower confidence. Unknown and review-required states do not become verified facts. No recommendation, usage-level, pairing, safety, efficacy, stability, or prediction heuristic is added.

Koalafrog separates the commercial product template shown in Product Studio from the formulation archetype that describes reusable process capabilities.

## Operational archetypes

- `simple_liquid`: single-system liquid formulas without a required thermal or emulsification process. Beard Oil uses this archetype.
- `anhydrous_multiphase`: oil-phase formulas with explicit phases and controlled heat/cool-down process records. Beard Butter uses this archetype.
- `solid_or_stick`: anhydrous heated solids with explicit phases, structurant melting, liquid incorporation, powder dispersion, cool-down additions, controlled filling, setting, and structured physical evaluation. Natural Deodorant is its first operational template.

The registry also recognizes `emulsion`, `water_based`, `alcohol_based`, `gel`, and `powder`. These remain planned capability descriptions only. They have no operational Product Studio templates and must not be treated as available workflows.

## Responsibility boundaries

An archetype defines capabilities such as phase support, heating, cooling, aqueous/oil phases, emulsification, and cool-down additions. It also documents maturity, limitations, and warnings.

A product template defines the familiar workflow name, route, target fields, draft phase/process structure, packaging intent, evaluation dimensions, and product-specific guidance. A saved concept contains the user’s choices. Formula Versions and Lab Batches remain the authoritative composition and execution records.

Shared validation checks composition totals and numeric values for every operational archetype. Phase and process-reference validation activates when the resolved archetype supports phases. Formula and Lab persistence continue to use the existing domain and repository paths; planning creates no stock movement.

## Natural Deodorant

Natural Deodorant uses the shared `solid_or_stick` capabilities. Its default draft suggests a structuring/melt phase, powder-dispersion phase, and cool-down phase, but the archetype does not require exactly three phases. Formula Lines remain percentage-by-weight truth and must reference valid phases.

Ingredient guidance derives only from available Workspace Ingredient metadata. Known physical forms are represented as solid, liquid, or powder; ambiguity remains `unknown` and requires review. Powders are treated as dispersed unless supported evidence says otherwise. Bicarbonate-free is an intent and never implies hypoallergenic or irritation-free.

The draft process intentionally leaves universal melting, addition, and fill temperatures unknown. Lab execution snapshots ordered lines and process steps, then records actual weights, temperatures, mixing, packaging, yield, defects, and observations. Odour-control observations are human development evidence, not proof of efficacy. Packaging choices are intent only and do not imply stock, reserve materials, infer density, or create procurement.

## Compatibility

Existing `beard_oil` and `beard_butter` concept identifiers are retained. `natural_deodorant` adds one value to the hosted concept-type constraint, but no persisted archetype field, workspace schema identifier, or backup-format change is introduced. Unknown template or archetype identifiers produce a visible error and are never silently mapped to another workflow.
