import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import {
  consumeOwnerApprovalDecision,
  recordPendingApprovalRequest,
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

const precedingIssue53BootstrapDecisionPrompt = `Resume the existing Issue #53 orchestrator thread/worktree.

Owner approval is explicitly granted for the exact pending local user LaunchAgent install/reload action already identified in state as the current owner request. This approval is limited to the reviewed Koalafrog user LaunchAgent, the reviewed content-addressed orchestrator runtime, and the stable coordinating checkout already produced by the current Issue #53 work.

Consume this approval for that exact pending action and proceed with the local service transition. Verify the upgraded persistent service is running from the intended stable runtime, then continue the already-scoped repo-wide discovery acceptance flow using the existing Issue #63.`

const precedingIssue53BootstrapDecision = {
  action: "continue",
  taskState: "needs_owner",
  instructionId: "orchestrator-launchagent-owner-approval-009",
  maxTurns: 12,
  ownerApprovalRequired: false,
  prompt: precedingIssue53BootstrapDecisionPrompt,
}

const pendingApprovalRecoveryCommit =
  "Create the authorized Issue #53 commit from only the already-staged reviewed orchestrator approval-recovery files."

const precedingIssue53CommitDecision = {
  action: "continue",
  taskState: "needs_owner",
  instructionId: "orchestrator-approval-recovery-commit-011",
  maxTurns: 10,
  ownerApprovalRequired: false,
  prompt: `Resume the existing Issue #53 orchestrator thread/worktree.

Owner approval is granted to create exactly one commit from only the already-staged, reviewed orchestrator approval-recovery files identified in the immediately preceding needs_owner result.

Do not stage any additional files. Preserve all existing authorization boundaries.`,
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
      request: request(
        "Install and reload only the owner-approved Koalafrog user LaunchAgent with the reviewed content-addressed orchestrator runtime and stable coordinating checkout after changing the service logs.",
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

test("non-command owner requests do not enter command approval recovery", () => {
  const state = { pendingApprovalRequests: [] }
  assert.equal(
    recordPendingApprovalRequest({
      state,
      instructionId: "mcp-owner-stop-001",
      request: {
        method: "mcpServer/elicitation/request",
        reason: "Allow a connected tool request?",
      },
    }),
    null,
  )
  assert.deepEqual(state.pendingApprovalRequests, [])
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

test("the preceding Issue #53 schema-1 control/result recovers one exact bootstrap decision", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-bootstrap-decision-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const taskDirectory = path.join(
    directory,
    "Sillyquack-koalafrog-hq-issue-53",
  )
  await mkdir(taskDirectory, { recursive: true })
  await writeFile(
    path.join(taskDirectory, "state.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      task: {
        repository: "Sillyquack/koalafrog-hq",
        issueNumber: 53,
      },
      status: "running",
      lastConsumedInstructionId:
        "orchestrator-launchagent-owner-approval-009",
      activeInstruction: null,
      threadId: "01a0109a-3185-7992-acbb-b11d16c6e6bd",
      workspacePath: "/tmp/issue-53-workspace",
      branch: "agent/issue-53-orchestrator-persistent-mobile-runtime-008",
      turnCount: 10,
      retryCount: 0,
      pendingOwnerRequest: { reason: pendingLaunchAgentAction },
      retryInstructionIds: [],
      resultCorrectionInstructionIds: [],
      runs: [
        {
          instructionId: "orchestrator-launchagent-owner-approval-009",
          status: "needs_owner",
          completedAt: "2026-08-20T17:50:00.000Z",
        },
      ],
      updatedAt: "2026-08-20T17:50:00.000Z",
    }, null, 2)}\n`,
  )

  const options = {
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 53,
  }
  const store = new StateStore(options)
  const migrated = await store.load()
  assert.equal(migrated.schemaVersion, 4)
  assert.deepEqual(migrated.ownerApprovalDecisions, [])

  const registered = registerOwnerApprovalDecision({
    state: migrated,
    controls: [precedingIssue53BootstrapDecision],
    now: new Date("2026-08-20T17:55:00.000Z"),
  })
  assert.equal(
    registered.decisionId,
    "orchestrator-launchagent-owner-approval-009",
  )
  await store.save(migrated)

  const restarted = await new StateStore(options).load()
  const consumed = consumeOwnerApprovalDecision({
    state: restarted,
    request: request(),
    now: new Date("2026-08-20T17:56:00.000Z"),
  })
  assert.equal(
    consumed.decision.pendingInstructionId,
    "orchestrator-launchagent-owner-approval-009",
  )
  await new StateStore(options).save(restarted)

  const afterConsumptionRestart = await new StateStore(options).load()
  assert.ok(afterConsumptionRestart.ownerApprovalDecisions[0].consumedAt)
  assert.equal(
    consumeOwnerApprovalDecision({
      state: afterConsumptionRestart,
      request: request(),
      now: new Date("2026-08-20T17:57:00.000Z"),
    }),
    null,
  )
})

test("the latest interrupted Issue #53 event sequence recovers a fresh-turn decision", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-interrupted-decision-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const taskDirectory = path.join(
    directory,
    "Sillyquack-koalafrog-hq-issue-53",
  )
  await mkdir(taskDirectory, { recursive: true })
  await writeFile(
    path.join(taskDirectory, "state.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      task: {
        repository: "Sillyquack/koalafrog-hq",
        issueNumber: 53,
      },
      status: "failed",
      lastConsumedInstructionId: "orchestrator-approval-recovery-commit-011",
      activeInstruction: null,
      threadId: "01a0109a-3185-7992-acbb-b11d16c6e6bd",
      workspacePath: "/tmp/issue-53-workspace",
      branch: "agent/issue-53-orchestrator-persistent-mobile-runtime-008",
      turnCount: 11,
      retryCount: 0,
      pendingOwnerRequest: null,
      retryInstructionIds: [],
      resultCorrectionInstructionIds: [],
      runs: [
        {
          instructionId: "orchestrator-approval-recovery-commit-011",
          status: "failed",
          completedAt: "2026-08-20T18:53:59.353Z",
        },
      ],
      updatedAt: "2026-08-20T18:53:59.353Z",
    }, null, 2)}\n`,
  )
  const events = [
    {
      at: "2026-08-20T18:41:54.138Z",
      type: "turn_started",
      instructionId: "orchestrator-owner-decision-bootstrap-consumption-fix-010",
      threadId: "01a0109a-3185-7992-acbb-b11d16c6e6bd",
      turnId: "01a0207a-cdd6-7101-a664-afd82ddde791",
    },
    {
      at: "2026-08-20T18:47:22.933Z",
      type: "server_request",
      message: {
        method: "item/commandExecution/requestApproval",
        id: 12,
        threadId: "01a0109a-3185-7992-acbb-b11d16c6e6bd",
        turnId: "01a0207a-cdd6-7101-a664-afd82ddde791",
        itemId: "exec-0e8db5e7-9b9e-43ff-956c-2997613dff57",
        reason: pendingApprovalRecoveryCommit,
      },
    },
    {
      at: "2026-08-20T18:47:23.002Z",
      type: "notification",
      message: {
        method: "turn/completed",
        threadId: "01a0109a-3185-7992-acbb-b11d16c6e6bd",
        turnId: "01a0207a-cdd6-7101-a664-afd82ddde791",
        status: "interrupted",
      },
    },
  ]
  await writeFile(
    path.join(taskDirectory, "events.jsonl"),
    `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
  )

  const options = {
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 53,
  }
  const store = new StateStore(options)
  const migrated = await store.load()
  assert.equal(migrated.pendingApprovalRequests.length, 1)
  assert.deepEqual(
    migrated.pendingApprovalRequests[0].requestIdentities[0],
    {
      requestId: 12,
      method: "item/commandExecution/requestApproval",
      threadId: "01a0109a-3185-7992-acbb-b11d16c6e6bd",
      turnId: "01a0207a-cdd6-7101-a664-afd82ddde791",
      itemId: "exec-0e8db5e7-9b9e-43ff-956c-2997613dff57",
      identityDigest:
        migrated.pendingApprovalRequests[0].requestIdentities[0].identityDigest,
      observedAt: "2026-08-20T18:47:22.933Z",
    },
  )

  const decision = registerOwnerApprovalDecision({
    state: migrated,
    controls: [precedingIssue53CommitDecision],
    now: new Date("2026-08-20T18:55:00.000Z"),
  })
  assert.equal(
    decision.decisionId,
    "orchestrator-approval-recovery-commit-011",
  )
  assert.ok(
    consumeOwnerApprovalDecision({
      state: migrated,
      request: {
        method: "item/commandExecution/requestApproval",
        reason: pendingApprovalRecoveryCommit,
      },
      now: new Date("2026-08-20T18:56:00.000Z"),
    }),
  )
})
