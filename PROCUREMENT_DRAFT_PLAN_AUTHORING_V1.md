# Procurement Draft Plan Authoring V1

Date: 2026-07-31
Classification: post-1.0 capability development
Scope: confirmed Packaging Component updates and internal Draft Purchase Plan authoring

## Why this capability exists

Procurement Reality & First Product Readiness V1 Phase 2 stopped at its mandatory capability and authority gate. The existing application could safely author Suppliers, Supplier Products, Procurement Supplier Offers, and recommendation decisions, but it could not truthfully complete the remaining approved logical operations:

- Packaging Component updates did not return confirmed persistence receipts.
- The only supported Purchase Plan writer was scenario approval, which creates a `verification_required` plan and additional scenario, mapping, verification, publication, and audit business records.
- Supplier-basket creation was intentionally RPC-only, with no generic owner-authored Draft aggregate action.

Revising the authorization to treat scenario approval as Draft authoring was rejected. It would change the approved manifest, distort status meaning, and silently create unrelated business entities. Direct privileged SQL, browser service-role use, and direct grants on basket/line tables were also rejected.

This feature does not execute Procurement Reality Phase 2 and does not contain the selected production basket.

## Model and authority decision

The canonical system of record remains:

- `purchase_plans`
- `purchase_plan_baskets`
- `purchase_plan_lines`

No parallel Draft tables were introduced. `draft` was already a valid plan status. The migration adds explicit `placement_state = 'unplaced'` and `order_authorized = false` semantics plus nullable planning fields required to preserve Unknown values. Existing scenario-created plans are retained, and `verification_required` is not reinterpreted as Draft.

One additive versioned migration is required: `20260731205657_procurement_draft_plan_authoring_v1.sql`. It:

- adds Draft placement, authority, budget, range, evidence, idempotency-fingerprint, basket-cost, and line-snapshot columns;
- makes the previously mandatory scenario calculation fields nullable where owner-authored Draft facts may be Unknown;
- preserves existing rows with deterministic defaults only for the two explicit semantic flags (`unplaced`, `false`);
- leaves newly introduced historical commercial facts null rather than inventing values;
- removes the obsolete header-only Draft insert policy and reduces authenticated plan, basket, and line table privileges to owner-readable SELECT only;
- retains read RLS and aggregate-only basket/line writes;
- adds the authenticated atomic RPC `create_draft_purchase_plan_v1`.

The exact pre-head upgrade test seeds a representative scenario-derived `verification_required` plan, basket, line, and verification record at migration `20260731044225`, applies only the new migration, and confirms all prior meaning survives unchanged.

## Confirmed Packaging Component updates

`updatePackagingComponent` now returns `Promise<OwnerOperationReceipt>`.

The shared workspace action path:

1. resolves the active authenticated owner workspace;
2. captures the existing component and optimistic-concurrency timestamp;
3. submits one update through the selected repository;
4. awaits persistence;
5. performs a separate owner/workspace/id-scoped relational readback;
6. verifies the stable ID, every requested field, audit timestamp, and protected ownership/stock fields;
7. publishes the confirmed persisted row to UI state;
8. creates an UPDATE receipt with the stable ID, workspace, timestamp, natural identity, and changed-field summary.

If mutation or readback fails, the action executor does not publish the proposed row. The edit form remains open, retains its values, displays the persistence error, and returns no receipt. Ownership and stock remain separate planning facts unless they were explicitly part of the approved patch. No inventory lot or movement is inferred.

## Draft Purchase Plan contract

An owner-authored Draft Purchase Plan is internal, editable only within the Draft/unplaced lifecycle boundary, unplaced, and not authorised for ordering. It is not:

- an external cart;
- a Purchase Order;
- an order or supplier submission;
- a reservation or payment;
- receipt or physical ownership;
- inventory or Quality Release.

The plan stores purpose, notes, evidence time, target budget, absolute stop, optional credible and worst-credible ranges, and nullable known/estimated totals. Each Supplier basket records its own currency and nullable list subtotal, verified discount, post-discount subtotal, shipping, VAT adjustment, import VAT, duty, dangerous-goods fee, brokerage/handling, payment FX, and known minimum. Each line is a commercial snapshot with its basket, source domain/kind/record where applicable, exact title, SKU, package, purchase quantity, prices, currency, source URL, checked time, and selected evidence.

Unknown is always SQL `NULL`; the form requires an explicit Unknown control and never rewrites Unknown to zero.

## Atomic RPC and security

`create_draft_purchase_plan_v1(candidate_workspace_id, candidate_idempotency_key, candidate_plan, candidate_baskets)` performs one PostgreSQL transaction for the plan, all baskets, and all dependent lines.

Security and validation properties:

- the actor comes only from `auth.uid()`;
- the workspace must be active and owned by that actor;
- caller-supplied owner/status/placement/order fields are forbidden;
- every Supplier and source record is checked in the same owner workspace;
- source kind and domain must agree;
- numeric values, ranges, totals, currencies, timestamps, URLs, and evidence objects are validated;
- direct plan/basket/line mutation is unavailable to authenticated browser callers;
- the function is `SECURITY DEFINER` with an empty fixed `search_path`;
- PUBLIC and `anon` execution are revoked;
- only `authenticated` receives explicit execution;
- helper functions cannot be called directly by browser roles.

The RPC cannot create Purchase Orders, scenarios, scenario rounds/mappings/publications, recommendations, verification records, receipts, ownership records, or inventory. A transaction error rolls back the whole aggregate.

## Idempotency and receipts

The idempotency key is serialized with a transaction-scoped advisory lock. The canonical JSON payload is SHA-256 fingerprinted.

- First valid request: `CREATE`.
- Exact repeat with the same key and fingerprint: `REUSE` with the same IDs.
- Same key with another payload: `IDEMPOTENCY_CONFLICT`.
- Another active owner-authored Draft with the same POSIX-whitespace-trimmed, case-folded title: `DRAFT_PURCHASE_PLAN_IDENTITY_CONFLICT`.

The normalized title identity is enforced by a partial unique database index,
not only by an application pre-check. Concurrent creates with different
idempotency keys therefore resolve to one create and one deterministic identity
conflict.

The typed bundle contains one auditable plan receipt, one receipt per Supplier basket, and evidence for each dependent line ID. Lines remain dependent snapshots and do not inflate the owner-level manifest count.

## Readback, owner evidence, and UI

The repository reloads the exact plan, baskets, and lines under active-owner RLS after RPC success and compares every receipt ID/count with the readback.

The allowlisted owner operation export now contains:

- `purchase_plan`
- `purchase_plan_basket`
- `purchase_plan_line`

It keeps stable IDs, parent relations, deterministic ID ordering, and null values. Preview, Copy, and Download serialize the same cached allowlisted payload. Auth users, sessions, tokens, keys, connection strings, service-role data, arbitrary tables, and other workspaces are excluded.

The Procurement UI adds:

- `/procurement/draft-plans/new` — controlled builder with explicit Unknowns, supplier baskets, nested lines, validation, review, and a single “Create Draft Purchase Plan” confirmation;
- `/procurement/draft-plans/:planId` — owner-authorized readback with Draft, Unplaced, Not authorised for ordering, known/Unknown costs, target ceiling, absolute stop, baskets, lines, and optional receipt bundle.

The UI never uses “Approve order”, “Place order”, “Checkout”, or “Submit to supplier” for Draft creation.

## Workflow boundaries

| Workflow record | Meaning | Draft authoring relationship |
| --- | --- | --- |
| Research scenario | Computed comparison candidate | Not invoked |
| Published/approved scenario | Owner-selected later-stage scenario | Existing workflow unchanged |
| Internal Draft Purchase Plan | Owner-authored planning snapshot | New capability |
| `verification_required` plan | Scenario-derived plan awaiting commercial verification | Remains distinct |
| Purchase Order | Explicit supplier-execution record | Never created by Draft authoring |

Draft creation does not accept recommendations, make a product Lab-ready or Production-ready, or change the existing scenario-approval lifecycle.

## Deployment order

This task does not deploy. A later explicitly authorised deployment must use this order:

1. review and back up the target;
2. rehearse the exact migration against an approved non-production clone;
3. compare schema, RLS, policies, grants, RPC definitions, and migration head;
4. apply the single migration;
5. deploy compatible application code;
6. run authenticated owner, cross-owner, idempotency, readback, export, scenario-regression, desktop, mobile, accessibility, and smoke checks;
7. stop on any drift or semantic mismatch.

No production application is authorised by this document.

## Procurement Reality Phase 2 recovery

The report stash was not restored or modified in this task. After this capability is independently reviewed, deployed, and separately approved for production use:

1. identify the stash by its message, not by assuming its numeric index:

   `git stash list --format='%gd %s' | rg 'procurement reality v1 reports before draft-plan authoring'`

2. switch to the intended Procurement Reality continuation branch:

   `git switch feature/procurement-reality-first-product-readiness-v1`

3. require a clean tree:

   `git status --short`

4. inspect the resolved stash reference before applying it:

   `git stash show --stat --include-untracked <resolved-stash-ref>`

5. apply, but do not pop, the stash:

   `git stash apply <resolved-stash-ref>`

6. verify the restored report files and re-run the mandatory production capability/authority gate. Do not execute any Phase 2 operation without a new explicit production approval.

## Safety confirmation

- Zero production writes.
- Zero hosted Supabase access.
- Zero Cloudflare changes.
- Zero carts, checkouts, orders, payments, receipts, ownership, inventory, or Quality Release.
- Zero Supplier contacts.
- The Procurement Reality report stash remains untouched.
