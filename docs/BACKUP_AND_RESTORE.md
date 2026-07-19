# Backup and restore

Open **System → Platform** in the application sidebar to export or validate a Koalafrog workspace backup. The direct route remains `/platform`, and migration onboarding displays the same tools when a preserved local workspace is awaiting controlled import.

Koalafrog tracks three independent versions:

- **Application version** identifies the release that produced the export. It is metadata sourced from `package.json`; an older application version such as `0.1.0` does not invalidate an otherwise valid backup.
- **Workspace schema version** identifies the shape of the exported domain workspace. It remains `koalafrog-hq:workspace:v9`.
- **Backup format version** identifies the JSON envelope understood by backup validation. It remains `koalafrog-backup-v1`.

Application-version metadata is not a restore compatibility gate. Restore decisions depend on the backup format, workspace schema, record validation, reconciliation, and the controlled target environment.

Historical local workspace storage keys remain unchanged and ordered from the current v9 workspace through earlier local formats so preserved workspaces can still follow the established migration fallback path.

Phase 9B backup also includes Intelligence threads/runs and normalized usage, Knowledge references, Scent Memory sessions, and every checkpoint revision. These remain relational JSON records; no prompt/response copy is introduced by Knowledge and no binary content is placed in JSON.

Phase 10A backup includes Suppliers, contacts, research candidates, quotes and lines, stock policies, Purchase Plans and lines, Equipment, capabilities, policies, service events, and process requirements. Supplier and Equipment document metadata follows the private Storage boundary below; binaries are not embedded in JSON.

`Export Koalafrog Backup` creates versioned JSON containing entity counts, all workspace records, relationship IDs, and an owner-scoped Storage manifest. In Supabase mode the manifest is queried from `document_objects` at export time and includes every Current, Superseded, and Removed version with path, size, MIME type, version, checksum when available, and upload timestamp. It contains no authentication secrets or signed/public URLs.

A JSON/database export is not a complete backup. Export the authenticated private objects named by all non-Removed manifest rows separately, preserving their exact paths, and verify file counts/checksums where present. A Removed row is retained audit metadata and may legitimately have no binary. The UI explicitly states that binaries are not included.

A workspace JSON backup is a portable application-level record export with relationship IDs and a Storage manifest. A database backup is infrastructure-level recovery material for PostgreSQL and is used for disaster recovery or environment restoration. Neither substitutes for the other, and private Storage binaries must be handled separately.

Import tooling validates format, metadata, counts, and malformed JSON. It does not casually overwrite a live workspace. Full destructive restore remains an administrative procedure: validate into an empty local Supabase project, reconcile, then promote through an explicitly reviewed deployment process.

Restore order is Auth owner → empty workspace/schema → relational JSON/import → reconciliation → private binaries at their manifest paths → authenticated sample downloads → activation. Never activate when counts, IDs, ledger/cost reconciliation, or required binaries disagree.
# Bible operational note

The in-app Koalafrog Bible links here conceptually from Platform and Compliance. JSON backup contains relational/domain records and document metadata; private Storage binaries require the separate manifest/binary procedure below. Never describe a JSON-only export as a complete binary-document backup.
