# Production Procurement Draft Plan Authoring Migration V1 — 2026-08-01

## Result

**BLOCKED — the production migration was not attempted.**

The required pre-mutation review reproduced authority and data-integrity
failures in the pending migration. An authenticated owner can submit SQL `NULL`
for the basket aggregate or omit a basket's `lines` key and receive a successful
Draft-plan receipt even though the persisted aggregate has no dependent lines.
The new budget and range checks also accept one-sided `NULL` pairs. Applying the
reviewed checksum would therefore fail the requested complete Draft Purchase
Plan authority model.

Production remains at 90 migrations with head `20260731044225`. The target
migration is absent remotely. No production schema or business-data write was
made, and the repository-controlled apply command was never invoked.

## Repository and target

- Required branch: `ops/apply-procurement-draft-plan-authoring-v1`
- Starting HEAD: `70d64352a83c77e90e8321049665435639e5b52e`
- Fetched `origin/main`: `70d64352a83c77e90e8321049665435639e5b52e`
- Starting ahead/behind relative to `origin/main`: `0 / 0`
- Starting working tree: clean
- Evidence commit: the commit containing this file; resolve dynamically to
  avoid a self-referential hash
- Canonical production project: `fetm…dikht` (`Koalafrog HQ`, redacted)
- Project state at reconciliation: `ACTIVE_HEALTHY`
- Region: `eu-west-1`
- Linked project, configured application URL, and the explicit Supabase
  workspace repository selection matched the canonical production project
- Supabase CLI: `2.109.1` (the CLI reported that `2.111.0` was available)
- Existing deployed frontend inspected:
  `https://koalafrog-hq.pages.dev`

No key, token, connection string, service-role credential, Auth identifier,
workspace identifier, owner identifier, or stash content is recorded here.
Service-role access, privileged production SQL, Dashboard SQL, migration repair,
and production reset were not used.

## Backup gate

The authenticated production Dashboard showed the newest scheduled physical
backup as a completed/listed backup with an available Restore action:

- Timestamp: `2026-08-01 04:18:32 UTC`
- Physical backup: listed with Restore available
- Restore to New Project: available as a separate Beta action
- Older completed physical backups: present

Recovery procedure: open the production project, go to Database → Backups,
select the `2026-08-01 04:18:32 UTC` physical backup, and choose Restore to New
Project. Validate the restored migration history, Auth ownership, workspace
identity, and business counts before considering any cutover. Database backup
recovery does not restore Storage object binaries; those require the separately
controlled private-object recovery process. No restore action was started.

Because the authority defect triggered the mandatory pre-mutation stop, the
full Phase 2 Auth-user, identity, workspace, and business-record fingerprint
capture was not completed or claimed.

## Strict-suffix reconciliation

Before the stop:

- Repository migrations: 91 unique ordered versions
- Repository head: `20260731205657`
- Production migrations: 90 ordered versions
- Production head: `20260731044225`
- Remote-only migrations: none
- History divergence: none
- Previously applied migration changes: none
- Pending migrations: exactly one local-only suffix

The sole pending file was:

`supabase/migrations/20260731205657_procurement_draft_plan_authoring_v1.sql`

- Version: `20260731205657`
- SHA-256:
  `4d0ccac05c14f7adef6f25e8649bc9de0f2dedb0ff79d563fb0afc967ede286a`
- Generated rehearsal-manifest source hash: exact match
- Tracked on fetched `origin/main`: yes

The linked CLI migration list paired every local and remote version through
`20260731044225`, then showed only `20260731205657` as local-only. The dry run:

```text
npx --no-install supabase db push --linked --dry-run
```

listed only the target file. Comparing `supabase/migrations` with the previously
attested 90-migration repository state at
`49eb27860e5f064cf3ee4c7d754b8d77514c4287` showed exactly one addition: the
target file. Excluding that file produced an empty diff, proving the first 90
migration sources were unchanged.

The migration was therefore an exact strict suffix. The later stop was caused
by the migration's authority semantics, not history drift.

## Migration surface and risk review

The target creates no table and performs no business-data backfill. It changes:

- `purchase_plans`: 11 Draft authority, budget/range, evidence, and version
  columns plus six checks;
- `purchase_plan_baskets`: six planning totals become nullable, four columns
  are added, and two non-negative checks are added;
- `purchase_plan_lines`: six source/evidence columns, a source-kind check, and
  a composite Packaging Component foreign key are added;
- functions: `kf_draft_optional_numeric_v1`,
  `kf_draft_plan_receipt_bundle_v1`, and
  `create_draft_purchase_plan_v1` are created;
- policy/privileges: the legacy plan-header INSERT policy is dropped and
  authenticated INSERT is revoked from plans and lines.

All three functions use a fixed empty `search_path`. The aggregate creation RPC
is `SECURITY DEFINER`, derives its actor from `auth.uid()`, requires that actor's
active owned workspace, accepts only typed JSON/UUID arguments, revokes execute
from `PUBLIC` and `anon`, and grants execute explicitly to `authenticated`. Its
mainline source checks scope Suppliers and dependent source records to the owner
workspace. It contains no dynamic SQL and no table/schema-name input.

The mainline insert path creates only a Draft plan, its baskets, and its lines.
It does not insert Purchase Orders, external carts, scenario rounds or mappings,
scenario publications, recommendations, verification-required plans, inventory
lots or movements, receipts, or ownership records. Scenario approval remains a
separate route.

The constant non-null defaults are expected to be metadata-fast on the target
PostgreSQL generation, but `ALTER TABLE`, constraint validation, and the new
foreign key still require ordinary catalogue/table locks. The new Packaging
foreign key is not accompanied by a referencing-column index. Production's
requested baseline of zero plans, baskets, and lines bounds relation-scan risk,
but it does not mitigate the authority defects below.

There is no down migration. Once invalid Draft aggregates exist, dropping the
new surface cannot reconstruct the missing baskets/lines. Recovery must use a
reviewed forward fix or, if a real production mutation warrants restoration,
the controlled physical-backup process.

## Blocking authority and integrity findings

### 1. SQL `NULL` bypasses the required-baskets guard

The guard evaluates:

```sql
if jsonb_typeof(candidate_baskets) <> 'array'
  or jsonb_array_length(candidate_baskets) = 0 then
```

For SQL `NULL`, both predicates are `NULL`, so PL/pgSQL does not enter the `IF`.
The JSON iterators then yield no rows. Because the prior schema permits nullable
aggregate counts, the plan INSERT succeeds with no baskets or lines.

A rollback-only local probe executed as an authenticated actor returned:

```json
{"case":"sql_null_baskets","operation":"created","lineReceipts":0,"basketReceipts":0}
```

### 2. A basket without `lines` bypasses both line guards

Both validation passes use the same nullable predicate shape:

```sql
if jsonb_typeof(basket->'lines') <> 'array'
  or jsonb_array_length(basket->'lines') = 0 then
```

When the key is absent, the predicate is `NULL`, the guard is skipped, and the
line iterator yields no rows. The local authenticated probe returned:

```json
{"case":"missing_lines_key","operation":"created","lineReceipts":0,"basketReceipts":1}
```

Inside the same transaction, readback showed two created plan headers, one
basket, and zero lines. The transaction was rolled back, so no local fixture was
retained.

### 3. The new paired-value checks accept one-sided `NULL`

PostgreSQL CHECK constraints pass when their expression is `TRUE` or `NULL`.
Each new budget/range check uses an `OR` expression that becomes `NULL` for a
one-sided pair. In the rollback-only local probe, all of these updates were
accepted:

- `target_budget = 100`, `absolute_stop = NULL`;
- `credible_range_minimum = 50`, `credible_range_maximum = NULL`;
- `worst_credible_range_minimum = NULL`,
  `worst_credible_range_maximum = 75`.

The RPC rejects such pairs on its intended mainline, but table integrity must
remain true independently of a single writer.

### 4. The authenticated table ACL is not least-privilege clean

Local post-migration ACL inspection showed `authenticated` still holding
`TRUNCATE`, `REFERENCES`, and `TRIGGER` on `purchase_plans` and
`purchase_plan_lines`, plus SELECT. The target revokes only INSERT from those
tables. RLS does not govern `TRUNCATE`; even where the browser API does not
expose a direct endpoint for that operation, the required privilege audit
cannot pass this authority state.

### 5. Normalized Draft-title identity is raceable

The RPC checks `lower(trim(title))` before INSERT, but no unique constraint or
title-scoped lock backs the check. The advisory transaction lock is keyed only
by idempotency key. Two concurrent requests with different keys and the same
normalized title can both pass the pre-check and create duplicates.

Any one of findings 1–4 is sufficient to stop the production apply. Findings 1
and 2 were reproduced through the exact migration, exact RPC, and authenticated
role semantics rather than inferred only from static SQL.

## Production execution state

The authorized mutation command would have been the repository-controlled
linked workflow, but it was deliberately not run. Therefore:

- Apply command: **NOT INVOKED**
- Apply start/finish: not applicable
- Duration: not applicable
- Transaction result: no production transaction started
- Retry count: zero
- Applied migration: none
- Migration repair/manual SQL: none
- Final production migration count: 90
- Final production head: `20260731044225`
- Target present remotely: no

The final connector migration read repeated the same 90-version history after
the local probes. Production was never in an ambiguous apply state.

## Production business baseline and no-side-effect state

The authorized request supplied this expected production baseline:

| Record class | Expected before | Independently observed before stop |
| --- | ---: | --- |
| Ingredient masters | 18 | 18 |
| Suppliers | 58 | 58 |
| Supplier Products | 22 | Not completed after stop |
| Equipment | 3 | 3 |
| Packaging Components | 9 | 9 |
| Procurement Requests | 26 | 26 |
| Procurement Requested Items | 45 | Not completed after stop |
| Raw-material inventory lots | 0 | 0 |
| Packaging inventory lots | 0 | 0 |
| Internal Purchase Plans | 0 | 0 |
| Purchase Orders | 0 | 0 |
| Procurement Recommendations | 0 | Not completed after stop |

The deployed owner application also showed no internal plans and no Purchase
Orders. No complete after-count comparison, Auth count, identity count, or
workspace fingerprint is claimed because the pre-mutation authority stop made
the later phases inapplicable. The important side-effect result is stronger and
direct: no production mutation command or business form submission occurred.

No Draft plan, Packaging update, Supplier, Supplier Product, Offer,
Recommendation, basket, line, order, inventory lot/movement, receipt, ownership
record, Auth record, Storage object, environment variable, Cloudflare resource,
or deployment was created or changed by this task.

## Deployed application read-only verification

The existing production deployment was inspected through the authenticated
owner session; no deployment was triggered.

Platform Foundation reported:

- Actual migration count: 90
- Expected migration count: 91
- Actual migration head: `20260731044225`
- Expected migration head: `20260731205657`
- State: `Mismatch — production operations blocked`
- Final evaluation: `2026-08-01T04:34:00.431721+00:00`
- Browser warning/error logs on final read: zero

The Procurement route exposes separate Draft Plan Builder and Production
readiness workflows. The Builder loaded and displayed the read-only wording
“Draft only — does not place an order.” The persisted detail page contains the
remaining `Draft`, `Unplaced`, and `Not authorised for ordering` status copy,
but production has zero plans and this task prohibited creating one. Those
detail-only strings therefore could not be truthfully verified through a
persisted production record. A read-only preview correctly failed while the
target RPC/schema expansion remained absent.

Repository contract review found Packaging persistence awaited, followed by
owner-scoped readback and a typed UPDATE receipt whose record ID is checked
against the persisted component. Failure preserves the open form and does not
emit success. A production Packaging update was prohibited and was not used to
exercise that contract.

## Validation ledger

Completed before the stop or as focused blocker evidence:

- `git fetch origin main`: PASS; branch base matched fetched `origin/main`.
- linked project identity and canonical production URL comparison: PASS.
- `npx --no-install supabase migration list --linked`: PASS; exact 90-version
  prefix plus one local-only target.
- `npx --no-install supabase db push --linked --dry-run`: PASS; only the target
  migration listed.
- migration count, order, checksum, manifest, and prior-prefix source checks:
  PASS.
- completed physical-backup listing and Restore to New Project availability:
  PASS.
- `npm run test:procurement-draft-plan-upgrade`: PASS; exact pre-head reset to
  `20260731044225`, only target applied over preserved fixture, followed by a
  fresh reset through all 91 migrations.
- rollback-only authenticated malformed-aggregate/constraint probe: PASS as a
  test harness; it reproduced the migration failures documented above and then
  rolled back.
- static migration, application-authority, Packaging persistence, and deployed
  read-only route review: completed.
- `npm run test:docs`: PASS; 81 Markdown files, zero findings.
- `npm run test:secrets`: PASS; 796 repository files checked.
- `git diff --check`: PASS before this evidence and repeated before commit.

The following Phase 8 commands were not run after the authority stop and are
not claimed: `npm ci`, full pgTAP, full Supabase integration, final authority
audit, final privilege audit, migration audit, lint, TypeScript, the full
unit/component suite, build, and `deploy:preflight`.
Production cannot receive PASS regardless of those suites while the exact
reviewed migration admits the reproduced invalid aggregates.

## Required forward fix and recovery

Do not apply the current checksum. Produce and review a corrected migration
artifact that, at minimum:

1. rejects `candidate_baskets IS NULL` explicitly before JSON inspection;
2. requires every basket to contain a non-empty JSON array at `lines` using
   explicit `IS NULL`/key-presence guards;
3. rewrites paired-value constraints so exact null-pairing is enforced, for
   example with explicit `IS NULL` equivalence or `num_nonnulls`;
4. revokes broad authenticated table privileges before granting only the
   intended read/write set;
5. serializes or uniquely constrains normalized owner/workspace Draft titles;
6. adds regression coverage for SQL `NULL`, missing keys, one-sided pairs,
   table ACLs, concurrency, exact reuse, and changed-payload conflict.

Because the reviewed file is unapplied, recovery requires no production
restore. The safe next step is a new explicit review and checksum decision for
the unapplied artifact (or a reviewed superseding suffix), followed by a fresh
strict-suffix reconciliation from production head `20260731044225`. Do not use
migration repair or ad hoc production SQL.

## Untouched scope

- Production migration/schema: unchanged at 90 / `20260731044225`
- Production business data: no task write
- Auth and Storage: untouched
- Cloudflare and environment configuration: untouched
- Existing hosted frontend: no deployment
- Repository remote: no push, PR, merge, or deployment
- Procurement Reality Phase 2: not resumed
- Procurement research stash: one pre-existing entry; count and fingerprint
  unchanged, and it was not applied, popped, dropped, rewritten, or restored
