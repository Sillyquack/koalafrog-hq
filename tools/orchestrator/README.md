# Koalafrog local Codex orchestrator

This repo-local Node service implements the bootstrap bridge in
`docs/agent-orchestration/`. Its bounded runtime handles explicit issues. Its
Persistent Watcher v2 scans only opted-in open GitHub issues for
`agent_control` YAML blocks, creates isolated Git worktrees,
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

Durable per-issue run history, a repository-wide instruction claim ledger,
append-only quarantine/reopen/notification ledgers, and existing
`agent_result` comments suppress replay. File locks cover both the
origin issue and globally unique `instruction_id`, so overlapping polls and
process restarts cannot start the same instruction twice. Within the filtered
candidate set, issues and their unconsumed instructions are processed
oldest-first. Quarantined work stays visible in status but is not claimable and
does not consume the one-task fairness slot.

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

A new persistent-watch task must be an open GitHub issue, not a pull request,
carry the configured `koalafrog-orchestrator` label (or be in the explicit
service allowlist), and contain a valid fenced YAML `agent_control` block in its
**issue body**. Filtering happens before fairness and claim selection. Bounded
`once --issue N` remains label-independent. The body requirement makes the
control selectable; label-mode discovery also inventories currently labeled
issues so persisted continuation never depends on cached label metadata.
Ordinary prose, a bare `agent_control` word, malformed blocks, and pull requests
are ignored. After first pickup, fresh follow-up blocks may be added as comments
because the issue then has durable local state.

In required-label watch mode, live GitHub eligibility is resolved before any
persisted `state.json` is opened. Cached `originIssueLabels` never authorize
execution. The runtime revalidates the current label before the first task load
and again immediately before instruction claim. Removal before claim revokes
eligibility with no migration, retry/quarantine handling, notification, or
execution; lookup failure opens the repository discovery circuit instead of an
issue retry. Removal after an authoritative claim is not a mid-turn kill switch:
the active turn remains governed by existing control and graceful-shutdown
semantics. Allowlist entries intentionally bypass the label for only their
explicit IDs, while exact canary mode inspects only its exact issue and isolated
state root.

Use a repository-wide unique `instruction_id`. Eligibility is explicit:

- `action: start` accepts `task_state: ready` or `failed` and creates a new
  isolated worktree/thread.
- `action: continue` accepts `ready`, `failed`, `needs_review`, or
  `needs_owner` and reuses the issue's persisted worktree/thread.
- `action: stop` consumes the explicit stop without starting a Codex turn.

A normal stop preserves the existing non-terminal semantics. Durable `done`
requires a terminal closeout control in `needs_review`; see the control-plane
contract below.

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

Persistent watch fails closed unless it has a required label, explicit
allowlist, or one exact canary issue. A future approved foreground canary has
this shape, using a separate state directory and a fully identity-bound
immutable runtime:

```sh
npm run orchestrator:repository:watch -- \
  --checkout "$PWD" \
  --codex-bin /Applications/ChatGPT.app/Contents/Resources/codex \
  --state-dir /absolute/private/canary-state \
  --issue <canary-issue> \
  --max-tasks-per-poll 1 \
  --expected-runtime-release <sha256> \
  --expected-manifest-sha256 <sha256> \
  --expected-source-commit <git-sha> \
  --expected-source-tree <git-tree> \
  --expected-service-config-sha256 <sha256>
```

Press `Ctrl-C` for a graceful stop. Discovery and new claims stop immediately;
the active turn enters the authoritative cancellation path, durable evidence
and leases settle, and broker cleanup completes. The internal deadline is 75
seconds beneath launchd's 90-second `ExitTimeOut`. State, worktrees, and Codex
threads remain restart-safe.

A stopped-service recovery can scope a repository one-shot to one exact durable
task without scanning or loading unrelated issue state by adding `--issue N` to
`orchestrator:repository:once`. Omitting `--issue` preserves repository-wide
discovery.

An append-only instruction supersession must use this repository path because
target claim history is verified while the per-issue queue lease is held. The
later control declares a canonical `supersedes` list plus the exact
`expected_state_revision`. All targets retire in one state CAS transaction,
task status is unchanged, and selection waits until the idempotent
`instruction_superseded` audit events are durable. Supersession never requires
`watch` or `--auto-commit`; direct `orchestrator:once` rejects an unapplied
declaration. See `docs/agent-orchestration/CONTROL_PLANE.md` for the complete
contract and fail-closed target rules.

A terminal closeout is the only supported `needs_review -> done` transition.
It is deliberately narrower than normal repository execution: the control
must bind the exact current supported-state revision and last-consumed instruction, the
GitHub issue must already be closed, and the runtime must prove there are no
active claims, retries, mutation grants, broker receipts, or incomplete result
publications. It retires every remaining cross-state control and interrupted
approval request as append-only non-execution evidence in the same state CAS.
It never starts Codex or creates pickup/result/run/retry history.

Run it only as one explicit bounded issue:

```sh
npm run orchestrator:repository:once -- \
  --checkout "$PWD" \
  --codex-bin /Applications/ChatGPT.app/Contents/Resources/codex \
  --issue 70 \
  --terminal-closeout
```

`--terminal-closeout` requires `once`, an explicit `--issue`, and no
`--auto-commit`. It is never used by repository-wide watch. Closed issues stay
ineligible for every normal control path; the flag permits only readback and
validation of the terminal stop control. Schema 11 migrates once to schema 12
by adding an empty `terminalCloseouts` ledger and advancing the state revision;
older runtimes reject schema-12 state.

Watcher v2 never grants commit authority from service configuration. A control
may instead declare one exact `commit_authorization` binding: repository,
issue/instruction, linked task worktree, branch, expected HEAD, allowed paths,
one commit maximum, the generated commit-message SHA-256, and
`push_authorized: false`. The runtime rejects coordinating/parent/sibling
checkout mutation, `.git` ambiguity, gitlinks, path widening, repeated use, and
any staged file outside the allowlist. It stages only the named paths and
persists a post-commit receipt. Legacy `--auto-commit` remains parseable only
for explicitly bounded manual compatibility and is forbidden in watch.

Use `node tools/orchestrator/bin/orchestrator.mjs help` for every bounded-turn,
timeout, retry, polling, model, state, and worktree option.

## Canary proof of life

Persistent activation is canary-first. The canary uses a new synthetic issue,
`watch --issue N`, a separate state directory, one task per poll, no
`--auto-commit`, `RunAtLoad=false`, and no `KeepAlive`. Acceptance requires one
pickup, one Codex turn, one result, no unexpected Git mutation, restart without
duplication, graceful stop, and proof that no other issue was read or written.
The persistent service remains disabled until the canary and a second owner
approval are complete.

## Persistent Watcher v2 service

The v2 service profile is a per-user LaunchAgent named
`com.sillyquack.koalafrog-orchestrator`. It uses a dedicated coordinating clone
at `~/Library/Application Support/Koalafrog Orchestrator/coordinator/koalafrog-hq`,
an immutable release, a 60-second poll, `origin/main`, 12 turns, a 20-minute
turn deadline, two in-turn retries, discovery limit 50, one task per poll, and
the `koalafrog-orchestrator` opt-in label. Service-wide `--auto-commit` and
`KeepAlive` are absent.

Rendering is read-only and defaults to the canary policy:

```sh
npm run --silent orchestrator:service -- render | plutil -lint -
```

Rendering does not materialize a runtime or write a plist. The supported
fail-disabled installation stage is explicit:

```sh
npm run orchestrator:service -- install-disabled
```

`install-disabled` validates the clean canonical coordinator and immutable
runtime, performs service/plist/process coexistence checks, materializes and
verifies the release manifest, and atomically installs the linted plist with
mode `0600`. It then reads back the plist/hash and proves that the launchd
target and watcher/broker process tree remain absent. It never calls
`bootstrap`, `kickstart`, or `load`, rejects `--approve-run-at-load`, and does
not load task state or perform repository discovery. Repeating it with the same
identity is idempotent and reports the runtime and plist as unchanged.

The separate `install` command retains the explicit active-install path and may
bootstrap only after the same preparation succeeds. There is no flag or
fallthrough from `install-disabled` to that path.

The generated plist has `RunAtLoad=false`, no `KeepAlive`,
`ExitTimeOut=90`, `ThrottleInterval=60`, `ProcessType=Background`, and
`Umask=0077`. Only a separately approved active `render`/`install` may add
`--approve-run-at-load`; disabled installation rejects it and `KeepAlive`
remains absent.

The installer requires a clean coordinating checkout with the exact GitHub
origin. It rejects any dirty coordinator state, an already loaded service, a
running watcher/broker tree, and multiple active plist candidates. Disabled and
forensic plist copies are inactive evidence. It bundles the fixed allowlist to
`runtime/releases/<sha256>`, verifies the manifest and canonical commit/tree,
and writes the new plist atomically with mode `0600`.

An inactive plist at the canonical path is replaced only when its service label
matches and is preserved first as disabled evidence. If validation, inactive
readback, or bootstrap fails, the attempted and previous inactive plists,
runtime release, and diagnostics are preserved, the active plist is removed,
and the service remains disabled. The installer never bootstraps the previous
runtime or the newly materialized runtime as recovery. Rollback therefore means
service-disabled unless an owner separately approves a future restore mechanism.

At startup the watcher recomputes and requires the runtime release, manifest,
source commit/tree, repository, coordinator, and complete service-profile hash.
It emits one identity record and writes read-only health evidence containing
PID/start time, last and next poll, active issue/instruction/claim, quarantine
summary, circuit state, shutdown state, schema support, and configuration hash:

```sh
node tools/orchestrator/bin/repository-orchestrator.mjs status --state-dir <state-root>
npm run orchestrator:service -- status
```

Before a watch cycle can migrate any state, raw selected task files are scanned
read-only. A newer schema aborts the entire cycle. Schema 12 migrates once to
schema 13 by adding the quarantine, reopen, notification, checkpoint-rejection,
and commit-receipt ledgers; schema-12 runtimes reject schema-13 state.

Repository discovery/network errors use a global 1/2/4/8/15-minute breaker and
then one 30-minute probe; they do not increment issue attempts. Transient claim
failures use 1/2/4/8-minute backoff and quarantine on failure five within 24
hours. Permanent checkout/provenance/task/configuration errors quarantine
immediately. Repeated checkpoint rejection and exhausted idempotent result
publication have their own fail-closed policies. Legacy counts at or above five
(including the historical thousand-count shapes) migrate directly to
quarantine without another turn or fabricated result.

The third transient failure produces one durable idempotent warning. Immediate
or exhausted quarantine produces one durable quarantine notification. A stable
comment marker and append-only delivery ledger prevent restart spam. Quarantine
history and counts are never cleared; a new control must bind the exact
quarantine ID, error digest, state revision, intended action, and explicit
clear intent before selection can resume.

An explicitly approved uninstall stops only this label and preserves releases,
task state, audit history, and worktrees:

```sh
npm run orchestrator:service -- uninstall
```

## Owner stops and follow-ups

`needs_owner` and `needs_review` are report states, not reasons for an approved
Watcher v2 instance to exit. While that service is running it keeps polling only
opted-in issues. To resume after `needs_owner`, the
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
