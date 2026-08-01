# Production Procurement Commercial Provenance Authoring Migration — 2026-08-01

## Result

**PASS — production advanced exactly from migration 91 to migration 92.**

The repository-controlled Supabase workflow applied only
`20260801085016_procurement_commercial_provenance_authoring_v1.sql` to the
canonical Koalafrog HQ production project. The linked CLI completed with exit
code `0`, production history independently read back all 92 repository versions
in exact order, and the already-deployed Platform page changed from the expected
`Mismatch` to `Match` without a code deployment.

All 13 required business counts remained at their approved baselines. Their
server-side row fingerprints also matched before the migration, immediately
after it, and after read-only Supplier and Offer authoring inspection. Neither
form was submitted and no production business record was written.

Procurement Reality Phase 2 remains paused. None of its 34 approved operations
was executed or prepared. No git stash command was run during this operation.

## Authorization, repository, and target

- Authorization: the production-operation request that initiated this task,
  limited to the one named schema migration and the evidence-only commit
- Operator: Codex, acting within that request's gate and stop conditions
- Controlled operation window recorded here:
  `2026-08-01T10:53:14Z` through `2026-08-01T11:21:10Z`
- Required branch:
  `ops/apply-procurement-commercial-provenance-authoring-v1`
- Pre-evidence HEAD:
  `976a903e9647f7f498d94ead865cef0d440fe492`
- Required implementation ancestor:
  `df12f0b38b4b1fa3d44e5ef595e09ce12e37d058` — present
- Diff from the implementation commit to pre-evidence HEAD: empty
- Starting working tree and index: clean
- Canonical production project: `fetm…dikht` (`Koalafrog HQ`, redacted)
- Region: `eu-west-1`
- Project health before and after: `ACTIVE_HEALTHY`
- PostgreSQL: `17.6.1.141`
- Existing deployed frontend: `https://koalafrog-hq.pages.dev`
- Lockfile-installed Supabase CLI: `2.109.1`

The local linked-project files, application Supabase hostname, fresh connector
enumeration, prior production evidence, and authenticated Dashboard all
identified the same project. The connector also distinguished the production
project from the persistent rehearsal and unrelated accessible projects.

The repository production-migration runbooks, deployment approval model,
command catalogue, rollback/forward-fix guidance, and the latest successful
90→91 evidence were reviewed before the apply. Current official CLI help and
the Supabase CLI changelog exposed no relevant breaking change to the linked
`migration list` or `db push --dry-run` workflow. No relink was performed.

No access token, database password, publishable or service-role key, connection
string, Auth identifier, workspace identifier, owner identifier, production row
content, or sensitive backup material is recorded here.

## Backup gate

The authenticated production Dashboard showed the newest listed scheduled
backup with the recovery control required by the established Koalafrog rule:

- Listed timestamp: `2026-08-01 04:18:32 UTC`
- Type: `PHYSICAL`
- Restore action: available
- Restore to New Project: available as a separate Beta workflow
- Older physical backups: present
- Age at apply start: `6h 38m 32.172s`

The Dashboard did not expose a separate completion timestamp or opaque backup
identifier. Its completed/listed presence together with the enabled Restore
action is the repository's established completion signal; the runbooks define
no numeric maximum age. No restore control was clicked. The Dashboard also
states that database backup recovery does not restore Storage object binaries,
so private Storage recovery remains a separate controlled procedure.

## Repository migration and SQL audit

Immediately before production mutation:

- Repository migrations: `92`
- Repository head: `20260801085016`
- Exact target filename occurrences in the canonical migration directory: `1`
- Exact target filename occurrences repository-wide: `1`
- Duplicate versions: `0`
- Later versions: `0`
- Malformed version prefixes: `0`
- Target SHA-256:
  `f6217b080703bdd6f9d3ef26c044474e7e595c762c6f92dd2b2af4aaa180d5e7`

The checksum was repeated immediately before apply, after the complete local
validation, and before evidence staging; every result was identical.

The SQL audit found no `INSERT`, `UPDATE`, `DELETE`, `MERGE`, `COPY`, upsert,
`TRUNCATE`, seed, `CALL`, or `PERFORM`. Its opening `DO` block performs only
read consistency checks and raises on invalid pre-existing relationships. The
migration is limited to commercial-provenance authority and identity:

- packaging Supplier Product workspace/owner and Supplier identity integrity;
- raw-material and packaging Supplier Product source uniqueness;
- generated Offer source-routing columns, paired-source constraints, foreign
  keys, and indexes;
- a `SECURITY INVOKER` source-usability validator and its trigger; and
- comments documenting the contracts.

No table, schema, column, or business record is dropped. The only `DROP` is the
existing Packaging Supplier Product owner policy, immediately replaced by the
stricter workspace-aware policy. Ordinary `ALTER TABLE`, constraint validation,
index creation, trigger replacement, and policy replacement can take PostgreSQL
locks; no opportunistic schema change or repair was added to address that
normal migration risk.

## Exact 91 → 92 prefix proof and dry run

The deterministic machine comparison before apply proved:

- Production migrations: `91`
- Production head: `20260731205657`
- Shared ordered prefix: all first 91 repository versions, exact and complete
- Missing version inside the shared prefix: none
- Remote-only version: none
- Reordered or duplicate version: none
- Local-only suffix: exactly `20260801085016`

The linked dry run exited `0` and listed only:

```text
20260801085016_procurement_commercial_provenance_authoring_v1.sql
```

It proposed no seed, repair, reset, history rewrite, schema pull, or other
migration.

## Production baseline

The existing production application reported the expected pre-migration state:

- Platform state: `Mismatch — production operations blocked`
- Actual migration count/head: `91` / `20260731205657`
- Expected application count/head: `92` / `20260801085016`
- Evaluated at: `2026-08-01T10:53:14.497178+00:00`

The direct production comparison ran inside `BEGIN TRANSACTION READ ONLY` and
returned only counts plus SHA-256 row digests. The first mapping attempt named a
non-existent `public.equipment` table; PostgreSQL rejected that read-only query
before returning data. The generated schema identified the canonical table as
`public.equipment_items`, and the successful query at
`2026-08-01T10:54:37.863Z` used the following fixed mapping:

| Evidence entity | Canonical table |
| --- | --- |
| Ingredients | `public.ingredients` |
| Suppliers | `public.suppliers` |
| Supplier Products | `public.supplier_products` |
| Equipment | `public.equipment_items` |
| Packaging Components | `public.packaging_components` |
| Procurement Requests | `public.procurement_requests` |
| Procurement Requested Items | `public.procurement_requested_items` |
| Procurement Offers | `public.procurement_supplier_offers` |
| Procurement Recommendations | `public.procurement_recommendations` |
| Raw-material inventory lots | `public.inventory_lots` |
| Packaging inventory lots | `public.packaging_inventory_lots` |
| Internal Purchase Plans | `public.purchase_plans` |
| Purchase Orders | `public.purchase_orders` |

The rejected table-name attempt made no write. No application route was used to
derive these counts.

## Production execution

```text
apply_start_utc=2026-08-01T10:57:04.172Z
apply_command=npx --no-install supabase db push --linked --yes
apply_finish_utc=2026-08-01T10:57:12.134Z
apply_duration_seconds=7.962
apply_exit_code=0
```

CLI output identified and applied exactly:

```text
Applying migration 20260801085016_procurement_commercial_provenance_authoring_v1.sql...
Finished supabase db push.
```

Transaction result: **committed and unambiguous**. The apply succeeded once;
there was no retry. The only warning was that Supabase CLI `2.111.0` was
available while the repository's installed version was `2.109.1`. There was no
migration, constraint, lock, or SQL warning.

Migration repair, manual SQL, compensating SQL, production reset, rollback, and
restore were not used.

## Final migration history and deployed Platform

The immediate linked history readback and an independent hosted connector
enumeration proved:

- Production migrations: `92`
- Production head: `20260801085016`
- Repository migrations/head: `92` / `20260801085016`
- Complete ordered equality: all 92 versions pair exactly
- Target history occurrences: `1`
- Local-only, remote-only, duplicate, reordered, or extra entries: none

The existing deployed application was hard-refreshed, with no deployment, and
reported:

- Platform state: `Match`
- Actual migration count/head: `92` / `20260801085016`
- Expected application count/head: `92` / `20260801085016`
- Evaluated at: `2026-08-01T10:58:14.808129+00:00`

After the required equality checks had passed, a later redundant repeat of
`db push --linked --dry-run` exited before connecting because the short-lived
CLI context no longer had a management access token. It performed no database
operation, is not used as gate evidence, and was not retried. No token recovery
or project relink was attempted; the successful post-apply linked history and
independent connector equality above remain the required Gate 7 proof.

## Business integrity

The immediate post-apply read-only comparison completed at
`2026-08-01T10:57:55.552Z`. A third comparison ran after both browser checks.
Every count equalled both its approved baseline and the pre-migration result:

| Entity | Before | After | After authoring checks | Delta |
| --- | ---: | ---: | ---: | ---: |
| Ingredients | 18 | 18 | 18 | 0 |
| Suppliers | 58 | 58 | 58 | 0 |
| Supplier Products | 22 | 22 | 22 | 0 |
| Equipment | 3 | 3 | 3 | 0 |
| Packaging Components | 9 | 9 | 9 | 0 |
| Procurement Requests | 26 | 26 | 26 | 0 |
| Procurement Requested Items | 45 | 45 | 45 | 0 |
| Procurement Offers | 55 | 55 | 55 | 0 |
| Procurement Recommendations | 0 | 0 | 0 | 0 |
| Raw-material inventory lots | 0 | 0 | 0 | 0 |
| Packaging inventory lots | 0 | 0 | 0 | 0 |
| Internal Purchase Plans | 0 | 0 | 0 | 0 |
| Purchase Orders | 0 | 0 | 0 | 0 |

The server-side digest aggregated each complete canonical row ordered by stable
`id`. For Offers, the two new generated routing columns were removed from the
JSON before hashing so the same historical business payload could be compared
across the schema change.

| Entity | Stable SHA-256 before/after/UI recheck |
| --- | --- |
| Equipment | `cd3ed768cee8e38b1a158e993c526e4ff99131bb52f8bc90f804bea3ba860585` |
| Ingredients | `d3a5a77b8dbcb93f2fd48062fc53d86ccb64b1b7b2368cdd76778af9a3c31bcd` |
| Internal Purchase Plans | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |
| Packaging Components | `4078dd7f195c54e0c8121a09ad3d68990208e861e0f983ea86f59bb5aedadd91` |
| Packaging inventory lots | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |
| Procurement Offers | `c4a9df2ce91a8a85a53758db4ad2f4d2b1f1eb7bf534966472863a21dbc3ee0c` |
| Procurement Recommendations | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |
| Procurement Requested Items | `bb43b4f713c699c74462ba4c29981561fd1caa5bb775ca1fa346dabd717d0c58` |
| Procurement Requests | `561ba701717bf12ecad84d7bbef7a313b5aa271e1f5af3fa33cd2f30aa25ad1d` |
| Purchase Orders | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |
| Raw-material inventory lots | `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |
| Supplier Products | `681a5cd7dedbdbc7ec537123560a368a2a155a46733cdeea993cfbaf1640ff82` |
| Suppliers | `7c0de88e69bd86fa2520e4dc95d8771eaed66a27e754fc56ad688e126e54495a` |

The repeated counts and digests, together with the migration's no-DML audit,
prove that the permitted schema migration did not create, update, or delete a
required production business record.

## Read-only Supplier authoring verification

Before opening production authoring, source and tests were inspected to prove
that `New supplier` only toggles local React state and that persistence occurs
only inside explicit form submission.

- Surface: deployed `/suppliers`, then `New supplier`
- Observation window:
  `2026-08-01T10:58:51.081Z`–`2026-08-01T10:59:38.969Z`
- Loading: complete; existing Supplier data loaded
- Controls observed: Legal name, Trading name, Supplier type (including
  `printing`), Status, Website, Country, Default currency, Verification state,
  Internal notes, Preferred Supplier, review summary, Cancel, and Create
  supplier
- Defaults observed: `raw_material`, `research`, `unknown`, and not preferred
- Console warnings/errors: none
- Resource observation: authenticated-user and REST hydration resources only;
  no RPC resource appeared
- Form submission: none

No field was typed into, no selector was changed, and neither Cancel nor Create
supplier was clicked.

## Read-only Offer authoring verification

Source and tests likewise proved that `Add offer` only toggles local form state;
Supplier/source selection only changes component state; and Offer persistence
occurs only on explicit submission. A non-active existing request was selected
through the deployed Procurement list without recording its internal identifier
or business content here.

- Surface: deployed `/procurement/<redacted-existing-request>`, then the single
  requested item's `Add offer`
- Observation window:
  `2026-08-01T11:03:15.945Z`–`2026-08-01T11:04:44.703Z`
- Loading: complete; 58 existing Suppliers plus the placeholder loaded in the
  Supplier selector, and raw-material/packaging Supplier Product resources
  hydrated
- Controls observed: Supplier; optional Supplier Product source; Manual Offer;
  Product title and URL; Country; package quantity/unit; item price/currency;
  MOQ; shipping; tax/duty; delivery days; stock; COA, SDS, and technical
  document states; certification claims; first-order discount; date checked;
  confidence; notes; review summary; Cancel; and Confirm and save Offer
- Canonical identity contract: the inspected implementation renders product,
  Supplier, package, domain, stable ID, and SKU for a selected usable source and
  exposes no arbitrary source-ID input. The conditional identity card was not
  activated because the form was intentionally left untouched.
- Console messages: none
- Page-resource inventory before/after opening the form: `122` / `122`; zero
  new resources and no RPC resource
- Form submission: none

No field was typed into, no selector was changed, and neither Cancel nor Confirm
and save Offer was clicked. The final direct count/fingerprint comparison above
then independently proved that neither authoring inspection mutated production
application data.

## Full local validation ledger

All test-fixture writes below were confined to the disposable local Supabase
Docker stack. Commands that use Supabase explicitly selected `--local` or the
repository's loopback-enforcing harness. No validation test targeted production.

| Command / check | Exit | Result |
| --- | ---: | --- |
| `git diff --check` | 0 | PASS before validation and before evidence |
| `npm ci` | 0 | PASS; 203 lockfile packages installed, lockfile unchanged |
| `supabase db reset --local --no-seed` | 0 | PASS; fresh local schema through all 92 migrations |
| `npm run test:procurement-commercial-provenance-upgrade` | 0 | PASS; exact local 91→92 apply, legacy manual/linked Offers preserved, then fresh 92 reset |
| focused commercial-provenance pgTAP | 0 | PASS; 1 file / 45 assertions |
| full `supabase test db --local supabase/tests` | 0 | PASS; 26 files / 1,377 assertions |
| focused migration Vitest | 0 | PASS; 1 file / 4 tests |
| `npm run test:supabase` final run | 0 | PASS; 13 files / 59 integration tests |
| `npm run audit:environment` | 0 | PASS; 22 variables / 92 migrations / 12 commands |
| `npm run audit:authority` | 0 | PASS; 10 artifacts; 199 tables / 213 functions / 72 triggers / 186 policies / 643 indexes / 635 FKs / 17 repositories / 63 routes / 5 providers |
| `npm run audit:privileges` | 0 | PASS; same 10-artifact authority inventory |
| `npm run audit:migrations` | 0 | PASS; 92 migrations |
| `npm run test:docs` | 0 | PASS; 81 Markdown files / 0 findings |
| `npm run test:secrets` before evidence | 0 | PASS; 818 repository files |
| `npm run lint` | 0 | PASS |
| `npx --no-install tsc -b` | 0 | PASS; no diagnostics |
| `npm test` | 0 | PASS; 133 files / 964 tests, with 13 files / 59 separately exercised integration tests skipped in this unit invocation; Cloudflare readiness PASS |
| `npm run test:e2e` | 0 | PASS; desktop 20/20 in 3.2 minutes; local owner cleanup confirmed |
| `npm run test:e2e:mobile` | 0 | PASS; mobile 13/13 at 390×844 in 1.5 minutes; local owner cleanup confirmed |
| `npm run test:accessibility` | 0 | PASS; 6 static-audit surfaces / 0 findings |
| `npm run build` | 0 | PASS; 2,071 modules transformed |
| `npm run preview -- --host 127.0.0.1 --port 4173` plus loopback HTTP check | 0 | PASS; HTTP `200` on exact requested port |
| `npm run deploy:preflight` | 0 | PASS; `localOnly: true`, `remoteActionsPerformed: false` |
| `npm run test:secrets` after this evidence file | 0 | PASS; 819 repository files |

The first two complete `npm run test:supabase` attempts exited `1` when the
local gateway returned HTTP `502` for the commercial-provenance test's first
`/rest/v1/ingredients` fixture insert after earlier integration load. The
second assertion then failed only because that setup had not produced its local
requested item. The target integration file passed `3/3` in isolation, and the
schema-specific upgrade and pgTAP suites were already green. Time-bounded local
Kong logs identified the 502 rather than a migration constraint or application
assertion failure.

Only the disposable local Supabase containers were stopped and restarted, with
their local volume preserved and no repository edit. The final unmodified full
integration command then passed all 13 files / 59 tests. The local start noted a
Storage API image-version variance from the linked project; no image upgrade,
link update, or relink was performed. This local service observation did not
touch production and is preserved here rather than omitted.

Initial sandbox attempts to access the local Docker socket or bind a loopback
port were denied before those validations ran. The approved local-only reruns
are the passing results above. `npm ci` warned about two optional `fsevents`
install scripts outside npm's allow-scripts list. Vite repeated the known mixed
dynamic/static Platform import and large main-chunk warnings. None changed a
tracked file or failed its command.

The exact clean-tree `deploy:preflight` repeated environment/tooling tests,
the secret scan, Cloudflare readiness, documentation audit, authority audit,
TypeScript, and the production build, then returned:

```json
{
  "status": "PASS",
  "localOnly": true,
  "remoteActionsPerformed": false
}
```

The documentation audit scans `docs/**/*.md` and therefore does not include
this required root-level report. This report received separate full review,
post-evidence secret scanning, `git diff --check`, and migration checksum
verification before staging.

## Untouched scope and recovery posture

- Production schema: exactly 92 / `20260801085016`
- Production business data: unchanged for every required count and digest
- Supplier form submitted: no
- Offer form submitted: no
- Mutating production RPC invoked: no
- Supplier, Supplier Product, Offer, Recommendation, Packaging Component,
  Ingredient, Equipment, Purchase Plan, Purchase Order, inventory, and other
  business-data writes: none
- Production seed, import, reset, repair, rollback, squash, rebase, schema pull,
  remote commit, drift fix, or compensating migration: none
- Application or Edge Function deployment: none
- Branch push or merge: none
- Git stash command: none
- Procurement Reality Phase 2: paused
- Approved Procurement Reality operations executed: `0 / 34`

The local-only database reset, fixture writes, and container restart described
in the validation ledger are the expressly isolated test environment; they are
not production operations.

If a later defect requires recovery, do not edit migration history or improvise
production SQL. Use a separately reviewed forward migration or the controlled
physical-backup/restore process, with independent migration-history, business
integrity, Auth/workspace, and private-Storage verification.
