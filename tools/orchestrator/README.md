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
If the persisted turn already completed, recovery records its redacted final
agent message and compact command evidence without starting a duplicate turn.
A completed-turn artifact is persisted before workspace inspection and result
publication, so restart can reconstruct the same check states and final report.
For an interrupted turn with a started command but no observed
`item/completed`, restart reads the exact thread/turn/item state and binds any
authoritative terminal evidence to one schema-versioned terminality
reconciliation record. Missing or contradictory evidence finalizes the
instruction as `terminality_unprovable`; it never opens a replacement turn.
`action: continue` reuses that context;
`action: start` deliberately creates a fresh instruction-specific worktree and
thread.

Durable per-issue run history, a repository-wide instruction claim ledger, and
existing `agent_result` comments suppress replay. File locks cover both the
origin issue and globally unique `instruction_id`, so overlapping polls and
process restarts cannot start the same instruction twice. Within the bounded
candidate set, issues and their unconsumed instructions are processed
oldest-first; a failure or owner stop on one issue does not stop the scanner
from considering the next issue.

GitHub's issue `updated_at` value is persisted after a detail read. Unchanged
search results are skipped on later polls except for persisted `needs_review`,
`needs_owner`, and `failed` tasks, whose comments are refreshed because a new
comment does not reliably advance the issue watermark. Durable run history and
instruction claims still consume each continuation at most once.

### Supported local-process trust boundary

This is a personal, single-owner service running as one authenticated macOS
user. Its supported isolation boundary covers cooperating current, stale, and
restarted orchestrator processes; crashes; accidental concurrency; malformed,
duplicated, or replayed durable work; result-publication mistakes; owner-gate
mistakes; and cross-task or cross-worktree confusion. The fixed, content-bound
mutation broker and every orchestrator process cooperate on the same advisory
lock, and the broker retains that lock from final validation through the exact
local mutation and post-state verification.

Arbitrary unrelated applications already running as that same logged-in macOS
user are outside this isolation boundary. Such a process already has the
owner's filesystem authority and can bypass cooperative advisory locks. This
assumption must not be used to weaken descriptor pinning, CAS, durable intent
and receipt binding, replay protection, sibling-worktree denial, or any other
orchestrator invariant within the supported boundary.

## Making an issue eligible

A new task must be an open GitHub issue, not a pull request, and its **issue
body** must contain a valid fenced YAML `agent_control` block. The body
requirement makes the issue discoverable by the bounded repository search.
Ordinary prose, a bare `agent_control` word, malformed blocks, and pull requests
are ignored. After first pickup, fresh follow-up blocks may be added as comments
because the issue then has durable local state.

Use a repository-wide unique `instruction_id`. Eligibility is explicit:

- `action: start` accepts `task_state: ready` or `failed` and creates a new
  isolated worktree/thread.
- `action: continue` accepts `ready`, `failed`, `needs_review`, or
  `needs_owner` and reuses the issue's persisted worktree/thread.
- `action: stop` consumes the explicit stop without starting a Codex turn.

`owner_approval_required: true` always produces `needs_owner`. The effective
turn limit is the lower of the issue's `max_turns` and the local service limit.
See `docs/agent-orchestration/AGENT_TASK_TEMPLATE.md` for the exact shape.

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

A stopped-service recovery can scope a repository one-shot to one exact durable
task without scanning or loading unrelated issue state by adding `--issue N` to
`orchestrator:repository:once`. Omitting `--issue` preserves repository-wide
discovery.

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
always requires explicit bounded owner approval. The non-mutating preview is:

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
  --discovery-limit 50 \
  --max-tasks-per-poll 4 \
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
  --discovery-limit 50 \
  --max-tasks-per-poll 4 \
  --auto-commit
```

The installer fails before launchd mutation unless Node and Codex are
executable and `--checkout` is a stable coordinating checkout. It validates the
generated plist before replacing the prior file, writes it atomically with mode
`0600`, waits for an old instance to unload, retries bounded launchd bootstrap
races, and restores the previous plist/service if the new bootstrap fails. It
first copies the audited orchestrator source from the validated
`<checkout>/tools/orchestrator` directory to an immutable content-addressed
release under the state root. The installer never treats the release that
launched it as update source. The stable checkout must therefore be updated to
the reviewed commit before an approved install. The LaunchAgent executes the
new release, not a task worktree, while `WorkingDirectory` remains the stable
coordinating checkout. No credentials are written to the release or plist.

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

The active executable appears in `launchctl print` under `arguments` and has
this stable shape:

```text
~/Library/Application Support/Koalafrog Orchestrator/runtime/releases/<sha256>/bin/repository-orchestrator.mjs
```

Repository-wide claim records are mode-`0600` JSON files under
`repository-queue/instructions/`. Per-issue state and event logs remain in
`Sillyquack-koalafrog-hq-issue-<number>/`; both `agent_pickup` and
`agent_result` packets include the origin issue number/URL and are posted only
to that issue by the orchestrator. Executed checks use `pass`, `fail`, or
`unknown`; `not_run` is reserved for checks proven not to have started. The
packet also carries the redacted completed-turn artifact and extracted blocker,
owner-gate, production-readback, safety, and branch/push findings.

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

For an App Server `requestApproval`, the follow-up must explicitly approve the
exact pending action. The service binds that decision to both the normalized
action scope and the exact pending-reason digest, persists a 24-hour expiry,
and consumes it before replying `decision: accept` through the App Server
protocol. Before an unmatched command approval is stopped, its App Server
request/turn/item identity and exact scope are persisted; the live request is
then answered with `decision: cancel`, which also interrupts that turn. A later
matching continuation starts a fresh turn in the same Codex thread/worktree and
can consume the decision only when it recreates that exact action. Successful
completion of the approved command clears the pending action. A failed command
retains the audit record but cannot reuse the consumed decision.

On upgrade from schema-1 state, unresolved interrupted approvals can be
reconstructed from the redacted local event history before their
machine-readable owner continuations are registered; the reconstructed request
and one-time decision are then persisted in schema-4 state. A consumed,
expired, replayed, reworded, mismatched, broader, or protected
production/destructive request fails closed and cannot borrow another decision.

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
- Constraint, exclusion, and prohibition language is classified by intent and
  is not treated as an affirmative request merely because it names a protected
  action; ambiguous or affirmative protected actions still fail closed.
- The service never deploys, merges, force-pushes, or resolves owner questions.
- `max_turns`, per-turn timeout, bounded retries, and exponential backoff are
  enforced locally even if the issue asks for larger limits.
- A timed-out turn must report a matching terminal completion after interruption,
  and every observed command execution from that turn must also be terminal,
  before a retry can start. Missing command-terminal evidence fails closed;
  restart recovery uses only authoritative `item/completed` protocol evidence
  or exact `thread/read` item state. Process absence, elapsed time, silence,
  EOF, timeout, `terminalInteraction`, and lack of later output are never
  terminal proof. If terminality remains unprovable or evidence conflicts, the
  existing instruction is durably finalized for review without retry,
  auto-commit, reset, or worktree cleanup.
- Durable history plus GitHub result comments consume each `instruction_id` at
  most once unless an audited local retry marker explicitly reopens it.
