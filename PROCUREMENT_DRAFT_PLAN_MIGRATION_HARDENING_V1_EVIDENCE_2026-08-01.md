# Procurement Draft Plan Migration Hardening V1 Evidence — 2026-08-01

## Result and scope

**LOCAL HARDENING PASS. Production retry remains a separately authorised future operation.**

Migration `20260731205657_procurement_draft_plan_authoring_v1.sql` was corrected
in place because it has not been applied to a persistent hosted environment. No
migration 92 was created and no previously applied migration was edited.

- Branch: `fix/procurement-draft-plan-migration-hardening-v1`
- Preserved evidence commit:
  `11f94df8dcf93d93523664e1f66881ebcf65d147`
- Migration count: exactly 91
- Local migration head: `20260731205657`
- Old migration SHA-256:
  `4d0ccac05c14f7adef6f25e8649bc9de0f2dedb0ff79d563fb0afc967ede286a`
- Hardened migration SHA-256:
  `b1a101383988231173bbc5f9becb1d992fa72bb9c88b548b4581064c992ebfc8`
- Hosted state: not read or changed by this hardening task

The preserved production evidence last attested production at 90 migrations
with head `20260731044225`, with the target absent. This task deliberately made
zero hosted reads, zero hosted writes, zero hosted Auth or Storage access, and zero
Cloudflare, deployment, repository-remote, or external-system actions. It does
not claim a fresh observation of current production state.

The tests created, exercised, and deleted disposable local Auth, workspace,
Supplier, plan, basket, and line fixtures inside the local Supabase stack. Fresh
database resets and suite cleanup removed those fixtures; none was hosted.

## Five production preflight blockers and root causes

1. **SQL `NULL` baskets could create a header-only Draft.** The original guard
   compared nullable JSON expressions with `<>`; PostgreSQL three-valued logic
   reduced the `IF` condition to `NULL`, so the guard did not run and the JSON
   iterators produced no children.
2. **A basket without `lines` could persist with zero lines.** Missing-key JSON
   access also returned SQL `NULL`; both original line guards used nullable
   comparisons and therefore skipped the rejection.
3. **One-sided budget/range pairs passed table constraints.** PostgreSQL CHECK
   accepts `TRUE` or `NULL`. The original Boolean expressions evaluated to
   `NULL` for one-sided pairs instead of explicitly enforcing paired nullness.
4. **Authenticated table ACLs exceeded the aggregate-only authority model.**
   Revoking only INSERT left privileges including TRUNCATE, REFERENCES, and
   TRIGGER on controlled tables. RLS is not a TRUNCATE control.
5. **Normalized active-Draft title identity was raceable.** An application
   pre-check had no matching unique database boundary, while its advisory lock
   was keyed by idempotency key. Different keys could therefore pass the check
   concurrently.

## Exact corrections

The existing migration version now:

- rejects SQL `NULL`, JSON null, non-object plans, non-array/empty baskets,
  non-object baskets/lines, missing/null/non-array/empty `lines`, bad field
  types, invalid commercial values, unavailable scoped sources, and malformed
  later children in a complete pre-insert validation pass;
- precomputes and rejects negative confirmed basket totals before the plan
  INSERT, rejects canonical duplicate Supplier/currency baskets, and treats a
  missing post-discount subtotal as Unknown when a plan claims a landed total;
- requires every valid aggregate to have at least one basket and each basket to
  have at least one valid commercial snapshot line;
- uses `num_nonnulls(...) IN (0, 2)` in all three paired-value constraints, while
  retaining their positive/order rules;
- preserves independent SQL NULL values for shipping, VAT adjustment, import
  VAT, duty, brokerage/handling, dangerous-goods fee, and payment FX;
- revokes all table privileges from `PUBLIC`, `anon`, and `authenticated` on
  plans, baskets, and lines, then grants authenticated SELECT only;
- grants authenticated EXECUTE only on the aggregate RPC and leaves both helper
  functions executable only by the PostgreSQL owner;
- adds a partial unique index for active owner-authored Drafts on workspace,
  owner, and a POSIX-whitespace-trimmed, case-folded title;
- maps only that index's unique violation to
  `DRAFT_PURCHASE_PLAN_IDENTITY_CONFLICT`;
- retains idempotency-key transaction locking and makes payload/source
  comparison null-safe with `IS DISTINCT FROM`;
- canonicalises UUID basket identity and trimmed uppercase currency consistently
  in duplicate detection and the plan's mixed-currency calculation; and
- leaves scenario approval, Packaging persistence, Purchase Orders, inventory,
  and all other execution workflows outside this RPC.

The platform audit now classifies the RPC as current procurement write
authority, classifies its helpers as internal operational support, records
expression-index expressions and predicates, treats all three browser roles as
privilege subjects, and enforces exact ACL contracts for the RPC and helpers.

## Defensive results

### Atomicity and malformed input

The focused suite passed 68 assertions. SQL NULL, JSON null, wrong top-level
types, missing/null/object/empty basket lines, null children, wrong numeric
types, a malformed later basket, and a malformed later line all failed with
zero plans, zero baskets, and zero lines.

A temporary local BEFORE INSERT sentinel proved that malformed later children,
a negative computed basket total, an alternate-text UUID duplicate basket, and
an incomplete-cost landed-total claim were rejected before any plan INSERT was
attempted. Transaction rollback and explicit count assertions independently
confirmed no partial aggregate.

All six one-sided budget/range combinations failed their database constraints;
valid pairs persisted.

### Privileges

The resulting browser contract is exact:

| Object | authenticated | anon | PUBLIC |
| --- | --- | --- | --- |
| `purchase_plans` | SELECT | none | none |
| `purchase_plan_baskets` | SELECT | none | none |
| `purchase_plan_lines` | SELECT | none | none |
| `create_draft_purchase_plan_v1(...)` | EXECUTE | none | none |
| `kf_draft_optional_numeric_v1(...)` | none | none | none |
| `kf_draft_plan_receipt_bundle_v1(...)` | none | none | none |

Runtime probes denied INSERT, UPDATE, DELETE, and TRUNCATE on all three tables
and denied authenticated helper execution. pgTAP checked the exact table and
function privilege sets. The regenerated privilege audit reported zero critical
findings.

### Concurrent title identity

Two real PostgreSQL sessions submitted different idempotency keys and titles
that differed by case plus surrounding spaces, a tab, and a newline. Session A
kept its transaction open; the observer verified session B's real `Lock` wait
and its blocker with `pg_blocking_pids`. Releasing A produced exactly one
`created`, one deterministic `DRAFT_PURCHASE_PLAN_IDENTITY_CONFLICT`, and one
persisted plan, basket, and line. The concurrency suite passed 6 assertions.

### Idempotency and isolation

- Same key and byte-equivalent canonical payload: `reused` with stable IDs.
- Same key and changed payload: `IDEMPOTENCY_CONFLICT`.
- Replay/conflict counts remained one plan, one basket, and one line.
- A different owner's workspace was rejected with `WORKSPACE_UNAVAILABLE`.
- Owner readback and export remained owner/workspace scoped.

### Regression and side effects

The Supabase integration suite passed all 56 tests in 12 files, including the
valid three-basket/twelve-line aggregate, owner readback/export, independent
known/Unknown commercial values, idempotent conflict paths, unchanged scenario
approval, and Packaging UPDATE receipt behaviour.

Focused runtime counts remained zero for Purchase Orders, recommendations,
verification records, raw-material inventory lots/movements, and Packaging
inventory lots/movements. The complete RPC source contains no write path for
external carts, checkout, scenario publication, receipts, ownership, or
payment; those categories are a static authority result rather than a claimed
runtime table-count probe.

## Local validation ledger

| Validation | Result |
| --- | --- |
| `git diff --check` | PASS |
| `npm ci` with npm offline mode | PASS; 203 packages, 0 vulnerabilities |
| exact upgrade from `20260731044225` | PASS; only migration 91 applied |
| fresh local reset | PASS; exactly 91 migrations, head `20260731205657` |
| focused migration hardening | PASS; 68 assertions |
| real title concurrency | PASS; 6 assertions and observed lock wait |
| focused pgTAP | PASS; 1 file, 74 assertions |
| full pgTAP | PASS; 25 files, 1,332 assertions |
| Supabase integration | PASS; 12 files, 56 tests |
| authority audit | PASS; 10 artifacts, 0 critical findings |
| privilege audit | PASS; exact target ACLs, 0 critical findings |
| documentation audit | PASS; 81 files, 0 findings |
| secrets audit | PASS; 799 repository files |
| ESLint | PASS |
| TypeScript project build | PASS |
| unit/component and Cloudflare readiness | PASS; 129 files/935 tests, readiness PASS |
| desktop E2E | PASS; 18 tests |
| mobile E2E | PASS; 12 tests |
| accessibility audit | PASS; 0 static findings |
| production build | PASS; 2,066 modules transformed |
| loopback preview | PASS; HTTP 200 from `127.0.0.1:4173` |

The normal unit invocation reported 12 files/56 tests as skipped because those
database integration tests run under the separate Supabase harness; all 12
files and all 56 tests were then executed and passed. No newly required test
was skipped.

The documentation audit scans `docs/**/*.md`; it does not include this required
root evidence file in its 81-file total. This file was instead reviewed directly
and covered by the repository whitespace/diff gate.

`audit:migrations` and `deploy:preflight` intentionally run after the single
hardening commit: the former compares the edited tracked migration with its
current HEAD snapshot, and the latter requires a clean working tree. Their
post-commit results belong to the final task handoff; no second evidence commit
or amendment is permitted.

## Exact future production retry procedure

This is an instruction set, not an authorisation and not a record of commands
run by this task.

1. Obtain explicit production authorisation and a fresh maintenance window.
   Use the reviewed hardening commit on a clean tree; verify the target file's
   SHA-256 is exactly
   `b1a101383988231173bbc5f9becb1d992fa72bb9c88b548b4581064c992ebfc8`.
2. Repeat the production identity, linked-project, backup/restore, Auth owner,
   active workspace, and business-count gates from the preserved production
   runbook. Do not reuse the old observation as current evidence.
3. Run a fresh read-only strict-suffix reconciliation. Require exactly 90
   ordered remote versions through `20260731044225`, no remote-only version, no
   divergence, and exactly one local-only version:
   `20260731205657`. Stop on any difference.
4. Re-prove that migrations 1–90 match their reviewed repository sources and
   that only the target migration differs from the previously reviewed
   91-migration repository snapshot.
5. Run
   `npx --no-install supabase db push --linked --dry-run`. Require it to list
   only `20260731205657_procurement_draft_plan_authoring_v1.sql`; stop otherwise.
6. Repeat the local checksum, full validation, privilege, and clean-tree gates.
   Keep migration repair, Dashboard SQL, ad hoc SQL, and service-role browser
   access prohibited.
7. Through the separately authorised repository-controlled workflow only, run
   `npx --no-install supabase db push --linked` once. Record start/finish,
   command output, duration, and transaction result. On error or ambiguity,
   stop; do not repair history or blindly retry.
8. Read back migration history. Require exactly 91 versions with head
   `20260731205657`, then verify the three table ACLs, three function ACLs,
   paired constraints, partial normalized-title index, RLS, RPC signature, and
   expected business counts. Stop and use a reviewed forward fix or the
   controlled backup procedure on any discrepancy.
9. Perform only the explicitly authorised owner workflow probes and compare all
   no-side-effect counts. A production deployment remains a separate decision.

## Untouched state

- No production, rehearsal, or hosted project was accessed or changed.
- No hosted Auth user, Storage object, business record, secret, credential,
  Cloudflare resource, deployment, remote branch, PR, or tag was accessed or
  changed.
- Procurement Reality Phase 2 was not resumed.
- The pre-existing stash remains exactly
  `de5e8c4dbbe6582c1b276f829f5477c073ffeda0` at `stash@{0}` and was not applied,
  popped, dropped, rewritten, restored, or inspected for content.
