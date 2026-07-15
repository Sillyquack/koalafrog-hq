# Backup and restore

`Export Koalafrog Backup` creates versioned JSON containing entity counts, all workspace records, relationship IDs, document metadata, and a Storage manifest. It contains no authentication secrets.

A database-only export is not a complete backup. If the Storage manifest contains objects, export those authenticated private objects separately until complete archive bundling is implemented. The UI never claims a file is backed up when only metadata exists.

Import tooling validates format, metadata, counts, and malformed JSON. It does not casually overwrite a live workspace. Full destructive restore remains an administrative procedure: validate into an empty local Supabase project, reconcile, then promote through an explicitly reviewed deployment process.
