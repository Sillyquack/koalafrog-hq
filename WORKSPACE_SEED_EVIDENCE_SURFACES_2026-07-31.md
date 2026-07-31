# Workspace Seed Evidence Surfaces V1

Date: 2026-07-31

Branch: `fix/workspace-seed-evidence-surfaces`

Classification: post-1.0 evidence and diagnostics work

## Outcome and boundary

Workspace Foundation Seed V2 remained stopped. This change exposes the
persistence evidence needed for a later, separately authorized seed run; it
does not resume that run. Production and rehearsal data were not accessed or
modified. Cloudflare, hosted Auth, hosted Storage, deployments, pushes, pull
requests, and merges were untouched.

The blocker was presentation loss, not missing persistence authority. The
existing authenticated create paths already returned stable, read-back IDs.
Supplier Product and requested-item forms discarded those receipts, while the
Packaging destination ignored its typed navigation state. Platform could
download an owner export but could not inspect or copy it, and repository
migration evidence was not proof of the database's actual applied state.

## Receipt-flow audit

| Domain | Submit and repository result | Action/executor and readback | UI handoff before | UI handoff now | Error and close behavior |
| --- | --- | --- | --- | --- | --- |
| Supplier Product | `SupplierProductForm` calls `saveSupplierProduct`; the selected workspace repository commits then reloads the persisted record | `commitState` resolves only after repository commit; the returned receipt uses the reloaded record ID, workspace, timestamp, and natural identity | `persistSupplierProductForm` called a no-argument success callback, so the receipt was discarded | The receipt is passed to `IngredientDetailPage` and rendered by `OperationReceiptPanel`; a normal reload reads the Supplier Product from the repository | Failure reports an actionable error and leaves the form open; the form closes only after confirmed persistence |
| Equipment | `EquipmentPage` calls `createEquipment`; the repository uses insert-select-single | The selected row is converted to an owner operation receipt | Receipt was already retained locally | Existing behavior now uses the shared panel | Failure creates no receipt and the form remains available |
| Packaging component | `PackagingPage` calls `createPackagingComponent`; workspace action commit is followed by record lookup | Receipt is passed as typed React Router navigation state and the component is normally hydrated from the repository | Destination ignored navigation state | Destination accepts only a valid receipt whose entity, persisted route ID, and active workspace all match; no receipt is placed in the URL | Failed persistence does not navigate; absent or malformed state creates no receipt |
| Procurement request | `ProcurementPage` calls `createRequest`; repository uses insert-select-single | Receipt is returned from the selected row, followed by normal cache refresh | Receipt was already retained locally | Existing behavior now uses the shared panel | Failure creates no receipt and leaves the create surface open |
| Procurement requested item | `ProcurementRequestPage` calls `createRequestedItem`; repository uses insert-select-single | Receipt contains the stable child ID plus the parent request ID, then normal cache refresh rereads the child | Receipt was discarded | Each successful child receipt is prepended to a visible page-session list bounded to 25 entries | Failed or duplicate creation appends nothing and leaves the item surface available |

The durable later readback is the owner operation export, not transient receipt
state. Cache refresh never replaces canonical request or child data with a
receipt.

## Shared receipt contract and UI

`OperationReceiptPanel` supports explicit `CREATE`, `REUSE`, duplicate-rejected,
and ambiguous-conflict states. Confirmed receipts expose:

- schema version and entity type;
- stable persisted record ID;
- workspace reference;
- persisted timestamp;
- natural identity;
- parent Procurement Request ID for requested items;
- copy-ID, copy-JSON, download-JSON, and dismiss actions.

It does not include credentials, tokens, Auth internals, service-role details,
connection strings, or arbitrary database rows. Text and icons state the
result, so colour is not the only signal. IDs wrap, actions remain keyboard
operable, and the layout collapses safely at the 390 × 844 test viewport.

The validator rejects malformed entity/operation values and rejects any
Packaging receipt whose route record ID or active workspace does not match.
Candidate Supplier Products remain candidates with unknown commercial facts;
a receipt creates no availability, stock, lot, movement, order, receipt, or
ownership truth.

## Owner evidence export

Platform Foundation now has three explicit actions: Preview JSON, Copy JSON,
and Download JSON. A single cached formatted JSON string backs all three
actions, so preview, clipboard, and downloaded bytes are identical for that
evidence generation.

The accessible modal displays the generated timestamp, included categories,
total record count, and an internal-ID warning. It focuses its close control,
supports Escape, bounds long JSON inside its own scroll area, and closes
without replacing normal page state.

Export schema version 1 contains only the active workspace reference,
generation time, and five named record categories. Each category is sorted by
stable ID and each row is reduced to an entity-specific field allowlist.
Repository queries also select only those fields. Authentication, active
owner-workspace resolution, table RLS, explicit workspace predicates, and a
second pure workspace filter prevent anonymous or cross-workspace export.

## Migration-status authority

Migration `20260731044225_workspace_seed_evidence_surfaces_v1.sql` adds
`public.get_platform_migration_status_v1()`. It accepts no arguments and
returns only:

- migration count;
- current migration version;
- evaluation timestamp.

The function derives the actor from `auth.uid()`, requires an active workspace
owned by that actor, and uses `SECURITY DEFINER` only to read the protected
Supabase migration catalogue. Its search path is fixed and empty. `PUBLIC` and
`anon` execution are revoked; `authenticated` is explicitly granted. It
provides no schema, table, query, SQL-text, hostname, credential, or generic
catalogue interface.

The UI's expected count and head come directly from
`docs/generated/hosted-migration-rehearsal-manifest.json`. The actual values
come only from the RPC. The current local result is 90 migrations at
`20260731044225`, matching the generated application manifest. Missing or
mismatched state is explicitly `Unknown` or `Mismatch`, and both are displayed
as blocking production data operations.

## Local Seed V2 evidence simulation

The Playwright owner simulation used the normal authenticated UI and disposable
local Supabase only. It:

1. created and reloaded one candidate Supplier Product;
2. created one planned, not-owned Equipment record;
3. created one not-owned Packaging planning record and displayed its validated
   destination receipt;
4. created one Procurement Request and one child requested item;
5. verified all five stable IDs and the child parent ID;
6. previewed the owner JSON and proved all five IDs were present;
7. proved clipboard and download content exactly matched the preview;
8. displayed a database/application migration match;
9. relied only on authenticated owner reads for application evidence.

The deterministic reconciliation unit proof reruns each natural identity:
no match is `create`, one exact owner/workspace match is `reuse` with the same
ID, duplicate rejection creates no new ID, and multiple matches are an
ambiguous conflict with no fabricated choice. The E2E teardown removed its
synthetic local owner; no hosted cleanup or privileged hosted readback was
needed.

## Failure and safety coverage

Focused and integrated tests cover Supplier Product failure without form
closure, exact receipt callback preservation, cross-workspace readback
rejection, deterministic allowlisting and ordering, secret-shaped field
exclusion, parent/child receipt identity, malformed Packaging state rejection,
duplicate/ambiguous non-success display, clipboard error status, migration
match/mismatch/unknown states, fixed search path and grants, anon RPC denial,
and authenticated callers without an active owner workspace.

The complete desktop simulation exercises all five receipt surfaces and the
three export actions. The mobile proof checks migration diagnostics, preview
readability, explicit ID warning, Escape handling, and absence of horizontal
dialog overflow.

## Validation

- Fresh local Supabase reset: PASS through all 90 migrations.
- Focused pgTAP: PASS, 7 assertions.
- Full pgTAP: PASS, 24 files and 1,258 assertions.
- Supabase integration: PASS, 11 files and 55 tests.
- Focused receipt/status/component tests: PASS, 14 tests.
- Focused desktop Seed V2 evidence simulation: PASS.
- Focused mobile 390 × 844 evidence proof: PASS.
- Full unit suite: PASS, 126 files and 915 tests; 11 files and 55
  environment-gated tests skipped as designed.
- Full desktop E2E: PASS, 15 tests.
- Full mobile E2E: PASS, 10 tests.
- Accessibility audit, documentation audit, secret scan, lint, production
  build, Cloudflare readiness, and local production-preview HTTP smoke: PASS.
- Generated authority, RPC, privilege, module, browser-write, and migration
  evidence updated from the local schema.
- Deploy preflight is run after the focused commit because its clean-tree gate
  intentionally rejects an uncommitted implementation.

## Instructions for a later Seed V2 resume

A later owner-authorized task must first apply this migration and deploy the
matching application through its own reviewed release process. Before any seed
write, require the Platform migration card to report `Match`, repeat the
owner-authorized production baseline read and reconciliation, and stop for any
count, identity, authority, or workspace drift. Capture each visible receipt
immediately, confirm its ID in the owner export, and preserve candidate,
not-owned, unknown-availability, and not-recorded-stock truth states. This
document is not deployment approval and is not authorization to resume Seed
V2.
