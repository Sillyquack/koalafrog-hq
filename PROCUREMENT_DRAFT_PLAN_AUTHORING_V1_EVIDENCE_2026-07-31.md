# Procurement Draft Plan Authoring V1 — Evidence

Date: 2026-07-31
Branch: `feature/procurement-draft-plan-authoring-v1`
Expected commit: `feat: add confirmed draft procurement planning`

## Scope and environment

This is post-1.0 application/schema capability evidence. All database mutations described here used the disposable local Supabase Docker stack. No production or rehearsal-hosted project, production data, Cloudflare resource, Auth configuration, Storage configuration, deployment, push, PR, merge, cart, checkout, order, payment, receipt, inventory, ownership, Quality Release, or Supplier contact was touched.

The Procurement Reality report stash was listed read-only at task start and was not applied, popped, dropped, rewritten, or committed.

## Implementation decision evidence

- Canonical tables reused: `purchase_plans`, `purchase_plan_baskets`, `purchase_plan_lines`.
- Draft was already a valid status.
- Explicit placement and order-authority fields were missing and are now additive.
- Scenario baskets required non-null calculation fields that could not truthfully represent owner-authored Unknowns.
- One new migration was therefore required.
- No second purchase-plan system of record was created.
- Existing scenario approval remains the writer of `verification_required` plans and retains its prior records and gates.

## Migration and authority evidence

Migration: `supabase/migrations/20260731205657_procurement_draft_plan_authoring_v1.sql`

Local migration head: `20260731205657`
Local migration count: 91

Verified properties:

- fresh local reset applies all 91 migrations;
- exact pre-head upgrade applies only migration 91 over preserved scenario-derived fixtures;
- preserved plan stays `verification_required` and retains its source type;
- preserved basket/line/verification records remain present;
- new historical commercial fields remain null;
- authenticated direct INSERT is denied on plan, basket, and line tables;
- authenticated-only RPC execution is explicit;
- PUBLIC/anon execution and direct helper execution are denied;
- RLS and owner readback remain enabled;
- RPC is a fixed-search-path security definer.

Focused pgTAP: 49 assertions, PASS.

## Local Final Approval V2 structural rehearsal

The focused local integration test creates only synthetic local IDs and names:

- 1 active owner workspace;
- 3 workspace Suppliers;
- 12 Supplier Product source records;
- 1 owner-authored Draft Purchase Plan;
- 3 Supplier baskets;
- 12 dependent line snapshots;
- multiple currencies;
- one known shipping value;
- two baskets with Unknown shipping/import components;
- target ceiling NOK 3,500;
- absolute stop NOK 4,000.

Verified outcomes:

1. Packaging update produces a typed confirmed UPDATE receipt after separate owner readback.
2. A real stale local Packaging write returns no receipt and leaves the prior state committed in UI memory.
3. Plan creation returns one plan receipt.
4. Exactly three basket receipts return.
5. Twelve unique stable line IDs return.
6. Status is `draft`.
7. Placement is `unplaced`.
8. Order authorization is `false`.
9. Purchase Order count does not change.
10. Scenario round/basket/line counts do not change.
11. Purchase Plan verification count does not change.
12. Unknown shipping/import/duty/handling/FX fields remain null.
13. Full repository reload equals the initial confirmed aggregate.
14. Owner evidence contains the same sorted IDs and nulls.
15. Exact idempotent replay returns `REUSE` with the same IDs.
16. Changed-payload replay returns `IDEMPOTENCY_CONFLICT`.
17. Cross-workspace Supplier and source records are rejected atomically.
18. Direct basket and line INSERT attempts are denied.
19. Anonymous and non-owner RPC attempts are denied.
20. The focused existing scenario-approval integration suite remains green.

The rehearsal additionally confirms no recommendation, inventory lot/movement, Packaging inventory lot/movement, or `verification_required` plan is created by the direct Draft action.

## Packaging UI evidence

The browser test performs one successful owner Packaging update and verifies:

- UPDATE receipt rendered;
- stable component ID retained;
- form closes only after confirmed persistence/readback;
- receipt copy/download actions remain available;
- ownership stays `not_owned` and stock stays `none`.

The same test forces a local REST persistence failure and verifies:

- the form remains open;
- the exact entered value remains visible;
- an actionable error is announced;
- no success receipt is displayed;
- the previously persisted database value remains unchanged.

## Draft UI and accessibility evidence

Desktop and 390 × 844 mobile browser coverage exercises:

- owner authentication;
- explicit Draft-only warning;
- labelled plan, budget, Supplier, line, evidence, and Unknown controls;
- review summary before save;
- explicit “Create Draft Purchase Plan” confirmation;
- pending/error states;
- plan/basket/line receipt bundle;
- Draft, Unplaced, Not authorised for ordering text (status is not colour-only);
- stable-ID wrapping and copy/download controls;
- full page reload/readback;
- no horizontal overflow at 390 px.

## Validation ledger

- `git diff --check`: PASS.
- `npm ci`: PASS, 203 packages installed from the lockfile.
- fresh local Supabase reset: PASS at migration head `20260731205657`.
- `npm run test:procurement-draft-plan-upgrade`: PASS, including pre-head preservation and final head reset.
- focused pgTAP: PASS, 49 assertions.
- full pgTAP: PASS, 25 files and 1,307 assertions.
- `npm run test:supabase`: PASS, 12 files and 56 integration assertions.
- authority audit: PASS, 199 tables, 212 functions, 186 policies, 638 indexes, and 631 foreign keys inventoried.
- privilege audit: PASS against the same canonical live inventory.
- migration/environment audit: PASS, 91 migrations.
- documentation audit: PASS, 81 Markdown files and zero findings.
- secrets audit: PASS, 795 repository files checked.
- lint and TypeScript build checks: PASS.
- unit/component and Cloudflare-readiness tests: PASS, 129 files / 935 tests; 12 Supabase integration files / 56 tests intentionally execute in their dedicated suite.
- desktop E2E: PASS, 18 tests.
- mobile E2E: PASS, 12 tests at the configured mobile viewport, including the 390 × 844 Draft plan flow.
- accessibility suite: PASS with zero static findings; keyboard, status-text, and responsive behaviour are additionally exercised in browser E2E.
- production build: PASS; only the established chunk-size and ineffective dynamic-import warnings remain.
- local production-preview smoke: PASS, loopback request returned HTTP 200.
- `npm run deploy:preflight`: intentionally runs after the single commit because the preflight requires a clean working tree; the final handoff records its actual result.

No required new test was skipped.

## Recovery and non-production confirmation

Exact recovery steps for the report stash are documented in `PROCUREMENT_DRAFT_PLAN_AUTHORING_V1.md`. They are future instructions only and were not executed here.

- ZERO PRODUCTION WRITES
- ZERO HOSTED ACCESS
- ZERO CARTS OR CHECKOUTS
- ZERO ORDERS
- ZERO SUPPLIER CONTACTS
- STASHED PROCUREMENT REALITY REPORTS UNTOUCHED
