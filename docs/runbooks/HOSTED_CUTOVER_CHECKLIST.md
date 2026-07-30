# Hosted cutover checklist

This checklist is evidence-only. It does not authorize deployment or remote migration.

- Confirm the reviewed commit SHA and migration list.
- Capture a hosted database backup identifier and restoration owner.
- Verify environment variables contain publishable browser credentials only.
- Run migration dry-run and database lint against the target project.
- Compare generated database, RPC, privilege, FK, event, browser-write, and legacy inventories.
- Execute two-owner isolation and controlled-write tests.
- Reconcile v9 counts and checksums before activating relational authority.
- Smoke dashboard, Production, Packaging, Finished Goods, Traceability, Compliance, and document access.
- Record Cloudflare SPA/deep-link results.
- Record rollback trigger, decision owner, and maximum tolerated outage.
- Do not remove legacy structures during cutover.
- Obtain explicit owner approval before applying remote migrations or deploying.
