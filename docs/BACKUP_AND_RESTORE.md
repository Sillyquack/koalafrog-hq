# Backup and restore

Phase 9B backup also includes Intelligence threads/runs and normalized usage, Knowledge references, Scent Memory sessions, and every checkpoint revision. These remain relational JSON records; no prompt/response copy is introduced by Knowledge and no binary content is placed in JSON.

`Export Koalafrog Backup` creates versioned JSON containing entity counts, all workspace records, relationship IDs, and an owner-scoped Storage manifest. In Supabase mode the manifest is queried from `document_objects` at export time and includes every Current, Superseded, and Removed version with path, size, MIME type, version, checksum when available, and upload timestamp. It contains no authentication secrets or signed/public URLs.

A JSON/database export is not a complete backup. Export the authenticated private objects named by all non-Removed manifest rows separately, preserving their exact paths, and verify file counts/checksums where present. A Removed row is retained audit metadata and may legitimately have no binary. The UI explicitly states that binaries are not included.

Import tooling validates format, metadata, counts, and malformed JSON. It does not casually overwrite a live workspace. Full destructive restore remains an administrative procedure: validate into an empty local Supabase project, reconcile, then promote through an explicitly reviewed deployment process.

Restore order is Auth owner → empty workspace/schema → relational JSON/import → reconciliation → private binaries at their manifest paths → authenticated sample downloads → activation. Never activate when counts, IDs, ledger/cost reconciliation, or required binaries disagree.
