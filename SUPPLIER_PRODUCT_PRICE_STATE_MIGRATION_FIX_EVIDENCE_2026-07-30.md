# Supplier Product Price-State Migration Fix Evidence — 2026-07-30

Status: PASS

## Scope and authorization

- Branch: `fix/supplier-product-price-state-migration`
- Base commit: `06bad092c4575a4f20af5a7d7eb642a68663508e`
- Corrected migration:
  `20260730123820_workspace_foundation_authoring_v1.sql`
- Original migration SHA-256:
  `9adea904a895360182cc92af554a47985aaf41d4363aa7f7d406a5227d894ed6`
- Corrected migration SHA-256:
  `51916cb1f979e5aa585c164c18cc00cb64e64fa7f2742a502d9b2a1c4a9b2030`

The owner explicitly authorized correcting this merged migration because it had
never been successfully applied or recorded in any known persistent Koalafrog
environment. No later workaround migration can execute before this migration's
first failing statement.

The prior production-attempt evidence branch remains unchanged at
`18f54c2659b0aecc6bfcd7614749bc05f2717691`.

## Environment application audit

Read-only migration-history checks were performed before editing:

| Environment | Safely redacted identity | Recorded head | Authoring V1 recorded |
| --- | --- | --- | --- |
| Production | Koalafrog HQ / `fetm…dikht` | `20260729160000` | No |
| Retained RC2 rehearsal | `suds…gfcgq` | `20260729160000` | No |

The Supabase account inventory exposed no other persistent Koalafrog database.
The unrelated inactive `mesh-shift-log` project is outside this repository's
environment inventory. Local applications of the old migration were limited to
disposable development/test databases and were reset.

No migration, SQL, data write, or configuration change was performed against
either hosted Koalafrog environment in this task.

## Original failure and root cause

The production CLI attempt failed with SQLSTATE `23514` on
`supplier_products_price_state_consistency`.

The failure was reproduced locally from the exact pre-authoring head
`20260729160000` with a synthetic research Supplier Product containing:

- price `12.50`
- currency `GBP`
- package quantity `50`
- package unit `ml`
- no availability claim
- not preferred

The uncorrected ordering added `price_state NOT NULL DEFAULT 'unknown'` and the
final CHECK in one `ALTER TABLE`. PostgreSQL populated existing priced rows with
`unknown` and validated the CHECK before the later backfill, so every legitimate
legacy priced row failed at statement 0.

A later migration was impossible because migration execution stopped before any
later version could run.

## Canonical mapping

| Existing stored facts | Deterministic authoring state |
| --- | --- |
| Positive price and currency | `price_state = 'recorded'` |
| Null price and null currency | `price_state = 'unknown'` |
| Price without currency | Explicit SQLSTATE `23514` diagnostic |
| Currency without price | Explicit SQLSTATE `23514` diagnostic |
| Zero or negative price | Explicit SQLSTATE `23514` diagnostic |
| Complete positive package pair | Preserve quantity and unit exactly |
| Both package fields null | Preserve both as unknown |
| Incomplete, blank, zero, or negative package pair | Explicit SQLSTATE `23514` diagnostic |

Package facts remain independent from price state. The migration does not infer
availability, ownership, inventory, preference, purchasing history, or receipt.
Existing Authoring V1 lifecycle mapping is unchanged:

- discontinued → `discontinued`
- explicitly in stock → `available`
- explicitly out of stock → `unavailable`
- otherwise → `evaluated`

The source `product_status`, availability field, preference, price, currency,
package quantity, and package unit are not overwritten.

The exact pre-authoring schema required non-null positive price and package
values, so null commercial/package legacy rows were structurally impossible
without out-of-band schema drift. Null pairs are nevertheless mapped
deterministically and are covered by the post-upgrade incomplete-candidate
round trip.

## Corrected SQL ordering

Before:

1. Relax legacy nullability.
2. Add required authoring columns with defaults.
3. Add and validate final constraints.
4. Attempt the legacy backfill.

After:

1. Add the new authoring columns as nullable expansion fields.
2. Explicitly reject contradictory price/currency, non-positive price, and
   invalid package combinations with diagnostic row counts.
3. Normalize lifecycle and price-state metadata from stored facts.
4. Relax the intended legacy commercial/package `NOT NULL` requirements.
5. Establish future-row defaults.
6. Set required authoring state columns `NOT NULL`.
7. Add and validate the unchanged final CHECK constraints.
8. Continue the original schema, history trigger, RLS, grant, revoke, and
   function changes.

The same correction was applied to `packaging_supplier_products`, whose original
ordering had the identical defect. The intended final schema and consistency
expressions are unchanged.

## Compatibility verification

The reproducible local upgrade harness
`npm run test:supplier-price-state-upgrade` performs:

1. Reset to exactly `20260729160000`.
2. Insert a non-sensitive production-shaped legacy priced research row.
3. Apply both pending migrations in version order.
4. Assert the price, currency, package quantity, package unit, research state,
   availability, and preferred flag remain unchanged.
5. Assert the derived price state is `recorded`.
6. Create and round-trip an incomplete candidate with unknown commercial and
   package facts.
7. Assert the candidate creates no inventory and implies no availability.
8. Bypass normalization triggers for one local probe and prove the final CHECK
   rejects a priced row marked `unknown`.
9. Reset to the pre-authoring head, create a structurally contradictory
   currency-only fixture, and prove the migration fails with the explicit
   diagnostic rather than coercing it.

Result: PASS.

A separate fresh database reset through all 89 migrations also passed.

Focused pgTAP coverage asserts both raw-material and packaging price-state
consistency constraints exist. Unit coverage statically guards normalization
before enforcement and the explicit diagnostic clauses. Existing integration
coverage continues to prove owner-authorized incomplete candidates,
cross-workspace denial, and the absence of implied stock or availability.

## Validation results

- `git diff --check`: PASS
- `npm ci`: PASS
- fresh local Supabase reset: PASS — 89 migrations
- explicit upgrade from `20260729160000`: PASS
- full pgTAP: PASS — 23 files, 1,251 assertions
- Supabase integration: PASS — 11 files, 54 tests
- `npm run audit:authority`: PASS
- `npm run audit:privileges`: PASS
- `npm run audit:migrations`: PASS after the corrected migration was committed,
  allowing dynamic HEAD provenance verification
- `npm run test:docs`: PASS
- `npm run test:secrets`: PASS
- `npm run lint`: PASS
- `npm test`: PASS — 123 files, 904 tests; Cloudflare readiness PASS
- focused desktop Suppliers E2E: PASS — 1 test
- focused mobile Suppliers E2E: PASS — 1 test
- `npm run build`: PASS
- `npm run deploy:preflight`: PASS after the final clean evidence commit

## RLS and privilege impact

The correction changes only the ordering of column expansion, deterministic
metadata normalization, assertions, nullability, defaults, and constraint
enforcement. It introduces no RLS, grant, revoke, trigger, or function change
beyond the already-reviewed Authoring V1 migration body. The following
`20260730154408` owner/workspace-integrity migration remains byte-for-byte
unchanged.

## Manifest and provenance

The ordered migration manifest remains at 89 entries with stable ordered index,
version, filename, and SHA-256 fields. The Authoring V1 hash changed from the
original value to:

`51916cb1f979e5aa585c164c18cc00cb64e64fa7f2742a502d9b2a1c4a9b2030`

Introducing-commit provenance remains derived dynamically from Git history; no
self-referential or placeholder commit hash is stored.

## Production retry instructions

Workspace Foundation Seed V2 remains paused. A later, separately authorized
production migration task must:

1. Use the commit containing this evidence from a clean checkout.
2. Reconfirm production and every retained rehearsal environment still records
   `20260729160000`, with no remote-only migration or checksum conflict.
3. Reconfirm owner-authorized production counts and Supplier Product legacy
   compatibility without writing.
4. Run the full local reset, upgrade harness, pgTAP, integration, authority,
   privilege, migration, secrets, documentation, lint, unit, build, and
   deploy-preflight gates.
5. Run `npx supabase db push --linked --dry-run`; require exactly
   `20260730123820` followed by `20260730154408`.
6. Apply once through the approved repository-controlled Supabase CLI pathway,
   without seed inclusion.
7. Stop on any diagnostic or ambiguous result; do not repair or retry.
8. Verify migration history, schema cache, owner reads, cross-workspace denial,
   unchanged production counts, and the non-writing Supplier Product form.
9. Only after separate verification and approval, resume Workspace Foundation
   Seed V2 from a complete fresh reconciliation.

This task performed zero production writes and did not change hosted Auth,
Storage, Cloudflare, frontend deployment, inventory, seed records, or workspace
data.
