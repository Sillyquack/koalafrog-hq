# Technical debt register

This register records bounded follow-up work; it is not an authorization to expand the current milestone.

| ID | Finding | Risk | Current control | Exit evidence |
|---|---|---|---|---|
| TD-001 | Formula data provider remains broad | Unrelated consumers can rerender and command ownership is hard to review | Route splitting limits initial load; persistent actions still pass through one executor/repository | Domain providers extracted with render-count regression tests |
| TD-002 | Largest initial JavaScript chunk remains above 500 kB | Slower cold startup | Route-level lazy loading reduced the largest chunk materially; measured report is committed | Largest initial chunk below agreed budget without hiding warnings |
| TD-003 | Foreign-key audit reports missing and partially covered prefixes | Delete/update plans may degrade at scale | Every FK is deterministically classified; no blanket indexes added without query evidence | Production-shaped query plans justify focused indexes |
| TD-004 | Legacy Finished Goods structures remain physically present | Conflicting vocabulary and accidental reuse | Authenticated writes revoked, routes read-only, dependencies allowlisted | Hosted reconciliation, retained export, approved removal migration |
| TD-005 | `workspace_records` remains for v9 compatibility | Accidental dual authority | Authenticated write revoked and deterministic dependency guard | Rollback window closed and object removed |
| TD-006 | Static accessibility gate is not a WCAG conformance test | Keyboard, focus, contrast, or screen-reader defects can escape | Representative browser journeys plus a deterministic source gate | Automated axe/keyboard coverage across critical routes |
| TD-007 | No hosted restore rehearsal evidence exists | Recovery-time assumptions are unproven | Local reset and restore runbook | Dated hosted rehearsal with checksum and smoke evidence |
| TD-008 | Product-wide genealogy aggregation is not materialized | Trace queries may become expensive at scale | Lot-scoped, owner-scoped canonical RPCs and recorded query plans | Production-shaped volume test and measured aggregation strategy |
| TD-009 | Hosted migration, grants, RLS, Auth, Storage, and two-owner evidence are absent for the RC | Local PASS could be mistaken for deployment readiness | RC manifest states `deploy_ready_now=false`; hosted cutover checklist remains mandatory | Authorized hosted rehearsal and post-migration evidence package |
| TD-010 | Full Supabase Auth-data restore is not proven by the portable local schema rehearsal | Recovery assumptions may omit managed identities | Schema restore is proven; supported hosted backup/restore is a deployment blocker | Dated isolated restore with Auth, Storage metadata, checksums, and smoke validation |
| TD-011 | `PlatformPage` remains both statically and dynamically imported | Expected route split is ineffective | Warning remains visible and artifact is measured | Remove mixed import without changing startup authority |
| TD-012 | Local Supabase proxy can intermittently lose a browser/integration response | Validation noise can obscure real failures | Focused rerun plus complete-suite rerun is required | Root cause or stable harness evidence |
| TD-013 | Hosted Auth, Storage, grants, RLS, advisors, and two-owner proof remain unverified | Local parity may differ from hosted behavior | Exact authorized rehearsal matrices and stop conditions exist | Hosted rehearsal PASS evidence |
| TD-014 | Production monitoring and alert delivery are not configured | Failures may not be detected promptly | Vendor-neutral signal/threshold/privacy plan exists | Approved monitoring integration and tested incident path |
| TD-015 | Stale-client handling relies on hashed assets and operator refresh guidance | Long-lived tabs may use an older API contract | No service worker; smoke covers chunks/deep links | Version compatibility/refresh behavior proven hosted |
| TD-016 | Deployment automation is local/manual and no repository CI workflow exists | Operator ordering errors remain possible | Fail-closed local preflight and command classification | Protected pipeline with approvals and identical evidence |
# Recall Readiness boundary debt

- Customer, distributor, shipment, and sales-order tracing remain unavailable; Recall Readiness records this as an explicit distribution limitation.
- Recall execution remains a separate future milestone and has no operational mutation path in V1.
- Documented non-lifecycle sources require linkage to a canonical trace root before affected goods can be calculated.

Closeout status: TD-001 through TD-010 remain open and non-blocking for merge review. TD-007, TD-009, and TD-010 block deployment until their exit evidence exists. No closed item was deleted.

Deployment impact: TD-002 and TD-011 are baseline performance warnings; TD-012 affects rehearsal reliability; TD-007, TD-009, TD-010, TD-013, and TD-014 block production deployment; TD-015 and TD-016 require explicit rehearsal disposition. Owners are respectively application, test-platform, database/recovery, security/storage, operations, and release-engineering roles. Target milestone for deployment-impacting items is Authorized Hosted Backup, Restore & Migration Rehearsal V1 unless a later production gate is explicitly recorded.
