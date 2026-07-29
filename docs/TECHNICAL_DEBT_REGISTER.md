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
