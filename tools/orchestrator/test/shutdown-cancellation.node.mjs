import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { AppServerClient } from "../src/app-server.mjs"
import {
  Orchestrator,
  recordCommandCancellationRequested,
  recordCommandTerminalityPending,
} from "../src/orchestrator.mjs"
import { QueueClaimStore } from "../src/queue-claim-store.mjs"
import { runRepositoryIssue } from "../src/repository-runner.mjs"
import { StateStore } from "../src/state-store.mjs"

const repository = "Sillyquack/koalafrog-hq"
const issueNumber = 86
const issueUrl = `https://github.com/${repository}/issues/${issueNumber}`
const instructionId = "orchestrator-production-enrollment-readonly-health-001"

function controlBlock() {
  return `\`\`\`yaml
agent_control:
  action: start
  task_state: ready
  instruction_id: ${instructionId}
  owner_approval_required: false
  max_turns: 1
  prompt: |
    Perform one synthetic read-only shutdown-finalization review.
\`\`\``
}

function runtimeConfig(directory) {
  return {
    command: "once",
    repository,
    stateDirectory: directory,
    checkoutPath: "/tmp/coordinating-checkout",
    baseRef: "origin/main",
    maxTurns: 1,
    turnTimeoutMs: 60_000,
    maxRetries: 0,
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
    async ensureWorkspace({ existingPath }) {
      return {
        path: existingPath ?? "/tmp/workspace-shutdown-finalization-86",
        branch: "agent/issue-86-shutdown-finalization",
      }
    },
    async inspectWorkspace() {
      return {
        branch: "agent/issue-86-shutdown-finalization",
        commits: [],
        changedFiles: [],
        dirty: false,
      }
    },
    assertAllowedChanges() {},
    async commitWorkspaceChanges() {
      throw new Error("Shutdown recovery must not commit")
    },
    async validateWorkspace() {
      return { pass: true, detail: "" }
    },
  }
}

function githubFixture(comments) {
  const issue = {
    number: issueNumber,
    state: "open",
    html_url: issueUrl,
    updated_at: "2026-09-02T12:27:00.000Z",
    body: controlBlock(),
    labels: [],
  }
  let commentId = 5_509_453_747
  class FixtureControlPlane {
    async fetchTask() {
      return { issue, comments }
    }

    async postComment(body) {
      commentId += 1
      comments.push({ id: commentId, body })
      return { id: commentId }
    }
  }
  return {
    scanner: {
      threadId: "scanner-shutdown-finalization",
      appServer: {
        async callMcpTool(request) {
          if (request.tool === "github.fetch_issue") {
            return { structuredContent: { issue } }
          }
          if (request.tool === "github.fetch_issue_comments") {
            return { structuredContent: { comments } }
          }
          if (request.tool === "github.add_comment_to_issue") {
            commentId += 1
            comments.push({ id: commentId, body: request.arguments.comment })
            return { structuredContent: { id: commentId } }
          }
          throw new Error(`Unexpected MCP tool: ${request.tool}`)
        },
      },
    },
    candidate: {
      issueNumber,
      issueUrl,
      searchMatched: true,
      updatedAt: issue.updated_at,
    },
    ControlPlaneClass: FixtureControlPlane,
  }
}

function activeTurnState() {
  return {
    threadId: "thread-shutdown-validation",
    activeInstruction: {
      instructionId: "shutdown-validation-001",
      phase: "turn_started",
      turnId: "turn-shutdown-validation",
    },
  }
}

function cancellationObservation(overrides = {}) {
  return {
    schemaVersion: 1,
    threadId: "thread-shutdown-validation",
    turnId: "turn-shutdown-validation",
    reason: "shutdown_requested",
    requestedAt: "2026-09-02T12:27:04.000Z",
    drainDeadlineAt: "2026-09-02T12:28:04.000Z",
    activeCommandExecutions: [
      {
        id: "command-shutdown-validation",
        status: "inProgress",
      },
    ],
    ...overrides,
  }
}

async function queueRecord(directory) {
  return JSON.parse(
    await readFile(
      path.join(
        directory,
        "repository-queue",
        "instructions",
        `${instructionId}.json`,
      ),
      "utf8",
    ),
  )
}

function instrumentedAppServer({ controller, leaveCommandPending = false }) {
  const client = new AppServerClient({
    cwd: "/tmp",
    turnTerminationTimeoutMs: leaveCommandPending ? 20 : 1_000,
  })
  const counts = { threads: 0, turns: 0, interrupts: 0 }
  client.start = async () => {}
  client.stop = async () => {}
  client.waitForMcpReady = async () => {}
  client.startThread = async () => {
    counts.threads += 1
    return { thread: { id: "thread-shutdown-86" } }
  }
  client.request = async (method) => {
    if (method === "turn/start") {
      counts.turns += 1
      setTimeout(() => {
        client.emit("item/started", {
          threadId: "thread-shutdown-86",
          turnId: "turn-shutdown-86",
          item: {
            id: "command-shutdown-86",
            type: "commandExecution",
            status: "inProgress",
            command: "node --test synthetic-read-only.node.mjs",
          },
        })
        controller.abort("synthetic controlled shutdown")
      }, 0)
      return { turn: { id: "turn-shutdown-86" } }
    }
    if (method === "turn/interrupt") {
      counts.interrupts += 1
      if (!leaveCommandPending) {
        setTimeout(
          () =>
            client.emit("item/completed", {
              threadId: "thread-shutdown-86",
              turnId: "turn-shutdown-86",
              item: {
                id: "command-shutdown-86",
                type: "commandExecution",
                status: "failed",
                exitCode: 130,
                command: "node --test synthetic-read-only.node.mjs",
              },
            }),
          0,
        )
      }
      setTimeout(
        () =>
          client.emit("turn/completed", {
            threadId: "thread-shutdown-86",
            turn: {
              id: "turn-shutdown-86",
              status: "interrupted",
              items: [],
            },
          }),
        1,
      )
      return {}
    }
    throw new Error(`Unexpected App Server request: ${method}`)
  }
  return { client, counts }
}

test("shutdown_requested is explicitly accepted while malformed and foreign cancellation evidence remains rejected", () => {
  const state = activeTurnState()
  const record = recordCommandCancellationRequested(
    state,
    cancellationObservation(),
  )
  assert.equal(record.reason, "shutdown_requested")
  assert.equal(record.status, "draining")

  for (const observation of [
    cancellationObservation({ reason: "arbitrary_shutdown" }),
    cancellationObservation({ schemaVersion: 2 }),
    cancellationObservation({ requestedAt: "not-a-timestamp" }),
    cancellationObservation({ threadId: "thread-foreign" }),
    cancellationObservation({ turnId: "turn-foreign" }),
  ]) {
    assert.throws(
      () =>
        recordCommandCancellationRequested(activeTurnState(), observation),
      /invalid|not bound/,
    )
  }

  assert.throws(
    () =>
      recordCommandTerminalityPending(activeTurnState(), {
        threadId: "thread-shutdown-validation",
        turnId: "turn-shutdown-validation",
        pendingItemIds: ["command-shutdown-validation"],
      }),
    /does not match durable state/,
  )

  assert.throws(
    () =>
      recordCommandCancellationRequested(
        state,
        cancellationObservation({ requestedAt: "2026-09-02T12:27:05.000Z" }),
      ),
    /identity conflicts/,
  )
})

test("repository shutdown accepts App Server cancellation and completes one terminal lifecycle without queue failure inflation", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-shutdown-finalization-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const comments = []
  const controller = new AbortController()
  const { client, counts } = instrumentedAppServer({ controller })
  class ShutdownOrchestrator extends Orchestrator {
    constructor(config, dependencies) {
      super(config, {
        ...dependencies,
        appServer: client,
        workspace: fakeWorkspace(),
      })
    }
  }
  const { scanner, candidate, ControlPlaneClass } = githubFixture(comments)
  const claimStore = new QueueClaimStore({
    stateDirectory: directory,
    retryBaseMs: 1,
    watcherV2: true,
  })
  const startedAt = Date.now()
  const result = await runRepositoryIssue(
    scanner,
    runtimeConfig(directory),
    candidate,
    {
      OrchestratorClass: ShutdownOrchestrator,
      ControlPlaneClass,
      claimStore,
      signal: controller.signal,
    },
  )

  assert.equal(result.status, "needs_review")
  assert.ok(Date.now() - startedAt < 15_000)
  assert.deepEqual(counts, { threads: 1, turns: 1, interrupts: 1 })
  const durable = await new StateStore({
    stateDirectory: directory,
    repository,
    issueNumber,
  }).load()
  assert.equal(durable.activeInstruction, null)
  assert.equal(durable.runs.length, 1)
  assert.equal(durable.runs[0].turnCount, 1)
  assert.equal(
    durable.runs[0].resultArtifact.timeoutCancellation.reason,
    "shutdown_requested",
  )
  assert.equal(
    comments.filter((comment) => comment.body.includes("agent_pickup:"))
      .length,
    1,
  )
  assert.equal(
    comments.filter((comment) => comment.body.includes("agent_result:"))
      .length,
    1,
  )
  const queue = await queueRecord(directory)
  assert.equal(queue.status, "completed")
  assert.equal(queue.attempt, 1)
  assert.equal(queue.failureCount, undefined)
  assert.equal(queue.failureHistory, undefined)
})

test("Issue-86-shaped historical failure recovers the original turn with append-only queue history", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-issue-86-shutdown-recovery-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const comments = []
  const controller = new AbortController()
  const { client, counts } = instrumentedAppServer({
    controller,
    leaveCommandPending: true,
  })
  class InterruptedOrchestrator extends Orchestrator {
    constructor(config, dependencies) {
      super(config, {
        ...dependencies,
        appServer: client,
        workspace: fakeWorkspace(),
      })
    }
  }
  const fixture = githubFixture(comments)
  const claimStore = new QueueClaimStore({
    stateDirectory: directory,
    retryBaseMs: 1,
    watcherV2: true,
  })

  await assert.rejects(
    runRepositoryIssue(
      fixture.scanner,
      runtimeConfig(directory),
      fixture.candidate,
      {
        OrchestratorClass: InterruptedOrchestrator,
        ControlPlaneClass: fixture.ControlPlaneClass,
        claimStore,
        signal: controller.signal,
      },
    ),
    (error) =>
      error.code === "WATCHER_SHUTDOWN" &&
      error.commandTerminalityPending?.turnId === "turn-shutdown-86",
  )

  const released = await queueRecord(directory)
  assert.equal(released.status, "released")
  assert.equal(released.resultStatus, "shutdown_requested")
  assert.equal(released.attempt, 1)
  assert.equal(released.failureCount, undefined)
  assert.equal(released.failureHistory, undefined)
  const storeOptions = { stateDirectory: directory, repository, issueNumber }
  const stateStore = new StateStore(storeOptions)
  let durable = await stateStore.load()
  assert.equal(durable.status, "running")
  assert.equal(durable.activeInstruction.phase, "turn_started")
  assert.equal(durable.activeInstruction.turnCount, 1)
  assert.equal(
    durable.activeInstruction.commandTerminality.reason,
    "shutdown_requested",
  )
  assert.equal(
    durable.activeInstruction.commandTerminality.status,
    "terminality_pending",
  )
  assert.equal(durable.runs.length, 0)

  // Match the live Issue #86 shape produced by the pre-fix validator: the
  // cancellation observation did not become durable state, while the queue
  // retained one retryable failure for the same active thread and turn.
  delete durable.activeInstruction.commandTerminality
  await stateStore.save(durable)
  const historicalFailure = {
    at: "2026-09-02T12:22:52.978Z",
    errorDigest: "2e54dbd100adc72ada41669b295dd2b210ddbc9990f83de417005e189b538b21",
  }
  await writeFile(
    path.join(
      claimStore.recordDirectory,
      `${instructionId}.json`,
    ),
    `${JSON.stringify({
      ...released,
      status: "retryable_error",
      failureCount: 1,
      failureHistory: [historicalFailure],
      failureClass: "transient_instruction",
      normalizedErrorDigest: historicalFailure.errorDigest,
      error: "command cancellation observation is invalid",
      nextEligibleAt: "2026-09-02T12:23:52.978Z",
      updatedAt: "2026-09-02T12:22:52.980Z",
    })}\n`,
    { mode: 0o600 },
  )
  durable = await stateStore.load()
  assert.equal(durable.activeInstruction.commandTerminality, undefined)

  let resumes = 0
  let reads = 0
  let duplicateTurns = 0
  const recoveringAppServer = {
    async start() {},
    async resumeThread(threadId) {
      resumes += 1
      return { thread: { id: threadId } }
    },
    async waitForMcpReady() {},
    async readThread() {
      reads += 1
      return {
        thread: {
          turns: [
            {
              id: "turn-shutdown-86",
              status: "interrupted",
              items: [
                {
                  id: "command-shutdown-86",
                  type: "commandExecution",
                  status: "failed",
                  exitCode: 130,
                  command: "node --test synthetic-read-only.node.mjs",
                },
              ],
            },
          ],
        },
      }
    },
    async runTurn() {
      duplicateTurns += 1
      throw new Error("Recovery must not start a second turn")
    },
    async stop() {},
  }
  class RecoveringOrchestrator extends Orchestrator {
    constructor(config, dependencies) {
      super(config, {
        ...dependencies,
        appServer: recoveringAppServer,
        workspace: fakeWorkspace(),
      })
    }
  }

  const recovered = await runRepositoryIssue(
    fixture.scanner,
    runtimeConfig(directory),
    fixture.candidate,
    {
      OrchestratorClass: RecoveringOrchestrator,
      ControlPlaneClass: fixture.ControlPlaneClass,
      claimStore,
    },
  )
  const replay = await runRepositoryIssue(
    fixture.scanner,
    runtimeConfig(directory),
    fixture.candidate,
    {
      OrchestratorClass: RecoveringOrchestrator,
      ControlPlaneClass: fixture.ControlPlaneClass,
      claimStore,
    },
  )

  assert.equal(recovered.status, "failed")
  assert.equal(replay.status, "no_pending_agent_control")
  assert.equal(resumes, 1)
  assert.equal(reads, 1)
  assert.equal(duplicateTurns, 0)
  assert.deepEqual(counts, { threads: 1, turns: 1, interrupts: 1 })
  assert.equal(
    comments.filter((comment) => comment.body.includes("agent_pickup:"))
      .length,
    1,
  )
  assert.equal(
    comments.filter((comment) => comment.body.includes("agent_result:"))
      .length,
    1,
  )
  durable = await stateStore.load()
  assert.equal(durable.activeInstruction, null)
  assert.equal(durable.runs.length, 1)
  assert.equal(durable.runs[0].turnCount, 1)
  assert.equal(durable.runs[0].status, "failed")
  assert.equal(durable.terminalityReconciliations.length, 1)
  assert.equal(
    durable.terminalityReconciliations[0].classification,
    "terminality_proven",
  )
  const completed = await queueRecord(directory)
  assert.equal(completed.status, "completed")
  assert.equal(completed.resultStatus, "failed")
  assert.equal(completed.attempt, 2)
  assert.equal(completed.failureCount, 1)
  assert.deepEqual(completed.failureHistory, [historicalFailure])
})
