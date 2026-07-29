# Controlled Merge Pull Request Package

## Proposed Pull Request

- Title: `feat: integrate finished goods traceability and recall readiness`
- Base: `main`
- Compare: `feature/finished-goods-batch-genealogy-v1`
- Merge method: normal non-squash merge with an explicit merge commit
- Deployment included: no

## Executive summary

This branch integrates the completed Production Inventory Control, Finished Goods and Batch Genealogy, platform authority hardening, Recall Readiness, release-candidate closeout, and local deployment preparation milestones. It preserves immutable inventory histories, canonical server-side authority, owner isolation, the frozen feature RC identity, and explicit hosted-deployment gates.

The reviewed baseline is 76 commits ahead of local `main` and `main` has no target-only commits. A disposable `--no-ff` merge produced no conflicts. The merged result passed 1,212 pgTAP assertions, 895 unit/component tests, 53 authenticated Supabase integrations, 14 desktop E2E tests, and 9 mobile E2E tests.

## Scope

- Production procurement and controlled raw-material commitments
- Packaging reservations and consumption
- Finished Goods lot creation, quarantine, release, inventory, genealogy, and traceability
- Recall Readiness case, scope, evidence, approval, and non-execution boundaries
- Platform authority and compatibility freezes
- Deterministic evidence, recovery preparation, and deployment authorization gates

## Database and migrations

The integrated history contains 86 globally ordered migrations, 22 of which are feature-only relative to `main`. The exact list, hashes, replacement functions, destructive-statement count, and security classification are in [controlled-merge-migration-review.json](generated/controlled-merge-migration-review.json).

Every feature-only migration requires line-by-line database review. Highest-risk groups are:

- `20260728120000` through `20260728170000`: quality release, inventory commitments, production reconciliation, and packaging control.
- `20260728203257` through `20260729054425`: Finished Goods lot, release, and active inventory authority.
- `20260729065048`: genealogy and traceability traversal.
- `20260729083226`: platform authority hardening and compatibility freezes.
- `20260729094510`: Recall Readiness scope, evidence, approvals, and events.

## Security and compatibility

- Browser commands use repository boundaries and versioned RPCs.
- Controlled ledgers remain append-only.
- RLS and grants retain private owner/workspace scope.
- Security-definer functions require explicit search-path and execution-grant review.
- Legacy Finished Goods and packaging write paths remain frozen.
- Recall approval records readiness; it does not execute a recall.
- Evidence metadata remains private and hosted binary storage is excluded from this merge.

## Validation

- Local database reset: PASS
- pgTAP: 1,212 PASS
- Unit/component: 895 PASS
- Supabase integrations: 53 PASS after one known local proxy retry
- Desktop E2E: 14/14 PASS
- Mobile E2E: 9/9 PASS
- Lint, build, accessibility, secrets, Cloudflare, documentation, restore verification: PASS
- Merge conflicts: none
- Semantic conflicts: none detected

Established warnings remain: two database-lint warnings, RLS initialization-plan performance advisories, ineffective `PlatformPage` dynamic import, a JavaScript chunk above 500 kB, Supabase CLI update notice, and forced-colour test output.

## Reviewer roles

| Role | Required focus | Blocking finding |
|---|---|---|
| Database/migration | Ordering, replacements, locks, backfills, ledgers, indexes | Ambiguous or destructive authority change |
| Security/RLS | RLS, grants, security-definer functions, evidence privacy | Cross-owner access or direct controlled writes |
| Domain architecture | Inventory, packaging, Finished Goods, traceability, Recall invariants | Competing authority or mutable history |
| Frontend | Routes, repositories, workflow warnings, responsive behavior | Browser authority drift or unusable critical flow |
| Testing | pgTAP, integration, concurrency, E2E, deterministic evidence | Missing invariant coverage |
| Deployment | Environment, backup, restore, rehearsal, rollback | Hidden mutation or unsupported recovery claim |
| Business owner | Scope, recall non-execution, final acceptance | Unaccepted operational consequence |

One person may fill multiple roles, but every responsibility needs explicit acknowledgement.

## Reviewer checklist

- [ ] Review every feature-only migration line by line.
- [ ] Confirm movement ledgers and event histories remain append-only.
- [ ] Confirm opening movements and positive corrections are controlled.
- [ ] Confirm release/disposition and operational-state overlays remain distinct.
- [ ] Confirm trace traversal terminates and affected goods deduplicate.
- [ ] Confirm Recall fingerprints are stable and approval performs no external action.
- [ ] Confirm evidence remains private and owner isolated.
- [ ] Confirm RLS, grants, search paths, and compatibility freezes.
- [ ] Confirm routes use repositories and server guards match UI behavior.
- [ ] Confirm environment variables contain no browser secret.
- [ ] Confirm backup/restore scripts are local-only.
- [ ] Confirm deployment is excluded.

## Proposed GitHub PR body

```markdown
## Summary

Integrates Production Inventory Control, Finished Goods genealogy and traceability, Recall Readiness, platform authority hardening, RC closeout, and local deployment preparation.

Base: `main`
Compare: `feature/finished-goods-batch-genealogy-v1`
Recommended merge: normal non-squash merge with explicit merge commit.

## Evidence

- 76 reviewed feature commits; 0 target-only commits
- 86 integrated migrations; 22 feature-only
- Disposable merge: 0 conflicts
- pgTAP 1,212; unit 895; Supabase 53; desktop E2E 14; mobile E2E 9
- RC tag remains `finished-goods-traceability-recall-v1-rc1` → `bd5617c`

## Review hotspots

Migration ordering, inventory and packaging ledgers, release/disposition authority, traceability traversal, Recall scope and non-execution, evidence privacy, RLS/grants/security-definer functions, compatibility freezes, and deployment/recovery tooling.

## Deployment boundary

This PR does not deploy, apply hosted migrations, alter Auth or Storage, change hosted environment variables, create hosted users, or authorize hosted rehearsal. Deployment requires a later independent approval.
```

## After an actual merge

Rerun database reset, pgTAP, lint, build, unit tests, authenticated integrations, desktop/mobile E2E, all deterministic audits, database lint/advisors, restore verification, and production-preview smoke testing. Regenerate integration evidence against the actual merge commit. Do not deploy automatically.

