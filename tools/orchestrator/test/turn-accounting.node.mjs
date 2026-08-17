import assert from "node:assert/strict"
import test from "node:test"
import { beginInstruction } from "../src/orchestrator.mjs"
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
    recordInstructionTurnStarted(state, { turnId: "turn-1", attempt: 0 }),
    true,
  )
  assert.equal(canStartInstructionTurn(state, 2), true)
  assert.equal(
    recordInstructionTurnStarted(state, { turnId: "turn-1", attempt: 0 }),
    false,
  )
  assert.equal(state.turnCount, 8)
  assert.equal(state.activeInstruction.turnCount, 1)

  assert.equal(
    recordInstructionTurnStarted(state, { turnId: "turn-2", attempt: 1 }),
    true,
  )
  assert.equal(state.turnCount, 9)
  assert.equal(state.activeInstruction.turnCount, 2)
  assert.equal(canStartInstructionTurn(state, 2), false)
})

test("an audited retry of the same instruction preserves consumed budget", () => {
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
