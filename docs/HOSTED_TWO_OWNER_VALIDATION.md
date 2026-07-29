# Hosted two-owner validation

**REQUIRES EXPLICIT AUTHORIZATION.** No hosted user or fixture is created during local preparation.

1. Identify approved Owner A and Owner B test identities.
2. Create isolated Workspace A and Workspace B using supported application authority.
3. Seed uniquely prefixed controlled fixtures.
4. As each owner, verify own direct reads and permitted repository/RPC reads/writes.
5. Attempt other-owner table reads, RPC reads, writes, forged workspace IDs, and forged root IDs.
6. Cover supplier/cost data, Production, Packaging, Finished Goods, active inventory, Traceability, Recall Readiness, evidence metadata/objects, and event history.
7. Verify anonymous denial and direct controlled-ledger write denial.
8. Confirm searches, counts, errors, and logs reveal no other-owner identity or sensitive metadata.
9. Capture redacted request/result matrix, policy/grant snapshot, owner IDs, fixture prefix, time, and reviewer.
10. Remove or quarantine only the named fixtures using controlled cleanup; verify no production data changed.

Pass requires own-owner success and consistent cross-owner denial at table, RPC, Storage, search, and UI boundaries. Any leakage is an immediate rehearsal stop and deployment blocker.
