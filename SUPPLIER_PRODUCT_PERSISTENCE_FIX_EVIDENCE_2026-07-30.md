# Supplier Product Persistence Fix Evidence

Date: 2026-07-30

Branch: `fix/supplier-product-persistence`

Base commit: `d0e08637b5e160187a9909dbb9ca72ca5729b200`

## Outcome

An incomplete but truthful candidate Supplier Product now persists through the
normal authenticated owner-authorized application repository, remains visible
after a fresh repository reload, and retains unknown commercial and package
facts as null. A failed write keeps the form open and displays the persistence
error. Candidate Supplier Products do not create or imply inventory.

No production or other hosted environment was written, configured, deployed,
or otherwise changed. The stopped Workspace Foundation Seed V2 was not resumed.
The eight Ingredient masters already created by that operation were not read,
modified, relinked, or retried by this fix.

## Root cause and reproduction

`SupplierProductForm` called `saveSupplierProduct` and immediately closed the
modal. `saveSupplierProduct` called the asynchronous workspace action executor
without returning or awaiting its promise. The executor correctly deferred the
authoritative UI-state update until the repository commit succeeded, but the
form had already reported apparent success by closing. When Supabase rejected
the insert, its error reached the provider's general action-error state after
the form was gone. A reload therefore showed the unchanged authoritative
database state.

The failure was reproduced locally by tracing and exercising this exact path:

1. The form accepted a candidate with `price_state = unknown`, no price or
   currency, no package quantity or unit, and no availability assertion.
2. Form mapping preserved missing optional values as `undefined`; the
   repository serialized those fields to SQL null correctly.
3. The old form did not await the repository promise and closed immediately.
4. A rejected commit therefore produced a closed modal without a persisted
   record.

The initial authenticated integration also demonstrated a separate authority
defect: an authenticated owner could target a different owner's workspace
because `supplier_products` checked `owner_id = auth.uid()` but did not bind
that owner to `workspace_id`. That behavior was not used against production.

## Affected path and exact fix

The affected path was:

`SupplierProductForm` → `FormulaDataContext.saveSupplierProduct` →
`executeWorkspaceAction` → `SupabaseWorkspaceRepository.commit` →
`supplier_products` insert → RLS/constraints → repository reload.

The fix:

- makes `saveSupplierProduct` asynchronous and returns only after the
  repository commit and authoritative state update complete;
- closes the modal only after confirmed persistence;
- keeps the modal and entered uncontrolled form values present on failure,
  displays the actual actionable error, and prevents concurrent submissions;
- detects normalized Supplier Product identity conflicts before persistence;
- verifies that the committed record is present before reporting success;
- adds a forward-only migration that binds `(workspace_id, owner_id)` to the
  owning workspace and requires authenticated writes to target that owner's
  active workspace;
- fails migration application if inconsistent pre-existing Supplier Product
  ownership is detected rather than silently rewriting data;
- preserves all existing grants, nullable commercial fields, and validation.

The migration audit continues to store only deterministic migration version,
filename, order, and SHA-256 fields. Introducing-commit provenance is derived
from Git history at audit time. Before the introducing commit exists, the audit
requires an exact staged Git snapshot. No stale, placeholder, or
self-referential commit hash is stored.

## Database and RLS impact

Migration:
`20260730154408_supplier_product_owner_workspace_integrity.sql`

The migration adds no business data and performs no data rewrite. It adds a
composite foreign key to the existing unique workspace/owner identity and
replaces the Supplier Product owner policy with an authenticated, active
workspace-bound policy. Anonymous access and authenticated table grants are
unchanged. Cross-workspace creation is now rejected.

The local owner-authorized round trip proved:

- lifecycle remains `candidate`;
- `price_state` remains `unknown`;
- product state remains `research`;
- price, currency, package quantity, and package unit remain null;
- a fresh repository instance reloads the saved record;
- no raw-material inventory lot references the record;
- availability is not `in_stock`;
- another authenticated owner cannot create it in the first owner's workspace.

## Tests added

- form submission success and failure/modal behavior;
- normalized duplicate identity and conflict behavior;
- owner-authorized nullable candidate persistence and fresh reload;
- authenticated cross-workspace denial;
- nullable database contract and Supplier Product workspace-owner policy;
- Product Studio candidate-without-lots behavior.

## Validation

All commands ran locally on 2026-07-30. Supabase and browser tests used only
disposable local test data.

| Validation | Result |
| --- | --- |
| `git diff --check` | PASS |
| `npm ci` | PASS |
| fresh `supabase db reset --local --yes` | PASS, 89 migrations |
| focused Supplier Product pgTAP | PASS, 7 assertions |
| full pgTAP | PASS, 23 files / 1,249 assertions |
| `npm run test:supabase` | PASS, 54 tests |
| `npm run audit:authority` | PASS |
| `npm run audit:privileges` | PASS |
| `npm run audit:migrations` | PASS |
| `npm run test:docs` | PASS, 81 Markdown files |
| `npm run test:secrets` | PASS, 754 files scanned |
| `npm run lint` | PASS |
| `npm test` | PASS, 901 tests; 54 intentionally skipped |
| `npm run test:e2e` | PASS, 14 desktop tests |
| `npm run test:e2e:mobile` | PASS, 9 mobile tests |
| `npm run build` | PASS |
| `npm run deploy:preflight` | PASS on the final clean committed tree |

## Production and hosted confirmation

- Production writes: zero.
- Production retries: zero.
- Production record reads for this fix: zero.
- Existing production Ingredient changes: zero.
- Cloudflare, Auth, Storage, secrets, and hosted configuration changes: zero.
- Pushes, deployments, merges, and pull requests: zero.

## Workspace Foundation Seed V2 recovery

Recovery belongs to a separately authorized seed task after this fix is
reviewed and deployed through the normal controlled process. Before any retry:

1. Re-read the production workspace through the authenticated owner
   application pathway.
2. Verify the approved baseline and confirm the eight previously created
   Ingredient masters remain exactly as read back.
3. Confirm the failed Mystic Moments UK / Jojoba Oil Supplier Product is still
   absent; if present, stop for reconciliation rather than creating a
   duplicate.
4. Rerun the complete approved reconciliation and stop on any unexpected
   create, update, identity, authority, or workspace change.
5. Resume only the remaining explicitly approved creates in dependency order,
   with immediate owner-authorized readback and idempotency verification.

This fix does not authorize that recovery, a production retry, migration
deployment, or any other hosted mutation.
