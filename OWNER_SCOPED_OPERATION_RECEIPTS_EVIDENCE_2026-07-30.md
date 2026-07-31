# Owner-Scoped Operation Receipts — Evidence

Date: 2026-07-30  
Branch: `fix/owner-scoped-operation-receipts`

## Scope and invariant

This change does not seed or modify production. It adds one reusable receipt contract for
Supplier Products, Equipment, Packaging Components, Procurement Requests, and Procurement
Requested Items.

A create is successful only after the normal authenticated repository returns the persisted
row or the workspace repository verifies the inserted ID and workspace through a
`select(...).single()` readback. A receipt is therefore never built from an unconfirmed
insert acknowledgement. Failures throw before a receipt is returned, and existing forms
remain open with their entered values.

Each receipt contains:

- schema version and explicit entity type;
- stable persisted record ID;
- active workspace ID;
- `created`, `updated`, or `reused` operation;
- persisted creation timestamp;
- entity-specific natural identity;
- parent Procurement Request ID for every requested item.

## Authority and security

The operation export is initiated from Platform Foundation by the signed-in owner. It
resolves the workspace through the authenticated user, queries only five explicitly named
tables, filters every query by that workspace, and continues to rely on table RLS. It
provides no arbitrary table name, SQL, service-role path, Auth internals, tokens, owner ID,
or infrastructure metadata.

The export builder applies a second workspace filter and a per-entity field allowlist.
Tests prove that rows from another workspace and credential-shaped or owner fields are
excluded.

## Reconciliation behavior

The typed reconciliation result distinguishes `create`, `reuse`, `rejected_duplicate`, and
`ambiguous_conflict`. An exact `reuse` contains the existing owner-scoped stable ID.
Ambiguity returns all candidate IDs and never chooses or fabricates one. Existing Supplier
Product duplicate rejection remains in force and returns no receipt.

Candidate Supplier Products remain sourcing candidates. A receipt changes neither
availability nor inventory and creates no lot, movement, order, receipt, or ownership fact.

## Local seed-readiness proof

The focused deterministic tests exercise the same receipt/readback and reconciliation
contract used by the five create paths:

1. a candidate with no matching persisted row classifies as `create`;
2. confirmed persistence yields the database ID and creation timestamp;
3. immediate owner/workspace readback is required to match that ID;
4. a second reconciliation classifies the exact identity as `reuse` with the same ID;
5. cross-workspace rows are excluded;
6. ambiguous matches do not produce a fabricated success.

No production connection, privileged SQL, service role, RLS bypass, hosted configuration,
or hosted write was used.

## Validation record

- Full unit suite: 124 files passed, 910 tests passed; 11 files / 54 tests skipped by their
  existing environment gates.
- Cloudflare Pages readiness: passed.
- Production build: passed.
- Fresh local Supabase reset: passed through all 89 migrations.
- Full pgTAP: 23 files and 1,251 assertions passed.
- Supabase integration: 11 files and all 54 tests passed.
- Authority, privilege, and migration audits: passed.
- Desktop Playwright: all 14 tests passed.
- Mobile Playwright: all 9 tests passed at the configured mobile viewport.
- Documentation audit, secret scan, lint, and `git diff --check`: passed.
- No schema migration was required because all five tables already have stable IDs and
  authenticated insert/read paths.

Deploy preflight is run after the focused commit because its first invariant requires a
clean working tree.
