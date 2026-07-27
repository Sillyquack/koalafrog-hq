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

A basis is blocked when it has no concrete version, selects a mutable Draft version, has no lines, has unresolved ingredient identity, invalid percentages, a non-100% composition, invalid batch parameters, or a volume/count batch unit. Candidate, Approved, and Retired versions are immutable at the application boundary and may serve as exact bases.

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

## Durable round lifecycle

Production Procurement Rounds are durable owner/workspace records with a conservative lifecycle:

- `draft`: four required product slots exist and may be edited.
- `blocked`: server-side regeneration found a blocking formula basis.
- `requirements_ready`: requirements and inventory gaps were generated transactionally.
- `cancelled`: preserved for audit, locked against editing and regeneration.

Every round begins with explicit Beard Oil, Beard Butter, Beard Balm, and Deodorant slots. These slots intentionally contain no invented Product or Formula selection.

The durable aggregate uses:

- `production_procurement_rounds`
- `production_procurement_round_products`
- `production_procurement_requirements`
- `production_procurement_requirement_sources`
- `production_procurement_inventory_gaps`

Formula bases preserve the exact Formula Version foreign key, label/status snapshots, and a JSON snapshot of immutable version metadata. Requirement sources preserve exact Product, Formula, Formula Version, Formula Line, phase, contribution, overage, and calculation path.

## Regeneration, revisions, and cancellation

Draft edits and regeneration require the caller's expected revision. The RPC locks the round row and rejects a stale revision without retrying it as a database serialization failure.

Regeneration reads Formula Lines and inventory server-side; client totals are never authoritative. Existing draft requirements, provenance, and gaps are replaced in one transaction, so the same valid basis produces one canonical set without duplicates. A failure rolls back the replacement.

Inventory gaps are point-in-time snapshots. Active mass lots are converted within the mass family only. Quarantined, expired, exhausted, disposed, and outstanding Lab/Production allocations are excluded from usable stock. Incoming unreceived quantity remains nullable and never reduces the purchasing gap.

Cancellation is explicit and revision guarded. It changes no formula, supplier, purchase-plan, lot, or movement record.

## Security boundary

All durable tables carry `workspace_id` and `owner_id`, enforce composite workspace foreign keys, enable RLS, and expose only owner-scoped reads to authenticated clients. Direct client insert/update/delete is denied; writes use guarded transactional RPCs.

The RPCs derive identity from `auth.uid()`, require an active owned workspace, lock mutable rounds, validate every Product/Formula/Version/Ingredient reference inside the workspace, use a fixed search path, revoke public/anonymous execution, and grant execution only to authenticated users.

## Approval, ordering, and receiving semantics

The existing `purchase_plans`, `purchase_plan_lines`, cart scenarios, external-order RPC, Supplier Events, Supplier Products, supplier offers, and receiving ledger are the intended downstream boundaries.

The remaining persistence slice must add a production-round aggregate and transactional requirement/scenario/approval snapshots. Approval must preserve exact source versions, inventory and commercial assumptions, warnings, provenance, and calculator versions. Later price or stock changes must not recalculate that historical snapshot.

External ordering remains an explicit owner record through the existing purchase-plan transition. Receiving remains the only operation that can create a raw-material lot and Receipt movement.

## Research automation

Production readiness should create or link existing procurement requested items for unresolved gaps, then use the current explicit research actions. Provider responses remain candidates with URLs, timestamps, confidence, diagnostics, cancellation/retry state, and human accept/reject decisions. Reopening or recalculating a round must never trigger provider work.

## Known limitations and next slices

- The durable workflow now persists rounds, exact formula bases, requirements, sources, and inventory gaps; matches, cross-supplier scenarios, and approval snapshots remain future slices.
- General stock reservations are not yet a first-class aggregate; outstanding Lab and Production allocations are recorded as allocated stock, while `reserved_quantity` remains zero.
- Requirement-to-Supplier Product matching and purchasing specifications need the durable match slice.
- Cross-supplier optimizer publication and immutable approval snapshots need the scenario/approval slice.
- Weight-tier shipping, exclusions, dangerous-goods handling, landed-cost ranges, and exchange-rate snapshots need commercial schema extensions.
- External-order line progress and receiving handoff need integration with existing purchase-plan and inventory actions.

These limitations are blocking where relevant; the UI must never label an incomplete draft as ready for approval.

## Durable purchasing specifications and Supplier Product matching

Each persisted requirement can now produce a versioned purchasing specification from the canonical Ingredient, requirement, inventory-gap snapshot, and stored source records. Every field carries an explicit semantic state (`confirmed`, `preferred`, `unknown`, `not applicable`, or `blocked`); missing grade, organic, form, storage, shelf-life, and substitution facts remain unknown. SDS is the transparent default required document and COA a preferred document, without treating links or marketing claims as verified evidence.

Supplier Products retain their existing workspace-constrained Ingredient association. Because that legacy association did not preserve acceptance history, `supplier_product_ingredient_mappings` now records candidate/accepted/rejected/retired history, acceptance method, actor/time, provenance, notes, and a compatibility snapshot. Only one accepted canonical mapping may be active per Supplier Product. Accepting a mapping and selecting it for one requirement are separate RPC actions.

Candidate generation is explicit and deterministic. It reads stored Supplier Products, Suppliers, product verification, package/MOQ, availability, price, and last-verified dates; it never calls a provider or mutates canonical product text. Existing accepted procurement research remains the canonical research intake and acceptance path. This slice does not create a parallel provider or research-candidate system.

Classifications distinguish exact, preference deviation, needs review, incompatible, insufficient evidence, stale, unavailable, unit incompatible, package too small/excessive, and missing mapping. Reasons and warnings are persisted. Freshness rule version `1.0.0` treats 0–30 days as current, 31–90 as aging, over 90 as stale, and absent timestamps as unknown. Price, stock, product specification, documentation, shipping eligibility, and commercial terms remain separate fields.

Package calculations permit only mg/g/kg and ml/L families, with count isolated. They use integer package counts, respect MOQ, cover the persisted gap, and show purchased quantity and surplus. No density, mass-volume, or count-content assumption is made.

Selections and per-requirement rejections persist independently. Clear selection, needs-research, and owner rejection do not retire a Supplier Product, approve a purchase plan, mark a discount used, create an order, or alter stock. Owner-scoped read policies and RPC-only writes enforce authentication, workspace ownership, row locks, revision checks, cross-workspace foreign keys, fixed search paths, and transactional rollback.

Deliberate exclusions remain basket optimization, scenario persistence, purchase-plan approval, external ordering, receiving, inventory creation, provider calls, deployment, and remote migration application. Product-specific documents are represented by existing Supplier Product verification snapshots; richer binary/document-to-product linkage remains a future evidence-model refinement.
