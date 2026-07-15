# Roadmap

## Phase 1: Foundation — Complete

Responsive application shell, domain models, local fixtures, core layouts for Dashboard, Products, Ingredients, Lab, and Scent House, placeholder modules, and repository documentation.

## Phase 2: Product + Formula System — Complete

Functional product workspaces and filters; formula library and detail routes; editable Draft composition lines; immutable Candidate, Approved, and Retired history; safe Draft duplication; status transitions; canonical percentage validation; live gram scaling; refresh-safe local persistence; and focused domain tests. Deeper product editing and side-by-side formula comparison remain candidates for later refinement.

## Phase 3: Ingredient + Inventory System — Complete

Functional Ingredient Library and detail workspaces; local ingredient CRUD and archival; scoped Supplier Products; physical lot receipt with unique internal numbers; immutable movement ledger; manual consumption, waste, sample, and adjustment workflows; unit validation and conversion; reorder and expiry awareness; formula stock context; responsive Inventory overview; and safe Phase 2 state migration. Supplier entities, purchasing, documents, and costing remain later work.

## Phase 4: Lab + Testing — Complete

Functional Lab Notebook and batch workspaces; formula execution snapshots; controlled lifecycle; planned and actual weigh-ins; multi-lot allocation; explicit referenced inventory consumption; process steps; yield variance; scheduled observations; lightweight Testers and Templates; batch-linked Sessions; immutable Responses; and descriptive result summaries. Images and deeper test protocols remain later refinements.

## Phase 5: Production + Costing

Production orders, controlled batch execution, genealogy, release workflow, formula and packaging cost rollups, scenario models, and margin views.

## Phase 6: Compliance + Launch

Product documentation, market-specific readiness, packaging specifications and artwork, launch dependencies, gates, dates, and asset coordination.

## Phase 7: Koalafrog Intelligence Layer

Search and synthesis across accumulated private knowledge, assisted comparison of experiments, anomaly and follow-up surfacing, and decision context. This phase must remain evidence-linked, private, and transparent; it should never invent laboratory or compliance conclusions.
# Phase 5 status

Phase 5 Production + Costing is implemented: Approved-version run creation, immutable execution snapshots, controlled lifecycle, multi-lot explicit consumption, yield/output capture, acquisition-cost snapshots, coverage-aware estimates, actual run costing, additional cost lines, and a lightweight pricing scenario.

Phase 6 now replaces overlapping manual packaging Cost Lines with authoritative physical Packaging Consumption where available. Compliance remains separate; Formula or Packaging `Approved`, Production `Completed`, and Finished Goods `Active` are internal operational states—not commercial or regulatory approval.

## Current roadmap

- Phase 1: Foundation — Complete
- Phase 2: Product + Formula — Complete
- Phase 3: Ingredient + Inventory — Complete
- Phase 4: Lab + Testing — Complete
- Phase 5: Production + Costing — Complete
- Phase 6: Packaging + Finished Goods — Complete
- Phase 7: Compliance Evidence + Launch Readiness — Complete
- Phase 8: Platform + Data Foundation — In Progress
- Phase 8B.1: Relational Schema + Proven v9 Migration — Complete
- Phase 8B.2: Application Actions + Repository Refactor — Complete
- Phase 8B.3A: Security + Storage + Cutover Readiness — Complete
- Phase 8B.3B: Hosted Authoritative Cutover — Next
- Phase 9: Koalafrog Intelligence Layer — Blocked pending Phase 8
