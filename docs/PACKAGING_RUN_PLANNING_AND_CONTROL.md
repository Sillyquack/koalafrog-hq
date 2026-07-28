# Packaging Run Planning, Bulk Allocation & Packaging Control

Status: Finished Goods & Batch Genealogy V1, Slice 2
Policy versions: packaging eligibility `1.0.0`; reconciliation/completion `1.0.0`

## Outcome and boundary

Slice 2 turns completed, reconciled Production Output into a controlled Packaging Run. It creates no Finished Goods Lot, quarantine record, quality-release decision, Finished Goods opening movement, shipment, sale, accounting entry or consumer label.

The separate packaging lot and immutable movement ledger remains physical quantity truth. Legacy `packaging_allocations` and `commit_packaging_consumption` remain only for existing Finished Goods history. New Packaging Run requirements, reservations and inventory-use rows are an additive evolution of the packaging commitment concept, not another packaging ledger. Raw-material reservation and movement tables are never reused.

## Lifecycle

`Completed Production Output → available retained bulk → Packaging Run → locked bulk allocation → immutable specification/requirements → eligible packaging lots → durable reservations → measured bulk transfer → productive consumption / waste → release / staged return → reconciliation → completion → ready for Finished Goods Lot creation`

All mutations use versioned RPCs, expected revisions, UUID idempotency identities, canonical fingerprints, owner/workspace checks and one transaction. Browser calculations are presentational only.

## Output availability and allocation

`available bulk = retained Production Output bulk − active/transferred Packaging Run allocations`

The database locks the Production Output before its last availability check. One Output may feed several runs; one Packaging Run may use only one Output. Allocation creates no movement. Transferred bulk remains allocated to its run. An entirely unused allocation may be released; transferred quantity cannot be released or silently returned.

Bulk transfer is a measured, append-only fact distinct from planning. It records unit, method, equipment/vessels, operator, evidence and time. It creates no Finished Goods movement.

## Specification and requirements

Creation requires an Approved Packaging Specification Version belonging to the Output Product. The run snapshots stable IDs and supported display facts. Current packaging schema does not yet model every market, artwork, warning, Responsible Person, PAO or expiry field; these remain explicitly Unknown rather than inferred.

Specification Lines become immutable run requirements containing component identity/name/role, quantity per unit, total planned quantity, unit, order, instructions and policy version. Slice 2 policy snapshots a 5% rounded-up operational waste allowance. This allowance authorises reservation capacity only; waste still requires a distinct recorded movement and evidence/reason.

## Eligibility and reservation-aware availability

Eligibility policy `1.0.0` requires:

- the active owner/workspace;
- the exact requirement component;
- Packaging Lot status `Active`;
- exact-compatible unit;
- positive movement-derived balance after active reservations.

Lots are recommended deterministically by received date then internal lot code. The operator must select a lot; recommendation never consumes stock.

Current Packaging Lot data has only `Active`, `Quarantined`, `Exhausted`, `Disposed` and `Archived` plus optional receiving/release ancestry. Slice 2 therefore does not claim raw-material-style hold/reject/recall/expiry parity. Extending packaging quality state is deferred unless required for safe component use.

Active availability is:

`movement-derived lot balance − active/partially-used Packaging Run reservations`

Reservations have durable run, requirement and lot identity. They create no movement. Single or multi-requirement reservation locks lots deterministically; an atomic reserve-all request rolls back completely if any component fails. Existing legacy Finished Goods allocations do not reduce Slice 2 availability because they are not uncommitted reservation facts and cannot safely attach to a Packaging Run.

## Consumption, waste, release and staged return

Productive consumption and waste/damage each create one canonical immutable negative Packaging Movement plus one immutable Packaging Run inventory-use row. Idempotent retry returns the same movement; changed payload fails. Cost is snapshotted from the physical lot. Unknown cost remains Unknown.

Reservation release means stock was not physically staged or consumed. Staged return means stock was staged but never consumed, the original lot remains certain, condition is acceptable, and evidence exists. Both release only unused reservation quantity and create no movement. Staged return cannot fabricate a positive movement. Post-consumption positive return and arbitrary adjustments are excluded.

Supported waste categories include damage before/during filling, label or closure defect, contamination, setup waste, sample use, count discrepancy and other. Waste never counts as productive consumption.

## Reconciliation and completion

Requirement history obeys:

`reserved = productive consumption + waste + released/staged-returned unused quantity + remaining active reservation`

Bulk allocation obeys:

`allocated = transferred + released unused + remaining active allocation`

Transferred bulk obeys:

`transferred = pending Finished Goods conversion + retained transferred bulk + process waste + unexplained variance`

Variance is never forced to zero. A non-zero bulk or packaging variance requires a reason and explicit approval. Reconciliation rows are append-only.

The read-only readiness RPC and completion RPC call the same `1.0.0` evaluator. Completion requires measured transfer, complete productive component consumption, no active reservation, no unexplained allocation and a reconciled run. Completion is immutable and returns `ready_for_finished_goods_lot_creation`; it creates no Finished Goods record or movement.

## Cost and genealogy

Bulk cost is the Production Output material-cost snapshot and remains provisional where allocation cannot safely be valued. Packaging consumption/waste snapshots lot unit cost, total cost, currency and confidence. Current supplier prices never rewrite history and Unknown is never zero.

The genealogy RPC derives immutable links among Packaging Run, Production Output/Run, Formula Version, specification snapshot, requirements, reservations, physical Packaging Lots, movements, consumption/waste and events. It returns an empty Finished Goods collection in Slice 2. Procurement ancestry remains available through existing Packaging Lot receiving/release links where present; missing legacy ancestry is a provenance gap.

## Security and application

All eight Slice 2 tables enable RLS, grant owner-scoped authenticated reads and deny authenticated inserts/updates/deletes. Lifecycle writes are security-definer RPCs with fixed search paths, `auth.uid()` actor derivation and active-workspace checks. Functions are revoked from `PUBLIC` and `anon`. Completed runs and history tables are trigger-protected.

The typed repository owns reads and RPC calls. The completed Production Output workspace shows authoritative availability and embeds a responsive Packaging Run workspace for creation, bulk allocation/transfer, lot selection, reservation, consumption, waste, release/staged return, reconciliation, blockers, completion and audit history. State is reconstructed from Supabase after refresh or relogin.

## Tests and performance

Coverage includes 123 pgTAP contract assertions, authenticated lifecycle integration, atomic reserve-all, release/staged return, exact movement identity, retry/conflict behavior, owner/workspace isolation and concurrent bulk competition. The Production desktop and 390 × 844 browser lifecycle continues through Packaging Run completion and verifies the explicit no-Finished-Goods boundary.

Representative plans live in `scripts/performance/packaging-run-plans.sql`. The rollback-only fixture creates 10,000 runs, 40,000 requirements, 10,000 bulk allocations, 40,000 reservations, 10,000 reconciliations and 50,000 events. On the 2026-07-28 local Docker database, a run-by-Output lookup used `packaging_runs_output_idx` in 0.974 ms, four requirement rows used `packaging_requirements_run_idx` in 0.438 ms, a five-event genealogy lookup used `packaging_events_run_idx` in 0.392 ms, and the intentionally broad active-reservation aggregation scanned 40,000 rows in 8.110 ms. The first readiness fixture exposed a non-covering run lookup; after adding the justified `(workspace_id, packaging_run_id, status)` index it used an index-only scan and completed in 0.435 ms.

## Accepted limitations and Slice 3 entry

- no broad packaging quality-release parity, expiry or restriction model beyond current safe fields;
- no unrestricted post-consumption return or general adjustment engine;
- specification snapshots preserve only fields represented by the current packaging model;
- bulk-cost allocation is provisional and is not fabricated across split runs;
- no density conversion;
- no Finished Goods identity, quantity, quarantine, inspection, release or active inventory.

Slice 3 is implemented by [Finished Goods Lot Creation and Quarantine](FINISHED_GOODS_LOT_CREATION_AND_QUARANTINE.md). It begins only from a completed Packaging Run and creates quarantined identity without an active inventory movement.
