# Post-deployment smoke test and validation matrix

All hosted steps require the relevant approval. Destructive actions are prohibited.

## No-write smoke

- Load artifact and confirm expected RC/build identity without exposing infrastructure.
- Authenticate, select workspace, refresh deep links, and log out.
- Read Dashboard, Ingredient, procurement, raw-material inventory, Production, Packaging, Finished Goods, active inventory, Traceability search, Recall Readiness, and private evidence metadata/download.
- Verify mobile 390 px and desktop routes, chunk loading, error boundary, and browser console.
- Verify Owner A cannot observe Owner B and direct legacy/ledger writes remain denied.

## Controlled-write smoke

Run only after separate approval with named disposable fixtures. Exercise one low-risk idempotent repository write, retry it, confirm revision/event identity, and clean up only through an authorized controlled lifecycle. Never consume inventory, create opening movements, block/dispatch/destroy stock, notify, or execute recall.

## Validation timeline

| Time | Required evidence |
|---|---|
| Immediately after migration | head, object counts, grants/RLS/functions, Auth/Storage, two-owner proof, no-write and performance smoke |
| Immediately after frontend | artifact/chunks/deep links/version, Auth/API compatibility, critical routes, desktop/mobile |
| After controlled writes | idempotency, revision, event/snapshot identity, no duplicate movement/opening receipt, isolation |
| After 24 hours | frontend/RPC/Auth/Storage error rates, slow queries, advisor changes, user reports, integrity audits, backup and monitoring state |

HTTP 200, migration success, or green advisors alone do not establish application success.
