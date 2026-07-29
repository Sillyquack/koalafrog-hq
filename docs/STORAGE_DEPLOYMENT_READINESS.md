# Storage deployment readiness

| Bucket | Visibility | Ownership path | Purpose | Hosted verification |
|---|---|---|---|---|
| `compliance-documents` | private | first path segment is `auth.uid()` | compliance evidence documents | bucket limits, MIME policy, owner read/insert/delete, authenticated download |
| `beard-analysis-images` | private | documented analysis/owner prefix | temporary/private analysis images | allowed images, size, retention, cleanup, owner and function access |

Verify exact bucket inventory, `public=false`, naming convention, workspace/owner prefixes, allowed MIME types and sizes, upload/select/update/delete requirements, signed URL expiry where used, retention, orphan detection, metadata-to-binary reconciliation, backup, restore, and service-role access.

Compliance metadata remains relational and audit-retained; binaries remain private and are never Base64 or public URLs. Beard analysis cleanup must not delete another owner’s objects. Content hashes and object sizes are evidence when available.

Stop for a public bucket, broad path policy, cross-owner read/write, missing private object, orphan discrepancy without disposition, unexpected signed-URL lifetime, unbounded upload, leaked service role, failed backup/restore, or destructive cleanup ambiguity.

Local preparation creates or mutates no hosted bucket.
