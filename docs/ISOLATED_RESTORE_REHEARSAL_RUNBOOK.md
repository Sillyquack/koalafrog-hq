# Isolated restore rehearsal runbook

The restore target must be an approved disposable hosted project or isolated recovery environment. The live production database is forbidden.

## Target and roles

Record project identity, region, Postgres version, extensions, expected roles, network controls, Auth/Storage limitations, owner, cleanup owner, and expiry. Supabase-managed schemas must be restored only through supported mechanisms; do not overwrite `auth`, `storage`, or `realtime` internals with improvised SQL.

## Restoration order

1. Verify written authorization and unmistakable non-production target.
2. Verify backup checksums and decrypt into a controlled temporary workspace.
3. Establish required extensions and supported platform roles.
4. Restore application schema/grants, then sequences and data using the approved platform method.
5. Reconcile Auth identities without fabricating production users.
6. Restore Storage metadata/policies, then private binaries to exact bucket paths.
7. Restore/verify migration history and pre-migration head.
8. Compare object counts, table counts, selected immutable checksums, authority inventory, grants, and RLS.
9. Run owner-isolation and no-write application smoke.
10. Record discrepancies and decide PASS/BLOCKED before any migration rehearsal.
11. Clean up only the named isolated target after evidence retention approval.

## Limitations and stop conditions

Schema-only success is not disaster-recovery proof. Auth tokens/sessions, managed backup internals, Storage binaries, external provider settings, DNS, and secrets require their own reconciliation.

Stop for a live/ambiguous target, unsupported role ownership, missing extension, restore error, FK/sequence mismatch, row/checksum mismatch, incomplete Auth or Storage evidence, disabled RLS, privilege drift, or inability to reproduce the application.

Use [restore reconciliation template](templates/restore-reconciliation-evidence.json). Never populate repository templates with invented hosted results.
