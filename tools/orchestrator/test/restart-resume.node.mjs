import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { AppServerClient, classifyServerRequest } from "../src/app-server.mjs"
import {
  controlPlaneBindingDigest,
  extractAgentControls,
  ownerGateAcknowledgementId,
  ownerGateReason,
  shouldConsumeInstruction,
} from "../src/control-plane.mjs"
import {
  checkpointOwnerGateAttemptAuditDecision,
  recordPendingApprovalRequest,
} from "../src/approval-decisions.mjs"
import {
  gitReconciliationCheckpointActivationPrompt,
  gitReconciliationCheckpointManagedExecutionPrompt,
  gitReconciliationCheckpointOwnerReason,
  gitReconciliationCheckpointProposalPrompt,
} from "../src/git-execution-boundary.mjs"
import {
  beginInstruction,
  ensureTaskThread,
  Orchestrator,
  recordCompletedTurnResult,
} from "../src/orchestrator.mjs"
import {
  currentStateSchemaVersion,
  StateStore,
  redactForLog,
} from "../src/state-store.mjs"
import { recordInstructionTurnStarted } from "../src/turn-accounting.mjs"
import { issue63CloseoutFinalMessage } from "./fixtures/issue-63-production-day1-review-closeout-004.mjs"
import {
  issue63ContinuationControl,
  issue63ExpectedBranch,
  issue63OriginUrl,
  issue63PriorInstructionId,
  issue63ReconciledBranch,
  issue63ReconciledHead,
  issue63ReconciliationTask,
  issue63ThreadId,
  issue63WorkspacePath,
  prepareIssue63ReconciliationState,
} from "./fixtures/issue-63-production-day1-git-reconciliation-resume-010.mjs"

function controlBlock({
  action = "start",
  instructionId,
  prompt = "Continue the bounded local implementation. Do not deploy.",
  taskState = "ready",
}) {
  return `\`\`\`yaml
agent_control:
  action: ${action}
  task_state: ${taskState}
  instruction_id: ${instructionId}
  max_turns: 3
  owner_approval_required: false
  prompt: |
    ${prompt}
\`\`\``
}

function ownerDecisionBlock({ instructionId, prompt }) {
  return `\`\`\`yaml
agent_control:
  action: continue
  task_state: needs_owner
  instruction_id: ${instructionId}
  max_turns: 3
  owner_approval_required: false
  prompt: |
${prompt
  .split("\n")
  .map((line) => `    ${line}`)
  .join("\n")}
\`\`\``
}

function runtimeConfig(stateDirectory) {
  return {
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 53,
    checkoutPath: "/tmp/coordinating-checkout",
    stateDirectory,
    baseRef: "origin/main",
    pollMs: 15_000,
    maxTurns: 12,
    turnTimeoutMs: 1_000,
    maxRetries: 2,
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
    async ensureWorkspace({ existingPath, instructionId }) {
      return {
        path: existingPath ?? `/tmp/workspace-${instructionId}`,
        branch: `agent/issue-53-${instructionId}`,
      }
    },
    async inspectWorkspace(workspacePath) {
      return {
        branch: `agent/${path.basename(workspacePath)}`,
        commits: [],
        changedFiles: [],
      }
    },
    assertAllowedChanges() {},
    async commitWorkspaceChanges() {},
    async validateWorkspace() {
      return { pass: true, detail: "" }
    },
  }
}

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

test("schema-one Issue #53 state migrates without losing its active thread", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-migration-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new StateStore({
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 53,
  })
  await mkdir(store.directory, { recursive: true })
  await writeFile(
    store.statePath,
    `${JSON.stringify({
      schemaVersion: 1,
      task: {
        repository: "Sillyquack/koalafrog-hq",
        issueNumber: 53,
      },
      status: "running",
      lastConsumedInstructionId: "prior-001",
      activeInstruction: {
        instructionId: "active-002",
        phase: "turn_started",
        attempts: 0,
      },
      threadId: "thread-existing",
      workspacePath: "/tmp/existing-workspace",
      branch: "agent/existing",
      turnCount: 7,
      retryCount: 0,
      pendingOwnerRequest: null,
      runs: [{ instructionId: "prior-001", turnCount: 1 }],
    })}\n`,
  )

  const migrated = await store.load()
  assert.equal(migrated.schemaVersion, currentStateSchemaVersion)
  assert.equal(migrated.task.originIssueNumber, 53)
  assert.equal(migrated.task.originIssueUrl, null)
  assert.equal(migrated.task.lastObservedIssueUpdatedAt, null)
  assert.equal(migrated.task.originIssueClosed, false)
  assert.equal(migrated.threadId, "thread-existing")
  assert.equal(migrated.workspacePath, "/tmp/existing-workspace")
  assert.equal(migrated.activeInstruction.instructionId, "active-002")
  assert.equal(migrated.activeInstruction.turnCount, 1)
  assert.deepEqual(migrated.workspaceBranchReconciliations, [])
  assert.deepEqual(migrated.gitReconciliationCheckpoints, [])
  assert.equal(
    JSON.parse(await readFile(store.statePath, "utf8")).schemaVersion,
    currentStateSchemaVersion,
  )
})

test("retried superseding checkpoint proposal preserves rejected attempts and publishes once across restart", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-checkpoint-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const storeOptions = {
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 63,
  }
  const store = new StateStore(storeOptions)
  const state = await store.load()
  const head = "ec719153c8e726831d7e2b748067383ea7f4e314"
  const tree = "2330f747713ce620c7927c2c505c622b40e18386"
  const cherryPickCommit = "a74079be88ec4a8b36b850f95dca791ff42e4e80"
  const reconciliationId =
    `authorized-workspace-branch:production-day1-git-reconciliation-008:production-day1-git-reconciliation-resume-010:${head}`
  const prompt = gitReconciliationCheckpointProposalPrompt({
    reconciliationId,
    head,
    tree,
    cherryPickCommit,
  })
  const priorProposalInstructionIds = [
    "production-day1-git-reconciliation-checkpoint-proposal-016",
    "production-day1-git-reconciliation-checkpoint-proposal-017",
  ]
  const instructionId =
    "production-day1-git-reconciliation-checkpoint-proposal-018"
  const control = `\`\`\`yaml
agent_control:
  action: continue
  task_state: needs_review
  instruction_id: ${instructionId}
  max_turns: 4
  owner_approval_required: false
  prompt: |
${prompt
  .split("\n")
  .map((line) => `    ${line}`)
  .join("\n")}
\`\`\``
  state.status = "needs_review"
  state.task.originIssueUrl = issue63OriginUrl
  state.threadId = issue63ThreadId
  state.workspacePath = issue63WorkspacePath
  state.branch = issue63ReconciledBranch
  const immutableRuns = [
    { instructionId: "historical-015", immutable: true },
    {
      instructionId: priorProposalInstructionIds[0],
      status: "needs_review",
      turnCount: 0,
      blockers: ["checkpoint_proposal_exception"],
    },
    {
      instructionId: priorProposalInstructionIds[1],
      status: "needs_review",
      turnCount: 0,
      blockers: ["checkpoint_historical_tail_scope"],
    },
  ]
  state.runs.push(...structuredClone(immutableRuns))
  await store.save(state)

  const comments = [{ body: control }]
  const posted = []
  const controlPlane = {
    async fetchTask() {
      return {
        issue: { issue_number: 63, html_url: issue63OriginUrl, body: "" },
        comments,
      }
    },
    async postComment(body) {
      posted.push(body)
      comments.push({ body })
    },
  }
  let proposalCalls = 0
  let turnCalls = 0
  const checkpointRecord = {
    schemaVersion: 1,
    kind: "proposal",
    checkpointId: `git-reconciliation-checkpoint:${"a".repeat(64)}`,
    operationScope: "issue-63-reviewed-integration-branch-cherry-pick",
    proposalInstructionId: instructionId,
    reconciliationId,
    supersededTailInstructionIds: ["historical-015"],
    priorRejectedProposalInstructionIds: priorProposalInstructionIds,
    originIssueNumber: 63,
    originIssueUrl: issue63OriginUrl,
    threadId: issue63ThreadId,
    workspacePath: issue63WorkspacePath,
    branch: issue63ReconciledBranch,
    head,
    tree,
    baseCommit: "b".repeat(40),
    cherryPickCommit,
    changedFilesDigest: "c".repeat(64),
    changedFileCount: 1,
    gitDirectory: "/coordinator/.git/worktrees/issue-63",
    commonDirectory: "/coordinator/.git",
    verification: {
      dirty: false,
      commitsAboveReviewedHead: 0,
      mergeBase: "b".repeat(40),
      operationMarkers: [],
      remoteIntegrationBranch: "absent",
    },
    proposalControl: { instructionId, promptDigest: "d".repeat(64) },
    ownerActivationRequired: true,
    createdAt: "2026-08-23T10:00:00.000Z",
  }
  const workspace = {
    ...fakeWorkspace(),
    async ensureWorkspace() {
      return { path: issue63WorkspacePath, branch: issue63ReconciledBranch }
    },
    async inspectWorkspace() {
      return {
        branch: issue63ReconciledBranch,
        commits: [head],
        changedFiles: ["fixture.txt"],
      }
    },
    async proposeGitReconciliationCheckpoint() {
      proposalCalls += 1
      return {
        accepted: true,
        value: { record: checkpointRecord, isNew: true },
      }
    },
  }
  const appServer = {
    async start() {},
    async stop() {},
    async runTurn() {
      turnCalls += 1
      throw new Error("A proposal must not start a Codex turn")
    },
  }
  const config = { ...runtimeConfig(directory), issueNumber: 63 }
  const first = new Orchestrator(config, {
    appServer,
    controlPlane,
    store,
    workspace,
  })
  const proposed = await first.runOnce()
  assert.equal(proposed.status, "needs_owner")
  assert.equal(proposalCalls, 1)
  assert.equal(turnCalls, 0)
  assert.equal(posted.filter((body) => body.includes("agent_result:")).length, 1)
  assert.equal(posted.some((body) => body.includes("agent_pickup:")), false)

  const persisted = await new StateStore(storeOptions).load()
  assert.equal(persisted.gitReconciliationCheckpoints.length, 1)
  assert.equal(
    persisted.gitReconciliationCheckpoints[0].checkpointId,
    checkpointRecord.checkpointId,
  )
  assert.deepEqual(persisted.runs.slice(0, 3), immutableRuns)
  assert.equal(persisted.runs.at(-1).instructionId, instructionId)
  assert.equal(persisted.runs.at(-1).turnCount, 0)
  assert.equal(
    persisted.runs.at(-1).ownerRequest.method,
    "control-plane/gitReconciliationCheckpointActivation",
  )

  const restarted = new Orchestrator(config, {
    appServer,
    controlPlane,
    store: new StateStore(storeOptions),
    workspace,
  })
  assert.equal((await restarted.runOnce()).status, "idle")
  assert.equal(proposalCalls, 1)
  assert.equal(posted.filter((body) => body.includes("agent_result:")).length, 1)
})

test("generation checkpoint ownerGate acknowledgement resumes one exact activation across restart", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-owner-gate-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const storeOptions = {
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 63,
  }
  const store = new StateStore(storeOptions)
  const state = await store.load()
  const checkpointId =
    "git-reconciliation-checkpoint:04f89ffbfad2119fcc86a21f8e67c886746776476f5f06e3e52d761053da939a"
  const generationId =
    "git-reconciliation-checkpoint-generation:bfcdb83430c84a8d86a605d807d4cbefa0d38ac76490249f8eea67888c90964a"
  const head = "ec719153c8e726831d7e2b748067383ea7f4e314"
  const tree = "2330f747713ce620c7927c2c505c622b40e18386"
  const cherryPickCommit = "a74079be88ec4a8b36b850f95dca791ff42e4e80"
  const proposalInstructionId =
    "production-day1-git-reconciliation-checkpoint-generation-proposal-021"
  const reconciliationId =
    `authorized-workspace-branch:production-day1-git-reconciliation-008:production-day1-git-reconciliation-resume-010:${head}`
  const proposal = {
    schemaVersion: 2,
    kind: "proposal",
    checkpointId,
    generation: 2,
    generationId,
    proposalInstructionId,
    reconciliationId,
    originIssueNumber: 63,
    originIssueUrl: issue63OriginUrl,
    threadId: issue63ThreadId,
    workspacePath: issue63WorkspacePath,
    branch: issue63ReconciledBranch,
    head,
    tree,
    cherryPickCommit,
  }
  const prompt = gitReconciliationCheckpointActivationPrompt({
    checkpointId,
    generation: 2,
    generationId,
    reconciliationId,
    head,
    tree,
    cherryPickCommit,
  })
  const controlFor = ({ instructionId, taskState, acknowledgement = null }) => {
    const control = `\`\`\`yaml
agent_control:
  action: continue
  task_state: ${taskState}
  instruction_id: ${instructionId}
  max_turns: 8
  owner_approval_required: true
  prompt: |
${prompt
  .split("\n")
  .map((line) => `    ${line}`)
  .join("\n")}
\`\`\``
    if (!acknowledgement) return control
    return `${control}

\`\`\`yaml
owner_gate_acknowledgement:
  acknowledgement_id: ${acknowledgement.acknowledgementId}
  instruction_id: ${acknowledgement.instructionId}
  proposal_instruction_id: ${acknowledgement.proposalInstructionId}
  origin_issue_number: ${acknowledgement.originIssueNumber}
  origin_issue_url_digest: ${acknowledgement.originIssueUrlDigest}
  codex_thread_id: ${acknowledgement.codexThreadId}
  workspace_path_digest: ${acknowledgement.workspacePathDigest}
  checkpoint_id: ${acknowledgement.checkpointId}
  generation_id: ${acknowledgement.generationId}
  reconciliation_id: ${acknowledgement.reconciliationId}
  branch: ${acknowledgement.branch}
  head: ${acknowledgement.head}
  tree: ${acknowledgement.tree}
  control_prompt_digest: ${acknowledgement.controlPromptDigest}
  gate_reason_digest: ${acknowledgement.gateReasonDigest}
  pending_reason_digest: ${acknowledgement.pendingReasonDigest}
  prior_gate_audit_digest: ${acknowledgement.priorGateAuditDigest}
\`\`\``
  }
  const gateReason = "The control-plane instruction explicitly requires owner approval."
  const runFor = ({ instructionId, taskState, completedAt }) => ({
    control: controlFor({ instructionId, taskState }),
    run: {
      instructionId,
      status: "needs_owner",
      threadId: issue63ThreadId,
      workspacePath: issue63WorkspacePath,
      branch: issue63ReconciledBranch,
      commits: [],
      changedFiles: [],
      turnCount: 0,
      originIssueNumber: 63,
      originIssueUrl: issue63OriginUrl,
      ownerRequest: { method: "control-plane/ownerGate", reason: gateReason },
      checks: {
        typecheck: "not_run",
        lint: "not_run",
        tests: "not_run",
        cloudflareReadiness: "not_run",
        build: "not_run",
        diffCheck: "not_run",
      },
      blockers: [],
      ownerGates: [gateReason],
      productionReadback: [],
      safetyFindings: [],
      branchPushState: [],
      resultArtifact: null,
      completedAt,
    },
  })
  const attempt025 = runFor({
    instructionId:
      "production-day1-git-reconciliation-checkpoint-generation-activation-025",
    taskState: "needs_review",
    completedAt: "2026-08-23T20:52:38.709Z",
  })
  const attempt024 = runFor({
    instructionId:
      "production-day1-git-reconciliation-checkpoint-generation-activation-024",
    taskState: "needs_owner",
    completedAt: "2026-08-23T20:53:14.959Z",
  })
  const unacknowledgedInstructionId =
    "production-day1-git-reconciliation-checkpoint-generation-activation-unacknowledged-026"
  const comments = [
    { body: attempt025.control },
    { body: attempt024.control },
    {
      body: controlFor({
        instructionId: unacknowledgedInstructionId,
        taskState: "needs_owner",
      }),
    },
  ]
  state.status = "needs_owner"
  state.task.originIssueUrl = issue63OriginUrl
  state.threadId = issue63ThreadId
  state.workspacePath = issue63WorkspacePath
  state.branch = issue63ReconciledBranch
  state.gitReconciliationCheckpoints = [proposal]
  state.runs = [
    {
      instructionId: proposalInstructionId,
      status: "needs_owner",
      completedAt: "2026-08-23T19:41:27.792Z",
    },
    attempt025.run,
    attempt024.run,
  ]
  recordPendingApprovalRequest({
    state,
    instructionId: proposalInstructionId,
    request: {
      method: "control-plane/gitReconciliationCheckpointActivation",
      reason: gitReconciliationCheckpointOwnerReason(proposal),
    },
    now: new Date("2026-08-23T19:41:27.792Z"),
    allowLegacy: true,
  })
  await store.save(state)

  const posted = []
  const controlPlane = {
    async fetchTask() {
      return {
        issue: { issue_number: 63, html_url: issue63OriginUrl, body: "" },
        comments,
      }
    },
    async postComment(body) {
      posted.push(body)
      comments.push({ body })
    },
  }
  let workspaceCalls = 0
  let boundaryCalls = 0
  let turnCalls = 0
  const workspace = {
    ...fakeWorkspace(),
    async ensureWorkspace() {
      workspaceCalls += 1
      return { path: issue63WorkspacePath, branch: issue63ReconciledBranch }
    },
    async inspectWorkspace() {
      return {
        branch: issue63ReconciledBranch,
        commits: [head],
        changedFiles: [],
      }
    },
    async authorizedGitExecutionBoundary({ instruction }) {
      boundaryCalls += 1
      return {
        instructionId: instruction.instructionId,
        threadId: issue63ThreadId,
        workspacePath: issue63WorkspacePath,
        branch: issue63ReconciledBranch,
        head,
        gitDirectory: "/coordinator/.git/worktrees/issue-63",
        commonDirectory: "/coordinator/.git",
        writablePaths: [
          issue63WorkspacePath,
          "/coordinator/.git/worktrees/issue-63",
        ],
        commands: {
          cherry_pick: [`git cherry-pick ${cherryPickCommit}`],
          validation: ["git diff --check"],
          push: ["git push origin HEAD"],
          pull_request: ["gh pr create"],
        },
        checkpointId,
        checkpointActivationIsNew: true,
        checkpointActivation: {
          schemaVersion: 2,
          kind: "activation",
          checkpointId,
          generation: 2,
          generationId,
          activationInstructionId: instruction.instructionId,
          activatedAt: null,
        },
      }
    },
  }
  const appServer = {
    async start() {},
    async stop() {},
    async resumeThread(threadId) {
      assert.equal(threadId, issue63ThreadId)
      return { thread: { id: threadId } }
    },
    async waitForMcpReady() {},
    async runTurn(options) {
      turnCalls += 1
      await options.onTurnStarted("turn-owner-gate-acknowledged")
      return {
        status: "completed",
        turn: {
          id: "turn-owner-gate-acknowledged",
          status: "completed",
          items: [],
        },
        pendingOwnerRequest: null,
        agentMessage: "needs_review; no mutation executed by this fixture",
      }
    },
  }
  const config = { ...runtimeConfig(directory), issueNumber: 63 }
  const beforeAck = new Orchestrator(config, {
    appServer,
    controlPlane,
    store,
    workspace,
  })
  assert.equal((await beforeAck.runOnce()).status, "needs_owner")
  assert.equal(workspaceCalls, 0)
  assert.equal(boundaryCalls, 0)
  assert.equal(turnCalls, 0)

  const afterGate = await new StateStore(storeOptions).load()
  assert.deepEqual(
    afterGate.runs.slice(0, 3).map((run) => run.instructionId),
    [proposalInstructionId, attempt025.run.instructionId, attempt024.run.instructionId],
  )
  const acknowledgedInstructionId =
    "production-day1-git-reconciliation-checkpoint-generation-activation-owner-ack-027"
  const controlBody = controlFor({
    instructionId: acknowledgedInstructionId,
    taskState: "needs_owner",
  })
  const [instruction] = extractAgentControls(controlBody)
  const auditTask = {
    issue: { issue_number: 63, html_url: issue63OriginUrl, body: "" },
    comments: [...comments, { body: controlBody }],
  }
  const audit = checkpointOwnerGateAttemptAuditDecision({
    state: afterGate,
    task: auditTask,
    proposal,
    activationPrompt: prompt,
    gateReason: ownerGateReason(instruction),
  })
  assert.equal(audit.accepted, true, JSON.stringify(audit))
  const acknowledgement = {
    instructionId: acknowledgedInstructionId,
    proposalInstructionId,
    originIssueNumber: 63,
    originIssueUrlDigest: controlPlaneBindingDigest(issue63OriginUrl),
    codexThreadId: issue63ThreadId,
    workspacePathDigest: controlPlaneBindingDigest(issue63WorkspacePath),
    checkpointId,
    generationId,
    reconciliationId,
    branch: issue63ReconciledBranch,
    head,
    tree,
    controlPromptDigest: controlPlaneBindingDigest(prompt),
    gateReasonDigest: controlPlaneBindingDigest(ownerGateReason(instruction)),
    pendingReasonDigest: controlPlaneBindingDigest(
      gitReconciliationCheckpointOwnerReason(proposal),
    ),
    priorGateAuditDigest: audit.value.digest,
  }
  acknowledgement.acknowledgementId =
    ownerGateAcknowledgementId(acknowledgement)
  comments.push({
    body: controlFor({
      instructionId: acknowledgedInstructionId,
      taskState: "needs_owner",
      acknowledgement,
    }),
  })

  const resumed = new Orchestrator(config, {
    appServer,
    controlPlane,
    store: new StateStore(storeOptions),
    workspace,
  })
  assert.equal((await resumed.runOnce()).status, "needs_review")
  assert.equal(workspaceCalls, 1)
  assert.equal(boundaryCalls, 1)
  assert.equal(turnCalls, 1)
  const completed = await new StateStore(storeOptions).load()
  assert.equal(completed.ownerGateAcknowledgements.length, 1)
  assert.equal(completed.ownerGateAcknowledgements[0].outcome, "needs_review")
  assert.ok(completed.ownerGateAcknowledgements[0].completedAt)
  assert.equal(completed.pendingApprovalRequests[0].status, "completed")
  assert.equal(completed.gitReconciliationCheckpoints.length, 2)
  assert.deepEqual(
    completed.runs.slice(0, 3).map((run) => run.instructionId),
    [proposalInstructionId, attempt025.run.instructionId, attempt024.run.instructionId],
  )
  assert.equal((await resumed.runOnce()).status, "idle")
  assert.equal(turnCalls, 1)
})

test("managed checkpoint execution persists intent and receipt once without a Codex turn across restart", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-managed-execution-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const storeOptions = {
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 63,
  }
  const store = new StateStore(storeOptions)
  const state = await store.load()
  const checkpointId = `git-reconciliation-checkpoint:${"a".repeat(64)}`
  const generationId =
    `git-reconciliation-checkpoint-generation:${"b".repeat(64)}`
  const reconciliationId =
    `authorized-workspace-branch:production-day1-git-reconciliation-008:production-day1-git-reconciliation-resume-010:${issue63ReconciledHead}`
  const tree = "2330f747713ce620c7927c2c505c622b40e18386"
  const cherryPickCommit = "a74079be88ec4a8b36b850f95dca791ff42e4e80"
  const postHead = "d".repeat(40)
  const prompt = gitReconciliationCheckpointManagedExecutionPrompt({
    checkpointId,
    generationId,
    reconciliationId,
    head: issue63ReconciledHead,
    tree,
    cherryPickCommit,
  })
  const instructionId =
    "production-day1-git-reconciliation-checkpoint-generation-execution-024"
  const control = controlBlock({
    action: "continue",
    instructionId,
    prompt,
    taskState: "needs_review",
  })
  state.status = "needs_review"
  state.task.originIssueUrl = issue63OriginUrl
  state.threadId = issue63ThreadId
  state.workspacePath = issue63WorkspacePath
  state.branch = issue63ReconciledBranch
  state.gitReconciliationCheckpoints = [{ kind: "proposal", checkpointId }]
  await store.save(state)

  const comments = [{ body: control }]
  const posted = []
  const controlPlane = {
    async fetchTask() {
      return {
        issue: { issue_number: 63, html_url: issue63OriginUrl, body: "" },
        comments,
      }
    },
    async postComment(body) {
      posted.push(body)
      comments.push({ body })
    },
  }
  const intent = {
    kind: "execution_intent",
    executionId: `git-reconciliation-checkpoint-execution:${"c".repeat(64)}`,
    checkpointId,
    generation: 2,
    generationId,
    head: issue63ReconciledHead,
  }
  const receipt = {
    kind: "execution_receipt",
    receiptId:
      `git-reconciliation-checkpoint-execution-receipt:${"e".repeat(64)}`,
    executionId: intent.executionId,
    checkpointId,
    generation: 2,
    generationId,
    parentHead: issue63ReconciledHead,
    head: postHead,
  }
  let executeCalls = 0
  let turnCalls = 0
  const workspace = {
    ...fakeWorkspace(),
    async ensureWorkspace() {
      return { path: issue63WorkspacePath, branch: issue63ReconciledBranch }
    },
    async inspectWorkspace() {
      return {
        branch: issue63ReconciledBranch,
        commits: executeCalls ? [postHead] : [issue63ReconciledHead],
        changedFiles: ["fixture.txt"],
      }
    },
    async prepareGitReconciliationCheckpointExecution({ state }) {
      const persistedIntent = state.gitReconciliationCheckpoints.find(
        (record) => record.kind === "execution_intent",
      )
      const persistedReceipt = state.gitReconciliationCheckpoints.find(
        (record) => record.kind === "execution_receipt",
      )
      if (persistedReceipt) {
        return {
          accepted: true,
          value: {
            mode: "complete",
            record: persistedIntent,
            receipt: persistedReceipt,
            isNewIntent: false,
            isNewReceipt: false,
          },
        }
      }
      if (persistedIntent && executeCalls) {
        return {
          accepted: true,
          value: {
            mode: "recover",
            record: persistedIntent,
            receipt,
            isNewIntent: false,
            isNewReceipt: true,
          },
        }
      }
      return {
        accepted: true,
        value: {
          mode: "execute",
          record: persistedIntent ?? intent,
          isNewIntent: !persistedIntent,
        },
      }
    },
    async executeGitReconciliationCheckpointMutation() {
      executeCalls += 1
      return { accepted: true, value: { executionId: intent.executionId } }
    },
  }
  const appServer = {
    async start() {},
    async stop() {},
    async runTurn() {
      turnCalls += 1
      throw new Error("Managed execution must not start a Codex turn")
    },
  }
  const config = { ...runtimeConfig(directory), issueNumber: 63 }
  const first = new Orchestrator(config, {
    appServer,
    controlPlane,
    store,
    workspace,
  })
  const completed = await first.runOnce()
  assert.equal(completed.status, "needs_review")
  assert.equal(executeCalls, 1)
  assert.equal(turnCalls, 0)
  assert.equal(posted.filter((body) => body.includes("agent_result:")).length, 1)
  assert.equal(posted.some((body) => body.includes("agent_pickup:")), false)

  const persisted = await new StateStore(storeOptions).load()
  assert.equal(
    persisted.gitReconciliationCheckpoints.filter(
      (record) => record.kind === "execution_intent",
    ).length,
    1,
  )
  assert.equal(
    persisted.gitReconciliationCheckpoints.filter(
      (record) => record.kind === "execution_receipt",
    ).length,
    1,
  )
  assert.equal(persisted.runs.at(-1).turnCount, 0)
  assert.equal(persisted.runs.at(-1).commits[0], postHead)
  assert.equal(persisted.runs.at(-1).checks.diffCheck, "pass")

  const restarted = new Orchestrator(config, {
    appServer,
    controlPlane,
    store: new StateStore(storeOptions),
    workspace,
  })
  assert.equal((await restarted.runOnce()).status, "idle")
  assert.equal(executeCalls, 1)
  assert.equal(posted.filter((body) => body.includes("agent_result:")).length, 1)
})

test("proposal exception consumption emits one redacted stage event without a checkpoint or turn", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-checkpoint-exception-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const storeOptions = {
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 63,
  }
  const store = new StateStore(storeOptions)
  const state = await store.load()
  const head = "ec719153c8e726831d7e2b748067383ea7f4e314"
  const tree = "2330f747713ce620c7927c2c505c622b40e18386"
  const cherryPickCommit = "a74079be88ec4a8b36b850f95dca791ff42e4e80"
  const reconciliationId =
    `authorized-workspace-branch:production-day1-git-reconciliation-008:production-day1-git-reconciliation-resume-010:${head}`
  const prompt = gitReconciliationCheckpointProposalPrompt({
    reconciliationId,
    head,
    tree,
    cherryPickCommit,
  })
  const instructionId =
    "production-day1-git-reconciliation-checkpoint-proposal-diagnostic-017"
  const control = `\`\`\`yaml
agent_control:
  action: continue
  task_state: needs_review
  instruction_id: ${instructionId}
  max_turns: 4
  owner_approval_required: false
  prompt: |
${prompt
  .split("\n")
  .map((line) => `    ${line}`)
  .join("\n")}
\`\`\``
  state.status = "needs_review"
  state.task.originIssueUrl = issue63OriginUrl
  state.threadId = issue63ThreadId
  state.workspacePath = issue63WorkspacePath
  state.branch = issue63ReconciledBranch
  state.runs.push({ instructionId: "historical-015", immutable: true })
  await store.save(state)

  const comments = [{ body: control }]
  const posted = []
  const controlPlane = {
    async fetchTask() {
      return {
        issue: { issue_number: 63, html_url: issue63OriginUrl, body: "" },
        comments,
      }
    },
    async postComment(body) {
      posted.push(body)
      comments.push({ body })
    },
  }
  let proposalCalls = 0
  let boundaryCalls = 0
  let turnCalls = 0
  const workspace = {
    ...fakeWorkspace(),
    async ensureWorkspace() {
      return { path: issue63WorkspacePath, branch: issue63ReconciledBranch }
    },
    async inspectWorkspace() {
      return {
        branch: issue63ReconciledBranch,
        commits: [head],
        changedFiles: ["fixture.txt"],
      }
    },
    async proposeGitReconciliationCheckpoint(input) {
      proposalCalls += 1
      const diagnostic = {
        code: "checkpoint_proposal_exception",
        stage: "pull_request_lookup",
        reason: "executable_missing",
        errorCode: "ENOENT",
        secret: "credential-secret-value",
        path: "/sensitive/coordinating/repository",
      }
      input.onDiagnostic(diagnostic)
      return { accepted: false, value: null, rejection: diagnostic }
    },
    async authorizedGitExecutionBoundary() {
      boundaryCalls += 1
      return null
    },
  }
  const appServer = {
    async start() {},
    async stop() {},
    async runTurn() {
      turnCalls += 1
      throw new Error("A rejected proposal must not start a Codex turn")
    },
  }
  const config = { ...runtimeConfig(directory), issueNumber: 63 }
  const orchestrator = new Orchestrator(config, {
    appServer,
    controlPlane,
    store,
    workspace,
  })

  const rejected = await orchestrator.runOnce()
  assert.equal(rejected.status, "needs_review")
  assert.equal(proposalCalls, 1)
  assert.equal(boundaryCalls, 0)
  assert.equal(turnCalls, 0)
  assert.equal(posted.filter((body) => body.includes("agent_result:")).length, 1)
  assert.equal(posted.some((body) => body.includes("agent_pickup:")), false)

  const persisted = await new StateStore(storeOptions).load()
  assert.deepEqual(persisted.gitReconciliationCheckpoints, [])
  assert.deepEqual(persisted.runs[0], {
    instructionId: "historical-015",
    immutable: true,
  })
  assert.equal(persisted.runs.at(-1).instructionId, instructionId)
  assert.equal(persisted.runs.at(-1).turnCount, 0)
  assert.equal(persisted.lastConsumedInstructionId, instructionId)

  const events = await readFile(store.eventPath, "utf8")
  const event = events
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .find((entry) => entry.type === "git_reconciliation_checkpoint_rejected")
  assert.deepEqual(
    {
      type: event.type,
      code: event.code,
      stage: event.stage,
      reason: event.reason,
      errorCode: event.errorCode,
      instructionId: event.instructionId,
      issueNumber: event.issueNumber,
      branch: event.branch,
    },
    {
      type: "git_reconciliation_checkpoint_rejected",
      code: "checkpoint_proposal_exception",
      stage: "pull_request_lookup",
      reason: "executable_missing",
      errorCode: "ENOENT",
      instructionId,
      issueNumber: 63,
      branch: issue63ReconciledBranch,
    },
  )
  assert.doesNotMatch(events, /credential-secret-value|sensitive\/coordinating/)
  assert.equal((await orchestrator.runOnce()).status, "idle")
  assert.equal(proposalCalls, 1)
  assert.equal(posted.filter((body) => body.includes("agent_result:")).length, 1)
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
    activeInstruction: { instructionId: "proof-002", phase: "selected" },
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
})

test("a fresh start instruction receives a new thread and workspace context", () => {
  const state = {
    threadId: "thread-old",
    workspacePath: "/tmp/workspace-old",
    branch: "agent/old",
    turnCount: 9,
    retryCount: 1,
    pendingOwnerRequest: { reason: "old request" },
    activeInstruction: null,
    runs: [],
  }
  beginInstruction(
    state,
    {
      action: "start",
      instructionId: "fresh-001",
      maxTurns: 3,
    },
    new Date("2026-08-17T10:00:00Z"),
  )
  assert.equal(state.threadId, null)
  assert.equal(state.workspacePath, null)
  assert.equal(state.branch, null)
  assert.equal(state.pendingOwnerRequest, null)
  assert.equal(state.turnCount, 9)
  assert.equal(state.activeInstruction.turnCount, 0)
})

test("polling continues after needs_owner and a fresh continue reuses the thread", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-follow-up-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const firstControl = controlBlock({ instructionId: "owner-stop-001" })
  const followUpControl = controlBlock({
    action: "continue",
    instructionId: "owner-follow-up-002",
    taskState: "needs_owner",
  })
  let fetchCount = 0
  const posted = []
  const controlPlane = {
    async fetchTask() {
      fetchCount += 1
      return {
        issue: { body: "" },
        comments:
          fetchCount === 1
            ? [{ body: firstControl }]
            : [{ body: firstControl }, { body: followUpControl }],
      }
    },
    async postComment(comment) {
      posted.push(comment)
    },
    async updateComment() {
      throw new Error("Unexpected result correction")
    },
  }
  let turnCount = 0
  let threadStarts = 0
  let threadResumes = 0
  const appServer = {
    async start() {},
    async startThread() {
      threadStarts += 1
      return { thread: { id: "thread-persisted" } }
    },
    async resumeThread(threadId) {
      threadResumes += 1
      return { thread: { id: threadId } }
    },
    async waitForMcpReady() {},
    async runTurn({ onTurnStarted, onOwnerStop }) {
      turnCount += 1
      await onTurnStarted(`turn-${turnCount}`)
      if (turnCount === 1) {
        const ownerRequest = {
          method: "item/tool/requestUserInput",
          reason: "Owner must approve the bounded follow-up.",
        }
        await onOwnerStop(ownerRequest)
        return {
          status: "needs_owner",
          turn: { id: "turn-1", status: "interrupted" },
          pendingOwnerRequest: ownerRequest,
        }
      }
      return {
        status: "completed",
        turn: { id: "turn-2", status: "completed" },
        pendingOwnerRequest: null,
      }
    },
    async stop() {},
  }
  const store = new StateStore({
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 53,
  })
  const orchestrator = new Orchestrator(runtimeConfig(directory), {
    appServer,
    controlPlane,
    store,
    workspace: fakeWorkspace(),
  })

  const ownerStop = await orchestrator.runOnce()
  assert.equal(ownerStop.status, "needs_owner")
  const continued = await orchestrator.runOnce()
  assert.equal(continued.status, "needs_review")
  assert.equal(continued.instructionId, "owner-follow-up-002")
  assert.equal(threadStarts, 1)
  assert.equal(threadResumes, 1)
  assert.equal(posted.length, 4)
  assert.equal(posted.filter((body) => body.includes("agent_pickup:")).length, 2)
  assert.equal(posted.filter((body) => body.includes("agent_result:")).length, 2)
  for (const result of posted.filter((body) => body.includes("agent_result:"))) {
    assert.match(result, /typecheck: unknown/)
    assert.doesNotMatch(result, /not_run/)
  }
  const state = await store.load()
  assert.equal(state.threadId, "thread-persisted")
  assert.equal(state.lastConsumedInstructionId, "owner-follow-up-002")
  assert.deepEqual(
    state.runs.map((run) => run.status),
    ["needs_owner", "needs_review"],
  )
})

test("an interrupted approval restarts one same-thread continuation and consumes its decision once", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-interrupted-approval-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const storeOptions = {
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 53,
  }
  const originalControl = controlBlock({
    instructionId: "approval-origin-001",
    prompt: "Prepare only the reviewed local orchestrator approval recovery.",
  })
  const pendingReason =
    "Create the authorized Issue #53 commit from only the already-staged reviewed orchestrator approval-recovery files."
  const comments = []
  const controlPlane = {
    async fetchTask() {
      return { issue: { body: originalControl }, comments }
    },
    async postComment(body) {
      comments.push({ body })
    },
  }
  const turnIds = []
  const firstAppServer = {
    async start() {},
    async stop() {},
    async startThread() {
      return { thread: { id: "thread-interrupted-approval" } }
    },
    async waitForMcpReady() {},
    async runTurn(options) {
      turnIds.push("turn-waiting-on-approval")
      await options.onTurnStarted("turn-waiting-on-approval")
      const ownerRequest = {
        requestId: 12,
        method: "item/commandExecution/requestApproval",
        threadId: "thread-interrupted-approval",
        turnId: "turn-waiting-on-approval",
        itemId: "exec-dead-request",
        reason: pendingReason,
      }
      await options.onOwnerStop(ownerRequest)
      return {
        status: "needs_owner",
        turn: {
          id: "turn-waiting-on-approval",
          status: "interrupted",
          items: [],
        },
        pendingOwnerRequest: ownerRequest,
        agentMessage: "",
      }
    },
  }
  const first = new Orchestrator(runtimeConfig(directory), {
    store: new StateStore(storeOptions),
    appServer: firstAppServer,
    controlPlane,
    workspace: fakeWorkspace(),
  })
  const ownerStop = await first.runOnce()
  assert.equal(ownerStop.status, "needs_owner")
  const interrupted = await new StateStore(storeOptions).load()
  assert.equal(interrupted.pendingApprovalRequests.length, 1)
  assert.equal(
    interrupted.pendingApprovalRequests[0].requestIdentities[0].itemId,
    "exec-dead-request",
  )

  comments.push({
    body: ownerDecisionBlock({
      instructionId: "approval-continuation-002",
      prompt: `Resume the same thread and worktree.

Owner approval is granted to create exactly one commit from only the already-staged, reviewed orchestrator approval-recovery files identified in the immediately preceding needs_owner result.`,
    }),
  })
  let approvedActions = 0
  const secondAppServer = {
    async start() {},
    async stop() {},
    async resumeThread(threadId) {
      assert.equal(threadId, "thread-interrupted-approval")
      return { thread: { id: threadId } }
    },
    async waitForMcpReady() {},
    async runTurn(options) {
      turnIds.push("turn-fresh-continuation")
      await options.onTurnStarted("turn-fresh-continuation")
      const retryRequest = {
        requestId: 13,
        method: "item/commandExecution/requestApproval",
        threadId: "thread-interrupted-approval",
        turnId: "turn-fresh-continuation",
        itemId: "exec-fresh-retry",
        reason: pendingReason,
      }
      const resolution = await options.resolveApprovalRequest(retryRequest)
      assert.deepEqual(resolution.response, { decision: "accept" })
      assert.equal(resolution.decisionId, "approval-continuation-002")
      approvedActions += 1
      await options.onApprovedActionCompleted({
        decisionId: resolution.decisionId,
        ownerRequest: retryRequest,
        item: { id: retryRequest.itemId, status: "completed", exitCode: 0 },
        succeeded: true,
      })
      return {
        status: "completed",
        turn: { id: "turn-fresh-continuation", status: "completed", items: [] },
        pendingOwnerRequest: null,
        agentMessage: "",
      }
    },
  }
  const restarted = new Orchestrator(runtimeConfig(directory), {
    store: new StateStore(storeOptions),
    appServer: secondAppServer,
    controlPlane,
    workspace: fakeWorkspace(),
  })
  const completed = await restarted.runOnce()
  assert.equal(completed.status, "needs_review")
  assert.deepEqual(turnIds, [
    "turn-waiting-on-approval",
    "turn-fresh-continuation",
  ])
  assert.equal(approvedActions, 1)

  const afterRestart = await new StateStore(storeOptions).load()
  assert.equal(afterRestart.threadId, "thread-interrupted-approval")
  assert.ok(afterRestart.ownerApprovalDecisions[0].consumedAt)
  assert.ok(afterRestart.ownerApprovalDecisions[0].completedAt)
  assert.equal(afterRestart.pendingApprovalRequests[0].status, "completed")
  assert.ok(afterRestart.pendingApprovalRequests[0].clearedAt)
  assert.equal(afterRestart.pendingOwnerRequest, null)

  const replay = await restarted.runOnce()
  assert.equal(replay.status, "idle")
  assert.equal(approvedActions, 1)
  const events = await readFile(
    path.join(
      directory,
      "Sillyquack-koalafrog-hq-issue-53",
      "events.jsonl",
    ),
    "utf8",
  )
  assert.match(events, /owner_approval_retry_turn_started/)
  assert.match(events, /owner_approval_decision_consumed/)
  assert.match(events, /owner_approved_action_completed/)
})

test("restart finalizes a completed persisted turn without starting a duplicate", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-recovery-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const block = controlBlock({ instructionId: "recovery-001" })
  const [instruction] = extractAgentControls(block)
  const store = new StateStore({
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 53,
  })
  const state = await store.load()
  beginInstruction(state, instruction)
  state.threadId = "thread-before-crash"
  state.workspacePath = "/tmp/workspace-before-crash"
  state.branch = "agent/recovery-001"
  recordInstructionTurnStarted(state, { turnId: "turn-before-crash", attempt: 0 })
  await store.save(state)

  let runTurnCalls = 0
  let resumeCalls = 0
  const appServer = {
    async start() {},
    async resumeThread(threadId) {
      resumeCalls += 1
      return { thread: { id: threadId } }
    },
    async startThread() {
      throw new Error("Restart must not create a replacement thread")
    },
    async waitForMcpReady() {},
    async readThread() {
      return {
        thread: {
          turns: [
            {
              id: "turn-before-crash",
              status: "completed",
              items: [
                {
                  id: "message-before-crash",
                  type: "agentMessage",
                  text: "Typecheck: passed\nESLint: passed\nTests: passed\nBuild: passed",
                },
              ],
            },
          ],
        },
      }
    },
    async runTurn() {
      runTurnCalls += 1
      throw new Error("Completed recovery turn must not be replayed")
    },
    async stop() {},
  }
  const posted = []
  const controlPlane = {
    async fetchTask() {
      return { issue: { body: "" }, comments: [{ body: block }] }
    },
    async postComment(comment) {
      posted.push(comment)
    },
  }
  const restarted = new Orchestrator(runtimeConfig(directory), {
    appServer,
    controlPlane,
    store,
    workspace: fakeWorkspace(),
  })
  const result = await restarted.runOnce()
  assert.equal(result.status, "needs_review")
  assert.equal(resumeCalls, 1)
  assert.equal(runTurnCalls, 0)
  assert.equal(posted.length, 2)
  assert.equal(posted.filter((body) => body.includes("agent_pickup:")).length, 1)
  assert.equal(posted.filter((body) => body.includes("agent_result:")).length, 1)
  assert.match(posted.find((body) => body.includes("agent_result:")), /typecheck: pass/)
  assert.match(posted.find((body) => body.includes("agent_result:")), /lint: pass/)
  assert.match(posted.find((body) => body.includes("agent_result:")), /tests: pass/)
  assert.match(posted.find((body) => body.includes("agent_result:")), /build: pass/)
  const recoveredState = await store.load()
  assert.equal(recoveredState.threadId, "thread-before-crash")
  assert.equal(recoveredState.activeInstruction, null)
  assert.equal(recoveredState.runs[0].turnCount, 1)
})

test("Issue #63/004 final artifact survives restart and publishes exactly once", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-result-recovery-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const instructionId = "production-day1-review-closeout-004"
  const block = controlBlock({
    action: "continue",
    instructionId,
    taskState: "needs_review",
  })
  const [instruction] = extractAgentControls(block)
  const storeOptions = {
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 63,
  }
  const store = new StateStore(storeOptions)
  const state = await store.load()
  state.status = "needs_review"
  state.task.originIssueUrl = "https://github.com/Sillyquack/koalafrog-hq/issues/63"
  beginInstruction(state, instruction)
  state.threadId = "01a0243c-dcdf-7121-a02d-0aaba354c2dd"
  state.workspacePath = "/workspaces/issue-63-production-day1-stock-equipment-001"
  state.branch = "agent/issue-63-production-day1-stock-equipment-001"
  recordInstructionTurnStarted(state, {
    turnId: "turn-production-day1-review-closeout-004",
    attempt: 0,
  })
  recordCompletedTurnResult(
    state,
    {
      status: "completed",
      turn: {
        id: "turn-production-day1-review-closeout-004",
        status: "completed",
        items: [],
      },
      pendingOwnerRequest: null,
      agentMessage: issue63CloseoutFinalMessage,
    },
    "2026-08-21T17:58:00.000Z",
  )
  await store.save(state)

  let runTurnCalls = 0
  let readThreadCalls = 0
  const appServer = {
    async start() {},
    async resumeThread(threadId) {
      return { thread: { id: threadId } }
    },
    async waitForMcpReady() {},
    async readThread() {
      readThreadCalls += 1
      throw new Error("A durable completed-turn artifact must avoid thread recovery")
    },
    async runTurn() {
      runTurnCalls += 1
      throw new Error("A durable completed-turn artifact must not be replayed")
    },
    async stop() {},
  }
  const comments = [{ body: block }]
  const posted = []
  const controlPlane = {
    async fetchTask() {
      return {
        issue: {
          body: "",
          html_url: "https://github.com/Sillyquack/koalafrog-hq/issues/63",
        },
        comments,
      }
    },
    async postComment(body) {
      posted.push(body)
      comments.push({ body })
    },
  }
  const workspace = {
    ...fakeWorkspace(),
    async inspectWorkspace() {
      return {
        branch: "agent/issue-63-production-day1-stock-equipment-001",
        commits: [
          "a74079be88ec4a8b36b850f95dca791ff42e4e80",
          "a920e5811646e33081ad698609b0c13ce026c9af",
        ],
        changedFiles: ["src/features/formulas/domain/equipmentRequirements.ts"],
      }
    },
  }
  const config = { ...runtimeConfig(directory), issueNumber: 63 }
  const restarted = new Orchestrator(config, {
    appServer,
    controlPlane,
    store: new StateStore(storeOptions),
    workspace,
  })

  const completed = await restarted.runOnce()
  const replay = await restarted.runOnce()

  assert.equal(completed.status, "needs_review")
  assert.equal(replay.status, "idle")
  assert.equal(runTurnCalls, 0)
  assert.equal(readThreadCalls, 0)
  assert.equal(posted.filter((body) => body.includes("agent_result:")).length, 1)
  const result = posted.find((body) => body.includes("agent_result:"))
  assert.match(result, /typecheck: pass/)
  assert.match(result, /lint: pass/)
  assert.match(result, /tests: pass/)
  assert.match(result, /cloudflare_readiness: pass/)
  assert.match(result, /build: pass/)
  assert.match(result, /diff_check: pass/)
  assert.doesNotMatch(result, /not_run/)
  assert.match(result, /Supabase migration remains unapplied/)
  assert.match(result, /all four Aromantic receipts/)
  assert.match(result, /no old or overlapping command execution/)
  assert.match(result, /pushed normally/)
  assert.doesNotMatch(result, /ghp_123456789/)

  const persisted = await new StateStore(storeOptions).load()
  assert.equal(persisted.runs.length, 1)
  assert.equal(persisted.runs[0].instructionId, instructionId)
  assert.equal(persisted.runs[0].checks.typecheck, "pass")
  assert.match(
    persisted.runs[0].resultArtifact.finalMessage,
    /1,049 passed, 66 skipped/,
  )
  assert.ok(
    persisted.runs[0].resultArtifact.findings.blockers.some((line) =>
      /unapplied/.test(line),
    ),
  )
  assert.doesNotMatch(
    persisted.runs[0].resultArtifact.finalMessage,
    /ghp_123456789/,
  )
})

test("a persisted result packet cannot be published to a different origin", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-result-origin-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const block = controlBlock({ instructionId: "origin-bound-result-001" })
  const [instruction] = extractAgentControls(block)
  const store = new StateStore({
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 53,
  })
  const state = await store.load()
  beginInstruction(state, instruction)
  state.activeInstruction.phase = "result_pending"
  state.activeInstruction.packet = {
    instructionId: instruction.instructionId,
    originIssueNumber: 64,
    originIssueUrl: "https://github.com/Sillyquack/koalafrog-hq/issues/64",
    codexThreadId: "thread-origin",
    status: "needs_review",
    branch: "agent/origin",
    commits: [],
    changedFiles: [],
    checks: {},
    ownerQuestion: null,
    ownerRequest: null,
  }
  await store.save(state)

  let posts = 0
  const orchestrator = new Orchestrator(runtimeConfig(directory), {
    store,
    appServer: {
      async start() {},
      async stop() {},
    },
    controlPlane: {
      async fetchTask() {
        return {
          issue: {
            body: block,
            html_url: "https://github.com/Sillyquack/koalafrog-hq/issues/53",
          },
          comments: [],
        }
      },
      async postComment() {
        posts += 1
      },
    },
    workspace: fakeWorkspace(),
  })

  await assert.rejects(
    orchestrator.runOnce(),
    /outside its persisted origin/,
  )
  assert.equal(posts, 0)
  assert.equal((await store.load()).activeInstruction.phase, "result_pending")
})

test("restart defers a still-running persisted turn instead of starting a duplicate", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-live-turn-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const block = controlBlock({ instructionId: "live-recovery-001" })
  const [instruction] = extractAgentControls(block)
  const store = new StateStore({
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 53,
  })
  const state = await store.load()
  beginInstruction(state, instruction)
  state.threadId = "thread-live"
  state.workspacePath = "/tmp/workspace-live"
  state.branch = "agent/live-recovery-001"
  recordInstructionTurnStarted(state, { turnId: "turn-live", attempt: 0 })
  await store.save(state)

  let runTurnCalls = 0
  const appServer = {
    async start() {},
    async resumeThread(threadId) {
      return { thread: { id: threadId } }
    },
    async waitForMcpReady() {},
    async readThread() {
      return {
        thread: { turns: [{ id: "turn-live", status: "inProgress" }] },
      }
    },
    async runTurn() {
      runTurnCalls += 1
      throw new Error("A live recovery turn must not be duplicated")
    },
    async stop() {},
  }
  const posted = []
  const orchestrator = new Orchestrator(
    { ...runtimeConfig(directory), turnTimeoutMs: 60_000 },
    {
      appServer,
      controlPlane: {
        async fetchTask() {
          return { issue: { body: "" }, comments: [{ body: block }] }
        },
        async postComment(comment) {
          posted.push(comment)
        },
      },
      store,
      workspace: fakeWorkspace(),
    },
  )

  const result = await orchestrator.runOnce()
  assert.equal(result.status, "claim_deferred")
  assert.equal(runTurnCalls, 0)
  assert.equal(posted.filter((body) => body.includes("agent_pickup:")).length, 1)
  const deferred = await store.load()
  assert.equal(deferred.activeInstruction.phase, "turn_started")
  assert.equal(deferred.activeInstruction.turnId, "turn-live")
  assert.equal(deferred.activeInstruction.turnCount, 1)
})

test("a timeout retry starts only after the interrupted turn command is terminal", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-retry-isolation-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const block = controlBlock({ instructionId: "retry-isolation-001" })
  const comments = []
  const appServer = new AppServerClient({
    cwd: "/tmp",
    turnTerminationTimeoutMs: 2_000,
  })
  let activeCommand = false
  let interruptRequests = 0
  let turnStarts = 0
  appServer.start = async () => {}
  appServer.stop = async () => {}
  appServer.startThread = async () => ({ thread: { id: "thread-retry-isolation" } })
  appServer.waitForMcpReady = async () => {}
  appServer.request = async (method) => {
    if (method === "turn/start") {
      turnStarts += 1
      const turnId = `turn-retry-${turnStarts}`
      if (turnStarts === 1) {
        activeCommand = true
        appServer.emit("item/started", {
          threadId: "thread-retry-isolation",
          turnId,
          item: {
            id: "command-retry-1",
            type: "commandExecution",
            status: "inProgress",
          },
        })
      } else {
        assert.equal(
          activeCommand,
          false,
          "retry turn overlapped the interrupted turn command",
        )
        setTimeout(
          () =>
            appServer.emit("turn/completed", {
              threadId: "thread-retry-isolation",
              turn: { id: turnId, status: "completed", items: [] },
            }),
          0,
        )
      }
      return { turn: { id: turnId } }
    }
    if (method === "turn/interrupt") {
      interruptRequests += 1
      setTimeout(() => {
        appServer.emit("turn/completed", {
          threadId: "thread-retry-isolation",
          turn: { id: "turn-retry-1", status: "interrupted", items: [] },
        })
      }, 20)
      setTimeout(() => {
        activeCommand = false
        appServer.emit("item/completed", {
          threadId: "thread-retry-isolation",
          turnId: "turn-retry-1",
          item: {
            id: "command-retry-1",
            type: "commandExecution",
            status: "failed",
          },
        })
      }, 600)
      return {}
    }
    throw new Error(`Unexpected request: ${method}`)
  }

  const orchestrator = new Orchestrator(
    {
      ...runtimeConfig(directory),
      maxRetries: 1,
      turnTimeoutMs: 5,
    },
    {
      appServer,
      controlPlane: {
        async fetchTask() {
          return { issue: { body: block }, comments }
        },
        async postComment(body) {
          comments.push({ body })
        },
      },
      store: new StateStore({
        stateDirectory: directory,
        repository: "Sillyquack/koalafrog-hq",
        issueNumber: 53,
      }),
      workspace: fakeWorkspace(),
    },
  )

  const result = await orchestrator.runOnce()

  assert.equal(result.status, "needs_review")
  assert.equal(turnStarts, 2)
  assert.equal(interruptRequests, 1)
  assert.equal(activeCommand, false)
})

test("a timed-out turn fails closed when an interrupted command never becomes terminal", async () => {
  const appServer = new AppServerClient({
    cwd: "/tmp",
    turnTerminationTimeoutMs: 30,
  })
  let turnStarts = 0
  let interruptRequests = 0
  appServer.request = async (method) => {
    if (method === "turn/start") {
      turnStarts += 1
      appServer.emit("item/started", {
        threadId: "thread-unproven-command",
        turnId: "turn-unproven-command",
        item: {
          id: "command-unproven",
          type: "commandExecution",
          status: "inProgress",
        },
      })
      return { turn: { id: "turn-unproven-command" } }
    }
    if (method === "turn/interrupt") {
      interruptRequests += 1
      setTimeout(
        () =>
          appServer.emit("turn/completed", {
            threadId: "thread-unproven-command",
            turn: {
              id: "turn-unproven-command",
              status: "interrupted",
              items: [],
            },
          }),
        0,
      )
      setTimeout(
        () =>
          appServer.emit("item/completed", {
            threadId: "thread-unproven-command",
            turnId: "turn-unproven-command",
            item: {
              id: "command-unproven",
              type: "commandExecution",
              status: "inProgress",
            },
          }),
        5,
      )
      return {}
    }
    throw new Error(`Unexpected request: ${method}`)
  }

  await assert.rejects(
    appServer.runTurn({
      threadId: "thread-unproven-command",
      prompt: "Do not overlap an unproven command.",
      cwd: "/tmp",
      timeoutMs: 5,
    }),
    /did not prove terminal command completion/,
  )
  assert.equal(turnStarts, 1)
  assert.equal(interruptRequests, 1)
})

test("restart publishes a persisted owner stop before returning to polling", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-owner-recovery-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const block = controlBlock({ instructionId: "owner-recovery-001" })
  const [instruction] = extractAgentControls(block)
  const store = new StateStore({
    stateDirectory: directory,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 53,
  })
  const state = await store.load()
  beginInstruction(state, instruction)
  state.threadId = "thread-owner-stop"
  state.workspacePath = "/tmp/workspace-owner-stop"
  state.branch = "agent/owner-recovery-001"
  state.activeInstruction.phase = "owner_stopped"
  state.activeInstruction.turnId = "turn-owner-stop"
  state.activeInstruction.ownerRequest = {
    method: "item/tool/requestUserInput",
    reason: "Owner decision required after restart.",
  }
  state.pendingOwnerRequest = state.activeInstruction.ownerRequest
  state.status = "needs_owner"
  await store.save(state)

  const posted = []
  const orchestrator = new Orchestrator(runtimeConfig(directory), {
    store,
    appServer: {
      async start() {},
      async stop() {},
    },
    controlPlane: {
      async fetchTask() {
        return { issue: { body: "" }, comments: [{ body: block }] }
      },
      async postComment(comment) {
        posted.push(comment)
      },
    },
    workspace: fakeWorkspace(),
  })

  const result = await orchestrator.runOnce()
  assert.equal(result.status, "needs_owner")
  assert.equal(posted.length, 1)
  assert.match(posted[0], /status: needs_owner/)
  const recoveredState = await store.load()
  assert.equal(recoveredState.activeInstruction, null)
  assert.equal(recoveredState.lastConsumedInstructionId, "owner-recovery-001")
  assert.equal(recoveredState.runs[0].status, "needs_owner")
})

test("Issue #63/010 reconciles the authorized branch once and survives restart", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-branch-reconciliation-restart-"),
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
  await store.save(state)

  const task = issue63ReconciliationTask()
  const posted = []
  const controlPlane = {
    async fetchTask() {
      return task
    },
    async postComment(body) {
      posted.push(body)
      task.comments.push({ body })
    },
  }
  let resumeCalls = 0
  let startThreadCalls = 0
  let turnCalls = 0
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
      resumeCalls += 1
      assert.equal(threadId, issue63ThreadId)
      assert.equal(params.config["features.exec_permission_approvals"], true)
      return { thread: { id: threadId } }
    },
    async startThread() {
      startThreadCalls += 1
      return { thread: { id: "unexpected-new-thread" } }
    },
    async waitForMcpReady() {},
    async runTurn({ onTurnStarted, approvalPolicy, prompt }) {
      turnCalls += 1
      assert.equal(approvalPolicy, "on-request")
      assert.match(prompt, /with_additional_permissions/)
      await onTurnStarted("turn-production-day1-git-reconciliation-resume-010")
      return {
        status: "completed",
        turn: {
          id: "turn-production-day1-git-reconciliation-resume-010",
          status: "completed",
          items: [],
        },
        pendingOwnerRequest: null,
        agentMessage: "needs_review\n\nAuthorized reconciliation continuation completed.",
      }
    },
    async stop() {},
  }
  let reconciliationCallbacks = 0
  let boundaryResolutionCalls = 0
  const workspace = {
    async ensureWorkspace({
      existingPath,
      existingBranch,
      reconcileBranch,
    }) {
      assert.equal(existingPath, issue63WorkspacePath)
      if (existingBranch === issue63ExpectedBranch) {
        reconciliationCallbacks += 1
        const accepted = await reconcileBranch({
          path: issue63WorkspacePath,
          expectedBranch: issue63ExpectedBranch,
          actualBranch: issue63ReconciledBranch,
          head: issue63ReconciledHead,
          dirty: false,
          operationsInProgress: [],
        })
        assert.equal(accepted, true)
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
      boundaryResolutionCalls += 1
      assert.equal(current.instructionId, instruction.instructionId)
      assert.equal(state.workspaceBranchReconciliations.length, 1)
      return gitExecutionBoundary
    },
    async gitExecutionBoundaryIsCurrent() {
      return true
    },
  }
  const config = { ...runtimeConfig(directory), issueNumber: 63 }
  const first = new Orchestrator(config, {
    appServer,
    controlPlane,
    store,
    workspace,
  })
  const completed = await first.runOnce()
  const restarted = new Orchestrator(config, {
    appServer,
    controlPlane,
    store: new StateStore(storeOptions),
    workspace,
  })
  const replay = await restarted.runOnce()

  assert.equal(completed.status, "needs_review")
  assert.equal(replay.status, "idle")
  assert.equal(resumeCalls, 1)
  assert.equal(startThreadCalls, 0)
  assert.equal(turnCalls, 1)
  assert.equal(reconciliationCallbacks, 1)
  assert.equal(boundaryResolutionCalls, 1)
  assert.equal(
    posted.filter((body) => body.includes("agent_pickup:")).length,
    1,
  )
  assert.equal(
    posted.filter((body) => body.includes("agent_result:")).length,
    1,
  )

  const persisted = await new StateStore(storeOptions).load()
  assert.equal(persisted.threadId, issue63ThreadId)
  assert.equal(persisted.workspacePath, issue63WorkspacePath)
  assert.equal(persisted.branch, issue63ReconciledBranch)
  assert.equal(persisted.workspaceBranchReconciliations.length, 1)
  assert.equal(
    persisted.workspaceBranchReconciliations[0].precedingInstructionId,
    issue63PriorInstructionId,
  )
  assert.equal(
    persisted.workspaceBranchReconciliations[0].continuationInstructionId,
    "production-day1-git-reconciliation-resume-010",
  )
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
    events.filter((event) => event.type === "workspace_branch_reconciled")
      .length,
    1,
  )
  assert.equal(
    events.filter(
      (event) => event.type === "workspace_branch_reconciliation_rejected",
    ).length,
    0,
  )
  assert.equal(
    events.find((event) => event.type === "workspace_branch_reconciled")
      .originIssueUrl,
    issue63OriginUrl,
  )
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
      apiKey: "also-secret",
      message: "Bearer another-token ghp_123456789012345678901234567890123456",
    },
  })
  assert.equal(redacted.authorization, "[redacted]")
  assert.equal(redacted.nested.password, "[redacted]")
  assert.equal(redacted.nested.apiKey, "[redacted]")
  assert.equal(redacted.nested.message, "Bearer [redacted] [redacted]")
})
