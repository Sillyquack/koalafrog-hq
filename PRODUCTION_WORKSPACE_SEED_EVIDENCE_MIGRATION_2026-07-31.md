# Production Workspace Seed Evidence Migration — 2026-07-31

## Result

**PASS.**

Production advanced exactly from migration 89 to 90 and all database,
security, business-integrity, owner-readback, download, advisor, log, and local
validation checks completed successfully. The automated production browser
could not give the document clipboard focus, returning
`Document is not focused`, so Copy was completed by a human operator after a
direct user gesture in the focused production tab. The copied content pasted
successfully, parsed as valid JSON with `schemaVersion` 1, and matched the
Preview structure and record counts. Preview and Download also completed, and
the shared allowlisted payload contract was independently verified.

The final clean-tree deploy preflight is run immediately after the single
evidence commit and reported in the task handoff. It cannot be self-recorded
inside the commit whose clean tree it validates.

Workspace Foundation Seed V2 remained stopped. No seed or business write was
performed.

## Repository and target

- Branch: `ops/apply-workspace-seed-evidence-migration`
- Starting HEAD: `18c58e7bfe813c95d362daad4cc0e48986bf816e`
- Local `main`: `18c58e7bfe813c95d362daad4cc0e48986bf816e`
- `origin/main`: `18c58e7bfe813c95d362daad4cc0e48986bf816e`
- Production project: `fetm…dikht` (`Koalafrog HQ`, redacted)
- Verified mutation target: `TARGET_PROJECT_REF=fetmeynkvylznapdikht`
- Linked project ref before mutation: exact match
- Supabase CLI: `2.109.1`
- Hosted frontend used for verification:
  `https://koalafrog-hq.pages.dev`

No key, token, connection string, password hash, Auth identifier, workspace
identifier, or owner identifier is recorded in this document.

## Backup gate

The Supabase production dashboard showed the newest completed scheduled
physical backup:

- Timestamp: `2026-07-30 04:17:57 UTC`
- Type/status: Physical; completed and listed with a Restore action
- Restore to New Project: available as a separate Beta dashboard path
- Older physical backups were also present

Recovery procedure: open the production project’s Database → Backups page,
select the completed `2026-07-30 04:17:57 UTC` physical backup, use Restore to
New Project, and validate the restored migration history, Auth ownership, and
business fingerprints before any cutover decision. Database backups contain
Storage metadata, not Storage objects; object recovery must use the separately
controlled private-object backup process. No restore action was started.

## Strict suffix proof

Before execution:

- Repository migrations: 90 unique ordered versions
- Repository head: `20260731044225`
- Production migrations: 89
- Production head: `20260730154408`
- Production ordered-version fingerprint:
  `6f32cddf39ff7b308a0648dbc5e59aa7`
- Remote-only migrations: none
- History divergence: none
- CLI dry-run pending set: exactly one file

The only pending file was:

`20260731044225_workspace_seed_evidence_surfaces_v1.sql`

- Version: `20260731044225`
- SHA-256:
  `31d1f2f2e18595a9f4b0e09293f46cab721c7ef7b235cff9d539a8575141bd62`
- Repository manifest source hash: exact match
- Introducing commit:
  `42d62e57add2aa07b852c61c8a1f78be88e2de29`
- File diff from merged HEAD: none

The CLI migration list proved that production’s 89 versions were the exact
ordered repository prefix. The dry run printed only the file above.

## Migration risk review

The migration creates or replaces only:

`public.get_platform_migration_status_v1() returns jsonb`

The function:

- accepts no arguments;
- is `STABLE SECURITY DEFINER`;
- has fixed empty `search_path`;
- derives the actor only from `auth.uid()`;
- requires that actor to own an active workspace;
- reads only the protected Supabase migration history;
- returns only `migration_count`, `current_migration_version`, and
  `evaluated_at`;
- revokes all execution from `PUBLIC` and `anon`;
- grants execution explicitly to `authenticated`;
- accepts no schema, table, catalogue, hostname, SQL, or arbitrary input.

Risk assessment:

- Business-data change: none
- Backfill: none
- Existing-row update/delete: none
- Table rewrite: none
- Long table lock: none
- Catalogue exposure: narrow aggregate only
- Rollback policy: restore only through the controlled backup process when
  warranted; otherwise use a reviewed forward-fix migration. No migration
  repair or manual history edit is permitted.

## Pre-migration baseline

| Record class | Before |
| --- | ---: |
| Migrations | 89 |
| Auth users | 1 |
| Auth identities | 1 |
| Workspaces | 1 |
| Ingredient masters | 18 |
| Suppliers | 58 |
| Supplier Products | 12 |
| Equipment | 0 |
| Packaging components | 0 |
| Procurement requests | 23 |
| Raw-material inventory lots | 0 |
| Raw-material inventory movements | 0 |
| Packaging inventory lots | 0 |
| Packaging inventory movements | 0 |

Safe pre-migration fingerprints:

- Auth users: `25d51450a8eb4ea840a08b7842aef75b`
- Auth identities: `3caca1667a05c7fb3b020a67f011249e`
- Workspace: `85a57580b47b8ea4fe2ca80182782fe0`
- Supplier Products: `fc53c3eb10cafa7afc06c0bb45bf063f`
- Procurement requests: `3a32ae006e56b12b1b33ba31e92b8ada`
- Each empty equipment, packaging, lot, and movement collection:
  `d751713988987e9331980363e24189ce`

The target function did not exist before execution.

## Production execution

Exact mutation command:

```text
TARGET_PROJECT_REF=fetmeynkvylznapdikht npx supabase db push --linked --yes
```

- Start: `2026-07-31T05:54:54Z`
- Finish: `2026-07-31T05:54:57Z`
- Elapsed: 3 seconds
- Exit status: 0
- Migration applied:
  `20260731044225_workspace_seed_evidence_surfaces_v1.sql`
- CLI warnings: a newer CLI `2.110.0` was available; no migration warning
- Transaction outcome: command completed successfully
- Retry count: zero

No SQL was pasted into the dashboard. No migration was replayed or repaired.

## Final migration and RPC verification

After execution:

- Production migrations: 90
- Production head: `20260731044225`
- Repository migrations: 90
- Local/remote ordered-version fingerprint:
  `54d07d2dc0d154be063a52b42f404632`
- Final CLI dry run: `Remote database is up to date`
- Remote-only or local-only migration: none
- File/manifest checksum drift: none

Production function metadata:

- Signature: `get_platform_migration_status_v1()`
- Argument count: 0
- Return type: `jsonb`
- Security mode: `SECURITY DEFINER`
- Volatility: stable
- Configuration: empty `search_path`
- `anon` execute: false
- `authenticated` execute: true
- ACL principals: function owner, `authenticated`, and `service_role`; no
  `PUBLIC` or `anon`

Negative checks:

- Anonymous Data API call: HTTP 401, SQLSTATE `42501`, permission denied
- Authenticated actor without an eligible active owner workspace:
  SQLSTATE `P0001`, `ACTIVE_OWNER_WORKSPACE_REQUIRED`
- Cross-workspace data: none returned
- Generic catalogue or arbitrary query surface: absent

Owner-authorized deployed application readback:

- `migration_count`: 90
- `current_migration_version`: `20260731044225`
- Final evaluated time: `2026-07-31T06:16:18.769553+00:00`

## Business and ownership integrity

| Record class | Before | After | Final |
| --- | ---: | ---: | ---: |
| Ingredient masters | 18 | 18 | 18 |
| Suppliers | 58 | 58 | 58 |
| Supplier Products | 12 | 12 | 12 |
| Equipment | 0 | 0 | 0 |
| Packaging components | 0 | 0 | 0 |
| Procurement requests | 23 | 23 | 23 |
| Raw-material inventory lots | 0 | 0 | 0 |
| Raw-material inventory movements | 0 | 0 | 0 |
| Packaging inventory lots | 0 | 0 | 0 |
| Packaging inventory movements | 0 | 0 | 0 |
| Auth users | 1 | 1 | 1 |
| Auth identities | 1 | 1 | 1 |
| Workspaces | 1 | 1 | 1 |

Every safe fingerprint listed in the baseline was identical after migration
and at final readback. This proves no tracked Supplier Product, Equipment,
Packaging, Procurement, inventory, Auth, or workspace row changed. No
ownership state, procurement status, or Supplier Product commercial fact
changed.

## Deployed application

The existing production frontend was used; no deployment was triggered.

Platform Foundation reported:

- Actual migration count: 90
- Actual migration head: `20260731044225`
- Expected application count: 90
- Expected application head: `20260731044225`
- State: Match
- Evaluation timestamp: present
- Missing-function, schema-cache, authorization, and browser-console errors:
  none

Observed application API rows and the successful migration-status RPC targeted
only `fetmeynkvylznapdikht.supabase.co`. No rehearsal ref appeared.

Owner evidence:

- Preview: PASS
- Schema version: 1
- Categories: `supplier_product`, `equipment`, `packaging_component`,
  `procurement_request`, `procurement_requested_item`
- Record count: 60
- Stable internal IDs: explicitly labelled
- Preview payload SHA-256:
  `17320e5adc2d84f87b3b287ac2a400227633e3d0435609022cc5fc8daefc5d13`
- Forbidden credential/Auth/connection field scan: none found
- Download: PASS; deployed success status displayed
- Shared-payload source contract: Preview, Copy, and Download all call the same
  cached `operationEvidenceJson()` result
- Automation Copy attempt: browser limitation observed because the document
  could not receive clipboard focus; the deployed handler returned
  `Document is not focused`
- Human-operated Copy in the focused production tab after a direct user
  gesture: PASS
- Copied payload readback: pasted successfully and independently parsed as
  syntactically valid JSON with `schemaVersion` 1
- Copied and Preview counts matched: 12 Supplier Products, 0 Equipment
  records, 0 Packaging components, 23 Procurement requests, and 25
  Procurement requested items
- Copied payload secret scan: no credentials, access tokens, refresh tokens,
  API keys, Auth internals, or connection strings

The following receipt-capable deployed paths were present and read-only
checked without opening or submitting a create form:

- Ingredient detail → Add supplier product
- Equipment → Add Equipment
- Packaging → Plan Component
- Procurement → New request
- Procurement request detail → Add requested item

## Advisors, lint, and logs

Advisor reconciliation:

- Security findings: 140 before, 141 after
- The only new finding is the expected generic Supabase warning for an
  authenticated `SECURITY DEFINER` RPC:
  `get_platform_migration_status_v1()`
- The warning is intentionally accepted for this narrow owner-gated aggregate
  and is explained by the reviewed migration contract
- No security finding was removed
- Performance findings: 609 before and after; no additions or removals
- Database lint: no unexplained new result

The connector log endpoint temporarily returned `Failed to get project's
logs`, while the authenticated dashboard’s unified log view remained
available. Its last-60-minute error/warning set contained exactly the
intentional negative checks:

- 401 POST to the migration-status RPC from the anonymous denial test
- SQLSTATE `42501` permission denied from that test
- SQLSTATE `P0001` active-owner-workspace required from the unauthorized
  authenticated-actor test

No unrelated migration, Postgres, API, or Auth error was present in the
filtered set. The deployed browser console contained zero log entries and zero
errors.

## Local validation

| Validation | Result |
| --- | --- |
| `npm ci` | PASS; 203 packages installed |
| Fresh local Supabase reset, no seed | PASS through all 90 migrations |
| Focused migration-status pgTAP | PASS, 7 assertions |
| Full pgTAP | PASS, 1,258 assertions in 24 files |
| Supabase integration tests | PASS, exit 0 |
| `npm run audit:authority` | PASS |
| `npm run audit:privileges` | PASS |
| `npm run audit:migrations` | PASS; 90 migrations |
| `npm run test:docs` | PASS; 81 Markdown files, 0 findings |
| `npm run test:secrets` | PASS; 772 files |
| `npm run lint` | PASS |
| `npm test` | PASS; 126 files / 915 tests, 11 files / 55 tests skipped as designed |
| `npm run build` | PASS |

`npm ci` reported the repository’s existing two high-severity dependency
advisories and two unapproved optional install scripts. No dependency was
changed or automatically fixed.

The clean-tree deploy preflight was attempted before the evidence commit. Its
pre-audit checks passed, then its branch-scoped generated audit correctly
required `platform-release-baseline.json` to be regenerated for this branch.
That regenerated evidence is now present. The final preflight is run
immediately after the single focused evidence commit because preflight
intentionally rejects an uncommitted tree; its result is recorded in the final
task handoff. No deployment action is performed by that local preflight.

## Untouched systems

- Workspace Foundation Seed V2: not resumed
- Seed/business writes: zero
- Inventory lots or movements created: zero
- Auth users/configuration changed: zero
- Storage changed: zero
- Cloudflare variables, branches, or configuration changed: zero
- Frontend deployment triggered: zero
- Rehearsal project modified: zero
- Migration repair/history manipulation: zero
- Push, PR, merge, or hosted deployment: zero

## Workspace Foundation Seed V2 resume instruction

Workspace Foundation Seed V2 may resume only in a separate owner-authorized
task on its designated seed branch. Before any seed write:

1. Require production migration count 90, head `20260731044225`, and Platform
   state Match.
2. Repeat the owner-authorized baseline read and require 18 Ingredients, 58
   Suppliers, 12 Supplier Products, 0 Equipment, 0 Packaging components, 23
   Procurement requests, and zero raw-material/packaging lots.
3. Rerun the complete previously approved 53-create reconciliation and stop on
   any count, identity, authority, workspace, CREATE, or UPDATE mismatch.
4. Continue to exclude the Panthenol Ingredient master and Vitamin E Synthetic
   Supplier Product.
5. Resume only through normal owner application pathways, with immediate
   receipt/readback and final idempotency verification.

This evidence is not authorization to resume Seed V2.
