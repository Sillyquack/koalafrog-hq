# Supabase platform migration

Koalafrog normalizes every older local workspace through the retained local migration chain to `koalafrog-hq:workspace:v10`. v9 is hydrated non-destructively with an empty Beard Studio aggregate before controlled remote migration.

## Setup

1. Install the Supabase CLI and Docker.
2. Run `supabase start`, then `supabase db reset` to apply version-controlled migrations.
3. Copy `.env.example` to `.env.local` and use only the local/project URL and browser-safe publishable key. The client temporarily accepts the legacy `VITE_SUPABASE_ANON_KEY` name for existing developer environments, but new configuration should use `VITE_SUPABASE_PUBLISHABLE_KEY`. Keep `VITE_WORKSPACE_REPOSITORY=local` until the cutover checklist passes.
4. Create the single owner in Supabase Auth. Public registration should remain disabled.
5. Open `/platform`, validate the local v9 workspace, review counts and findings, export a rollback backup, then explicitly import.

The Phase 8B.1 import calls an authenticated, transactional relational RPC. A blocking dry-run error prevents import, a populated relational workspace prevents merging, and deferred foreign keys validate the complete graph at commit. Migration and reconciliation reports are retained. Do not delete local v9 after success; removal is a separate explicit owner decision.

Run `npx supabase db reset` to recreate and validate all schema migrations. Local destructive integration tests require `VITE_SUPABASE_TEST_URL`, `VITE_SUPABASE_TEST_ANON_KEY`, and `VITE_SUPABASE_TEST_SERVICE_ROLE_KEY` from `npx supabase status`; never point them at production. See `RELATIONAL_SCHEMA.md` for the table graph and embedded-value decisions.

Normal application mutations are separate from migration. Relational hydration, ordinary entity persistence, normalized child persistence, and audit-critical transactional RPCs use `SupabaseWorkspaceRepository`; normal saves never re-run the v9 import. After successful reconciliation activates the workspace, set `VITE_WORKSPACE_REPOSITORY=supabase` and restart. Repository choice is fixed for that session; no user switch or silent fallback exists.

## Source of truth

Before successful reconciliation, local v9 remains authoritative. After authenticated import and reconciliation, Supabase must become authoritative; local data is retained only as an immutable migration backup or deliberate offline cache. Never operate two independently editable workspaces.

## RLS testing

Run `npm run test:supabase` against local Supabase, never production. The script obtains ephemeral local CLI credentials rather than storing service-role secrets. It verifies anonymous denial, a synthetic second user's isolation across representative roots/children, forged ownership and cross-workspace foreign-key denial, all audit-critical RPC boundaries, owner success paths, and private Storage upload/download/version/removal isolation.

Run `npm run test:secrets` before cutover. It scans tracked and unignored repository files for high-confidence Supabase secret keys, JWTs, and hard-coded password assignments; it complements, rather than replaces, deployment-environment secret management.

## Authentication and isolation model

Koalafrog has no public registration UI. A controlled administrator creates the initial owner in Supabase Auth; the browser receives only the publishable key and the owner signs in through `AuthGate`. Signed-out sessions render no application shell. Session refresh is handled by Supabase Auth and logout clears protected access.

The live two-user matrix covers 35 representative tables: core Product/Formula roots and children; raw Inventory; Lab and normalized Testing answers; Production allocations and Costing; Packaging lots, ledgers, versions, and lines; Finished Goods; Compliance roots plus normalized source/document joins; and Launch plans/decisions. For each boundary, anonymous and User B reads of User A data return no rows, forged ownership/cross-workspace relationships fail, and legitimate User A paths remain usable. The four transactional workflow RPCs separately prove owner success plus anonymous, cross-owner, and forged-ID denial.

The private Storage matrix proves owner upload/download, second-user and anonymous denial, owner-prefixed path enforcement, version supersession, metadata isolation, and explicit removal. Storage metadata remains relational; file bytes remain only in the private bucket.

See `PRODUCTION_CUTOVER.md` for hosted configuration, promotion, rollback, and evidence capture.
