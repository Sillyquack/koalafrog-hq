import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import {
  beginInstruction,
  supersedeOwnerStoppedInstruction,
} from "../src/orchestrator.mjs"
import { StateStore } from "../src/state-store.mjs"
import {
  canStartInstructionTurn,
  recordInstructionTurnStarted,
} from "../src/turn-accounting.mjs"

test("a new instruction gets a fresh budget after many prior issue turns", () => {
  const state = {
    threadId: "thread-persisted",
    workspacePath: "/tmp/persisted-workspace",
    branch: "agent/issue-53",
    turnCount: 7,
    runs: [
      { instructionId: "review-006", turnCount: 4 },
      { instructionId: "review-007", turnCount: 3 },
    ],
  }

  beginInstruction(state, {
    action: "continue",
    instructionId: "review-008",
    maxTurns: 6,
  })

  assert.equal(state.turnCount, 7)
  assert.equal(state.activeInstruction.turnCount, 0)
  assert.equal(canStartInstructionTurn(state, 6), true)
  assert.equal(state.threadId, "thread-persisted")
  assert.equal(state.workspacePath, "/tmp/persisted-workspace")
  assert.equal(state.branch, "agent/issue-53")
})

test("max_turns hard-stops within one instruction without double-counting", () => {
  const state = {
    turnCount: 7,
    runs: [],
    activeInstruction: {
      instructionId: "review-008",
      phase: "thread_ready",
      attempts: 0,
      turnCount: 0,
    },
  }

  assert.equal(canStartInstructionTurn(state, 2), true)
  assert.equal(
    recordInstructionTurnStarted(state, {
      turnId: "turn-1",
      attempt: 0,
      startedAt: "2026-08-25T08:00:00.000Z",
    }),
    true,
  )
  assert.equal(canStartInstructionTurn(state, 2), true)
  assert.equal(
    recordInstructionTurnStarted(state, {
      turnId: "turn-1",
      attempt: 0,
      startedAt: "2026-08-25T09:00:00.000Z",
    }),
    false,
  )
  assert.equal(state.turnCount, 8)
  assert.equal(state.activeInstruction.turnCount, 1)
  assert.equal(
    state.activeInstruction.turnStartedAt,
    "2026-08-25T08:00:00.000Z",
  )

  assert.equal(
    recordInstructionTurnStarted(state, { turnId: "turn-2", attempt: 1 }),
    true,
  )
  assert.equal(state.turnCount, 9)
  assert.equal(state.activeInstruction.turnCount, 2)
  assert.equal(canStartInstructionTurn(state, 2), false)
})

test("a replay of the same instruction preserves consumed budget", () => {
  const state = {
    threadId: "thread-persisted",
    turnCount: 11,
    runs: [{ instructionId: "review-008", turnCount: 2 }],
  }

  beginInstruction(state, {
    action: "continue",
    instructionId: "review-008",
    maxTurns: 3,
  })

  assert.equal(state.activeInstruction.turnCount, 2)
  assert.equal(canStartInstructionTurn(state, 3), true)
  recordInstructionTurnStarted(state, { turnId: "turn-3", attempt: 0 })
  assert.equal(canStartInstructionTurn(state, 3), false)
  assert.equal(state.turnCount, 12)
})

test("restart preserves and does not double-count a started turn", async (t) => {
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
  assert.equal(
    recordInstructionTurnStarted(reloaded, {
      turnId: "turn-persisted",
      attempt: 1,
    }),
    false,
  )
  assert.equal(reloaded.turnCount, 9)
  assert.equal(reloaded.activeInstruction.turnCount, 2)
})

test("legacy active state infers its consumed instruction turns", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-state-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const options = {
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 53,
  }
  const first = new StateStore(options)
  const state = await first.load()
  state.turnCount = 7
  state.activeInstruction = {
    instructionId: "review-007",
    phase: "turn_started",
    attempts: 2,
    turnId: "turn-legacy",
  }
  await first.save(state)

  const restarted = new StateStore(options)
  const reloaded = await restarted.load()
  assert.equal(reloaded.turnCount, 7)
  assert.equal(reloaded.activeInstruction.turnCount, 3)
})

test("issue #56 owner stop lets instruction 002 take over without double-counting", () => {
  const selectedAt = new Date("2026-08-17T08:25:55.000Z")
  const state = {
    status: "needs_owner",
    threadId: "thread-56",
    branch: "agent/issue-56",
    turnCount: 1,
    retryCount: 0,
    lastConsumedInstructionId: null,
    pendingOwnerRequest: {
      method: "mcpServer/elicitation/request",
      serverName: "Supabase",
      toolName: "supabase.execute_sql",
      arguments: { query: "select id from public.workspaces limit 1" },
      reason: 'Allow Supabase to run tool "supabase.execute_sql"?',
    },
    activeInstruction: {
      action: "start",
      instructionId: "beard-analysis-client-reachability-001",
      maxTurns: 12,
      phase: "owner_stopped",
      attempts: 0,
      turnCount: 1,
      turnId: "turn-56",
    },
    runs: [],
  }
  const newerInstruction = {
    action: "continue",
    taskState: "ready",
    instructionId: "beard-analysis-client-reachability-002",
    maxTurns: 12,
    ownerApprovalRequired: false,
    prompt: "Continue without invoking supabase.execute_sql.",
  }

  const takeover = supersedeOwnerStoppedInstruction(
    state,
    newerInstruction,
    selectedAt,
  )

  assert.deepEqual(takeover, {
    supersededInstructionId: "beard-analysis-client-reachability-001",
    instructionId: "beard-analysis-client-reachability-002",
    ownerRequest: {
      method: "mcpServer/elicitation/request",
      serverName: "Supabase",
      toolName: "supabase.execute_sql",
      arguments: { query: "select id from public.workspaces limit 1" },
      reason: 'Allow Supabase to run tool "supabase.execute_sql"?',
    },
  })
  assert.equal(state.lastConsumedInstructionId, "beard-analysis-client-reachability-001")
  assert.equal(state.runs.length, 1)
  assert.equal(state.runs[0].status, "needs_owner")
  assert.equal(state.runs[0].turnCount, 1)
  assert.equal(
    state.activeInstruction.instructionId,
    "beard-analysis-client-reachability-002",
  )
  assert.equal(state.activeInstruction.phase, "selected")
  assert.equal(state.activeInstruction.turnCount, 0)
  assert.equal(state.pendingOwnerRequest, null)
  assert.equal(state.status, "ready")
  assert.equal(state.turnCount, 1)

  assert.equal(
    supersedeOwnerStoppedInstruction(state, newerInstruction, selectedAt),
    null,
  )
  assert.equal(
    recordInstructionTurnStarted(state, { turnId: "turn-57", attempt: 0 }),
    true,
  )
  assert.equal(
    recordInstructionTurnStarted(state, { turnId: "turn-57", attempt: 0 }),
    false,
  )
  assert.equal(state.turnCount, 2)
  assert.equal(state.activeInstruction.turnCount, 1)
})
