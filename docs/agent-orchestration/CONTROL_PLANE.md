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
  supersedes: # optional; requires expected_state_revision
    - <older pending instruction id>
  expected_state_revision: <non-negative integer>
  prompt: |
    <instruction sent to Codex>
```

`supersedes` and `expected_state_revision` are an optional paired extension.
They are valid only on a later control that is eligible in the current task
state. A declaration retires all listed instructions or none of them. Each
target must occur exactly once earlier on the same issue and must have no run,
retry, active-instruction, pickup, result, result-correction, or repository
queue-claim history. The declaration must cover every older eligible pending
instruction so normal oldest-first ordering remains deterministic.

Supersession runs only through repository orchestration while its per-issue
claim is held. The runtime binds the declaration to the issue, exact task
status, no active instruction, and `expected_state_revision`; inspects every
target's repository-wide claim record; then persists one all-target state
transaction using the state revision CAS. It does not claim or execute a
target, create pickup/result packets, add runs/retries, or change task status.
Direct task orchestration fails closed until this repository reconciliation is
durable.

The append-only `instructionSupersessions` state ledger records the controlling
and target control digests, their ordering, prior eligibility, issue and state
binding, and committed revision. One idempotent `instruction_superseded` event
is then appended for each target. Selection cannot begin until every audit
event is durable; a restart after a partial event append reconstructs the
missing events from the atomic state record before continuing. Historical
controls remain present, while the selector excludes their durably superseded
IDs. Supersession records are retirement evidence, never execution results.

### Terminal closeout

A reviewed durable task may transition from `needs_review` to `done` only with
the terminal extension of `action: stop`:

```yaml
agent_control:
  action: stop
  task_state: needs_review
  terminal_state: done
  instruction_id: <unique closeout instruction id>
  expected_state_revision: <exact current schema-12 revision>
  owner_approval_required: false
  closeout:
    expected_last_consumed_instruction_id: <exact prior instruction id>
    retire_all_unconsumed_controls: true
    supersede_pending_approvals: true
    require_no_active_claims: true
    require_origin_issue_closed: true
  max_turns: 1
  prompt: |
    Append-only terminal closeout only.
```

Every terminal field is mandatory and `done` is the only terminal target.
`terminal_state` is invalid on `start`, `continue`, or a normal stop. Legacy
controls retain their original parsed shape and behavior.

Terminal closeout is control-plane work, not a Codex instruction. It never
creates an instruction claim, pickup, result, run, retry, turn, worktree, or
Git mutation. It is available only through repository
`once --issue N --terminal-closeout`; it is forbidden in `watch`, cannot be combined with
`--auto-commit`, and does not make any normal control on a closed issue
executable. Normal discovery continues to inspect open issues only.

While the per-issue queue lease is held, the runtime reads the authoritative
GitHub issue and requires it to be closed. It inspects every control regardless
of declared task state and every repository claim identity. Controls already
consumed by durable run/result history or retired by normal supersession remain
historical. Every other control must be unique, unclaimed, inactive, and free
of pickup/retry/result-correction history; all such controls are retired across
every future task state with `reason: terminal_closeout` and
`executionOccurred: false`. Historical controls are never deleted or rewritten.

Uncleared interrupted approval requests are bound to their exact scope, reason
digest, request identities, and source instruction, then changed to
`terminally_retired`. The original request stays visible. No approval decision
or owner acknowledgement is fabricated, and an expired request can never
authorize an action.

One schema-12 state CAS binds the expected revision, `needs_review`, no active
instruction or claim, the exact prior last-consumed instruction, no retry or
unresolved mutation/broker/result-publication residue, all cross-state
retirements, all approval tombstones, and the closed GitHub observation. It
then records one `terminalCloseouts` ledger entry, sets `status: done`, records
`originIssueClosed: true`, and consumes only the closeout control identity.
Validation drift leaves all state unchanged.

The append-only `task_terminally_closed` event includes prior/terminal state,
expected/committed revisions, GitHub closed-state binding, claim-inspection
digest, retired control IDs, approval keys, and `executionOccurred: false`.
`instruction_terminally_retired` and `approval_terminally_retired` events add
per-record evidence. A restart after the state CAS reconstructs any missing
events idempotently. A `done` task, or any state carrying terminal-closeout
evidence, is never normally selectable even if its status is later corrupted.
Reopening a terminal task is intentionally unsupported.

Closing the GitHub issue and reaching durable `done` are separate facts. The
former is an external precondition observed read-only; only the terminal state
CAS establishes the latter.

For a new task, the block must be in the body of an open issue so the bounded
repository search can discover it. Pull requests, prose-only mentions, and
malformed blocks are ineligible. Follow-up blocks may be comments once the
origin issue has persisted local state.

The orchestrator selects the oldest unconsumed explicit instruction using
durable run history, repository-wide claim records, and existing
`agent_result` comments, excluding IDs in validated durable supersession
records. A pending control is eligible only when its declared
`task_state` exactly matches the persisted current task state. A stale mismatch
stays unconsumed while oldest-to-newest scanning continues to the next pending
control. An `instruction_id` is unique across the repository and executes at
most once unless an audited local retry marker explicitly reopens it.
Concurrent polls claim both the origin issue and instruction before starting or
resuming Codex.

`action: start` creates a fresh instruction-specific worktree and Codex thread.
`action: continue` reuses the persisted worktree and thread, including after a
restart or a `needs_owner` result. Result states do not stop repository polling;
the owner resumes work by adding a fresh uniquely identified control block.

`start` is eligible with `ready` or `failed`. `continue` is eligible with
`ready`, `failed`, `needs_review`, or `needs_owner`. An explicit `stop` is
consumed without a Codex turn. A normal stop does not produce `done`; only the
revision-bound terminal closeout above can do that.
`owner_approval_required: true` fails closed to `needs_owner`, and the effective turn budget never
exceeds the local limit.

An owner decision for an App Server approval request is a fresh `continue`
instruction with `task_state: needs_owner`, `owner_approval_required: false`,
and an explicit approval of the exact pending action. The runtime binds it to
that action's scope/reason digest, persists it with a 24-hour stale guard, and
consumes it exactly once while returning the real App Server approval response.
Duplicate controls, restart, and duplicate GitHub reads cannot renew it; a
different, broader, stale, or protected production/destructive request remains
`needs_owner`.

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
    typecheck: pass | fail | unknown | not_run
    lint: pass | fail | unknown | not_run
    tests: pass | fail | unknown | not_run
    cloudflare_readiness: pass | fail | unknown | not_run
    build: pass | fail | unknown | not_run
    diff_check: pass | fail | unknown | not_run
  owner_question: <null or concise question>
  owner_request: <null or structured owner request>
  blockers: []
  owner_gates: []
  production_readback: []
  safety_findings: []
  branch_push_state: []
  result_artifact: <null or redacted completed-turn artifact>
```

`not_run` is reserved for a check that is proven not to have started, such as a
pre-turn owner gate. A completed turn without sufficient evidence reports
`unknown`; parser uncertainty must never be presented as `not_run`.

The completed turn's final Codex message and compact command evidence are
redacted and persisted before workspace inspection or result publication. The
artifact is sufficient to reconstruct checks and the report after restart and
is retained in durable run history. Result publication remains origin-bound and
idempotent: a persisted `result_pending` packet or an existing result for the
same instruction is never posted twice.

Human-readable detail, including the redacted final Codex report, may follow the
structured block.

## Guardrails

The bootstrap orchestrator does not merge, deploy, apply production migrations,
modify production data, expose credentials, make payments, perform destructive
Git, or resolve owner approvals itself.
