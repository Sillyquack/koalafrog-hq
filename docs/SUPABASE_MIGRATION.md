# Supabase platform migration

Koalafrog normalizes every older local workspace through the retained local migration chain to `koalafrog-hq:workspace:v9`. Only v9 is eligible for remote dry-run validation.

## Setup

1. Install the Supabase CLI and Docker.
2. Run `supabase start`, then `supabase db reset` to apply version-controlled migrations.
3. Copy `.env.example` to `.env.local` and use only the local/project URL and browser-safe publishable key. The client temporarily accepts the legacy `VITE_SUPABASE_ANON_KEY` name for existing developer environments, but new configuration should use `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Create the single owner in Supabase Auth. Public registration should remain disabled.
5. Open `/platform`, validate the local v9 workspace, review counts and findings, export a rollback backup, then explicitly import.

The Phase 8B.1 import calls an authenticated, transactional relational RPC. A blocking dry-run error prevents import, a populated relational workspace prevents merging, and deferred foreign keys validate the complete graph at commit. Migration and reconciliation reports are retained. Do not delete local v9 after success; removal is a separate explicit owner decision.

Run `npx supabase db reset` to recreate and validate all schema migrations. Local destructive integration tests require `VITE_SUPABASE_TEST_URL`, `VITE_SUPABASE_TEST_ANON_KEY`, and `VITE_SUPABASE_TEST_SERVICE_ROLE_KEY` from `npx supabase status`; never point them at production. See `RELATIONAL_SCHEMA.md` for the table graph and embedded-value decisions.

## Source of truth

Before successful reconciliation, local v9 remains authoritative. After authenticated import and reconciliation, Supabase must become authoritative; local data is retained only as an immutable migration backup or deliberate offline cache. Never operate two independently editable workspaces.

## RLS testing

Run SQL policy tests against local Supabase, never production. Verify anonymous denial, owner access, synthetic second-user isolation, forged-owner insert denial, and private Storage denial. The checked-in SQL establishes owner-scoped policies, but live verification requires a configured local Supabase runtime and synthetic JWTs.
