import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { classifyServerRequest } from "../src/app-server.mjs"
import { shouldConsumeInstruction } from "../src/control-plane.mjs"
import { beginInstruction, ensureTaskThread } from "../src/orchestrator.mjs"
import { StateStore, redactForLog } from "../src/state-store.mjs"

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
    turnCount: 9,
    activeInstruction: {
      instructionId: "proof-002",
      phase: "turn_started",
      attempts: 1,
      turnCount: 2,
      turnId: "turn-persisted",
    },
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
  assert.equal(state.turnCount, 9)
  assert.equal(state.activeInstruction.turnCount, 2)
})

test("restart preserves the active instruction's consumed turn budget", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-state-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const options = {
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 53,
  }
  const first = new StateStore(options)
  const state = await first.load()
  state.turnCount = 9
  state.threadId = "thread-persisted"
  state.activeInstruction = {
    instructionId: "review-008",
    phase: "turn_started",
    attempts: 1,
    turnCount: 2,
    turnId: "turn-persisted",
  }
  await first.save(state)

  const restarted = new StateStore(options)
  const reloaded = await restarted.load()
  assert.equal(reloaded.threadId, "thread-persisted")
  assert.equal(reloaded.turnCount, 9)
  assert.equal(reloaded.activeInstruction.turnCount, 2)
  assert.equal(reloaded.activeInstruction.turnId, "turn-persisted")
})

test("a new start instruction receives a fresh thread and workspace context", () => {
  const state = {
    threadId: "thread-proof",
    workspacePath: "/tmp/proof-workspace",
    branch: "agent/proof",
    turnCount: 3,
    retryCount: 1,
    pendingOwnerRequest: { reason: "old" },
  }
  beginInstruction(
    state,
    {
      action: "start",
      instructionId: "material-001",
      maxTurns: 12,
    },
    new Date("2026-08-16T08:00:00Z"),
  )
  assert.equal(state.threadId, null)
  assert.equal(state.workspacePath, null)
  assert.equal(state.branch, null)
  assert.equal(state.turnCount, 3)
  assert.equal(state.activeInstruction.turnCount, 0)
  assert.equal(state.activeInstruction.instructionId, "material-001")
  assert.equal(state.activeInstruction.selectedAt, "2026-08-16T08:00:00.000Z")
})

test("legacy active state infers its instruction-local turn count on load", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-state-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const options = {
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 53,
  }
  const first = new StateStore(options)
  const legacy = await first.load()
  legacy.turnCount = 7
  legacy.activeInstruction = {
    action: "continue",
    instructionId: "review-007",
    maxTurns: 6,
    phase: "turn_started",
    attempts: 2,
    turnId: "turn-legacy",
  }
  await first.save(legacy)

  const restarted = new StateStore(options)
  const reloaded = await restarted.load()
  assert.equal(reloaded.turnCount, 7)
  assert.equal(reloaded.activeInstruction.turnCount, 3)
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
      message: "Bearer another-token ghp_123456789012345678901234567890123456",
    },
  })
  assert.equal(redacted.authorization, "[redacted]")
  assert.equal(redacted.nested.password, "[redacted]")
  assert.equal(redacted.nested.message, "Bearer [redacted] [redacted]")
})
