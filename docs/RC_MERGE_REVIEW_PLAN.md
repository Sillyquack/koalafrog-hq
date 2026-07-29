# RC merge review plan

Target branch: local `main`, verified at `b54fff20d07658185b8ccd8d9d47559036e2c73f`. It is also the exact merge base. No real merge is performed by local preparation.

Preserve the audited feature commits and immutable RC tag. Review in this order: migration/schema authority; RLS/grants/functions; repositories/browser boundaries; lifecycle workflows; test/performance evidence; deployment preparation; documentation.

Hotspots are the 86-migration ordering, two destructive-syntax classifications, non-concurrent index/lock exposure, security-definer grants/search paths, three ledgers, quality opening movements, trace confidence, Recall non-execution, Auth/Storage configuration, and environment separation.

Pre-merge: fetch read-only after authorization, determine merge base/divergence, inspect conflicts, duplicate migration timestamps, lockfile/generated/config/routes/docs, then run `npm ci`, database reset, `npm run deploy:preflight`, full tests, and diff checks.

Recommended method: normal non-squash merge with an explicit merge commit (`--no-ff` or platform equivalent). The current graph otherwise fast-forwards and would omit a clear integration boundary. Do not move `finished-goods-traceability-recall-v1-rc1`; it remains the frozen pre-merge baseline. After merge, rerun local gates and create a distinct pre-deployment tag only after approval.

The completed local review, simulations, evidence, PR package, reviewer assignments, and authorization-separated commands are in [Controlled Merge Review & Branch Integration V1](CONTROLLED_MERGE_REVIEW_AND_BRANCH_INTEGRATION_V1.md).

If merge must be reverted, revert the merge commit in Git; do not assume this reverses any hosted schema. Production/hotfix/rollback tags and branches require separate governance.
