# Koalafrog local Codex orchestrator

This repo-local Node service implements the bootstrap bridge in
`docs/agent-orchestration/`. It polls the latest `agent_control` YAML block on a
configured GitHub issue, creates one isolated Git worktree, starts or resumes a
Codex App Server thread, persists runtime events, and posts a structured
`agent_result` comment. Completion always stops at `needs_review`.

The service does not automate the desktop GUI. Both Codex and the connected
GitHub app are reached through the installed, authenticated `codex app-server`
process. No GitHub or OpenAI token is copied into the repository or local state.

## Runtime shape

The default state root is
`~/Library/Application Support/Koalafrog Orchestrator/`. Each issue gets:

- `state.json`: atomic durable task, workspace, instruction, turn, and thread linkage
- `events.jsonl`: redacted decisions and structured App Server events
- `app-server.stderr.log`: protocol stderr kept separate from JSONL stdout
- `workspaces/issue-<number>`: the preserved task worktree

An instruction is selected and persisted before a turn starts. A restart reuses
the workspace and calls `thread/resume` with the stored thread ID. A new
`action: start` receives a fresh thread and instruction-specific worktree, while
`action: continue` reuses the persisted context. Result posting is idempotent:
before posting, the service checks issue comments for an existing `agent_result`
with the same `instruction_id`. Durable run history also lets the poller select
an older pending instruction when a newer follow-up has already been consumed.

## Local start

Requirements:

- the repository is synchronized with `origin`
- Node 22.16 or newer
- the authenticated Codex CLI bundled with the ChatGPT desktop app
- the GitHub app connected and enabled in ChatGPT/Codex

From the coordinating checkout (not a task worktree):

```sh
npm run test:orchestrator
npm run orchestrator:once -- \
  --checkout "$PWD" \
  --codex-bin /Applications/ChatGPT.app/Contents/Resources/codex
```

Run continuously with the same options:

```sh
npm run orchestrator:watch -- \
  --checkout "$PWD" \
  --codex-bin /Applications/ChatGPT.app/Contents/Resources/codex
```

Press `Ctrl-C` for a graceful stop. The current state, worktree, and Codex
thread are preserved for the next start.

Use `node tools/orchestrator/bin/orchestrator.mjs help` for every bounded-turn,
timeout, retry, polling, model, state, and worktree option.

## Proof-of-life mode

The bootstrap acceptance run should add a fresh issue comment containing a
machine-readable instruction that permits only
`docs/agent-orchestration/PROOF_OF_LIFE.md`. Then run:

```sh
npm run orchestrator:once -- \
  --checkout "$PWD" \
  --codex-bin /Applications/ChatGPT.app/Contents/Resources/codex \
  --state-dir /absolute/private/state/path \
  --allowed-path docs/agent-orchestration/PROOF_OF_LIFE.md \
  --auto-commit
```

After the first `needs_review` result, add a new `action: continue` block to the
same issue and run the identical command again. The second result must show the
same `codex_thread_id`. The allowed-path check fails closed before auto-commit if
Codex touches any other file.

## macOS service

The supported persistence path is the per-user LaunchAgent
`com.sillyquack.koalafrog-orchestrator`. It starts after login, stays independent
of the terminal or Codex chat that installed it, and is restarted by launchd
after an unexpected exit. The coordinating checkout and this orchestrator
worktree must remain at their configured absolute paths.

Preview the generated plist before installing it:

```sh
npm run orchestrator:service -- render \
  --checkout "$PWD" \
  --codex-bin /Applications/ChatGPT.app/Contents/Resources/codex
```

Install or idempotently reload the single service label:

```sh
npm run orchestrator:service -- install \
  --checkout "$PWD" \
  --codex-bin /Applications/ChatGPT.app/Contents/Resources/codex \
  --poll-ms 15000 \
  --max-turns 12 \
  --turn-timeout-ms 1200000 \
  --max-retries 2 \
  --retry-base-ms 1000 \
  --auto-commit
```

The installer writes and loads:

```text
~/Library/LaunchAgents/com.sillyquack.koalafrog-orchestrator.plist
```

It stores no token, key, password, or copied credential in the plist. The
LaunchAgent runs the authenticated local Codex binary, which in turn uses the
existing connected GitHub app. Durable task state defaults to
`~/Library/Application Support/Koalafrog Orchestrator/`.

Inspect both the generated file and live launchd state:

```sh
plutil -lint ~/Library/LaunchAgents/com.sillyquack.koalafrog-orchestrator.plist
npm run orchestrator:service -- status
launchctl print gui/$(id -u)/com.sillyquack.koalafrog-orchestrator
```

The default service logs are:

```text
~/Library/Application Support/Koalafrog Orchestrator/service/orchestrator.stdout.log
~/Library/Application Support/Koalafrog Orchestrator/service/orchestrator.stderr.log
```

Task-level redacted event and App Server stderr logs remain below the per-issue
state directory described in Runtime shape. To watch startup without exposing
credentials:

```sh
tail -n 40 ~/Library/Application\ Support/Koalafrog\ Orchestrator/service/orchestrator.stdout.log
tail -n 40 ~/Library/Application\ Support/Koalafrog\ Orchestrator/service/orchestrator.stderr.log
```

Uninstall the LaunchAgent while preserving all task state and worktrees:

```sh
npm run orchestrator:service -- uninstall
```

For manual launchctl recovery, the equivalent load and unload commands are:

```sh
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.sillyquack.koalafrog-orchestrator.plist
launchctl bootout gui/$(id -u)/com.sillyquack.koalafrog-orchestrator
```

## Protocol compatibility

The implementation was verified against `codex-cli 0.148.0-alpha.9`. It uses
the stable JSONL handshake and methods generated by that installed CLI:
`initialize`, `initialized`, `thread/start`, `thread/resume`, `thread/read`,
`turn/start`, `turn/interrupt`, `turn/completed`, App Server approval/input
requests, and `mcpServer/tool/call`.

Regenerate the exact local schema after a Codex upgrade (generated files are
ignored):

```sh
cd tools/orchestrator
npm run schema:json
npm run schema:ts
```

## Safety boundary

- `owner_approval_required: true`, App Server approval requests, permission
  requests, MCP elicitations, and user-input requests stop at `needs_owner`.
- Production deploys, production migrations/data changes, credentials,
  payments, external accounts, destructive Git operations, and default-branch
  merges are owner-gated.
- The service never deploys, merges, force-pushes, or resolves owner questions.
- `max_turns` is enforced per `instruction_id`; the issue-wide turn count is
  retained only for durable observability. Per-turn timeout, bounded retries,
  and exponential backoff are enforced locally even if the issue asks for
  larger limits.
- The newest unconsumed fenced `agent_control` block is eligible, completed
  result comments and durable run history suppress replay, and each
  `instruction_id` is consumed at most once.
