# Core Formulation Engine

Koalafrog separates the commercial product template shown in Product Studio from the formulation archetype that describes reusable process capabilities.

## Operational archetypes

- `simple_liquid`: single-system liquid formulas without a required thermal or emulsification process. Beard Oil uses this archetype.
- `anhydrous_multiphase`: oil-phase formulas with explicit phases and controlled heat/cool-down process records. Beard Butter uses this archetype.

The registry also recognizes `solid_or_stick`, `emulsion`, `water_based`, `alcohol_based`, `gel`, and `powder`. These are planned capability descriptions only. They have no operational Product Studio templates and must not be treated as production-ready workflows.

## Responsibility boundaries

An archetype defines capabilities such as phase support, heating, cooling, aqueous/oil phases, emulsification, and cool-down additions. It also documents maturity, limitations, and warnings.

A product template defines the familiar workflow name, route, target fields, draft phase/process structure, packaging intent, evaluation dimensions, and product-specific guidance. A saved concept contains the user’s choices. Formula Versions and Lab Batches remain the authoritative composition and execution records.

Shared validation checks composition totals and numeric values for every operational archetype. Phase and process-reference validation activates when the resolved archetype supports phases. Formula and Lab persistence continue to use the existing domain and repository paths; planning creates no stock movement.

## Compatibility

Existing `beard_oil` and `beard_butter` concept identifiers are retained. Their archetypes are derived through the typed registry, so no persisted archetype field, workspace schema change, backup-format change, or database migration is required. Unknown template or archetype identifiers produce a visible error and are never silently mapped to another workflow.
