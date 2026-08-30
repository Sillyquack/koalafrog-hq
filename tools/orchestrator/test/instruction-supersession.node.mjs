import assert from "node:assert/strict"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import {
  instructionSupersessionAuditEvents,
  instructionSupersessionDecision,
  parseAgentControlBlock,
  recordInstructionSupersession,
  requireInstructionSupersessionReconciliation,
  selectInstructionSupersessionCandidate,
  selectNextInstruction,
} from "../src/control-plane.mjs"
import { QueueClaimStore } from "../src/queue-claim-store.mjs"
import {
  reconcilePendingInstructionSupersession,
  runRepositoryCycle,
} from "../src/repository-runner.mjs"
import {
  currentStateSchemaVersion,
  initialState,
  migrateState,
  StateStore,
} from "../src/state-store.mjs"

const repository = "Sillyquack/koalafrog-hq"
const issueNumber = 70
const issueUrl =
  "https://github.com/Sillyquack/koalafrog-hq/issues/70"
const instruction077 = "synthetic-stale-state-077"
const instruction078 = "synthetic-stale-pending-078"
const instruction079 = "synthetic-stale-pending-079"
const instruction080 = "synthetic-superseding-reconciliation-080"

function controlBlock(
  instructionId,
  {
    action = "continue",
    taskState = "failed",
    prompt = "Perform only the bounded synthetic control-plane operation.",
    supersedes = [],
    expectedStateRevision = null,
  } = {},
) {
  const declaration = supersedes.length
    ? `  supersedes:\n${supersedes.map((id) => `    - ${id}`).join("\n")}\n  expected_state_revision: ${expectedStateRevision}\n`
    : ""
  return `\`\`\`yaml
agent_control:
  action: ${action}
  task_state: ${taskState}
  instruction_id: ${instructionId}
  max_turns: 1
  owner_approval_required: false
${declaration}  prompt: |
    ${prompt}
\`\`\``
}

function syntheticTask({ revision = 12, supersedes = [instruction078, instruction079] } = {}) {
  return {
    issue: {
      number: issueNumber,
      state: "open",
      html_url: issueUrl,
      updated_at: "2026-08-30T16:00:00Z",
      body: controlBlock("synthetic-consumed-076"),
    },
    comments: [
      {
        id: 77,
        body: controlBlock(instruction077, { taskState: "needs_review" }),
      },
      { id: 78, body: controlBlock(instruction078) },
      { id: 79, body: controlBlock(instruction079) },
      {
        id: 80,
        body: controlBlock(instruction080, {
          supersedes,
          expectedStateRevision: revision,
        }),
      },
    ],
  }
}

function syntheticState({ revision = 12 } = {}) {
  return {
    ...initialState({ repository, issueNumber, issueUrl }),
    stateRevision: revision,
    status: "failed",
    lastConsumedInstructionId: "synthetic-consumed-076",
    runs: [
      {
        instructionId: "synthetic-consumed-076",
        status: "failed",
      },
    ],
  }
}

function decide({
  state = syntheticState(),
  task = syntheticTask({ revision: state.stateRevision }),
  claimRecords = {},
} = {}) {
  const candidate = selectInstructionSupersessionCandidate(
    task.issue,
    task.comments,
    state,
  )
  assert.equal(candidate?.instructionId, instruction080)
  return instructionSupersessionDecision({
    issue: task.issue,
    comments: task.comments,
    state,
    supersedingInstruction: candidate,
    claimRecords: {
      [instruction080]: null,
      [instruction078]: null,
      [instruction079]: null,
      ...claimRecords,
    },
  })
}

test("supersedes is an explicit revision-bound control extension while legacy controls remain unchanged", () => {
  const legacy = parseAgentControlBlock(
    controlBlock("legacy-control-001").match(/```yaml\n([\s\S]*?)```/)[1],
  )
  assert.deepEqual(legacy, {
    action: "continue",
    taskState: "failed",
    instructionId: "legacy-control-001",
    maxTurns: 1,
    ownerApprovalRequired: false,
    prompt: "Perform only the bounded synthetic control-plane operation.",
  })

  const superseding = parseAgentControlBlock(
    controlBlock(instruction080, {
      supersedes: [instruction078, instruction079],
      expectedStateRevision: 12,
    }).match(/```yaml\n([\s\S]*?)```/)[1],
  )
  assert.deepEqual(superseding.supersedes, [instruction078, instruction079])
  assert.equal(superseding.expectedStateRevision, 12)
  assert.throws(
    () =>
      parseAgentControlBlock(
        controlBlock(instruction080, {
          supersedes: [instruction078, instruction078],
          expectedStateRevision: 12,
        }).match(/```yaml\n([\s\S]*?)```/)[1],
      ),
    /supersedes/i,
  )
  assert.throws(
    () =>
      parseAgentControlBlock(
        controlBlock(instruction080, {
          supersedes: [instruction078],
          expectedStateRevision: null,
        })
          .replace("  expected_state_revision: null\n", "")
          .match(/```yaml\n([\s\S]*?)```/)[1],
      ),
    /expected_state_revision/i,
  )
})

test("two older pending instructions retire atomically and reveal the superseding control", () => {
  const state = syntheticState()
  const task = syntheticTask()
  assert.equal(
    selectNextInstruction(task.issue, task.comments, state).instructionId,
    instruction078,
  )

  const decision = decide({ state, task })
  assert.equal(decision.accepted, true)
  const beforeStatus = state.status
  const beforeRuns = structuredClone(state.runs)
  const record = recordInstructionSupersession(state, decision.value, {
    now: new Date("2026-08-30T16:01:00.000Z"),
  })
  state.stateRevision = record.committedStateRevision

  assert.equal(state.status, beforeStatus)
  assert.deepEqual(state.runs, beforeRuns)
  assert.equal(state.activeInstruction, null)
  assert.deepEqual(record.supersededInstructionIds, [
    instruction078,
    instruction079,
  ])
  assert.equal(
    selectNextInstruction(task.issue, task.comments, state).instructionId,
    instruction080,
  )
  state.lastConsumedInstructionId = instruction080
  state.runs.push({ instructionId: instruction080, status: "needs_review" })
  assert.equal(selectNextInstruction(task.issue, task.comments, state), null)

  const events = instructionSupersessionAuditEvents(record)
  assert.equal(events.length, 2)
  assert.deepEqual(
    events.map((event) => event.type),
    ["instruction_superseded", "instruction_superseded"],
  )
  assert.deepEqual(
    events.map((event) => event.supersededInstructionId),
    [instruction078, instruction079],
  )
  assert.ok(events.every((event) => event.executionOccurred === false))
})

test("synthetic 077/078/079/080 ordering skips stale 077 and only reaches 080 after durable retirement", () => {
  const state = syntheticState()
  const task = syntheticTask()
  assert.equal(
    selectNextInstruction(task.issue, task.comments, state).instructionId,
    instruction078,
  )
  const decision = decide({ state, task })
  const record = recordInstructionSupersession(state, decision.value)
  state.stateRevision = record.committedStateRevision
  assert.equal(
    selectNextInstruction(task.issue, task.comments, state).instructionId,
    instruction080,
  )
})

test("direct orchestration fails closed until repository reconciliation makes supersession durable", () => {
  const state = syntheticState()
  const task = syntheticTask()
  assert.throws(
    () =>
      requireInstructionSupersessionReconciliation({
        issue: task.issue,
        comments: task.comments,
        state,
      }),
    (error) => {
      assert.equal(
        error.code,
        "INSTRUCTION_SUPERSESSION_RECONCILIATION_REQUIRED",
      )
      return true
    },
  )
  const decision = decide({ state, task })
  const record = recordInstructionSupersession(state, decision.value)
  state.stateRevision = record.committedStateRevision
  assert.throws(
    () =>
      requireInstructionSupersessionReconciliation({
        issue: task.issue,
        comments: task.comments,
        state,
      }),
    (error) => {
      assert.equal(
        error.code,
        "INSTRUCTION_SUPERSESSION_RECONCILIATION_REQUIRED",
      )
      return true
    },
  )
  assert.equal(
    requireInstructionSupersessionReconciliation({
      issue: task.issue,
      comments: task.comments,
      state,
      reconciledInstructionId: instruction080,
    }).instructionId,
    instruction080,
  )
})

test("every target must be pending, older, same-issue, artifact-free, and revision-bound", async (t) => {
  const cases = [
    {
      name: "claimed",
      mutate({ claimRecords }) {
        claimRecords[instruction078] = {
          instructionId: instruction078,
          originIssueNumber: issueNumber,
          status: "active",
          attempt: 1,
        }
      },
      code: "target_claimed",
    },
    {
      name: "superseding control already claimed",
      mutate({ claimRecords }) {
        claimRecords[instruction080] = {
          instructionId: instruction080,
          originIssueNumber: issueNumber,
          status: "released",
          attempt: 1,
        }
      },
      code: "superseding_control_claimed",
    },
    {
      name: "executed",
      mutate({ state }) {
        state.runs.push({ instructionId: instruction078, status: "failed" })
      },
      code: "target_run_history",
    },
    {
      name: "pickup without result",
      mutate({ task }) {
        task.comments.push({
          id: 81,
          body: `agent_pickup:\n  instruction_id: ${instruction078}\n`,
        })
      },
      code: "target_pickup",
    },
    {
      name: "result",
      mutate({ task }) {
        task.comments.push({
          id: 81,
          body: `agent_result:\n  instruction_id: ${instruction078}\n`,
        })
      },
      code: "target_result",
    },
    {
      name: "retry history",
      mutate({ state }) {
        state.retryInstructionIds.push(instruction078)
      },
      code: "target_retry_history",
    },
    {
      name: "already consumed",
      mutate({ state }) {
        state.lastConsumedInstructionId = instruction078
      },
      code: "target_consumed",
    },
    {
      name: "missing or another issue",
      mutate({ task }) {
        task.comments = task.comments.filter((comment) => comment.id !== 78)
      },
      code: "target_missing",
    },
    {
      name: "newer target",
      mutate({ task, claimRecords }) {
        task.comments[3].body = controlBlock(instruction080, {
          supersedes: [instruction079, "synthetic-newer-081"],
          expectedStateRevision: 12,
        })
        task.comments.push({
          id: 81,
          body: controlBlock("synthetic-newer-081"),
        })
        claimRecords["synthetic-newer-081"] = null
      },
      code: "target_not_older",
    },
    {
      name: "active instruction",
      mutate({ state }) {
        state.activeInstruction = {
          instructionId: "synthetic-active-001",
          phase: "selected",
        }
      },
      code: "active_instruction",
    },
    {
      name: "revision mismatch",
      mutate({ state }) {
        state.stateRevision += 1
      },
      code: "state_revision_mismatch",
    },
    {
      name: "claim from another issue",
      mutate({ claimRecords }) {
        claimRecords[instruction078] = {
          instructionId: instruction078,
          originIssueNumber: 71,
          status: "completed",
          attempt: 1,
        }
      },
      code: "target_claim_origin",
    },
  ]

  for (const fixture of cases) {
    await t.test(fixture.name, () => {
      const state = syntheticState()
      const task = syntheticTask()
      const claimRecords = {
        [instruction080]: null,
        [instruction078]: null,
        [instruction079]: null,
      }
      fixture.mutate({ state, task, claimRecords })
      const initial = structuredClone(state)
      const candidate = selectInstructionSupersessionCandidate(
        task.issue,
        task.comments,
        state,
      )
      const decision = instructionSupersessionDecision({
        issue: task.issue,
        comments: task.comments,
        state,
        supersedingInstruction: candidate,
        claimRecords,
      })
      assert.equal(decision.accepted, false)
      assert.equal(decision.rejection.code, fixture.code)
      assert.deepEqual(state, initial)
      assert.deepEqual(state.instructionSupersessions, [])
    })
  }
})

test("one invalid target rolls back the complete declaration", () => {
  const state = syntheticState()
  const task = syntheticTask()
  const initial = structuredClone(state)
  const decision = decide({
    state,
    task,
    claimRecords: {
      [instruction079]: {
        instructionId: instruction079,
        originIssueNumber: issueNumber,
        status: "released",
        attempt: 1,
      },
    },
  })
  assert.equal(decision.accepted, false)
  assert.equal(decision.rejection.code, "target_claimed")
  assert.deepEqual(state, initial)
})

test("supersession cannot be recorded without explicit queue inspection evidence", () => {
  const state = syntheticState()
  const task = syntheticTask()
  const candidate = selectInstructionSupersessionCandidate(
    task.issue,
    task.comments,
    state,
  )
  const decision = instructionSupersessionDecision({
    issue: task.issue,
    comments: task.comments,
    state,
    supersedingInstruction: candidate,
    claimRecords: {},
  })
  assert.equal(decision.accepted, false)
  assert.equal(decision.rejection.code, "claim_inspection_missing")
  assert.deepEqual(state.instructionSupersessions, [])
})

test("a consumed superseding control without its durable retirement fails closed", () => {
  const state = syntheticState()
  const task = syntheticTask()
  state.runs.push({ instructionId: instruction080, status: "needs_review" })
  assert.throws(
    () => selectNextInstruction(task.issue, task.comments, state),
    /missing its durable retirement/,
  )
})

test("normal oldest-eligible ordering is unchanged without a supersession declaration", () => {
  const state = syntheticState()
  const task = syntheticTask({ supersedes: [] })
  task.comments[3].body = controlBlock(instruction080)
  assert.equal(
    selectNextInstruction(task.issue, task.comments, state).instructionId,
    instruction078,
  )
  assert.equal(
    selectInstructionSupersessionCandidate(task.issue, task.comments, state),
    null,
  )
})

test("schema ten migrates to an empty append-only supersession ledger", () => {
  const state = syntheticState()
  state.schemaVersion = 10
  delete state.instructionSupersessions
  const migrated = migrateState(state, { repository, issueNumber })
  assert.equal(migrated.schemaVersion, currentStateSchemaVersion)
  assert.deepEqual(migrated.instructionSupersessions, [])
})

test("queue claim inspection is issue-lease-bound and treats every prior record as claimed", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-supersession-claims-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const claims = new QueueClaimStore({ stateDirectory: directory })

  const first = await claims.withIssueClaim(
    { originIssueNumber: issueNumber },
    async (issueClaim) =>
      claims.inspectInstructionClaims(
        {
          instructionIds: [instruction078, instruction079],
          originIssueNumber: issueNumber,
        },
        { issueClaim },
      ),
  )
  assert.equal(first.claimed, true)
  assert.deepEqual(first.value, {
    [instruction078]: null,
    [instruction079]: null,
  })

  await claims.withClaim(
    { instructionId: instruction078, originIssueNumber: issueNumber },
    async () => ({ status: "queue_changed" }),
  )
  const second = await claims.withIssueClaim(
    { originIssueNumber: issueNumber },
    async (issueClaim) =>
      claims.inspectInstructionClaims(
        {
          instructionIds: [instruction078, instruction079],
          originIssueNumber: issueNumber,
        },
        { issueClaim },
      ),
  )
  assert.equal(second.value[instruction078].status, "released")
  assert.equal(second.value[instruction079], null)
})

test("the issue lease prevents a selector-versus-claim race from executing a retired target", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-supersession-race-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const claims = new QueueClaimStore({ stateDirectory: directory })
  let release
  let entered
  const selected = new Promise((resolve) => {
    entered = resolve
  })
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const owner = claims.withIssueClaim(
    { originIssueNumber: issueNumber },
    async (issueClaim) => {
      const snapshot = await claims.inspectInstructionClaims(
        {
          instructionIds: [instruction078, instruction079],
          originIssueNumber: issueNumber,
        },
        { issueClaim },
      )
      entered(snapshot)
      await gate
      return snapshot
    },
  )
  await selected
  let targetCallbacks = 0
  const contender = await claims.withClaim(
    { instructionId: instruction078, originIssueNumber: issueNumber },
    async () => {
      targetCallbacks += 1
      return { status: "needs_review" }
    },
  )
  assert.equal(contender.claimed, false)
  assert.equal(contender.reason, "issue_busy")
  assert.equal(targetCallbacks, 0)
  release()
  assert.equal((await owner).claimed, true)
})

test("a crash between per-target audit events resumes idempotently before selection", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-supersession-audit-recovery-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new StateStore({
    stateDirectory: directory,
    repository,
    issueNumber,
  })
  const state = await store.load()
  state.status = "failed"
  state.task.originIssueUrl = issueUrl
  state.lastConsumedInstructionId = "synthetic-consumed-076"
  state.runs.push({
    instructionId: "synthetic-consumed-076",
    status: "failed",
  })
  await store.save(state)
  const task = syntheticTask({ revision: state.stateRevision })
  const claims = new QueueClaimStore({ stateDirectory: directory })
  let auditCalls = 0
  const interruptedStore = {
    save: store.save.bind(store),
    async appendEventOnce(...args) {
      auditCalls += 1
      if (auditCalls === 2) throw new Error("synthetic audit interruption")
      return store.appendEventOnce(...args)
    },
  }
  const interrupted = await claims.withIssueClaim(
    { originIssueNumber: issueNumber },
    async (issueClaim) => {
      await assert.rejects(
        reconcilePendingInstructionSupersession({
          state,
          task,
          store: interruptedStore,
          claimStore: claims,
          issueClaim,
        }),
        /synthetic audit interruption/,
      )
    },
  )
  assert.equal(interrupted.claimed, true)

  const durable = await store.load()
  assert.equal(durable.status, "failed")
  assert.equal(durable.instructionSupersessions.length, 1)
  assert.equal(
    durable.runs.some((run) =>
      [instruction078, instruction079].includes(run.instructionId),
    ),
    false,
  )
  const recovered = await claims.withIssueClaim(
    { originIssueNumber: issueNumber },
    (issueClaim) =>
      reconcilePendingInstructionSupersession({
        state: durable,
        task,
        store,
        claimStore: claims,
        issueClaim,
      }),
  )
  assert.equal(recovered.value.status, "reconciled")
  assert.equal(
    selectNextInstruction(task.issue, task.comments, durable).instructionId,
    instruction080,
  )
  const events = await store.readEvents()
  assert.equal(
    events.filter((event) => event.type === "instruction_superseded").length,
    2,
  )
})

test("repository once applies supersession before claiming the later instruction", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-supersession-once-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new StateStore({
    stateDirectory: directory,
    repository,
    issueNumber,
  })
  const state = await store.load()
  state.status = "failed"
  state.lastConsumedInstructionId = "synthetic-consumed-076"
  state.runs.push({
    instructionId: "synthetic-consumed-076",
    status: "failed",
  })
  await store.save(state)
  const task = syntheticTask({ revision: state.stateRevision })
  const scanner = {
    threadId: "synthetic-scanner",
    appServer: {
      async callMcpTool(request) {
        if (request.tool === "github.fetch_issue") {
          return { structuredContent: { issue: task.issue } }
        }
        if (request.tool === "github.fetch_issue_comments") {
          return { structuredContent: { comments: task.comments } }
        }
        throw new Error(`Unexpected tool: ${request.tool}`)
      },
    },
  }
  const claims = new QueueClaimStore({ stateDirectory: directory })
  let executed = 0
  class SyntheticOrchestrator {
    constructor(config, { store: taskStore }) {
      assert.equal(config.command, "once")
      assert.equal(config.issueNumber, issueNumber)
      assert.equal(config.autoCommit, false)
      assert.equal(
        config.instructionSupersessionReconciledInstructionId,
        instruction080,
      )
      this.store = taskStore
    }

    async runOnce({ expectedInstructionId }) {
      executed += 1
      assert.equal(expectedInstructionId, instruction080)
      const current = await this.store.load()
      assert.equal(current.status, "failed")
      assert.equal(current.instructionSupersessions.length, 1)
      assert.equal(
        current.runs.some((run) =>
          [instruction078, instruction079].includes(run.instructionId),
        ),
        false,
      )
      current.lastConsumedInstructionId = instruction080
      current.status = "needs_review"
      current.runs.push({ instructionId: instruction080, status: "needs_review" })
      await this.store.save(current)
      return { status: "needs_review", instructionId: instruction080 }
    }

    async stop() {}
  }

  const result = await reconcilePendingInstructionSupersession({
    state,
    task,
    store,
    claimStore: claims,
    issueClaim: null,
  })
  assert.equal(result.status, "issue_claim_required")

  const cycle = await runRepositoryCycle(
    scanner,
    {
      repository,
      issueNumber,
      issueNumberExplicit: true,
      stateDirectory: directory,
      retryBaseMs: 1,
      autoCommit: false,
      maxTasksPerPoll: 1,
    },
    {
      search: async () => {
        throw new Error("issue-scoped once must not search the repository")
      },
      claimStore: claims,
      runIssue: (currentScanner, config, candidate, options) =>
        import("../src/repository-runner.mjs").then(({ runRepositoryIssue }) =>
          runRepositoryIssue(currentScanner, config, candidate, {
            ...options,
            OrchestratorClass: SyntheticOrchestrator,
          }),
        ),
    },
  )
  assert.equal(executed, 1)
  assert.equal(cycle[0].instructionId, instruction080)
  assert.equal(cycle[0].status, "needs_review")

  const durable = await store.load()
  assert.equal(durable.status, "needs_review")
  assert.equal(durable.instructionSupersessions.length, 1)
  const events = await store.readEvents()
  assert.equal(
    events.filter((event) => event.type === "instruction_superseded").length,
    2,
  )
  assert.equal(
    events.some((event) =>
      ["agent_pickup", "agent_result"].includes(event.type),
    ),
    false,
  )
  const records = (await readdir(claims.recordDirectory)).filter((entry) =>
    entry.endsWith(".json"),
  )
  assert.deepEqual(records, [`${instruction080}.json`])
})
