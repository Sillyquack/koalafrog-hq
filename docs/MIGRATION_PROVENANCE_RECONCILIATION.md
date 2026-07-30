# Migration Provenance Reconciliation V1

Disposition: **PASS — Strategy B implemented**

This evidence reconciles repository commit `35527eccaf4b85ab290f7d83d1cfde1ee1c6152f`,
production project `fetmeynkvylznapdikht`, and auth-preserving rehearsal project
`jaghoxoaqzpiowzyfcnf`. No hosted write was performed.

The machine-readable evidence is
[`generated/migration-provenance-reconciliation.json`](generated/migration-provenance-reconciliation.json).
It contains the complete ordered repository list and checksums, all hosted
version mappings, parsed object effects, hosted object fingerprints, strategy
assessment, stop conditions, and the next execution plan.

## Provenance conclusion

The first 54 versions match across the repository, production, and rehearsal.
Production migrations 55–62 were created through Supabase's hosted migration
application path: each has a populated `created_by`, one stored SQL statement,
and an execution-time version. Those eight server-side versions never existed
as filenames in reachable Git commits, branches, tags, or reflogs.

Each stored production statement is exactly equal to the correspondingly named
current repository migration after removing only the repository file's final
newline. This is proven by MD5 digest and byte length for every mapping. All
eight are classified `EXACT_EQUIVALENT_DIFFERENT_VERSION`.

The rehearsal preserves production's exact 62-version history, then applies the
remaining release work as 25 hosted, execution-time versions. Their names and
order map one-to-one to the release migrations. The repository represents the
same logical tree using repository-authored timestamps, including two supplier
migrations placed before the eight beard migrations.

## Schema conclusion

Production is the expected pre-release schema, not a production-only fork.
The rehearsal adds the cumulative effects of the 25 release migrations:
procurement and purchase-order control, receiving and quality release,
production inventory, packaging, finished-goods control, genealogy,
traceability, recall readiness, and authority hardening.

The manifest separates created and altered tables, functions, policies,
indexes, triggers, constraints, grants, DML-bearing migrations, and security
differences. It records category counts and fingerprints for both hosted
projects. Production has no identified object absent from the rehearsal.

The current repository resets to exactly the rehearsal fingerprints for tables
and RLS state, columns, constraints, functions, indexes, policies, and triggers.
Hosted aggregate grant fingerprints differ from local because hosted
platform/default privilege materialization applies to newly created objects.
Accordingly, the hosted rehearsal—not local aggregate grant counts—is the
authority target for the next hosted clone.

## Canonical strategy

Strategy B is implemented as a filename-only canonicalization on the focused
reconciliation branch. The eight proven production versions are now the
repository's migrations 55–62. `supplier_documentation` is retimestamped to
`20260727120000` and `supplier_history_reliability` to `20260727121000`; the
other 23 release migrations retain their relative order. All SQL bodies remain
byte-identical, including their original final-newline state.

This produces a truthful 62-version production prefix and strict 25-migration
suffix. It avoids duplicate DDL, no-op markers, migration repair, and permanent
dependence on an out-of-band application path.

The canonical tree now has the truthful 62-version production prefix and a
strict 25-migration suffix. Before production execution:

1. Capture a current physical production backup.
2. Create a fresh auth-preserving clone from production.
3. Require migration dry-run to show exactly the canonical 25-file suffix.
4. Rehearse that exact suffix on the fresh clone.
5. Require final schema and authority fingerprints to match the existing
   87-migration rehearsal.
6. Apply only that reviewed suffix to production.

## Implementation validation

- Before and after migration counts: 87 → 87.
- Files renamed: 10; files added or deleted: 0.
- SQL checksum changes by semantic migration name: 0.
- Fresh local reset: PASS.
- Tables, columns, constraints, functions, indexes, policies, triggers, and RLS
  fingerprints: identical to the canonical rehearsal evidence.
- Grants: PASS; the regenerated authority inventory is object-for-object
  unchanged apart from its migration-path-derived source hash.
- Tracked comments: PASS; unchanged SQL checksums prove all `COMMENT`
  statements remain byte-identical.

The existing rehearsal remains valid as the semantic target, but a fresh clone
is required to prove the canonical execution path from production's truthful
62-row history.
