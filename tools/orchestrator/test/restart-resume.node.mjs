import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { classifyServerRequest } from "../src/app-server.mjs"
import { extractAgentControls, shouldConsumeInstruction } from "../src/control-plane.mjs"
import {
  beginInstruction,
  ensureTaskThread,
  Orchestrator,
} from "../src/orchestrator.mjs"
import {
  currentStateSchemaVersion,
  StateStore,
  redactForLog,
} from "../src/state-store.mjs"
import { recordInstructionTurnStarted } from "../src/turn-accounting.mjs"

function controlBlock({
  action = "start",
  instructionId,
  prompt = "Continue the bounded local implementation. Do not deploy.",
}) {
  return `\`\`\`yaml
agent_control:
  action: ${action}
  task_state: ready
  instruction_id: ${instructionId}
  max_turns: 3
  owner_approval_required: false
  prompt: |
    ${prompt}
\`\`\``
}

function runtimeConfig(stateDirectory) {
  return {
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 53,
    checkoutPath: "/tmp/coordinating-checkout",
    stateDirectory,
    baseRef: "origin/main",
    pollMs: 15_000,
    maxTurns: 12,
    turnTimeoutMs: 1_000,
    maxRetries: 2,
    retryBaseMs: 1,
    codexBinary: "codex",
    model: null,
    allowedPaths: [],
    autoCommit: false,
    fetchRemote: false,
  }
}

function fakeWorkspace() {
  return {
    async ensureWorkspace({ existingPath, instructionId }) {
      return {
        path: existingPath ?? `/tmp/workspace-${instructionId}`,
        branch: `agent/issue-53-${instructionId}`,
      }
    },
    async inspectWorkspace(workspacePath) {
      return {
        branch: `agent/${path.basename(workspacePath)}`,
        commits: [],
        changedFiles: [],
      }
    },
    assertAllowedChanges() {},
    async commitWorkspaceChanges() {},
    async validateWorkspace() {
      return { pass: true, detail: "" }
    },
  }
}

test("persisted state survives restart and prevents duplicate consumption", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-state-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const options = {
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 53,
  }
  const first = new StateStore(options)
  const state = await first.load()
  state.lastConsumedInstructionId = "proof-001"
  state.threadId = "thread-persisted"
  state.workspacePath = "/tmp/persisted-workspace"
  await first.save(state)

  const restarted = new StateStore(options)
  const reloaded = await restarted.load()
  assert.equal(reloaded.threadId, "thread-persisted")
  assert.equal(reloaded.workspacePath, "/tmp/persisted-workspace")
  assert.equal(
    shouldConsumeInstruction(reloaded, { instructionId: "proof-001" }),
    false,
  )
})

test("schema-one Issue #53 state migrates without losing its active thread", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-migration-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new StateStore({
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 53,
  })
  await mkdir(store.directory, { recursive: true })
  await writeFile(
    store.statePath,
    `${JSON.stringify({
      schemaVersion: 1,
      task: {
        repository: "Sillyquack/koalafrog-hq",
        issueNumber: 53,
      },
      status: "running",
      lastConsumedInstructionId: "prior-001",
      activeInstruction: {
        instructionId: "active-002",
        phase: "turn_started",
        attempts: 0,
      },
      threadId: "thread-existing",
      workspacePath: "/tmp/existing-workspace",
      branch: "agent/existing",
      turnCount: 7,
      retryCount: 0,
      pendingOwnerRequest: null,
      runs: [{ instructionId: "prior-001", turnCount: 1 }],
    })}\n`,
  )

  const migrated = await store.load()
  assert.equal(migrated.schemaVersion, currentStateSchemaVersion)
  assert.equal(migrated.task.originIssueNumber, 53)
  assert.equal(migrated.task.originIssueUrl, null)
  assert.equal(migrated.task.lastObservedIssueUpdatedAt, null)
  assert.equal(migrated.task.originIssueClosed, false)
  assert.equal(migrated.threadId, "thread-existing")
  assert.equal(migrated.workspacePath, "/tmp/existing-workspace")
  assert.equal(migrated.activeInstruction.instructionId, "active-002")
  assert.equal(migrated.activeInstruction.turnCount, 1)
  assert.equal(JSON.parse(await readFile(store.statePath, "utf8")).schemaVersion, 2)
})

test("restart resumes the persisted Codex thread instead of starting another", async () => {
  const calls = []
  const appServer = {
    async resumeThread(threadId, params) {
      calls.push({ type: "resume", threadId, params })
      return { thread: { id: threadId } }
    },
    async startThread() {
      calls.push({ type: "start" })
      return { thread: { id: "unexpected" } }
    },
    async waitForMcpReady(threadId) {
      calls.push({ type: "mcp", threadId })
    },
  }
  const state = {
    threadId: "thread-persisted",
    activeInstruction: { instructionId: "proof-002", phase: "selected" },
  }
  await ensureTaskThread({
    appServer,
    state,
    workspacePath: "/tmp/persisted-workspace",
    model: null,
    save: async () => calls.push({ type: "save" }),
  })
  assert.equal(calls.filter((call) => call.type === "resume").length, 1)
  assert.equal(calls.filter((call) => call.type === "start").length, 0)
  assert.equal(state.threadId, "thread-persisted")
})

test("a fresh start instruction receives a new thread and workspace context", () => {
  const state = {
    threadId: "thread-old",
    workspacePath: "/tmp/workspace-old",
    branch: "agent/old",
    turnCount: 9,
    retryCount: 1,
    pendingOwnerRequest: { reason: "old request" },
    activeInstruction: null,
    runs: [],
  }
  beginInstruction(
    state,
    {
      action: "start",
      instructionId: "fresh-001",
      maxTurns: 3,
    },
    new Date("2026-08-17T10:00:00Z"),
  )
  assert.equal(state.threadId, null)
  assert.equal(state.workspacePath, null)
  assert.equal(state.branch, null)
  assert.equal(state.pendingOwnerRequest, null)
  assert.equal(state.turnCount, 9)
  assert.equal(state.activeInstruction.turnCount, 0)
})

test("polling continues after needs_owner and a fresh continue reuses the thread", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-follow-up-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const firstControl = controlBlock({ instructionId: "owner-stop-001" })
  const followUpControl = controlBlock({
    action: "continue",
    instructionId: "owner-follow-up-002",
  })
  let fetchCount = 0
  const posted = []
  const controlPlane = {
    async fetchTask() {
      fetchCount += 1
      return {
        issue: { body: "" },
        comments:
          fetchCount === 1
            ? [{ body: firstControl }]
            : [{ body: firstControl }, { body: followUpControl }],
      }
    },
    async postComment(comment) {
      posted.push(comment)
    },
    async updateComment() {
      throw new Error("Unexpected result correction")
    },
  }
  let turnCount = 0
  let threadStarts = 0
  let threadResumes = 0
  const appServer = {
    async start() {},
    async startThread() {
      threadStarts += 1
      return { thread: { id: "thread-persisted" } }
    },
    async resumeThread(threadId) {
      threadResumes += 1
      return { thread: { id: threadId } }
    },
    async waitForMcpReady() {},
    async runTurn({ onTurnStarted, onOwnerStop }) {
      turnCount += 1
      await onTurnStarted(`turn-${turnCount}`)
      if (turnCount === 1) {
        const ownerRequest = {
          method: "item/tool/requestUserInput",
          reason: "Owner must approve the bounded follow-up.",
        }
        await onOwnerStop(ownerRequest)
        return {
          status: "needs_owner",
          turn: { id: "turn-1", status: "interrupted" },
          pendingOwnerRequest: ownerRequest,
        }
      }
      return {
        status: "completed",
        turn: { id: "turn-2", status: "completed" },
        pendingOwnerRequest: null,
      }
    },
    async stop() {},
  }
  const store = new StateStore({
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 53,
  })
  const orchestrator = new Orchestrator(runtimeConfig(directory), {
    appServer,
    controlPlane,
    store,
    workspace: fakeWorkspace(),
  })

  const ownerStop = await orchestrator.runOnce()
  assert.equal(ownerStop.status, "needs_owner")
  const continued = await orchestrator.runOnce()
  assert.equal(continued.status, "needs_review")
  assert.equal(continued.instructionId, "owner-follow-up-002")
  assert.equal(threadStarts, 1)
  assert.equal(threadResumes, 1)
  assert.equal(posted.length, 4)
  assert.equal(posted.filter((body) => body.includes("agent_pickup:")).length, 2)
  assert.equal(posted.filter((body) => body.includes("agent_result:")).length, 2)
  const state = await store.load()
  assert.equal(state.threadId, "thread-persisted")
  assert.equal(state.lastConsumedInstructionId, "owner-follow-up-002")
  assert.deepEqual(
    state.runs.map((run) => run.status),
    ["needs_owner", "needs_review"],
  )
})

test("restart finalizes a completed persisted turn without starting a duplicate", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-recovery-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const block = controlBlock({ instructionId: "recovery-001" })
  const [instruction] = extractAgentControls(block)
  const store = new StateStore({
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 53,
  })
  const state = await store.load()
  beginInstruction(state, instruction)
  state.threadId = "thread-before-crash"
  state.workspacePath = "/tmp/workspace-before-crash"
  state.branch = "agent/recovery-001"
  recordInstructionTurnStarted(state, { turnId: "turn-before-crash", attempt: 0 })
  await store.save(state)

  let runTurnCalls = 0
  let resumeCalls = 0
  const appServer = {
    async start() {},
    async resumeThread(threadId) {
      resumeCalls += 1
      return { thread: { id: threadId } }
    },
    async startThread() {
      throw new Error("Restart must not create a replacement thread")
    },
    async waitForMcpReady() {},
    async readThread() {
      return {
        thread: {
          turns: [{ id: "turn-before-crash", status: "completed" }],
        },
      }
    },
    async runTurn() {
      runTurnCalls += 1
      throw new Error("Completed recovery turn must not be replayed")
    },
    async stop() {},
  }
  const posted = []
  const controlPlane = {
    async fetchTask() {
      return { issue: { body: "" }, comments: [{ body: block }] }
    },
    async postComment(comment) {
      posted.push(comment)
    },
  }
  const restarted = new Orchestrator(runtimeConfig(directory), {
    appServer,
    controlPlane,
    store,
    workspace: fakeWorkspace(),
  })
  const result = await restarted.runOnce()
  assert.equal(result.status, "needs_review")
  assert.equal(resumeCalls, 1)
  assert.equal(runTurnCalls, 0)
  assert.equal(posted.length, 2)
  assert.equal(posted.filter((body) => body.includes("agent_pickup:")).length, 1)
  assert.equal(posted.filter((body) => body.includes("agent_result:")).length, 1)
  const recoveredState = await store.load()
  assert.equal(recoveredState.threadId, "thread-before-crash")
  assert.equal(recoveredState.activeInstruction, null)
  assert.equal(recoveredState.runs[0].turnCount, 1)
})

test("restart defers a still-running persisted turn instead of starting a duplicate", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-live-turn-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const block = controlBlock({ instructionId: "live-recovery-001" })
  const [instruction] = extractAgentControls(block)
  const store = new StateStore({
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 53,
  })
  const state = await store.load()
  beginInstruction(state, instruction)
  state.threadId = "thread-live"
  state.workspacePath = "/tmp/workspace-live"
  state.branch = "agent/live-recovery-001"
  recordInstructionTurnStarted(state, { turnId: "turn-live", attempt: 0 })
  await store.save(state)

  let runTurnCalls = 0
  const appServer = {
    async start() {},
    async resumeThread(threadId) {
      return { thread: { id: threadId } }
    },
    async waitForMcpReady() {},
    async readThread() {
      return {
        thread: { turns: [{ id: "turn-live", status: "inProgress" }] },
      }
    },
    async runTurn() {
      runTurnCalls += 1
      throw new Error("A live recovery turn must not be duplicated")
    },
    async stop() {},
  }
  const posted = []
  const orchestrator = new Orchestrator(
    { ...runtimeConfig(directory), turnTimeoutMs: 60_000 },
    {
      appServer,
      controlPlane: {
        async fetchTask() {
          return { issue: { body: "" }, comments: [{ body: block }] }
        },
        async postComment(comment) {
          posted.push(comment)
        },
      },
      store,
      workspace: fakeWorkspace(),
    },
  )

  const result = await orchestrator.runOnce()
  assert.equal(result.status, "claim_deferred")
  assert.equal(runTurnCalls, 0)
  assert.equal(posted.filter((body) => body.includes("agent_pickup:")).length, 1)
  const deferred = await store.load()
  assert.equal(deferred.activeInstruction.phase, "turn_started")
  assert.equal(deferred.activeInstruction.turnId, "turn-live")
  assert.equal(deferred.activeInstruction.turnCount, 1)
})

test("restart publishes a persisted owner stop before returning to polling", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-owner-recovery-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const block = controlBlock({ instructionId: "owner-recovery-001" })
  const [instruction] = extractAgentControls(block)
  const store = new StateStore({
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 53,
  })
  const state = await store.load()
  beginInstruction(state, instruction)
  state.threadId = "thread-owner-stop"
  state.workspacePath = "/tmp/workspace-owner-stop"
  state.branch = "agent/owner-recovery-001"
  state.activeInstruction.phase = "owner_stopped"
  state.activeInstruction.turnId = "turn-owner-stop"
  state.activeInstruction.ownerRequest = {
    method: "item/tool/requestUserInput",
    reason: "Owner decision required after restart.",
  }
  state.pendingOwnerRequest = state.activeInstruction.ownerRequest
  state.status = "needs_owner"
  await store.save(state)

  const posted = []
  const orchestrator = new Orchestrator(runtimeConfig(directory), {
    store,
    appServer: {
      async start() {},
      async stop() {},
    },
    controlPlane: {
      async fetchTask() {
        return { issue: { body: "" }, comments: [{ body: block }] }
      },
      async postComment(comment) {
        posted.push(comment)
      },
    },
    workspace: fakeWorkspace(),
  })

  const result = await orchestrator.runOnce()
  assert.equal(result.status, "needs_owner")
  assert.equal(posted.length, 1)
  assert.match(posted[0], /status: needs_owner/)
  const recoveredState = await store.load()
  assert.equal(recoveredState.activeInstruction, null)
  assert.equal(recoveredState.lastConsumedInstructionId, "owner-recovery-001")
  assert.equal(recoveredState.runs[0].status, "needs_owner")
})

test("approval and input requests are classified as owner stops", () => {
  const approval = classifyServerRequest({
    id: 42,
    method: "item/commandExecution/requestApproval",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      reason: "Needs network access",
    },
  })
  assert.equal(approval.method, "item/commandExecution/requestApproval")
  assert.equal(approval.reason, "Needs network access")

  const input = classifyServerRequest({
    id: 43,
    method: "item/tool/requestUserInput",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      questions: [{ question: "Which owner-approved target?" }],
    },
  })
  assert.equal(input.reason, "Which owner-approved target?")

  const unknown = classifyServerRequest({
    id: 44,
    method: "item/tool/call",
    params: { threadId: "thread-1", turnId: "turn-1" },
  })
  assert.match(unknown.reason, /cannot safely answer/)
})

test("event redaction removes credential-shaped values", () => {
  const redacted = redactForLog({
    authorization: "Bearer visible-token",
    nested: {
      password: "secret",
      apiKey: "also-secret",
      message: "Bearer another-token ghp_123456789012345678901234567890123456",
    },
  })
  assert.equal(redacted.authorization, "[redacted]")
  assert.equal(redacted.nested.password, "[redacted]")
  assert.equal(redacted.nested.apiKey, "[redacted]")
  assert.equal(redacted.nested.message, "Bearer [redacted] [redacted]")
})
