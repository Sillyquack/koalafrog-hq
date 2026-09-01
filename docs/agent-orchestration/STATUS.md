# Watcher v2 Status

As of 2026-09-01:

- **Watcher v2:** PROMOTED
- **RunAtLoad:** VALIDATED (`true` in the promoted profile)
- **KeepAlive:** ABSENT BY DESIGN
- **Service-wide auto-commit:** DISABLED
- **Production enrollment:** NOT YET AUTHORIZED
- **Current eligible issues:** ZERO
- **Current service state:** stopped / launchd target unloaded

## Canonical promoted baseline

- Repository: `Sillyquack/koalafrog-hq`
- Source commit: `7d4d30d934f841c08f11268c20dae922ea02f0f6`
- Source tree: `cf9c49d3928f4d171bcef7ed11d92677bd39c5d0`
- Immutable runtime: `a6154683806d26b2c5fb6aac53ebf1f32ba8731f77980bd2d96a76aab671803b`
- Manifest SHA-256: `52c61c0950712d005e9ca3772f4fa3dfae9b34a435db2a65208b319a60d36724`
- Service-configuration SHA-256: `f152e08bcd4c3a8767b9329940cf010a4cfb6abf58ac0a77aed4d1bc7c640fb2`
- Installed plist SHA-256: `d00ecc33b70ee95b7b435b85b09e1056260d7b6eef257a21001f91f5bff2985a`
- Stopped health SHA-256: `bf788136cd0d6f8f67f9fa5f07e634c84c3a38fb27a1bb1234517c23b4089a10`
- Required label: `koalafrog-orchestrator`

The installed profile has `RunAtLoad=true`, no `KeepAlive`, and no
service-wide `--auto-commit`. GUI login starts the watcher once; zero eligible
labels means idle polling only. Controlled bootout does not cause a same-session
restart, while a later GUI login loads the service again.

## Validated promotion evidence

Promotion validated the canonical immutable runtime, disabled installation,
verified manual start, strict Darwin/xpcproxy process identity, authoritative
live-label admission, and zero-read isolation for unlabeled legacy state. The
synthetic Issue #82 installed-service lifecycle completed once, its label was
revoked, and controlled bootout completed without leakage.

RunAtLoad Phase A validated the explicitly approved active installation. Phase
B validated genuine GUI-login automatic startup, zero-eligibility idle polls,
controlled shutdown after automatic startup, and no same-session restart.
Concise immutable snapshots are retained at:

- Phase A post-validation:
  `service/disabled/watcher-v2-trials/runatload-phase-a/2026-09-01T15-55-16.311Z/phase-a-post-snapshot.json`
  (SHA-256 `018d616ed7ac95fb3430defffbd2ed16361decbf9722c571e67dfba805e86536`)
- Phase B final:
  `service/disabled/watcher-v2-trials/runatload-phase-b/2026-09-01T20-23-14.489Z/phase-b-final-snapshot.json`
  (SHA-256 `87ad1cfda37c6ddd0261af4dba705ce44113658b58896695f7ba27f3b9ce3959`)

No real production issue has been enrolled. Applying the required label is the
separate execution-authorization gate described in `CONTROL_PLANE.md`.

## Synthetic Issue #82

Issue #82 remains intentionally open, unlabeled, `needs_review`, with no active
instruction. It is retained temporarily as promotion evidence, not production
work. Its later closeout sequence is: confirm exact state/revision, close the
GitHub issue, publish one exact revision-bound terminal-closeout control, run
bounded terminal closeout, and verify durable `done` plus
`originIssueClosed=true`.
