# Production Workspace Authoring Migration V2 Evidence — 2026-07-30

## Result

PASS. The two reviewed Workspace Foundation Authoring migrations were applied to
production in repository order. Production migration history now matches the
complete 89-migration repository history. No seed, inventory, business-record,
Auth, Storage, Cloudflare, or frontend deployment action was performed.

## Repository and authority

- Branch: `ops/apply-workspace-authoring-migrations-v2`
- Execution baseline HEAD: `ccea5456bbce863b55a064aca6dcd10b91dc6046`
- Required merged fix ancestor:
  `7b7dcf8fc072bff4aa7aa3f5de56b7ba882a199a`
- Evidence commit: the commit containing this file; resolve dynamically with
  `git rev-parse HEAD` to avoid a self-referential commit hash
- Working tree before apply: clean
- Supabase project: `fetm…ikht` (safely redacted)
- Supabase CLI: `2.109.1`
- Production inspection pathway: normal authenticated owner application session,
  using browser-visible reads only
- Migration pathway: repository-controlled Supabase CLI linked-project workflow
- Service role, privileged SQL, ad hoc SQL, RLS bypass, Dashboard SQL, and
  migration repair: not used

The generated migration manifest contained the corrected SHA-256 for
`20260730123820_workspace_foundation_authoring_v1.sql`:

`51916cb1f979e5aa585c164c18cc00cb64e64fa7f2742a502d9b2a1c4a9b2030`

## Pre-migration reconciliation

`npx supabase migration list --linked` reported exact local/remote agreement
through production head `20260729160000`. It reported exactly two local-only
migrations, in this order:

1. `20260730123820_workspace_foundation_authoring_v1.sql`
2. `20260730154408_supplier_product_owner_workspace_integrity.sql`

There were no remote-only versions, checksum/history conflicts, or authoring
migrations recorded by the prior failed attempt. The owner application still
exhibited the pre-authoring contract before apply: `lifecycle_status` was not
available, while all normal owner reads remained functional.

### Production data preconditions

The owner-authorized pre-apply read returned:

| Record type | Before |
| --- | ---: |
| Ingredients | 18 |
| Suppliers | 58 |
| Supplier Products | 12 |
| Equipment | 0 |
| Packaging components | 0 |
| Procurement requests | 23 |
| Raw-material inventory lots | 0 |
| Packaging inventory lots | 0 |

All 12 legacy Supplier Products had a positive price, a currency, and a
structurally complete positive package quantity/unit pair. No zero or negative
price, price-without-currency, currency-without-price, contradictory commercial
row, or malformed package pair was found. The corrected deterministic mapping
therefore had an unambiguous input:

- positive legacy prices map to `price_state = recorded`;
- legacy `product_status = research` maps to
  `lifecycle_status = evaluated`;
- existing price, currency, package, identity, supplier, and ingredient facts
  remain unchanged.

The existing Vitamin E record was:

- product: Vitamin E (Tocopherol 70%)
- supplier: The Ingredients Store
- ingredient: Tocopherol
- package: 50 ml
- price: £8.63

It was inspected only and was not reinterpreted as Vitamin E Synthetic.

## Pending migration risk review

`20260730123820_workspace_foundation_authoring_v1.sql` uses
expand → validate → normalize → enforce ordering. It adds authoring columns,
normalizes existing Supplier Product state, validates consistency, then enforces
the final contract. It contains no business-record delete or seed operation.
The production data set affected by normalization was limited to the 12
pre-audited Supplier Product rows. The migration also establishes the reviewed
Equipment, Packaging, Procurement, audit, RLS, trigger, grant/revoke, and
hardened function contracts.

`20260730154408_supplier_product_owner_workspace_integrity.sql` adds the reviewed
fail-closed owner/workspace integrity constraint and replaces the Supplier
Product policy with an owner plus active-workspace check. It does not create,
delete, or manually edit business records.

The reviewed DDL can take ordinary PostgreSQL `ALTER TABLE` locks while
constraints are installed. The very small affected production relation and the
expand/validate/enforce order bounded that risk. No table-rewrite or destructive
data operation was identified. Repository pgTAP, integration, authority, and
privilege audits cover the constraints, RLS, grants/revokes, trigger functions,
empty `search_path` hardening, and revoked execute privileges.

## Dry run and production apply

The final dry run command was:

`npx supabase db push --linked --dry-run`

It reported exactly the two migrations above and no history conflict.

The authorized apply command was:

`npx supabase db push --linked --yes`

- Start: `2026-07-30T21:54:41+02:00`
- Finish: `2026-07-30T21:54:59+02:00`
- Result: success
- Applied in order:
  1. `20260730123820_workspace_foundation_authoring_v1.sql`
  2. `20260730154408_supplier_product_owner_workspace_integrity.sql`
- Failure, SQLSTATE, or ambiguous result: none
- CLI warning: version `2.110.0` was available while `2.109.1` was installed
- Transaction observation: the CLI completed each migration without exposing an
  intermediate failure; no manual transaction or retry was introduced

The CLI output ended with `Finished supabase db push.` No retry, repair, SQL
paste, seed flag, or unsupported schema-cache operation was used.

## Post-migration history and schema

The immediate final `npx supabase migration list --linked` comparison reported
local and remote version `20260730154408` as the shared head. All 89 local
versions had an identical remote version; no local-only or remote-only version
remained.

The normal owner application reloaded successfully through PostgREST without a
missing-column or schema-cache error. A non-writing “Add Supplier Product” form
check exposed the merged authoring contract:

- Lifecycle status defaults to `Candidate`.
- Price state defaults to `Price unknown`.
- Price is optional and empty.
- Currency is conditionally required only with a price and is empty.
- Package size is optional and empty.
- Package unit defaults to `Unknown`.
- Package description is available.
- Supplier grade, origin, shelf life, storage, operational status, and
  operational notes are available.
- No availability claim is required.

The form was cancelled without submission. This demonstrates that the
hypothetical incomplete candidate payload is representable by the deployed
application contract without creating a record.

The complete Equipment, Packaging, Procurement, and Supplier Product field and
constraint contracts were verified by the fresh 89-migration reset, 1,251
pgTAP assertions, 54 repository integration tests, and production owner
application readback. In particular:

- `supplier_products_price_state_consistency` is validated and enforced;
- existing positive prices map to `price_state = recorded`;
- Supplier Product lifecycle, nullable commercial/package fields, package
  description, sourcing, and notes fields are present;
- Equipment quantity, identity, category, status, material, measurement,
  resolution, use, calibration, ownership, and availability fields are present;
- Packaging planning/lifecycle, ownership, stock, intended use, specification,
  sourcing, and operational fields are present;
- Procurement planning statuses, nullable pre-operational quantities/units, and
  sourcing/decision notes are present;
- RLS remains enabled and repository grants/revokes match the audited baseline;
- hardened `SECURITY DEFINER` and execute-revocation expectations pass;
- cross-workspace access is denied by the reviewed owner/workspace policy and
  composite integrity constraint;
- authenticated owner reads remain functional.

No live cross-workspace mutation probe was made because this task prohibited
business writes. The denial contract was instead verified by the exact applied
migration hash plus the local pgTAP and integration suites.

## Production data integrity readback

| Record type | Before | After |
| --- | ---: | ---: |
| Ingredients | 18 | 18 |
| Suppliers | 58 | 58 |
| Supplier Products | 12 | 12 |
| Equipment | 0 | 0 |
| Packaging components | 0 | 0 |
| Procurement requests | 23 | 23 |
| Raw-material inventory lots | 0 | 0 |
| Packaging inventory lots | 0 | 0 |

All 18 ingredient records were read back by name, including the eight previously
created masters. Every ingredient displayed zero active lots. Packaging
displayed zero planning and physical records.

All 12 Supplier Product cards were compared before and after after normalizing
only the designed lifecycle display change from `research` to `evaluated`.
Product identity, supplier, SKU absence, package quantity/unit, price, currency,
unit price display, preferred state, and update date matched exactly. The
comparison returned 12 before, 12 after, zero missing, and zero extra.

The Vitamin E (Tocopherol 70%) identity, supplier, Tocopherol link, 50 ml
package, and £8.63 commercial fact remained unchanged. No Supplier Product,
Equipment, Packaging component, Procurement request, inventory lot, inventory
movement, order, receipt, formula, or other business record was created or
deleted.

## Validation record

The following completed successfully:

- `git diff --check`
- `npm ci`
- exact upgrade test from `20260729160000`
- fresh local Supabase reset with all 89 migrations and no seed
- full pgTAP: 23 files, 1,251 assertions
- Supabase integration: 11 files, 54 tests
- `npm run audit:authority`
- `npm run audit:privileges`
- `npm run audit:migrations`
- `npm run test:docs` (81 Markdown files, zero findings)
- `npm run test:secrets` (759 repository files after adding this evidence)
- `npm run lint`
- `npm test` (904 tests passed; expected integration tests skipped here)
- focused desktop Supplier E2E
- focused mobile Supplier E2E
- `npm run build`
- `npm run deploy:preflight`
- final remote migration-history comparison
- final authenticated owner production readback

The only regenerated repository evidence was
`docs/generated/platform-release-baseline.json`, whose branch field changed from
the merged fix branch to this operations branch. Migration checksums and the
migration manifest did not change.

## Untouched systems and recovery

- Production seed data: untouched
- Auth: untouched
- Storage: untouched
- Cloudflare configuration: untouched
- Hosted frontend: not deployed or modified
- Repository remote: no push, PR, merge, or frontend deployment
- Workspace Foundation Seed V2: not resumed

To resume Workspace Foundation Seed V2 safely, start a separate authorized task
on its designated seed branch, repeat the owner-authorized production baseline
read, require the counts in this evidence, confirm remote migration head
`20260730154408`, and rerun the complete seed reconciliation. Resume only the
previously approved 53-create plan through normal owner application pathways,
with immediate readback and idempotency checks. Continue to exclude the
Panthenol Ingredient master and Vitamin E Synthetic Supplier Product. Do not
reapply or repair these migrations, and stop before writes on any count,
identity, authority, workspace, CREATE, or UPDATE mismatch.
