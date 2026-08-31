import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import {
  pendingActionScope,
  pendingApprovalRequestKey,
} from "../src/approval-decisions.mjs"
import { parseConfig } from "../src/config.mjs"
import {
  agentControlBindingDigest,
  controlPlaneBindingDigest,
  formatCompletionPacket,
  formatPickupPacket,
  instructionSupersessionDecision,
  parseAgentControlBlock,
  recordInstructionSupersession,
  selectInstructionSupersessionCandidate,
  selectNextInstruction,
} from "../src/control-plane.mjs"
import {
  reconcilePersistedTerminalCloseoutAudits,
  reconcileTerminalCloseout,
  runRepositoryIssue,
} from "../src/repository-runner.mjs"
import { Orchestrator } from "../src/orchestrator.mjs"
import {
  currentStateSchemaVersion,
  initialState,
  StateRevisionConflictError,
  StateStore,
} from "../src/state-store.mjs"
import {
  recordTerminalCloseout,
  selectTerminalCloseoutCandidate,
  terminalCloseoutAuditEvents,
  terminalCloseoutDecision,
  validateTerminalCloseoutRecord,
} from "../src/terminal-closeout.mjs"

const repository = "Sillyquack/koalafrog-hq"
const issueNumber = 70
const issueUrl = `https://github.com/${repository}/issues/${issueNumber}`
const instruction015 = "synthetic-dormant-ready-015"
const instruction048 = "synthetic-interrupted-approval-048"
const instruction055 = "synthetic-dormant-running-055"
const instruction077 = "synthetic-selectable-review-077"
const instruction078 = "synthetic-superseded-078"
const instruction079 = "synthetic-superseded-079"
const instruction080 = "synthetic-reconciliation-080"
const instruction081 = "synthetic-terminal-closeout-081"
const closeoutTime = new Date("2026-08-31T12:00:00.000Z")

function controlBlock(
  instructionId,
  {
    action = "continue",
    taskState = "failed",
    supersedes = [],
    expectedStateRevision = null,
    terminal = false,
    expectedLastConsumedInstructionId = instruction080,
  } = {},
) {
  const supersession = supersedes.length
    ? `  supersedes:\n${supersedes.map((id) => `    - ${id}`).join("\n")}\n  expected_state_revision: ${expectedStateRevision}\n`
    : ""
  const closeout = terminal
    ? `  terminal_state: done\n  expected_state_revision: ${expectedStateRevision}\n  closeout:\n    expected_last_consumed_instruction_id: ${expectedLastConsumedInstructionId}\n    retire_all_unconsumed_controls: true\n    supersede_pending_approvals: true\n    require_no_active_claims: true\n    require_origin_issue_closed: true\n`
    : ""
  return `\`\`\`yaml
agent_control:
  action: ${action}
  task_state: ${taskState}
  instruction_id: ${instructionId}
  max_turns: 1
  owner_approval_required: false
${supersession}${closeout}  prompt: |
    Append-only synthetic control-plane operation only.
\`\`\``
}

function completionPacket(instructionId, status) {
  return formatCompletionPacket({
    instructionId,
    originIssueNumber: issueNumber,
    originIssueUrl: issueUrl,
    codexThreadId: `thread-${instructionId}`,
    status,
    branch: "agent/issue-70-synthetic-closeout",
    commits: [],
    changedFiles: [],
    checks: {
      typecheck: "unknown",
      lint: "unknown",
      tests: "pass",
      cloudflareReadiness: "unknown",
      build: "unknown",
      diffCheck: "pass",
    },
    ownerQuestion: null,
    ownerRequest: null,
    blockers: [],
    ownerGates: [],
    productionReadback: [],
    safetyFindings: [],
    branchPushState: [],
    resultArtifact: null,
  })
}

function interruptedApproval() {
  const reason = "Approve a synthetic operation that was interrupted."
  const request = {
    method: "item/commandExecution/requestApproval",
    reason,
  }
  const scope = pendingActionScope(request)
  const key = pendingApprovalRequestKey(request)
  const reasonDigest = key.slice(`${scope}:`.length)
  return {
    schemaVersion: 1,
    key,
    scope,
    reason,
    reasonDigest,
    sourceInstructionId: instruction048,
    capturedAt: "2026-08-27T05:40:07.494Z",
    lastObservedAt: "2026-08-27T05:40:07.494Z",
    status: "interrupted",
    requestIdentities: [
      {
        requestId: 0,
        method: "item/commandExecution/requestApproval",
        threadId: "thread-048",
        turnId: "turn-048",
        itemId: "exec-048",
        identityDigest: controlPlaneBindingDigest("synthetic-approval-048"),
        observedAt: "2026-08-27T05:40:07.494Z",
      },
    ],
    decisionId: null,
    clearedAt: null,
    clearReason: null,
  }
}

function commentsBefore080Result(revision = 198) {
  return [
    {
      id: 15,
      body: controlBlock(instruction015, {
        action: "start",
        taskState: "ready",
      }),
    },
    {
      id: 48,
      body: controlBlock(instruction048, { taskState: "needs_review" }),
    },
    {
      id: 49,
      body: completionPacket(instruction048, "needs_owner"),
    },
    {
      id: 55,
      body: controlBlock(instruction055, { taskState: "running" }),
    },
    {
      id: 77,
      body: controlBlock(instruction077, { taskState: "needs_review" }),
    },
    { id: 78, body: controlBlock(instruction078) },
    { id: 79, body: controlBlock(instruction079) },
    {
      id: 80,
      body: controlBlock(instruction080, {
        supersedes: [instruction078, instruction079],
        expectedStateRevision: revision,
      }),
    },
  ]
}

function fixture({ supersessionRevision = 198, finalRevision = 200 } = {}) {
  const issue = {
    number: issueNumber,
    state: "closed",
    html_url: issueUrl,
    updated_at: "2026-08-31T10:00:00.000Z",
    body: "Synthetic Issue-70-shaped terminal closeout fixture.",
  }
  const state = {
    ...initialState({ repository, issueNumber, issueUrl }),
    stateRevision: supersessionRevision,
    status: "failed",
    lastConsumedInstructionId: instruction048,
    runs: [{ instructionId: instruction048, status: "needs_owner" }],
    pendingApprovalRequests: [interruptedApproval()],
  }
  const beforeResult = commentsBefore080Result(state.stateRevision)
  const superseding = selectInstructionSupersessionCandidate(
    issue,
    beforeResult,
    state,
  )
  const supersession = instructionSupersessionDecision({
    issue,
    comments: beforeResult,
    state,
    supersedingInstruction: superseding,
    claimRecords: {
      [instruction078]: null,
      [instruction079]: null,
      [instruction080]: null,
    },
  })
  assert.equal(supersession.accepted, true)
  const supersessionRecord = recordInstructionSupersession(
    state,
    supersession.value,
    { now: new Date("2026-08-30T17:39:00.000Z") },
  )
  state.stateRevision = supersessionRecord.committedStateRevision
  state.status = "needs_review"
  state.lastConsumedInstructionId = instruction080
  state.runs.push({ instructionId: instruction080, status: "needs_review" })
  state.stateRevision = finalRevision
  const comments = [
    ...beforeResult,
    { id: 801, body: completionPacket(instruction080, "needs_review") },
    {
      id: 81,
      body: controlBlock(instruction081, {
        action: "stop",
        taskState: "needs_review",
        terminal: true,
        expectedStateRevision: finalRevision,
      }),
    },
  ]
  const claimRecords = Object.fromEntries(
    [
      instruction015,
      instruction048,
      instruction055,
      instruction077,
      instruction078,
      instruction079,
      instruction080,
      instruction081,
    ].map((id) => [id, null]),
  )
  claimRecords[instruction048] = {
    originIssueNumber: issueNumber,
    status: "completed",
    attempt: 1,
    resultStatus: "needs_owner",
    completedAt: "2026-08-27T05:41:00.000Z",
  }
  claimRecords[instruction080] = {
    originIssueNumber: issueNumber,
    status: "completed",
    attempt: 1,
    resultStatus: "needs_review",
    completedAt: "2026-08-30T17:40:40.008Z",
  }
  return { issue, comments, state, claimRecords }
}

function decide(input = fixture()) {
  const candidate = selectTerminalCloseoutCandidate(
    input.issue,
    input.comments,
    input.state,
  )
  assert.equal(candidate?.instructionId, instruction081)
  return terminalCloseoutDecision({
    issue: input.issue,
    comments: input.comments,
    state: input.state,
    closeoutInstruction: candidate,
    claimRecords: input.claimRecords,
    now: closeoutTime,
  })
}

function rejectAfter(mutator, code) {
  const input = fixture()
  mutator(input)
  const before = structuredClone(input.state)
  const decision = terminalCloseoutDecision({
    issue: input.issue,
    comments: input.comments,
    state: input.state,
    closeoutInstruction: selectTerminalCloseoutCandidate(
      input.issue,
      input.comments,
      input.state,
    ),
    claimRecords: input.claimRecords,
    now: closeoutTime,
  })
  assert.equal(decision.accepted, false)
  assert.equal(decision.rejection.code, code)
  assert.deepEqual(input.state, before)
}

test("terminal closeout schema is exact and legacy stop parsing stays byte-for-byte compatible", () => {
  const legacyBlock = controlBlock("legacy-stop-001", {
    action: "stop",
    taskState: "needs_review",
  })
  const legacy = parseAgentControlBlock(
    legacyBlock.match(/```yaml\n([\s\S]*?)```/)[1],
  )
  assert.deepEqual(legacy, {
    action: "stop",
    taskState: "needs_review",
    instructionId: "legacy-stop-001",
    maxTurns: 1,
    ownerApprovalRequired: false,
    prompt: "Append-only synthetic control-plane operation only.",
  })
  const terminalBlock = controlBlock(instruction081, {
    action: "stop",
    taskState: "needs_review",
    terminal: true,
    expectedStateRevision: 200,
  })
  const terminal = parseAgentControlBlock(
    terminalBlock.match(/```yaml\n([\s\S]*?)```/)[1],
  )
  assert.equal(terminal.terminalState, "done")
  assert.equal(terminal.expectedStateRevision, 200)
  assert.deepEqual(terminal.closeout, {
    expectedLastConsumedInstructionId: instruction080,
    retireAllUnconsumedControls: true,
    supersedePendingApprovals: true,
    requireNoActiveClaims: true,
    requireOriginIssueClosed: true,
  })
  assert.throws(
    () =>
      parseAgentControlBlock(
        terminalBlock
          .replace("  terminal_state: done\n", "")
          .match(/```yaml\n([\s\S]*?)```/)[1],
      ),
    /terminal closeout/i,
  )
  assert.throws(
    () =>
      parseAgentControlBlock(
        terminalBlock
          .replace("    require_no_active_claims: true\n", "")
          .match(/```yaml\n([\s\S]*?)```/)[1],
      ),
    /terminal closeout/i,
  )
})

test("Issue-70-shaped closeout retires dormant 015/055 and eligible 077 while tombstoning 048", () => {
  const input = fixture()
  assert.equal(
    selectNextInstruction(input.issue, input.comments, input.state)
      .instructionId,
    instruction077,
  )
  const beforeRuns = structuredClone(input.state.runs)
  const decision = decide(input)
  assert.equal(decision.accepted, true)
  assert.deepEqual(decision.value.retiredInstructionIds, [
    instruction015,
    instruction055,
    instruction077,
  ])
  const record = recordTerminalCloseout(input.state, decision.value, {
    now: closeoutTime,
  })
  input.state.stateRevision = record.committedStateRevision
  validateTerminalCloseoutRecord(record, {
    state: input.state,
    controls: [
      ...input.comments.flatMap((comment) => {
        const match = comment.body.match(/```yaml\n([\s\S]*?)```/)
        return match?.[1]?.includes("agent_control:")
          ? [parseAgentControlBlock(match[1])]
          : []
      }),
    ],
  })
  assert.equal(input.state.status, "done")
  assert.equal(input.state.task.originIssueClosed, true)
  assert.equal(input.state.lastConsumedInstructionId, instruction081)
  assert.deepEqual(input.state.runs, beforeRuns)
  assert.equal(input.state.pendingApprovalRequests[0].status, "terminally_retired")
  assert.equal(input.state.pendingApprovalRequests[0].decisionId, null)
  assert.equal(record.executionOccurred, false)
  assert.deepEqual(
    terminalCloseoutAuditEvents(record).map((event) => event.type),
    [
      "task_terminally_closed",
      "instruction_terminally_retired",
      "instruction_terminally_retired",
      "instruction_terminally_retired",
      "approval_terminally_retired",
    ],
  )
  for (const status of [
    "ready",
    "failed",
    "needs_review",
    "needs_owner",
    "done",
  ]) {
    assert.equal(
      selectNextInstruction(input.issue, input.comments, {
        ...input.state,
        status,
      }),
      null,
    )
  }
  assert.equal(
    input.comments.some(
      (comment) =>
        comment.body.includes(`pickup_instruction_id: ${instruction081}`) ||
        comment.body.includes(`instruction_id: ${instruction081}\n`),
    ),
    true,
  )
  assert.equal(
    input.comments.some(
      (comment) =>
        comment.body.includes("agent_pickup:") &&
        comment.body.includes(instruction081),
    ),
    false,
  )
  assert.equal(
    input.comments.some(
      (comment) =>
        comment.body.includes("agent_result:") &&
        comment.body.includes(instruction081),
    ),
    false,
  )
})

test("terminal closeout fail-closed matrix leaves the entire synthetic state unchanged", () => {
  rejectAfter(
    ({ comments }) => {
      comments.at(-1).body = comments.at(-1).body.replace(
        "expected_state_revision: 200",
        "expected_state_revision: 199",
      )
    },
    "state_revision_mismatch",
  )
  rejectAfter(
    ({ comments }) => {
      comments.at(-1).body = comments.at(-1).body.replace(
        instruction080,
        instruction048,
      )
    },
    "last_consumed_instruction_mismatch",
  )
  rejectAfter(({ state }) => {
    state.activeInstruction = { instructionId: instruction077 }
  }, "active_instruction")
  rejectAfter(({ claimRecords }) => {
    claimRecords[instruction077] = {
      originIssueNumber: issueNumber,
      status: "active",
      attempt: 1,
    }
  }, "active_queue_claim")
  rejectAfter(({ state }) => {
    state.retryInstructionIds = [instruction077]
  }, "active_retry_marker")
  rejectAfter(({ state }) => {
    state.ownerApprovalDecisions = [{ decisionId: "pending-decision" }]
  }, "pending_mutation_grant")
  rejectAfter(({ state }) => {
    state.gitReconciliationCheckpoints = [
      { kind: "execution_intent", executionId: "execution-001" },
    ]
  }, "pending_broker_receipt")
  rejectAfter(({ comments }) => {
    comments.splice(comments.findIndex((comment) => comment.id === 801), 1)
  }, "incomplete_result_publication")
  rejectAfter(({ claimRecords }) => {
    claimRecords[instruction077] = {
      originIssueNumber: issueNumber,
      status: "completed",
      attempt: 1,
      resultStatus: "needs_review",
    }
  }, "unconsumed_target_claimed")
  rejectAfter(({ comments }) => {
    comments.push({
      id: 900,
      body: formatPickupPacket({
        instructionId: instruction077,
        originIssueNumber: issueNumber,
        originIssueUrl: issueUrl,
        codexThreadId: "thread-077",
      }),
    })
  }, "unconsumed_target_pickup")
  rejectAfter(({ state }) => {
    state.pendingApprovalRequests[0].reasonDigest = "0".repeat(64)
  }, "pending_approval_identity_mismatch")
  rejectAfter(({ issue }) => {
    issue.state = "open"
  }, "github_issue_not_closed")
})

test("record-time validation failure performs no in-memory partial retirement", () => {
  const input = fixture()
  const decision = decide(input)
  decision.value.approvalTombstones[0].key = "drifted-approval"
  const before = structuredClone(input.state)
  assert.throws(
    () => recordTerminalCloseout(input.state, decision.value),
    /approval tombstone binding changed/i,
  )
  assert.deepEqual(input.state, before)
})

test("existing canonical result history is consumed history and is never mislabeled retirement", () => {
  const input = fixture()
  input.comments.push({
    id: 901,
    body: completionPacket(instruction077, "needs_review"),
  })
  const decision = decide(input)
  assert.equal(decision.accepted, true)
  assert.equal(
    decision.value.retiredInstructionIds.includes(instruction077),
    false,
  )
})

test("state CAS conflict leaves the durable task entirely pre-closeout", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-terminal-closeout-cas-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const options = { stateDirectory: directory, repository, issueNumber }
  const store = new StateStore(options)
  const input = fixture({ supersessionRevision: 0, finalRevision: 1 })
  const durable = await store.load()
  Object.assign(durable, structuredClone(input.state), {
    stateRevision: durable.stateRevision,
  })
  await store.save(durable)
  const stale = await store.load()
  const concurrent = await store.load()
  input.comments.at(-1).body = input.comments.at(-1).body.replace(
    "expected_state_revision: 1",
    `expected_state_revision: ${stale.stateRevision}`,
  )
  const closeout = terminalCloseoutDecision({
    issue: input.issue,
    comments: input.comments,
    state: stale,
    closeoutInstruction: selectTerminalCloseoutCandidate(
      input.issue,
      input.comments,
      stale,
    ),
    claimRecords: input.claimRecords,
    now: closeoutTime,
  })
  assert.equal(closeout.accepted, true)
  recordTerminalCloseout(stale, closeout.value, { now: closeoutTime })
  concurrent.updatedAt = "2026-08-31T11:59:59.000Z"
  await store.save(concurrent)
  await assert.rejects(store.save(stale), StateRevisionConflictError)
  const after = await store.load()
  assert.equal(after.status, "needs_review")
  assert.equal(after.task.originIssueClosed, false)
  assert.deepEqual(after.terminalCloseouts, [])
  assert.equal(after.pendingApprovalRequests[0].status, "interrupted")
})

test("audit reconstruction after a committed CAS is idempotent", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-terminal-closeout-audit-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new StateStore({ stateDirectory: directory, repository, issueNumber })
  const input = fixture({ supersessionRevision: 0, finalRevision: 1 })
  const state = await store.load()
  Object.assign(state, structuredClone(input.state), {
    stateRevision: state.stateRevision,
  })
  await store.save(state)
  const current = await store.load()
  input.comments.at(-1).body = input.comments.at(-1).body.replace(
    "expected_state_revision: 1",
    `expected_state_revision: ${current.stateRevision}`,
  )
  const decision = terminalCloseoutDecision({
    issue: input.issue,
    comments: input.comments,
    state: current,
    closeoutInstruction: selectTerminalCloseoutCandidate(
      input.issue,
      input.comments,
      current,
    ),
    claimRecords: input.claimRecords,
    now: closeoutTime,
  })
  const record = recordTerminalCloseout(current, decision.value, {
    now: closeoutTime,
  })
  await store.save(current)
  assert.equal((await store.readEvents()).length, 0)
  const config = { stateDirectory: directory, repository }
  await reconcilePersistedTerminalCloseoutAudits(config)
  await reconcilePersistedTerminalCloseoutAudits(config)
  const events = await store.readEvents()
  assert.equal(events.length, terminalCloseoutAuditEvents(record).length)
  assert.equal(new Set(events.map((event) => event.eventId)).size, events.length)
})

test("duplicate closeout reconciliation appends events once and never creates a run", async () => {
  const input = fixture()
  const events = new Map()
  const store = {
    async save(state) {
      state.stateRevision += 1
    },
    async appendEventOnce(eventId, event) {
      if (!events.has(eventId)) events.set(eventId, event)
    },
  }
  const claimStore = {
    async inspectInstructionClaims() {
      return input.claimRecords
    },
  }
  const beforeRuns = structuredClone(input.state.runs)
  const first = await reconcileTerminalCloseout({
    state: input.state,
    task: { issue: input.issue, comments: input.comments },
    store,
    claimStore,
    issueClaim: {},
  })
  const second = await reconcileTerminalCloseout({
    state: input.state,
    task: { issue: input.issue, comments: input.comments },
    store,
    claimStore,
    issueClaim: {},
  })
  assert.equal(first.status, "applied")
  assert.equal(second.status, "reconciled")
  assert.deepEqual(input.state.runs, beforeRuns)
  assert.equal(events.size, 5)
})

test("schema-11 state migrates to schema 12 exactly once with an empty closeout ledger", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-terminal-closeout-migration-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new StateStore({ stateDirectory: directory, repository, issueNumber })
  const original = await store.load()
  original.schemaVersion = 11
  delete original.terminalCloseouts
  await writeFile(store.statePath, `${JSON.stringify(original, null, 2)}\n`)
  const migrated = await store.load()
  assert.equal(migrated.schemaVersion, currentStateSchemaVersion)
  assert.deepEqual(migrated.terminalCloseouts, [])
  assert.equal(migrated.stateRevision, original.stateRevision + 1)
  const second = await store.load()
  assert.equal(second.stateRevision, migrated.stateRevision)
})

test("schema-12 closeout state is above the legacy schema-11 compatibility ceiling", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-terminal-closeout-downgrade-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new StateStore({ stateDirectory: directory, repository, issueNumber })
  await store.load()
  const raw = JSON.parse(await readFile(store.statePath, "utf8"))
  assert.equal(raw.schemaVersion, 12)
  assert.ok(raw.schemaVersion > 11)
})

test("controller identity is binding-sensitive and the closeout replay is stable", () => {
  const input = fixture()
  const control = selectTerminalCloseoutCandidate(
    input.issue,
    input.comments,
    input.state,
  )
  const digest = agentControlBindingDigest(control)
  const decision = decide(input)
  const record = recordTerminalCloseout(input.state, decision.value, {
    now: closeoutTime,
  })
  input.state.stateRevision = record.committedStateRevision
  assert.equal(
    agentControlBindingDigest(
      selectTerminalCloseoutCandidate(input.issue, input.comments, input.state),
    ),
    digest,
  )
  const replay = terminalCloseoutDecision({
    issue: input.issue,
    comments: input.comments,
    state: input.state,
    closeoutInstruction: control,
    claimRecords: {},
  })
  assert.equal(replay.accepted, true)
  assert.equal(replay.value.alreadyApplied, true)
  assert.equal(replay.value.record.closeoutId, record.closeoutId)
})

test("closed-issue access requires the explicit bounded once closeout command shape", () => {
  const config = parseConfig([
    "once",
    "--issue",
    "70",
    "--terminal-closeout",
  ])
  assert.equal(config.command, "once")
  assert.equal(config.issueNumber, 70)
  assert.equal(config.issueNumberExplicit, true)
  assert.equal(config.terminalCloseout, true)
  assert.equal(config.autoCommit, false)
  for (const argv of [
    ["watch", "--issue", "70", "--terminal-closeout"],
    ["once", "--terminal-closeout"],
    [
      "once",
      "--issue",
      "70",
      "--terminal-closeout",
      "--auto-commit",
    ],
  ]) {
    assert.throws(() => parseConfig(argv), /terminal-closeout requires once/i)
  }
})

test("direct orchestration rejects terminal closeout before any durable instruction mutation", async () => {
  const input = fixture()
  const before = structuredClone(input.state)
  let saves = 0
  let events = 0
  const orchestrator = new Orchestrator(
    {
      repository,
      issueNumber,
      checkoutPath: "/synthetic/unused",
      codexBinary: "codex",
    },
    {
      appServer: {
        async start() {},
        async stop() {},
      },
      controlPlane: {},
      store: {
        async load() {
          return input.state
        },
        async save() {
          saves += 1
        },
        async appendEvent() {
          events += 1
        },
      },
    },
  )
  await assert.rejects(
    orchestrator.runOnce({
      task: { issue: input.issue, comments: input.comments },
    }),
    (error) => {
      assert.equal(error.code, "TERMINAL_CLOSEOUT_RECONCILIATION_REQUIRED")
      return true
    },
  )
  await orchestrator.stop()
  assert.equal(saves, 0)
  assert.equal(events, 0)
  assert.deepEqual(input.state, before)
})

test("legacy stop controls retain their normal exactly-once stopped behavior", async () => {
  const instructionId = "legacy-stop-runtime-001"
  const state = {
    ...initialState({ repository, issueNumber, issueUrl }),
    status: "needs_review",
  }
  let saves = 0
  const orchestrator = new Orchestrator(
    {
      repository,
      issueNumber,
      checkoutPath: "/synthetic/unused",
      codexBinary: "codex",
    },
    {
      appServer: {
        async start() {},
        async stop() {},
      },
      controlPlane: {},
      store: {
        async load() {
          return state
        },
        async save() {
          saves += 1
        },
        async appendEvent() {},
      },
    },
  )
  const task = {
    issue: {
      number: issueNumber,
      state: "open",
      html_url: issueUrl,
      body: controlBlock(instructionId, {
        action: "stop",
        taskState: "needs_review",
      }),
    },
    comments: [],
  }
  const result = await orchestrator.runOnce({ task })
  const replay = await orchestrator.runOnce({ task })
  await orchestrator.stop()
  assert.deepEqual(result, { status: "stopped", instructionId })
  assert.equal(replay.status, "idle")
  assert.equal(state.status, "needs_review")
  assert.equal(state.lastConsumedInstructionId, instructionId)
  assert.equal(state.activeInstruction, null)
  assert.deepEqual(state.terminalCloseouts, [])
  assert.equal(saves, 2)
})

function scannerFor(input, { pauseFirstFetch = null } = {}) {
  let fetches = 0
  return {
    threadId: "repository-closeout-thread",
    appServer: {
      async callMcpTool(request) {
        if (request.tool === "github.fetch_issue") {
          fetches += 1
          if (fetches === 1 && pauseFirstFetch) await pauseFirstFetch()
          return { structuredContent: { issue: input.issue } }
        }
        if (request.tool === "github.fetch_issue_comments") {
          return { structuredContent: { comments: input.comments } }
        }
        throw new Error(`Unexpected GitHub tool: ${request.tool}`)
      },
    },
  }
}

function memoryStateStore(input) {
  const events = new Map()
  return {
    events,
    StateStoreClass: class {
      async load() {
        return input.state
      }

      async save(state) {
        state.stateRevision += 1
        input.state = state
      }

      async appendEventOnce(eventId, event) {
        if (!events.has(eventId)) events.set(eventId, event)
      }

      async appendEvent(event) {
        events.set(`event:${events.size}`, event)
      }
    },
  }
}

function serializedClaimStore(input, { entered = null } = {}) {
  let tail = Promise.resolve()
  return {
    async withIssueClaim(_binding, callback) {
      let release
      const prior = tail
      tail = new Promise((resolve) => {
        release = resolve
      })
      await prior
      entered?.()
      try {
        return { claimed: true, value: await callback({ issueNumber }) }
      } finally {
        release()
      }
    },
    async inspectInstructionClaims() {
      return input.claimRecords
    },
  }
}

test("explicit closeout inspects a closed issue while the normal path cannot execute it", async () => {
  const input = fixture()
  const memory = memoryStateStore(input)
  const claimStore = serializedClaimStore(input)
  let orchestratorStarts = 0
  class ForbiddenOrchestrator {
    constructor() {
      orchestratorStarts += 1
      throw new Error("A terminal closeout must not construct the orchestrator")
    }
  }
  const baseConfig = {
    repository,
    issueNumber,
    issueNumberExplicit: true,
    stateDirectory: "/synthetic/unused",
    retryBaseMs: 1_000,
    terminalCloseout: true,
  }
  const result = await runRepositoryIssue(
    scannerFor(input),
    baseConfig,
    { issueNumber, searchMatched: false },
    {
      OrchestratorClass: ForbiddenOrchestrator,
      StateStoreClass: memory.StateStoreClass,
      claimStore,
    },
  )
  assert.equal(result.status, "done")
  assert.equal(result.instructionId, instruction081)
  assert.equal(result.claimed, true)
  assert.equal(orchestratorStarts, 0)
  assert.equal(input.state.runs.length, 2)

  const normalInput = fixture()
  const normalMemory = memoryStateStore(normalInput)
  const normal = await runRepositoryIssue(
    scannerFor(normalInput),
    { ...baseConfig, terminalCloseout: false },
    { issueNumber, searchMatched: false },
    {
      OrchestratorClass: ForbiddenOrchestrator,
      StateStoreClass: normalMemory.StateStoreClass,
      claimStore: serializedClaimStore(normalInput),
    },
  )
  assert.equal(normal.status, "closed")
  assert.equal(normalInput.state.status, "needs_review")
  assert.equal(normalInput.state.terminalCloseouts.length, 0)
  assert.equal(orchestratorStarts, 0)
})

test("selector racing terminal closeout observes done and cannot execute a retiring control", async () => {
  const input = fixture()
  const memory = memoryStateStore(input)
  let releaseFetch
  const fetchGate = new Promise((resolve) => {
    releaseFetch = resolve
  })
  let enteredResolve
  const entered = new Promise((resolve) => {
    enteredResolve = resolve
  })
  const claimStore = serializedClaimStore(input, { entered: enteredResolve })
  const scanner = scannerFor(input, { pauseFirstFetch: () => fetchGate })
  let starts = 0
  class ForbiddenOrchestrator {
    constructor() {
      starts += 1
      throw new Error("Selector executed during terminal closeout")
    }
  }
  const base = {
    repository,
    issueNumber,
    issueNumberExplicit: true,
    stateDirectory: "/synthetic/unused",
    retryBaseMs: 1_000,
  }
  const closing = runRepositoryIssue(
    scanner,
    { ...base, terminalCloseout: true },
    { issueNumber, searchMatched: false },
    {
      OrchestratorClass: ForbiddenOrchestrator,
      StateStoreClass: memory.StateStoreClass,
      claimStore,
    },
  )
  await entered
  const selecting = runRepositoryIssue(
    scanner,
    { ...base, terminalCloseout: false },
    { issueNumber, searchMatched: false },
    {
      OrchestratorClass: ForbiddenOrchestrator,
      StateStoreClass: memory.StateStoreClass,
      claimStore,
    },
  )
  releaseFetch()
  const [closed, observed] = await Promise.all([closing, selecting])
  assert.equal(closed.status, "done")
  assert.equal(observed.status, "done")
  assert.equal(observed.claimed, false)
  assert.equal(starts, 0)
  assert.equal(input.state.terminalCloseouts.length, 1)
  assert.equal(memory.events.size, 5)
})
