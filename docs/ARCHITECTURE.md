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

The current data imports are intentionally direct because the foundation is read-only and local. Components do not contain data fixtures or backend assumptions.

## Intended Supabase integration

When persistence is introduced, add repository contracts grouped around domain use cases rather than database tables. For example, a `ProductRepository` may expose list, get, create, and update operations. A local implementation can preserve fast development while a Supabase implementation maps database rows into domain types.

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
