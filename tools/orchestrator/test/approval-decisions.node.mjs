import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import {
  consumeOwnerApprovalDecision,
  registerOwnerApprovalDecision,
} from "../src/approval-decisions.mjs"
import { StateStore } from "../src/state-store.mjs"

const pendingLaunchAgentAction =
  "Install and reload only the owner-approved Koalafrog user LaunchAgent with the reviewed content-addressed runtime and stable coordinating checkout."

const precedingIssue53DecisionPrompt = `Resume the existing Issue #53 orchestrator thread/worktree.

The owner has explicitly approved the exact pending local user LaunchAgent installation/reload requested in the preceding result. This approval applies only to installing/reloading the reviewed Koalafrog user LaunchAgent with the already-reviewed content-addressed orchestrator runtime and stable coordinating checkout produced by the current Issue #53 work.

Proceed with that approved local service action and preserve all other safety boundaries.`

const decisionInstruction = {
  action: "continue",
  taskState: "needs_owner",
  instructionId: "orchestrator-launchagent-owner-approval-006",
  maxTurns: 12,
  ownerApprovalRequired: false,
  prompt: precedingIssue53DecisionPrompt,
}

function pendingState(completedAt = "2026-08-20T17:25:00.000Z") {
  return {
    pendingOwnerRequest: { reason: pendingLaunchAgentAction },
    runs: [
      {
        instructionId: "orchestrator-launchagent-owner-approval-006",
        status: "needs_owner",
        completedAt,
      },
    ],
    ownerApprovalDecisions: [],
  }
}

function request(reason = pendingLaunchAgentAction) {
  return {
    method: "item/commandExecution/requestApproval",
    reason,
  }
}

test("the preceding Issue #53 owner decision matches the exact pending action", () => {
  const state = pendingState()
  const registered = registerOwnerApprovalDecision({
    state,
    controls: [decisionInstruction],
    now: new Date("2026-08-20T17:30:00.000Z"),
  })
  assert.equal(registered.decisionId, decisionInstruction.instructionId)
  const consumed = consumeOwnerApprovalDecision({
    state,
    request: request(),
    now: new Date("2026-08-20T17:31:00.000Z"),
  })
  assert.deepEqual(consumed.response, { decision: "accept" })
  assert.equal(consumed.decision.consumedAt, "2026-08-20T17:31:00.000Z")
})

test("an exact safe command decision is bound to its pending reason digest", () => {
  const pendingReason =
    "Stage only tools/orchestrator/src/control-plane.mjs for the reviewed commit."
  const state = {
    pendingOwnerRequest: { reason: pendingReason },
    runs: [
      {
        instructionId: "stage-pending-001",
        status: "needs_owner",
        completedAt: "2026-08-20T17:25:00.000Z",
      },
    ],
    ownerApprovalDecisions: [],
  }
  const control = {
    ...decisionInstruction,
    instructionId: "stage-owner-decision-002",
    prompt: `The owner explicitly approved this exact pending action: ${pendingReason}`,
  }
  const decision = registerOwnerApprovalDecision({
    state,
    controls: [control],
    now: new Date("2026-08-20T17:30:00.000Z"),
  })
  assert.match(decision.scope, /^command:[a-f0-9]{64}$/)
  assert.ok(
    consumeOwnerApprovalDecision({
      state,
      request: request(pendingReason),
      now: new Date("2026-08-20T17:31:00.000Z"),
    }),
  )
})

test("mismatched and broader pending actions remain blocked", () => {
  const state = pendingState()
  registerOwnerApprovalDecision({
    state,
    controls: [decisionInstruction],
    now: new Date("2026-08-20T17:30:00.000Z"),
  })
  assert.equal(
    consumeOwnerApprovalDecision({
      state,
      request: request(
        "Install and reload a system LaunchDaemon for another repository.",
      ),
      now: new Date("2026-08-20T17:31:00.000Z"),
    }),
    null,
  )
  assert.equal(
    consumeOwnerApprovalDecision({
      state,
      request: request(`${pendingLaunchAgentAction} Then deploy production.`),
      now: new Date("2026-08-20T17:31:00.000Z"),
    }),
    null,
  )
})

test("duplicate decision controls and request replays are idempotent", () => {
  const state = pendingState()
  const now = new Date("2026-08-20T17:30:00.000Z")
  const first = registerOwnerApprovalDecision({
    state,
    controls: [decisionInstruction, decisionInstruction],
    now,
  })
  const duplicate = registerOwnerApprovalDecision({
    state,
    controls: [decisionInstruction],
    now,
  })
  assert.equal(first, duplicate)
  assert.equal(state.ownerApprovalDecisions.length, 1)
  assert.ok(
    consumeOwnerApprovalDecision({
      state,
      request: request(),
      now: new Date("2026-08-20T17:31:00.000Z"),
    }),
  )
  assert.equal(
    consumeOwnerApprovalDecision({
      state,
      request: request(),
      now: new Date("2026-08-20T17:32:00.000Z"),
    }),
    null,
  )
})

test("one decision cannot satisfy a second distinct gated action", () => {
  const state = pendingState()
  registerOwnerApprovalDecision({
    state,
    controls: [decisionInstruction],
    now: new Date("2026-08-20T17:30:00.000Z"),
  })
  assert.ok(
    consumeOwnerApprovalDecision({
      state,
      request: request(),
      now: new Date("2026-08-20T17:31:00.000Z"),
    }),
  )
  assert.equal(
    consumeOwnerApprovalDecision({
      state,
      request: request(
        "Install and reload only the owner-approved Koalafrog user LaunchAgent with the reviewed content-addressed runtime and stable coordinating checkout on another Mac.",
      ),
      now: new Date("2026-08-20T17:32:00.000Z"),
    }),
    null,
  )
})

test("expired decisions fail closed", () => {
  const state = pendingState("2026-08-18T17:25:00.000Z")
  assert.equal(
    registerOwnerApprovalDecision({
      state,
      controls: [decisionInstruction],
      now: new Date("2026-08-20T17:30:00.000Z"),
    }),
    null,
  )
  assert.deepEqual(state.ownerApprovalDecisions, [])
})

test("restart preserves a registered decision and its consumed state", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-decision-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const options = {
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 53,
  }
  const firstStore = new StateStore(options)
  const state = await firstStore.load()
  state.pendingOwnerRequest = { reason: pendingLaunchAgentAction }
  state.runs.push({
    instructionId: "orchestrator-launchagent-owner-approval-006",
    status: "needs_owner",
    completedAt: "2026-08-20T17:25:00.000Z",
  })
  registerOwnerApprovalDecision({
    state,
    controls: [decisionInstruction],
    now: new Date("2026-08-20T17:30:00.000Z"),
  })
  await firstStore.save(state)

  const restartedStore = new StateStore(options)
  const restarted = await restartedStore.load()
  assert.equal(restarted.ownerApprovalDecisions.length, 1)
  assert.ok(
    consumeOwnerApprovalDecision({
      state: restarted,
      request: request(),
      now: new Date("2026-08-20T17:31:00.000Z"),
    }),
  )
  await restartedStore.save(restarted)
  const afterSecondRestart = await new StateStore(options).load()
  assert.ok(afterSecondRestart.ownerApprovalDecisions[0].consumedAt)
  assert.equal(
    consumeOwnerApprovalDecision({
      state: afterSecondRestart,
      request: request(),
      now: new Date("2026-08-20T17:32:00.000Z"),
    }),
    null,
  )
})
