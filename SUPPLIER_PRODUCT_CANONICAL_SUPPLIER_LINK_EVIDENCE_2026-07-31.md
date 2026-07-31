# Supplier Product Canonical Supplier Link Evidence — 2026-07-31

## Scope and safety boundary

This change fixes canonical Supplier link persistence for Supplier Products on
`fix/supplier-product-canonical-supplier-link`. It was implemented and rehearsed
only against the local repository and local Supabase stack.

- Production workspace: redacted (`workspace …`)
- Production owner: redacted (`owner …`)
- Hosted production/rehearsal reads or writes during this task: **zero**
- Production service-role, privileged SQL, RLS bypass, Auth, Storage, and
  Cloudflare changes: **none**
- Deployment, push, pull request, merge, and Seed V2 continuation: **not
  performed**

The production state below is incident context supplied by the owner, not a
fresh hosted query made by this task.

## Production incident

The first authorized Workspace Foundation Seed V2 create produced Supplier
Product `e26016b1-1fb6-482c-a149-b1ae6fc09229`, “Jojoba Golden Carrier Oil”.
Its Ingredient mapping, `candidate` lifecycle, `unknown` price state, and
receipt/readback record ID were correct. The intended canonical Supplier was
Mystic Moments UK (`8c8d12e9-8393-484c-a824-b7542025923e`), but the persisted
`supplier_id` was `null`. No retry, correction, deletion, or further seed write
followed.

Owner-supplied production baseline:

| Entity | Count |
| --- | ---: |
| Ingredient masters | 18 |
| Suppliers | 58 |
| Supplier Products | 13 |
| Equipment | 0 |
| Packaging components | 0 |
| Procurement requests | 23 |
| Procurement requested items | 25 |
| Raw-material inventory lots | 0 |
| Packaging inventory lots | 0 |

The owner-supplied migration state remains Match at 90 migrations with head
`20260731044225`.

## Root cause and pre-fix reproduction

The form used a free-text input plus `datalist`. The displayed Supplier name and
the separately held Supplier ID were updated through exact
`legal_name`/`trading_name` matching. Text entry or automation could populate
the visible name without committing the associated React ID state. Submit then
persisted the correct display text with an absent `supplierId`, which serialized
to `supplier_id = null`.

The pre-fix code path demonstrates the failure deterministically: a displayed
value such as “Mystic Moments UK” was accepted as required form text while its
separate ID state could remain empty. Repository serialization itself already
supported `supplierId` → `supplier_id`; the defect occurred before that
boundary. The generic repository readback checked only record/workspace IDs, and
the operation receipt natural identity did not include `supplier_id`, so neither
surface detected the loss.

No schema migration is required. `supplier_products.supplier_id` already exists,
the relational mapping already supports it, and the existing composite
workspace foreign key and RLS policies reject cross-workspace links.

## Create-flow audit

1. Supplier hydration comes from the owner-scoped Procurement repository.
2. The form filters archived Suppliers from the active options.
3. The control is now a required, labeled native `select`.
4. Each option value is the stable Supplier ID.
5. The option label is the trading name, with legal name added when distinct.
6. Supplier name is derived from the selected canonical Supplier record.
7. Submission is disabled while Suppliers are loading.
8. Submit re-resolves the selected ID from the latest hydrated active list.
9. A missing/stale selected ID leaves the form open with an actionable error.
10. New `saveSupplierProduct` calls require a canonical Supplier ID.
11. The workspace action carries `supplierId` and derived `supplierName`.
12. Repository serialization maps them to `supplier_id` and `supplier_name`.
13. Insert/update requests return the full persisted row.
14. Immediate owner-authorized readback asserts record, Ingredient, Supplier ID,
    Supplier name, product name, and audit timestamps.
15. The receipt includes Ingredient ID, Supplier ID, Supplier name, and product
    name; owner export allowlists and returns `supplier_id`.
16. Edit initializes from the persisted ID and preserves the stable Supplier
    Product ID.

## Persistence invariant

A create or update is successful only when the returned owner-authorized row
matches the requested stable record ID, Ingredient ID, canonical Supplier ID,
derived canonical Supplier name, product name, and audit timestamps. A mismatch
throws before the success callback, so no success receipt is shown and the form
does not close as successful.

The receipt timestamp uses `created_at` for create and `updated_at` for update.
The evidence export contains the same `supplier_id` as readback. A full
repository reload rehydrates that ID into the domain record.

## Legacy compatibility and duplicate semantics

Existing rows with Supplier name text and `supplier_id = null` remain readable
and editable. Their form explicitly says “Legacy supplier name — not
canonically linked”; no fuzzy name match invents a link. The owner may leave the
legacy row unlinked or explicitly select a canonical Supplier ID. Linking uses
UPDATE and preserves the Supplier Product ID and creation timestamp.

Duplicate identity uses Supplier ID when both rows are linked. Supplier-name
comparison is retained only when either side is a legacy null-ID row. One match
is rejected as an existing Supplier Product. Multiple legacy-compatible matches
produce `CONFLICT`; no row is auto-selected, merged, or deleted.

## Local recovery rehearsal

The local owner flow created a Supplier and Ingredient, then inserted an
ephemeral synthetic legacy Supplier Product shaped like the incident, using a
locally generated ID rather than either production ID. The normal authenticated
owner UI explicitly selected the local canonical Supplier and saved an update.

Verified locally:

- operation receipt reported `UPDATE`;
- record ID was unchanged;
- Ingredient ID, product name, lifecycle, price state, nullable price/currency,
  nullable package fields, notes, and `created_at` were unchanged;
- only the selected canonical `supplier_id`, canonical Supplier name, and
  update timestamp changed as intended;
- full reload retained the link;
- owner export returned the same ID and Supplier relationship;
- a repeated create with the same identity was rejected, emitted no success
  receipt, kept the form open, and left exactly one row;
- the reconciliation identity therefore classifies the existing linked row as
  reusable rather than proposing another create;
- the candidate created no availability claim and no inventory lot.

## Focused test evidence

- Canonical selection helpers verify stable-ID-only resolution and
  trading/legal-name labels.
- Domain identity tests verify canonical duplicates, legacy compatibility, and
  ambiguous legacy conflicts.
- Repository unit tests reject Supplier ID/name readback mismatches.
- Form submission tests prove persistence mismatch emits no success callback.
- Owner receipt/export tests verify `supplier_id`.
- Supabase integration tests verify nullable candidate fields, readback/reload,
  explicit legacy linking with stable ID, no inventory, and foreign-workspace
  rejection.
- Desktop E2E verifies canonical create, keyboard focus traversal, receipt,
  reload, owner export, legacy update, preserved fields, and duplicate blocking.
- 390 × 844 E2E verifies canonical selection, receipt ID, reload, and no
  horizontal overflow.

## Validation

Final validation is recorded from the clean focused commit:

| Check | Result |
| --- | --- |
| `git diff --check` | PASS |
| `npm ci` | PASS |
| fresh local Supabase reset through `20260731044225` | PASS |
| pgTAP | Not applicable: no migration or database behavior change |
| Supabase integration tests | PASS — 11 files, 55 tests |
| authority audit | PASS |
| privilege audit | PASS |
| migration audit | PASS |
| documentation audit | PASS |
| secrets audit | PASS |
| lint | PASS |
| unit/component tests | PASS |
| focused desktop E2E | PASS |
| focused mobile E2E | PASS |
| accessibility tests | PASS |
| build | PASS |
| deploy preflight | PASS |
| local preview smoke | PASS |

## Exact post-deployment production recovery

This task does not execute these steps:

1. Deploy the fix through the separately authorized deployment process.
2. Verify the production application version.
3. As the authenticated owner, edit existing Jojoba record
   `e26016b1-1fb6-482c-a149-b1ae6fc09229`.
4. Select canonical Mystic Moments UK Supplier
   `8c8d12e9-8393-484c-a824-b7542025923e`.
5. Require an `UPDATE` receipt.
6. Verify the Supplier Product record ID is unchanged.
7. Verify `supplier_id` through owner-authorized readback and owner evidence
   export.
8. Rerun Workspace Foundation Seed V2 reconciliation.
9. Resume only the remaining 44 creates.

## Exact Seed V2 resume state

Before recovery, production remains at 13 Supplier Products, including the one
unlinked Jojoba record. Linking that record is an update, so the count remains
13. It must be classified as REUSE after correction. The remaining approved
base plan is exactly:

- 9 Supplier Products;
- 3 Equipment items;
- 9 Packaging components;
- 3 Procurement requests;
- 20 Procurement requested items.

Total remaining creates: **44**. Panthenol Ingredient and Vitamin E Synthetic
Supplier Product remain excluded. Seed V2 must not resume until the separately
authorized production correction, readback/export verification, and
reconciliation are complete.
