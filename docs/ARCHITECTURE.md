# Architecture

## Current foundation

Koalafrog HQ is a client-only React and TypeScript application built with Vite. React Router owns top-level navigation. `AppShell` provides the persistent responsive navigation, top bar, and page outlet.

The source tree separates concerns:

- `app`: composition and route registration.
- `components/layout`: reusable application chrome.
- `components/ui`: domain-neutral presentation primitives.
- `features`: domain page composition.
- `types`: persistence-independent domain contracts.
- `data`: replaceable local fixtures.
- `utils`: small formatting helpers.
- `styles`: visual system and responsive behaviour.

Static reference fixtures remain separate from views. The functional workspace uses a `FormulaDataProvider` backed by a small repository contract. Its name is retained from Phase 2 for compatibility, though it now owns Product, Formula, Ingredient, Supplier Product, Inventory Lot, and Inventory Movement collections. `LocalFormulaRepository` stores one versioned aggregate in browser local storage and keeps storage calls outside UI components.

The Phase 4 storage key is `koalafrog-hq:workspace:v6`. If it is absent, the repository first checks the Phase 3 `v4` aggregate and explicitly preserves every Product, Formula, Ingredient, Supplier Product, Lot, and Movement while adding seeded Lab and Testing collections. The earlier Phase 2 migration remains available as a second fallback.

Formula calculations and lifecycle rules live in pure domain utilities. Percentage totals use bounded decimal rounding, scaling derives gram weights without mutating percentages, status transitions are explicit, and duplication produces a new Draft with new version and line IDs.

Inventory logic is also pure and tested. Movements are authoritative signed history: Receipt is positive; Consumption, Waste, and Sample are negative; Adjustment accepts an explicit positive or negative correction. Lot and ingredient balances are derived on read. Within a lot, only compatible mass, volume, or count units are accepted. The supported conversions are kg ↔ g and L ↔ ml; density conversion is intentionally absent.

Formula scaling remains planning-only. It reads inventory context for awareness but never creates movements. A future executed Lab Batch may create referenced Consumption movements through an explicit workflow.

Lab execution uses its own immutable snapshots. Creating a batch copies the formula line ID, ingredient ID and name-at-creation, percentage, phase, notes, and calculated planned quantity into Lab Batch Lines. The Formula Version remains untouched. Each line supports multiple Lot Allocations; explicit commit validates their total against the actual weigh-in and creates one referenced Consumption movement per allocation. The allocation stores the resulting movement ID, making duplicate commits detectable.

Testing remains batch-linked. Templates hold a focused ordered question set, Sessions reference an exact Lab Batch, and submitted Responses carry tester identity plus answer snapshots. Result summaries are descriptive averages and counts only.

## Supabase integration

Persistence uses repositories grouped around domain use cases rather than leaking database tables into components. Supabase adapters map relational rows into domain types while the Local adapter remains useful for isolated development and rollback.

The planned boundary is:

`Feature UI → domain hook/use case → repository interface → mock or Supabase adapter`

Supabase provides:

- PostgreSQL for structured domain records and relationships.
- Authentication for the single owner account.
- Storage for batch photos, supplier documents, artwork, and compliance files.
- Row Level Security so all records and storage references remain private to the owner.

Backend clients, generated database types, and query details remain in the platform infrastructure area and do not leak into feature components.

Product Studio Formula handoffs may attach optional ordered phase definitions and a structured manufacturing-process draft to an existing Formula Version. Formula Lines remain the canonical percentage composition and carry their phase association. Lab Batch creation snapshots those lines and process steps for execution; the Formula Version remains unchanged, and planning never creates Inventory Movements.

The Core Formulation Engine separates reusable formulation archetypes from familiar Product Studio templates. The typed registry owns capability maturity and template-to-archetype mapping; shared handoff validation resolves capabilities from the saved concept type rather than product-name conditionals. See [FORMULATION_ENGINE.md](FORMULATION_ENGINE.md).

v0.12.0 makes `solid_or_stick` operational and registers Natural Deodorant as its first template. The template persists choices in existing Product Studio concept JSON, while phase definitions and draft processes use existing Formula Version JSON metadata. Development Experiments, Lab snapshots, observations, packaging intent, and inventory boundaries remain shared. A forward-only database constraint migration adds `natural_deodorant` as an allowed concept type; workspace schema v9 and backup v1 remain unchanged.

## UI approach

The visual system uses shared CSS tokens and purposeful components rather than a third-party component kit. The dense sidebar supports the breadth of the operating system; content remains calm and tactile. Scent House intentionally shifts into a darker, more atmospheric workspace while retaining shared navigation and interaction conventions.
## Phase 5 — Production and Costing

Production is a separate feature boundary from Lab. A `ProductionRun` references one exact Approved `FormulaVersion`, snapshots formula lines and process instructions, and never mutates its source. Planned runs are editable; starting fixes the source; Completed and Archived execution is effectively read-only. Aborted records retain all work and committed movements.

Inventory remains ledger-led. Lot selection, allocation, and weigh-in do not affect stock. `Commit Production Consumption` appends `Consumption` movements with `referenceType: ProductionRun`; allocations retain movement IDs and acquisition unit-cost/currency snapshots. Duplicate commitment is rejected, and corrections remain explicit Adjustment movements.

Costing logic is pure and React-independent in `features/costing/domain`. NOK is the workspace base currency. Estimated formula costs first use a remaining-quantity-weighted unit cost across compatible Active, non-expired, positive-balance NOK lots with acquisition cost; if none qualify, they use a compatible preferred Supplier Product reference in NOK. Otherwise cost is Unknown and coverage is reduced. Actual material cost remains independent and uses only committed allocation snapshots, so later lot metadata, supplier prices, and receipts cannot rewrite Production history.

Local persistence advances from workspace v6 to v7. The explicit Phase 4 migration preserves every existing Phase 1–4 collection and adds empty Production and Costing collections; it never introduces seed records into an existing workspace.

## Phase 6 — Packaging and Finished Goods

Packaging is a separate physical inventory boundary: Component → Supplier Product → Lot → immutable Packaging Movement. Packaging Specifications belong to Products and use Draft-editable, Candidate/Approved/Retired-frozen versions. Requirements and shortages are projections only.

Finished Goods are explicit output registrations, not Production Run state. A batch snapshots Product, Formula Version, Production Run, optional Approved Packaging Specification Version, and cost context. Packaged output is initially Quarantined; committing all required multi-lot Packaging allocations appends Packaging Consumption movements, appends the Finished Goods ProductionReceipt, and activates the batch. The Packaging movements reference `FinishedGoodsBatch`, providing the shortest physical traceability path.

Actual physical Packaging allocation cost is authoritative once committed. Overlapping manual Production Packaging Cost Lines are excluded from the Finished Goods packaging basis and surfaced with a warning, preventing double counting. Finished Goods balances derive only from their immutable movement ledger.

Persistence advances from workspace v7 to v8. The explicit Phase 5 migration preserves all Phase 1–5 collections and adds empty Phase 6 collections; seed records are used only for new workspaces.

## Phase 7 — Compliance Evidence and Launch Readiness

A Compliance Dossier binds one exact Product, Formula Version, optional Packaging Specification Version, optional Label Artwork Version, target market, and language. Old dossiers remain immutable configuration history. Duplication creates a new record and marks copied version-sensitive evidence Needs Review; CPSR and CPNP validity are never carried forward automatically.

Readiness is isolated pure domain logic derived from evidence gaps. Its vocabulary is deliberately internal and can never produce “compliant”, “safe”, certified, or authority-approved states. CPSR metadata records an external assessor workflow only. CPNP metadata records external portal references only. Regulatory Reviews record a human conclusion against dated Source records rather than permanent ingredient legality.

Compliance Documents are relational metadata records. A separate storage adapter puts binaries in the private `compliance-documents` bucket, downloads them through authenticated requests, and retains version/lifecycle metadata without storing Base64 data or public URLs.

Launch Plans consume dossier blockers but remain operational project records. Compliance blockers and commercial milestones are separate. Go/No-Go decisions are append-only internal business records preserving unresolved blockers at decision time. Minimal undesirable-effect records document escalation without automatic medical classification.

Persistence advances from workspace v8 to v9. The explicit Phase 6 migration preserves all earlier collections and adds empty Compliance and Launch collections without seeding existing user workspaces.

## Phase 8 — Platform and Data Foundation

Configured deployments use Supabase Auth, owner-scoped Postgres records, and a private Storage bucket. UI components depend on repository and storage boundaries rather than low-level Supabase calls. Auth session resolution gates the application shell; public registration is intentionally absent.

The migration path is older local workspace → retained local migration chain → normalized v9 → dry run → ordered authenticated import → count, ledger, cost, and release-reference reconciliation. local v9 is never automatically deleted.

Supabase schema history lives in `supabase/migrations`. RLS uses `auth.uid()` ownership on workspaces, records, migration history, document metadata, and Storage paths. Complex workflow immutability remains enforced by tested domain actions; database ownership, uniqueness, and structural checks provide defense in depth.

Phase 8B.1 adds the final relational destination independently of application cutover. Fifty v9 collections map to explicit domain tables and five normalized child/join tables. An authenticated `security invoker` RPC performs all-or-nothing import, and relational read-back feeds the existing pure reconciliation logic. localStorage intentionally remains runtime-authoritative until the later application-action refactor; the generic compatibility table receives no new relational imports.

Phase 8B.2 routes persistent provider commands through a persistence-confirmed action executor and a session-selected repository. Phase 8B.3A expands the inventory to 66 commands with Compliance Document metadata actions, adds private versioned Storage, and makes startup authority explicit. The Local adapter remains the development default. `VITE_WORKSPACE_REPOSITORY=supabase` requires Auth plus an activated workspace and hydrates all relational state before mounting the provider; loading/failure never falls back to Local. RLS is owner-scoped across roots and children, Storage paths begin with `auth.uid()`, and security-definer lifecycle RPCs revalidate ownership and relationships. Live two-user tests prove anonymous/cross-owner denial, legitimate owner workflows, RPC boundaries, and private file isolation.
