import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import {
  reconcileServiceTransition,
  runRepositoryCycle,
  runRepositoryIssue,
  watchRepository,
} from "../src/repository-runner.mjs"
import {
  consumeOwnerApprovalDecision,
  recordPendingApprovalRequest,
  registerOwnerApprovalDecision,
} from "../src/approval-decisions.mjs"
import { StateStore } from "../src/state-store.mjs"

function controlBlock(instructionId) {
  return `\`\`\`yaml
agent_control:
  action: start
  task_state: ready
  instruction_id: ${instructionId}
  max_turns: 2
  owner_approval_required: false
  prompt: |
    Make only the bounded orchestrator change.
\`\`\``
}

test("repository watch reconnects and keeps polling after needs_owner", async () => {
  const controller = new AbortController()
  const stopped = []
  let scannerCount = 0
  const createScanner = async () => {
    scannerCount += 1
    const id = scannerCount
    return {
      id,
      appServer: {
        async stop() {
          stopped.push(id)
        },
      },
    }
  }
  let cycles = 0
  const runCycle = async () => {
    cycles += 1
    if (cycles === 1) throw new Error("transient scanner disconnect")
    if (cycles === 2) {
      return [
        {
          issueNumber: 53,
          instructionId: "owner-stop-001",
          status: "needs_owner",
        },
      ]
    }
    controller.abort()
    return [
      {
        issueNumber: 53,
        instructionId: "owner-follow-up-002",
        status: "needs_review",
      },
    ]
  }
  const sleeps = []
  const sleep = async (milliseconds, _value, { signal }) => {
    sleeps.push(milliseconds)
    if (signal.aborted) {
      const error = new Error("aborted")
      error.name = "AbortError"
      throw error
    }
  }
  const lines = []

  await watchRepository(
    {
      repository: "Sillyquack/koalafrog-hq",
      pollMs: 15_000,
      retryBaseMs: 1_000,
    },
    {
      signal: controller.signal,
      createScanner,
      runCycle,
      sleep,
      write: (line) => lines.push(JSON.parse(line)),
    },
  )

  assert.equal(cycles, 3)
  assert.equal(scannerCount, 2)
  assert.deepEqual(stopped, [1, 2])
  assert.deepEqual(sleeps, [1_000, 15_000, 15_000])
  assert.equal(lines[0].event, "repository_watch_started")
  assert.equal(lines[1].event, "repository_poll_failed")
  assert.deepEqual(
    lines
      .filter((line) => line.event === "repository_poll_completed")
      .map((line) => line.results[0].status),
    ["needs_owner", "needs_review"],
  )
})

test("a restarted content-addressed LaunchAgent reconciles its consumed install decision", async () => {
  const reason =
    "Install and reload only the owner-approved Koalafrog user LaunchAgent with the reviewed content-addressed runtime and stable coordinating checkout."
  const state = {
    pendingOwnerRequest: { reason },
    pendingApprovalRequests: [],
    ownerApprovalDecisions: [],
    runs: [
      {
        instructionId: "launchagent-origin-001",
        status: "needs_owner",
        completedAt: "2026-08-20T18:00:00.000Z",
      },
    ],
  }
  recordPendingApprovalRequest({
    state,
    instructionId: "launchagent-origin-001",
    request: {
      method: "item/commandExecution/requestApproval",
      reason,
    },
    now: new Date("2026-08-20T18:00:00.000Z"),
  })
  registerOwnerApprovalDecision({
    state,
    controls: [
      {
        action: "continue",
        taskState: "needs_owner",
        instructionId: "launchagent-decision-002",
        maxTurns: 3,
        ownerApprovalRequired: false,
        prompt: `Owner approval is explicitly granted to install and reload the reviewed Koalafrog user LaunchAgent with the reviewed content-addressed orchestrator runtime and stable coordinating checkout.`,
      },
    ],
    now: new Date("2026-08-20T18:01:00.000Z"),
  })
  consumeOwnerApprovalDecision({
    state,
    request: {
      method: "item/commandExecution/requestApproval",
      reason,
    },
    now: new Date("2026-08-20T18:02:00.000Z"),
  })
  const events = []
  class FakeStateStore {
    async load() {
      return state
    }

    async save(nextState) {
      assert.equal(nextState, state)
    }

    async appendEvent(event) {
      events.push(event)
    }
  }
  const digest = "a".repeat(64)
  const config = {
    repository: "Sillyquack/koalafrog-hq",
    stateDirectory: "/state/Koalafrog Orchestrator",
    checkoutPath: "/stable/koalafrog-hq",
  }
  const completion = await reconcileServiceTransition(config, {
    serviceLabel: "com.sillyquack.koalafrog-orchestrator",
    orchestratorScript: `${config.stateDirectory}/runtime/releases/${digest}/bin/repository-orchestrator.mjs`,
    workingDirectory: config.checkoutPath,
    StateStoreClass: FakeStateStore,
  })

  assert.equal(completion.cleared, true)
  assert.ok(state.ownerApprovalDecisions[0].completedAt)
  assert.equal(state.pendingApprovalRequests[0].status, "completed")
  assert.equal(state.pendingOwnerRequest, null)
  assert.equal(events[0].type, "owner_approved_action_reconciled")
})

test("a failed oldest issue does not starve the next deterministic candidate", async () => {
  const visited = []
  const results = await runRepositoryCycle(
    {},
    {
      stateDirectory: "/tmp/unused-queue-state",
      retryBaseMs: 1,
      maxTasksPerPoll: 4,
    },
    {
      search: async () => [
        {
          issueNumber: 63,
          createdAt: "2026-08-20T16:28:59Z",
        },
        {
          issueNumber: 54,
          createdAt: "2026-08-18T10:00:00Z",
        },
      ],
      discoverPersisted: async () => [],
      runIssue: async (_scanner, _config, candidate) => {
        visited.push(candidate.issueNumber)
        if (candidate.issueNumber === 54) throw new Error("permanently blocked")
        return {
          issueNumber: candidate.issueNumber,
          status: "needs_review",
          claimed: true,
        }
      },
    },
  )

  assert.deepEqual(visited, [54, 63])
  assert.equal(results[0].status, "failed")
  assert.equal(results[1].status, "needs_review")
})

test("a repository task is claimed once and routes pickup to its origin issue", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-routing-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const comments = []
  const scanner = {
    threadId: "scanner-thread",
    appServer: {
      async callMcpTool(request) {
        if (request.tool === "github.fetch_issue") {
          assert.equal(request.arguments.issue_number, 63)
          return {
            structuredContent: {
              issue: {
                number: 63,
                state: "open",
                html_url: "https://github.com/Sillyquack/koalafrog-hq/issues/63",
                body: controlBlock("production-day1-stock-equipment-001"),
              },
            },
          }
        }
        if (request.tool === "github.fetch_issue_comments") {
          assert.equal(request.arguments.issue_number, 63)
          return { structuredContent: { comments } }
        }
        if (request.tool === "github.add_comment_to_issue") {
          comments.push({ body: request.arguments.comment })
          assert.equal(request.arguments.pr_number, 63)
          return { structuredContent: { id: 9001 } }
        }
        throw new Error(`Unexpected MCP tool: ${request.tool}`)
      },
    },
  }
  let turns = 0
  class FakeOrchestrator {
    constructor(_config, { controlPlane }) {
      this.controlPlane = controlPlane
    }

    async runOnce({ expectedInstructionId }) {
      turns += 1
      await this.controlPlane.postComment(`pickup ${expectedInstructionId}`)
      return {
        status: "needs_review",
        instructionId: expectedInstructionId,
      }
    }

    async stop() {}
  }
  const config = {
    repository: "Sillyquack/koalafrog-hq",
    stateDirectory: directory,
    retryBaseMs: 1,
  }
  const candidate = {
    issueNumber: 63,
    issueUrl: "https://github.com/Sillyquack/koalafrog-hq/issues/63",
  }
  const first = await runRepositoryIssue(scanner, config, candidate, {
    OrchestratorClass: FakeOrchestrator,
  })
  const duplicate = await runRepositoryIssue(scanner, config, candidate, {
    OrchestratorClass: FakeOrchestrator,
  })

  assert.equal(first.claimed, true)
  assert.equal(first.originIssueUrl, candidate.issueUrl)
  assert.equal(duplicate.claimed, false)
  assert.equal(duplicate.status, "already_consumed")
  assert.equal(turns, 1)
  assert.equal(comments.length, 1)
  const record = JSON.parse(
    await readFile(
      path.join(
        directory,
        "repository-queue",
        "instructions",
        "production-day1-stock-equipment-001.json",
      ),
      "utf8",
    ),
  )
  assert.equal(record.originIssueNumber, 63)
  assert.equal(record.originIssueUrl, candidate.issueUrl)
})

test("an unchanged searched issue is skipped without repeated GitHub detail reads", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-watermark-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new StateStore({
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 63,
  })
  const state = await store.load()
  state.task.lastObservedIssueUpdatedAt = "2026-08-20T17:00:00Z"
  await store.save(state)
  let apiCalls = 0
  const result = await runRepositoryIssue(
    {
      threadId: "scanner-thread",
      appServer: {
        async callMcpTool() {
          apiCalls += 1
          throw new Error("Unchanged issue must not be fetched")
        },
      },
    },
    {
      repository: "Sillyquack/koalafrog-hq",
      stateDirectory: directory,
      retryBaseMs: 1,
    },
    {
      issueNumber: 63,
      searchMatched: true,
      updatedAt: "2026-08-20T17:00:00Z",
    },
  )

  assert.deepEqual(result, {
    issueNumber: 63,
    status: "unchanged",
    claimed: false,
  })
  assert.equal(apiCalls, 0)
})
