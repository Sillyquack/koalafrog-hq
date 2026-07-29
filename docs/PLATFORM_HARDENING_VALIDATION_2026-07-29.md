# Platform Hardening validation — 2026-07-29

## Executive verdict

Platform Hardening & Legacy Authority Classification V1

Status: PASS

The local release candidate has deterministic authority inventories, RPC-only raw-material and packaging movement writes, frozen legacy Finished Goods authority, read-only compatibility UI, route-level code splitting, repeatable security tests, and release runbooks. No remote migration, deployment, push, or merge was performed.

## Validation evidence

| Check | Result |
|---|---|
| Clean local migration reset | PASS |
| Platform authority drift audit | PASS; 11 generated inventories |
| pgTAP | PASS; 18 files, 1,125 tests |
| Supabase integrations | PASS; 10 files, 50 tests |
| Unit tests | PASS; 119 files, 892 tests; 10 integration files conditionally skipped outside their harness |
| Desktop E2E | PASS; 11 unaffected journeys plus focused corrected Production/Lab 2/2 |
| Mobile E2E | PASS; 8/8 |
| Lint | PASS; no warnings after lazy-route module separation |
| Production build | PASS |
| Cloudflare readiness | PASS |
| Accessibility source gate | PASS; five representative routes; limitations recorded |
| Documentation gate | PASS; 53 Markdown files |
| Database lint | PASS with two established warnings |
| Migration list | PASS through `20260729083226` |
| Local schema restore rehearsal | PASS; 187 tables, 192 functions, 186 policies |
| Git diff check | PASS |

## Performance

The largest JavaScript chunk decreased from 1,590,270 bytes (approximately 407 kB gzip) to 664,699 bytes (185,081 gzip). Total JavaScript is split across 106 chunks. The remaining greater-than-500-kB warning and ineffective `PlatformPage` dynamic import warning remain visible.

The Finished Goods performance contract executes balance, state, FEFO, batch lookup, correction-basis, and audit plans against synthetic sets up to one million rows. No blanket foreign-key indexes were added: the deterministic inventory classifies 254 covered, 246 partially covered, and 79 missing FK prefixes for evidence-led follow-up.

## Resolved findings

- Authenticated direct writes to `inventory_movements` and `packaging_inventory_movements` are denied.
- Atomic receipt and append RPCs derive the owner and workspace, lock lots, validate units, reject negative balances, and use fixed empty search paths.
- Legacy Finished Goods tables and `workspace_records` are read-only for authenticated clients.
- Legacy Finished Goods write RPCs are service-only pending removal.
- Document lifecycle RPCs are no longer publicly executable.
- The v9 importer remains a one-time, owner-derived compatibility authority after movement grants were revoked.
- Legacy Finished Goods routes no longer expose write controls.
- Browser and integration fixtures use the service boundary for controlled setup.
- Background lifecycle tests use per-run provider/event identities and are repeatable.
- The standalone performance SQL is valid aggregate pgTAP.
- Route-level lazy loading materially reduced startup payload.

## Remaining baseline findings

- Database lint retains the text-to-JSONB assignment warning in `import_v9_relational_pre_ingredient_knowledge`.
- Database lint retains the unused `idempotency` parameter warning in `convert_supplier_candidate`.
- The build retains a chunk-size warning and an ineffective `PlatformPage` dynamic-import warning.
- Supabase CLI reports that v2.110.0 is available while local validation used v2.109.1.
- Playwright’s environment reports that `NO_COLOR` is ignored when `FORCE_COLOR` is set.
- Hosted advisors describe the deployed baseline, not this unapplied local migration. They retain unindexed-FK/RLS-init-plan findings, intentional authenticated definer workflows, a mutable trigger search path, and leaked-password protection disabled. Re-run advisors after an authorized migration.

## Restore evidence and limitation

A full local cluster dump restored all 187 public tables, 192 public functions, and 186 policies, but emitted ownership and data-FK warnings because Supabase-managed Auth rows and role ownership are not portable through a plain application-role `pg_restore`. A schema-only cluster restore under `supabase_admin --no-owner` completed without errors and matched all three counts. Therefore local schema recovery is proven; a supported hosted backup restoration with Auth data remains a deployment prerequisite.

## Merge and deployment gates

There are no local merge blockers after focused commits and a clean working tree.

Deployment remains blocked pending explicit authorization, hosted migration review, supported hosted backup/restore rehearsal, post-migration hosted advisors, two-owner hosted proof, and production smoke approval.
