# Koalafrog HQ Release 1.0 Foundation

## 1. Release identity

| Field | Authoritative value |
| --- | --- |
| Release | Koalafrog HQ Release 1.0 Foundation |
| Release date | 2026-07-30 |
| Repository | `Sillyquack/koalafrog-hq` |
| Production branch | `main` |
| Authoritative commit | `638c0ea3ff67bc086776085d5605a59bd74cde5f` |
| Production migrations | 87 |
| Application version | `0.13.0` |
| Production Supabase project | `fetmeynkvylznapdikht` |
| Cloudflare Pages project | `koalafrog-hq` |
| Production region | `eu-west-1` |
| Status | **ACCEPTED FOR THE VERIFIED SCOPE** |

This document is the permanent post-migration technical baseline. The
authoritative commit is the production-evidence commit; this baseline is
recorded by a later documentation-only commit.

## 2. Executive summary

Release 1.0 establishes a deployed, owner-private technical foundation for
Koalafrog HQ: a browser application on Cloudflare Pages backed by Supabase
Postgres and Auth, an 87-version canonical migration history, database-enforced
ownership, audited write boundaries, durable operational ledgers, recovery
evidence, and repeatable release audits.

The production database, authentication path, principal application routes,
schema authority, RLS and RPC isolation, deployment artifact, backup restore,
and migration process have been verified. The foundation is suitable for the
production workflows explicitly represented by current schema and tests.

Content population and several user workflows remain intentionally evolving.
In particular, a technically present module must not be interpreted as complete
business data, complete automation, legal readiness, regulatory approval, or
proof that every exceptional workflow has been exercised.

## 3. Architecture baseline

- The frontend is a React, TypeScript, and Vite single-page application.
- Cloudflare Pages builds the repository and serves the production browser
  artifact from the `main` branch.
- Supabase provides hosted Postgres and Auth. Browser code receives only the
  publishable client key; privileged service-role credentials are prohibited.
- Every exposed authoritative table uses RLS. Ownership is a private-workspace
  boundary, not a generic multi-tenant product feature.
- Sensitive and multi-record writes use reviewed RPC boundaries. Functions that
  genuinely require `SECURITY DEFINER` validate ownership and have explicit
  execute grants/revokes.
- Formula versions become immutable after Draft. Historical execution,
  inventory, packaging, and finished-goods movements are append-only; correction
  is a new event rather than mutation of history.
- Inventory balances are derived from immutable movements grouped by lot.
  Estimated cost is planning data; committed allocation snapshots establish
  actual material cost.
- Hosted validation uses isolated restore rehearsals, two-owner isolation,
  Preview binding, controlled writes, cleanup, advisor review, and parity
  fingerprints. Local validation uses disposable Supabase reset, pgTAP,
  authenticated integration tests, browser tests, and generated audits.
- Repository migration files are canonical. Hosted history must be an exact
  immutable prefix, and a release may apply only the reviewed suffix.
- Evidence is generated or checked by repository scripts and committed
  separately from runtime changes so claims remain reproducible and reviewable.

See [Architecture](ARCHITECTURE.md), [Data Model](DATA_MODEL.md), and
[Application Actions and Repositories](APPLICATION_ACTIONS_AND_REPOSITORIES.md).

## 4. Functional module baseline

Status describes the verified technical surface, not commercial completeness.

### Production-ready foundation

| Module | Baseline status |
| --- | --- |
| Dashboard | Authenticated owner overview and operational navigation |
| Product Studio | Product intent and development workspace |
| Products | Durable product records and detail workflows |
| Formulas | Versioned formulation intent with immutability controls |
| Ingredients | Durable identity and ingredient knowledge records |
| Inventory | Lot and append-only movement authority |
| Production | Controlled run planning, allocation, commitment, and reconciliation |
| Finished Goods | Quarantine, quality release, movement, and active inventory controls |
| Traceability | Batch genealogy and affected-goods traversal |
| Recall Readiness | Evidence-oriented readiness analysis; deliberately not recall execution |
| Suppliers | Supplier records, documentation, history, and reliability |
| Procurement | Plan approval through ordering, shipment, receiving, quarantine, and release |
| Equipment | Equipment records and operational detail |
| Packaging | Versioned specifications, lots, planning, and consumption |
| Platform | Runtime authority, repository selection, status, and diagnostics |

### Limited or evolving workflows

| Module | Baseline limitation |
| --- | --- |
| Beard Studio | Personal grooming studio with evolving specialist workflows |
| Lab | Execution records exist; production data entry remains to be populated |
| Scent House | Scent memory and studio workflows remain iterative |
| Testing | Test sessions exist; broader panel operations and data remain future work |
| Costing | Cost derivation exists; meaningful output depends on acquisition and packaging data |
| Compliance | Dossier structure exists; external evidence and professional conclusions remain required |
| Launch | Internal readiness records only; not legal, regulatory, or market authorization |
| Knowledge | Governed internal reference system; not an external authority |

### Legacy compatibility surfaces

Legacy Finished Goods and older compatibility adapters remain only where needed
for controlled reading or transition. They are not alternative write
authorities and must not reintroduce dual-write behavior.

### Experimental surfaces

Development experiments and exploratory grooming/intelligence tools are
explicitly experimental. Their presence is not a production-readiness claim.

## 5. Database baseline

The database has 87 canonical migrations: an immutable 62-version production
prefix plus the strict validated 25-version release suffix. Provenance
reconciliation is PASS. Historical repository/hosted divergence was resolved
by canonicalizing repository history to the exact physical production prefix,
then retaining the reviewed release suffix; no production history was edited,
repaired, or replayed.

RC2 advanced a physical, Auth-preserving production restore from 62 to 87.
Production then applied only the same 25 versions in 5.78 seconds without a
reported error. Local reset and restore verification are PASS. Migration order,
checksums, normalized prefix, suffix, and full-history digests reconcile.

| Object class | Final count |
| --- | ---: |
| Tables / RLS tables | 198 / 198 |
| Columns | 3,834 |
| Constraints | 1,966 |
| Functions | 206 |
| Policies | 186 |
| Triggers | 59 |
| Indexes | 637 |
| Table grants | 3,594 |
| Routine grants | 632 |
| Tracked comments | 27 |

Production and RC2 have exact semantic parity for tables, columns, constraints,
function definitions, policies, triggers, indexes, grants, RLS, and stable
tracked comments.

Evidence:
[Migration Provenance Reconciliation](MIGRATION_PROVENANCE_RECONCILIATION.md),
[generated provenance](generated/migration-provenance-reconciliation.json),
[production migration report](generated/production-migration-62-to-87-report.md),
and [RC2 rehearsal report](generated/rc2-rehearsal-report.md).

## 6. Security baseline

### Resolved and verified

- Supabase Auth preserves one authoritative production owner and identity.
- RLS binds private workspace data to the authenticated owner.
- RC2 verified temporary Owner B authentication, two-owner RLS isolation, RPC
  isolation, allowed controlled write/read, forbidden cross-owner access, and
  complete fixture removal.
- Reviewed `SECURITY DEFINER` functions use hardened search paths, ownership
  checks, and intentional execute grants/revokes.
- Function, table, routine-grant, policy, and RLS parity are exact.
- Repository secret scans pass; frontend code contains no service-role key.
- Production Auth records survived physical restore and the 62 → 87 migration.

### Accepted intentional warnings

- Some authenticated business RPCs are intentionally `SECURITY DEFINER`. Their
  warning is retained because elevated execution is security-sensitive even
  after hardening.
- Some RLS-enabled internal/background/recall tables intentionally have no
  permissive policy and therefore deny access by default.

### Low-risk observations

- Performance advisors report unindexed foreign-key candidates and unused/new
  indexes. The baseline workload is low traffic and newly deployed, so usage
  evidence is not yet mature.
- Leaked-password protection was disabled at assessment time. It remains an Auth
  security posture improvement, not a migration-parity defect.

### Unresolved risk

The React Router advisory described in section 10 remains open and accepted
under controlled monitoring. No security finding is suppressed by this
baseline.

## 7. Deployment baseline

Cloudflare Pages production follows repository branch `main`; the existing Git
integration automatically produces production deployments from that branch.
Preview uses separately scoped variables and was temporarily bound to RC2 for
the rehearsal. Production remained bound to `fetmeynkvylznapdikht`.

Only frontend-safe `VITE_` configuration and the Supabase publishable key may be
compiled into the browser artifact. A service-role or other secret key must
never be present. The production build passes. Authenticated no-write smoke
passed all 16 principal production routes, and the deployed bundle contained
the production ref exactly once and neither rehearsal ref.

The build retains two non-blocking warnings:

- the main JavaScript chunk is approximately 665 kB minified (approximately
  185 kB gzip), above the configured advisory threshold;
- `PlatformPage` is dynamically imported by the router but eagerly imported by
  `WorkspaceRuntime`, making that dynamic import ineffective.

Current impact is download/parse and code-splitting efficiency, not correctness.
Future work should isolate platform startup dependencies and split large feature
graphs. Deployment evidence is indexed in section 13.

## 8. Backup, restore, and recovery baseline

A completed physical backup from `2026-07-30T04:17:57.342Z` was eligible for
Restore to New Project. It produced RC2 `sudsujokeccipbigfcgq` with the Auth
user, identity, workspace, and authoritative production data preserved. RC2
contained 62 migrations before applying the strict suffix and 87 afterward.

Recovery requires an eligible backup, a new isolated target, verified region and
ownership, credentials supplied out of band, migration-prefix reconciliation,
Auth and workspace counts, schema parity, security tests, smoke tests, cleanup,
and an explicit recovery decision.

A database restore preserves database-resident Auth records, but it must not be
assumed to reconstruct Storage objects, Auth configuration, API keys, Edge
Functions, redirects, provider secrets, DNS, or Cloudflare configuration. Those
surfaces require separately controlled inventory and reconstruction.

Applied production migrations use forward-fix by default. Never reset production
or edit hosted migration metadata. Restore/rollback is an incident decision when
forward-fix cannot safely preserve authority or data. Future high-risk releases
require a fresh backup gate, isolated rehearsal, exact prefix/suffix proof,
two-owner validation, advisor review, production smoke, cleanup proof, and a
focused evidence commit.

## 9. Testing and quality baseline

| Gate | Authoritative result |
| --- | --- |
| pgTAP | PASS — 1,212 |
| Supabase authenticated integration | PASS — 53 |
| Unit/component | PASS — 895 passed, 53 established skips |
| Desktop E2E | PASS — 14 |
| Mobile E2E | PASS — 9 |
| Lint | PASS |
| Production build | PASS |
| Accessibility | PASS for the recorded static scope; manual keyboard, focus, contrast, and screen-reader validation remains |
| Documentation | PASS |
| Secrets | PASS |
| Authority | PASS |
| Privileges | PASS |
| Migrations/checksums | PASS — 87 |
| Deployment preparation | PASS |
| Controlled merge review | PASS |
| Local restore verification | PASS |
| RC2 restore and two-owner rehearsal | PASS |
| Production authenticated smoke | PASS — 16 routes, no write required |

Counts are included only where current committed evidence supplies them.

## 10. Known issues and accepted risks

### A. GitHub Issue #25 — controlled dependency vulnerability remediation

Issue #25 remains open for advisory `GHSA-qwww-vcr4-c8h2`. The installed chain
at assessment was `react-router-dom@7.18.1` → `react-router@7.18.1`. `npm audit`
reported two high findings representing the same advisory at direct and
transitive nodes; the production-only audit therefore remained high.

The vulnerable React Server Components action path was assessed as unreachable
in this client-side Vite SPA. The repository uses no RSC, React Server Actions,
SSR, or unstable RSC APIs. No safe compatible published remediation existed at
assessment time. Unsafe downgrade, force-fix, and unreviewed overrides were
rejected. Automated release monitoring is active. This is an accepted,
documented risk—not a hidden or suppressed finding.

### B. Build warnings

The large main chunk and ineffective `PlatformPage` dynamic import are accepted
performance observations. They have no observed correctness impact. Refactor
startup imports, measure route boundaries, and set a budget before optimization.

### C. Advisor baselines

Intentional authenticated `SECURITY DEFINER` RPC warnings, intentional
deny-by-default RLS tables with no permissive policy, and low-traffic/new or
unused-index findings remain visible. Re-evaluate them as workloads and access
patterns mature.

## 11. Operational safeguards

- Use dedicated branches and reviewed PRs for substantive changes; do not commit
  them directly to `main`.
- Prefer a merge commit when historical branch traceability matters.
- Run a fresh local reset for migration changes.
- Prove an exact hosted prefix and reviewed repository suffix.
- Never manually edit hosted migration history or run database reset in
  production.
- Never place a service-role key in frontend code or Cloudflare browser
  variables.
- Do not mutate a hosted environment without explicit, target-specific
  authorization.
- Require a verified backup gate before production migration.
- Require an isolated rehearsal for high-risk migration releases.
- Give disposable fixtures unique names, record them, and remove them.
- Run authenticated production smoke after migration.
- Commit a focused evidence package after the release.

## 12. Environment inventory

| Environment | Baseline state |
| --- | --- |
| Production Supabase | `fetmeynkvylznapdikht`, `eu-west-1`, `ACTIVE_HEALTHY`, 87 migrations |
| RC2 rehearsal | `sudsujokeccipbigfcgq`, retained and `ACTIVE_HEALTHY` at baseline time; not production |
| Legacy rehearsal | RC1 `jaghoxoaqzpiowzyfcnf` is referenced by historical evidence only; current existence was not re-verified and must not be assumed |
| Cloudflare Production | Project `koalafrog-hq`, branch `main`, production Supabase binding |
| Cloudflare Preview | Isolated Preview variables; last validated against RC2, never an authority for production |
| Local Supabase | Disposable reset, pgTAP, integration, authority, privilege, and restore validation |
| GitHub main | `638c0ea3ff67bc086776085d5605a59bd74cde5f` |

No secret, key, password, token, or connection string belongs in this inventory.

## 13. Evidence index

| Claim | Evidence | Commit / identity |
| --- | --- | --- |
| Migration provenance | [reconciliation](MIGRATION_PROVENANCE_RECONCILIATION.md), [JSON](generated/migration-provenance-reconciliation.json) | canonical tree at production evidence commit |
| Canonical migration tree | [production manifest](generated/production-migration-62-to-87-manifest.json) | `638c0ea3ff67bc086776085d5605a59bd74cde5f` |
| RC2 restore and migration | [report](generated/rc2-rehearsal-report.md), [evidence](generated/rc2-rehearsal-evidence.json), [parity](generated/rc2-parity-evidence.json) | `2e0f0adf54ae5fff0a37960b21da65601573234c` |
| Production migration | [report](generated/production-migration-62-to-87-report.md), [evidence](generated/production-migration-62-to-87-evidence.json), [smoke](generated/production-migration-62-to-87-smoke.json) | `638c0ea3ff67bc086776085d5605a59bd74cde5f` |
| Deployment hardening | [local preparation](DEPLOYMENT_HARDENING_LOCAL_PREPARATION.md), [RC2 deployment](generated/rc2-deployment-evidence.json) | finished-goods RC lineage |
| Controlled merge review | [review](CONTROLLED_MERGE_REVIEW_AND_BRANCH_INTEGRATION_V1.md), [manifest](generated/controlled-merge-review-manifest.json) | frozen RC `bd5617c70dd8ca21611f63750f2293e40a83c8b4` |
| Finished Goods RC | [RC](FINISHED_GOODS_TRACEABILITY_RECALL_RC_1.md), [generated evidence](generated/finished-goods-traceability-recall-rc.json) | tag `finished-goods-traceability-recall-v1-rc1` |
| Recall Readiness | [design and validation](RECALL_READINESS_V1.md) | migration `20260729094510` |
| Authority and security | [authority](generated/platform-authority-inventory.json), [privileges](generated/privilege-audit.json), [RC2 parity](generated/rc2-parity-evidence.json) | 87-migration schema |
| Recovery | [backup strategy](HOSTED_BACKUP_STRATEGY.md), [local restore](generated/local-restore-readiness.json), [RC2 report](generated/rc2-rehearsal-report.md) | backup `2026-07-30T04:17:57.342Z` |
| Documentation | [documentation audit](generated/documentation-audit.json), [machine baseline](generated/release-1-0-baseline.json) | generated/check-mode evidence |

## 14. Release acceptance statement

**Release 1.0 Foundation is accepted only for the verified scope recorded in
this document.**

This is not a claim that every future product workflow is complete. It is not a
legal or regulatory launch approval and is not a substitute for CPSR, PIF,
CPNP, labeling, claims review, or product testing. It is the technical
production foundation baseline.

## 15. Next-phase recommendations

1. Develop and validate product workflows against real owner operations.
2. Populate formulation and lab execution data without mutating approved
   formula history.
3. Populate supplier, documentation, procurement, and acquisition-cost data.
4. Populate compliance dossiers with real external evidence and professional
   conclusions.
5. Populate packaging specifications, components, lots, and consumption data.
6. Expand test-panel workflows and manual accessibility coverage.
7. Populate cost and margin inputs while retaining Unknown for missing costs.
8. Monitor React Router releases and Issue #25 until a safe remediation ships.
9. Optimize the main bundle and remove the ineffective dynamic import.
10. Establish an operational backup review cadence.
11. Repeat isolated restore rehearsals periodically and before high-risk
    releases.
