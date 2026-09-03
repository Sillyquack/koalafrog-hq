# Watcher v2 Status

As of 2026-09-03:

- **Watcher v2:** PRODUCTION EXECUTION VALIDATED
- **Production validation:** ISSUE #86 TERMINALLY CLOSED
- **RunAtLoad:** VALIDATED (`true` in the promoted profile)
- **KeepAlive:** ABSENT BY DESIGN
- **Service-wide auto-commit:** DISABLED
- **Current eligible issues:** ZERO
- **Current service state:** stopped / launchd target unloaded

## Canonical production baseline

- Repository: `Sillyquack/koalafrog-hq`
- Source commit: `9e4310104a2adea44ed4446514a415f66d87e3c6`
- Source tree: `1943d89cbc765f62d89b36862ce447a7b03127b4`
- Immutable runtime: `6af56037d1444e9e20593cce6700de6ea2615fc758c5a5ca48627d39dd012f1e`
- Manifest SHA-256: `757ce443ee0d54fe151b048914820bc78d540da2c030d7eeb77fdfcffa8c77e9`
- Service-configuration SHA-256: `1c4a68eef28e9d57e68ae21aab90ba16f9a1acc320804948bda1e75e22d414ac`
- Installed plist SHA-256: `93a6156fe2e70e71e2232fd4a457d1120c5fc9d966d130446177c4f038041ae4`
- Required label: `koalafrog-orchestrator`

The installed profile has `RunAtLoad=true`, no `KeepAlive`, and no
service-wide `--auto-commit`. GUI login starts the watcher once; zero labeled
issues means idle polling only. Controlled bootout does not cause a same-session
restart, while a later GUI login loads the service again.

## Production-validation result

Promotion and production validation established the complete operating path:

- disabled installation, `start-installed`, active RunAtLoad promotion, and
  genuine GUI-login auto-start passed strict launchd/xpcproxy, executable,
  structured-argv, health, PID, and launch-count verification;
- authoritative issue hydration and final live-label admission prevented
  summary or cached label metadata from granting execution;
- Issue #86's interrupted `-001` lifecycle was reconciled append-only after
  accepting `shutdown_requested`, preserving its original thread, turn, and
  queue failure history;
- schema-12 historical terminal-closeout evidence remains valid under the
  explicit schema-12/schema-13 replay contract;
- the fresh `-002` production control produced exactly one claim, pickup,
  thread, turn, and `needs_review` result, with zero retries and zero mutation
  authority;
- two labeled idle polls, label revocation, one empty revoked poll, controlled
  bootout, and stopped stability all passed; and
- terminal closeout advanced Issue #86 without a claim, pickup, thread, turn,
  run, retry, or other task execution.

Issue #86 is now GitHub `closed/completed` and durable schema 13 revision 23,
`status: done`, `originIssueClosed: true`, and `activeInstruction: null`. The
final state SHA-256 is
`4946465ae25c08f996b9eecf101f04d2683a82c6846035ba12e4793eccda09c1`.
Its immutable closeout record is
`task-terminal-closeout:354bf690afa6b977d4db79c887277fa1600a625b64f080275c7e5f4f36550b38`.

Concise sealed evidence is retained in the local operator evidence tree:

- Production execution post-snapshot SHA-256:
  `8f895817bf6fc6d19b131c33e6321494de550b079bec337822af64693adc3144`
- Terminal closeout post-snapshot SHA-256:
  `82b672d399b807888c8eee08e2510c28713896e58b538d1bc90847bd33e6899d`

## Current enforced invariants

The production path now enforces strict launchd/xpcproxy identity,
authoritative issue hydration, installed-profile verified startup,
`shutdown_requested` settlement without retry inflation, append-only queue
failure history across claims, and explicit historical terminal-closeout schema
compatibility. These are current behavior, not unresolved enrollment blockers.

Issue #82 remains synthetic promotion evidence. Issues #68 and #71 must never
be enrolled without reconciliation. The complete legacy classification and the
normal controlled-production procedure are maintained in `NEXT.md` and
`CONTROL_PLANE.md`.
