const diagnosticToken = ["ghp", "123456789012345678901234567890123456"].join("_")

export const issue63CloseoutFinalMessage = `Issue #63 closeout is review-ready.

Validation
- TypeScript/typecheck: passed
- ESLint: passed
- Focused equipment/formula tests: passed
- Full suite: 1,049 passed, 66 skipped; 145 files passed, 15 skipped
- Cloudflare readiness: passed
- Production build: passed
- git diff --check: passed

Production readback: all four Aromantic receipts and lots 5507-161, 3877-222, 1585-270, and 3947-372 were verified read-only; no duplicate receipts, partial writes, or unrelated receipt mutations were found.
Concurrency safety: no old or overlapping command execution remains active.
Branch/push state: agent/issue-63-production-day1-stock-equipment-001 was pushed normally at a74079be88ec4a8b36b850f95dca791ff42e4e80; the reviewed branch still diverges from origin/main.
Blocker: the Supabase migration remains unapplied.
Remaining owner gate: review and explicit approval are required before any deployment or production migration.
Diagnostic token: ${diagnosticToken}`
