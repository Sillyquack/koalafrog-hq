import assert from "node:assert/strict"
import test from "node:test"
import {
  interruptedCommandTerminalityDecision,
  sameTerminalityReconciliation,
  terminalityReconciliationRecordIsValid,
} from "../src/terminality-reconciliation.mjs"
import {
  issue70CommandItemId,
  issue70InstructionId,
  issue70InterruptedCommand054Events,
  issue70OriginIssueNumber,
  issue70OriginIssueUrl,
  issue70ReadbackWithCommand,
  issue70ThreadId,
  issue70TurnId,
} from "./fixtures/issue-70-interrupted-command-054.mjs"

function issue70State() {
  return {
    task: {
      originIssueNumber: issue70OriginIssueNumber,
      originIssueUrl: issue70OriginIssueUrl,
    },
    status: "running",
    threadId: issue70ThreadId,
    activeInstruction: {
      instructionId: issue70InstructionId,
      phase: "turn_started",
      turnId: issue70TurnId,
    },
  }
}

const reconciledAt = "2026-08-27T19:05:00.000Z"

test("exact live-shaped Issue #70/054 signals remain terminality_unprovable", () => {
  const decision = interruptedCommandTerminalityDecision({
    state: issue70State(),
    events: issue70InterruptedCommand054Events(),
    readbackError: Object.assign(new Error("readback unavailable"), {
      code: "APP_SERVER_READBACK_UNAVAILABLE",
    }),
    reconciledAt,
  })

  assert.equal(decision.applicable, true)
  assert.equal(decision.record.classification, "terminality_unprovable")
  assert.equal(decision.record.terminalOutcome, null)
  assert.deepEqual(decision.record.itemIds, [issue70CommandItemId])
  assert.equal(decision.record.evidence.terminalInteractionCount, 4)
  assert.equal(decision.record.evidence.postInterruptionOutputCount, 9)
  assert.equal(decision.record.evidence.processAbsenceObservationCount, 1)
  assert.deepEqual(decision.record.evidence.reasons, [
    `missing_authoritative_item_terminal_evidence:${issue70CommandItemId}`,
  ])
  assert.match(decision.record.evidenceSummary, /terminality_unprovable/)
  assert.match(decision.record.evidenceSummary, new RegExp(issue70CommandItemId))
  assert.equal(decision.turnResult.status, "needs_review")
  assert.equal(decision.turnResult.retryable, false)
  assert.equal(terminalityReconciliationRecordIsValid(decision.record), true)

  const replay = interruptedCommandTerminalityDecision({
    state: issue70State(),
    events: issue70InterruptedCommand054Events(),
    readbackError: Object.assign(new Error("different process text"), {
      code: "APP_SERVER_READBACK_UNAVAILABLE",
    }),
    reconciledAt,
  })
  assert.equal(replay.record.reconciliationId, decision.record.reconciliationId)
  assert.equal(
    sameTerminalityReconciliation(replay.record, decision.record),
    true,
  )
})

test("reconciliation identity rejects mutated evidence, binding, and summaries", () => {
  const decision = interruptedCommandTerminalityDecision({
    state: issue70State(),
    events: issue70InterruptedCommand054Events(),
    readbackError: Object.assign(new Error("readback unavailable"), {
      code: "APP_SERVER_READBACK_UNAVAILABLE",
    }),
    reconciledAt,
  })
  for (const mutate of [
    (record) => {
      record.evidence.postInterruptionOutputCount = 0
    },
    (record) => {
      record.itemIds = ["exec-substituted"]
    },
    (record) => {
      record.evidenceSummary = "silence proves success"
    },
  ]) {
    const corrupted = structuredClone(decision.record)
    mutate(corrupted)
    assert.equal(terminalityReconciliationRecordIsValid(corrupted), false)
  }
})

test("authoritative later command readback proves completion without replay", () => {
  const decision = interruptedCommandTerminalityDecision({
    state: issue70State(),
    events: issue70InterruptedCommand054Events(),
    threadReadback: issue70ReadbackWithCommand("completed", 0),
    reconciledAt,
  })

  assert.equal(decision.record.classification, "terminality_proven")
  assert.equal(decision.record.terminalOutcome, "completed")
  assert.equal(decision.record.evidence.reasons.length, 0)
  assert.equal(decision.turnResult.status, "completed")
  assert.equal(decision.turnResult.commandExecutions[0].exitCode, 0)
})

test("authoritative completed status proves terminality without an exit code", () => {
  const decision = interruptedCommandTerminalityDecision({
    state: issue70State(),
    events: issue70InterruptedCommand054Events(),
    threadReadback: issue70ReadbackWithCommand("completed"),
    reconciledAt,
  })

  assert.equal(decision.record.classification, "terminality_proven")
  assert.equal(decision.record.terminalOutcome, "completed")
  assert.equal(decision.turnResult.commandExecutions[0].exitCode, null)
})

test("durable item/completed protocol evidence reconciles when readback is unavailable", () => {
  const events = issue70InterruptedCommand054Events()
  events.push({
    at: "2026-08-27T18:56:00.000Z",
    type: "notification",
    message: {
      method: "item/completed",
      threadId: issue70ThreadId,
      turnId: issue70TurnId,
      itemId: issue70CommandItemId,
      itemType: "commandExecution",
      itemStatus: "completed",
      exitCode: 0,
    },
  })
  const decision = interruptedCommandTerminalityDecision({
    state: issue70State(),
    events,
    readbackError: Object.assign(new Error("readback unavailable"), {
      code: "APP_SERVER_READBACK_UNAVAILABLE",
    }),
    reconciledAt,
  })

  assert.equal(decision.record.classification, "terminality_proven")
  assert.equal(decision.record.terminalOutcome, "completed")
  assert.equal(decision.record.evidence.items[0].source, "item/completed")
})

test("every started command must have authoritative terminal evidence", () => {
  const secondItemId = "exec-second-command"
  const events = issue70InterruptedCommand054Events()
  events.push({
    at: "2026-08-27T18:54:00.000Z",
    type: "notification",
    message: {
      method: "item/started",
      threadId: issue70ThreadId,
      turnId: issue70TurnId,
      itemId: secondItemId,
      itemType: "commandExecution",
      itemStatus: "inProgress",
    },
  })
  const decision = interruptedCommandTerminalityDecision({
    state: issue70State(),
    events,
    threadReadback: issue70ReadbackWithCommand("completed", 0),
    reconciledAt,
  })

  assert.equal(decision.record.classification, "terminality_unprovable")
  assert.deepEqual(decision.record.itemIds, [
    secondItemId,
    issue70CommandItemId,
  ].sort())
  assert.ok(
    decision.record.evidence.reasons.includes(
      `missing_authoritative_item_terminal_evidence:${secondItemId}`,
    ),
  )
})

test("authoritative failed and cancelled command readback preserve exact failure outcome", async (t) => {
  for (const [status, expectedOutcome] of [
    ["failed", "failed"],
    ["cancelled", "cancelled"],
    ["canceled", "cancelled"],
  ]) {
    await t.test(status, () => {
      const decision = interruptedCommandTerminalityDecision({
        state: issue70State(),
        events: issue70InterruptedCommand054Events(),
        threadReadback: issue70ReadbackWithCommand(status, 1),
        reconciledAt,
      })
      assert.equal(decision.record.classification, "terminality_proven")
      assert.equal(decision.record.terminalOutcome, expectedOutcome)
      assert.equal(decision.turnResult.status, "failed")
      assert.equal(decision.turnResult.retryable, false)
    })
  }
})

test("contradictory protocol and readback item evidence fails closed", () => {
  const events = issue70InterruptedCommand054Events()
  events.push({
    at: "2026-08-27T18:56:00.000Z",
    type: "notification",
    message: {
      method: "item/completed",
      threadId: issue70ThreadId,
      turnId: issue70TurnId,
      itemId: issue70CommandItemId,
      itemType: "commandExecution",
      itemStatus: "completed",
      exitCode: 0,
    },
  })
  const decision = interruptedCommandTerminalityDecision({
    state: issue70State(),
    events,
    threadReadback: issue70ReadbackWithCommand("failed", 1),
    reconciledAt,
  })

  assert.equal(decision.record.classification, "terminality_unprovable")
  assert.equal(decision.record.terminalOutcome, null)
  assert.ok(
    decision.record.evidence.reasons.includes(
      `contradictory_item_evidence:${issue70CommandItemId}`,
    ),
  )
  assert.equal(decision.turnResult.status, "needs_review")
})

test("contradictory interrupted event and completed turn readback fails closed", () => {
  const readback = issue70ReadbackWithCommand("completed", 0)
  readback.thread.turns[0].status = "completed"
  const decision = interruptedCommandTerminalityDecision({
    state: issue70State(),
    events: issue70InterruptedCommand054Events(),
    threadReadback: readback,
    reconciledAt,
  })

  assert.equal(decision.record.classification, "terminality_unprovable")
  assert.equal(decision.record.terminalOutcome, null)
  assert.ok(
    decision.record.evidence.reasons.includes("contradictory_turn_readback"),
  )
  assert.equal(decision.turnResult.status, "needs_review")
})

test("terminalInteraction, output, silence, and process absence never become terminal proof", () => {
  const decision = interruptedCommandTerminalityDecision({
    state: issue70State(),
    events: issue70InterruptedCommand054Events(),
    threadReadback: {
      thread: {
        id: issue70ThreadId,
        turns: [
          {
            id: issue70TurnId,
            status: "interrupted",
            items: [
              {
                id: issue70CommandItemId,
                type: "commandExecution",
                status: "inProgress",
              },
            ],
          },
        ],
      },
    },
    reconciledAt,
  })

  assert.equal(decision.record.classification, "terminality_unprovable")
  assert.ok(
    decision.record.evidence.reasons.includes(
      `non_terminal_item_evidence:${issue70CommandItemId}`,
    ),
  )
  assert.equal(decision.record.evidence.terminalInteractionCount, 4)
  assert.equal(decision.record.evidence.postInterruptionOutputCount, 9)
  assert.equal(decision.record.evidence.processAbsenceObservationCount, 1)
})

test("a durable timeout marker terminalizes missing turn/completed evidence fail-closed", () => {
  const state = issue70State()
  state.activeInstruction.turnTimedOutAt = "2026-08-27T18:54:41.000Z"
  const events = issue70InterruptedCommand054Events().filter(
    (event) => event.message?.method !== "turn/completed",
  )
  const decision = interruptedCommandTerminalityDecision({
    state,
    events,
    readbackError: Object.assign(new Error("readback unavailable"), {
      code: "APP_SERVER_READBACK_UNAVAILABLE",
    }),
    reconciledAt,
  })

  assert.equal(decision.applicable, true)
  assert.equal(decision.record.classification, "terminality_unprovable")
  assert.ok(
    decision.record.evidence.reasons.includes(
      `missing_authoritative_item_terminal_evidence:${issue70CommandItemId}`,
    ),
  )
})
