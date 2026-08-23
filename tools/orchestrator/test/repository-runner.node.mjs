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
  extractAgentControls,
  formatPickupPacket,
  selectNextInstruction,
} from "../src/control-plane.mjs"
import { Orchestrator } from "../src/orchestrator.mjs"
import { QueueClaimStore } from "../src/queue-claim-store.mjs"
import { StateStore } from "../src/state-store.mjs"
import {
  issue63ContinuationControl,
  issue63ExpectedBranch,
  issue63ExecutionControl,
  issue63ExecutionInstructionId,
  issue63ExecutionTask,
  issue63OriginUrl,
  issue63ReconciledBranch,
  issue63ReconciledHead,
  issue63ReconciliationTask,
  issue63ThreadId,
  issue63WorkspacePath,
  prepareIssue63ExecutionState,
  prepareIssue63ReconciliationState,
} from "./fixtures/issue-63-production-day1-git-reconciliation-resume-010.mjs"

function controlBlock(
  instructionId,
  {
    action = "start",
    taskState = "ready",
    prompt = "Make only the bounded orchestrator change.",
  } = {},
) {
  return `\`\`\`yaml
agent_control:
  action: ${action}
  task_state: ${taskState}
  instruction_id: ${instructionId}
  max_turns: 2
  owner_approval_required: false
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

test("live-shaped Issue #63/011 grants once and remains idempotent after repository restart", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-repository-git-execution-011-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const storeOptions = {
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 63,
  }
  const store = new StateStore(storeOptions)
  const [instruction] = extractAgentControls(issue63ExecutionControl)
  const state = prepareIssue63ExecutionState(await store.load(), instruction)
  await store.save(state)

  const task = issue63ExecutionTask()
  task.issue.issue_number = 63
  task.issue.url = issue63OriginUrl
  delete task.issue.number
  delete task.issue.html_url
  let postedCommentId = 1
  const posted = []
  const scanner = {
    threadId: "repository-scanner-thread-011",
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
    instructionId: issue63ExecutionInstructionId,
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
      throw new Error("Issue #63/011 must preserve its Codex thread")
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
      const turnId = "turn-production-day1-git-reconciliation-execution-011"
      const itemId = "item-production-day1-git-011"
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
          "needs_review\n\nThe mocked #63/011 grant path completed without a live Git operation.",
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
      assert.equal(currentInstruction.instructionId, issue63ExecutionInstructionId)
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
  assert.equal(completed.instructionId, issue63ExecutionInstructionId)
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
        `${issue63ExecutionInstructionId}.json`,
      ),
      "utf8",
    ),
  )
  assert.equal(claimRecord.status, "completed")
  assert.equal(claimRecord.attempt, 1)
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
