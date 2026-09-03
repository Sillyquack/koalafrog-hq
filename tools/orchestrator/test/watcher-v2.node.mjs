import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import {
  validateCommitAuthorization,
} from "../src/commit-authorization.mjs"
import { parseConfig } from "../src/config.mjs"
import {
  parseAgentControlBlock,
  selectNextInstruction,
} from "../src/control-plane.mjs"
import { discoverIssueCandidates } from "../src/repository-discovery.mjs"
import { QueueClaimStore } from "../src/queue-claim-store.mjs"
import {
  discoverPersistedIssueCandidates,
  runRepositoryCycle,
  verifyWatcherStartupIdentity,
  watchRepository,
} from "../src/repository-runner.mjs"
import {
  currentStateSchemaVersion,
  initialState,
  migrateState,
} from "../src/state-store.mjs"
import {
  activeInstructionQuarantines,
  checkpointRecoveryRejectionDecision,
  createInstructionQuarantineRecord,
  filterPersistentCandidates,
  preflightRawTaskSchemas,
  quarantineAllowsControl,
  quarantineReopenDecision,
  recordInstructionQuarantine,
  recordQuarantineReopen,
  recordWatcherNotification,
  recordWatcherNotificationDelivery,
  serviceConfigurationDigest,
  ShutdownCoordinator,
  watcherIdentityDecision,
  watcherServiceProfile,
  watcherV2PublicationBackoffMs,
  watcherV2QueueBackoffMs,
  watcherV2QueueFailureDecision,
  WatcherCircuitBreaker,
  WatcherHealthStore,
  watcherNotificationComment,
} from "../src/watcher-v2.mjs"

function stateFixture(issueNumber = 70) {
  const state = initialState({
    repository: "Sillyquack/koalafrog-hq",
    issueNumber,
    issueUrl: `https://github.com/Sillyquack/koalafrog-hq/issues/${issueNumber}`,
  })
  state.stateRevision = 10
  return state
}

function failure(message = "temporary claim failure") {
  return new Error(message)
}

function quarantineFixture(state, instructionId = "instruction-old-001") {
  return createInstructionQuarantineRecord({
    state,
    instructionId,
    failure: failure("temporary claim failure"),
    attemptCount: 5,
    firstFailureAt: "2026-08-31T00:00:00.000Z",
    lastFailureAt: "2026-08-31T00:15:00.000Z",
    exhaustedReason: "claim_retry_policy_exhausted",
    now: new Date("2026-08-31T00:15:00.000Z"),
  })
}

function reopenControl(record, revision, overrides = {}) {
  return {
    action: "start",
    taskState: "ready",
    instructionId: "instruction-reopen-002",
    maxTurns: 1,
    ownerApprovalRequired: false,
    prompt: "Reopen the exact quarantine.",
    quarantineReopen: {
      quarantineId: record.quarantineId,
      normalizedErrorDigest: record.normalizedErrorDigest,
      expectedStateRevision: revision,
      intendedAction: "start",
      clearQuarantine: true,
      ...overrides,
    },
  }
}

function validControlBody(instructionId) {
  return `\`\`\`yaml
agent_control:
  action: start
  task_state: ready
  instruction_id: ${instructionId}
  owner_approval_required: false
  max_turns: 1
  prompt: |
    Execute the bounded synthetic instruction.
\`\`\``
}

test("watch requires an opt-in label, allowlist, or explicit canary issue", () => {
  assert.throws(() => parseConfig(["watch"]), /requires --required-label/)
  assert.equal(
    parseConfig(["watch", "--required-label", "koalafrog-orchestrator"])
      .requiredLabel,
    "koalafrog-orchestrator",
  )
  assert.deepEqual(
    parseConfig(["watch", "--allow-issue", "99"]).issueAllowlist,
    [99],
  )
  assert.equal(parseConfig(["watch", "--issue", "99"]).canaryMode, true)
})

test("bounded once remains label-independent", () => {
  const config = parseConfig(["once", "--issue", "99"])
  assert.equal(config.requiredLabel, null)
  assert.equal(config.canaryMode, false)
})

test("persistent watch rejects global auto-commit and broad fairness", () => {
  assert.throws(
    () =>
      parseConfig([
        "watch",
        "--required-label",
        "koalafrog-orchestrator",
        "--auto-commit",
      ]),
    /forbids service-wide --auto-commit/,
  )
  assert.throws(
    () =>
      parseConfig([
        "watch",
        "--required-label",
        "koalafrog-orchestrator",
        "--max-tasks-per-poll",
        "2",
      ]),
    /requires --max-tasks-per-poll 1/,
  )
})

test("required-label discovery admits only labeled issues", () => {
  const payload = {
    items: [
      {
        number: 1,
        body: validControlBody("instruction-label-001"),
        labels: [{ name: "koalafrog-orchestrator" }],
      },
      {
        number: 2,
        body: validControlBody("instruction-label-002"),
        labels: [{ name: "other" }],
      },
    ],
  }
  assert.deepEqual(
    discoverIssueCandidates(payload, {
      requiredLabel: "koalafrog-orchestrator",
    }).map((candidate) => candidate.issueNumber),
    [1],
  )
})

test("allowlist discovery admits an otherwise unlabeled issue", () => {
  const payload = {
    items: [
      {
        number: 2,
        body: validControlBody("instruction-allowlist-002"),
        labels: [],
      },
    ],
  }
  assert.deepEqual(
    discoverIssueCandidates(payload, {
      requiredLabel: "koalafrog-orchestrator",
      issueAllowlist: [2],
    }).map((candidate) => candidate.issueNumber),
    [2],
  )
})

test("persistent candidate filtering precedes claims", () => {
  const config = {
    command: "watch",
    requiredLabel: "koalafrog-orchestrator",
    issueAllowlist: [],
    issueNumberExplicit: false,
  }
  assert.deepEqual(
    filterPersistentCandidates(
      [
        { issueNumber: 1, labels: [] },
        { issueNumber: 2, labels: ["koalafrog-orchestrator"] },
      ],
      config,
    ).map((candidate) => candidate.issueNumber),
    [2],
  )
})

test("persisted done tasks are omitted and quarantine remains read-only visible", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "watcher-v2-discovery-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const config = {
    command: "watch",
    repository: "Sillyquack/koalafrog-hq",
    stateDirectory: root,
    requiredLabel: "koalafrog-orchestrator",
    issueAllowlist: [],
  }
  const writeState = async (issueNumber, state) => {
    const directory = path.join(
      root,
      `Sillyquack-koalafrog-hq-issue-${issueNumber}`,
    )
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, "state.json"), JSON.stringify(state))
  }
  const done = stateFixture(70)
  done.status = "done"
  done.task.originIssueLabels = ["koalafrog-orchestrator"]
  await writeState(70, done)
  const quarantined = stateFixture(71)
  quarantined.task.originIssueLabels = ["koalafrog-orchestrator"]
  recordInstructionQuarantine(quarantined, quarantineFixture(quarantined))
  await writeState(71, quarantined)

  const candidates = await discoverPersistedIssueCandidates(config, {
    liveCandidates: [
      {
        issueNumber: 70,
        labels: ["koalafrog-orchestrator"],
      },
      {
        issueNumber: 71,
        labels: ["koalafrog-orchestrator"],
      },
    ],
  })
  assert.deepEqual(candidates.map((candidate) => candidate.issueNumber), [71])
  assert.equal(candidates[0].claimable, false)
  assert.equal(candidates[0].quarantineCount, 1)
})

test("transient claim failures use 1/2/4/8 minute backoff", () => {
  let existing = null
  const observed = []
  for (let index = 0; index < 4; index += 1) {
    const now = new Date(Date.UTC(2026, 7, 31, 0, index * 10))
    const decision = watcherV2QueueFailureDecision({
      existing,
      error: failure(),
      now,
    })
    observed.push(Date.parse(decision.nextEligibleAt) - now.getTime())
    existing = {
      failureCount: decision.failureCount,
      failureHistory: decision.history,
    }
  }
  assert.deepEqual(observed, watcherV2QueueBackoffMs)
})

test("fifth transient failure quarantines with no sixth eligibility", () => {
  let existing = null
  let decision
  for (let index = 0; index < 5; index += 1) {
    decision = watcherV2QueueFailureDecision({
      existing,
      error: failure(),
      now: new Date(Date.UTC(2026, 7, 31, 0, index)),
    })
    existing = {
      failureCount: decision.failureCount,
      failureHistory: decision.history,
    }
  }
  assert.equal(decision.quarantined, true)
  assert.equal(decision.nextEligibleAt, null)
  assert.equal(decision.exhaustedReason, "claim_retry_policy_exhausted")
})

test("third transient failure creates the one warning threshold", () => {
  let existing = null
  const notifications = []
  for (let index = 0; index < 4; index += 1) {
    const decision = watcherV2QueueFailureDecision({
      existing,
      error: failure(),
      now: new Date(Date.UTC(2026, 7, 31, 0, index)),
    })
    notifications.push(decision.notificationKind)
    existing = {
      failureCount: decision.failureCount,
      failureHistory: decision.history,
    }
  }
  assert.deepEqual(notifications, [null, null, "third_failure_warning", null])
})

test("failure history remains append-only when the rolling retry window resets", () => {
  const historical = {
    at: "2026-08-29T00:00:00.000Z",
    errorDigest: "a".repeat(64),
  }
  const now = new Date("2026-08-31T00:00:00.000Z")
  const decision = watcherV2QueueFailureDecision({
    existing: {
      failureCount: 1,
      failureHistory: [historical],
    },
    error: failure(),
    now,
  })
  assert.equal(decision.failureCount, 2)
  assert.equal(decision.history.length, 2)
  assert.deepEqual(decision.history[0], historical)
  assert.equal(decision.history[1].at, now.toISOString())
  assert.equal(decision.quarantined, false)
  assert.equal(decision.notificationKind, null)
  assert.equal(
    Date.parse(decision.nextEligibleAt) - now.getTime(),
    watcherV2QueueBackoffMs[0],
  )
})

test("permanent branch and provenance errors quarantine immediately", () => {
  for (const message of [
    "branch is already checked out at /tmp/worktree",
    "stale provenance worktree mismatch",
    "unsupported task shape",
    "configuration is invalid",
  ]) {
    const decision = watcherV2QueueFailureDecision({
      error: failure(message),
      now: new Date("2026-08-31T00:00:00.000Z"),
    })
    assert.equal(decision.quarantined, true, message)
    assert.equal(decision.exhaustedReason, "permanent_failure", message)
  }
})

test("result publication retries the same packet on 1/2/4/8/15 minutes", () => {
  let existing = null
  const observed = []
  for (let index = 0; index < 5; index += 1) {
    const now = new Date(Date.UTC(2026, 7, 31, 0, index * 20))
    const decision = watcherV2QueueFailureDecision({
      existing,
      error: failure("result publication failed"),
      now,
    })
    observed.push(Date.parse(decision.nextEligibleAt) - now.getTime())
    assert.equal(decision.quarantined, false)
    existing = {
      failureCount: decision.failureCount,
      failureHistory: decision.history,
    }
  }
  assert.deepEqual(observed, watcherV2PublicationBackoffMs)
  const terminal = watcherV2QueueFailureDecision({
    existing,
    error: failure("result publication failed"),
    now: new Date("2026-08-31T03:00:00.000Z"),
  })
  assert.equal(terminal.quarantined, true)
})

test("legacy pathological retry count migrates without executing callback", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "watcher-v2-legacy-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const recordDirectory = path.join(root, "repository-queue", "instructions")
  await mkdir(recordDirectory, { recursive: true, mode: 0o700 })
  let calls = 0
  const store = new QueueClaimStore({ stateDirectory: root, watcherV2: true })
  for (const [issueNumber, failureCount] of [
    [68, 5_001],
    [71, 1_001],
  ]) {
    const instructionId = `legacy-issue-${issueNumber}-retry-001`
    await writeFile(
      path.join(recordDirectory, `${instructionId}.json`),
      `${JSON.stringify({
        schemaVersion: 1,
        instructionId,
        originIssueNumber: issueNumber,
        originIssueUrl: `https://github.com/Sillyquack/koalafrog-hq/issues/${issueNumber}`,
        status: "retryable_error",
        attempt: failureCount,
        failureCount,
        token: "legacy-token",
        retryAuthorizationId: null,
        error: "temporary claim failure",
        updatedAt: "2026-08-30T00:00:00.000Z",
      })}\n`,
      { mode: 0o600 },
    )
    const result = await store.withClaim(
      { instructionId, originIssueNumber: issueNumber },
      async () => {
        calls += 1
      },
    )
    assert.equal(result.reason, "legacy_retry_quarantined")
    assert.equal(result.quarantineRecord.legacyFailureCount, failureCount)
    assert.equal(result.quarantineRecord.status, "quarantined")
  }
  assert.equal(calls, 0)
})

test("schema 12 migrates once to schema 13 with empty watcher ledgers", () => {
  const state = stateFixture()
  state.schemaVersion = 12
  delete state.instructionQuarantines
  delete state.quarantineReopens
  delete state.watcherNotifications
  delete state.watcherNotificationDeliveries
  delete state.checkpointRecoveryRejections
  delete state.commitAuthorizationReceipts
  const migrated = migrateState(state, {
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 70,
  })
  assert.equal(migrated.schemaVersion, 13)
  for (const key of [
    "instructionQuarantines",
    "quarantineReopens",
    "watcherNotifications",
    "watcherNotificationDeliveries",
    "checkpointRecoveryRejections",
    "commitAuthorizationReceipts",
  ]) {
    assert.deepEqual(migrated[key], [])
  }
  assert.equal(
    migrateState(migrated, {
      repository: "Sillyquack/koalafrog-hq",
      issueNumber: 70,
    }).schemaVersion,
    13,
  )
})

test("unsupported future schema fails closed", () => {
  const state = stateFixture()
  state.schemaVersion = currentStateSchemaVersion + 1
  assert.throws(
    () =>
      migrateState(state, {
        repository: "Sillyquack/koalafrog-hq",
        issueNumber: 70,
      }),
    /Unsupported state schema/,
  )
})

test("raw-schema cohort preflight rejects before mutation", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "watcher-v2-schema-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const taskDirectory = path.join(root, "Sillyquack-koalafrog-hq-issue-71")
  await mkdir(taskDirectory, { recursive: true })
  const statePath = path.join(taskDirectory, "state.json")
  const original = `${JSON.stringify({ schemaVersion: 99 })}\n`
  await writeFile(statePath, original)
  await assert.rejects(
    preflightRawTaskSchemas(
      {
        repository: "Sillyquack/koalafrog-hq",
        stateDirectory: root,
        supportedStateSchema: 13,
      },
      [{ issueNumber: 71 }],
    ),
    /Unsupported state schema 99/,
  )
  assert.equal(await readFile(statePath, "utf8"), original)
})

test("quarantine is append-only and restart-visible", () => {
  const state = stateFixture()
  const record = quarantineFixture(state)
  assert.equal(recordInstructionQuarantine(state, record).appended, true)
  assert.equal(recordInstructionQuarantine(state, record).appended, false)
  assert.deepEqual(activeInstructionQuarantines(state), [record])
})

test("unrelated control cannot clear or bypass quarantine", () => {
  const state = stateFixture()
  const record = quarantineFixture(state)
  recordInstructionQuarantine(state, record)
  const unrelated = {
    action: "start",
    taskState: "ready",
    instructionId: "unrelated-002",
  }
  assert.equal(quarantineAllowsControl(state, unrelated), false)
  assert.equal(
    selectNextInstruction({ body: validControlBody("unrelated-002") }, [], state),
    null,
  )
})

test("owner reopen requires exact quarantine ID, digest, revision, and action", () => {
  const state = stateFixture()
  const record = quarantineFixture(state)
  recordInstructionQuarantine(state, record)
  assert.equal(
    quarantineReopenDecision(
      state,
      reopenControl(record, state.stateRevision),
    ).accepted,
    true,
  )
  assert.equal(
    quarantineReopenDecision(
      state,
      reopenControl(record, state.stateRevision, {
        quarantineId: "instruction-quarantine:wrong",
      }),
    ).code,
    "quarantine_id_mismatch",
  )
  assert.equal(
    quarantineReopenDecision(
      state,
      reopenControl(record, state.stateRevision, {
        normalizedErrorDigest: "f".repeat(64),
      }),
    ).code,
    "quarantine_digest_mismatch",
  )
  assert.equal(
    quarantineReopenDecision(
      state,
      reopenControl(record, state.stateRevision + 1),
    ).code,
    "quarantine_revision_mismatch",
  )
})

test("duplicate owner reopen is idempotent and preserves history", () => {
  const state = stateFixture()
  const record = quarantineFixture(state)
  recordInstructionQuarantine(state, record)
  const control = reopenControl(record, state.stateRevision)
  const first = recordQuarantineReopen(state, control)
  const second = recordQuarantineReopen(state, control)
  assert.equal(first.appended, true)
  assert.equal(second.appended, false)
  assert.equal(activeInstructionQuarantines(state).length, 0)
  assert.equal(state.instructionQuarantines.length, 1)
})

test("notification identity is restart-idempotent", () => {
  const state = stateFixture()
  const input = {
    kind: "third_failure_warning",
    instructionId: "instruction-001",
    errorDigest: "a".repeat(64),
  }
  assert.equal(recordWatcherNotification(state, input).appended, true)
  assert.equal(recordWatcherNotification(state, input).appended, false)
  assert.equal(state.watcherNotifications.length, 1)
})

test("notification delivery is append-only and carries a stable marker", () => {
  const state = stateFixture()
  const notification = recordWatcherNotification(state, {
    kind: "quarantine",
    quarantineId: "instruction-quarantine:test",
    instructionId: "instruction-001",
    errorDigest: "a".repeat(64),
  }).record
  assert.match(
    watcherNotificationComment(notification),
    new RegExp(notification.notificationId),
  )
  assert.equal(
    recordWatcherNotificationDelivery(state, {
      notificationId: notification.notificationId,
      commentId: 123,
    }).appended,
    true,
  )
  assert.equal(
    recordWatcherNotificationDelivery(state, {
      notificationId: notification.notificationId,
      commentId: 123,
    }).appended,
    false,
  )
  assert.equal(state.watcherNotificationDeliveries.length, 1)
})

test("checkpoint rejection permits no unchanged-evidence retry and quarantines second evidence", () => {
  const state = stateFixture()
  const first = checkpointRecoveryRejectionDecision(state, {
    instructionId: "checkpoint-001",
    rejectionCode: "binding_mismatch",
    evidence: { head: "a".repeat(40) },
  })
  const duplicate = checkpointRecoveryRejectionDecision(state, {
    instructionId: "checkpoint-001",
    rejectionCode: "binding_mismatch",
    evidence: { head: "a".repeat(40) },
  })
  const changed = checkpointRecoveryRejectionDecision(state, {
    instructionId: "checkpoint-001",
    rejectionCode: "binding_mismatch",
    evidence: { head: "b".repeat(40) },
  })
  assert.equal(first.quarantine, false)
  assert.equal(duplicate.quarantine, true)
  assert.equal(duplicate.appended, false)
  assert.equal(changed.quarantine, true)
})

test("quarantine reopen control parser preserves exact bindings", () => {
  const state = stateFixture()
  const record = quarantineFixture(state)
  const control = parseAgentControlBlock(`agent_control:
  action: start
  task_state: ready
  instruction_id: instruction-reopen-002
  owner_approval_required: false
  quarantine_reopen:
    quarantine_id: ${record.quarantineId}
    normalized_error_digest: ${record.normalizedErrorDigest}
    expected_state_revision: ${state.stateRevision}
    intended_action: start
    clear_quarantine: true
  max_turns: 1
  prompt: |
    Reopen exact quarantine.`)
  assert.equal(control.quarantineReopen.quarantineId, record.quarantineId)
  assert.equal(control.quarantineReopen.expectedStateRevision, 10)
})

test("control-declared commit authorization parser is strict", () => {
  const control = parseAgentControlBlock(`agent_control:
  action: continue
  task_state: needs_review
  instruction_id: commit-authorized-001
  owner_approval_required: false
  commit_authorization:
    repository: Sillyquack/koalafrog-hq
    issue_number: 99
    instruction_id: commit-authorized-001
    worktree_path: /tmp/issue-99
    branch: agent/issue-99-commit-authorized-001
    expected_head: ${"a".repeat(40)}
    allowed_paths:
      - tools/orchestrator/src/config.mjs
      - tools/orchestrator/test/watcher-v2.node.mjs
    maximum_commit_count: 1
    commit_message_digest: ${"b".repeat(64)}
    push_authorized: false
  max_turns: 1
  prompt: |
    Commit only the allowed paths.`)
  assert.deepEqual(control.commitAuthorization.allowedPaths, [
    "tools/orchestrator/src/config.mjs",
    "tools/orchestrator/test/watcher-v2.node.mjs",
  ])
  assert.equal(control.commitAuthorization.pushAuthorized, false)
})

test("commit permission rejects checkout, path widening, and gitlinks", async () => {
  const message = "chore(orchestrator): complete commit-authorized-001"
  const authorization = {
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 99,
    instructionId: "commit-authorized-001",
    worktreePath: "/tmp/issue-99",
    branch: "agent/issue-99-commit-authorized-001",
    expectedHead: "a".repeat(40),
    allowedPaths: ["tools/orchestrator"],
    maximumCommitCount: 1,
    commitMessageDigest: createHash("sha256").update(message).digest("hex"),
    pushAuthorized: false,
  }
  const context = {
    repository: authorization.repository,
    issueNumber: authorization.issueNumber,
    instructionId: authorization.instructionId,
    worktreePath: authorization.worktreePath,
    coordinatorPath: "/tmp/coordinator",
    siblingWorktreePaths: [],
    parentWorkspacePath: "/tmp",
    branch: authorization.branch,
    head: authorization.expectedHead,
    changedFiles: ["tools/orchestrator/src/config.mjs"],
    gitlinkPaths: [],
    commitMessage: message,
  }
  const inspectPath = async (candidate) => ({
    isFile: () => candidate === "/tmp/issue-99/.git",
    isDirectory: () =>
      candidate === "/tmp/coordinator/.git/worktrees/issue-99",
  })
  const read = async () =>
    "gitdir: /tmp/coordinator/.git/worktrees/issue-99\n"
  assert.equal(
    (await validateCommitAuthorization(authorization, context, {
      inspectPath,
      read,
    }))
      .accepted,
    true,
  )
  assert.equal(
    (
      await validateCommitAuthorization(
        authorization,
        { ...context, coordinatorPath: context.worktreePath },
        { inspectPath, read },
      )
    ).code,
    "commit_authorization_checkout",
  )
  assert.equal(
    (
      await validateCommitAuthorization(
        authorization,
        { ...context, changedFiles: ["src/App.tsx"] },
        { inspectPath, read },
      )
    ).code,
    "commit_authorization_path_widening",
  )
  assert.equal(
    (
      await validateCommitAuthorization(
        authorization,
        { ...context, gitlinkPaths: ["tools"] },
        { inspectPath, read },
      )
    ).code,
    "commit_authorization_gitlink",
  )
  assert.equal(
    (
      await validateCommitAuthorization(authorization, context, {
        inspectPath,
        read: async () => "gitdir: /tmp/other/.git/worktrees/issue-99\n",
      })
    ).code,
    "commit_authorization_git_pointer_scope",
  )
})

test("network circuit breaker uses 1/2/4/8/15 minutes then 30-minute probes", () => {
  let now = new Date("2026-08-31T00:00:00.000Z")
  const breaker = new WatcherCircuitBreaker({ now: () => now })
  const delays = []
  for (let index = 0; index < 7; index += 1) {
    const snapshot = breaker.fail(failure("network discovery failed"))
    delays.push(Date.parse(snapshot.nextProbeAt) - now.getTime())
    now = new Date(now.getTime() + 1_000)
  }
  assert.deepEqual(delays, [60_000, 120_000, 240_000, 480_000, 900_000, 1_800_000, 1_800_000])
  assert.equal(breaker.success().state, "closed")
})

test("startup identity requires every exact binding", () => {
  const identity = {
    runtimeRelease: "a".repeat(64),
    manifestSha256: "b".repeat(64),
    sourceCommit: "c".repeat(40),
    sourceTree: "d".repeat(40),
    repository: "Sillyquack/koalafrog-hq",
    coordinatorCheckout: "/tmp/coordinator",
    serviceConfigSha256: "e".repeat(64),
  }
  assert.equal(watcherIdentityDecision(identity, identity).accepted, true)
  assert.equal(
    watcherIdentityDecision(identity, {
      ...identity,
      sourceTree: "f".repeat(40),
    }).code,
    "identity_sourceTree_mismatch",
  )
  assert.equal(
    serviceConfigurationDigest({ a: 1, b: 2 }),
    serviceConfigurationDigest({ b: 2, a: 1 }),
  )
})

test("startup recomputes the service profile instead of trusting its hash flag", async () => {
  const release = "a".repeat(64)
  const sourceCommit = "b".repeat(40)
  const sourceTree = "c".repeat(40)
  const manifestContents = Buffer.from(
    `${JSON.stringify({
      schemaVersion: 2,
      digest: release,
      source: {
        repository: "Sillyquack/koalafrog-hq",
        commit: sourceCommit,
        tree: sourceTree,
      },
      files: [],
    })}\n`,
  )
  const manifestSha256 = createHash("sha256")
    .update(manifestContents)
    .digest("hex")
  const config = parseConfig(
    [
      "watch",
      "--required-label",
      "koalafrog-orchestrator",
      "--state-dir",
      "/synthetic/state",
      "--health-path",
      "/synthetic/state/health.json",
      "--expected-runtime-release",
      release,
      "--expected-manifest-sha256",
      manifestSha256,
      "--expected-source-commit",
      sourceCommit,
      "--expected-source-tree",
      sourceTree,
      "--service-label",
      "com.sillyquack.koalafrog-orchestrator",
      "--service-run-at-load",
      "false",
      "--service-keep-alive",
      "false",
      "--service-exit-timeout",
      "90",
      "--service-throttle-interval",
      "60",
      "--service-umask",
      "63",
    ],
    "/synthetic/coordinator",
  )
  config.expectedServiceConfigSha256 = serviceConfigurationDigest(
    watcherServiceProfile(config),
  )
  const dependencies = {
    orchestratorScript: `/runtime/releases/${release}/bin/repository-orchestrator.mjs`,
    read: async () => manifestContents,
    gitIdentity: async (_checkout, args) =>
      args.at(-1) === "HEAD^{tree}" ? sourceTree : sourceCommit,
  }
  assert.equal(
    (await verifyWatcherStartupIdentity(config, dependencies)).runtimeRelease,
    release,
  )
  const drifted = { ...config, pollMs: config.pollMs + 1 }
  await assert.rejects(
    verifyWatcherStartupIdentity(drifted, dependencies),
    /identity_serviceConfigSha256_mismatch/,
  )
})

test("health status readback is non-mutating", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "watcher-v2-health-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const store = new WatcherHealthStore(path.join(root, "health.json"), {
    now: () => new Date("2026-08-31T00:00:00.000Z"),
  })
  await store.write({
    state: "idle",
    runtimeRelease: "a".repeat(64),
    quarantines: [],
  })
  const before = await readFile(path.join(root, "health.json"))
  const status = await store.read()
  const after = await readFile(path.join(root, "health.json"))
  assert.equal(status.state, "idle")
  assert.deepEqual(after, before)
})

test("shutdown is immediate, bounded, and repeated-signal idempotent", () => {
  const shutdown = new ShutdownCoordinator({
    timeoutMs: 75_000,
    now: () => new Date("2026-08-31T00:00:00.000Z"),
  })
  const first = shutdown.request("SIGTERM")
  const second = shutdown.request("SIGINT")
  assert.equal(shutdown.controller.signal.aborted, true)
  assert.equal(first.deadlineAt, "2026-08-31T00:01:15.000Z")
  assert.equal(second.signalCount, 2)
  assert.equal(second.requestedAt, first.requestedAt)
  assert.equal(
    shutdown.deadlineExpired(new Date("2026-08-31T00:01:14.999Z")),
    false,
  )
  assert.equal(
    shutdown.deadlineExpired(new Date("2026-08-31T00:01:15.000Z")),
    true,
  )
})

test("shutdown during an instruction claim releases the durable claim", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "watcher-v2-shutdown-claim-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const store = new QueueClaimStore({ stateDirectory: root, watcherV2: true })
  await assert.rejects(
    store.withClaim(
      { instructionId: "shutdown-claim-001", originIssueNumber: 99 },
      async () => {
        const error = new Error("Watcher shutdown requested")
        error.name = "AbortError"
        error.code = "WATCHER_SHUTDOWN"
        throw error
      },
    ),
    (error) => error.code === "WATCHER_SHUTDOWN",
  )
  const record = JSON.parse(
    await readFile(
      path.join(
        root,
        "repository-queue",
        "instructions",
        "shutdown-claim-001.json",
      ),
      "utf8",
    ),
  )
  assert.equal(record.status, "released")
  assert.equal(record.resultStatus, "shutdown_requested")
  assert.equal(record.failureCount, undefined)
})

test("repository cohort schema preflight occurs before any issue callback", async () => {
  let issueCalls = 0
  await assert.rejects(
    runRepositoryCycle(
      {},
      {
        command: "watch",
        repository: "Sillyquack/koalafrog-hq",
        stateDirectory: "/synthetic/state",
        issueNumberExplicit: false,
        requiredLabel: "koalafrog-orchestrator",
        issueAllowlist: [],
        maxTasksPerPoll: 1,
      },
      {
        search: async () => [
          { issueNumber: 68, labels: ["koalafrog-orchestrator"] },
          { issueNumber: 71, labels: ["koalafrog-orchestrator"] },
        ],
        discoverPersisted: async () => [],
        rawSchemaPreflight: async () => {
          throw Object.assign(new Error("Unsupported state schema 99"), {
            code: "WATCHER_UNSUPPORTED_SCHEMA",
          })
        },
        runIssue: async () => {
          issueCalls += 1
        },
      },
    ),
    /Unsupported state schema 99/,
  )
  assert.equal(issueCalls, 0)
})

test("shutdown during discovery stops the scanner and starts no claim", async () => {
  const controller = new AbortController()
  let stopped = 0
  let issueCalls = 0
  let rejectCycle
  const cycle = new Promise((_resolve, reject) => {
    rejectCycle = reject
  })
  const watching = watchRepository(
    {
      repository: "Sillyquack/koalafrog-hq",
      checkoutPath: "/synthetic/coordinator",
      pollMs: 60_000,
      requiredLabel: "koalafrog-orchestrator",
      issueAllowlist: [],
      canaryMode: false,
      unsafeDevelopmentWatch: true,
      healthPath: null,
    },
    {
      signal: controller.signal,
      createScanner: async () => ({
        appServer: {
          async stop() {
            stopped += 1
            rejectCycle(
              Object.assign(new Error("stopped"), { name: "AbortError" }),
            )
          },
        },
      }),
      runCycle: async () => {
        await cycle
        issueCalls += 1
        return []
      },
      write: () => {},
    },
  )
  await new Promise((resolve) => setImmediate(resolve))
  controller.abort("SIGTERM")
  await watching
  assert.equal(stopped, 1)
  assert.equal(issueCalls, 0)
})
