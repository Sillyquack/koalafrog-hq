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

### Persistent Watcher v2 eligibility and quarantine

Persistent `watch` is explicit opt-in. It requires a configured GitHub label,
an issue allowlist, or one exact `watch --issue N` canary. The filter applies to
search and persisted-state candidates before fairness or claims. Ordinary
`once --issue N` remains label-independent. Closed and `done` tasks are never
normal candidates; quarantined work remains read-only visible but cannot be
selected or acquire an instruction claim.

Required-label mode builds an authoritative live GitHub eligibility set before
opening persisted task state. A label-constrained search result is only a
bounded issue reference; summary labels may be omitted or `null` and are never
authorization evidence. Current issue detail must then bind the exact
repository and issue number, prove open issue (not pull request) state, and
provide a complete current label list. A definitively absent label is an
ordinary exclusion. Missing, malformed, ambiguous, or conflicting detail is
`WATCHER_ELIGIBILITY_LOOKUP_FAILED` and opens the repository circuit.

Durable task directory names supply only issue identifiers; they are
intersected with the hydrated live set before any `state.json` read. Cached
`originIssueLabels` are observation history, never execution authority.
Explicit allowlists intentionally bypass the label only for their named issue
IDs, and exact canary mode inspects only its explicit issue and separate state
root.

The current live label is checked again before the first task-state load and
immediately before an instruction claim. A missing label makes the candidate
ineligible without migration, retry/quarantine evaluation, notification, or
claim. Lookup uncertainty fails the repository poll through the global
discovery circuit instead of incrementing an issue attempt. Removing the label
therefore revokes subsequent persistent selection. GitHub label changes are not
transactional with the local claim: after the final successful live check and
authoritative claim, an already-active turn continues under the existing
control and shutdown contracts rather than receiving a fabricated cancellation
or result.

A live-authorized issue needs no pre-existing task directory. First admission
holds the issue lease, fetches current issue/control evidence, requires exactly
one valid `action: start` / `task_state: ready` control, and revalidates the
label before `StateStore.load()` may initialize task state. This preserves the
same issue-lease/CAS and instruction-claim serialization used after restart.
Malformed, ambiguous, state-ineligible, closed, or revoked new issues create no
task state. Raw-schema preflight inspects eligible persisted files but treats an
eligible issue with no state file as a valid new-admission candidate; unlabeled
persisted tasks remain unread.

Persistent poll records contain only stage-level issue IDs/counts and stable
exclusion reasons for search references, summary-label completeness, hydration,
eligible live and persisted candidates, merged candidates, raw-schema
inspection, selection, and claim attempts. Bodies, prompts, comments, tokens,
credentials, and raw connector responses are never included.

Schema 12 migrates once to schema 13 with append-only
`instructionQuarantines`, `quarantineReopens`, `watcherNotifications`,
`watcherNotificationDeliveries`, `checkpointRecoveryRejections`, and
`commitAuthorizationReceipts` ledgers. Persistent watch inspects every selected
raw state schema before loading any task; one unsupported schema aborts the
whole cycle without migration. Bounded once-mode retains its existing per-task
migration behavior. Older runtimes reject schema 13.

Transient instruction/claim failures back off for 1, 2, 4, then 8 minutes and
quarantine on failure five within 24 hours. Permanent checkout, provenance,
task-shape, and deterministic configuration errors quarantine immediately.
Unchanged checkpoint-rejection evidence receives no execution retry; changed
evidence receives at most one, then quarantines. Result publication retries the
same durable packet after 1, 2, 4, 8, and 15 minutes and never starts another
turn. Repository discovery/network failure uses a global 1/2/4/8/15-minute
circuit and one 30-minute probe thereafter without incrementing issue counts.
Legacy exhausted counts migrate directly to quarantine without execution.

The third transient failure and each quarantine create one stable notification
identity. Delivery uses a stable GitHub comment marker plus an append-only
delivery record, so restart cannot intentionally spam duplicate warnings.
Historical counts and quarantine records are never cleared. Reopening requires
a new state-eligible control with the exact binding:

```yaml
  quarantine_reopen:
    quarantine_id: <exact durable quarantine id>
    normalized_error_digest: <exact sha256>
    expected_state_revision: <exact current revision>
    intended_action: start | continue
    clear_quarantine: true
```

The outer control's action must equal `intended_action`. A wrong ID, digest,
revision, action, or unrelated control fails closed. Reopen is a new append-only
record; it does not erase the quarantine or its failure count.

### Service installation boundary

The service CLI keeps preview, disabled installation, one-shot activation, and
boot persistence as distinct owner gates. `render` is read-only and does not
materialize a runtime or write a plist. `install-disabled` validates the clean canonical coordinator,
materializes and verifies the immutable runtime, performs launchd/plist/process
coexistence checks, and atomically installs a mode-`0600`, `RunAtLoad=false`
plist without `KeepAlive`. It never invokes `bootstrap`, `kickstart`, or `load`,
and rejects `--approve-run-at-load`.

`start-once` is the only supported manual activation of that already installed
disabled profile. It verifies the canonical checkout, immutable release, exact
generated plist hash and mode, absence of the launchd target and conflicting
process trees, then performs one `bootstrap` followed by non-force
`kickstart -p`. Success requires one stable launchd PID, exact process
identity, and a fresh PID/session-bound health record carrying the canonical
release, manifest, source, repository, service label, watcher profile, required
label, and configuration hash. The startup deadline is 30 seconds and the
post-readiness stability window is two seconds. Bootstrap alone is not success.
On Darwin, launchd can expose exact `/usr/libexec/xpcproxy` briefly at the
authoritative PID before it execs the configured program. Only that exact
same-PID, unchanged-launch-count state is treated as transitional. It is never
readiness: the executable must become the approved non-symlink Node binary,
the structured argv vector must equal the installed plist `ProgramArguments`,
and fresh health must then pass before the stability window begins. Any other
launcher, unavailable identity, executable/argv drift, PID change, or persistent
`xpcproxy` fails disabled.

Any active-start failure performs controlled bootout, waits up to 75 seconds
for launchd and process-tree absence, preserves plist/runtime/log/health/start
evidence, and leaves the `RunAtLoad=false` profile disabled. It never retries,
restores an older runtime, adds `KeepAlive`, or silently approves boot start.
Incomplete cleanup is a hard manual-recovery state. The legacy-named `install`
active path routes through the same verified primitive and has no weaker
bootstrap-only success condition.

Disabled installation proves the launchd target and watcher/broker process tree
remain absent after plist readback. Any failure after a write preserves the
attempted and prior inactive plist evidence, removes the active plist, and
leaves the service disabled. It never restores or starts an older runtime as a
fallback. Repeating the same disabled identity is idempotent.

Installing artifacts, starting once, enrolling an issue, and authorizing boot
persistence are four separate gates:

- `install-disabled` installs artifacts only;
- `start-once` manually starts a `RunAtLoad=false` profile once;
- applying the required watcher label authorizes issue execution;
- explicit `RunAtLoad=true` approval authorizes later boot/login persistence.

No gate implies another.

### Control-declared commit permission

Persistent watch never accepts service-wide `--auto-commit`. A control that
needs one local commit must declare all authority explicitly:

```yaml
  commit_authorization:
    repository: Sillyquack/koalafrog-hq
    issue_number: <origin issue>
    instruction_id: <this instruction id>
    worktree_path: <exact linked task worktree>
    branch: <exact task branch>
    expected_head: <40-character sha>
    allowed_paths:
      - <repo-relative path>
    maximum_commit_count: 1
    commit_message_digest: <sha256 of generated commit message>
    push_authorized: false
```

The runtime requires a linked-worktree `.git` pointer, exact repository, issue,
instruction, worktree, branch and HEAD, one commit, the exact message, and no
changed or staged path outside the allowlist. Coordinating, parent, or sibling
checkout mutation, gitlinks/submodules, ambiguous Git metadata, broad `git add`,
repeated receipt use, and push authority are rejected. Only declared paths are
staged, and one append-only receipt records the resulting commit and proves no
push occurred. Legacy bounded `--auto-commit` parsing is retained for
compatibility but is not a persistent-watch fallback.

### Terminal closeout

A reviewed durable task may transition from `needs_review` to `done` only with
the terminal extension of `action: stop`:

```yaml
agent_control:
  action: stop
  task_state: needs_review
  terminal_state: done
  instruction_id: <unique closeout instruction id>
  expected_state_revision: <exact current supported-state revision>
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

One current-schema state CAS binds the expected revision, `needs_review`, no active
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
