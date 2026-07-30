# Hosted migration rehearsal runbook

## Purpose and scope

This runbook starts only after Release Candidate & Deployment Hardening V1 Local Preparation passes. It rehearses RC `finished-goods-traceability-recall-v1-rc1` (`bd5617c`) against an approved isolated hosted target. It is not production deployment authorization.

Roles: release owner controls scope; database operator executes backup/restore/migrations; application operator deploys preview artifacts; security reviewer verifies RLS/grants/isolation; business owner approves controlled writes; final approver accepts or stops the rehearsal.

## Preconditions

- Written authorization names the project reference, region, owner, time window, and allowed commands.
- Target is disposable or isolated and is visibly not production.
- Operator verifies Git tag, clean checkout, Supabase CLI version, target project reference, and local migration manifest.
- Backup destination, encryption, retention, restore operator, and cleanup owner are assigned.
- Auth redirects, Storage buckets, environment records, monitoring, and evidence directory are prepared.

## Authorized sequence

Every command below that contacts or changes a hosted target is marked **REQUIRES EXPLICIT AUTHORIZATION**. Replace placeholders; never paste credentials into shell history or evidence.

1. Run locally: `npm ci`, `npm run deploy:preflight`.
2. **REQUIRES EXPLICIT AUTHORIZATION — remote read:** inspect linked project identity, Postgres version/extensions, migration history, Auth/Storage configuration, grants, RLS, functions, and advisors.
3. **REQUIRES EXPLICIT AUTHORIZATION — backup:** capture managed-backup identity where available; create encrypted logical schema/data exports and Storage/Auth evidence according to [Hosted backup strategy](HOSTED_BACKUP_STRATEGY.md).
4. **REQUIRES EXPLICIT AUTHORIZATION — isolated restore:** restore the package into the approved non-production target using [Isolated restore rehearsal](ISOLATED_RESTORE_REHEARSAL_RUNBOOK.md).
5. Verify restored pre-migration counts, checksums, Auth identities, Storage metadata/objects, and migration head. Stop on any unexplained difference.
6. **REQUIRES EXPLICIT AUTHORIZATION — migration mutation:** apply only the ordered files in `docs/generated/hosted-migration-rehearsal-manifest.json`. Never use a production target.
7. After each migration group, record head, duration, locks/timeouts, object delta, warnings, and verification query result.
8. Verify 198 tables, 206 functions, 59 triggers, 186 policies, 637 indexes, 625 foreign keys, expected privileges, fixed function search paths, and no unexpected PUBLIC/anon execution.
9. Verify Auth callback/redirect/logout/session behavior and both private Storage buckets.
10. Execute the authorized two-owner plan, no-write smoke, performance smoke, database lint, security/performance advisors, and authority comparison.
11. Controlled-write smoke runs only under its own written approval.
12. Final approver records PASS, BLOCKED, rollback, or forward-fix decision.
13. Cleanup test owners/data and isolated resources only under approved fixture identifiers; preserve evidence.

## Stop, rollback, and forward-fix

Stop immediately for incomplete backup, failed restore, target ambiguity, migration drift/error/timeout, object or checksum mismatch, disabled RLS, unexpected PUBLIC/anon access, cross-owner leakage, evidence or cost leakage, balance/opening-movement mismatch, Auth/Storage failure, smoke failure, severe unexplained advisor finding, performance regression, or unavailable monitoring.

Before new-schema writes, artifact/config rollback plus isolated-target replacement may be safe. After immutable business writes exist, destructive down-migration is prohibited unless separately proven; preserve history and use a reviewed forward-fix.

## Evidence and sign-off

Populate the templates under `docs/templates/deployment-evidence-package/`. Capture commands with redacted targets, tool versions, timestamps, hashes, counts, query plans, warnings, discrepancies, decisions, and approvers. Do not store tokens, passwords, signed URLs, personal evidence content, or private object binaries in Git.

## Prohibited actions

No production target, guessed project reference, unreviewed migration, compatibility deletion, silent warning suppression, destructive history rewrite, direct ledger repair, notification, dispatch, Recall Execution, secret printing, or cleanup beyond named rehearsal fixtures.
