## Summary

Integrates Production Inventory Control, Finished Goods genealogy and traceability, Recall Readiness, platform authority hardening, RC closeout, and local deployment preparation.

Base: `main`
Compare: `feature/finished-goods-batch-genealogy-v1`
Recommended merge: normal non-squash merge with an explicit merge commit.

## Evidence

- 76 reviewed feature commits; 0 target-only commits
- 86 integrated migrations; 22 feature-only
- Disposable merge: 0 conflicts
- pgTAP 1,212; unit 895; Supabase 53; desktop E2E 14; mobile E2E 9
- Frozen RC: `finished-goods-traceability-recall-v1-rc1` → `bd5617c`

## Review hotspots

Migration ordering, inventory and packaging ledgers, release/disposition authority, traceability traversal, Recall scope and non-execution, evidence privacy, RLS/grants/security-definer functions, compatibility freezes, and deployment/recovery tooling.

## Deployment boundary

This PR does not deploy, apply hosted migrations, alter Auth or Storage, change hosted environment variables, create hosted users, or authorize hosted rehearsal.
