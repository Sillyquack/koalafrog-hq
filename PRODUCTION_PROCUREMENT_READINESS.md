# Production Procurement Readiness V1

## Purpose

Production Readiness is the owner-controlled bridge from exact product/formula intent to an evidence-backed raw-material purchase plan for Beard Oil, Beard Butter, Beard Balm, and Deodorant.

The workflow never places an order, consumes a promotion, creates inventory, changes a formula version, or accepts supplier research automatically.

## Implemented foundation

- Route: `/procurement/production-readiness`
- Mandatory four-product scope with explicit missing-product blockers
- Exact formula-version selection
- Versioned formula-readiness rules
- Deterministic percentage scaling and overage
- Consolidation by canonical Ingredient ID, never display name
- Product, formula-version, formula-line, and phase provenance
- Inventory gap calculation from the immutable lot ledger
- Quarantined, expired, exhausted, and otherwise unavailable stock exclusion
- Explicit reservation input and unreceived-supply separation in the domain calculator
- Integer package selection with MOQ and surplus
- Strict mass/volume/count unit-family boundaries
- Supplier discount and shipping-threshold landed-cost calculation
- Unknown landed-cost components retained as unknown
- Deterministic strategy ranking for minimum cash, value, discount utilization, fewest suppliers, lowest risk, and balanced scenarios

Calculator versions are exported as:

- requirement engine `1.0.0`
- inventory gap `1.0.0`
- landed cost `1.0.0`
- basket optimizer `1.0.0`
- readiness rules `1.0.0`

## Formula readiness

A basis is blocked when it has no concrete version, no lines, unresolved ingredient identity, invalid percentages, a non-100% composition, invalid batch parameters, or a volume/count batch unit. Draft versions require owner review.

Deodorant additionally requires a recorded structure. Missing functional-role or phase/process metadata remains a visible review reason. The workflow does not invent a deodorant formula or performance claim.

The current Formula Line model stores percentages, not an independent quantity and unit per line. Consequently, percentage procurement scales in mass and refuses density-based mass/volume conversion. Adding immutable line quantity/unit semantics is a future schema change.

## Requirement and inventory calculations

For each formula line:

`batch size in g × batch count × percentage ÷ 100 × (1 + overage percentage ÷ 100)`

Consolidation keys are canonical Ingredient ID plus unit. Each contribution keeps its Product, category, Formula Version, Formula Line, phase, pre-overage quantity, overage, and total.

Usable inventory is:

`total compatible on-hand − quarantined − expired − unavailable − reserved`

Purchasing gap is:

`max(0, required − usable inventory)`

Ordered or planned but unreceived supply is displayed separately and does not reduce the purchasing gap or become stock.

## Commercial calculations

Package counts are positive integers and respect MOQ. A package with an incompatible unit family is invalid.

Discount eligibility checks supplier, status, currency, date window, minimum basket, first-purchase usage, and maximum discount. Approval alone never marks a discount used.

Shipping rules check supplier, active status, destination, currency, and threshold. Shipping, tax, duty, and handling remain nullable. The calculator reports a known minimum and only reports a confirmed total when every component is known.

Original supplier currency is preserved. Base-currency conversion is not performed without a stored rate, source, and timestamp.

## Approval, ordering, and receiving semantics

The existing `purchase_plans`, `purchase_plan_lines`, cart scenarios, external-order RPC, Supplier Events, Supplier Products, supplier offers, and receiving ledger are the intended downstream boundaries.

The remaining persistence slice must add a production-round aggregate and transactional requirement/scenario/approval snapshots. Approval must preserve exact source versions, inventory and commercial assumptions, warnings, provenance, and calculator versions. Later price or stock changes must not recalculate that historical snapshot.

External ordering remains an explicit owner record through the existing purchase-plan transition. Receiving remains the only operation that can create a raw-material lot and Receipt movement.

## Research automation

Production readiness should create or link existing procurement requested items for unresolved gaps, then use the current explicit research actions. Provider responses remain candidates with URLs, timestamps, confidence, diagnostics, cancellation/retry state, and human accept/reject decisions. Reopening or recalculating a round must never trigger provider work.

## Known limitations and next slices

- The current page derives a draft round from the active workspace state; durable round, requirement, match, scenario, and approval tables/RPCs remain to be added.
- General stock reservations are not yet a first-class aggregate; only execution allocations exist.
- Requirement-to-Supplier Product matching and purchasing specifications need the durable match slice.
- Cross-supplier optimizer publication and immutable approval snapshots need the scenario/approval slice.
- Weight-tier shipping, exclusions, dangerous-goods handling, landed-cost ranges, and exchange-rate snapshots need commercial schema extensions.
- External-order line progress and receiving handoff need integration with existing purchase-plan and inventory actions.

These limitations are blocking where relevant; the UI must never label an incomplete draft as ready for approval.
