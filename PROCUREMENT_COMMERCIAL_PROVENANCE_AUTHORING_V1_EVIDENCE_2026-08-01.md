# Procurement Commercial Provenance Authoring V1 — Evidence

Date: 2026-08-01
Branch: `feature/procurement-commercial-provenance-authoring-v1`
Expected commit: `feat: add procurement commercial provenance authoring`
Status: PASS — implementation and complete local validation confirmed

## Scope and environment

This is post-1.0 schema/application capability evidence. It is not Procurement Reality Phase 2 execution evidence.

All fixtures and commands specified here target the disposable local Supabase Docker stack. During implementation, no production or rehearsal project was accessed, no linked or hosted Supabase command was run, and no production data, Auth setting, Storage object, Cloudflare resource, hosted environment variable, deployment, push, PR, merge, Supplier contact, cart, checkout, order, payment, receipt, ownership record, inventory record, or Quality Release was touched.

The Procurement Reality report stashes were listed read-only only to confirm that both entries remained present; they were not inspected, applied, popped, dropped, restored, or modified. The three Procurement Reality reports and Release 1.0 historical evidence were not rewritten.

The production figures supplied as task context remain context only; this task did not connect to production to re-verify them:

- migration count 91 and head `20260731205657` before any future authorised deployment;
- Platform state Match;
- 58 Suppliers, 22 Supplier Products, and 55 Procurement Offers;
- zero Procurement Recommendations, Internal Purchase Plans, Purchase Orders, raw-material inventory lots, and packaging inventory lots.

## Implementation evidence

The branch reuses the existing canonical tables and adds no second Supplier, Supplier Product, or Offer system.

Application contracts under validation provide:

- one complete typed Supplier CREATE with `printing`, safe defaults, nullable unknown facts, review, definitive owner readback, and typed receipt;
- exact duplicate versus normalized conflict handling without auto-merge;
- an optional stable-ID raw-material or packaging Supplier Product selector;
- one typed Offer CREATE with source-domain/ID integrity, owner readback, and typed relationship receipt;
- a visible persisted source identity in the comparison table;
- manual `NULL/NULL` Offer compatibility;
- source-aware CSV export/import with legacy-column compatibility;
- no automatic retry or false receipt on persistence/readback mismatch.

Focused application, component, integration, desktop, and mobile coverage is present on the branch. Its actual results remain pending until the final local validation run.

## Migration and authority evidence

Migration: `supabase/migrations/20260801085016_procurement_commercial_provenance_authoring_v1.sql`

Expected transition:

- previous migration count: 91;
- previous head: `20260731205657`;
- target migration count: 92;
- target head: `20260801085016`.

Static review confirms that the migration:

- performs fail-closed historical consistency checks before adding constraints;
- adds Packaging Supplier Product and Offer workspace-owner foreign keys;
- replaces Packaging Supplier Product policy `owner_all` with owner/workspace/active-workspace parity;
- adds canonical composite source identities;
- enforces a null-safe zero-or-two source pair;
- adds generated raw-material and packaging routing IDs;
- adds composite source foreign keys including workspace, owner, ID, and Supplier;
- restricts linked-source update/delete;
- adds two partial source indexes;
- adds an empty-search-path `SECURITY INVOKER` usability trigger;
- denies direct trigger-function execution to PUBLIC, `anon`, and `authenticated`;
- leaves genuine manual `NULL/NULL` Offers valid;
- rewrites no historical Offer.

The focused pgTAP file contains 45 assertions covering the constraints, generated columns, foreign-key identities, partial indexes, Packaging RLS policy, trigger-function privilege boundary, trigger attachment, and a real manual `NULL/NULL` insert.

The exact upgrade harness:

1. resets local Supabase to migration 91 without seed data;
2. confirms count/head 91/`20260731205657`;
3. inserts one synthetic owner workspace, Supplier, raw source, packaging source, request, item, manual Offer, raw-linked Offer, and packaging-linked Offer;
4. applies the one pending migration;
5. confirms count/head 92/`20260801085016`;
6. proves every manual commercial fact and each stable source relationship survived;
7. proves generated routing identities and direct trigger-function denial;
8. proves no raw-material or packaging inventory lot appeared;
9. finishes with a fresh no-seed reset at migration 92.

Actual reset, pgTAP, upgrade, and integration outputs are pending.

## Local Final Approval V2 structural rehearsal

The final local rehearsal must use only synthetic `.invalid` identities and local owner sessions. It must not contain or execute the approved production manifest.

### Complete Supplier fixture

Pending proof:

- one complete printing Supplier submission;
- one Supplier row and zero follow-up Supplier UPDATE;
- legal name, null trading name, `printing`, `research`, absolute website, `NO`, `NOK`, `unknown`, empty notes, and `false` preferred round-trip exactly;
- typed CREATE receipt matches the owner-authorized reload;
- malformed URL/country/currency and duplicate identity return no false receipt.

### Linked Offer fixture

Pending proof:

- one owner Supplier, Ingredient, exact raw Supplier Product, request, requested item, and linked Offer;
- one Offer submission and zero follow-up Offer UPDATE;
- source domain, source ID, Supplier, request item, snapshot facts, and checked date round-trip exactly;
- typed Offer receipt matches owner readback and page reload;
- Recommendation can retain the stable linked Offer ID;
- no Purchase Order, receipt, ownership, inventory lot, or inventory movement is created.

### Negative and compatibility fixtures

Pending proof:

- cross-workspace source denied;
- Supplier mismatch denied;
- one-sided and invalid-domain source denied;
- stale or unusable source denied;
- raw/packaging domain confusion denied;
- manual `NULL/NULL` source accepted;
- legacy CSV without source columns accepted;
- source-aware CSV round-trip preserved;
- persistence mismatch retains form input and emits no success receipt.

## UI and accessibility evidence

Pending desktop and 390 × 844 browser proof covers:

- complete Supplier form, review, single submit, receipt, and reload;
- Supplier selection followed by stable-ID Supplier Product selection;
- prefilled but editable dated snapshot;
- linked Offer review, single submit, receipt, table refresh, and reload;
- manual Offer language;
- keyboard focus order;
- loading and actionable error states;
- status meaning outside color alone;
- copy-ID and copy/download receipt JSON controls;
- long stable IDs without horizontal overflow.

The static accessibility audit is supplementary only. Keyboard, focus, receipt controls, status text, and mobile overflow require the browser checks above.

## Validation ledger

Every result below was recorded only after its command completed.

| Gate | Command | Result |
| --- | --- | --- |
| whitespace | `git diff --check` | PASS |
| clean install | `npm ci` | PASS — 203 packages installed |
| fresh local reset | `npx supabase db reset --local --no-seed` | PASS — all 92 migrations applied; head `20260801085016` |
| exact 91-to-92 upgrade | `npm run test:procurement-commercial-provenance-upgrade` | PASS — synthetic manual and linked Offers preserved, followed by a fresh 92-migration reset |
| focused pgTAP | `npx supabase test db --local supabase/tests/procurement_commercial_provenance_authoring_v1.sql` | PASS — 1 file, 45 assertions |
| full pgTAP | `npx supabase test db --local supabase/tests` | PASS — 26 files, 1,377 assertions |
| focused migration contract | `npx vitest run src/features/procurement/ProcurementCommercialProvenanceMigration.test.ts` | PASS — 1 file, 4 tests |
| Supabase integration | `npm run test:supabase` | PASS — 13 files, 59 tests |
| generated platform evidence | `npm run audit:write` | PASS — 10 artifacts; 199 tables, 213 functions, 72 triggers, 186 policies, 643 indexes, and 635 foreign keys |
| authority audit | `npm run audit:authority` | PASS — all 10 generated artifacts match |
| privilege audit | `npm run audit:privileges` | PASS — all 10 generated artifacts match |
| deployment evidence regeneration | `npm run audit:environment:write` | PASS — 22 variables, 92 migrations, and 12 commands |
| migration audit | `npm run audit:migrations` | PASS — 92 migrations and generated deployment evidence match |
| documentation audit | `npm run test:docs` | PASS — 81 Markdown files, 0 findings |
| secrets audit | `npm run test:secrets` | PASS — 818 repository files checked |
| lint | `npm run lint` | PASS |
| TypeScript | `npx tsc -b` | PASS |
| unit/component and Cloudflare | `npm test` | PASS — 133 files and 964 tests passed, 59 intentionally skipped; Cloudflare readiness passed |
| desktop E2E | `npm run test:e2e` | PASS — 20 tests |
| mobile E2E | `npm run test:e2e:mobile` | PASS — 13 tests at 390 px |
| static accessibility | `npm run test:accessibility` | PASS — 0 findings; browser coverage supplied the required interactive checks |
| production build | `npm run build` | PASS — TypeScript and Vite production build, 2,071 modules transformed |
| loopback preview smoke | `npm run preview -- --host 127.0.0.1 --port 4173` plus HTTP request | PASS — HTTP 200 with `text/html` from the final build |
| clean-tree deployment preflight | `npm run deploy:preflight` | PASS — clean-tree, local-only preflight; `remoteActionsPerformed: false` |

No newly required test may be skipped. Generated platform and deployment audit artifacts must be regenerated only after implementation and migration content are final.

## Deployment and recovery evidence

Deployment and exact Phase 2 recovery order are documented in `PROCUREMENT_COMMERCIAL_PROVENANCE_AUTHORING_V1.md`. Those instructions are future-only. No deployment or stash command in that section was executed here.

Before Phase 2 can restart, a separately authorised deployment must prove production migration count/head 92/`20260801085016`, compatible application behavior, unchanged 34-operation manifest, and the expected pre-operation business baseline. A new explicit execution approval is then required. Operation 1 must be the single complete Supplier CREATE with confirmed receipt; it must not be reconstructed as CREATE plus UPDATE.

## Current safety result

- PROCUREMENT REALITY PHASE 2 NOT RESUMED
- 34-OPERATION MANIFEST NOT REVISED
- ZERO PRODUCTION OR REHEARSAL ACCESS
- ZERO HOSTED WRITES
- ZERO DEPLOYMENTS, PUSHES, PRS, OR MERGES
- ZERO AUTH, STORAGE, CLOUDFLARE, OR HOSTED ENVIRONMENT CHANGES
- ZERO CARTS, CHECKOUTS, ORDERS, PAYMENTS, RECEIPTS, OWNERSHIP, INVENTORY, OR QUALITY RELEASE
- PROCUREMENT REALITY REPORT STASHES LISTED READ-ONLY ONLY; NOT INSPECTED, APPLIED, POPPED, DROPPED, RESTORED, OR MODIFIED
- COMPLETE LOCAL VALIDATION AND CLEAN-TREE PREFLIGHT PASSED
