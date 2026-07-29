# Deployment evidence package template

Copy this directory outside the repository for an authorized rehearsal. Populate it with redacted evidence only; never commit credentials, tokens, private objects, signed URLs, personal data, or provider payloads.

Required records:

| File | Purpose |
|---|---|
| `authorization.json` | scope, target, roles, approved commands, window |
| `backup-evidence.json` | artifacts, encryption, checksums, completeness |
| `restore-evidence.json` | isolated target and reconciliation |
| `migration-evidence.json` | ordered results, durations, locks, head |
| `security-evidence.json` | RLS, grants, functions, leakage tests |
| `advisor-evidence.json` | lint/security/performance findings and dispositions |
| `two-owner-evidence.json` | cross-owner matrix and cleanup |
| `auth-storage-evidence.json` | configuration and private-object checks |
| `smoke-evidence.json` | no-write/controlled-write results |
| `rollback-decision.json` | rollback/forward-fix decision |
| `final-approval.json` | final rehearsal or deployment decision |
| `post-deployment-review.json` | immediate and 24-hour review |

Each JSON file begins as `{ "templateVersion": "1.0.0", "status": null, "evidence": [], "warnings": [], "approver": null, "timestamp": null }`.
