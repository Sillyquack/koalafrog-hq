# Control Plane Contract

GitHub Issues are the bootstrap durable control plane for local Codex orchestration.

## Machine-readable instruction block

The local orchestrator consumes fenced blocks with this shape from the task
issue body/comments:

```yaml
agent_control:
  action: start | continue | stop
  task_state: ready | running | needs_review | needs_owner | done | failed
  instruction_id: <unique string>
  max_turns: <positive integer>
  owner_approval_required: false
  prompt: |
    <instruction sent to Codex>
```

For a new task, the block must be in the body of an open issue so the bounded
repository search can discover it. Pull requests, prose-only mentions, and
malformed blocks are ineligible. Follow-up blocks may be comments once the
origin issue has persisted local state.

The orchestrator selects the oldest unconsumed explicit instruction using
durable run history, repository-wide claim records, and existing
`agent_result` comments. An `instruction_id` is unique across the repository
and executes at most once unless an audited local retry marker explicitly
reopens it. Concurrent polls claim both the origin issue and instruction before
starting or resuming Codex.

`action: start` creates a fresh instruction-specific worktree and Codex thread.
`action: continue` reuses the persisted worktree and thread, including after a
restart or a `needs_owner` result. Result states do not stop repository polling;
the owner resumes work by adding a fresh uniquely identified control block.

`start` is eligible with `ready` or `failed`. `continue` is eligible with
`ready`, `failed`, `needs_review`, or `needs_owner`. An explicit `stop` is
consumed without a Codex turn. `owner_approval_required: true` fails closed to
`needs_owner`, and the effective turn budget never exceeds the local limit.

## Pickup packet

Once a thread and isolated worktree are durably recorded, the orchestrator
posts an idempotent packet to the originating issue:

```yaml
agent_pickup:
  instruction_id: <source instruction id>
  origin_issue_number: <issue number>
  origin_issue_url: <issue URL>
  codex_thread_id: <thread id>
  status: running
  branch: <isolated branch>
```

## Completion packet

After a Codex turn, the orchestrator posts a compact structured result:

```yaml
agent_result:
  instruction_id: <source instruction id>
  origin_issue_number: <issue number>
  origin_issue_url: <issue URL>
  codex_thread_id: <thread id>
  status: needs_review | needs_owner | failed
  branch: <branch or null>
  commits: []
  checks:
    typecheck: pass | fail | not_run
    lint: pass | fail | not_run
    tests: pass | fail | not_run
    build: pass | fail | not_run
  owner_question: <null or concise question>
```

Human-readable detail may follow the structured block.

## Guardrails

The bootstrap orchestrator does not merge, deploy, apply production migrations,
modify production data, expose credentials, make payments, perform destructive
Git, or resolve owner approvals itself.
