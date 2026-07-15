# Production cutover runbook

Phase 8B.3A establishes readiness; hosted promotion is a separate, deliberate operation. Local remains the default until every preflight item passes.

## Hosted setup and preflight

1. Create or select the private Supabase project, apply every checked-in migration in order, and confirm the private `compliance-documents` bucket and RLS policies exist.
2. Disable public sign-up. Create the single owner through the Supabase administrative console and require a strong unique password. Never place a service-role key in Vite, source control, browser storage, logs, or a backup.
3. Configure only `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and initially `VITE_WORKSPACE_REPOSITORY=local` in the deployment environment. Confirm HTTPS and the expected Auth redirect origins.
4. On a clean local stack run `npx supabase db reset`, `npm test`, `npm run test:supabase`, `npm run test:secrets`, `npm run lint`, and `npm run build`. The two-user suite must prove table, relationship, RPC, and Storage isolation.
5. Sign in as the owner, export the local v9 JSON rollback backup, validate it, and store it offline. Export any existing private binaries separately according to `BACKUP_AND_RESTORE.md`.

## Import, reconciliation, and activation

1. In Local mode open `/platform`, run the v9 dry run, and resolve every blocking error.
2. Import once into the owner's empty relational workspace. Do not merge into populated tables.
3. Compare every collection count and ID plus raw-material/packaging/finished-goods ledgers, Production historical costs, Compliance configuration references, and Launch history.
4. A complete comparison calls `complete_v9_reconciliation`, records the report, and atomically changes the workspace lifecycle to `active`. An incomplete comparison leaves it non-active. A failed transaction leaves no partial domain graph and records a separate failed migration report.
5. Capture the migration run ID, timestamps, comparison report, source backup name/hash, deployed commit, database migration list, and operator identity as cutover evidence.

## Promote and verify

Set `VITE_WORKSPACE_REPOSITORY=supabase`, rebuild/redeploy, and start a fresh browser session. Confirm Auth gate, remote loading state, dashboard counts, representative Product/Formula, Inventory ledger, Lab/Production allocation, Costing, Packaging/Finished Goods, Compliance/Launch records, private document download, logout, and a full browser refresh after a persisted mutation. Check desktop and 390px layouts and require a clean browser console. The runtime must show a controlled error for missing/non-active remote state and must never expose editable Local data.

## Failure and rollback

Stop promotion if migration, reconciliation, RLS/Storage tests, document sampling, refresh persistence, or UI checks fail. Keep the deployment in Local mode or restore the previous deployment configuration; do not manually mark a workspace active. Preserve the failed migration report and database logs. Diagnose against a new empty local project, fix through a reviewed migration/code change, rerun the complete preflight, then retry with an empty hosted destination or a formally restored snapshot. The untouched local v9 export is the rollback source, never a concurrent editable authority.

After promotion, rollback means redeploying the previous known-good application/configuration and restoring the reviewed database/Storage snapshot if hosted data was mutated. Never combine divergent Local and Supabase edits or overwrite the active workspace with an unreviewed JSON file.
