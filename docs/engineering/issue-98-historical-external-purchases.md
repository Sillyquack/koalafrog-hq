# Issue #98 — historical external purchase reconciliation

Instruction: `historical-external-purchase-reconciliation-20260922-001`.
Status: `needs_review`. Engineering only; zero production data/schema writes, imports, supplier contacts, purchases, merges or deployments. No continuation of #95/#94.

## Model and schema

Migration: `20260922072519_historical_external_purchase_reconciliation.sql`, in one explicit transaction.

- Existing orders and lines default to `record_origin='planned'`. Conditional CHECK constraints retain non-null plan ID/revision and plan-line ID. Existing creator/placement/mapping/receiving functions are unchanged.
- `historical_external` orders forbid **all** plan/version/basket/round/scenario lineage and require a reconstruction key, fingerprint, evidence/acknowledgement and external date. Historical lines forbid plan-line/basket/requirement/scenario-line lineage. A composite FK binds each line's origin to its order's origin.
- Audit events allow null plan ID only when it matches their actual parent order. Existing confirmation/shipment/receiving RPCs can therefore append truthful history without fabricated plans.
- Normalized supplier order number and order reference indexes cover all lifecycle states. Existing duplicates abort the migration transaction; no automatic cleanup or provenance replacement is performed.
- `historical_purchase_command_receipts` is an owner-readable, RPC-written command history with RLS and unique `(workspace_id, command, idempotency_key)`. It stores server SHA-256 of JSONB text plus original response IDs/states. Browser mutation privileges are revoked and covered by the operations audit.

Audit artifacts are regenerated from the tracked migration chain. Previous artifacts contained eight untracked identity/material reconciliation tables; removing those stale report entries does **not** drop database tables. The migration contains no `DROP TABLE`.

## Authenticated API

Both RPCs take `(target_workspace_id uuid, candidate_idempotency_key uuid, payload jsonb)` and return JSONB. Owner identity comes exclusively from `auth.uid()`; the active owner workspace is locked before retry lookup or writes. The new repository factory takes the existing authenticated client and performs one RPC per command. There is no service-key client, direct table insertion, runtime repository switching or UI addition.

`accept_owner_reviewed_supplier_product_mapping(..., mapping_payload)` requires:

- `supplierProductId`, `ingredientId`, nonblank `evidenceReference`, `acceptanceNote`.
- Both objects belong to the owner/workspace, and the existing canonical ingredient link equals the requested ingredient.
- A conflicting accepted mapping fails. An existing matching acceptance is reused without rewriting its original method; a new acceptance records `owner_direct_identity_review`, actor/time, evidence, INCI, grade, supplier grade, trade identity and package unit.
- Returns mapping ID, accepted status, method, actor and time. Appends a supplier event when a canonical owned supplier exists, and always persists the command receipt. No Procurement Requirement/Round is created.

`reconcile_historical_external_purchase(..., purchase_payload)` requires the exact domain contract in `src/features/procurement/historical-purchases/historicalPurchase.ts`:

- Acknowledgement literal `already_completed_external_purchase`; canonical `supplierId`; `supplierOrderNumber`; optional distinct `customerReference`; `externalOrderDate`; currency; subtotal/grand total; evidence type/reference/note.
- Nonempty lines with stable unique `lineKey`, Supplier Product ID, documented product identity, optional SKU/variant, package size/unit/count, historical package price and line total. Accepted canonical mapping is required. Line totals equal rounded package-count × package-price; the subtotal equals their sum. This bounded contract does not allocate shipping or support implicit line discounts.
- Optional confirmation has its own reference, date, evidence, currency/totals and **independently supplied** complete line list, including quantity. Every identity/package/quantity/price and documented total must match exactly; no tolerance, subset, duplicate or omitted quantity earns `accepted_exact`. Differences abort the entire transaction. The existing confirmation and decision RPCs are reused.
- Optional shipment requires that exact confirmation, separate evidence/reference, and explicit confirmed-line allocations. Allocated quantity must equal package count × confirmed package size and cannot exceed confirmation. Tracking/carrier and evidence dates are preserved. Statuses stop at `delivery_reported`; that status requires a finite `reportedAt`. `physically_received` is rejected. The existing shipment/status RPCs are reused.
- Returns PO ID/revision/state, line-key → PO-line IDs, confirmation and confirmation-line IDs, shipment and shipment-line IDs/states, `recordOrigin` and `receivingCreated=false`.

Unknown VAT/import VAT/duty/customs/handling/discount/shipping remain null. Catalogue price is never used as historical price. `placed_by`/`placed_at` remain null: reconstruction is not claimed to be an HQ checkout or approval. `placement_revision=1` is the reconstructed execution snapshot revision consumed by the existing confirmation contract. External dates are never used as physical receipt, expiry, BBE, retest or manufacture dates.

Same key + identical canonical JSONB returns the original response, including after later receiving. Object key ordering is immaterial; array ordering and supplied null versus omitted properties are intentionally part of the fingerprint. Changed payload fails. Workspace locking serializes simultaneous retries; unique reference indexes remain the final duplicate guard. Existing orders are not silently adopted under another key. Operator read-back of current state uses returned IDs and the existing owner-readable relations; the command receipt is the historical response, not a live status projection.

## Receiving boundary

The RPC writes orders/lines, optional confirmation/shipment records and their audit events/command receipts only. It neither calls `record_inventory_lot_receipt_v1` nor creates receipts, receipt lines, quarantine intakes, quality reviews, inventory lots or movements. The DB integration suite verifies zero downstream rows before explicitly calling the unchanged `create_purchase_order_receipt`; that separate action successfully changes shipment to `physically_received`. Inspection, completion, quarantine and quality release retain their existing authority.

## Reproduction and checks

Use the local Docker Supabase PostgreSQL container only:

```sh
node scripts/prepare-historical-purchase-test-db.mjs
npm run test:historical-external-purchase
node scripts/platform-audit.mjs --check --local-database=koalafrog_issue98
npm run audit:migrations
npm test
npx tsc -b
npm run lint
npm run build
npm run deploy:preflight -- --local-database=koalafrog_issue98
git diff --check
```

The preparation command recreates only `koalafrog_issue98`, copies local auth/storage **schema only**, then applies all tracked migrations. It verifies 12 existing mapping/planned/receiving function definitions remain byte-identical across the new migration, preserves an existing planned order, and proves preexisting duplicate references roll back the entire migration. Run pgTAP files with `search_path=public,extensions` after installing pgTAP in that test database. Never point these tests at production.

Validation: 143 focused DB assertions, 27 pgTAP files / 1,404 assertions, 1,044 unit tests; 65 HTTP integration tests are skipped by the default suite because it has no local HTTP test credentials. The focused integration suite executes real authenticated-role PostgreSQL RPCs instead. Typecheck, lint, production build, current migration manifest audit, platform/privilege audit, deployment preparation tests, local deploy preflight and `git diff --check` pass. Build retains the existing large-chunk warning.

The separate archival `audit:migration-provenance` command is pinned to the old 87-migration release and rejects the current 100-migration tree (main already has 99). Its historical guard is intentionally unchanged. The current migration manifest audit is `audit:migrations`; it validates all 100 migrations without claiming production application or deployment readiness.

## Exact owner gate

Review the PR and exact commit before authorizing merge. Merge authorization alone does not authorize a production migration, deployment or reconstruction.

Before a separately authorized migration/deployment, the owner must approve the exact migration checksum and release commit, reconcile hosted migration history under the existing operations guard, check normalized external references for duplicates, and approve backup/rollback and the deployment evidence packet. Duplicate references must be reviewed explicitly; do not delete or rewrite them to force the migration through. Preflight is a local check, never deployment authorization.

Production mappings or purchase reconstruction require a **new, explicit owner instruction** for a concrete evidence payload and stable key after deployment. #95/#94, physical receiving, quarantine and inventory remain outside this engineering authorization.
