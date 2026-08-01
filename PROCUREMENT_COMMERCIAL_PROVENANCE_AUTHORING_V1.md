# Procurement Commercial Provenance Authoring V1

Date: 2026-08-01
Classification: post-1.0 capability development
Scope: complete Supplier creation and canonical Supplier Product-backed Procurement Offer authoring

## Why this capability exists

Procurement Reality & First Product Readiness V1 Phase 2 stopped safely at its mandatory capability gate before operation 1. The approved Final Approval V2 manifest still contains exactly 34 logical operations, and no production operation was executed.

Two normal owner-authoring gaps blocked the approved sequence:

1. the Suppliers page accepted only a name and limited type and then hardcoded the remaining create values; it could not create the complete approved Supplier fingerprint in one operation;
2. the Add Offer form always submitted a manual `NULL/NULL` Supplier Product source even though the Offer model already carried source-domain and source-ID fields.

Creating a minimal Supplier and then updating it was rejected because it would turn one approved logical CREATE into an unauthorised CREATE plus UPDATE. Creating an unlinked Offer and correcting it later was rejected for the same reason and because there is no authorised normal Offer correction workflow. Neither shortcut would provide a definitive receipt for the approved operation.

This capability does not resume Procurement Reality Phase 2 and does not embed Avery, Signature Beard Oil, Aromantic, Base Formula, or any approved product list in application logic.

## Existing model audit

The existing `suppliers` table already contained the complete operating-metadata fields:

- legal and trading names;
- Supplier type and status;
- website and country;
- default currency;
- verification state;
- internal notes and preferred state.

`printing` was already a truthful supported Supplier type. No Supplier schema change, parallel Supplier table, or conversion workflow was required.

The existing `procurement_supplier_offers` table already contained:

- `source_supplier_product_domain`, supporting `raw_material` and `packaging`;
- `source_supplier_product_id`;
- the requested-item and Supplier relationships;
- the time-specific commercial snapshot fields.

However, the two source fields could be one-sided, and no database foreign key proved that a linked source belonged to the same workspace, owner, and Supplier. Packaging Supplier Products also lacked the composite owner/workspace boundary already present on raw-material Supplier Products. Those were authority and integrity gaps, so one additive migration was required.

The canonical systems remain `suppliers`, `supplier_products`, `packaging_supplier_products`, and `procurement_supplier_offers`. No second system of record was introduced.

## Complete Supplier create contract

The typed Supplier create input supports:

- `legal_name`;
- nullable `trading_name`;
- supported `supplier_type`;
- supported `status`;
- nullable absolute HTTP/HTTPS `website_url`;
- nullable two-letter uppercase `country_code`;
- nullable three-letter uppercase `default_currency`;
- supported `verification_state`;
- `internal_notes`;
- `is_preferred`.

Legal name is trimmed and required. Optional missing facts remain `NULL`; they are not replaced with invented strings. The safe defaults are `research`, `unknown`, and `false` for status, verification, and preferred state. Supplier identity and operating metadata do not imply approval, purchase, payment, receipt, ownership, inventory, documentation verification, or reliability.

The UI collects and reviews the complete fingerprint and submits one INSERT. It does not create a minimal Supplier followed by an UPDATE.

## Supplier persistence, readback, and receipt

After insertion, the normal authenticated owner repository reloads the exact Supplier by active workspace and stable ID. It compares every submitted field with the persisted row. A successful comparison returns a typed `supplier` CREATE receipt containing:

- schema version;
- stable Supplier ID;
- workspace ID;
- persisted timestamp;
- legal name;
- optional trading name;
- Supplier type;
- optional country code.

The UI selects the newly confirmed Supplier and renders the shared Operation Receipt panel with copy-ID and copy/download JSON controls. A persistence error, duplicate or normalized identity conflict, missing readback, or fingerprint mismatch returns no success receipt. The form stays open with its values intact and reports an actionable error. Suppliers are never auto-merged.

## Supplier Product-backed Offer semantics

A Supplier Product is the canonical commercial product identity. A Procurement Offer is a dated researched observation of package, price, currency, source URL, stock/document state, and checked date. Linking the two does not make the observation a recommendation, guaranteed future stock, an order, a receipt, ownership, inventory, or Quality Release.

The Offer authoring flow chooses a Supplier and may then choose one currently usable raw-material or packaging Supplier Product owned by that Supplier in the active workspace. The selector stores the stable source domain and ID; it does not accept an arbitrary ID or infer identity from the product title. Changing Supplier clears an incompatible selection.

A selected canonical source may prefill current recorded commercial facts. Those snapshot fields remain editable because the Offer records the checked observation. Changing snapshot text does not replace or relink the stable source identity.

A genuine manual Offer remains supported only when both source fields are `NULL`. Historical manual Offers are not rewritten.

## Migration and database authority

Migration: `supabase/migrations/20260801085016_procurement_commercial_provenance_authoring_v1.sql`

Expected local transition: migration 91 (`20260731205657`) to migration 92 (`20260801085016`).

The migration:

- rejects pre-existing Packaging Supplier Products or Offers whose workspace and owner do not agree;
- rejects pre-existing one-sided or unresolved source links rather than rewriting history;
- adds Packaging Supplier Product workspace-owner foreign-key and RLS parity;
- adds composite canonical source identities for raw-material and packaging Supplier Products;
- adds an Offer workspace-owner foreign key;
- requires zero or two source-link fields;
- routes the optional source through stored generated raw-material or packaging IDs;
- adds composite foreign keys proving workspace, owner, source ID, and Supplier equality;
- uses `ON UPDATE RESTRICT` and `ON DELETE RESTRICT` for linked source history;
- adds partial lookup indexes for each linked source domain;
- installs a `SECURITY INVOKER`, empty-search-path trigger that rejects discontinued, rejected, inactive, or otherwise unusable selected sources;
- revokes direct trigger-function execution from PUBLIC, `anon`, and `authenticated`.

No RPC is added. Browser code continues to use authenticated RLS and the publishable key; it receives no service-role credential. The trigger runs inside the caller's existing authority and is not an alternate callable write surface.

The source-pair CHECK deliberately accepts zero non-null source fields for manual and legacy Offers. The generated routing columns are both `NULL` for those records.

## Offer persistence, readback, and receipt

After one Offer INSERT, the authenticated owner repository reloads the exact Offer and verifies:

- stable Offer ID and workspace;
- requested-item ID;
- Supplier ID;
- source domain and source Supplier Product ID;
- product title and package;
- price and currency;
- source URL;
- checked date.

Only an exact match returns a typed `procurement_supplier_offer` CREATE receipt. The receipt includes the parent requested-item ID, Supplier ID, nullable source domain/ID pair, and natural identity for title, package, and checked date. The comparison table refreshes from persisted owner data and visibly identifies either the linked Supplier Product or a manual Offer.

Any stale selection, one-sided source, unsupported domain, cross-workspace source, Supplier mismatch, unusable source, persistence error, or readback mismatch leaves the form open, preserves values, performs no automatic retry, and emits no success receipt.

## CSV compatibility

Offer CSV export includes the source-domain and source-ID columns. Import treats the pair as optional but inseparable:

- both absent or empty preserves the historical manual-Offer behavior;
- both present are validated through the same typed source contract and database boundaries;
- a one-sided pair is rejected;
- workspace, Supplier, domain, and source integrity are never inferred from title text.

Existing manual Offers and Recommendations remain readable. Linked Offers remain valid Recommendation targets through their existing stable Offer IDs.

## Side-effect boundary

Supplier and Offer creation writes only their intended records. It does not create or mutate:

- Purchase Orders or order execution;
- payments, receipts, or Supplier contacts;
- raw-material or packaging inventory lots or movements;
- ownership records;
- Recommendations unless a separate explicit Recommendation action is later performed;
- Quality Release or legal readiness.

## Local structural rehearsal

The exact local rehearsal uses synthetic data only. Its required outcomes are:

1. one complete printing Supplier is submitted once, read back once, and confirmed without a follow-up UPDATE;
2. one raw-material and one packaging Supplier Product source can back a single-create Offer;
3. a genuine manual `NULL/NULL` Offer remains valid;
4. the typed Offer receipt and owner readback agree on every relationship ID;
5. cross-workspace, Supplier-mismatch, one-sided, wrong-domain, and unusable-source cases are rejected;
6. a linked Offer remains a valid Recommendation reference;
7. no Purchase Order, receipt, ownership, inventory lot, or inventory movement is created.

Results are recorded only after the local commands actually run in `PROCUREMENT_COMMERCIAL_PROVENANCE_AUTHORING_V1_EVIDENCE_2026-08-01.md`.

## Deployment order

This task does not deploy. A later, separately authorised deployment must:

1. confirm the intended target and capture an approved backup and restore owner;
2. rehearse the exact 91-to-92 upgrade against an approved isolated non-production copy;
3. compare migration head, objects, constraints, indexes, RLS, policies, grants, and trigger definition;
4. stop if any historical row violates the migration preflight checks; never repair it silently;
5. apply only migration `20260801085016`;
6. verify migration count 92 and head `20260801085016`;
7. deploy the compatible application code;
8. run authenticated owner, second-owner denial, complete Supplier, linked/manual Offer, readback, receipt, CSV, Recommendation-regression, desktop, mobile, accessibility, and smoke checks;
9. stop on any drift, false receipt, side effect, or semantic mismatch;
10. obtain a new, explicit approval before any Procurement Reality operation.

No hosted command or production action is authorised by this document.

## Exact Procurement Reality Phase 2 recovery

These are future recovery instructions only. They were not executed during capability development.

1. Independently review and deploy this capability under a separate approval. Confirm production is at exactly 92 migrations with head `20260801085016`, Platform state Match, and the pre-operation business counts unchanged except for separately authorised deployment metadata.
2. Confirm the approved Final Approval V2 manifest still contains exactly 34 logical operations. Do not revise, renumber, or append operations.
3. Obtain a new explicit approval to restart Procurement Reality Phase 2 from operation 1. Do not treat capability deployment as execution approval.
4. Switch to the intended continuation branch and require a clean tree:

   `git switch feature/procurement-reality-first-product-readiness-v1`

   `git status --short`

5. Resolve the report stash by its message rather than assuming a numeric index:

   `git stash list --format='%gd %s' | rg 'procurement reality v1 reports before draft-plan authoring'`

6. Inspect the resolved stash without applying or dropping it:

   `git stash show --stat --include-untracked <resolved-stash-ref>`

7. Apply, but do not pop, the exact resolved stash:

   `git stash apply <resolved-stash-ref>`

8. Review the three restored Procurement Reality reports, confirm their approved fingerprints and production baseline, and re-run the mandatory capability/authority gate.
9. Start a new execution record at operation 1. Submit the complete Supplier CREATE exactly once and require its confirmed stable-ID/readback receipt. Do not issue a follow-up Supplier UPDATE. Stop on an exact duplicate, normalized identity conflict, persistence mismatch, or unexpected baseline.
10. Continue to operation 2 only after operation 1 is confirmed. For every later approved linked Offer operation, select the exact canonical Supplier Product stable ID and require the confirmed Offer relationship receipt. Do not backfill or correct the link with a second operation.
11. Stop immediately on any manifest drift, false receipt, ownership/source mismatch, inventory/order side effect, or production count mismatch.

## Safety confirmation

- Procurement Reality Phase 2 was not resumed.
- The 34-operation manifest was not revised.
- Zero production or rehearsal access occurred in this capability task.
- Zero hosted writes, deployments, pushes, PRs, or merges occurred.
- Zero Auth, Storage, Cloudflare, or hosted environment changes occurred.
- Zero Supplier contacts, carts, checkouts, orders, payments, receipts, ownership, inventory, or Quality Release occurred.
- The Procurement Reality report stashes were listed read-only only to confirm that both entries remained present; they were not inspected, applied, popped, dropped, restored, or modified during this implementation slice.
- The three Procurement Reality reports and Release 1.0 historical evidence were not rewritten.
