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

## Intended Supabase integration

When Supabase persistence is introduced, evolve the existing boundary into repositories grouped around domain use cases rather than mirroring database tables. Supabase adapters will map database rows into domain types while the current local adapter can remain useful for isolated development.

The planned boundary is:

`Feature UI → domain hook/use case → repository interface → mock or Supabase adapter`

Supabase will eventually provide:

- PostgreSQL for structured domain records and relationships.
- Authentication for the single owner account.
- Storage for batch photos, supplier documents, artwork, and compliance files.
- Row Level Security so all records and storage references remain private to the owner.

Backend clients, generated database types, and query details should remain in an infrastructure area and should not leak into feature components. Database schema and migration design are deliberately deferred.

## UI approach

The visual system uses shared CSS tokens and purposeful components rather than a third-party component kit. The dense sidebar supports the breadth of the operating system; content remains calm and tactile. Scent House intentionally shifts into a darker, more atmospheric workspace while retaining shared navigation and interaction conventions.
## Phase 5 — Production and Costing

Production is a separate feature boundary from Lab. A `ProductionRun` references one exact Approved `FormulaVersion`, snapshots formula lines and process instructions, and never mutates its source. Planned runs are editable; starting fixes the source; Completed and Archived execution is effectively read-only. Aborted records retain all work and committed movements.

Inventory remains ledger-led. Lot selection, allocation, and weigh-in do not affect stock. `Commit Production Consumption` appends `Consumption` movements with `referenceType: ProductionRun`; allocations retain movement IDs and acquisition unit-cost/currency snapshots. Duplicate commitment is rejected, and corrections remain explicit Adjustment movements.

Costing logic is pure and React-independent in `features/costing/domain`. NOK is the workspace base currency. Estimated formula costs first use a remaining-quantity-weighted unit cost across compatible Active, non-expired, positive-balance NOK lots with acquisition cost; if none qualify, they use a compatible preferred Supplier Product reference in NOK. Otherwise cost is Unknown and coverage is reduced. Actual material cost remains independent and uses only committed allocation snapshots, so later lot metadata, supplier prices, and receipts cannot rewrite Production history.

Local persistence advances from workspace v6 to v7. The explicit Phase 4 migration preserves every existing Phase 1–4 collection and adds empty Production and Costing collections; it never introduces seed records into an existing workspace.
