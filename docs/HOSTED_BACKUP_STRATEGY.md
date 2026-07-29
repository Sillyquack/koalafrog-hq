# Hosted backup strategy and completeness checklist

This strategy defines future evidence; it makes no claim about the enabled managed-backup product or retention on a hosted project. Verify those facts in the authorized rehearsal.

## Backup package

| Surface | Required capture | Verification |
|---|---|---|
| Git/application | RC tag, commit, lockfile, built artifact hashes | tag dereferences to `bd5617c`; reproducible build |
| Database schema | schemas, extensions, tables, functions, policies, grants, sequences, triggers, indexes, migration state | checksums plus object inventory |
| Database data | relational rows including immutable ledgers/events | table row counts and selected immutable-table checksums |
| Auth | configuration record and supported identity backup/export evidence | owner counts/IDs and restore limitations |
| Storage metadata | buckets, policies, `storage.objects`, application metadata | bucket/object counts and paths |
| Storage binaries | encrypted export of private objects | object count, size, content hash where available |
| Environment | variable names/classifications and secret-manager version references | no values in Git; two-person review |
| External configuration | Auth callbacks, DNS/Cloudflare, provider webhooks/schedulers | screenshots/export with secrets redacted |

Managed backup, logical dump, schema-only dump, application JSON export, Storage binary export, Auth evidence, Git source, and environment configuration are separate artifacts. None proves the others.

## Handling

Use an encrypted access-controlled destination, least-privilege operator, dated name containing environment, UTC timestamp, pre-migration head, and RC tag. Record SHA-256 checksums, byte sizes, tool versions, owner, retention/expiry, restore destination, and deletion approval. Keep private evidence outside source control.

## Completeness checklist

- [ ] Target identity and backup timestamp verified.
- [ ] Git commit/tag and migration head captured.
- [ ] Schema, extensions, tables, functions, policies, grants, sequences, triggers, indexes captured.
- [ ] All table data or approved exclusions recorded.
- [ ] Immutable ledger/event row counts and selected checksums captured.
- [ ] Auth identities and configuration captured using a supported method.
- [ ] `compliance-documents` and `beard-analysis-images` metadata and private objects captured.
- [ ] Removed/superseded metadata retained; missing binaries explained.
- [ ] Environment names and secret-version references recorded without values.
- [ ] Artifact checksums, encryption, access list, retention, and restore instructions verified.
- [ ] Independent reviewer signs completeness before migration begins.

Incomplete or unverifiable backup is an immediate stop.
