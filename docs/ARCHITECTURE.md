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

Static reference fixtures remain direct imports. The functional Product and Formula system uses a `FormulaDataProvider` backed by a small `FormulaRepository` contract. `LocalFormulaRepository` stores one versioned aggregate in browser local storage, seeds it only when no saved data exists, and keeps storage calls outside UI components. User-created state therefore survives refreshes without being overwritten by seed changes.

Formula calculations and lifecycle rules live in pure domain utilities. Percentage totals use bounded decimal rounding, scaling derives gram weights without mutating percentages, status transitions are explicit, and duplication produces a new Draft with new version and line IDs.

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
