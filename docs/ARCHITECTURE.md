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

The Phase 3 storage key is `koalafrog-hq:workspace:v4`. If it is absent but the Phase 2 key exists, one explicit migration preserves all Product and Formula collections and adds seeded Phase 3 collections. Seed data is used only for absent Phase 3 collections; existing Phase 2 user work is never overwritten. This is deliberately a small migration path rather than a general migration framework.

Formula calculations and lifecycle rules live in pure domain utilities. Percentage totals use bounded decimal rounding, scaling derives gram weights without mutating percentages, status transitions are explicit, and duplication produces a new Draft with new version and line IDs.

Inventory logic is also pure and tested. Movements are authoritative signed history: Receipt is positive; Consumption, Waste, and Sample are negative; Adjustment accepts an explicit positive or negative correction. Lot and ingredient balances are derived on read. Within a lot, only compatible mass, volume, or count units are accepted. The supported conversions are kg ↔ g and L ↔ ml; density conversion is intentionally absent.

Formula scaling remains planning-only. It reads inventory context for awareness but never creates movements. A future executed Lab Batch may create referenced Consumption movements through an explicit workflow.

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
