# Koalafrog local Codex orchestrator

This repo-local Node service implements the bootstrap bridge in
`docs/agent-orchestration/`. Its normal runtime scans the repository's open
GitHub issues for `agent_control` YAML blocks, creates isolated Git worktrees,
starts or resumes Codex App Server threads, persists runtime events, and posts
structured `agent_result` comments. Completion always stops at `needs_review`.

The service does not automate the desktop GUI. Both Codex and the connected
GitHub app are reached through the installed, authenticated `codex app-server`
process. No GitHub or OpenAI token is copied into the repository or local state.

## Runtime shape

The default state root is
`~/Library/Application Support/Koalafrog Orchestrator/`. Each issue gets:

- `state.json`: atomic durable task, workspace, instruction, turn, and thread linkage
- `events.jsonl`: redacted decisions and structured App Server events
- `app-server.stderr.log`: protocol stderr kept separate from JSONL stdout
- `workspaces/issue-<number>-<instruction>`: preserved task worktrees

An instruction and turn ID are persisted before work continues. After a process
restart or crash, the runtime reopens the same state, worktree, and Codex thread.
If the persisted turn already completed, recovery records its result without
starting a duplicate turn. `action: continue` reuses that context;
`action: start` deliberately creates a fresh instruction-specific worktree and
thread.

Durable run history and existing `agent_result` comments suppress replay. The
newest unconsumed control block is selected, while an older pending instruction
cannot be stranded merely because a newer instruction was already consumed.

## Local start

Requirements:

- the repository is synchronized with `origin`
- Node 22.16 or newer
- the authenticated Codex CLI bundled with the ChatGPT desktop app
- the GitHub app connected and enabled in ChatGPT/Codex

From the stable coordinating checkout (its `.git` must be a directory, not the
pointer file used by a linked task worktree):

```sh
npm run test:orchestrator
npm run orchestrator:repository:once -- \
  --checkout "$PWD" \
  --codex-bin /Applications/ChatGPT.app/Contents/Resources/codex
```

Run the repository scanner continuously for foreground diagnosis:

```sh
npm run orchestrator:repository:watch -- \
  --checkout "$PWD" \
  --codex-bin /Applications/ChatGPT.app/Contents/Resources/codex
```

Press `Ctrl-C` for a graceful stop. The current state, worktrees, and Codex
threads are preserved for the next start. The LaunchAgent below is the normal
hands-off runtime; these commands remain useful for diagnosis.

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

The supported persistent runtime is the per-user LaunchAgent
`com.sillyquack.koalafrog-orchestrator`. It starts after login, runs the
repository-wide watcher without VS Code or an open Terminal, and launchd
restarts it after an unexpected non-zero exit. It does not require or copy a
GitHub/OpenAI token: the service launches the existing authenticated Codex
binary and uses its connected GitHub app.

Installing or enabling the LaunchAgent mutates the owner's Mac and therefore
requires a separate explicit approval. Do not run `install` as part of code
review. The non-mutating preview is:

```sh
npm run --silent orchestrator:service -- render \
  --checkout "/absolute/path/to/stable/koalafrog-hq" \
  --codex-bin /Applications/ChatGPT.app/Contents/Resources/codex \
  --node-bin "$(command -v node)" \
  --poll-ms 15000 \
  --max-turns 12 \
  --turn-timeout-ms 1200000 \
  --max-retries 2 \
  --retry-base-ms 1000 \
  --auto-commit | plutil -lint -
```

After that separate owner approval, use the same audited values with
`install`:

```sh
npm run orchestrator:service -- install \
  --checkout "/absolute/path/to/stable/koalafrog-hq" \
  --codex-bin /Applications/ChatGPT.app/Contents/Resources/codex \
  --node-bin "$(command -v node)" \
  --poll-ms 15000 \
  --max-turns 12 \
  --turn-timeout-ms 1200000 \
  --max-retries 2 \
  --retry-base-ms 1000 \
  --auto-commit
```

The installer fails before launchd mutation unless Node and Codex are
executable and `--checkout` is a stable coordinating checkout. It validates the
generated plist before replacing the prior file, writes it atomically with mode
`0600`, waits for an old instance to unload, retries bounded launchd bootstrap
races, and restores the previous plist/service if the new bootstrap fails.

It writes and loads:

```text
~/Library/LaunchAgents/com.sillyquack.koalafrog-orchestrator.plist
```

Inspect the service and redacted logs with:

```sh
npm run orchestrator:service -- status
launchctl print gui/$(id -u)/com.sillyquack.koalafrog-orchestrator
tail -n 40 ~/Library/Application\ Support/Koalafrog\ Orchestrator/service/orchestrator.stdout.log
tail -n 40 ~/Library/Application\ Support/Koalafrog\ Orchestrator/service/orchestrator.stderr.log
```

An explicitly approved uninstall stops only this label and preserves all task
state and worktrees:

```sh
npm run orchestrator:service -- uninstall
```

The checked-in plist is an explanatory example. The service command is the
canonical generator and install path.

## Owner stops and follow-ups

`needs_owner` and `needs_review` are report states, not reasons for the watcher
to exit. The LaunchAgent keeps polling GitHub. To resume after `needs_owner`, the
owner adds a fresh, uniquely identified `agent_control` block with the bounded
approval and `action: continue`; the next poll reuses the persisted Codex thread
and worktree. No `repository:once` command is needed. A materially new task uses
`action: start` to receive a clean context.

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
- `max_turns`, per-turn timeout, bounded retries, and exponential backoff are
  enforced locally even if the issue asks for larger limits.
- Durable history plus GitHub result comments consume each `instruction_id` at
  most once unless an audited local retry marker explicitly reopens it.
