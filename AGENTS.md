# Koalafrog HQ contributor guide

Koalafrog HQ is a private, single-user product development and operations system for building a men's grooming and cosmetics brand. It is an owner-operated workshop tool, not a customer application, public shop, multi-tenant service, or generic SaaS dashboard.

## Architectural principles

- Organise application code by domain feature. Feature pages compose reusable components; they do not own shared layout, domain types, or global data fixtures.
- Keep domain models independent of React and of any persistence vendor.
- Treat formula percentages as canonical and formula versions as immutable after Draft. Candidate, Approved, and Retired compositions may only be changed by deriving a new Draft.
- Ingredient identity is separate from physical inventory. Never restore ingredient-level quantity as a stock truth: derive balances from immutable Inventory Movements grouped by Inventory Lot.
- Historical stock movements are append-only. Corrections use a new Adjustment movement.
- A Formula Version describes intent; a Lab Batch records execution. Never mutate the source Formula Version from a batch, and never consume stock until explicit allocation commit.
- A Production Run is a controlled manufacturing event, never a promoted Lab Batch. New runs require an exact Approved Formula Version, preserve execution snapshots, and create Consumption movements only through explicit production commitment.
- Estimated costs are planning references; actual production material costs come only from committed lot allocations and their acquisition-cost snapshots. Missing cost is Unknown, never zero.
- Packaging Components and Packaging Inventory are separate from raw materials and use their own immutable lot ledger. Packaging Specifications follow Formula-style version immutability.
- Finished Goods are explicit Production output registrations with their own movement ledger. Packaged batches remain quarantined until Packaging Consumption is committed; never infer legal sale readiness from Finished Goods status.
- Compliance Dossiers bind an exact Formula, Packaging, Label, market, and language configuration. Internal readiness and launch decisions are workflow records, never legal compliance, safety assessment, or authority approval.
- Store compliance document metadata and external references locally, never binary files or Base64 blobs. CPSR conclusions and CPNP confirmation require real external evidence metadata.
- Supabase is the durable platform target. Browser code may use only the anon key with Auth and RLS; service-role credentials never enter the frontend. Preserve the v9 local migration source until reconciliation succeeds.
- Completed Lab Batch execution and submitted Test Responses are historical records. Preserve them; add observations or explicit corrections instead of silent rewrites.
- Keep mock data outside UI components and easy to replace with repository/service implementations.
- Prefer small, legible components and explicit data flow over broad abstractions.
- Preserve the premium, experimental “laboratory meets private workshop” character. Use playful Koalafrog touches sparingly.
- Accessibility, responsive behaviour, and useful empty/loading/error states are part of feature completeness.

## Naming and structure

- React components and component files use `PascalCase`.
- Hooks, utilities, data modules, and functions use `camelCase`.
- Domain interfaces use singular nouns (`Product`, `Ingredient`, `Batch`).
- Routes use lowercase kebab-case paths.
- Feature-only code stays in `src/features/<feature>`; shared UI stays in `src/components`; domain contracts stay in `src/types`.

## Future data layer

Supabase is the expected backend for PostgreSQL, authentication, file storage, and Row Level Security. Do not scatter Supabase calls through components. Introduce domain repository interfaces at the boundary when persistence work begins, then provide mock and Supabase implementations. Even though this is a single-user system, authentication and RLS should enforce private ownership at the database boundary.

The pre-Supabase workspace uses a single local repository adapter with explicit schema migration. UI code must access it through the workspace data provider rather than calling browser storage directly.

New features must preserve domain separation and must not turn the product into a generic metric-card dashboard. Operational information should remain concrete, traceable, and connected to product work.
