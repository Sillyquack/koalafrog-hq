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
import {
  agentResultPublicationDecision,
  extractAgentControls,
  formatCompletionPacket,
  formatPickupPacket,
  selectNextInstruction,
} from "../src/control-plane.mjs"
import {
  Orchestrator,
  recordCompletedTurnResult,
} from "../src/orchestrator.mjs"
import { QueueClaimStore } from "../src/queue-claim-store.mjs"
import { resultArtifactFromTurnResult } from "../src/result-artifact.mjs"
import { StateStore } from "../src/state-store.mjs"
import { interruptedCommandTerminalityDecision } from "../src/terminality-reconciliation.mjs"
import {
  issue63ContinuationControl,
  issue63ExpectedBranch,
  issue63HistoricalGrantControl,
  issue63HistoricalGrantInstructionId,
  issue63HistoricalGrantTask,
  issue63OriginUrl,
  issue63ReconciledBranch,
  issue63ReconciledHead,
  issue63ReconciliationTask,
  issue63ThreadId,
  issue63WorkspacePath,
  prepareIssue63HistoricalGrantState,
  prepareIssue63ReconciliationState,
} from "./fixtures/issue-63-production-day1-git-reconciliation-resume-010.mjs"
import {
  issue70CommandItemId,
  issue70InstructionId,
  issue70InterruptedCommand054Events,
  issue70OriginIssueNumber,
  issue70OriginIssueUrl,
  issue70ThreadId,
  issue70TurnId,
} from "./fixtures/issue-70-interrupted-command-054.mjs"

function controlBlock(
  instructionId,
  {
    action = "start",
    taskState = "ready",
    prompt = "Make only the bounded orchestrator change.",
    ownerApprovalRequired = false,
    maxTurns = 2,
  } = {},
) {
  return `\`\`\`yaml
agent_control:
  action: ${action}
  task_state: ${taskState}
  instruction_id: ${instructionId}
  max_turns: ${maxTurns}
  owner_approval_required: ${ownerApprovalRequired}
  prompt: |
${prompt
  .split("\n")
  .map((line) => `    ${line}`)
  .join("\n")}
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

test("an explicit repository issue scope loads only that durable task", async () => {
  const visited = []
  const results = await runRepositoryCycle(
    {},
    {
      issueNumber: issue70OriginIssueNumber,
      issueNumberExplicit: true,
      stateDirectory: "/tmp/unused-scoped-queue-state",
      retryBaseMs: 1,
      maxTasksPerPoll: 1,
    },
    {
      search: async () => {
        throw new Error("scoped recovery must not search unrelated issues")
      },
      discoverPersisted: async () => {
        throw new Error("scoped recovery must not inspect unrelated state")
      },
      runIssue: async (_scanner, _config, candidate) => {
        visited.push(candidate.issueNumber)
        return {
          issueNumber: candidate.issueNumber,
          status: "needs_review",
          claimed: true,
        }
      },
    },
  )

  assert.deepEqual(visited, [issue70OriginIssueNumber])
  assert.deepEqual(results, [
    {
      issueNumber: issue70OriginIssueNumber,
      status: "needs_review",
      claimed: true,
    },
  ])
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

test("Issue #63 skips stale 002, claims matching 003 once, and preserves task continuity", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-issue-63-stale-continuation-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const storeOptions = {
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 63,
  }
  const store = new StateStore(storeOptions)
  const state = await store.load()
  state.status = "needs_review"
  state.lastConsumedInstructionId = "production-day1-stock-equipment-001"
  state.threadId = "01a0243c-dcdf-7121-a02d-0aaba354c2dd"
  state.workspacePath =
    "/workspaces/issue-63-production-day1-stock-equipment-001"
  state.branch = "agent/issue-63-production-day1-stock-equipment-001"
  state.runs.push({
    instructionId: "production-day1-stock-equipment-001",
    status: "needs_review",
  })
  await store.save(state)

  const noWriteSafetyBoundary =
    "Do not perform any new production writes, receipts, mutations, migrations, deployments, purchases, merges, or other external side effects."
  const issue = {
    number: 63,
    state: "open",
    updated_at: "2026-08-21T13:29:47Z",
    body: controlBlock("production-day1-stock-equipment-001"),
  }
  const comments = [
    {
      body: controlBlock("production-day1-safety-readback-002", {
        action: "continue",
        taskState: "running",
        prompt:
          "From this point forward, do not perform any new production writes, receipts, mutations, migrations, deployments, purchases, or other external side effects in this instruction.",
      }),
    },
    {
      body: controlBlock("production-day1-safety-readback-resume-003", {
        action: "continue",
        taskState: "needs_review",
        prompt: noWriteSafetyBoundary,
      }),
    },
  ]
  const selected = selectNextInstruction(issue, comments, state)
  assert.equal(
    selected.instructionId,
    "production-day1-safety-readback-resume-003",
  )
  assert.equal(selected.prompt, noWriteSafetyBoundary)

  let detailReads = 0
  const scanner = {
    threadId: "scanner-thread",
    appServer: {
      async callMcpTool(request) {
        detailReads += 1
        if (request.tool === "github.fetch_issue") {
          return { structuredContent: { issue } }
        }
        if (request.tool === "github.fetch_issue_comments") {
          return { structuredContent: { comments } }
        }
        throw new Error(`Unexpected MCP tool: ${request.tool}`)
      },
    },
  }
  const executed = []
  class ConsumingOrchestrator {
    constructor(_config, { store: taskStore }) {
      this.store = taskStore
    }

    async runOnce({ expectedInstructionId }) {
      executed.push(expectedInstructionId)
      assert.equal(
        expectedInstructionId,
        "production-day1-safety-readback-resume-003",
      )
      const nextState = await this.store.load()
      assert.equal(
        nextState.threadId,
        "01a0243c-dcdf-7121-a02d-0aaba354c2dd",
      )
      assert.equal(
        nextState.workspacePath,
        "/workspaces/issue-63-production-day1-stock-equipment-001",
      )
      assert.equal(
        nextState.branch,
        "agent/issue-63-production-day1-stock-equipment-001",
      )
      nextState.status = "needs_review"
      nextState.lastConsumedInstructionId = expectedInstructionId
      nextState.runs.push({
        instructionId: expectedInstructionId,
        status: "needs_review",
      })
      await this.store.save(nextState)
      return {
        status: "needs_review",
        instructionId: expectedInstructionId,
      }
    }

    async stop() {}
  }
  const config = {
    repository: storeOptions.repository,
    stateDirectory: directory,
    retryBaseMs: 1,
  }
  const candidate = {
    issueNumber: 63,
    searchMatched: true,
    updatedAt: issue.updated_at,
  }

  const claimed = await runRepositoryIssue(scanner, config, candidate, {
    OrchestratorClass: ConsumingOrchestrator,
  })
  const replay = await runRepositoryIssue(scanner, config, candidate, {
    OrchestratorClass: ConsumingOrchestrator,
  })

  assert.equal(claimed.status, "needs_review")
  assert.equal(
    claimed.instructionId,
    "production-day1-safety-readback-resume-003",
  )
  assert.equal(claimed.claimed, true)
  assert.deepEqual(replay, {
    issueNumber: 63,
    status: "no_pending_agent_control",
    claimed: false,
  })
  assert.deepEqual(executed, ["production-day1-safety-readback-resume-003"])
  assert.equal(detailReads, 4)

  const claimDirectory = path.join(
    directory,
    "repository-queue",
    "instructions",
  )
  const claimRecord = JSON.parse(
    await readFile(
      path.join(
        claimDirectory,
        "production-day1-safety-readback-resume-003.json",
      ),
      "utf8",
    ),
  )
  assert.equal(claimRecord.status, "completed")
  assert.equal(claimRecord.attempt, 1)
  await assert.rejects(
    readFile(
      path.join(
        claimDirectory,
        "production-day1-safety-readback-002.json",
      ),
      "utf8",
    ),
    (error) => error.code === "ENOENT",
  )

  const finalState = await store.load()
  assert.equal(
    finalState.lastConsumedInstructionId,
    "production-day1-safety-readback-resume-003",
  )
  assert.equal(
    finalState.runs.filter(
      (run) => run.instructionId === "production-day1-safety-readback-002",
    ).length,
    0,
  )
  assert.equal(
    finalState.runs.filter(
      (run) =>
        run.instructionId === "production-day1-safety-readback-resume-003",
    ).length,
    1,
  )
})

test("repository runner reconciles connector-shaped retryable Issue #63/010 exactly once", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-repository-branch-reconciliation-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const storeOptions = {
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 63,
  }
  const store = new StateStore(storeOptions)
  const [instruction] = extractAgentControls(issue63ContinuationControl)
  const state = prepareIssue63ReconciliationState(
    await store.load(),
    instruction,
  )
  state.task.lastObservedIssueUpdatedAt = "2026-08-22T05:10:00.000Z"
  await store.save(state)

  const task = issue63ReconciliationTask()
  task.issue.issue_number = 63
  task.issue.url = issue63OriginUrl
  delete task.issue.number
  delete task.issue.html_url
  task.comments.push({
    id: 1,
    body: formatPickupPacket({
      instructionId: instruction.instructionId,
      originIssueNumber: 63,
      originIssueUrl: issue63OriginUrl,
      codexThreadId: issue63ThreadId,
      branch: issue63ExpectedBranch,
    }),
  })
  let postedCommentId = 1
  const posted = []
  const scanner = {
    threadId: "repository-scanner-thread",
    appServer: {
      async callMcpTool(request) {
        if (request.tool === "github.fetch_issue") {
          return { structuredContent: { issue: task.issue } }
        }
        if (request.tool === "github.fetch_issue_comments") {
          return { structuredContent: { comments: task.comments } }
        }
        if (request.tool === "github.add_comment_to_issue") {
          const body = request.arguments.comment
          posted.push(body)
          task.comments.push({ id: postedCommentId, body })
          postedCommentId += 1
          return { structuredContent: { result: { id: postedCommentId } } }
        }
        throw new Error(`Unexpected MCP tool: ${request.tool}`)
      },
    },
  }
  let turns = 0
  const gitExecutionBoundary = {
    instructionId: instruction.instructionId,
    threadId: issue63ThreadId,
    workspacePath: issue63WorkspacePath,
    branch: issue63ReconciledBranch,
    head: issue63ReconciledHead,
    writablePaths: ["/coordinating/.git/worktrees/issue-63"],
    commands: {
      cherry_pick: [
        "git -c core.hooksPath=/dev/null -c commit.gpgSign=false -c rerere.enabled=false cherry-pick a74079be88ec4a8b36b850f95dca791ff42e4e80",
      ],
      push: [`git push origin ${issue63ReconciledBranch}`],
      pull_request: [
        `gh pr create --base main --head ${issue63ReconciledBranch} --fill`,
      ],
      validation: ["git diff --check"],
    },
  }
  const appServer = {
    async start() {},
    async resumeThread(threadId, params) {
      assert.equal(threadId, issue63ThreadId)
      assert.equal(params.approvalPolicy, "on-request")
      assert.equal(params.sandbox, "workspace-write")
      assert.equal(params.config["features.exec_permission_approvals"], true)
      return { thread: { id: threadId } }
    },
    async startThread() {
      throw new Error("Repository continuation must preserve the Codex thread")
    },
    async waitForMcpReady() {},
    async runTurn({
      onTurnStarted,
      approvalPolicy,
      prompt,
      resolveApprovalRequest,
    }) {
      turns += 1
      assert.equal(approvalPolicy, "on-request")
      assert.match(prompt, /Orchestrator-managed Git execution boundary/)
      assert.match(prompt, /with_additional_permissions/)
      await onTurnStarted("turn-repository-git-reconciliation-resume-010")
      const command = gitExecutionBoundary.commands.cherry_pick[0]
      const permissionGrant = await resolveApprovalRequest(
        {
          method: "item/permissions/requestApproval",
          threadId: issue63ThreadId,
          turnId: "turn-repository-git-reconciliation-resume-010",
          itemId: "item-repository-cherry-pick",
          details: {
            cwd: issue63WorkspacePath,
            permissions: {
              fileSystem: {
                write: [...gitExecutionBoundary.writablePaths],
              },
            },
          },
        },
        {
          commandExecution: {
            id: "item-repository-cherry-pick",
            type: "commandExecution",
            source: "agent",
            status: "inProgress",
            cwd: issue63WorkspacePath,
            command,
          },
        },
      )
      assert.deepEqual(permissionGrant.response, {
        permissions: {
          fileSystem: { write: gitExecutionBoundary.writablePaths },
        },
        scope: "turn",
        strictAutoReview: true,
      })
      return {
        status: "completed",
        turn: {
          id: "turn-repository-git-reconciliation-resume-010",
          status: "completed",
          items: [],
        },
        pendingOwnerRequest: null,
        agentMessage:
          "needs_review\n\nRepository runner resumed the authorized continuation.",
      }
    },
    async stop() {},
  }
  let reconciliationCallbacks = 0
  const workspace = {
    async ensureWorkspace({ existingBranch, reconcileBranch }) {
      if (existingBranch === issue63ExpectedBranch) {
        reconciliationCallbacks += 1
        assert.equal(
          await reconcileBranch({
            path: issue63WorkspacePath,
            expectedBranch: issue63ExpectedBranch,
            actualBranch: issue63ReconciledBranch,
            head: issue63ReconciledHead,
            dirty: false,
            operationsInProgress: [],
          }),
          true,
        )
      } else {
        assert.equal(existingBranch, issue63ReconciledBranch)
      }
      return { path: issue63WorkspacePath, branch: issue63ReconciledBranch }
    },
    async inspectWorkspace() {
      return {
        branch: issue63ReconciledBranch,
        commits: [issue63ReconciledHead],
        changedFiles: [],
        dirty: false,
      }
    },
    assertAllowedChanges() {},
    async commitWorkspaceChanges() {},
    async validateWorkspace() {
      return { pass: true, detail: "" }
    },
    async authorizedGitExecutionBoundary({ state, instruction: current }) {
      assert.equal(current.instructionId, instruction.instructionId)
      assert.equal(state.workspaceBranchReconciliations.length, 1)
      return gitExecutionBoundary
    },
    async gitExecutionBoundaryIsCurrent(boundary, action) {
      assert.equal(boundary, gitExecutionBoundary)
      assert.equal(action, "cherry_pick")
      return true
    },
  }
  class Issue63ReconciliationOrchestrator extends Orchestrator {
    constructor(config, dependencies) {
      super(config, { ...dependencies, appServer, workspace })
    }
  }
  const config = {
    repository: storeOptions.repository,
    stateDirectory: directory,
    checkoutPath: "/tmp/coordinating-checkout",
    baseRef: "origin/main",
    maxTurns: 12,
    turnTimeoutMs: 1_000,
    maxRetries: 0,
    retryBaseMs: 1,
    codexBinary: "codex",
    model: null,
    allowedPaths: [],
    autoCommit: false,
    fetchRemote: false,
  }
  const candidate = {
    issueNumber: 63,
    searchMatched: true,
    updatedAt: task.issue.updated_at,
  }
  let queueNow = new Date("2026-08-22T05:10:00.000Z")
  const claimStore = new QueueClaimStore({
    stateDirectory: directory,
    retryBaseMs: 1,
    now: () => queueNow,
  })
  await assert.rejects(
    claimStore.withClaim(
      {
        instructionId: instruction.instructionId,
        originIssueNumber: 63,
        originIssueUrl: issue63OriginUrl,
      },
      async () => {
        throw new Error("Workspace branch changed before runtime recovery")
      },
    ),
    /Workspace branch changed before runtime recovery/,
  )
  queueNow = new Date("2026-08-22T05:10:00.010Z")

  const claimed = await runRepositoryIssue(scanner, config, candidate, {
    OrchestratorClass: Issue63ReconciliationOrchestrator,
    claimStore,
  })
  const replay = await runRepositoryIssue(scanner, config, candidate, {
    OrchestratorClass: Issue63ReconciliationOrchestrator,
    claimStore,
  })

  assert.equal(claimed.status, "needs_review")
  assert.equal(
    claimed.instructionId,
    "production-day1-git-reconciliation-resume-010",
  )
  assert.equal(claimed.originIssueUrl, issue63OriginUrl)
  assert.equal(claimed.claimed, true)
  assert.deepEqual(replay, {
    issueNumber: 63,
    status: "no_pending_agent_control",
    claimed: false,
  })
  assert.equal(turns, 1)
  assert.equal(reconciliationCallbacks, 1)
  assert.equal(
    posted.filter((body) => body.includes("agent_pickup:")).length,
    0,
  )
  assert.equal(
    posted.filter((body) => body.includes("agent_result:")).length,
    1,
  )
  assert.equal(
    task.comments.filter((comment) => comment.body.includes("agent_pickup:"))
      .length,
    1,
  )
  assert.equal(
    task.comments.filter((comment) => comment.body.includes("agent_result:"))
      .length,
    1,
  )
  const persisted = await new StateStore(storeOptions).load()
  assert.equal(persisted.threadId, issue63ThreadId)
  assert.equal(persisted.workspacePath, issue63WorkspacePath)
  assert.equal(persisted.branch, issue63ReconciledBranch)
  assert.equal(persisted.workspaceBranchReconciliations.length, 1)
  assert.equal(
    persisted.runs.filter(
      (run) =>
        run.instructionId ===
        "production-day1-git-reconciliation-resume-010",
    ).length,
    1,
  )
  const events = (await readFile(store.eventPath, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
  assert.equal(
    events.filter(
      (event) => event.type === "workspace_branch_reconciliation_rejected",
    ).length,
    0,
  )
  assert.equal(
    events.filter(
      (event) => event.type === "git_execution_permission_granted",
    ).length,
    1,
  )
  const claimRecord = JSON.parse(
    await readFile(
      path.join(
        directory,
        "repository-queue",
        "instructions",
        "production-day1-git-reconciliation-resume-010.json",
      ),
      "utf8",
    ),
  )
  assert.equal(claimRecord.status, "completed")
  assert.equal(claimRecord.attempt, 2)
})

test("live-shaped Issue #63/012 grants once and remains idempotent after repository restart", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-repository-git-execution-012-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const storeOptions = {
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 63,
  }
  const store = new StateStore(storeOptions)
  const [instruction] = extractAgentControls(issue63HistoricalGrantControl)
  const state = prepareIssue63HistoricalGrantState(
    await store.load(),
    instruction,
  )
  await store.save(state)

  const task = issue63HistoricalGrantTask()
  task.issue.issue_number = 63
  task.issue.url = issue63OriginUrl
  delete task.issue.number
  delete task.issue.html_url
  let postedCommentId = 1
  const posted = []
  const scanner = {
    threadId: "repository-scanner-thread-012",
    appServer: {
      async callMcpTool(request) {
        if (request.tool === "github.fetch_issue") {
          return { structuredContent: { issue: task.issue } }
        }
        if (request.tool === "github.fetch_issue_comments") {
          return { structuredContent: { comments: task.comments } }
        }
        if (request.tool === "github.add_comment_to_issue") {
          const body = request.arguments.comment
          posted.push(body)
          task.comments.push({ id: postedCommentId, body })
          postedCommentId += 1
          return { structuredContent: { result: { id: postedCommentId } } }
        }
        throw new Error(`Unexpected MCP tool: ${request.tool}`)
      },
    },
  }
  const gitExecutionBoundary = {
    schemaVersion: 1,
    instructionId: issue63HistoricalGrantInstructionId,
    threadId: issue63ThreadId,
    workspacePath: issue63WorkspacePath,
    branch: issue63ReconciledBranch,
    head: issue63ReconciledHead,
    provenanceMode: "historical_reconciliation",
    priorPredicateCode:
      "activation_reconciliation_current_instruction_missing",
    reconciliationInstructionId:
      "production-day1-git-reconciliation-resume-010",
    interveningExecutionInstructionIds: [
      "production-day1-git-reconciliation-resume-010",
      "production-day1-git-reconciliation-execution-011",
    ],
    writablePaths: ["/coordinating/.git/worktrees/issue-63"],
    commands: {
      cherry_pick: [
        "git -c core.hooksPath=/dev/null -c commit.gpgSign=false -c rerere.enabled=false cherry-pick a74079be88ec4a8b36b850f95dca791ff42e4e80",
      ],
      push: [`git push origin ${issue63ReconciledBranch}`],
      pull_request: [
        `gh pr create --base main --head ${issue63ReconciledBranch} --fill`,
      ],
      validation: ["git diff --check"],
    },
  }
  let turns = 0
  const appServer = {
    async start() {},
    async resumeThread(threadId, params) {
      assert.equal(threadId, issue63ThreadId)
      assert.equal(params.config["features.exec_permission_approvals"], true)
      return { thread: { id: threadId } }
    },
    async startThread() {
      throw new Error("Issue #63/012 must preserve its Codex thread")
    },
    async waitForMcpReady() {},
    async runTurn({
      onTurnStarted,
      approvalPolicy,
      prompt,
      resolveApprovalRequest,
    }) {
      turns += 1
      assert.equal(approvalPolicy, "on-request")
      assert.match(prompt, /Orchestrator-managed Git execution boundary/)
      const turnId = "turn-production-day1-git-reconciliation-execution-012"
      const itemId = "item-production-day1-git-012"
      await onTurnStarted(turnId)
      const ownerRequest = {
        method: "item/permissions/requestApproval",
        threadId: issue63ThreadId,
        turnId,
        itemId,
        details: {
          cwd: issue63WorkspacePath,
          permissions: {
            fileSystem: { write: [...gitExecutionBoundary.writablePaths] },
          },
        },
      }
      const requestContext = {
        commandExecution: {
          id: itemId,
          type: "commandExecution",
          source: "agent",
          status: "inProgress",
          cwd: issue63WorkspacePath,
          command: gitExecutionBoundary.commands.cherry_pick[0],
        },
      }
      const firstGrant = await resolveApprovalRequest(
        ownerRequest,
        requestContext,
      )
      const replayedGrant = await resolveApprovalRequest(
        ownerRequest,
        requestContext,
      )
      assert.deepEqual(replayedGrant, firstGrant)
      assert.deepEqual(firstGrant.response, {
        permissions: {
          fileSystem: { write: gitExecutionBoundary.writablePaths },
        },
        scope: "turn",
        strictAutoReview: true,
      })
      return {
        status: "completed",
        turn: { id: turnId, status: "completed", items: [] },
        pendingOwnerRequest: null,
        agentMessage:
          "needs_review\n\nThe mocked #63/012 grant path completed without a live Git operation.",
      }
    },
    async stop() {},
  }
  const workspace = {
    async ensureWorkspace({ existingPath, existingBranch }) {
      assert.equal(existingPath, issue63WorkspacePath)
      assert.equal(existingBranch, issue63ReconciledBranch)
      return { path: existingPath, branch: existingBranch }
    },
    async inspectWorkspace() {
      return {
        branch: issue63ReconciledBranch,
        commits: [issue63ReconciledHead],
        changedFiles: [],
        dirty: false,
      }
    },
    assertAllowedChanges() {},
    async commitWorkspaceChanges() {},
    async validateWorkspace() {
      return { pass: true, detail: "" }
    },
    async authorizedGitExecutionBoundary({
      state: currentState,
      instruction: currentInstruction,
    }) {
      assert.equal(
        currentInstruction.instructionId,
        issue63HistoricalGrantInstructionId,
      )
      assert.equal(
        currentState.workspaceBranchReconciliations[0]
          .continuationInstructionId,
        "production-day1-git-reconciliation-resume-010",
      )
      return gitExecutionBoundary
    },
    async gitExecutionBoundaryIsCurrent() {
      return true
    },
  }
  class Issue63ExecutionOrchestrator extends Orchestrator {
    constructor(config, dependencies) {
      super(config, { ...dependencies, appServer, workspace })
    }
  }
  const config = {
    repository: storeOptions.repository,
    stateDirectory: directory,
    checkoutPath: "/tmp/coordinating-checkout",
    baseRef: "origin/main",
    maxTurns: 12,
    turnTimeoutMs: 1_000,
    maxRetries: 0,
    retryBaseMs: 1,
    codexBinary: "codex",
    model: null,
    allowedPaths: [],
    autoCommit: false,
    fetchRemote: false,
  }
  const candidate = {
    issueNumber: 63,
    searchMatched: true,
    updatedAt: task.issue.updated_at,
  }
  const claimStore = new QueueClaimStore({
    stateDirectory: directory,
    retryBaseMs: 1,
  })

  const completed = await runRepositoryIssue(scanner, config, candidate, {
    OrchestratorClass: Issue63ExecutionOrchestrator,
    claimStore,
  })
  const restartedReplay = await runRepositoryIssue(scanner, config, candidate, {
    OrchestratorClass: Issue63ExecutionOrchestrator,
    claimStore,
  })

  assert.equal(completed.status, "needs_review")
  assert.equal(completed.instructionId, issue63HistoricalGrantInstructionId)
  assert.equal(restartedReplay.status, "no_pending_agent_control")
  assert.equal(turns, 1)
  assert.equal(
    posted.filter((body) => body.includes("agent_result:")).length,
    1,
  )
  const events = (await readFile(store.eventPath, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
  assert.equal(
    events.filter(
      (event) => event.type === "git_execution_boundary_activated",
    ).length,
    1,
  )
  assert.equal(
    events.filter(
      (event) => event.type === "git_execution_permission_granted",
    ).length,
    1,
  )
  assert.equal(
    events.filter(
      (event) => event.type === "git_execution_permission_rejected",
    ).length,
    0,
  )
  const diagnosticEvents = events.filter((event) =>
    event.type.startsWith("git_execution_"),
  )
  const serializedDiagnostics = JSON.stringify(diagnosticEvents)
  assert.doesNotMatch(serializedDiagnostics, /cherry-pick|with_additional_permissions/)
  assert.doesNotMatch(serializedDiagnostics, /\/coordinating\/\.git\/worktrees/)
  const claimRecord = JSON.parse(
    await readFile(
      path.join(
        directory,
        "repository-queue",
        "instructions",
        `${issue63HistoricalGrantInstructionId}.json`,
      ),
      "utf8",
    ),
  )
  assert.equal(claimRecord.status, "completed")
  assert.equal(claimRecord.attempt, 1)
})

async function runCompletedCheckpointRecoveryScenario(
  t,
  {
    boundaryAccepted,
    retryAfterGrant = false,
    preactivatedRecovery = false,
    restartPhase = null,
    mutateResultComments = null,
    expectCorrectionFailure = false,
    failFirstResultUpdate = false,
    recoveryRejectionCode = null,
    concurrentDiscovery = false,
  },
) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-checkpoint-027-recovery-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const instructionId =
    "production-day1-git-reconciliation-checkpoint-generation-activation-owner-ack-027"
  const checkpointId = `git-reconciliation-checkpoint:${"a".repeat(64)}`
  const generationId =
    `git-reconciliation-checkpoint-generation:${"b".repeat(64)}`
  const reconciliationId = "authorized-workspace-branch:008:010:exact-head"
  const branch = "agent/issue-63-production-day1-integration-001"
  const head = "ec719153c8e726831d7e2b748067383ea7f4e314"
  const tree = "2330f747713ce620c7927c2c505c622b40e18386"
  const cherryPickCommit = "a74079be88ec4a8b36b850f95dca791ff42e4e80"
  const workspacePath = "/workspaces/issue-63-integration"
  const issueUrl = "https://github.com/Sillyquack/koalafrog-hq/issues/63"
  const threadId = "thread-issue-63-generation-2"
  const prompt = `The owner explicitly approves activation of superseding Git reconciliation checkpoint \`${checkpointId}\`.

- generation: \`2\`
- generation ID: \`${generationId}\`
- reconciliation receipt: \`${reconciliationId}\`
- integration branch: \`${branch}\`
- current HEAD: \`${head}\`
- current tree: \`${tree}\`
- cherry-pick only: \`${cherryPickCommit}\``
  const controlBody = controlBlock(instructionId, {
    action: "continue",
    taskState: "needs_owner",
    prompt,
    ownerApprovalRequired: true,
    maxTurns: 8,
  })
  const [instruction] = extractAgentControls(controlBody)
  const storeOptions = {
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 63,
  }
  const store = new StateStore(storeOptions)
  const state = await store.load()
  state.status = "needs_review"
  state.lastConsumedInstructionId = instructionId
  state.threadId = threadId
  state.workspacePath = workspacePath
  state.branch = branch
  state.task.originIssueUrl = issueUrl
  state.task.lastObservedIssueUpdatedAt = "2026-08-24T09:10:00.000Z"
  state.ownerGateAcknowledgements = [
    {
      acknowledgementId: "owner-gate-acknowledgement-027",
      instructionId,
      checkpointId,
      generationId,
      reconciliationId,
      consumedAt: "2026-08-24T09:00:00.000Z",
      completedAt: "2026-08-24T09:05:00.000Z",
      outcome: "needs_review",
    },
  ]
  state.runs = [
    {
      instructionId,
      status: "needs_review",
      branch,
      commits: [head],
      changedFiles: [],
      turnCount: 1,
    },
  ]
  await store.save(state)

  const originalResult = {
    instructionId,
    originIssueNumber: 63,
    originIssueUrl: issueUrl,
    codexThreadId: threadId,
    status: "needs_review",
    branch,
    commits: [head],
    changedFiles: [],
    checks: {
      typecheck: "unknown",
      lint: "unknown",
      tests: "unknown",
      cloudflareReadiness: "unknown",
      build: "unknown",
      diffCheck: "pass",
    },
    ownerQuestion: null,
    ownerRequest: null,
    blockers: ["checkpoint_generation_audit_control_count"],
    ownerGates: [],
    productionReadback: [],
    safetyFindings: [],
    branchPushState: [],
    resultArtifact: null,
    detail: "Original completed 027 result remains durable until recovery.",
  }
  const task = {
    issue: {
      issue_number: 63,
      url: issueUrl,
      state: "open",
      updated_at: "2026-08-24T09:10:00.000Z",
    },
    comments: [
      { id: 700, body: controlBody },
      {
        id: 701,
        body: formatPickupPacket({
          instructionId,
          originIssueNumber: 63,
          originIssueUrl: issueUrl,
          codexThreadId: threadId,
          branch,
        }),
      },
      { id: 702, body: formatCompletionPacket(originalResult) },
    ],
  }
  const posted = []
  const updated = []
  let updateAttempts = 0
  const scanner = {
    threadId: "repository-scanner-thread-027",
    appServer: {
      async callMcpTool(request) {
        if (request.tool === "github.fetch_issue") {
          return { structuredContent: { issue: task.issue } }
        }
        if (request.tool === "github.fetch_issue_comments") {
          return { structuredContent: { comments: task.comments } }
        }
        if (request.tool === "github.add_comment_to_issue") {
          posted.push(request.arguments.comment)
          return { structuredContent: { result: { id: 703 } } }
        }
        if (request.tool === "github.update_issue_comment") {
          updateAttempts += 1
          updated.push(request.arguments)
          const comment = task.comments.find(
            (candidate) => candidate.id === request.arguments.comment_id,
          )
          comment.body = request.arguments.comment
          if (failFirstResultUpdate && updateAttempts === 1) {
            throw new Error("Injected post-update transport failure")
          }
          return { structuredContent: { result: { id: comment.id } } }
        }
        throw new Error(`Unexpected MCP tool: ${request.tool}`)
      },
    },
  }

  const recoveryBinding = {
    schemaVersion: 1,
    kind: "checkpoint_activation_recovery",
    instructionId,
    acknowledgementId: "owner-gate-acknowledgement-027",
    checkpointId,
    generation: 2,
    generationId,
    reconciliationId,
    branch,
    head,
    tree,
    cherryPickCommit,
    resultCommentId: null,
    resultCommentBodyDigest: null,
    resultPacketDigest: null,
  }
  const originalPublication = agentResultPublicationDecision({
    comments: task.comments,
    instructionId,
  })
  assert.equal(originalPublication.accepted, true)
  recoveryBinding.resultCommentId = originalPublication.value.commentId
  recoveryBinding.resultCommentBodyDigest =
    originalPublication.value.bodyDigest
  recoveryBinding.resultPacketDigest = originalPublication.value.packetDigest
  mutateResultComments?.({ task, originalResult })
  const recoveryId =
    `git-reconciliation-checkpoint-activation-recovery:${"c".repeat(64)}`
  const recoveryRecord = {
    ...recoveryBinding,
    recoveryId,
    status: "selected",
    selectedAt: null,
    boundaryActivatedAt: null,
    completedAt: null,
    outcome: null,
    rejectionCode: null,
    turnId: null,
    resultPacket: null,
  }
  if (preactivatedRecovery) {
    const persisted = await store.load()
    const selectedAt = "2026-08-24T09:06:00.000Z"
    persisted.activeInstruction = {
      ...instruction,
      phase: "selected",
      attempts: 0,
      turnCount: 1,
      selectedAt,
      checkpointActivationRecovery: {
        ...recoveryBinding,
        recoveryId,
      },
    }
    persisted.checkpointActivationRecoveries = [
      {
        ...recoveryRecord,
        status: "boundary_activated",
        selectedAt,
        boundaryActivatedAt: "2026-08-24T09:06:01.000Z",
      },
    ]
    persisted.resultCorrectionInstructionIds = [instructionId]
    await store.save(persisted)
  }
  if (restartPhase) {
    const persisted = await store.load()
    const selectedAt = "2026-08-24T09:06:00.000Z"
    const turnPhase = new Set([
      "turn_started",
      "turn_completed",
      "result_pending",
    ]).has(restartPhase)
    const boundaryPhase = restartPhase !== "selected"
    const turnId = turnPhase ? "turn-persisted-owner-ack-027" : null
    persisted.status = turnPhase ? "running" : "needs_review"
    persisted.activeInstruction = {
      ...instruction,
      phase: restartPhase,
      attempts: 0,
      turnCount: 1,
      selectedAt,
      ...(turnPhase
        ? {
            turnId,
            turnStartedAt: "2026-08-24T09:06:02.000Z",
            gitExecutionPermissionGrants: [],
          }
        : {}),
      checkpointActivationRecovery: {
        ...recoveryBinding,
        recoveryId,
      },
    }
    persisted.checkpointActivationRecoveries = [
      {
        ...recoveryRecord,
        status: boundaryPhase ? "boundary_activated" : "selected",
        selectedAt,
        boundaryActivatedAt: boundaryPhase
          ? "2026-08-24T09:06:01.000Z"
          : null,
        turnId,
      },
    ]
    persisted.resultCorrectionInstructionIds = [instructionId]
    if (restartPhase === "turn_completed") {
      recordCompletedTurnResult(persisted, {
        status: "completed",
        turn: { id: turnId, status: "completed", items: [] },
        pendingOwnerRequest: null,
        agentMessage:
          "needs_review\n\nRecovered the persisted completed checkpoint turn.",
      })
    }
    if (restartPhase === "result_pending") {
      persisted.activeInstruction.packet = {
        ...structuredClone(originalResult),
        blockers: [],
        detail: "Recovered the persisted result packet.",
      }
    }
    await store.save(persisted)
  }
  const recoverCheckpointActivation = ({ state: currentState }) => {
    if (recoveryRejectionCode) {
      return { accepted: false, rejection: { code: recoveryRejectionCode } }
    }
    if ((currentState.checkpointActivationRecoveries ?? []).length === 0) {
      return {
        accepted: true,
        value: {
          instruction,
          binding: recoveryBinding,
          record: structuredClone(recoveryRecord),
        },
      }
    }
    return {
      accepted: false,
      rejection: {
        code: "checkpoint_activation_recovery_already_recorded",
      },
    }
  }
  const writablePaths = ["/coordinating/.git/worktrees/issue-63-selected"]
  const cherryPickCommand =
    `git -c core.hooksPath=/dev/null -c commit.gpgSign=false -c rerere.enabled=false cherry-pick ${cherryPickCommit}`
  const boundary = {
    schemaVersion: 1,
    instructionId,
    issueNumber: 63,
    originIssueUrl: issueUrl,
    threadId,
    workspacePath,
    branch,
    head,
    cherryPickCommit,
    provenanceMode: "superseding_checkpoint",
    priorPredicateCode:
      "activation_historical_run_structured_no_mutation_evidence",
    reconciliationInstructionId:
      "production-day1-git-reconciliation-resume-010",
    interveningExecutionInstructionIds: [],
    checkpointId,
    checkpointGeneration: 2,
    checkpointGenerationId: generationId,
    checkpointActivation: {
      schemaVersion: 2,
      kind: "activation",
      checkpointId,
      generation: 2,
      generationId,
      activationInstructionId: instructionId,
      branch,
      head,
      tree,
      cherryPickCommit,
      activatedAt: null,
    },
    checkpointActivationIsNew: true,
    gitDirectory: writablePaths[0],
    commonDirectory: "/coordinating/.git",
    writablePaths,
    repository: storeOptions.repository,
    commands: {
      cherry_pick: [cherryPickCommand],
      push: [`git push origin ${branch}`],
      pull_request: [`gh pr create --base main --head ${branch} --fill`],
      validation: ["git diff --check"],
    },
  }
  let turns = 0
  let resumes = 0
  let grants = 0
  const appServer = {
    async start() {},
    async resumeThread(resumedThreadId, params) {
      resumes += 1
      assert.equal(resumedThreadId, threadId)
      assert.equal(params.config["features.exec_permission_approvals"], true)
      return { thread: { id: resumedThreadId } }
    },
    async startThread() {
      throw new Error("Recovery must preserve the existing Codex thread")
    },
    async waitForMcpReady() {},
    async readThread() {
      return {
        thread: {
          turns: [
            {
              id: "turn-persisted-owner-ack-027",
              status: "completed",
              items: [],
            },
          ],
        },
      }
    },
    async runTurn({
      onTurnStarted,
      approvalPolicy,
      prompt: turnPrompt,
      resolveApprovalRequest,
    }) {
      turns += 1
      assert.equal(boundaryAccepted, true)
      assert.equal(approvalPolicy, "on-request")
      assert.match(turnPrompt, /Orchestrator-managed Git execution boundary/)
      const turnId = `turn-recovered-owner-ack-027-${turns}`
      const itemId = retryAfterGrant
        ? "item-recovered-owner-ack-027-reused"
        : `item-recovered-owner-ack-027-${turns}`
      await onTurnStarted(turnId)
      const permissionRequest = {
        method: "item/permissions/requestApproval",
        threadId,
        turnId,
        itemId,
        details: {
          cwd: workspacePath,
          permissions: {
            fileSystem: { write: [...writablePaths] },
          },
        },
      }
      const commandContext = {
        commandExecution: {
          id: itemId,
          type: "commandExecution",
          source: "agent",
          status: "inProgress",
          cwd: workspacePath,
          command: cherryPickCommand,
        },
      }
      const decision = await resolveApprovalRequest(
        permissionRequest,
        commandContext,
      )
      if (retryAfterGrant && turns > 1) {
        assert.equal(decision, null)
        return {
          status: "completed",
          turn: { id: turnId, status: "completed", items: [] },
          pendingOwnerRequest: null,
          agentMessage:
            "needs_review\n\nThe retry correctly received no second protected Git permission.",
        }
      }
      const replayedDecision = await resolveApprovalRequest(
        permissionRequest,
        commandContext,
      )
      assert.deepEqual(replayedDecision, decision)
      assert.deepEqual(decision.response, {
        permissions: {
          fileSystem: { write: writablePaths },
        },
        scope: "turn",
        strictAutoReview: true,
      })
      grants += 1
      if (retryAfterGrant) {
        return {
          status: "failed",
          turn: { id: turnId, status: "failed", items: [] },
          pendingOwnerRequest: null,
          agentMessage: null,
        }
      }
      return {
        status: "completed",
        turn: { id: turnId, status: "completed", items: [] },
        pendingOwnerRequest: null,
        agentMessage:
          "needs_review\n\nRecovered 027 reached the exact managed permission path without executing live Git.",
      }
    },
    async stop() {},
  }
  const workspace = {
    recoverCompletedCheckpointActivation: recoverCheckpointActivation,
    async ensureWorkspace({ existingPath, existingBranch }) {
      return { path: existingPath, branch: existingBranch }
    },
    async inspectWorkspace() {
      return {
        branch,
        commits: [head],
        changedFiles: [],
        dirty: false,
      }
    },
    assertAllowedChanges() {},
    async commitWorkspaceChanges() {},
    async validateWorkspace() {
      return { pass: true, detail: "" }
    },
    async authorizedGitExecutionBoundary({ onDiagnostic }) {
      if (boundaryAccepted) return boundary
      onDiagnostic({ code: "checkpoint_activation_recovery_current_binding" })
      return null
    },
    async gitExecutionBoundaryIsCurrent() {
      return true
    },
  }
  class RecoveryOrchestrator extends Orchestrator {
    constructor(config, dependencies) {
      super(config, { ...dependencies, appServer, workspace })
    }
  }
  const config = {
    repository: storeOptions.repository,
    stateDirectory: directory,
    checkoutPath: "/tmp/coordinating-checkout",
    baseRef: "origin/main",
    maxTurns: 12,
    turnTimeoutMs: 1_000,
    maxRetries: retryAfterGrant ? 1 : 0,
    retryBaseMs: 1,
    codexBinary: "codex",
    model: null,
    allowedPaths: [],
    autoCommit: false,
    fetchRemote: false,
  }
  const candidate = {
    issueNumber: 63,
    searchMatched: true,
    updatedAt: task.issue.updated_at,
  }
  const claimStore = new QueueClaimStore({
    stateDirectory: directory,
    retryBaseMs: 1,
  })
  await claimStore.withClaim(
    {
      instructionId,
      originIssueNumber: 63,
      originIssueUrl: issueUrl,
    },
    async () => ({ status: "needs_review" }),
  )
  const run = () =>
    runRepositoryIssue(scanner, config, candidate, {
      OrchestratorClass: RecoveryOrchestrator,
      recoverCheckpointActivation,
      claimStore,
    })
  let recovered = null
  let replay = null
  let correctionError = null
  if (expectCorrectionFailure) {
    try {
      await run()
    } catch (error) {
      correctionError = error
    }
    assert.ok(correctionError)
  } else if (failFirstResultUpdate) {
    await assert.rejects(run(), /Injected post-update transport failure/)
    await new Promise((resolve) => setTimeout(resolve, 5))
    recovered = await run()
    replay = await run()
  } else if (concurrentDiscovery) {
    const attempts = await Promise.all([run(), run()])
    recovered = attempts.find((attempt) => attempt.claimed)
    assert.ok(recovered)
    assert.equal(
      attempts.filter((attempt) => attempt.status === "issue_busy").length,
      1,
    )
    replay = await run()
  } else {
    recovered = await run()
    replay = await run()
  }
  const durable = await store.load()
  const eventText = await readFile(store.eventPath, "utf8").catch((error) => {
    if (error?.code === "ENOENT") return ""
    throw error
  })
  const events = eventText
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  const claim = await readFile(
    path.join(
      directory,
      "repository-queue",
      "instructions",
      `${instructionId}.json`,
    ),
    "utf8",
  ).then(JSON.parse, (error) => {
    if (error?.code === "ENOENT") return null
    throw error
  })
  return {
    recovered,
    replay,
    durable,
    events,
    claim,
    turns,
    resumes,
    grants,
    posted,
    updated,
    updateAttempts,
    correctionError,
    instructionId,
  }
}

test("completed acknowledgement 027 recovers once through repository claim and managed permission", async (t) => {
  const result = await runCompletedCheckpointRecoveryScenario(t, {
    boundaryAccepted: true,
  })
  assert.equal(result.recovered.status, "needs_review")
  assert.equal(result.recovered.instructionId, result.instructionId)
  assert.equal(result.replay.status, "no_pending_agent_control")
  assert.equal(result.turns, 1)
  assert.equal(result.resumes, 1)
  assert.equal(result.grants, 1)
  assert.equal(result.posted.length, 0)
  assert.equal(result.updated.length, 1)
  assert.equal(result.updated[0].comment_id, 702)
  assert.equal(result.durable.runs.length, 1)
  assert.equal(result.durable.ownerGateAcknowledgements.length, 1)
  assert.equal(result.durable.ownerGateAcknowledgements[0].outcome, "needs_review")
  assert.equal(result.durable.checkpointActivationRecoveries.length, 1)
  assert.equal(result.durable.checkpointActivationRecoveries[0].status, "completed")
  assert.equal(result.claim.status, "completed")
  assert.equal(result.claim.attempt, 2)
  assert.equal(
    result.events.filter(
      (event) => event.type === "git_execution_permission_granted",
    ).length,
    1,
  )
  assert.equal(
    result.events.filter(
      (event) => event.type === "checkpoint_activation_recovery_activated",
    ).length,
    1,
  )
})

test("concurrent repository discovery creates one completed checkpoint recovery", async (t) => {
  const result = await runCompletedCheckpointRecoveryScenario(t, {
    boundaryAccepted: true,
    concurrentDiscovery: true,
  })
  assert.equal(result.recovered.status, "needs_review")
  assert.equal(result.replay.status, "no_pending_agent_control")
  assert.equal(result.turns, 1)
  assert.equal(result.grants, 1)
  assert.equal(result.durable.checkpointActivationRecoveries.length, 1)
  assert.equal(result.durable.checkpointActivationRecoveries[0].status, "completed")
})

function deferredTaskScanner({ issue, comments }) {
  let release
  let enteredCount = 0
  let announce
  const entered = new Promise((resolve) => {
    announce = resolve
  })
  const gate = new Promise((resolve) => {
    release = resolve
  })
  return {
    scanner: {
      threadId: "repository-race-scanner",
      appServer: {
        async callMcpTool(request) {
          if (
            request.tool !== "github.fetch_issue" &&
            request.tool !== "github.fetch_issue_comments"
          ) {
            throw new Error(`Unexpected MCP tool: ${request.tool}`)
          }
          enteredCount += 1
          if (enteredCount === 2) announce()
          await gate
          return request.tool === "github.fetch_issue"
            ? { structuredContent: { issue } }
            : { structuredContent: { comments } }
        },
      },
    },
    entered,
    release,
  }
}

test("a delayed no-control poll cannot erase a newer running protected instruction", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-runner-race-running-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const storeOptions = {
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 63,
  }
  const store = new StateStore(storeOptions)
  const initial = await store.load()
  initial.status = "needs_review"
  await store.save(initial)
  const issue = {
    issue_number: 63,
    state: "open",
    updated_at: "2026-08-25T12:00:00.000Z",
    url: issue63OriginUrl,
  }
  const blocked = deferredTaskScanner({ issue, comments: [] })
  const config = {
    repository: storeOptions.repository,
    stateDirectory: directory,
    retryBaseMs: 1,
  }
  const candidate = { issueNumber: 63, searchMatched: true }
  let orchestratorSelections = 0
  class FreshStateOrchestrator {
    constructor(_config, { store: taskStore }) {
      this.store = taskStore
    }

    async runOnce({ expectedInstructionId }) {
      orchestratorSelections += 1
      const current = await this.store.load()
      assert.equal(current.status, "running")
      assert.equal(current.activeInstruction.instructionId, expectedInstructionId)
      return { status: "queue_changed", instructionId: expectedInstructionId }
    }

    async stop() {}
  }
  const poll = runRepositoryIssue(blocked.scanner, config, candidate, {
    OrchestratorClass: FreshStateOrchestrator,
  })
  await blocked.entered

  const newer = await store.load()
  const [instruction] = extractAgentControls(
    controlBlock("protected-recovery-027", {
      action: "continue",
      taskState: "needs_review",
    }),
  )
  newer.status = "running"
  newer.activeInstruction = {
    ...instruction,
    phase: "turn_started",
    checkpointActivationRecovery: { recoveryId: "recovery-current-027" },
  }
  newer.checkpointActivationRecoveries = [
    {
      instructionId: instruction.instructionId,
      recoveryId: "recovery-current-027",
      status: "boundary_activated",
    },
  ]
  await store.save(newer)
  const claimStore = new QueueClaimStore({ stateDirectory: directory })
  await claimStore.withClaim(
    { instructionId: instruction.instructionId, originIssueNumber: 63 },
    async () => ({ status: "needs_review" }),
  )
  blocked.release()
  const result = await poll

  assert.equal(result.status, "queue_changed")
  assert.equal(result.claimed, false)
  assert.equal(orchestratorSelections, 1)
  const durable = await store.load()
  assert.equal(durable.status, "running")
  assert.equal(durable.activeInstruction.instructionId, instruction.instructionId)
  assert.equal(durable.checkpointActivationRecoveries.length, 1)
  const queueRecord = JSON.parse(
    await readFile(
      path.join(
        directory,
        "repository-queue",
        "instructions",
        `${instruction.instructionId}.json`,
      ),
      "utf8",
    ),
  )
  assert.equal(queueRecord.status, "completed")
  assert.equal(queueRecord.attempt, 1)
})

test("a delayed poll cannot remove or rediscover a terminal recovery", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-runner-race-terminal-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new StateStore({
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 63,
  })
  const initial = await store.load()
  initial.status = "needs_review"
  await store.save(initial)
  const instructionId = "completed-recovery-027"
  const issue = {
    issue_number: 63,
    state: "open",
    updated_at: "2026-08-25T12:01:00.000Z",
    url: issue63OriginUrl,
  }
  const blocked = deferredTaskScanner({ issue, comments: [] })
  const candidate = { issueNumber: 63, searchMatched: true }
  const poll = runRepositoryIssue(
    blocked.scanner,
    {
      repository: "Sillyquack/koalafrog-hq",
      stateDirectory: directory,
      retryBaseMs: 1,
    },
    candidate,
    {
      recoverCheckpointActivation: () => ({
        accepted: false,
        rejection: {
          code: "checkpoint_activation_recovery_already_recorded",
        },
      }),
    },
  )
  await blocked.entered
  const terminal = await store.load()
  terminal.lastConsumedInstructionId = instructionId
  terminal.ownerGateAcknowledgements = [
    { kind: "checkpoint_activation", instructionId, completedAt: "2026-08-25T11:59:00.000Z" },
  ]
  terminal.checkpointActivationRecoveries = [
    { instructionId, recoveryId: "terminal-recovery", status: "completed" },
  ]
  await store.save(terminal)
  const claimStore = new QueueClaimStore({ stateDirectory: directory })
  await claimStore.withClaim(
    { instructionId, originIssueNumber: 63 },
    async () => ({ status: "needs_review" }),
  )
  blocked.release()
  const result = await poll

  assert.equal(result.status, "no_pending_agent_control")
  const durable = await store.load()
  assert.equal(durable.checkpointActivationRecoveries.length, 1)
  assert.equal(durable.checkpointActivationRecoveries[0].status, "completed")
  const queueRecord = JSON.parse(
    await readFile(
      path.join(directory, "repository-queue", "instructions", `${instructionId}.json`),
      "utf8",
    ),
  )
  assert.equal(queueRecord.status, "completed")
  assert.equal(queueRecord.attempt, 1)
})

test("a pending control that arrives during fetch wins over the stale idle snapshot", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-runner-race-control-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const issue = {
    issue_number: 63,
    state: "open",
    updated_at: "2026-08-25T12:02:00.000Z",
    url: issue63OriginUrl,
  }
  const comments = []
  const blocked = deferredTaskScanner({ issue, comments })
  let turns = 0
  class ConsumingOrchestrator {
    constructor(_config, { store }) {
      this.store = store
    }

    async runOnce({ expectedInstructionId }) {
      turns += 1
      const state = await this.store.load()
      state.status = "needs_review"
      state.lastConsumedInstructionId = expectedInstructionId
      state.runs.push({ instructionId: expectedInstructionId, status: "needs_review" })
      await this.store.save(state)
      return { status: "needs_review", instructionId: expectedInstructionId }
    }

    async stop() {}
  }
  const poll = runRepositoryIssue(
    blocked.scanner,
    {
      repository: "Sillyquack/koalafrog-hq",
      stateDirectory: directory,
      retryBaseMs: 1,
    },
    { issueNumber: 63, searchMatched: true },
    { OrchestratorClass: ConsumingOrchestrator },
  )
  await blocked.entered
  comments.push({ body: controlBlock("arrived-during-fetch-001") })
  blocked.release()
  const result = await poll

  assert.equal(result.instructionId, "arrived-during-fetch-001")
  assert.equal(result.claimed, true)
  assert.equal(turns, 1)
})

test("an invalid durable recovery observed after fetch fails closed without overwriting newer authority state", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-runner-race-rejection-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const instructionId = "invalid-recovery-027"
  const store = new StateStore({
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 63,
  })
  const initial = await store.load()
  initial.status = "needs_review"
  await store.save(initial)
  const issue = {
    issue_number: 63,
    state: "open",
    updated_at: "2026-08-25T12:03:00.000Z",
    url: issue63OriginUrl,
  }
  const blocked = deferredTaskScanner({ issue, comments: [] })
  const poll = runRepositoryIssue(
    blocked.scanner,
    {
      repository: "Sillyquack/koalafrog-hq",
      stateDirectory: directory,
      retryBaseMs: 1,
    },
    { issueNumber: 63, searchMatched: true },
    {
      recoverCheckpointActivation: () => ({
        accepted: false,
        rejection: { code: "checkpoint_activation_recovery_binding_drift" },
      }),
    },
  )
  await blocked.entered
  const newer = await store.load()
  newer.lastConsumedInstructionId = instructionId
  newer.ownerGateAcknowledgements = [
    {
      kind: "checkpoint_activation",
      instructionId,
      acknowledgementId: "owner-ack-current-027",
      status: "completed",
    },
  ]
  newer.pendingApprovalRequests = [
    { requestId: "completed-request-027", status: "completed" },
  ]
  newer.runs = [{ instructionId, status: "needs_review" }]
  await store.save(newer)
  blocked.release()
  const result = await poll

  assert.equal(result.status, "checkpoint_activation_recovery_rejected")
  assert.equal(
    result.rejectionCode,
    "checkpoint_activation_recovery_binding_drift",
  )
  const durable = await store.load()
  assert.equal(durable.ownerGateAcknowledgements[0].acknowledgementId, "owner-ack-current-027")
  assert.equal(durable.pendingApprovalRequests[0].status, "completed")
  assert.equal(durable.runs.length, 1)
})

test("applicable durable recovery rejection is explicit and starts no protected turn", async (t) => {
  const result = await runCompletedCheckpointRecoveryScenario(t, {
    boundaryAccepted: true,
    recoveryRejectionCode: "checkpoint_activation_recovery_current_binding",
  })
  assert.equal(result.recovered.status, "checkpoint_activation_recovery_rejected")
  assert.equal(
    result.recovered.rejectionCode,
    "checkpoint_activation_recovery_current_binding",
  )
  assert.equal(result.recovered.claimed, false)
  assert.equal(result.replay.status, "checkpoint_activation_recovery_rejected")
  assert.equal(result.turns, 0)
  assert.equal(result.grants, 0)
  assert.equal(result.durable.checkpointActivationRecoveries.length, 0)
  assert.equal(
    result.events.filter(
      (event) =>
        event.type ===
          "checkpoint_activation_recovery_discovery_rejected" &&
        event.code === "checkpoint_activation_recovery_current_binding",
    ).length,
    2,
  )
})

test("checkpoint recovery survives each persisted boundary and turn phase without duplicate execution", async (t) => {
  for (const phase of [
    "selected",
    "boundary_activated",
    "thread_ready",
    "turn_started",
    "turn_completed",
    "result_pending",
  ]) {
    await t.test(phase, async (subtest) => {
      const result = await runCompletedCheckpointRecoveryScenario(subtest, {
        boundaryAccepted: true,
        restartPhase: phase,
      })
      assert.equal(result.recovered.status, "needs_review")
      assert.equal(result.replay.status, "no_pending_agent_control")
      assert.equal(result.posted.length, 0)
      assert.equal(result.updated.length, 1)
      assert.equal(result.durable.checkpointActivationRecoveries.length, 1)
      assert.equal(
        result.durable.checkpointActivationRecoveries[0].status,
        "completed",
      )
      const startsNewTurn = new Set([
        "selected",
        "boundary_activated",
        "thread_ready",
      ]).has(phase)
      assert.equal(result.turns, startsNewTurn ? 1 : 0)
      assert.equal(result.grants, startsNewTurn ? 1 : 0)
      assert.ok(result.grants <= 1)
    })
  }
})

test("checkpoint recovery boundary rejection starts no Codex turn and is restart-idempotent", async (t) => {
  const result = await runCompletedCheckpointRecoveryScenario(t, {
    boundaryAccepted: false,
  })
  assert.equal(result.recovered.status, "needs_review")
  assert.equal(result.replay.status, "no_pending_agent_control")
  assert.equal(result.turns, 0)
  assert.equal(result.resumes, 0)
  assert.equal(result.grants, 0)
  assert.equal(result.posted.length, 0)
  assert.equal(result.updated.length, 0)
  assert.equal(result.durable.runs.length, 1)
  assert.equal(result.durable.checkpointActivationRecoveries.length, 1)
  assert.equal(result.durable.checkpointActivationRecoveries[0].status, "rejected")
  assert.equal(
    result.durable.checkpointActivationRecoveries[0].rejectionCode,
    "checkpoint_activation_recovery_current_binding",
  )
  assert.equal(
    result.events.filter(
      (event) => event.type === "git_execution_permission_granted",
    ).length,
    0,
  )
  assert.equal(
    result.events.filter(
      (event) => event.type === "checkpoint_activation_recovery_rejected",
    ).length,
    1,
  )
})

test("checkpoint recovery does not regrant a protected Git action on turn retry", async (t) => {
  const result = await runCompletedCheckpointRecoveryScenario(t, {
    boundaryAccepted: true,
    retryAfterGrant: true,
  })
  assert.equal(result.recovered.status, "needs_review")
  assert.equal(result.replay.status, "no_pending_agent_control")
  assert.equal(result.turns, 2)
  assert.equal(result.grants, 1)
  assert.equal(
    result.events.filter(
      (event) => event.type === "git_execution_permission_granted",
    ).length,
    1,
  )
  assert.equal(
    result.events.filter(
      (event) =>
        event.type === "git_execution_permission_rejected" &&
        event.code === "grant_duplicate_action_conflict",
    ).length,
    1,
  )
})

test("recovered result correction rejects ambiguous, spoofed, malformed, omitted, and drifted publications", async (t) => {
  const cases = [
    [
      "duplicate",
      ({ task }) => {
        const original = task.comments.find((comment) => comment.id === 702)
        task.comments.push({ ...structuredClone(original), id: 704 })
      },
    ],
    [
      "spoofed",
      ({ task }) => {
        task.comments.push({
          id: 704,
          body: "agent_result:\n  instruction_id: production-day1-git-reconciliation-checkpoint-generation-activation-owner-ack-027",
        })
      },
    ],
    [
      "malformed",
      ({ task }) => {
        const original = task.comments.find((comment) => comment.id === 702)
        original.body = original.body.replace(/^  status:.*\n/m, "")
      },
    ],
    [
      "non-integer id",
      ({ task }) => {
        task.comments.find((comment) => comment.id === 702).id = "702"
      },
    ],
    [
      "omitted",
      ({ task }) => {
        task.comments = task.comments.filter((comment) => comment.id !== 702)
      },
    ],
    [
      "branch drift",
      ({ task }) => {
        const original = task.comments.find((comment) => comment.id === 702)
        original.body = original.body.replace(
          '  branch: "agent/issue-63-production-day1-integration-001"',
          '  branch: "agent/issue-63-other"',
        )
      },
    ],
    [
      "thread drift",
      ({ task }) => {
        const original = task.comments.find((comment) => comment.id === 702)
        original.body = original.body.replace(
          '  codex_thread_id: "thread-issue-63-generation-2"',
          '  codex_thread_id: "thread-other"',
        )
      },
    ],
    [
      "origin drift",
      ({ task }) => {
        const original = task.comments.find((comment) => comment.id === 702)
        original.body = original.body.replace(
          "  origin_issue_number: 63",
          "  origin_issue_number: 64",
        )
      },
    ],
    [
      "status drift",
      ({ task }) => {
        const original = task.comments.find((comment) => comment.id === 702)
        original.body = original.body.replace(
          "  status: needs_review",
          "  status: failed",
        )
      },
    ],
  ]
  for (const [name, mutateResultComments] of cases) {
    await t.test(name, async (subtest) => {
      const result = await runCompletedCheckpointRecoveryScenario(subtest, {
        boundaryAccepted: true,
        mutateResultComments,
        expectCorrectionFailure: true,
      })
      assert.match(
        result.correctionError.message,
        /Recovered result correction rejected/,
      )
      assert.equal(result.posted.length, 0)
      assert.equal(result.updated.length, 0)
      assert.equal(result.durable.activeInstruction.phase, "result_pending")
      assert.equal(result.durable.checkpointActivationRecoveries.length, 1)
      assert.equal(
        result.durable.checkpointActivationRecoveries[0].status,
        "boundary_activated",
      )
      assert.equal(result.claim.status, "retryable_error")
    })
  }
})

test("recovered result correction recognizes a successful update after a crash without republishing", async (t) => {
  const result = await runCompletedCheckpointRecoveryScenario(t, {
    boundaryAccepted: true,
    failFirstResultUpdate: true,
  })
  assert.equal(result.recovered.status, "needs_review")
  assert.equal(result.replay.status, "no_pending_agent_control")
  assert.equal(result.updateAttempts, 1)
  assert.equal(result.updated.length, 1)
  assert.equal(result.posted.length, 0)
  assert.equal(
    result.durable.checkpointActivationRecoveries[0].status,
    "completed",
  )
})

test("persisted boundary activation terminally rejects later reconstruction drift without a turn", async (t) => {
  const result = await runCompletedCheckpointRecoveryScenario(t, {
    boundaryAccepted: false,
    preactivatedRecovery: true,
  })
  assert.equal(result.recovered.status, "needs_review")
  assert.equal(result.replay.status, "no_pending_agent_control")
  assert.equal(result.turns, 0)
  assert.equal(result.resumes, 0)
  assert.equal(result.durable.activeInstruction, null)
  assert.equal(result.durable.checkpointActivationRecoveries.length, 1)
  assert.equal(result.durable.checkpointActivationRecoveries[0].status, "rejected")
  assert.equal(
    result.durable.checkpointActivationRecoveries[0].rejectionCode,
    "checkpoint_activation_recovery_current_binding",
  )
})

test("repository restart completes the exact terminal #70/047 queue record without replaying a turn or protected action", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-terminal-queue-restart-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const repository = "Sillyquack/koalafrog-hq"
  const issueNumber = 70
  const issueUrl =
    "https://github.com/Sillyquack/koalafrog-hq/issues/70"
  const instructionId = "orchestrator-bootstrap-direct-canonical-review-047"
  const similarSuffixId = "unrelated-owner-control-047"
  const queue = new QueueClaimStore({
    stateDirectory: directory,
    retryBaseMs: 60_000,
  })
  let queueCallbacks = 0
  await assert.rejects(
    queue.withClaim(
      { instructionId, originIssueNumber: issueNumber, originIssueUrl: issueUrl },
      async () => {
        queueCallbacks += 1
        throw new Error("simulated crash after durable task finalization")
      },
    ),
    /simulated crash/,
  )

  const store = new StateStore({
    stateDirectory: directory,
    repository,
    issueNumber,
  })
  const state = await store.load()
  state.status = "failed"
  state.lastConsumedInstructionId = instructionId
  state.threadId = "thread-live-047"
  state.workspacePath = "/workspaces/live-047"
  state.branch = "agent/issue-70-live-047"
  state.task.originIssueUrl = issueUrl
  state.runs.push({
    instructionId,
    status: "failed",
    threadId: "thread-live-047",
    workspacePath: state.workspacePath,
    branch: state.branch,
    commits: [],
    changedFiles: [],
    turnCount: 1,
    originIssueNumber: issueNumber,
    originIssueUrl: issueUrl,
    ownerRequest: null,
    checks: {},
    blockers: [],
    ownerGates: [],
    productionReadback: [],
    safetyFindings: [],
    branchPushState: [],
    resultArtifact: {
      version: 1,
      source: "app_server_turn_failure",
      capturedAt: "2026-08-26T12:00:00.000Z",
      turnId: "turn-live-047-attempt-0",
      turnStatus: "failed",
      failure: {
        eventId:
          "turn_failed:thread-live-047:turn-live-047-attempt-0",
        errorClass: "AppServerTurnError",
        code: "APP_SERVER_TURN_ERROR",
        category: "cyberPolicy",
        codexErrorInfo: "cyberPolicy",
        willRetry: false,
        threadId: "thread-live-047",
        turnId: "turn-live-047-attempt-0",
      },
      finalMessage: "Safe final progress evidence.",
      checks: {},
      findings: {},
    },
    completedAt: "2026-08-26T12:00:01.000Z",
  })
  await store.save(state)

  const issue = {
    number: issueNumber,
    state: "open",
    html_url: issueUrl,
    updated_at: "2026-08-26T12:00:02.000Z",
    body: controlBlock(instructionId),
  }
  const comments = [
    {
      id: 1,
      body: controlBlock(similarSuffixId, {
        action: "continue",
        taskState: "needs_review",
      }),
    },
  ]
  const scanner = {
    threadId: "scanner-terminal-047",
    appServer: {
      async callMcpTool(request) {
        if (request.tool === "github.fetch_issue") {
          return { structuredContent: { issue } }
        }
        if (request.tool === "github.fetch_issue_comments") {
          return { structuredContent: { comments } }
        }
        throw new Error(`Unexpected MCP tool: ${request.tool}`)
      },
    },
  }
  let orchestratorConstructions = 0
  class ForbiddenReplayOrchestrator {
    constructor() {
      orchestratorConstructions += 1
      throw new Error("Terminal queue finalization must not construct a runner")
    }
  }
  const config = {
    repository,
    stateDirectory: directory,
    retryBaseMs: 1,
  }
  const candidate = {
    issueNumber,
    issueUrl,
    updatedAt: issue.updated_at,
    searchMatched: true,
  }

  const first = await runRepositoryIssue(scanner, config, candidate, {
    OrchestratorClass: ForbiddenReplayOrchestrator,
    claimStore: queue,
  })
  const replay = await runRepositoryIssue(scanner, config, candidate, {
    OrchestratorClass: ForbiddenReplayOrchestrator,
    claimStore: queue,
  })
  assert.equal(first.status, "no_pending_agent_control")
  assert.equal(replay.status, "no_pending_agent_control")
  assert.equal(orchestratorConstructions, 0)
  assert.equal(queueCallbacks, 1)
  const record = JSON.parse(
    await readFile(
      path.join(queue.recordDirectory, `${instructionId}.json`),
      "utf8",
    ),
  )
  assert.equal(record.status, "completed")
  assert.equal(record.resultStatus, "failed")
  assert.equal(record.attempt, 2)
  const events = (await readFile(store.eventPath, "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse)
  assert.equal(
    events.filter((event) => event.type === "queue_completion_reconciled")
      .length,
    1,
  )
  const persisted = await store.load()
  assert.equal(persisted.lastConsumedInstructionId, instructionId)
  assert.equal(persisted.runs.length, 1)
})

test("repository restart completes a finalized #70/054 terminality queue record without replay", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-terminality-queue-restart-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const repository = "Sillyquack/koalafrog-hq"
  const queue = new QueueClaimStore({
    stateDirectory: directory,
    retryBaseMs: 60_000,
  })
  let queueCallbacks = 0
  await assert.rejects(
    queue.withClaim(
      {
        instructionId: issue70InstructionId,
        originIssueNumber: issue70OriginIssueNumber,
        originIssueUrl: issue70OriginIssueUrl,
      },
      async () => {
        queueCallbacks += 1
        throw new Error("simulated crash after terminality result finalization")
      },
    ),
    /simulated crash/,
  )

  const store = new StateStore({
    stateDirectory: directory,
    repository,
    issueNumber: issue70OriginIssueNumber,
  })
  const state = await store.load()
  state.status = "needs_review"
  state.lastConsumedInstructionId = issue70InstructionId
  state.threadId = issue70ThreadId
  state.workspacePath = "/workspaces/issue-70-054"
  state.branch = "agent/issue-70-054"
  state.task.originIssueUrl = issue70OriginIssueUrl
  const decision = interruptedCommandTerminalityDecision({
    state: {
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
    },
    events: issue70InterruptedCommand054Events(),
    readbackError: Object.assign(new Error("readback unavailable"), {
      code: "APP_SERVER_READBACK_UNAVAILABLE",
    }),
    reconciledAt: "2026-08-27T19:05:00.000Z",
  })
  const terminality = decision.turnResult.terminalityReconciliation
  state.terminalityReconciliations.push({
    ...decision.record,
    status: "finalized",
    finalizedAt: "2026-08-27T19:05:01.000Z",
    resultStatus: "needs_review",
  })
  state.runs.push({
    instructionId: issue70InstructionId,
    status: "needs_review",
    threadId: issue70ThreadId,
    workspacePath: state.workspacePath,
    branch: state.branch,
    commits: [],
    changedFiles: ["preserved-interrupted.diff"],
    turnCount: 1,
    originIssueNumber: issue70OriginIssueNumber,
    originIssueUrl: issue70OriginIssueUrl,
    ownerRequest: null,
    checks: {},
    blockers: ["terminality_unprovable"],
    ownerGates: [],
    productionReadback: [],
    safetyFindings: [terminality.evidenceSummary],
    branchPushState: [],
    resultArtifact: resultArtifactFromTurnResult(
      decision.turnResult,
      "2026-08-27T19:05:00.000Z",
    ),
    completedAt: "2026-08-27T19:05:01.000Z",
  })
  await store.save(state)

  const issue = {
    number: issue70OriginIssueNumber,
    state: "open",
    html_url: issue70OriginIssueUrl,
    updated_at: "2026-08-27T19:06:00.000Z",
    body: controlBlock(issue70InstructionId),
  }
  const scanner = {
    threadId: "scanner-terminal-054",
    appServer: {
      async callMcpTool(request) {
        if (request.tool === "github.fetch_issue") {
          return { structuredContent: { issue } }
        }
        if (request.tool === "github.fetch_issue_comments") {
          return { structuredContent: { comments: [] } }
        }
        throw new Error(`Unexpected MCP tool: ${request.tool}`)
      },
    },
  }
  let orchestratorConstructions = 0
  class ForbiddenReplayOrchestrator {
    constructor() {
      orchestratorConstructions += 1
      throw new Error("Terminality queue finalization must not construct a runner")
    }
  }
  const config = { repository, stateDirectory: directory, retryBaseMs: 1 }
  const candidate = {
    issueNumber: issue70OriginIssueNumber,
    issueUrl: issue70OriginIssueUrl,
    updatedAt: issue.updated_at,
    searchMatched: true,
  }

  const first = await runRepositoryIssue(scanner, config, candidate, {
    OrchestratorClass: ForbiddenReplayOrchestrator,
    claimStore: queue,
  })
  const replay = await runRepositoryIssue(scanner, config, candidate, {
    OrchestratorClass: ForbiddenReplayOrchestrator,
    claimStore: queue,
  })
  assert.equal(first.status, "no_pending_agent_control")
  assert.equal(replay.status, "no_pending_agent_control")
  assert.equal(orchestratorConstructions, 0)
  assert.equal(queueCallbacks, 1)
  const queueRecord = JSON.parse(
    await readFile(
      path.join(queue.recordDirectory, `${issue70InstructionId}.json`),
      "utf8",
    ),
  )
  assert.equal(queueRecord.status, "completed")
  assert.equal(queueRecord.resultStatus, "needs_review")
  assert.equal(queueRecord.attempt, 2)
  const events = await store.readEvents()
  assert.equal(
    events.filter((event) => event.type === "queue_completion_reconciled")
      .length,
    1,
  )
  assert.equal((await store.load()).terminalityReconciliations.length, 1)
})

for (const [terminalStatus, issueNumber] of [
  ["needs_review", 63],
  ["failed", 53],
  ["needs_owner", 65],
]) {
  test(`${terminalStatus} tasks fetch and consume a comment continuation exactly once despite an unchanged issue watermark`, async (t) => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), `koalafrog-${terminalStatus}-continuation-`),
    )
    t.after(() => rm(directory, { recursive: true, force: true }))
    const storeOptions = {
      stateDirectory: directory,
      repository: "Sillyquack/koalafrog-hq",
      issueNumber,
    }
    const store = new StateStore(storeOptions)
    const state = await store.load()
    state.status = terminalStatus
    state.lastConsumedInstructionId = `initial-${terminalStatus}`
    state.threadId = `thread-${terminalStatus}`
    state.workspacePath = `/workspaces/${terminalStatus}`
    state.branch = `agent/${terminalStatus}`
    state.task.lastObservedIssueUpdatedAt = "2026-08-21T14:00:00Z"
    state.runs.push({
      instructionId: state.lastConsumedInstructionId,
      status: terminalStatus,
    })
    await store.save(state)

    const continuationId = `continue-${terminalStatus}`
    const issue = {
      number: issueNumber,
      state: "open",
      updated_at: "2026-08-21T14:00:00Z",
      body: controlBlock(state.lastConsumedInstructionId),
    }
    const comments = [
      {
        body: controlBlock(continuationId, {
          action: "continue",
          taskState: terminalStatus,
        }),
      },
    ]
    let detailReads = 0
    const scanner = {
      threadId: "scanner-thread",
      appServer: {
        async callMcpTool(request) {
          detailReads += 1
          if (request.tool === "github.fetch_issue") {
            return { structuredContent: { issue } }
          }
          if (request.tool === "github.fetch_issue_comments") {
            return { structuredContent: { comments } }
          }
          throw new Error(`Unexpected MCP tool: ${request.tool}`)
        },
      },
    }
    let turns = 0
    class ConsumingOrchestrator {
      constructor(_config, { store: taskStore }) {
        this.store = taskStore
      }

      async runOnce({ expectedInstructionId }) {
        turns += 1
        const nextState = await this.store.load()
        assert.equal(nextState.threadId, `thread-${terminalStatus}`)
        assert.equal(nextState.workspacePath, `/workspaces/${terminalStatus}`)
        assert.equal(nextState.branch, `agent/${terminalStatus}`)
        nextState.status = "needs_review"
        nextState.lastConsumedInstructionId = expectedInstructionId
        nextState.runs.push({
          instructionId: expectedInstructionId,
          status: "needs_review",
        })
        await this.store.save(nextState)
        return {
          status: "needs_review",
          instructionId: expectedInstructionId,
        }
      }

      async stop() {}
    }
    const config = {
      repository: storeOptions.repository,
      stateDirectory: directory,
      retryBaseMs: 1,
    }
    const candidate = {
      issueNumber,
      searchMatched: true,
      updatedAt: issue.updated_at,
    }

    const consumed = await runRepositoryIssue(scanner, config, candidate, {
      OrchestratorClass: ConsumingOrchestrator,
    })
    const replay = await runRepositoryIssue(scanner, config, candidate, {
      OrchestratorClass: ConsumingOrchestrator,
    })

    assert.equal(consumed.status, "needs_review")
    assert.equal(consumed.instructionId, continuationId)
    assert.equal(consumed.claimed, true)
    assert.equal(replay.status, "no_pending_agent_control")
    assert.equal(replay.claimed, false)
    assert.equal(turns, 1)
    assert.equal(detailReads, 4)
    const finalState = await store.load()
    assert.equal(finalState.threadId, `thread-${terminalStatus}`)
    assert.equal(finalState.workspacePath, `/workspaces/${terminalStatus}`)
    assert.equal(finalState.branch, `agent/${terminalStatus}`)
    assert.equal(finalState.lastConsumedInstructionId, continuationId)
    assert.equal(
      finalState.runs.filter(
        (run) => run.instructionId === continuationId,
      ).length,
      1,
    )
  })
}
