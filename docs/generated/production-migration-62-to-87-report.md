# Controlled production migration 62 → 87

Date: 2026-07-30
Disposition: **PASS**

## Scope

- Production project: `fetmeynkvylznapdikht` (`eu-west-1`)
- Repository commit: `2e0f0adf54ae5fff0a37960b21da65601573234c`
- Rehearsal project used for comparison only: `sudsujokeccipbigfcgq`
- Supabase CLI: `2.109.1`
- Canonical tree: 87 immutable migrations
- Production transition: exactly 62 → 87; no prefix replay and no history repair

## Backup gate

The latest completed physical production backup was `2026-07-30T04:17:57.342Z`.
It was eligible for restore-to-new-project, and the same physical backup had
already restored successfully to the isolated RC2 project with the production
Auth user, identity, workspace, and data intact.

## Execution

`supabase db push --linked --yes` applied only the 25 versions from
`20260727120000` through `20260729160000`, in repository order. The command
completed without a reported error in 5.78 seconds elapsed (0.55 seconds user,
0.22 seconds system).

The production migration ledger now contains 87 versions. Its normalized
statement digests exactly match RC2:

- immutable 62-version prefix: `7fa82287f72399bca1c5b8c5eb070c56`
- strict 25-version suffix: `dd930399754eb6f8ec8f64cec031b396`
- complete 87-version history: `f1d3a1e31d171120d1e1f7b01bf7ea71`

## Reconciliation

Production and RC2 match exactly for the following public-schema inventory:

| Object class | Count | Stable digest |
| --- | ---: | --- |
| Tables | 198 | `7ad992…` |
| Columns | 3,834 | `e7af4c…` |
| Constraints | 1,966 | `d2e9e0…` |
| Functions | 206 | `399d47…` |
| Policies | 186 | `9dc265…` |
| Triggers | 59 | `780413…` |
| Indexes | 637 | `57ab05…` |
| Table grants | — | `29d6ce…` |
| Routine grants | — | `f7e14c…` |
| Tracked comments | 27 | `a83482f40f197f02e5f9db22bf5f7f17` |

Comment reconciliation uses stable object identity rather than PostgreSQL OIDs.
Required procurement, supplier-document, and recall-readiness objects exist.
The recall RPC is callable with no supplied arguments because all three declared
arguments have defaults.

## Authority, privileges, and advisors

The migration, schema, authority, privilege, deployment-preparation, merge,
documentation, secrets, restore-readiness, Cloudflare-readiness, TypeScript,
and production-build audits passed. Authority counts were 198 tables, 206
functions, 59 triggers, 186 policies, 637 indexes, and 625 foreign keys.

Security and performance advisor categories reconcile with the RC2 baseline:
intentional deny-all internal tables without policies, reviewed authenticated
security-definer business RPCs, disabled leaked-password protection, unindexed
foreign-key recommendations, newly created/unused-index observations, and the
Auth connection-strategy advisory. Exact schema, policy, function-body, and
grant parity showed no unexpected production drift.

## Auth and data preservation

Before and after migration, production retained exactly one Auth user, one Auth
identity, and one workspace. Authoritative domain counts were unchanged:
4 products, 10 ingredients, 58 suppliers, 3 formula versions, and zero lab
batches, inventory lots, inventory movements, or production runs.

No production Auth configuration, Auth user, Storage object, Cloudflare
configuration, or frontend deployment was changed.

## Application smoke and logs

The deployed application bundle contains the production project ref exactly
once and contains neither the RC2 nor RC1 ref. The existing production owner
completed an authenticated, no-write smoke across all 16 principal routes.
Every route hydrated without missing-table, missing-RPC, schema-cache, Auth,
permission, or load errors. Browser error and warning logs were empty.

The smoke was intentionally read-only because a write was not required to prove
the migration. Post-smoke migration, data, fixture, and lock counts were
unchanged. API Gateway and PostgreSQL error filters returned no results. One
transient Auth `/user` request returned `context canceled` during repeated hard
navigations; subsequent authenticated routes and the final Auth error filter
passed, so it was classified as non-material rather than concealed.

## Cleanup and recovery

No production fixture was created, so no cleanup mutation was necessary.
Fixture-pattern rows and waiting locks were both zero. Production and RC2 ended
`ACTIVE_HEALTHY`; RC2 was not modified.

The approved recovery posture remains forward-fix only: preserve the canonical
migration ledger, diagnose any future failure from logs and object state, and
ship a new reviewed migration. Do not replay, delete, or repair recorded
versions and do not reset authoritative production data.
