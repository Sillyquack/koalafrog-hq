import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { EventEmitter } from "node:events"
import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { promisify } from "node:util"
import {
  controlPlaneBindingDigest,
  extractAgentControls,
  formatCompletionPacket,
  ownerGateAcknowledgementId,
  ownerGateReason,
} from "../src/control-plane.mjs"
import {
  checkpointOwnerGateAttemptAuditDecision,
  completeCheckpointOwnerGateAcknowledgement,
  recordPendingApprovalRequest,
  registerCheckpointOwnerGateAcknowledgement,
} from "../src/approval-decisions.mjs"
import {
  authorizedGitExecutionBoundary,
  durableTaskInstructionDecision,
  executeGitReconciliationCheckpointMutation,
  executePinnedGit,
  gitExecutionBoundaryIsCurrent,
  gitExecutionBoundaryPrompt,
  gitExecutionPathIsCovered,
  gitExecutionBoundaryRequestDecision,
  matchGitExecutionBoundaryRequest,
  gitReconciliationCheckpointActivationPrompt,
  gitReconciliationCheckpointGenerationProposalPrompt,
  gitReconciliationCheckpointManagedExecutionPrompt,
  gitReconciliationCheckpointOwnerReason,
  gitReconciliationCheckpointProposalPrompt,
  proposeGitReconciliationCheckpoint,
  prepareGitReconciliationCheckpointExecution,
  recoverCompletedCheckpointActivation,
} from "../src/git-execution-boundary.mjs"
import { QueueClaimStore } from "../src/queue-claim-store.mjs"
import { runRepositoryIssue } from "../src/repository-runner.mjs"
import { StateStore } from "../src/state-store.mjs"
import {
  issue63ContinuationControl,
  issue63ContinuationInstructionId,
  issue63DiagnosticControl,
  issue63DiagnosticInstructionId,
  issue63ExecutionControl,
  issue63ExecutionInstructionId,
  issue63FailedDiagnosticRun,
  issue63FailedExecutionRun,
  issue63FailedFallbackDiagnosticRun,
  issue63FailedGrantRun,
  issue63FailedHistoricalGrantRun,
  issue63FallbackDiagnosticControl,
  issue63FallbackDiagnosticInstructionId,
  issue63HistoricalGrantControl,
  issue63HistoricalGrantInstructionId,
  issue63HistoricalGrantRetryControl,
  issue63HistoricalGrantRetryInstructionId,
  issue63InterveningRun,
  issue63LiveChangedFiles,
  issue63OriginUrl,
  issue63PriorRun,
  issue63ReconciledBranch,
  issue63ReconciliationTask,
  issue63ThreadId,
} from "./fixtures/issue-63-production-day1-git-reconciliation-resume-010.mjs"

const execFileAsync = promisify(execFile)
const issue63OwnerAck027NoMutationStatement =
  "No fallback path, sibling metadata access, source change, or production-side action occurred."
const issue63OwnerAck027ProductionReadback =
  "Fully qualified receipt/checkpoint binding: preflight **PASS**"
const brokerLifecycleStressIterations =
  process.env.KOALAFROG_BROKER_LIFECYCLE_STRESS_ITERATIONS === "20" ? 20 : 1

function deferredBarrier() {
  let resolve
  const promise = new Promise((resolve_) => {
    resolve = resolve_
  })
  return { promise, resolve }
}

class InjectedBrokerInput extends EventEmitter {
  constructor() {
    super()
    this.destroyed = false
    this.writable = true
    this.writableEnded = false
    this.writableFinished = false
    this.writes = []
    this.onWrite = null
    this.onEnd = null
  }

  write(value, callback) {
    this.writes.push(String(value))
    this.onWrite?.(String(value))
    if (typeof callback === "function") queueMicrotask(() => callback(null))
    return true
  }

  end(value, callback) {
    if (value != null) this.writes.push(String(value))
    this.writableEnded = true
    this.writable = false
    this.onEnd?.(value == null ? "" : String(value))
    if (typeof callback === "function") {
      queueMicrotask(() => {
        this.writableFinished = true
        callback(null)
      })
    }
    return this
  }

  closeUnexpectedly() {
    this.destroyed = true
    this.writable = false
    this.emit("close")
  }
}

function injectedBrokerFixture({ autoCloseOnKill = true } = {}) {
  const child = new EventEmitter()
  const stdin = new InjectedBrokerInput()
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  const response = new EventEmitter()
  let closed = false
  let killInvocations = 0
  child.killed = false
  child.exitCode = null
  child.signalCode = null
  child.stdin = stdin
  child.stdout = stdout
  child.stderr = stderr
  child.stdio = Array(10).fill(null)
  child.stdio[9] = response

  const closeChild = (code = 0, signal = null) => {
    if (closed) return false
    closed = true
    child.exitCode = code
    child.signalCode = signal
    child.emit("exit", code, signal)
    child.emit("close", code, signal)
    return true
  }
  child.kill = (signal) => {
    killInvocations += 1
    if (
      child.killed ||
      child.exitCode != null ||
      child.signalCode != null
    ) {
      return false
    }
    child.killed = true
    if (autoCloseOnKill) {
      queueMicrotask(() => closeChild(null, signal))
    }
    return true
  }

  const listenerCount = () =>
    child.listenerCount("error") +
    child.listenerCount("exit") +
    child.listenerCount("close") +
    stdin.listenerCount("error") +
    stdin.listenerCount("close") +
    stdout.listenerCount("data") +
    stderr.listenerCount("data") +
    response.listenerCount("data") +
    response.listenerCount("error") +
    response.listenerCount("end") +
    response.listenerCount("close")

  return {
    child,
    stdin,
    stdout,
    stderr,
    response,
    closeChild,
    listenerCount,
    spawnBroker: () => child,
    get killInvocations() {
      return killInvocations
    },
  }
}

async function settleInjectedBroker(promise, timeoutMs = 1_000) {
  let timer = null
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("injected broker probe timed out"))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function observedSettlement(promise) {
  let count = 0
  return {
    promise: promise.then(
      (value) => {
        count += 1
        return value
      },
      (error) => {
        count += 1
        throw error
      },
    ),
    count: () => count,
  }
}

function injectedExecution(fixture, options = {}) {
  return executePinnedGit([], {
    boundaryRequest: {},
    spawnBroker: fixture.spawnBroker,
    ...options,
  })
}

function assertBrokerLost(error, causeCode = null) {
  assert.equal(error.code, "BROKER_LOST")
  if (causeCode != null) assert.equal(error.cause?.code, causeCode)
  return true
}

async function git(cwd, ...args) {
  const result = await execFileAsync("git", args, { cwd, encoding: "utf8" })
  return result.stdout.trim()
}

async function fileSnapshot(root) {
  const snapshot = new Map()
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await visit(target)
      } else if (entry.isFile()) {
        const content = await readFile(target)
        snapshot.set(
          target,
          createHash("sha256").update(content).digest("hex"),
        )
      }
    }
  }
  await visit(root)
  return snapshot
}

async function fixture(
  t,
  {
    execution011 = false,
    execution012 = false,
    execution013 = false,
    execution014 = false,
    execution015 = false,
  } = {},
) {
  const directory = await realpath(
    await mkdtemp(
      path.join(os.tmpdir(), "koalafrog-git-execution-boundary-"),
    ),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const checkoutPath = path.join(directory, "checkout")
  const workspaceRoot = path.join(directory, "state", "workspaces")
  const workspacePath = path.join(
    workspaceRoot,
    "issue-63-production-day1-stock-equipment-001",
  )
  await mkdir(checkoutPath, { recursive: true })
  await mkdir(workspaceRoot, { recursive: true })
  await git(checkoutPath, "init", "--initial-branch=main")
  await git(checkoutPath, "config", "user.name", "Koalafrog Test")
  await git(checkoutPath, "config", "user.email", "test@example.invalid")
  await writeFile(path.join(checkoutPath, "fixture.txt"), "base\n")
  await git(checkoutPath, "add", "fixture.txt")
  await git(checkoutPath, "commit", "-m", "base")
  const remotePath = path.join(directory, "remote.git")
  await git(directory, "init", "--bare", remotePath)
  await git(checkoutPath, "remote", "add", "origin", remotePath)
  await git(checkoutPath, "push", "origin", "main")
  for (const file of issue63LiveChangedFiles) {
    const target = path.join(checkoutPath, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, `${file}\n`)
  }
  await git(checkoutPath, "add", ".")
  await git(checkoutPath, "commit", "-m", "integration head")
  const head = await git(checkoutPath, "rev-parse", "HEAD")
  await git(checkoutPath, "switch", "-c", "reviewed-source")
  await writeFile(path.join(checkoutPath, "fixture.txt"), "base\nreviewed\n")
  await git(checkoutPath, "add", "fixture.txt")
  await git(checkoutPath, "commit", "-m", "reviewed target")
  const cherryPickCommit = await git(checkoutPath, "rev-parse", "HEAD")
  await git(checkoutPath, "switch", "main")
  await git(
    checkoutPath,
    "worktree",
    "add",
    "-b",
    issue63ReconciledBranch,
    workspacePath,
    head,
  )

  const continuationControl = issue63ContinuationControl
    .replaceAll(
      "ec719153c8e726831d7e2b748067383ea7f4e314",
      head,
    )
    .replaceAll(
      "a74079be88ec4a8b36b850f95dca791ff42e4e80",
      cherryPickCommit,
    )
  const task = issue63ReconciliationTask()
  task.comments = task.comments.map((comment) =>
    comment.body.includes("production-day1-git-reconciliation-resume-010")
      ? { ...comment, body: continuationControl }
      : comment,
  )
  const [receiptInstruction] = extractAgentControls(continuationControl)
  const executionControl = issue63ExecutionControl
    .replaceAll(
      "ec719153c8e726831d7e2b748067383ea7f4e314",
      head,
    )
    .replaceAll(
      "a74079be88ec4a8b36b850f95dca791ff42e4e80",
      cherryPickCommit,
    )
  const historicalGrantControl = issue63HistoricalGrantControl
    .replaceAll(
      "ec719153c8e726831d7e2b748067383ea7f4e314",
      head,
    )
    .replaceAll(
      "a74079be88ec4a8b36b850f95dca791ff42e4e80",
      cherryPickCommit,
    )
  const historicalGrantRetryControl = issue63HistoricalGrantRetryControl
    .replaceAll(
      "ec719153c8e726831d7e2b748067383ea7f4e314",
      head,
    )
    .replaceAll(
      "a74079be88ec4a8b36b850f95dca791ff42e4e80",
      cherryPickCommit,
    )
  const diagnosticControl = issue63DiagnosticControl
    .replaceAll(
      "ec719153c8e726831d7e2b748067383ea7f4e314",
      head,
    )
    .replaceAll(
      "a74079be88ec4a8b36b850f95dca791ff42e4e80",
      cherryPickCommit,
    )
  const fallbackDiagnosticControl = issue63FallbackDiagnosticControl
    .replaceAll(
      "ec719153c8e726831d7e2b748067383ea7f4e314",
      head,
    )
    .replaceAll(
      "a74079be88ec4a8b36b850f95dca791ff42e4e80",
      cherryPickCommit,
    )
  if (
    execution011 ||
    execution012 ||
    execution013 ||
    execution014 ||
    execution015
  ) {
    task.comments.push({ body: executionControl })
  }
  if (execution012 || execution013 || execution014 || execution015) {
    task.comments.push({ body: historicalGrantControl })
  }
  if (execution013 || execution014 || execution015) {
    task.comments.push({ body: historicalGrantRetryControl })
  }
  if (execution014 || execution015) {
    task.comments.push({ body: diagnosticControl })
  }
  if (execution015) task.comments.push({ body: fallbackDiagnosticControl })
  const [instruction] = extractAgentControls(
    execution015
      ? fallbackDiagnosticControl
      : execution014
        ? diagnosticControl
        : execution013
          ? historicalGrantRetryControl
          : execution012
            ? historicalGrantControl
            : execution011
              ? executionControl
              : continuationControl,
  )
  const sourceRun = structuredClone(issue63PriorRun)
  sourceRun.commits = [head]
  sourceRun.resultArtifact.finalMessage = sourceRun.resultArtifact.finalMessage
    .replaceAll(
      "ec719153c8e726831d7e2b748067383ea7f4e314",
      head,
    )
  const reconciliationId = [
    "authorized-workspace-branch",
    sourceRun.instructionId,
    receiptInstruction.instructionId,
    head,
  ].join(":")
  const receiptRun = structuredClone(sourceRun)
  receiptRun.instructionId = receiptInstruction.instructionId
  receiptRun.workspacePath = workspacePath
  receiptRun.changedFiles = structuredClone(issue63LiveChangedFiles)
  receiptRun.resultArtifact = structuredClone(
    issue63FailedExecutionRun.resultArtifact,
  )
  receiptRun.resultArtifact.finalMessage =
    receiptRun.resultArtifact.finalMessage.replaceAll(
      "ec719153c8e726831d7e2b748067383ea7f4e314",
      head,
    )
  receiptRun.resultArtifact.checks.diffCheck = structuredClone(
    issue63FailedGrantRun.resultArtifact.checks.diffCheck,
  )
  receiptRun.resultArtifact.checks.diffCheck.evidence =
    receiptRun.resultArtifact.checks.diffCheck.evidence.map((evidence) => ({
      ...evidence,
      summary: evidence.summary.replaceAll(
        "ec719153c8e726831d7e2b748067383ea7f4e314",
        head,
      ),
    }))
  const receiptGate =
    "The remaining gate is an orchestrator execution profile that actually permits writes to this linked worktree’s external Git metadata. Owner intent is already explicit; no additional product authorization is needed. No deployment, migration, production write, receipt, or other external mutation occurred."
  receiptRun.blockers = [
    "needs_review — reconciliation blocked before cherry-pick.",
    "Exact blocker: sandbox denied creation of the linked worktree `.git/worktrees/.../index.lock`",
  ]
  receiptRun.ownerGates = [receiptGate]
  receiptRun.productionReadback = [receiptGate]
  receiptRun.safetyFindings = [receiptGate]
  receiptRun.branchPushState = [
    `Branch: \`${issue63ReconciledBranch}\``,
    "Remote integration ref: absent",
    "Push: **NOT ATTEMPTED**",
  ]
  for (const key of [
    "blockers",
    "ownerGates",
    "productionReadback",
    "safetyFindings",
    "branchPushState",
  ]) {
    receiptRun.resultArtifact.findings[key] = structuredClone(receiptRun[key])
  }
  receiptRun.completedAt = "2026-08-22T23:10:00.000Z"
  const failedGrantRun = structuredClone(issue63FailedGrantRun)
  failedGrantRun.workspacePath = workspacePath
  failedGrantRun.commits = [head]
  failedGrantRun.changedFiles = structuredClone(receiptRun.changedFiles)
  failedGrantRun.resultArtifact.finalMessage =
    failedGrantRun.resultArtifact.finalMessage.replaceAll(
      "ec719153c8e726831d7e2b748067383ea7f4e314",
      head,
    )
  failedGrantRun.resultArtifact.checks.diffCheck.evidence =
    failedGrantRun.resultArtifact.checks.diffCheck.evidence.map((evidence) => ({
      ...evidence,
      summary: evidence.summary.replaceAll(
        "ec719153c8e726831d7e2b748067383ea7f4e314",
        head,
      ),
    }))
  const failedHistoricalGrantRun = structuredClone(
    issue63FailedHistoricalGrantRun,
  )
  failedHistoricalGrantRun.workspacePath = workspacePath
  failedHistoricalGrantRun.commits = [head]
  failedHistoricalGrantRun.changedFiles = structuredClone(
    receiptRun.changedFiles,
  )
  failedHistoricalGrantRun.resultArtifact.finalMessage =
    failedHistoricalGrantRun.resultArtifact.finalMessage.replaceAll(
      "ec719153c8e726831d7e2b748067383ea7f4e314",
      head,
    )
  failedHistoricalGrantRun.resultArtifact.checks.diffCheck.evidence =
    failedHistoricalGrantRun.resultArtifact.checks.diffCheck.evidence.map(
      (evidence) => ({
        ...evidence,
        summary: evidence.summary.replaceAll(
          "ec719153c8e726831d7e2b748067383ea7f4e314",
          head,
        ),
      }),
    )
  const failedDiagnosticRun = structuredClone(issue63FailedDiagnosticRun)
  failedDiagnosticRun.workspacePath = workspacePath
  failedDiagnosticRun.commits = [head]
  failedDiagnosticRun.changedFiles = structuredClone(receiptRun.changedFiles)
  failedDiagnosticRun.resultArtifact.finalMessage =
    failedDiagnosticRun.resultArtifact.finalMessage.replaceAll(
      "ec719153c8e726831d7e2b748067383ea7f4e314",
      head,
    )
  failedDiagnosticRun.resultArtifact.checks.diffCheck.evidence =
    failedDiagnosticRun.resultArtifact.checks.diffCheck.evidence.map(
      (evidence) => ({
        ...evidence,
        summary: evidence.summary.replaceAll(
          "ec719153c8e726831d7e2b748067383ea7f4e314",
          head,
        ),
      }),
    )
  const failedFallbackDiagnosticRun = structuredClone(
    issue63FailedFallbackDiagnosticRun,
  )
  failedFallbackDiagnosticRun.workspacePath = workspacePath
  failedFallbackDiagnosticRun.commits = [head]
  failedFallbackDiagnosticRun.changedFiles = structuredClone(
    receiptRun.changedFiles,
  )
  failedFallbackDiagnosticRun.branchPushState =
    failedFallbackDiagnosticRun.branchPushState.map((entry) =>
      entry.replaceAll(
        "ec719153c8e726831d7e2b748067383ea7f4e314",
        head,
      ),
    )
  failedFallbackDiagnosticRun.resultArtifact.finalMessage =
    failedFallbackDiagnosticRun.resultArtifact.finalMessage.replaceAll(
      "ec719153c8e726831d7e2b748067383ea7f4e314",
      head,
    )
  failedFallbackDiagnosticRun.resultArtifact.findings.branchPushState =
    structuredClone(failedFallbackDiagnosticRun.branchPushState)
  failedFallbackDiagnosticRun.resultArtifact.checks.diffCheck.evidence =
    failedFallbackDiagnosticRun.resultArtifact.checks.diffCheck.evidence.map(
      (evidence) => ({
        ...evidence,
        summary: evidence.summary.replaceAll(
          "ec719153c8e726831d7e2b748067383ea7f4e314",
          head,
        ),
      }),
    )
  const state = {
    status:
      execution011 ||
      execution012 ||
      execution013 ||
      execution014 ||
      execution015
        ? "needs_review"
        : "needs_owner",
    task: { originIssueNumber: 63, originIssueUrl: issue63OriginUrl },
    threadId: issue63ThreadId,
    workspacePath,
    branch: issue63ReconciledBranch,
    activeInstruction: { ...instruction, phase: "selected" },
    runs: execution015
      ? [
          sourceRun,
          structuredClone(issue63InterveningRun),
          receiptRun,
          failedGrantRun,
          failedHistoricalGrantRun,
          failedDiagnosticRun,
          failedFallbackDiagnosticRun,
        ]
      : execution014
        ? [
            sourceRun,
            structuredClone(issue63InterveningRun),
            receiptRun,
            failedGrantRun,
            failedHistoricalGrantRun,
            failedDiagnosticRun,
          ]
        : execution013
          ? [
              sourceRun,
              structuredClone(issue63InterveningRun),
              receiptRun,
              failedGrantRun,
              failedHistoricalGrantRun,
            ]
          : execution012
            ? [
                sourceRun,
                structuredClone(issue63InterveningRun),
                receiptRun,
                failedGrantRun,
              ]
            : execution011
              ? [sourceRun, structuredClone(issue63InterveningRun), receiptRun]
              : [sourceRun],
    workspaceBranchReconciliations: [
      {
        reconciliationId,
        precedingInstructionId: sourceRun.instructionId,
        interveningInstructionIds:
          execution011 ||
          execution012 ||
          execution013 ||
          execution014 ||
          execution015
          ? [issue63InterveningRun.instructionId]
          : [],
        continuationInstructionId: receiptInstruction.instructionId,
        originIssueNumber: 63,
        originIssueUrl: issue63OriginUrl,
        threadId: issue63ThreadId,
        workspacePath,
        fromBranch: "agent/issue-63-production-day1-stock-equipment-001",
        toBranch: issue63ReconciledBranch,
        head,
        reconciledAt: "2026-08-22T05:10:00.000Z",
      },
    ],
  }
  const input = {
    state,
    instruction,
    task,
    workspacePath,
    workspaceRoot,
    checkoutPath,
    repository: "Sillyquack/koalafrog-hq",
    baseRef: "origin/main",
    pullRequestLookup: async () => [],
  }
  return {
    ...input,
    boundary: await authorizedGitExecutionBoundary(input),
    directory,
    head,
    cherryPickCommit,
  }
}

function permissionRequest(boundary, action = "cherry_pick") {
  const command = boundary.commands[action][0]
  const permissions =
    action === "cherry_pick"
      ? { fileSystem: { write: [...boundary.writablePaths] } }
      : { network: { enabled: true } }
  return {
    request: {
      method: "item/permissions/requestApproval",
      threadId: boundary.threadId,
      turnId: "turn-63-010",
      itemId: `item-${action}`,
      details: { cwd: boundary.workspacePath, permissions },
    },
    commandExecution: {
      id: `item-${action}`,
      type: "commandExecution",
      source: "agent",
      status: "inProgress",
      cwd: boundary.workspacePath,
      command,
    },
  }
}

function checkpointControl({
  instructionId,
  taskState,
  prompt,
  ownerApprovalRequired = false,
}) {
  const indentedPrompt = prompt
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n")
  return `\`\`\`yaml
agent_control:
  action: continue
  task_state: ${taskState}
  instruction_id: ${instructionId}
  max_turns: 8
  owner_approval_required: ${ownerApprovalRequired}
  prompt: |
${indentedPrompt}
\`\`\``
}

function ownerGateAcknowledgementBlock(binding) {
  return `\`\`\`yaml
owner_gate_acknowledgement:
  acknowledgement_id: ${binding.acknowledgementId}
  instruction_id: ${binding.instructionId}
  proposal_instruction_id: ${binding.proposalInstructionId}
  origin_issue_number: ${binding.originIssueNumber}
  origin_issue_url_digest: ${binding.originIssueUrlDigest}
  codex_thread_id: ${binding.codexThreadId}
  workspace_path_digest: ${binding.workspacePathDigest}
  checkpoint_id: ${binding.checkpointId}
  generation_id: ${binding.generationId}
  reconciliation_id: ${binding.reconciliationId}
  branch: ${binding.branch}
  head: ${binding.head}
  tree: ${binding.tree}
  control_prompt_digest: ${binding.controlPromptDigest}
  gate_reason_digest: ${binding.gateReasonDigest}
  pending_reason_digest: ${binding.pendingReasonDigest}
  prior_gate_audit_digest: ${binding.priorGateAuditDigest}
\`\`\``
}

function selectAcknowledgedGenerationActivation(
  setup,
  proposal,
  instructionId,
) {
  const prompt = gitReconciliationCheckpointActivationPrompt({
    checkpointId: proposal.checkpointId,
    reconciliationId: proposal.reconciliationId,
    head: proposal.head,
    tree: proposal.tree,
    cherryPickCommit: proposal.cherryPickCommit,
    generation: proposal.generation,
    generationId: proposal.generationId,
  })
  const controlBody = checkpointControl({
    instructionId,
    taskState: "needs_owner",
    prompt,
    ownerApprovalRequired: true,
  })
  const comment = { body: controlBody }
  setup.task.comments.push(comment)
  const [instruction] = extractAgentControls(controlBody)
  setup.state.status = "needs_owner"
  setup.state.activeInstruction = { ...instruction, phase: "selected" }
  const pendingReason = gitReconciliationCheckpointOwnerReason(proposal)
  if (
    !(setup.state.pendingApprovalRequests ?? []).some(
      (pending) =>
        !pending.clearedAt &&
        pending.sourceInstructionId === proposal.proposalInstructionId,
    )
  ) {
    recordPendingApprovalRequest({
      state: setup.state,
      instructionId: proposal.proposalInstructionId,
      request: {
        method: "control-plane/gitReconciliationCheckpointActivation",
        reason: pendingReason,
      },
      now: new Date("2026-08-23T10:03:00.000Z"),
      allowLegacy: true,
    })
  }
  const gateReason = ownerGateReason(instruction)
  const audit = checkpointOwnerGateAttemptAuditDecision({
    state: setup.state,
    task: setup.task,
    proposal,
    activationPrompt: prompt,
    gateReason,
  })
  assert.equal(audit.accepted, true, JSON.stringify(audit))
  const binding = {
    instructionId,
    proposalInstructionId: proposal.proposalInstructionId,
    originIssueNumber: proposal.originIssueNumber,
    originIssueUrlDigest: controlPlaneBindingDigest(proposal.originIssueUrl),
    codexThreadId: proposal.threadId,
    workspacePathDigest: controlPlaneBindingDigest(proposal.workspacePath),
    checkpointId: proposal.checkpointId,
    generationId: proposal.generationId,
    reconciliationId: proposal.reconciliationId,
    branch: proposal.branch,
    head: proposal.head,
    tree: proposal.tree,
    controlPromptDigest: controlPlaneBindingDigest(prompt),
    gateReasonDigest: controlPlaneBindingDigest(gateReason),
    pendingReasonDigest: controlPlaneBindingDigest(pendingReason),
    priorGateAuditDigest: audit.value.digest,
  }
  binding.acknowledgementId = ownerGateAcknowledgementId(binding)
  comment.body = `${controlBody}\n\n${ownerGateAcknowledgementBlock(binding)}`
  const registered = registerCheckpointOwnerGateAcknowledgement({
    state: setup.state,
    instruction,
    task: setup.task,
    gateReason,
    pendingReason,
    now: new Date("2026-08-23T10:04:00.000Z"),
  })
  assert.equal(registered.accepted, true, JSON.stringify(registered))
  return { instruction, prompt, binding, registered }
}

function appendLive015Run(setup) {
  const run = structuredClone(setup.state.runs.at(-1))
  const noMutation =
    "Remaining gate: the runtime must actually select and expose the canonical historical-proof grant for this linked-worktree metadata boundary. No fallback, source change, remote Git mutation, deployment, migration, receipt, or production action occurred."
  run.instructionId = issue63FallbackDiagnosticInstructionId
  run.productionReadback = [noMutation]
  run.branchPushState = [
    `Branch/current HEAD: \`${issue63ReconciledBranch}\` at \`${setup.head}\``,
    "Push/PR: **NOT ATTEMPTED**",
    noMutation,
  ]
  run.resultArtifact.findings.productionReadback =
    structuredClone(run.productionReadback)
  run.resultArtifact.findings.branchPushState = structuredClone(
    run.branchPushState,
  )
  run.resultArtifact.finalMessage = `needs_review — canonical structured grant still did not activate.

- Branch/current HEAD: \`${issue63ReconciledBranch}\` at \`${setup.head}\`
- Worktree: clean; zero commits above base
- Git operation/rebase/sequencer markers: all absent
- Bounded metadata grant: **NOT ACTIVATED**
- Cherry-pick: **FAILED before application**
- Exact failure: linked-worktree \`index.lock: Operation not permitted\`
- \`git diff --check\`: **PASS**
- Push/PR: **NOT ATTEMPTED**

${noMutation}`
  run.completedAt = "2026-08-23T09:45:00.000Z"
  setup.state.runs.push(run)
  return run
}

async function checkpointSetup(t) {
  const setup = await fixture(t, { execution015: true })
  appendLive015Run(setup)
  const tree = await git(setup.workspacePath, "rev-parse", "HEAD^{tree}")
  const record = setup.state.workspaceBranchReconciliations[0]
  const proposalInstructionId =
    "production-day1-git-reconciliation-checkpoint-proposal-016"
  const proposalPrompt = gitReconciliationCheckpointProposalPrompt({
    reconciliationId: record.reconciliationId,
    head: setup.head,
    tree,
    cherryPickCommit: setup.cherryPickCommit,
  })
  const proposalBody = checkpointControl({
    instructionId: proposalInstructionId,
    taskState: "needs_review",
    prompt: proposalPrompt,
  })
  setup.task.comments.push({ body: proposalBody })
  const [proposalInstruction] = extractAgentControls(proposalBody)
  setup.state.status = "needs_review"
  setup.state.activeInstruction = {
    ...proposalInstruction,
    phase: "selected",
  }
  setup.state.gitReconciliationCheckpoints = []
  const input = {
    ...setup,
    instruction: proposalInstruction,
    state: setup.state,
    now: new Date("2026-08-23T10:00:00.000Z"),
  }
  const proposal = await proposeGitReconciliationCheckpoint(input)
  return {
    ...setup,
    tree,
    proposalBody,
    proposalInstruction,
    proposal,
  }
}

function selectCheckpointProposal(setup, instructionId, prompt) {
  const body = checkpointControl({
    instructionId,
    taskState: "needs_review",
    prompt,
  })
  setup.task.comments.push({ body })
  const [instruction] = extractAgentControls(body)
  setup.state.status = "needs_review"
  setup.state.activeInstruction = { ...instruction, phase: "selected" }
  return { body, instruction }
}

function appendRejectedCheckpointProposalAttempt(
  setup,
  {
    instructionId,
    blocker,
    prompt = setup.proposalInstruction.prompt,
    addControl = true,
    completedAt = "2026-08-23T10:01:00.000Z",
  },
) {
  if (addControl) selectCheckpointProposal(setup, instructionId, prompt)
  const run = {
    instructionId,
    status: "needs_review",
    threadId: issue63ThreadId,
    workspacePath: setup.workspacePath,
    branch: issue63ReconciledBranch,
    commits: [setup.head],
    changedFiles: structuredClone(issue63LiveChangedFiles),
    turnCount: 0,
    originIssueNumber: 63,
    originIssueUrl: issue63OriginUrl,
    ownerRequest: null,
    checks: {
      typecheck: "not_run",
      lint: "not_run",
      tests: "not_run",
      cloudflareReadiness: "not_run",
      build: "not_run",
      diffCheck: "not_run",
    },
    blockers: [blocker],
    ownerGates: [],
    productionReadback: [],
    safetyFindings: [],
    branchPushState: [],
    resultArtifact: null,
    completedAt,
  }
  setup.state.runs.push(run)
  return run
}

function appendAcceptedCheckpointProposalRun(setup, proposal) {
  const ownerReason = gitReconciliationCheckpointOwnerReason(proposal)
  const run = {
    instructionId: proposal.proposalInstructionId,
    status: "needs_owner",
    threadId: issue63ThreadId,
    workspacePath: setup.workspacePath,
    branch: issue63ReconciledBranch,
    commits: [setup.head],
    changedFiles: structuredClone(issue63LiveChangedFiles),
    turnCount: 0,
    originIssueNumber: 63,
    originIssueUrl: issue63OriginUrl,
    ownerRequest: {
      method: "control-plane/gitReconciliationCheckpointActivation",
      reason: ownerReason,
    },
    checks: {
      typecheck: "not_run",
      lint: "not_run",
      tests: "not_run",
      cloudflareReadiness: "not_run",
      build: "not_run",
      diffCheck: "not_run",
    },
    blockers: [],
    ownerGates: [ownerReason],
    productionReadback: [],
    safetyFindings: [],
    branchPushState: [],
    resultArtifact: null,
    completedAt: "2026-08-23T10:03:00.000Z",
  }
  setup.state.runs.push(run)
  return run
}

function appendRejectedOwnerGateAttempt(
  setup,
  proposal,
  { instructionId, taskState, completedAt, prompt: suppliedPrompt = null },
) {
  const prompt =
    suppliedPrompt ??
    gitReconciliationCheckpointActivationPrompt({
      checkpointId: proposal.checkpointId,
      reconciliationId: proposal.reconciliationId,
      head: proposal.head,
      tree: proposal.tree,
      cherryPickCommit: proposal.cherryPickCommit,
      generation: proposal.generation,
      generationId: proposal.generationId,
    })
  setup.task.comments.push({
    body: checkpointControl({
      instructionId,
      taskState,
      prompt,
      ownerApprovalRequired: true,
    }),
  })
  const gateReason = "The control-plane instruction explicitly requires owner approval."
  setup.state.runs.push({
    instructionId,
    status: "needs_owner",
    threadId: proposal.threadId,
    workspacePath: proposal.workspacePath,
    branch: proposal.branch,
    commits: [],
    changedFiles: [],
    turnCount: 0,
    originIssueNumber: proposal.originIssueNumber,
    originIssueUrl: proposal.originIssueUrl,
    ownerRequest: {
      method: "control-plane/ownerGate",
      reason: gateReason,
    },
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
  })
  return {
    prompt,
    run: setup.state.runs.at(-1),
    comment: setup.task.comments.at(-1),
  }
}

function appendLegacyActivation023(setup, proposal, suppliedPrompt = null) {
  const instructionId =
    "production-day1-git-reconciliation-checkpoint-generation-activation-023"
  const prompt =
    suppliedPrompt ??
    gitReconciliationCheckpointActivationPrompt({
      checkpointId: proposal.checkpointId,
      reconciliationId: proposal.reconciliationId,
      head: proposal.head,
      tree: proposal.tree,
      cherryPickCommit: proposal.cherryPickCommit,
      generation: proposal.generation,
      generationId: proposal.generationId,
    })
  setup.task.comments.push({
    body: checkpointControl({
      instructionId,
      taskState: "needs_owner",
      prompt,
      ownerApprovalRequired: false,
    }),
  })
  const noMutation =
    "No fallback Git path, sibling metadata access, source change, production action, deployment, migration, purchase, or receipt mutation occurred."
  const branchPushState = [
    `Branch/current HEAD: \`${proposal.branch}\` at \`${proposal.head}\``,
    "Live remote foundation: **PASS**",
    "Push/PR: **NOT ATTEMPTED**",
  ]
  const summary =
    `/bin/zsh -lc "git status --porcelain=v1 --branch; git branch --show-current; git rev-parse HEAD; git rev-list --count ${proposal.head}..HEAD; CHERRY_PICK_HEAD MERGE_HEAD REVERT_HEAD REBASE_HEAD; git diff --check" (completed, exit 0)`
  const unknown = { status: "unknown", evidence: [] }
  const run = {
    instructionId,
    status: "needs_review",
    threadId: proposal.threadId,
    workspacePath: proposal.workspacePath,
    branch: proposal.branch,
    commits: [proposal.head],
    changedFiles: structuredClone(issue63LiveChangedFiles),
    turnCount: 1,
    originIssueNumber: proposal.originIssueNumber,
    originIssueUrl: proposal.originIssueUrl,
    ownerRequest: null,
    checks: {
      typecheck: "unknown",
      lint: "unknown",
      tests: "unknown",
      cloudflareReadiness: "unknown",
      build: "unknown",
      diffCheck: "pass",
    },
    blockers: [],
    ownerGates: [],
    productionReadback: [noMutation],
    safetyFindings: [],
    branchPushState,
    resultArtifact: {
      version: 1,
      source: "completed_turn_final_message",
      capturedAt: "2026-08-23T19:52:28.927Z",
      turnId: "01a0302d-f3fd-7bc0-9135-c3f7213d7a97",
      turnStatus: "completed",
      finalMessage: `needs_review — superseding checkpoint generation 2 did not activate the approved metadata boundary.

- Branch/current HEAD: \`${proposal.branch}\` at \`${proposal.head}\`
- Current tree: \`${proposal.tree}\`
- Checkpoint binding and lineage preflight: **PASS**
- Live remote foundation: **PASS**
- Cherry-pick: **FAILED before application**
- Exact failure: linked-worktree \`index.lock: Operation not permitted\`
- Worktree: clean; zero commits above base; no Git operation markers
- \`git diff --check\`: **PASS**
- Validation suite: **NOT RUN**
- Push/PR: **NOT ATTEMPTED**

${noMutation}`,
      checks: {
        typecheck: structuredClone(unknown),
        lint: structuredClone(unknown),
        tests: structuredClone(unknown),
        cloudflareReadiness: structuredClone(unknown),
        build: structuredClone(unknown),
        diffCheck: {
          status: "pass",
          evidence: [
            { source: "command_execution", status: "pass", summary },
            {
              source: "final_message",
              status: "pass",
              summary: "`git diff --check`: **PASS**",
            },
          ],
        },
      },
      findings: {
        blockers: [],
        ownerGates: [],
        productionReadback: [noMutation],
        safetyFindings: [],
        branchPushState,
      },
    },
    completedAt: "2026-08-23T19:52:30.531Z",
  }
  setup.state.runs.push(run)
  return run
}

async function checkpointGenerationSetup(t) {
  const setup = await checkpointSetup(t)
  const reconciliationId =
    setup.state.workspaceBranchReconciliations[0].reconciliationId
  const livePriorTree = "2330f747713ce620c7927c2c505c622b40e18386"
  const liveConflicting018Tree =
    "2330f747f09933c522cb410ae671250583239840"
  const priorPrompt = gitReconciliationCheckpointProposalPrompt({
    reconciliationId,
    head: setup.head,
    tree: livePriorTree,
    cherryPickCommit: setup.cherryPickCommit,
  })
  const proposal016Comment = setup.task.comments.find((comment) =>
    comment.body.includes(
      "production-day1-git-reconciliation-checkpoint-proposal-016",
    ),
  )
  proposal016Comment.body = checkpointControl({
    instructionId: setup.proposalInstruction.instructionId,
    taskState: "needs_review",
    prompt: priorPrompt,
  })
  appendRejectedCheckpointProposalAttempt(setup, {
    instructionId: setup.proposalInstruction.instructionId,
    blocker: "checkpoint_proposal_exception",
    addControl: false,
    completedAt: "2026-08-23T10:01:00.000Z",
  })
  appendRejectedCheckpointProposalAttempt(setup, {
    instructionId:
      "production-day1-git-reconciliation-checkpoint-proposal-017",
    blocker: "checkpoint_historical_tail_scope",
    prompt: priorPrompt,
    completedAt: "2026-08-23T10:02:00.000Z",
  })
  const proposal018Prompt = gitReconciliationCheckpointProposalPrompt({
    reconciliationId,
    head: setup.head,
    tree: liveConflicting018Tree,
    cherryPickCommit: setup.cherryPickCommit,
  })
  appendRejectedCheckpointProposalAttempt(setup, {
    instructionId:
      "production-day1-git-reconciliation-checkpoint-proposal-018",
    blocker: "checkpoint_post_tail_control_binding",
    prompt: proposal018Prompt,
    completedAt: "2026-08-23T10:03:00.000Z",
  })
  const generationPrompt =
    gitReconciliationCheckpointGenerationProposalPrompt({
      reconciliationId,
      head: setup.head,
      tree: setup.tree,
      cherryPickCommit: setup.cherryPickCommit,
    })
  const generationInstruction = selectCheckpointProposal(
    setup,
    "production-day1-git-reconciliation-checkpoint-generation-proposal-019",
    generationPrompt,
  ).instruction
  const immutableHistory = JSON.stringify(setup.state.runs)
  const proposal = await proposeGitReconciliationCheckpoint({
    ...setup,
    state: setup.state,
    instruction: generationInstruction,
    now: new Date("2026-08-23T10:04:00.000Z"),
  })
  return {
    ...setup,
    generationInstruction,
    generationPrompt,
    immutableHistory,
    generationProposal: proposal,
    livePriorTree,
    liveConflicting018Tree,
  }
}

async function checkpointGenerationRetrySetup(t) {
  const setup = await checkpointGenerationSetup(t)
  const record = setup.state.workspaceBranchReconciliations[0]
  appendRejectedCheckpointProposalAttempt(setup, {
    instructionId: setup.generationInstruction.instructionId,
    blocker: "checkpoint_proposal_exception",
    addControl: false,
    completedAt: "2026-08-23T18:41:22.347Z",
  })
  const proposal020Prompt =
    gitReconciliationCheckpointGenerationProposalPrompt({
      reconciliationId: record.continuationInstructionId,
      head: setup.head,
      tree: setup.tree,
      cherryPickCommit: setup.cherryPickCommit,
    })
  const proposal020 = selectCheckpointProposal(
    setup,
    "production-day1-git-reconciliation-checkpoint-generation-proposal-020",
    proposal020Prompt,
  ).instruction
  appendRejectedCheckpointProposalAttempt(setup, {
    instructionId: proposal020.instructionId,
    blocker: "checkpoint_proposal_scope_binding",
    addControl: false,
    completedAt: "2026-08-23T19:16:18.942Z",
  })
  const proposal021Prompt =
    gitReconciliationCheckpointGenerationProposalPrompt({
      reconciliationId: record.reconciliationId,
      head: setup.head,
      tree: setup.tree,
      cherryPickCommit: setup.cherryPickCommit,
    })
  const proposal021 = selectCheckpointProposal(
    setup,
    "production-day1-git-reconciliation-checkpoint-generation-proposal-021",
    proposal021Prompt,
  ).instruction
  const immutableHistory = JSON.stringify(setup.state.runs)
  const proposal = await proposeGitReconciliationCheckpoint({
    ...setup,
    state: setup.state,
    instruction: proposal021,
    now: new Date("2026-08-23T19:30:00.000Z"),
  })
  return {
    ...setup,
    proposal019Diagnostic: {
      code: "checkpoint_proposal_exception",
      stage: "pull_request_lookup",
      reason: "executable_missing",
      errorCode: "ENOENT",
    },
    proposal020,
    proposal020Prompt,
    proposal021,
    proposal021Prompt,
    immutableRetryHistory: immutableHistory,
    generationRetryProposal: proposal,
  }
}

async function completedGenerationActivationRecoverySetup(t) {
  const setup = await checkpointGenerationRetrySetup(t)
  const proposal = setup.generationRetryProposal.value.record
  const duplicate019 = setup.task.comments.find((comment) =>
    comment.body.includes(
      "production-day1-git-reconciliation-checkpoint-generation-proposal-019\n",
    ),
  )
  assert.ok(duplicate019)
  setup.task.comments.push(structuredClone(duplicate019))
  setup.state.gitReconciliationCheckpoints.push(proposal)
  appendAcceptedCheckpointProposalRun(setup, proposal)

  const currentPrompt = gitReconciliationCheckpointActivationPrompt({
    checkpointId: proposal.checkpointId,
    reconciliationId: proposal.reconciliationId,
    head: proposal.head,
    tree: proposal.tree,
    cherryPickCommit: proposal.cherryPickCommit,
    generation: proposal.generation,
    generationId: proposal.generationId,
  })
  const receipt = setup.state.workspaceBranchReconciliations.find(
    (record) => record.reconciliationId === proposal.reconciliationId,
  )
  assert.ok(receipt)
  const historicalPrompt = currentPrompt.replace(
    `- reconciliation receipt: \`${proposal.reconciliationId}\``,
    `- reconciliation receipt: \`${receipt.continuationInstructionId}\``,
  )
  appendRejectedOwnerGateAttempt(setup, proposal, {
    instructionId:
      "production-day1-git-reconciliation-checkpoint-generation-activation-022",
    taskState: "needs_owner",
    completedAt: "2026-08-23T19:46:42.895Z",
    prompt: historicalPrompt,
  })
  const legacy023 = appendLegacyActivation023(
    setup,
    proposal,
    historicalPrompt,
  )
  appendRejectedOwnerGateAttempt(setup, proposal, {
    instructionId:
      "production-day1-git-reconciliation-checkpoint-generation-activation-025",
    taskState: "needs_review",
    completedAt: "2026-08-23T20:52:38.709Z",
    prompt: historicalPrompt,
  })
  appendRejectedOwnerGateAttempt(setup, proposal, {
    instructionId:
      "production-day1-git-reconciliation-checkpoint-generation-activation-024",
    taskState: "needs_owner",
    completedAt: "2026-08-23T20:53:14.959Z",
    prompt: historicalPrompt,
  })

  const rejected026Id =
    "production-day1-git-reconciliation-checkpoint-generation-activation-owner-ack-026"
  appendRejectedOwnerGateAttempt(setup, proposal, {
    instructionId: rejected026Id,
    taskState: "needs_owner",
    completedAt: "2026-08-24T08:00:00.000Z",
    prompt: currentPrompt,
  })

  const instructionId =
    "production-day1-git-reconciliation-checkpoint-generation-activation-owner-ack-027"
  const activation = selectAcknowledgedGenerationActivation(
    setup,
    proposal,
    instructionId,
  )
  const sourceRun = structuredClone(legacy023)
  sourceRun.instructionId = instructionId
  sourceRun.completedAt = "2026-08-24T09:00:00.000Z"
  sourceRun.resultArtifact.turnId = "turn-owner-ack-027"
  const priorNoMutationStatement = sourceRun.productionReadback[0]
  sourceRun.productionReadback = [issue63OwnerAck027ProductionReadback]
  sourceRun.resultArtifact.findings.productionReadback = [
    issue63OwnerAck027ProductionReadback,
  ]
  sourceRun.resultArtifact.finalMessage =
    sourceRun.resultArtifact.finalMessage.replace(
      priorNoMutationStatement,
      issue63OwnerAck027NoMutationStatement,
    )
  setup.state.runs.push(sourceRun)
  setup.state.lastConsumedInstructionId = instructionId
  setup.state.status = "needs_review"
  const completion = completeCheckpointOwnerGateAcknowledgement({
    state: setup.state,
    acknowledgementId: activation.binding.acknowledgementId,
    outcome: "needs_review",
    now: new Date(sourceRun.completedAt),
  })
  assert.equal(
    completion.record.acknowledgementId,
    activation.binding.acknowledgementId,
  )
  assert.equal(completion.record.outcome, "needs_review")
  setup.task.comments.push({
    id: 2702,
    body: formatCompletionPacket({
      instructionId,
      originIssueNumber: sourceRun.originIssueNumber,
      originIssueUrl: sourceRun.originIssueUrl,
      codexThreadId: sourceRun.threadId,
      status: sourceRun.status,
      branch: sourceRun.branch,
      commits: sourceRun.commits,
      changedFiles: sourceRun.changedFiles,
      checks: sourceRun.checks,
      ownerQuestion: null,
      ownerRequest: sourceRun.ownerRequest,
      blockers: sourceRun.blockers,
      ownerGates: sourceRun.ownerGates,
      productionReadback: sourceRun.productionReadback,
      safetyFindings: sourceRun.safetyFindings,
      branchPushState: sourceRun.branchPushState,
      resultArtifact: sourceRun.resultArtifact,
      detail: "Original completed 027 result.",
    }),
  })
  setup.state.activeInstruction = null
  setup.state.gitReconciliationCheckpoints = [proposal]
  setup.state.checkpointActivationRecoveries = []
  return { ...setup, proposal, activation, sourceRun }
}

test("live-shaped #63 linked worktree receives only its exact Git metadata boundary", async (t) => {
  const setup = await fixture(t)
  const { boundary, workspacePath, checkoutPath } = setup
  assert.ok(boundary)
  const gitPointer = await readFile(path.join(workspacePath, ".git"), "utf8")
  const gitDirectory = await realpath(gitPointer.trim().slice("gitdir: ".length))
  const indexLock = path.join(gitDirectory, "index.lock")
  assert.equal(gitExecutionPathIsCovered({ writablePaths: [workspacePath] }, indexLock), false)
  assert.equal(gitExecutionPathIsCovered(boundary, indexLock), true)
  assert.equal(boundary.gitDirectory, gitDirectory)
  assert.equal(boundary.commonDirectory, path.join(checkoutPath, ".git"))
  assert.equal(boundary.writablePaths.includes(boundary.commonDirectory), false)
  assert.equal(
    boundary.writablePaths.includes(path.join(boundary.commonDirectory, "worktrees")),
    false,
  )
  assert.match(gitExecutionBoundaryPrompt(boundary), /with_additional_permissions/)
  assert.equal(
    await gitExecutionBoundaryIsCurrent(boundary, "cherry_pick"),
    true,
  )
  assert.equal(
    await gitExecutionBoundaryIsCurrent(boundary, "validation"),
    false,
  )

  const matched = matchGitExecutionBoundaryRequest({
    boundary,
    ...permissionRequest(boundary),
  })
  assert.equal(matched.action, "cherry_pick")
  assert.deepEqual(matched.response, {
    permissions: { fileSystem: { write: boundary.writablePaths } },
    scope: "turn",
    strictAutoReview: true,
  })
  for (const action of ["push", "pull_request"]) {
    const networkMatch = matchGitExecutionBoundaryRequest({
      boundary,
      ...permissionRequest(boundary, action),
    })
    assert.equal(networkMatch.action, action)
    assert.deepEqual(networkMatch.response.permissions, {
      network: { enabled: true },
    })
  }

  const validationCommand = boundary.commands.validation[0]
  const validationReview = {
    request: {
      method: "item/commandExecution/requestApproval",
      threadId: boundary.threadId,
      turnId: "turn-63-010",
      itemId: "item-validation",
      details: {
        command: validationCommand,
        cwd: boundary.workspacePath,
        reason: null,
        networkApprovalContext: null,
        proposedExecpolicyAmendment: null,
        proposedNetworkPolicyAmendments: null,
      },
    },
    commandExecution: {
      id: "item-validation",
      type: "commandExecution",
      source: "agent",
      status: "inProgress",
      cwd: boundary.workspacePath,
      command: validationCommand,
    },
  }
  assert.deepEqual(
    matchGitExecutionBoundaryRequest({ boundary, ...validationReview }),
    { action: "validation", response: { decision: "accept" } },
  )

  const before = await fileSnapshot(boundary.commonDirectory)
  await git(
    workspacePath,
    "-c",
    "core.hooksPath=/dev/null",
    "-c",
    "commit.gpgSign=false",
    "-c",
    "rerere.enabled=false",
    "cherry-pick",
    setup.cherryPickCommit,
  )
  const after = await fileSnapshot(boundary.commonDirectory)
  const changedMetadata = [...new Set([...before.keys(), ...after.keys()])].filter(
    (target) => before.get(target) !== after.get(target),
  )
  assert.ok(changedMetadata.length > 0)
  assert.deepEqual(
    changedMetadata.filter(
      (target) => !gitExecutionPathIsCovered(boundary, target),
    ),
    [],
  )
  assert.equal(
    await gitExecutionBoundaryIsCurrent(boundary, "cherry_pick"),
    false,
  )
  for (const action of ["validation", "push", "pull_request"]) {
    assert.equal(await gitExecutionBoundaryIsCurrent(boundary, action), true)
  }
})

test("live-shaped #63/011 reuses the exact 010 receipt and grants only its selected worktree", async (t) => {
  const setup = await fixture(t, { execution011: true })
  const { boundary, state, workspacePath, workspaceRoot, checkoutPath, head } =
    setup
  assert.ok(boundary)
  assert.equal(boundary.instructionId, issue63ExecutionInstructionId)
  assert.equal(boundary.provenanceMode, "historical_reconciliation")
  assert.equal(
    boundary.priorPredicateCode,
    "activation_reconciliation_current_instruction_missing",
  )
  assert.equal(
    boundary.reconciliationInstructionId,
    issue63ContinuationInstructionId,
  )
  assert.deepEqual(boundary.interveningExecutionInstructionIds, [
    issue63ContinuationInstructionId,
  ])
  assert.equal(
    state.workspaceBranchReconciliations.filter(
      (record) =>
        record.continuationInstructionId === issue63ExecutionInstructionId,
    ).length,
    0,
  )

  const indexLock = path.join(boundary.gitDirectory, "index.lock")
  assert.equal(gitExecutionPathIsCovered(boundary, indexLock), true)
  await writeFile(indexLock, "bounded test lock\n")
  assert.equal(await readFile(indexLock, "utf8"), "bounded test lock\n")
  await unlink(indexLock)

  const siblingWorkspace = path.join(
    workspaceRoot,
    "issue-64-grant-path-negative-001",
  )
  await git(
    checkoutPath,
    "worktree",
    "add",
    "-b",
    "agent/issue-64-grant-path-negative-001",
    siblingWorkspace,
    head,
  )
  const siblingPointer = await readFile(path.join(siblingWorkspace, ".git"), "utf8")
  const siblingGitDirectory = await realpath(
    siblingPointer.trim().slice("gitdir: ".length),
  )
  const siblingLock = path.join(siblingGitDirectory, "index.lock")
  assert.equal(gitExecutionPathIsCovered(boundary, siblingLock), false)

  const exactRequest = permissionRequest(boundary)
  exactRequest.request.turnId = "turn-production-day1-git-reconciliation-execution-011"
  const decision = gitExecutionBoundaryRequestDecision({
    boundary,
    ...exactRequest,
  })
  assert.equal(decision.accepted, true)
  assert.equal(decision.value.action, "cherry_pick")

  const siblingRequest = structuredClone(exactRequest)
  siblingRequest.request.details.permissions.fileSystem.write.push(siblingLock)
  const siblingDecision = gitExecutionBoundaryRequestDecision({
    boundary,
    ...siblingRequest,
  })
  assert.equal(siblingDecision.accepted, false)
  assert.equal(siblingDecision.rejection.code, "request_filesystem_permissions")

  await execFileAsync(
    "/bin/zsh",
    ["-lc", boundary.commands.cherry_pick[0]],
    { cwd: workspacePath, encoding: "utf8" },
  )
  assert.equal(await git(workspacePath, "rev-parse", "HEAD^"), head)
  assert.equal(
    await git(workspacePath, "rev-parse", "HEAD^{tree}"),
    await git(workspacePath, "rev-parse", `${setup.cherryPickCommit}^{tree}`),
  )
})

test("live-shaped #63/012 accepts structured 011 pre-application evidence without legacy index wording", async (t) => {
  const setup = await fixture(t, { execution012: true })
  const {
    boundary,
    state,
    workspacePath,
    workspaceRoot,
    checkoutPath,
    head,
  } = setup
  assert.ok(boundary)
  assert.equal(boundary.instructionId, issue63HistoricalGrantInstructionId)
  assert.equal(boundary.provenanceMode, "historical_reconciliation")
  assert.deepEqual(boundary.interveningExecutionInstructionIds, [
    issue63ContinuationInstructionId,
    issue63ExecutionInstructionId,
  ])
  const failedGrantRun = state.runs.at(-1)
  assert.equal(failedGrantRun.instructionId, issue63ExecutionInstructionId)
  assert.doesNotMatch(
    failedGrantRun.resultArtifact.finalMessage,
    /linked worktree(?:'|’|\s)s?\s*`index\.lock`/i,
  )

  const selectedLock = path.join(boundary.gitDirectory, "index.lock")
  assert.equal(gitExecutionPathIsCovered(boundary, selectedLock), true)
  await writeFile(selectedLock, "bounded #63/012 lock\n")
  assert.equal(await readFile(selectedLock, "utf8"), "bounded #63/012 lock\n")
  await unlink(selectedLock)

  const siblingWorkspace = path.join(
    workspaceRoot,
    "issue-64-historical-grant-negative-001",
  )
  await git(
    checkoutPath,
    "worktree",
    "add",
    "-b",
    "agent/issue-64-historical-grant-negative-001",
    siblingWorkspace,
    head,
  )
  const siblingPointer = await readFile(path.join(siblingWorkspace, ".git"), "utf8")
  const siblingGitDirectory = await realpath(
    siblingPointer.trim().slice("gitdir: ".length),
  )
  const siblingLock = path.join(siblingGitDirectory, "index.lock")
  assert.equal(gitExecutionPathIsCovered(boundary, siblingLock), false)

  const exactRequest = permissionRequest(boundary)
  exactRequest.request.turnId =
    "turn-production-day1-git-reconciliation-execution-012"
  const exactDecision = gitExecutionBoundaryRequestDecision({
    boundary,
    ...exactRequest,
  })
  assert.equal(exactDecision.accepted, true)
  assert.equal(exactDecision.value.action, "cherry_pick")
  const siblingRequest = structuredClone(exactRequest)
  siblingRequest.request.details.permissions.fileSystem.write.push(siblingLock)
  assert.equal(
    gitExecutionBoundaryRequestDecision({
      boundary,
      ...siblingRequest,
    }).rejection.code,
    "request_filesystem_permissions",
  )

  const legacyOnlyState = structuredClone(state)
  delete legacyOnlyState.runs.at(-1).resultArtifact.findings
  legacyOnlyState.runs.at(-1).resultArtifact.finalMessage +=
    "\nprivate-token-must-not-appear"
  let rejection = null
  assert.equal(
    await authorizedGitExecutionBoundary({
      ...setup,
      state: legacyOnlyState,
      onDiagnostic: (value) => {
        rejection = value
      },
    }),
    null,
  )
  assert.equal(
    rejection.code,
    "activation_historical_run_index_lock_evidence",
  )
  assert.doesNotMatch(JSON.stringify(rejection), /private-token-must-not-appear/)
})

test("#63/012 structured historical proof fails closed on mutation and Git-state conflicts", async (t) => {
  const setup = await fixture(t, { execution012: true })
  const rejectionFor = async (mutate) => {
    const state = structuredClone(setup.state)
    mutate(state.runs.at(-1))
    let diagnostic = null
    const boundary = await authorizedGitExecutionBoundary({
      ...setup,
      state,
      onDiagnostic: (value) => {
        diagnostic = value
      },
    })
    assert.equal(boundary, null)
    return diagnostic.code
  }

  assert.equal(
    await rejectionFor((run) => run.changedFiles.push("unexpected/source.ts")),
    "activation_historical_run_structured_changed_files_conflict",
  )
  assert.equal(
    await rejectionFor((run) => {
      run.changedFiles = { length: 30 }
    }),
    "activation_historical_run_structured_changed_files_invalid",
  )
  assert.equal(
    await rejectionFor((run) => {
      run.resultArtifact.findings.productionReadback = []
    }),
    "activation_historical_run_structured_findings_conflict",
  )
  assert.equal(
    await rejectionFor((run) => {
      run.safetyFindings.push("CHERRY_PICK_HEAD remains present.")
      run.resultArtifact.findings.safetyFindings.push(
        "CHERRY_PICK_HEAD remains present.",
      )
    }),
    "activation_historical_run_structured_git_state_conflict",
  )
  assert.equal(
    await rejectionFor((run) => {
      run.branchPushState[1] = "Push: **ATTEMPTED**"
      run.resultArtifact.findings.branchPushState[1] = "Push: **ATTEMPTED**"
    }),
    "activation_historical_run_structured_push_conflict",
  )
  assert.equal(
    await rejectionFor((run) => {
      run.resultArtifact.finalMessage =
        run.resultArtifact.finalMessage.replace(
          "FAILED before application",
          "FAILED after partial application",
        )
    }),
    "activation_historical_run_structured_final_message_conflict",
  )
})

test("live-shaped #63/014 grants only the selected worktree through the exact 010 to 013 tail", async (t) => {
  const setup = await fixture(t, { execution014: true })
  const {
    boundary,
    checkoutPath,
    head,
    state,
    workspaceRoot,
  } = setup
  assert.ok(boundary)
  assert.equal(boundary.instructionId, issue63DiagnosticInstructionId)
  assert.equal(boundary.provenanceMode, "historical_reconciliation")
  assert.equal(
    boundary.reconciliationInstructionId,
    issue63ContinuationInstructionId,
  )
  assert.deepEqual(boundary.interveningExecutionInstructionIds, [
    issue63ContinuationInstructionId,
    issue63ExecutionInstructionId,
    issue63HistoricalGrantInstructionId,
    issue63HistoricalGrantRetryInstructionId,
  ])
  assert.equal(state.workspaceBranchReconciliations.length, 1)
  assert.deepEqual(
    state.runs.slice(-4).map((run) => run.instructionId),
    [
      issue63ContinuationInstructionId,
      issue63ExecutionInstructionId,
      issue63HistoricalGrantInstructionId,
      issue63HistoricalGrantRetryInstructionId,
    ],
  )

  const live012 = state.runs.at(-2)
  assert.match(
    live012.productionReadback[0],
    /No alternate mechanism, production change, migration, deployment, receipt, or remote Git mutation was attempted\./,
  )
  assert.match(
    live012.resultArtifact.finalMessage,
    /Worktree: clean; zero commits above base; no Git operation markers/,
  )
  const live013 = state.runs.at(-1)
  assert.match(
    live013.productionReadback.at(-1),
    /No source, remote Git, production, migration, deployment, purchase, or receipt mutation occurred\./,
  )
  assert.equal(live013.branchPushState[1], "Push/PR: **NOT ATTEMPTED**")

  const selectedLock = path.join(boundary.gitDirectory, "index.lock")
  assert.equal(gitExecutionPathIsCovered(boundary, selectedLock), true)
  await writeFile(selectedLock, "bounded #63/014 lock\n")
  assert.equal(await readFile(selectedLock, "utf8"), "bounded #63/014 lock\n")
  await unlink(selectedLock)

  const siblingWorkspace = path.join(
    workspaceRoot,
    "issue-64-diagnostic-014-negative-001",
  )
  await git(
    checkoutPath,
    "worktree",
    "add",
    "-b",
    "agent/issue-64-diagnostic-014-negative-001",
    siblingWorkspace,
    head,
  )
  const siblingPointer = await readFile(path.join(siblingWorkspace, ".git"), "utf8")
  const siblingGitDirectory = await realpath(
    siblingPointer.trim().slice("gitdir: ".length),
  )
  const siblingLock = path.join(siblingGitDirectory, "index.lock")
  assert.equal(gitExecutionPathIsCovered(boundary, siblingLock), false)

  const exactRequest = permissionRequest(boundary)
  exactRequest.request.turnId =
    "turn-production-day1-git-reconciliation-execution-014"
  const exactDecision = gitExecutionBoundaryRequestDecision({
    boundary,
    ...exactRequest,
  })
  assert.equal(exactDecision.accepted, true)
  assert.equal(exactDecision.value.action, "cherry_pick")
  const siblingRequest = structuredClone(exactRequest)
  siblingRequest.request.details.permissions.fileSystem.write.push(siblingLock)
  assert.equal(
    gitExecutionBoundaryRequestDecision({
      boundary,
      ...siblingRequest,
    }).rejection.code,
    "request_filesystem_permissions",
  )
})

test("#63/014 exact normalization rejects mutation and combined push/PR conflicts", async (t) => {
  const setup = await fixture(t, { execution014: true })
  assert.ok(setup.boundary)
  const rejectionFor = async (mutate) => {
    const state = structuredClone(setup.state)
    mutate(state.runs.at(-1))
    let diagnostic = null
    assert.equal(
      await authorizedGitExecutionBoundary({
        ...setup,
        state,
        onDiagnostic: (value) => {
          diagnostic = value
        },
      }),
      null,
    )
    return diagnostic
  }

  const mutationDiagnostic = await rejectionFor((run) => {
    const mutation = "A source or remote Git mutation occurred."
    run.productionReadback[1] = mutation
    run.resultArtifact.findings.productionReadback[1] = mutation
    run.resultArtifact.finalMessage += "\ncredential-value-must-not-be-emitted"
  })
  assert.deepEqual(mutationDiagnostic, {
    code: "activation_historical_run_structured_mutation_conflict",
  })
  assert.doesNotMatch(
    JSON.stringify(mutationDiagnostic),
    /credential-value-must-not-be-emitted/,
  )
  assert.deepEqual(
    await rejectionFor((run) => {
      const mutation = "A purchase mutation occurred."
      run.productionReadback[1] = mutation
      run.resultArtifact.findings.productionReadback[1] = mutation
    }),
    { code: "activation_historical_run_structured_mutation_conflict" },
  )
  for (const status of ["ATTEMPTED", "UNKNOWN"]) {
    assert.deepEqual(
      await rejectionFor((run) => {
        run.branchPushState[1] = `Push/PR: **${status}**`
        run.resultArtifact.findings.branchPushState[1] =
          `Push/PR: **${status}**`
      }),
      { code: "activation_historical_run_structured_push_conflict" },
    )
  }
  assert.deepEqual(
    await rejectionFor((run) => {
      run.resultArtifact.finalMessage =
        run.resultArtifact.finalMessage.replace(
          "Push/PR: **NOT ATTEMPTED**",
          "Push/PR: **ATTEMPTED**",
        )
    }),
    { code: "activation_historical_run_structured_final_message_conflict" },
  )
  assert.deepEqual(
    await rejectionFor((run) => {
      run.resultArtifact.finalMessage =
        run.resultArtifact.finalMessage.replace(
          "Push/PR: **NOT ATTEMPTED**",
          "Push/PR: **NOT ATTEMPTED**; PR state unknown",
        )
    }),
    { code: "activation_historical_run_structured_final_message_conflict" },
  )
})

test("live-shaped #63/015 stays fail-closed without a complete command ledger", async (t) => {
  const setup = await fixture(t, { execution015: true })
  assert.equal(setup.boundary, null)
  assert.equal(
    setup.state.activeInstruction.instructionId,
    issue63FallbackDiagnosticInstructionId,
  )
  assert.deepEqual(
    setup.state.runs.slice(-5).map((run) => run.instructionId),
    [
      issue63ContinuationInstructionId,
      issue63ExecutionInstructionId,
      issue63HistoricalGrantInstructionId,
      issue63HistoricalGrantRetryInstructionId,
      issue63DiagnosticInstructionId,
    ],
  )
  const live014 = setup.state.runs.at(-1)
  assert.equal(live014.instructionId, issue63DiagnosticInstructionId)
  assert.equal(live014.branch, issue63ReconciledBranch)
  assert.deepEqual(live014.commits, [setup.head])
  assert.deepEqual(live014.changedFiles, issue63LiveChangedFiles)
  assert.deepEqual(live014.productionReadback, [])
  assert.deepEqual(live014.resultArtifact.findings.productionReadback, [])
  assert.deepEqual(
    live014.resultArtifact.findings.branchPushState,
    live014.branchPushState,
  )
  assert.equal(live014.turnCount, 1)
  assert.equal(live014.resultArtifact.source, "completed_turn_final_message")
  assert.equal(live014.resultArtifact.turnStatus, "completed")
  assert.equal(live014.checks.diffCheck, "pass")
  assert.equal(live014.resultArtifact.checks.diffCheck.status, "pass")
  const commandEvidence =
    live014.resultArtifact.checks.diffCheck.evidence.filter(
      (evidence) => evidence.source === "command_execution",
    )
  assert.equal(commandEvidence.length, 1)
  assert.deepEqual(Object.keys(commandEvidence[0]).sort(), [
    "source",
    "status",
    "summary",
  ])
  assert.equal(commandEvidence[0].status, "pass")
  assert.match(commandEvidence[0].summary, /git status --porcelain=v1/)
  assert.match(
    commandEvidence[0].summary,
    new RegExp(`git rev-list --count ${setup.head}\\.\\.HEAD`),
  )
  for (const marker of [
    "CHERRY_PICK_HEAD",
    "MERGE_HEAD",
    "REVERT_HEAD",
    "REBASE_HEAD",
  ]) {
    assert.match(commandEvidence[0].summary, new RegExp(marker))
  }
  assert.match(commandEvidence[0].summary, /git diff --check/)
  assert.match(commandEvidence[0].summary, /\(completed, exit 0\)/)
  assert.equal(Object.hasOwn(live014, "commandExecutions"), false)
  assert.equal(Object.hasOwn(live014.resultArtifact, "commands"), false)
  assert.equal(
    Object.hasOwn(live014.resultArtifact, "commandExecutions"),
    false,
  )
  assert.equal(Object.hasOwn(commandEvidence[0], "stdout"), false)
  assert.equal(Object.hasOwn(commandEvidence[0], "results"), false)
  assert.match(
    live014.resultArtifact.finalMessage,
    /No fallback path or mutation was attempted\./,
  )
  assert.match(
    live014.resultArtifact.finalMessage,
    /linked-worktree `index\.lock: Operation not permitted`/,
  )

  const state = structuredClone(setup.state)
  state.runs.at(-1).resultArtifact.finalMessage +=
    "\ncredential-value-must-not-be-emitted"
  const diagnostics = []
  for (let attempt = 0; attempt < 2; attempt += 1) {
    assert.equal(
      await authorizedGitExecutionBoundary({
        ...setup,
        state,
        onDiagnostic: (value) => diagnostics.push(value),
      }),
      null,
    )
  }
  assert.deepEqual(diagnostics, [
    {
      code: "activation_historical_run_index_lock_evidence",
      structuredReason:
        "activation_historical_run_structured_no_mutation_evidence",
      legacyReason: "activation_historical_run_index_lock_evidence",
      proofMode: "legacy_fallback",
    },
    {
      code: "activation_historical_run_index_lock_evidence",
      structuredReason:
        "activation_historical_run_structured_no_mutation_evidence",
      legacyReason: "activation_historical_run_index_lock_evidence",
      proofMode: "legacy_fallback",
    },
  ])
  assert.doesNotMatch(
    JSON.stringify(diagnostics),
    /credential-value-must-not-be-emitted/,
  )
})

test("live-shaped #63/010-015 tail creates one immutable proposal and requires a separate exact activation", async (t) => {
  const setup = await checkpointSetup(t)
  assert.equal(setup.proposal.accepted, true, JSON.stringify(setup.proposal))
  assert.equal(setup.proposal.value.isNew, true)
  const proposal = setup.proposal.value.record
  assert.equal(proposal.kind, "proposal")
  assert.equal(proposal.originIssueNumber, 63)
  assert.equal(proposal.branch, issue63ReconciledBranch)
  assert.equal(proposal.head, setup.head)
  assert.equal(proposal.tree, setup.tree)
  assert.equal(proposal.cherryPickCommit, setup.cherryPickCommit)
  assert.equal(proposal.ownerActivationRequired, true)
  assert.equal(proposal.verification.dirty, false)
  assert.equal(proposal.verification.commitsAboveReviewedHead, 0)
  assert.deepEqual(proposal.verification.operationMarkers, [])
  assert.equal(proposal.verification.remoteIntegrationBranch, "absent")
  assert.equal(proposal.verification.pullRequestCount, 0)
  assert.deepEqual(proposal.priorRejectedProposalInstructionIds, [])
  assert.deepEqual(proposal.supersededTailInstructionIds.slice(-6), [
    issue63ContinuationInstructionId,
    issue63ExecutionInstructionId,
    issue63HistoricalGrantInstructionId,
    issue63HistoricalGrantRetryInstructionId,
    issue63DiagnosticInstructionId,
    issue63FallbackDiagnosticInstructionId,
  ])
  const immutableTail = JSON.stringify(setup.state.runs)
  setup.state.gitReconciliationCheckpoints.push(proposal)

  const ownerReason = gitReconciliationCheckpointOwnerReason(proposal)
  setup.state.runs.push({
    instructionId: proposal.proposalInstructionId,
    status: "needs_owner",
    threadId: issue63ThreadId,
    workspacePath: setup.workspacePath,
    branch: issue63ReconciledBranch,
    commits: [setup.head],
    changedFiles: structuredClone(issue63LiveChangedFiles),
    turnCount: 0,
    originIssueNumber: 63,
    originIssueUrl: issue63OriginUrl,
    ownerRequest: {
      method: "control-plane/gitReconciliationCheckpointActivation",
      reason: ownerReason,
    },
    checks: {
      typecheck: "not_run",
      lint: "not_run",
      tests: "not_run",
      cloudflareReadiness: "not_run",
      build: "not_run",
      diffCheck: "not_run",
    },
    blockers: [],
    ownerGates: [ownerReason],
    productionReadback: [],
    safetyFindings: [],
    branchPushState: [],
    resultArtifact: null,
    completedAt: "2026-08-23T10:00:01.000Z",
  })
  const activationInstructionId =
    "production-day1-git-reconciliation-checkpoint-activation-017"
  const activationPrompt = gitReconciliationCheckpointActivationPrompt({
    checkpointId: proposal.checkpointId,
    reconciliationId: proposal.reconciliationId,
    head: proposal.head,
    tree: proposal.tree,
    cherryPickCommit: proposal.cherryPickCommit,
  })
  const activationBody = checkpointControl({
    instructionId: activationInstructionId,
    taskState: "needs_owner",
    prompt: activationPrompt,
  })
  setup.task.comments.push({ body: activationBody })
  const [activationInstruction] = extractAgentControls(activationBody)
  setup.state.status = "needs_owner"
  setup.state.activeInstruction = {
    ...activationInstruction,
    phase: "selected",
  }
  const activationInput = {
    ...setup,
    state: setup.state,
    instruction: activationInstruction,
  }
  const boundary = await authorizedGitExecutionBoundary(activationInput)
  assert.ok(boundary)
  assert.equal(boundary.provenanceMode, "superseding_checkpoint")
  assert.equal(boundary.checkpointId, proposal.checkpointId)
  assert.equal(boundary.checkpointActivationIsNew, true)
  assert.equal(
    gitExecutionPathIsCovered(
      boundary,
      path.join(boundary.gitDirectory, "index.lock"),
    ),
    true,
  )
  const sibling = path.join(
    boundary.commonDirectory,
    "worktrees",
    "issue-63-sibling",
    "index.lock",
  )
  assert.equal(gitExecutionPathIsCovered(boundary, sibling), false)
  assert.equal(
    matchGitExecutionBoundaryRequest({
      boundary,
      ...permissionRequest(boundary),
    }).action,
    "cherry_pick",
  )
  const broadened = permissionRequest(boundary)
  broadened.request.details.permissions.fileSystem.write.push(sibling)
  assert.equal(
    gitExecutionBoundaryRequestDecision({ boundary, ...broadened }).rejection
      .code,
    "request_filesystem_permissions",
  )
  const unrelated = permissionRequest(boundary)
  unrelated.commandExecution.command = "git status"
  assert.equal(
    gitExecutionBoundaryRequestDecision({ boundary, ...unrelated }).rejection
      .code,
    "request_command_unrecognized",
  )

  boundary.checkpointActivation.activatedAt =
    "2026-08-23T10:01:00.000Z"
  setup.state.gitReconciliationCheckpoints.push(
    boundary.checkpointActivation,
  )
  const restartedState = structuredClone(setup.state)
  const restarted = await authorizedGitExecutionBoundary({
    ...activationInput,
    state: restartedState,
  })
  assert.ok(restarted)
  assert.equal(restarted.checkpointActivationIsNew, false)
  assert.equal(restarted.checkpointId, proposal.checkpointId)
  assert.equal(restartedState.gitReconciliationCheckpoints.length, 2)
  assert.equal(JSON.stringify(setup.state.runs.slice(0, -1)), immutableTail)

  const duplicateState = structuredClone(restartedState)
  duplicateState.gitReconciliationCheckpoints.splice(
    1,
    0,
    structuredClone(proposal),
  )
  let duplicateDiagnostic = null
  assert.equal(
    await authorizedGitExecutionBoundary({
      ...activationInput,
      state: duplicateState,
      onDiagnostic: (diagnostic) => {
        duplicateDiagnostic = diagnostic
      },
    }),
    null,
  )
  assert.equal(duplicateDiagnostic.code, "checkpoint_proposal_count")
})

test("live-shaped #63 proposal retries prove a separate immutable post-015 audit suffix", async (t) => {
  const once = await checkpointSetup(t)
  appendRejectedCheckpointProposalAttempt(once, {
    instructionId: once.proposalInstruction.instructionId,
    blocker: "checkpoint_proposal_exception",
    addControl: false,
  })
  const proposal017 = selectCheckpointProposal(
    once,
    "production-day1-git-reconciliation-checkpoint-proposal-017",
    once.proposalInstruction.prompt,
  ).instruction
  const onceHistory = JSON.stringify(once.state.runs)
  const retry017 = await proposeGitReconciliationCheckpoint({
    ...once,
    state: once.state,
    instruction: proposal017,
    now: new Date("2026-08-23T10:02:00.000Z"),
  })
  assert.equal(retry017.accepted, true, JSON.stringify(retry017))
  assert.deepEqual(retry017.value.record.supersededTailInstructionIds, [
    issue63ContinuationInstructionId,
    issue63ExecutionInstructionId,
    issue63HistoricalGrantInstructionId,
    issue63HistoricalGrantRetryInstructionId,
    issue63DiagnosticInstructionId,
    issue63FallbackDiagnosticInstructionId,
  ])
  assert.deepEqual(retry017.value.record.priorRejectedProposalInstructionIds, [
    once.proposalInstruction.instructionId,
  ])
  assert.equal(JSON.stringify(once.state.runs), onceHistory)
  assert.deepEqual(once.state.gitReconciliationCheckpoints, [])

  const multiple = await checkpointSetup(t)
  appendRejectedCheckpointProposalAttempt(multiple, {
    instructionId: multiple.proposalInstruction.instructionId,
    blocker: "checkpoint_proposal_exception",
    addControl: false,
  })
  appendRejectedCheckpointProposalAttempt(multiple, {
    instructionId:
      "production-day1-git-reconciliation-checkpoint-proposal-017",
    blocker: "checkpoint_historical_tail_scope",
  })
  const proposal018 = selectCheckpointProposal(
    multiple,
    "production-day1-git-reconciliation-checkpoint-proposal-018",
    multiple.proposalInstruction.prompt,
  ).instruction
  const retry018 = await proposeGitReconciliationCheckpoint({
    ...multiple,
    state: multiple.state,
    instruction: proposal018,
    now: new Date("2026-08-23T10:03:00.000Z"),
  })
  assert.equal(retry018.accepted, true, JSON.stringify(retry018))
  assert.deepEqual(
    retry018.value.record.priorRejectedProposalInstructionIds,
    [
      multiple.proposalInstruction.instructionId,
      "production-day1-git-reconciliation-checkpoint-proposal-017",
    ],
  )
})

test("exact live #63 proposal-018 rejects the changed tree in preserved proposal-016", async (t) => {
  const setup = await checkpointSetup(t)
  const livePriorTree = "2330f747713ce620c7927c2c505c622b40e18386"
  const liveProposal018Tree = "2330f747f09933c522cb410ae671250583239840"
  const reconciliationId =
    setup.state.workspaceBranchReconciliations[0].reconciliationId
  const priorPrompt = gitReconciliationCheckpointProposalPrompt({
    reconciliationId,
    head: setup.head,
    tree: livePriorTree,
    cherryPickCommit: setup.cherryPickCommit,
  })
  const proposal016Comment = setup.task.comments.find((comment) =>
    comment.body.includes(
      "production-day1-git-reconciliation-checkpoint-proposal-016",
    ),
  )
  proposal016Comment.body = checkpointControl({
    instructionId: setup.proposalInstruction.instructionId,
    taskState: "needs_review",
    prompt: priorPrompt,
  })
  appendRejectedCheckpointProposalAttempt(setup, {
    instructionId: setup.proposalInstruction.instructionId,
    blocker: "checkpoint_proposal_exception",
    addControl: false,
  })
  appendRejectedCheckpointProposalAttempt(setup, {
    instructionId:
      "production-day1-git-reconciliation-checkpoint-proposal-017",
    blocker: "checkpoint_historical_tail_scope",
    prompt: priorPrompt,
  })
  const proposal018 = selectCheckpointProposal(
    setup,
    "production-day1-git-reconciliation-checkpoint-proposal-018",
    gitReconciliationCheckpointProposalPrompt({
      reconciliationId,
      head: setup.head,
      tree: liveProposal018Tree,
      cherryPickCommit: setup.cherryPickCommit,
    }),
  ).instruction
  let diagnostic = null
  const result = await proposeGitReconciliationCheckpoint({
    ...setup,
    state: setup.state,
    instruction: proposal018,
    onDiagnostic: (value) => {
      diagnostic = value
    },
  })
  assert.equal(result.accepted, false)
  assert.deepEqual(diagnostic, {
    code: "checkpoint_post_tail_control_tree",
    instructionId: setup.proposalInstruction.instructionId,
  })
  assert.deepEqual(setup.state.gitReconciliationCheckpoints, [])
})

test("exact live #63/010-018 history creates one fresh generation without reinterpreting rejected proposal-018", async (t) => {
  const setup = await checkpointGenerationSetup(t)
  assert.equal(
    setup.generationProposal.accepted,
    true,
    JSON.stringify(setup.generationProposal),
  )
  const proposal = setup.generationProposal.value.record
  assert.equal(proposal.schemaVersion, 2)
  assert.equal(proposal.generation, 2)
  assert.match(
    proposal.generationId,
    /^git-reconciliation-checkpoint-generation:[0-9a-f]{64}$/,
  )
  assert.equal(proposal.tree, setup.tree)
  assert.deepEqual(proposal.rejectedProposalAudit.instructionIds, [
    "production-day1-git-reconciliation-checkpoint-proposal-016",
    "production-day1-git-reconciliation-checkpoint-proposal-017",
    "production-day1-git-reconciliation-checkpoint-proposal-018",
  ])
  assert.match(proposal.rejectedProposalAudit.digest, /^[0-9a-f]{64}$/)
  assert.deepEqual(
    proposal.rejectedProposalAudit.attempts.map((attempt) => ({
      instructionId: attempt.instructionId,
      rejectionCode: attempt.rejectionCode,
      tree: attempt.tree,
    })),
    [
      {
        instructionId:
          "production-day1-git-reconciliation-checkpoint-proposal-016",
        rejectionCode: "checkpoint_proposal_exception",
        tree: setup.livePriorTree,
      },
      {
        instructionId:
          "production-day1-git-reconciliation-checkpoint-proposal-017",
        rejectionCode: "checkpoint_historical_tail_scope",
        tree: setup.livePriorTree,
      },
      {
        instructionId:
          "production-day1-git-reconciliation-checkpoint-proposal-018",
        rejectionCode: "checkpoint_post_tail_control_binding",
        tree: setup.liveConflicting018Tree,
      },
    ],
  )
  assert.notEqual(
    proposal.rejectedProposalAudit.attempts[2].tree,
    proposal.tree,
  )
  assert.equal(JSON.stringify(setup.state.runs), setup.immutableHistory)
  assert.deepEqual(setup.state.gitReconciliationCheckpoints, [])
  assert.equal(setup.generationProposal.value.isNew, true)
  assert.equal(
    await authorizedGitExecutionBoundary({
      ...setup,
      state: setup.state,
      instruction: setup.generationInstruction,
    }),
    null,
  )

  setup.state.gitReconciliationCheckpoints.push(proposal)
  appendAcceptedCheckpointProposalRun(setup, proposal)
  const { instruction: activationInstruction } =
    selectAcknowledgedGenerationActivation(
      setup,
      proposal,
      "production-day1-git-reconciliation-checkpoint-generation-activation-020",
    )
  const activationInput = {
    ...setup,
    state: setup.state,
    instruction: activationInstruction,
  }

  const withoutOwnerControl = structuredClone(setup.task)
  withoutOwnerControl.comments = withoutOwnerControl.comments.filter(
    (comment) => !comment.body.includes(activationInstruction.instructionId),
  )
  assert.equal(
    await authorizedGitExecutionBoundary({
      ...activationInput,
      task: withoutOwnerControl,
    }),
    null,
  )

  const boundary = await authorizedGitExecutionBoundary(activationInput)
  assert.ok(boundary)
  assert.equal(boundary.checkpointId, proposal.checkpointId)
  assert.equal(boundary.checkpointActivationIsNew, true)
  assert.equal(boundary.checkpointActivation.generation, 2)
  assert.equal(
    boundary.checkpointActivation.rejectedProposalAuditDigest,
    proposal.rejectedProposalAudit.digest,
  )
  assert.equal(
    gitExecutionPathIsCovered(
      boundary,
      path.join(boundary.gitDirectory, "index.lock"),
    ),
    true,
  )
  assert.equal(
    gitExecutionPathIsCovered(
      boundary,
      path.join(
        boundary.commonDirectory,
        "worktrees",
        "issue-63-sibling",
        "index.lock",
      ),
    ),
    false,
  )

  const driftedHistory = structuredClone(setup.state)
  driftedHistory.runs.at(-2).completedAt = "2026-08-23T10:03:01.000Z"
  let driftDiagnostic = null
  assert.equal(
    await authorizedGitExecutionBoundary({
      ...activationInput,
      state: driftedHistory,
      onDiagnostic: (diagnostic) => {
        driftDiagnostic = diagnostic
      },
    }),
    null,
  )
  assert.equal(driftDiagnostic.code, "checkpoint_generation_audit_drift")

  boundary.checkpointActivation.activatedAt = "2026-08-23T10:05:00.000Z"
  setup.state.gitReconciliationCheckpoints.push(boundary.checkpointActivation)
  const restarted = await authorizedGitExecutionBoundary({
    ...activationInput,
    state: structuredClone(setup.state),
  })
  assert.ok(restarted)
  assert.equal(restarted.checkpointActivationIsNew, false)
  assert.equal(setup.state.gitReconciliationCheckpoints.length, 2)
  assert.equal(
    JSON.stringify(setup.state.runs.slice(0, -1)),
    setup.immutableHistory,
  )
})

test("generation audit fails closed on post-tail mutation, ambiguity, activation, and malformed controls", async (t) => {
  const setup = await checkpointGenerationSetup(t)
  assert.equal(setup.generationProposal.accepted, true)
  const baselineState = structuredClone(setup.state)
  const baselineTask = structuredClone(setup.task)
  const invoke = async ({ mutateState = () => {}, mutateTask = () => {} }) => {
    const state = structuredClone(baselineState)
    const task = structuredClone(baselineTask)
    mutateState(state)
    mutateTask(task)
    return proposeGitReconciliationCheckpoint({
      ...setup,
      state,
      task,
      instruction: state.activeInstruction,
      now: new Date("2026-08-23T10:04:00.000Z"),
    })
  }
  assert.equal(
    (
      await invoke({
        mutateState: (state) => {
          state.runs.at(-1).turnCount = 1
        },
      })
    ).rejection.code,
    "checkpoint_generation_audit_run_shape",
  )
  assert.equal(
    (
      await invoke({
        mutateState: (state) => {
          state.runs.at(-1).commits.push("f".repeat(40))
        },
      })
    ).rejection.code,
    "checkpoint_generation_audit_run_shape",
  )
  assert.equal(
    (
      await invoke({
        mutateState: (state) => {
          state.runs.at(-1).blockers = ["checkpoint_historical_tail_scope"]
        },
      })
    ).rejection.code,
    "checkpoint_generation_audit_evidence",
  )
  assert.equal(
    (
      await invoke({
        mutateTask: (task) => {
          const index = task.comments.findIndex((comment) =>
            comment.body.includes(
              "production-day1-git-reconciliation-checkpoint-proposal-018",
            ),
          )
          task.comments[index].body = task.comments[index].body.replace(
            setup.liveConflicting018Tree,
            setup.livePriorTree,
          )
        },
      })
    ).rejection.code,
    "checkpoint_generation_audit_tree_conflict",
  )
  assert.equal(
    (
      await invoke({
        mutateState: (state) => {
          state.runs.splice(-1, 0, {
            ...structuredClone(state.runs.at(-1)),
            instructionId: "unrelated-post-tail-run",
          })
        },
      })
    ).rejection.code,
    "checkpoint_generation_audit_scope",
  )
  assert.equal(
    (
      await invoke({
        mutateTask: (task) => {
          const control = task.comments.find((comment) =>
            comment.body.includes(
              "production-day1-git-reconciliation-checkpoint-proposal-018",
            ),
          )
          task.comments.push(structuredClone(control))
        },
      })
    ).accepted,
    true,
  )
  assert.equal(
    (
      await invoke({
        mutateTask: (task) => {
          const control = task.comments.find((comment) =>
            comment.body.includes(
              "production-day1-git-reconciliation-checkpoint-proposal-018",
            ),
          )
          const conflicting = structuredClone(control)
          conflicting.body = conflicting.body.replace(
            setup.liveConflicting018Tree,
            "f".repeat(40),
          )
          task.comments.push(conflicting)
        },
      })
    ).rejection.code,
    "checkpoint_generation_audit_control_conflict",
  )
  assert.equal(
    (
      await invoke({
        mutateTask: (task) => {
          task.comments = task.comments.filter(
            (comment) =>
              !comment.body.includes(
                "instruction_id: production-day1-git-reconciliation-checkpoint-proposal-018",
              ),
          )
        },
      })
    ).rejection.code,
    "checkpoint_generation_audit_control_count",
  )
  assert.equal(
    (
      await invoke({
        mutateTask: (task) => {
          const index = task.comments.findIndex((comment) =>
            comment.body.includes(
              "production-day1-git-reconciliation-checkpoint-proposal-018",
            ),
          )
          task.comments[index].body = task.comments[index].body.replace(
            "Create only a read-only superseding Git reconciliation checkpoint proposal",
            "The owner explicitly approves activation of superseding Git reconciliation checkpoint",
          )
        },
      })
    ).rejection.code,
    "checkpoint_generation_audit_control_binding",
  )
  assert.equal(
    (
      await invoke({
        mutateState: (state) => {
          state.gitReconciliationCheckpoints.push({
            kind: "activation",
            activationInstructionId:
              "production-day1-git-reconciliation-checkpoint-proposal-018",
          })
        },
      })
    ).rejection.code,
    "checkpoint_generation_audit_record_conflict",
  )
})

test("exact live #63/010-020 history preserves failed generation attempts and creates one fresh retry", async (t) => {
  const setup = await checkpointGenerationRetrySetup(t)
  const record = setup.state.workspaceBranchReconciliations[0]
  assert.deepEqual(
    setup.state.runs.slice(-5).map((run) => ({
      instructionId: run.instructionId,
      blockers: run.blockers,
      turnCount: run.turnCount,
    })),
    [
      {
        instructionId:
          "production-day1-git-reconciliation-checkpoint-proposal-016",
        blockers: ["checkpoint_proposal_exception"],
        turnCount: 0,
      },
      {
        instructionId:
          "production-day1-git-reconciliation-checkpoint-proposal-017",
        blockers: ["checkpoint_historical_tail_scope"],
        turnCount: 0,
      },
      {
        instructionId:
          "production-day1-git-reconciliation-checkpoint-proposal-018",
        blockers: ["checkpoint_post_tail_control_binding"],
        turnCount: 0,
      },
      {
        instructionId:
          "production-day1-git-reconciliation-checkpoint-generation-proposal-019",
        blockers: ["checkpoint_proposal_exception"],
        turnCount: 0,
      },
      {
        instructionId:
          "production-day1-git-reconciliation-checkpoint-generation-proposal-020",
        blockers: ["checkpoint_proposal_scope_binding"],
        turnCount: 0,
      },
    ],
  )
  assert.deepEqual(setup.proposal019Diagnostic, {
    code: "checkpoint_proposal_exception",
    stage: "pull_request_lookup",
    reason: "executable_missing",
    errorCode: "ENOENT",
  })
  const proposal020Receipt = setup.proposal020Prompt.match(
    /^- reconciliation receipt: `([^`]+)`$/m,
  )?.[1]
  assert.equal(proposal020Receipt, record.continuationInstructionId)
  assert.notEqual(proposal020Receipt, record.reconciliationId)

  assert.equal(
    setup.generationRetryProposal.accepted,
    true,
    JSON.stringify(setup.generationRetryProposal),
  )
  const proposal = setup.generationRetryProposal.value.record
  assert.equal(proposal.reconciliationId, record.reconciliationId)
  assert.deepEqual(proposal.rejectedProposalAudit.instructionIds, [
    "production-day1-git-reconciliation-checkpoint-proposal-016",
    "production-day1-git-reconciliation-checkpoint-proposal-017",
    "production-day1-git-reconciliation-checkpoint-proposal-018",
    "production-day1-git-reconciliation-checkpoint-generation-proposal-019",
    "production-day1-git-reconciliation-checkpoint-generation-proposal-020",
  ])
  assert.deepEqual(
    proposal.rejectedProposalAudit.attempts.slice(-2).map((attempt) => ({
      instructionId: attempt.instructionId,
      rejectionCode: attempt.rejectionCode,
      reconciliationId: attempt.reconciliationId,
    })),
    [
      {
        instructionId:
          "production-day1-git-reconciliation-checkpoint-generation-proposal-019",
        rejectionCode: "checkpoint_proposal_exception",
        reconciliationId: record.reconciliationId,
      },
      {
        instructionId:
          "production-day1-git-reconciliation-checkpoint-generation-proposal-020",
        rejectionCode: "checkpoint_proposal_scope_binding",
        reconciliationId: record.continuationInstructionId,
      },
    ],
  )
  assert.equal(JSON.stringify(setup.state.runs), setup.immutableRetryHistory)
  assert.deepEqual(setup.state.gitReconciliationCheckpoints, [])

  setup.state.gitReconciliationCheckpoints.push(proposal)
  appendAcceptedCheckpointProposalRun(setup, proposal)
  const { instruction: activationInstruction } =
    selectAcknowledgedGenerationActivation(
      setup,
      proposal,
      "production-day1-git-reconciliation-checkpoint-generation-activation-022",
    )
  const activationInput = {
    ...setup,
    state: setup.state,
    instruction: activationInstruction,
  }
  const boundary = await authorizedGitExecutionBoundary(activationInput)
  assert.ok(boundary)
  assert.equal(boundary.checkpointActivationIsNew, true)
  assert.equal(
    gitExecutionPathIsCovered(
      boundary,
      path.join(boundary.gitDirectory, "index.lock"),
    ),
    true,
  )
  assert.equal(
    gitExecutionPathIsCovered(
      boundary,
      path.join(
        boundary.commonDirectory,
        "worktrees",
        "issue-63-sibling",
        "index.lock",
      ),
    ),
    false,
  )
  boundary.checkpointActivation.activatedAt = "2026-08-23T19:31:00.000Z"
  setup.state.gitReconciliationCheckpoints.push(boundary.checkpointActivation)
  const restarted = await authorizedGitExecutionBoundary({
    ...activationInput,
    state: structuredClone(setup.state),
  })
  assert.ok(restarted)
  assert.equal(restarted.checkpointActivationIsNew, false)
  assert.equal(
    JSON.stringify(setup.state.runs.slice(0, -1)),
    setup.immutableRetryHistory,
  )
})

test("exact live #63/021-027 audit tail accepts only structurally bound historical owner gates", async (t) => {
  const setup = await checkpointGenerationRetrySetup(t)
  const proposal = setup.generationRetryProposal.value.record
  const proposal019Control = setup.task.comments.find((comment) =>
    comment.body.includes(
      "production-day1-git-reconciliation-checkpoint-generation-proposal-019\n",
    ),
  )
  assert.ok(proposal019Control)
  setup.task.comments.push(structuredClone(proposal019Control))
  assert.equal(
    setup.task.comments
      .flatMap((comment) => extractAgentControls(comment.body))
      .filter(
        (control) =>
          control.instructionId ===
          "production-day1-git-reconciliation-checkpoint-generation-proposal-019",
      ).length,
    2,
  )
  setup.state.gitReconciliationCheckpoints.push(proposal)
  appendAcceptedCheckpointProposalRun(setup, proposal)
  const currentActivationPrompt = gitReconciliationCheckpointActivationPrompt({
    checkpointId: proposal.checkpointId,
    reconciliationId: proposal.reconciliationId,
    head: proposal.head,
    tree: proposal.tree,
    cherryPickCommit: proposal.cherryPickCommit,
    generation: proposal.generation,
    generationId: proposal.generationId,
  })
  const receipt = setup.state.workspaceBranchReconciliations.find(
    (record) => record.reconciliationId === proposal.reconciliationId,
  )
  assert.ok(receipt)
  const historicalActivationPrompt = currentActivationPrompt.replace(
    `- reconciliation receipt: \`${proposal.reconciliationId}\``,
    `- reconciliation receipt: \`${receipt.continuationInstructionId}\``,
  )
  assert.notEqual(historicalActivationPrompt, currentActivationPrompt)
  appendRejectedOwnerGateAttempt(setup, proposal, {
    instructionId:
      "production-day1-git-reconciliation-checkpoint-generation-activation-022",
    taskState: "needs_owner",
    completedAt: "2026-08-23T19:46:42.895Z",
    prompt: historicalActivationPrompt,
  })
  appendLegacyActivation023(setup, proposal, historicalActivationPrompt)
  appendRejectedOwnerGateAttempt(setup, proposal, {
    instructionId:
      "production-day1-git-reconciliation-checkpoint-generation-activation-025",
    taskState: "needs_review",
    completedAt: "2026-08-23T20:52:38.709Z",
    prompt: historicalActivationPrompt,
  })
  appendRejectedOwnerGateAttempt(setup, proposal, {
    instructionId:
      "production-day1-git-reconciliation-checkpoint-generation-activation-024",
    taskState: "needs_owner",
    completedAt: "2026-08-23T20:53:14.959Z",
    prompt: historicalActivationPrompt,
  })
  const rejectedAcknowledgementInstructionId =
    "production-day1-git-reconciliation-checkpoint-generation-activation-owner-ack-026"
  const rejectedControlBody = checkpointControl({
    instructionId: rejectedAcknowledgementInstructionId,
    taskState: "needs_owner",
    prompt: currentActivationPrompt,
    ownerApprovalRequired: true,
  })
  const rejectedComment = { body: rejectedControlBody }
  setup.task.comments.push(rejectedComment)
  const [rejectedInstruction] = extractAgentControls(rejectedControlBody)
  const rejectedGateReason = ownerGateReason(rejectedInstruction)
  const rejectedPriorAudit = checkpointOwnerGateAttemptAuditDecision({
    state: setup.state,
    task: setup.task,
    proposal,
    activationPrompt: currentActivationPrompt,
    gateReason: rejectedGateReason,
  })
  assert.equal(rejectedPriorAudit.accepted, true, JSON.stringify(rejectedPriorAudit))
  const pendingReason = gitReconciliationCheckpointOwnerReason(proposal)
  const rejectedAcknowledgement = {
    instructionId: rejectedAcknowledgementInstructionId,
    proposalInstructionId: proposal.proposalInstructionId,
    originIssueNumber: proposal.originIssueNumber,
    originIssueUrlDigest: controlPlaneBindingDigest(proposal.originIssueUrl),
    codexThreadId: proposal.threadId,
    workspacePathDigest: controlPlaneBindingDigest(proposal.workspacePath),
    checkpointId: proposal.checkpointId,
    generationId: proposal.generationId,
    reconciliationId: proposal.reconciliationId,
    branch: proposal.branch,
    head: proposal.head,
    tree: proposal.tree,
    controlPromptDigest: controlPlaneBindingDigest(currentActivationPrompt),
    gateReasonDigest: controlPlaneBindingDigest(rejectedGateReason),
    pendingReasonDigest: controlPlaneBindingDigest(pendingReason),
    priorGateAuditDigest: rejectedPriorAudit.value.digest,
  }
  rejectedAcknowledgement.acknowledgementId =
    ownerGateAcknowledgementId(rejectedAcknowledgement)
  rejectedComment.body = `${rejectedControlBody}\n\n${ownerGateAcknowledgementBlock(rejectedAcknowledgement)}`
  appendRejectedOwnerGateAttempt(setup, proposal, {
    instructionId: rejectedAcknowledgementInstructionId,
    taskState: "needs_owner",
    completedAt: "2026-08-24T08:00:00.000Z",
    prompt: currentActivationPrompt,
  })
  setup.task.comments.pop()
  const immutableHistory = JSON.stringify(setup.state.runs)
  const instructionId =
    "production-day1-git-reconciliation-checkpoint-generation-activation-owner-ack-027"
  const prompt = currentActivationPrompt
  const unacknowledgedBody = checkpointControl({
    instructionId,
    taskState: "needs_owner",
    prompt,
    ownerApprovalRequired: true,
  })
  setup.task.comments.push({ body: unacknowledgedBody })
  const [unacknowledged] = extractAgentControls(unacknowledgedBody)
  setup.state.status = "needs_owner"
  setup.state.activeInstruction = { ...unacknowledged, phase: "selected" }
  recordPendingApprovalRequest({
    state: setup.state,
    instructionId: proposal.proposalInstructionId,
    request: {
      method: "control-plane/gitReconciliationCheckpointActivation",
      reason: pendingReason,
    },
    now: new Date("2026-08-23T19:41:27.792Z"),
    allowLegacy: true,
  })
  const missing = registerCheckpointOwnerGateAcknowledgement({
    state: setup.state,
    instruction: unacknowledged,
    task: setup.task,
    gateReason: ownerGateReason(unacknowledged),
    pendingReason,
  })
  assert.equal(
    missing.rejection.code,
    "owner_gate_acknowledgement_count_or_pairing",
  )
  setup.task.comments.pop()

  const activation = selectAcknowledgedGenerationActivation(
    setup,
    proposal,
    instructionId,
  )
  assert.deepEqual(activation.registered.value.priorGateAudit.instructionIds, [
    "production-day1-git-reconciliation-checkpoint-generation-activation-022",
    "production-day1-git-reconciliation-checkpoint-generation-activation-023",
    "production-day1-git-reconciliation-checkpoint-generation-activation-025",
    "production-day1-git-reconciliation-checkpoint-generation-activation-024",
    rejectedAcknowledgementInstructionId,
  ])
  assert.notEqual(
    activation.binding.priorGateAuditDigest,
    rejectedAcknowledgement.priorGateAuditDigest,
  )
  const canonicalizedTask = structuredClone(setup.task)
  const historical022Comment = canonicalizedTask.comments.find((comment) =>
    comment.body.includes(
      "production-day1-git-reconciliation-checkpoint-generation-activation-022\n",
    ),
  )
  historical022Comment.body = historical022Comment.body.replace(
    `- reconciliation receipt: \`${receipt.continuationInstructionId}\``,
    `- reconciliation receipt: \`${proposal.reconciliationId}\``,
  )
  const canonicalizedAudit = checkpointOwnerGateAttemptAuditDecision({
    state: setup.state,
    task: canonicalizedTask,
    proposal,
    activationPrompt: activation.prompt,
    gateReason: ownerGateReason(activation.instruction),
  })
  assert.equal(canonicalizedAudit.accepted, true)
  assert.notEqual(
    canonicalizedAudit.value.digest,
    activation.binding.priorGateAuditDigest,
  )
  assert.equal(setup.state.ownerGateAcknowledgements.length, 1)
  assert.ok(setup.state.ownerGateAcknowledgements[0].consumedAt)
  assert.equal(setup.state.ownerGateAcknowledgements[0].completedAt, null)
  assert.equal(JSON.stringify(setup.state.runs), immutableHistory)
  const boundary = await authorizedGitExecutionBoundary({
    ...setup,
    state: setup.state,
    instruction: activation.instruction,
  })
  assert.ok(boundary)
  assert.equal(boundary.checkpointId, proposal.checkpointId)
  assert.equal(boundary.checkpointActivationIsNew, true)
  assert.equal(await git(setup.workspacePath, "rev-parse", "HEAD"), proposal.head)
  assert.equal(await git(setup.workspacePath, "status", "--porcelain"), "")
  assert.equal(
    gitExecutionPathIsCovered(
      boundary,
      path.join(boundary.gitDirectory, "index.lock"),
    ),
    true,
  )
  assert.equal(
    gitExecutionPathIsCovered(
      boundary,
      path.join(
        boundary.commonDirectory,
        "worktrees",
        "issue-63-sibling",
        "index.lock",
      ),
    ),
    false,
  )
  const mutateLegacyPrompt = (task, search, replacement) => {
    const comment = task.comments.find((candidate) =>
      candidate.body.includes(
        "production-day1-git-reconciliation-checkpoint-generation-activation-023\n",
      ),
    )
    assert.ok(comment)
    const changed = comment.body.replace(search, replacement)
    assert.notEqual(changed, comment.body)
    comment.body = changed
  }
  const mutationCases = [
    (run) => run.changedFiles.pop(),
    (run) => {
      run.turnCount = 0
    },
    (run) => {
      run.commits = []
    },
    (run) => {
      run.branch = "agent/issue-63-other-branch"
    },
    (run) => {
      run.productionReadback = ["Production mutation occurred."]
    },
    (run) => {
      run.branchPushState[2] = "Push: ATTEMPTED"
    },
    (run) => {
      run.resultArtifact.checks.diffCheck.evidence = []
    },
    (run) => {
      run.resultArtifact.finalMessage = run.resultArtifact.finalMessage.replace(
        "linked-worktree `index.lock: Operation not permitted`",
        "cherry-pick may have been partially applied",
      )
    },
    (run) => {
      run.resultArtifact.checks.diffCheck.evidence[0].summary =
        run.resultArtifact.checks.diffCheck.evidence[0].summary.replace(
          "CHERRY_PICK_HEAD",
          "",
        )
    },
    (run, task) => {
      mutateLegacyPrompt(task, proposal.checkpointId, `git-reconciliation-checkpoint:${"f".repeat(64)}`)
    },
    (run, task) => {
      mutateLegacyPrompt(
        task,
        `generation \`${proposal.generation}\``,
        "generation `3`",
      )
    },
    (run, task) => {
      mutateLegacyPrompt(task, proposal.generationId, `git-reconciliation-checkpoint-generation:${"f".repeat(64)}`)
    },
    (run, task) => {
      mutateLegacyPrompt(
        task,
        receipt.continuationInstructionId,
        "production-day1-git-reconciliation-resume-999",
      )
    },
    (run, task) => {
      mutateLegacyPrompt(
        task,
        proposal.branch,
        "agent/issue-63-unreviewed-branch",
      )
    },
    (run, task) => {
      mutateLegacyPrompt(task, proposal.head, "f".repeat(40))
    },
    (run, task) => {
      mutateLegacyPrompt(task, proposal.tree, "f".repeat(40))
    },
    (run, task) => {
      mutateLegacyPrompt(task, proposal.cherryPickCommit, "f".repeat(40))
    },
  ]
  for (const mutate of mutationCases) {
    const changedState = structuredClone(setup.state)
    const changedTask = structuredClone(setup.task)
    const run = changedState.runs.find(
      (candidate) =>
        candidate.instructionId ===
        "production-day1-git-reconciliation-checkpoint-generation-activation-023",
    )
    mutate(run, changedTask)
    const decision = checkpointOwnerGateAttemptAuditDecision({
      state: changedState,
      task: changedTask,
      proposal,
      activationPrompt: activation.prompt,
      gateReason: ownerGateReason(activation.instruction),
    })
    assert.equal(decision.accepted, false)
    assert.equal(
      decision.rejection.code,
      "owner_gate_prior_legacy_attempt_evidence",
    )
  }
  const duplicateLegacyTask = structuredClone(setup.task)
  const legacyControl = duplicateLegacyTask.comments.find((comment) =>
    comment.body.includes(
      "production-day1-git-reconciliation-checkpoint-generation-activation-023\n",
    ),
  )
  duplicateLegacyTask.comments.push(structuredClone(legacyControl))
  const duplicateLegacy = checkpointOwnerGateAttemptAuditDecision({
    state: setup.state,
    task: duplicateLegacyTask,
    proposal,
    activationPrompt: activation.prompt,
    gateReason: ownerGateReason(activation.instruction),
  })
  assert.equal(duplicateLegacy.accepted, false)
  assert.equal(
    duplicateLegacy.rejection.code,
    "owner_gate_prior_attempt_control_count",
  )
  const historicalMutationCases = [
    (run, task) => {
      run.turnCount = 1
    },
    (run, task) => {
      run.changedFiles = ["src/unreviewed.ts"]
    },
    (run, task) => {
      const comment = task.comments.find((candidate) =>
        candidate.body.includes(`${run.instructionId}\n`),
      )
      comment.body = comment.body.replace(proposal.head, "f".repeat(40))
    },
    (run, task) => {
      const comment = task.comments.find((candidate) =>
        candidate.body.includes(`${run.instructionId}\n`),
      )
      task.comments.push(structuredClone(comment))
    },
    (run, task) => {
      const comment = task.comments.find((candidate) =>
        candidate.body.includes(`${run.instructionId}\n`),
      )
      comment.body = comment.body.replace(
        /\n```$/,
        "\n    Also deploy after review.\n```",
      )
    },
    (run, task, state) => {
      state.runs.push(structuredClone(run))
    },
  ]
  for (const mutate of historicalMutationCases) {
    const changedState = structuredClone(setup.state)
    const changedTask = structuredClone(setup.task)
    const run = changedState.runs.find(
      (candidate) =>
        candidate.instructionId ===
        "production-day1-git-reconciliation-checkpoint-generation-activation-022",
    )
    mutate(run, changedTask, changedState)
    const decision = checkpointOwnerGateAttemptAuditDecision({
      state: changedState,
      task: changedTask,
      proposal,
      activationPrompt: activation.prompt,
      gateReason: ownerGateReason(activation.instruction),
    })
    assert.equal(decision.accepted, false)
  }
})

test("completed #63 owner acknowledgement 027 reconstructs its exact generation-2 boundary despite superseded control noise", async (t) => {
  const setup = await completedGenerationActivationRecoverySetup(t)
  const immutableRuns = JSON.stringify(setup.state.runs)
  const proposal019Controls = setup.task.comments
    .flatMap((comment) => extractAgentControls(comment.body))
    .filter(
      (control) =>
        control.instructionId ===
        "production-day1-git-reconciliation-checkpoint-generation-proposal-019",
    )
  assert.equal(proposal019Controls.length, 2)
  assert.equal(setup.state.activeInstruction, null)
  assert.equal(
    setup.state.lastConsumedInstructionId,
    "production-day1-git-reconciliation-checkpoint-generation-activation-owner-ack-027",
  )

  const recovery = recoverCompletedCheckpointActivation({
    state: setup.state,
    task: setup.task,
  })
  assert.equal(recovery.accepted, true, JSON.stringify(recovery))
  const selectedAt = "2026-08-24T09:01:00.000Z"
  setup.state.checkpointActivationRecoveries.push({
    ...recovery.value.record,
    selectedAt,
  })
  setup.state.activeInstruction = {
    ...recovery.value.instruction,
    phase: "selected",
    attempts: 0,
    turnCount: 1,
    selectedAt,
    checkpointActivationRecovery: {
      ...recovery.value.binding,
      recoveryId: recovery.value.record.recoveryId,
    },
  }
  const boundary = await authorizedGitExecutionBoundary({
    ...setup,
    state: setup.state,
    instruction: recovery.value.instruction,
  })
  assert.ok(boundary)
  assert.equal(boundary.checkpointId, setup.proposal.checkpointId)
  assert.equal(boundary.checkpointGenerationId, setup.proposal.generationId)
  assert.equal(
    boundary.reconciliationInstructionId,
    setup.state.workspaceBranchReconciliations[0].continuationInstructionId,
  )
  assert.equal(boundary.head, setup.proposal.head)
  assert.equal(boundary.checkpointActivation.tree, setup.proposal.tree)
  assert.equal(boundary.cherryPickCommit, setup.proposal.cherryPickCommit)
  assert.equal(
    gitExecutionPathIsCovered(
      boundary,
      path.join(boundary.gitDirectory, "index.lock"),
    ),
    true,
  )
  assert.equal(
    gitExecutionPathIsCovered(
      boundary,
      path.join(
        boundary.commonDirectory,
        "worktrees",
        "issue-63-sibling",
        "index.lock",
      ),
    ),
    false,
  )
  assert.equal(JSON.stringify(setup.state.runs), immutableRuns)
})

test("exact live #63 acknowledgement 027 safe-stop evidence passes mutation classification without weakening result binding", async (t) => {
  const setup = await completedGenerationActivationRecoverySetup(t)
  const sourceRun = setup.state.runs.at(-1)
  assert.deepEqual(sourceRun.productionReadback, [
    issue63OwnerAck027ProductionReadback,
  ])
  assert.deepEqual(
    sourceRun.resultArtifact.findings.productionReadback,
    sourceRun.productionReadback,
  )
  assert.ok(
    sourceRun.resultArtifact.finalMessage.endsWith(
      `- Push/PR: **NOT ATTEMPTED**\n\n${issue63OwnerAck027NoMutationStatement}`,
    ),
  )

  const authorizedRecovery = recoverCompletedCheckpointActivation({
    state: structuredClone(setup.state),
    task: structuredClone(setup.task),
  })
  assert.equal(
    authorizedRecovery.accepted,
    true,
    JSON.stringify(authorizedRecovery),
  )

  const missingResultTask = structuredClone(setup.task)
  missingResultTask.comments = missingResultTask.comments.filter(
    (comment) => comment.id !== 2702,
  )
  const nextBoundary = recoverCompletedCheckpointActivation({
    state: structuredClone(setup.state),
    task: missingResultTask,
  })
  assert.equal(nextBoundary.accepted, false)
  assert.equal(
    nextBoundary.rejection.code,
    "checkpoint_activation_recovery_result_publication_missing",
  )

  const manipulatedStatements = [
    {
      value:
        "Fallback path, sibling metadata access, source change, or production-side action occurred.",
      predicate: "checkpoint_historical_mutation_ambiguous",
    },
    {
      value:
        "No fallback path, sibling metadata access, source change, or production-side action occurred",
      predicate: "checkpoint_historical_mutation_ambiguous",
    },
    {
      value: "Source change occurred.",
      predicate: "checkpoint_historical_mutation_ambiguous",
    },
    {
      value: "Production-side action occurred.",
      predicate: "checkpoint_historical_mutation_ambiguous",
    },
    {
      value: `${issue63OwnerAck027NoMutationStatement} Source change occurred.`,
      predicate: "checkpoint_historical_mutation_ambiguous",
    },
    {
      value: `${issue63OwnerAck027NoMutationStatement} A production mutation occurred.`,
      predicate: "checkpoint_historical_mutation_conflict",
    },
  ]
  for (const { value, predicate } of manipulatedStatements) {
    const state = structuredClone(setup.state)
    const manipulatedRun = state.runs.at(-1)
    manipulatedRun.resultArtifact.finalMessage =
      manipulatedRun.resultArtifact.finalMessage.replace(
        issue63OwnerAck027NoMutationStatement,
        value,
      )
    const rejected = recoverCompletedCheckpointActivation({
      state,
      task: structuredClone(setup.task),
    })
    assert.equal(rejected.accepted, false, value)
    assert.equal(
      rejected.rejection.code,
      "checkpoint_activation_recovery_mutation_evidence",
      value,
    )
    assert.equal(rejected.rejection.predicate, predicate, value)
  }

  const manipulatedReadbacks = [
    [],
    ["Fully qualified receipt/checkpoint binding: preflight PASS"],
    ["Fully qualified receipt/checkpoint binding: preflight **FAILED**"],
    [issue63OwnerAck027ProductionReadback, "Additional readback"],
    ["Additional readback", issue63OwnerAck027ProductionReadback],
  ]
  for (const productionReadback of manipulatedReadbacks) {
    const state = structuredClone(setup.state)
    const manipulatedRun = state.runs.at(-1)
    manipulatedRun.productionReadback = productionReadback
    manipulatedRun.resultArtifact.findings.productionReadback =
      structuredClone(productionReadback)
    const rejected = recoverCompletedCheckpointActivation({
      state,
      task: structuredClone(setup.task),
    })
    assert.equal(rejected.accepted, false, JSON.stringify(productionReadback))
    assert.equal(
      rejected.rejection.code,
      "checkpoint_activation_recovery_mutation_evidence",
      JSON.stringify(productionReadback),
    )
    assert.equal(
      rejected.rejection.predicate,
      "checkpoint_historical_mutation_ambiguous",
      JSON.stringify(productionReadback),
    )
  }

  const wrongInstructionState = structuredClone(setup.state)
  wrongInstructionState.runs.at(-1).instructionId =
    "production-day1-git-reconciliation-checkpoint-generation-activation-owner-ack-028"
  const wrongInstruction = recoverCompletedCheckpointActivation({
    state: wrongInstructionState,
    task: structuredClone(setup.task),
  })
  assert.equal(wrongInstruction.accepted, false)
  assert.equal(
    wrongInstruction.rejection.code,
    "checkpoint_activation_recovery_run_count",
  )

  const unrelatedMutationState = structuredClone(setup.state)
  const unrelatedMutationRun = unrelatedMutationState.runs.at(-1)
  unrelatedMutationRun.safetyFindings = ["Source change occurred."]
  unrelatedMutationRun.resultArtifact.findings.safetyFindings = [
    "Source change occurred.",
  ]
  const unrelatedMutation = recoverCompletedCheckpointActivation({
    state: unrelatedMutationState,
    task: structuredClone(setup.task),
  })
  assert.equal(unrelatedMutation.accepted, false)
  assert.equal(
    unrelatedMutation.rejection.code,
    "checkpoint_activation_recovery_mutation_evidence",
  )
  assert.equal(
    unrelatedMutation.rejection.predicate,
    "checkpoint_historical_mutation_ambiguous",
  )

  const changedSourceState = structuredClone(setup.state)
  const changedSourceRun = changedSourceState.runs.at(-1)
  changedSourceRun.safetyFindings = ["Source changed."]
  changedSourceRun.resultArtifact.findings.safetyFindings = ["Source changed."]
  const changedSource = recoverCompletedCheckpointActivation({
    state: changedSourceState,
    task: structuredClone(setup.task),
  })
  assert.equal(changedSource.accepted, false)
  assert.equal(
    changedSource.rejection.code,
    "checkpoint_activation_recovery_mutation_evidence",
  )
  assert.equal(
    changedSource.rejection.predicate,
    "checkpoint_historical_mutation_ambiguous",
  )

  const changedPushState = structuredClone(setup.state)
  const changedPushRun = changedPushState.runs.at(-1)
  changedPushRun.branchPushState = [
    ...changedPushRun.branchPushState.slice(0, -1),
    "Push/PR: **ATTEMPTED**",
  ]
  changedPushRun.resultArtifact.findings.branchPushState =
    structuredClone(changedPushRun.branchPushState)
  const changedPush = recoverCompletedCheckpointActivation({
    state: changedPushState,
    task: structuredClone(setup.task),
  })
  assert.equal(changedPush.accepted, false)
  assert.equal(
    changedPush.rejection.code,
    "checkpoint_activation_recovery_mutation_evidence",
  )
  assert.equal(
    changedPush.rejection.predicate,
    "checkpoint_historical_mutation_ambiguous",
  )

  const contradictedFinalState = structuredClone(setup.state)
  const contradictedFinalRun = contradictedFinalState.runs.at(-1)
  contradictedFinalRun.resultArtifact.finalMessage =
    contradictedFinalRun.resultArtifact.finalMessage.replace(
      issue63OwnerAck027NoMutationStatement,
      `The next statement is false.\n\n${issue63OwnerAck027NoMutationStatement}`,
    )
  const contradictedFinal = recoverCompletedCheckpointActivation({
    state: contradictedFinalState,
    task: structuredClone(setup.task),
  })
  assert.equal(contradictedFinal.accepted, false)
  assert.equal(
    contradictedFinal.rejection.code,
    "checkpoint_activation_recovery_mutation_evidence",
  )

  const conflictingFindingsState = structuredClone(setup.state)
  conflictingFindingsState.runs.at(-1).resultArtifact.findings.productionReadback =
    ["Source change occurred."]
  const conflictingFindings = recoverCompletedCheckpointActivation({
    state: conflictingFindingsState,
    task: structuredClone(setup.task),
  })
  assert.equal(conflictingFindings.accepted, false)
  assert.equal(
    conflictingFindings.rejection.code,
    "checkpoint_activation_recovery_mutation_evidence",
  )
  assert.equal(
    conflictingFindings.rejection.predicate,
    "checkpoint_historical_findings_shape",
  )
})

test("repository instruction discovery selects live-shaped completed acknowledgement 027 only after normal controls are exhausted", async (t) => {
  const setup = await completedGenerationActivationRecoverySetup(t)
  const decision = durableTaskInstructionDecision({
    state: setup.state,
    task: setup.task,
  })

  assert.equal(decision.pendingInstruction, null)
  assert.equal(decision.recoveryDiscovery.applicable, true)
  assert.equal(decision.recoveryDiscovery.terminal, false)
  assert.equal(decision.recoveryDiscovery.decision.accepted, true)
  assert.equal(
    decision.selectedInstruction.instructionId,
    "production-day1-git-reconciliation-checkpoint-generation-activation-owner-ack-027",
  )

  setup.state.checkpointActivationRecoveries = [
    {
      ...decision.recoveryDiscovery.decision.value.record,
      status: "completed",
      selectedAt: "2026-08-24T09:01:00.000Z",
      boundaryActivatedAt: "2026-08-24T09:02:00.000Z",
      completedAt: "2026-08-24T09:03:00.000Z",
      outcome: "needs_review",
    },
  ]
  const terminal = durableTaskInstructionDecision({
    state: setup.state,
    task: setup.task,
  })
  assert.equal(terminal.selectedInstruction, null)
  assert.equal(terminal.recoveryDiscovery.applicable, true)
  assert.equal(terminal.recoveryDiscovery.terminal, true)
  assert.equal(terminal.recoveryDiscovery.decision.accepted, false)
  assert.equal(
    terminal.recoveryDiscovery.decision.rejection.code,
    "checkpoint_activation_recovery_already_recorded",
  )

  const unrelated = durableTaskInstructionDecision({
    state: {
      status: "needs_review",
      activeInstruction: null,
      lastConsumedInstructionId: "ordinary-reviewed-instruction",
      runs: [{ instructionId: "ordinary-reviewed-instruction" }],
      ownerGateAcknowledgements: [],
      checkpointActivationRecoveries: [],
    },
    task: { issue: { issue_number: 70 }, comments: [] },
    recover() {
      assert.fail("An unrelated reviewed task is not a recovery candidate")
    },
  })
  assert.equal(unrelated.selectedInstruction, null)
  assert.equal(unrelated.recoveryDiscovery.applicable, false)
})

test("repository poll claims the exact live-shaped completed acknowledgement recovery without a new control", async (t) => {
  const setup = await completedGenerationActivationRecoverySetup(t)
  const stateDirectory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-live-recovery-discovery-"),
  )
  t.after(() => rm(stateDirectory, { recursive: true, force: true }))
  const repository = "Sillyquack/koalafrog-hq"
  const store = new StateStore({
    stateDirectory,
    repository,
    issueNumber: 63,
  })
  const durableState = await store.load()
  const fixtureState = structuredClone(setup.state)
  const durableTask = durableState.task
  Object.assign(durableState, fixtureState)
  durableState.task = { ...durableTask, ...fixtureState.task }
  await store.save(durableState)
  const scanner = {
    threadId: "repository-discovery-thread",
    appServer: {
      async callMcpTool(request) {
        if (request.tool === "github.fetch_issue") {
          return { structuredContent: { issue: setup.task.issue } }
        }
        if (request.tool === "github.fetch_issue_comments") {
          return { structuredContent: { comments: setup.task.comments } }
        }
        throw new Error(`Unexpected MCP tool: ${request.tool}`)
      },
    },
  }
  const claimStore = new QueueClaimStore({ stateDirectory, retryBaseMs: 1 })
  const instructionId = setup.activation.instruction.instructionId
  await claimStore.withClaim(
    {
      instructionId,
      originIssueNumber: 63,
      originIssueUrl: setup.state.task.originIssueUrl,
    },
    async () => ({ status: "needs_review" }),
  )
  let selections = 0
  class SelectionOnlyOrchestrator {
    constructor(_config, dependencies) {
      this.store = dependencies.store
    }

    async runOnce({ task, expectedInstructionId }) {
      const current = await this.store.load()
      const recovery = recoverCompletedCheckpointActivation({
        state: current,
        task,
      })
      assert.equal(recovery.accepted, true, JSON.stringify(recovery))
      assert.equal(expectedInstructionId, instructionId)
      selections += 1
      current.checkpointActivationRecoveries = [
        {
          ...recovery.value.record,
          status: "completed",
          selectedAt: "2026-08-24T09:01:00.000Z",
          boundaryActivatedAt: "2026-08-24T09:02:00.000Z",
          completedAt: "2026-08-24T09:03:00.000Z",
          outcome: "needs_review",
        },
      ]
      await this.store.save(current)
      return { status: "needs_review", instructionId }
    }

    async stop() {}
  }
  const config = {
    repository,
    stateDirectory,
    retryBaseMs: 1,
  }
  const candidate = { issueNumber: 63, searchMatched: false }
  const recovered = await runRepositoryIssue(scanner, config, candidate, {
    OrchestratorClass: SelectionOnlyOrchestrator,
    claimStore,
  })
  const replay = await runRepositoryIssue(scanner, config, candidate, {
    OrchestratorClass: SelectionOnlyOrchestrator,
    claimStore,
  })

  assert.equal(recovered.status, "needs_review")
  assert.equal(recovered.instructionId, instructionId)
  assert.equal(recovered.claimed, true)
  assert.deepEqual(replay, {
    issueNumber: 63,
    status: "no_pending_agent_control",
    claimed: false,
  })
  assert.equal(selections, 1)
  assert.equal(
    (await store.load()).checkpointActivationRecoveries.length,
    1,
  )
})

test("completed checkpoint activation recovery rejects binding drift, ambiguity, mutation, and replay", async (t) => {
  const setup = await completedGenerationActivationRecoverySetup(t)
  const invoke = (mutateState = () => {}, mutateTask = () => {}) => {
    const state = structuredClone(setup.state)
    const task = structuredClone(setup.task)
    mutateState(state)
    mutateTask(task)
    return recoverCompletedCheckpointActivation({ state, task })
  }
  const rejectedCases = [
    (state) => {
      state.gitReconciliationCheckpoints[0].generationId =
        `git-reconciliation-checkpoint-generation:${"f".repeat(64)}`
    },
    (state) => {
      state.gitReconciliationCheckpoints[0].checkpointId =
        `git-reconciliation-checkpoint:${"f".repeat(64)}`
    },
    (state) => {
      state.gitReconciliationCheckpoints[0].reconciliationId = "wrong-receipt"
    },
    (state) => {
      state.gitReconciliationCheckpoints[0].branch = "agent/issue-63-other"
    },
    (state) => {
      state.gitReconciliationCheckpoints[0].head = "f".repeat(40)
    },
    (state) => {
      state.gitReconciliationCheckpoints[0].tree = "f".repeat(40)
    },
    (state) => {
      state.gitReconciliationCheckpoints[0].cherryPickCommit = "f".repeat(40)
    },
    (state) => {
      state.ownerGateAcknowledgements[0].checkpointId =
        `git-reconciliation-checkpoint:${"e".repeat(64)}`
    },
    (state) => {
      state.ownerGateAcknowledgements = []
    },
    (state) => {
      state.gitReconciliationCheckpoints.push(
        structuredClone(state.gitReconciliationCheckpoints[0]),
      )
    },
    (state) => {
      state.runs.at(-1).productionReadback = ["Production mutation occurred."]
    },
    (state) => {
      state.runs.at(-1).originIssueNumber = 64
    },
    (state) => {
      state.runs.at(-1).threadId = "other-thread"
    },
    (state) => {
      state.runs.at(-1).workspacePath = "/workspaces/other-issue"
    },
  ]
  for (const mutateState of rejectedCases) {
    assert.equal(invoke(mutateState).accepted, false)
    const state = structuredClone(setup.state)
    const task = structuredClone(setup.task)
    mutateState(state)
    const discovery = durableTaskInstructionDecision({ state, task })
    assert.equal(discovery.selectedInstruction, null)
    assert.equal(discovery.recoveryDiscovery.applicable, true)
    assert.equal(discovery.recoveryDiscovery.decision.accepted, false)
  }
  assert.equal(
    invoke(
      () => {},
      (task) => {
        const control = task.comments.find((comment) =>
          comment.body.includes(
            "production-day1-git-reconciliation-checkpoint-generation-activation-owner-ack-027\n",
          ),
        )
        task.comments.push(structuredClone(control))
      },
    ).rejection.code,
    "checkpoint_activation_recovery_control_count",
  )

  const resultMutations = [
    {
      code: "checkpoint_activation_recovery_result_publication_missing",
      mutate(task) {
        task.comments = task.comments.filter((comment) => comment.id !== 2702)
      },
    },
    {
      code: "checkpoint_activation_recovery_result_publication_ambiguous",
      mutate(task) {
        const result = task.comments.find((comment) => comment.id === 2702)
        task.comments.push({ ...structuredClone(result), id: 2703 })
      },
    },
    {
      code: "checkpoint_activation_recovery_result_publication_malformed",
      mutate(task) {
        const result = task.comments.find((comment) => comment.id === 2702)
        result.body = result.body.replace(/^  status:.*\n/m, "")
      },
    },
    {
      code: "checkpoint_activation_recovery_result_publication_comment_id",
      mutate(task) {
        task.comments.find((comment) => comment.id === 2702).id = "2702"
      },
    },
    {
      code: "checkpoint_activation_recovery_result_publication_binding",
      mutate(task) {
        const result = task.comments.find((comment) => comment.id === 2702)
        result.body = result.body.replace(
          `  branch: "${setup.proposal.branch}"`,
          '  branch: "agent/issue-63-other"',
        )
      },
    },
    {
      code: "checkpoint_activation_recovery_result_publication_malformed",
      mutate(task) {
        task.comments.push({
          id: 2703,
          body: `agent_result:\n  instruction_id: ${setup.activation.instruction.instructionId}`,
        })
      },
    },
  ]
  for (const { code, mutate } of resultMutations) {
    const decision = invoke(() => {}, mutate)
    assert.equal(decision.accepted, false)
    assert.equal(decision.rejection.code, code)
    const state = structuredClone(setup.state)
    const task = structuredClone(setup.task)
    mutate(task)
    const discovery = durableTaskInstructionDecision({ state, task })
    assert.equal(discovery.selectedInstruction, null)
    assert.equal(discovery.recoveryDiscovery.applicable, true)
    assert.equal(discovery.recoveryDiscovery.decision.rejection.code, code)
  }

  const acceptedRecovery = invoke()
  assert.equal(acceptedRecovery.accepted, true)
  const terminalState = structuredClone(setup.state)
  terminalState.checkpointActivationRecoveries.push({
    ...acceptedRecovery.value.record,
    selectedAt: "2026-08-24T09:01:00.000Z",
    boundaryActivatedAt: "2026-08-24T09:01:01.000Z",
    completedAt: "2026-08-24T09:02:00.000Z",
    status: "completed",
    outcome: "needs_review",
  })
  assert.equal(
    recoverCompletedCheckpointActivation({
      state: terminalState,
      task: setup.task,
    }).rejection.code,
    "checkpoint_activation_recovery_already_recorded",
  )
})

test("completed activation recovery reconstructs every exact persisted lifecycle phase", async (t) => {
  const setup = await completedGenerationActivationRecoverySetup(t)
  const initial = recoverCompletedCheckpointActivation({
    state: setup.state,
    task: setup.task,
  })
  assert.equal(initial.accepted, true)
  for (const phase of [
    "selected",
    "boundary_activated",
    "thread_ready",
    "turn_started",
    "turn_completed",
    "result_pending",
  ]) {
    const state = structuredClone(setup.state)
    const turnPhase = new Set([
      "turn_started",
      "turn_completed",
      "result_pending",
    ]).has(phase)
    const boundaryPhase = phase !== "selected"
    const record = {
      ...structuredClone(initial.value.record),
      status: boundaryPhase ? "boundary_activated" : "selected",
      selectedAt: "2026-08-24T09:01:00.000Z",
      boundaryActivatedAt: boundaryPhase
        ? "2026-08-24T09:01:01.000Z"
        : null,
      turnId: turnPhase ? "turn-recovery-027" : null,
    }
    state.status = turnPhase ? "running" : "needs_review"
    state.checkpointActivationRecoveries = [record]
    state.activeInstruction = {
      ...initial.value.instruction,
      phase,
      attempts: 0,
      turnCount: 1,
      selectedAt: record.selectedAt,
      ...(turnPhase
        ? {
            turnId: record.turnId,
            turnStartedAt: "2026-08-24T09:01:02.000Z",
            gitExecutionPermissionGrants: [],
          }
        : {}),
      checkpointActivationRecovery: {
        ...initial.value.binding,
        recoveryId: initial.value.record.recoveryId,
      },
    }
    const decision = recoverCompletedCheckpointActivation({
      state,
      task: setup.task,
    })
    assert.equal(decision.accepted, true, `${phase}: ${JSON.stringify(decision)}`)
  }

  const drifted = structuredClone(setup.state)
  drifted.status = "running"
  drifted.checkpointActivationRecoveries = [
    {
      ...structuredClone(initial.value.record),
      status: "boundary_activated",
      selectedAt: "2026-08-24T09:01:00.000Z",
      boundaryActivatedAt: "2026-08-24T09:01:01.000Z",
      turnId: "turn-other",
    },
  ]
  drifted.activeInstruction = {
    ...initial.value.instruction,
    phase: "turn_started",
    attempts: 0,
    turnCount: 1,
    selectedAt: "2026-08-24T09:01:00.000Z",
    turnId: "turn-recovery-027",
    turnStartedAt: "2026-08-24T09:01:02.000Z",
    gitExecutionPermissionGrants: [],
    checkpointActivationRecovery: {
      ...initial.value.binding,
      recoveryId: initial.value.record.recoveryId,
    },
  }
  assert.equal(
    recoverCompletedCheckpointActivation({
      state: drifted,
      task: setup.task,
    }).rejection.code,
    "checkpoint_activation_recovery_active_binding",
  )

  drifted.checkpointActivationRecoveries[0].turnId = "turn-recovery-027"
  drifted.activeInstruction.gitExecutionPermissionGrants = [
    {
      action: "cherry_pick",
      turnId: "turn-other",
      itemId: "item-other",
      grantedAt: "2026-08-24T09:01:03.000Z",
    },
  ]
  assert.equal(
    recoverCompletedCheckpointActivation({
      state: drifted,
      task: setup.task,
    }).rejection.code,
    "checkpoint_activation_recovery_active_binding",
  )
})

test("generation retry audit rejects changed scope, mutation, ambiguous controls, and non-proposal history", async (t) => {
  const setup = await checkpointGenerationRetrySetup(t)
  assert.equal(setup.generationRetryProposal.accepted, true)
  const baselineState = structuredClone(setup.state)
  const baselineTask = structuredClone(setup.task)
  const runFor = (state, suffix) =>
    state.runs.find((run) => run.instructionId.endsWith(suffix))
  const commentIndexFor = (task, instructionId) =>
    task.comments.findIndex((comment) =>
      comment.body.includes(`instruction_id: ${instructionId}`),
    )
  const invoke = async ({ mutateState = () => {}, mutateTask = () => {} }) => {
    const state = structuredClone(baselineState)
    const task = structuredClone(baselineTask)
    mutateState(state)
    mutateTask(task, state)
    return proposeGitReconciliationCheckpoint({
      ...setup,
      state,
      task,
      instruction: state.activeInstruction,
      now: new Date("2026-08-23T19:30:00.000Z"),
    })
  }
  assert.equal(
    (
      await invoke({
        mutateState: (state) => {
          runFor(state, "019").turnCount = 1
        },
      })
    ).rejection.code,
    "checkpoint_generation_audit_run_shape",
  )
  assert.equal(
    (
      await invoke({
        mutateState: (state) => {
          runFor(state, "019").commits.push("f".repeat(40))
        },
      })
    ).rejection.code,
    "checkpoint_generation_audit_run_shape",
  )
  assert.equal(
    (
      await invoke({
        mutateState: (state) => {
          runFor(state, "019").blockers = ["checkpoint_tree_drift"]
        },
      })
    ).rejection.code,
    "checkpoint_generation_audit_evidence",
  )
  assert.equal(
    (
      await invoke({
        mutateState: (state) => {
          runFor(state, "019").blockers = []
        },
      })
    ).rejection.code,
    "checkpoint_generation_audit_evidence",
  )
  assert.equal(
    (
      await invoke({
        mutateState: (state) => {
          runFor(state, "019").status = "needs_owner"
        },
      })
    ).rejection.code,
    "checkpoint_generation_audit_run_shape",
  )
  assert.equal(
    (
      await invoke({
        mutateState: (state) => {
          runFor(state, "019").resultArtifact = { status: "unknown" }
        },
      })
    ).rejection.code,
    "checkpoint_generation_audit_run_shape",
  )
  assert.equal(
    (
      await invoke({
        mutateState: (state) => {
          state.runs.push({
            ...structuredClone(runFor(state, "020")),
            instructionId: "unrelated-post-generation-run",
          })
        },
      })
    ).rejection.code,
    "checkpoint_generation_audit_scope",
  )
  const proposal019Id =
    "production-day1-git-reconciliation-checkpoint-generation-proposal-019"
  assert.equal(
    (
      await invoke({
        mutateTask: (task) => {
          const index = commentIndexFor(task, proposal019Id)
          task.comments.push(structuredClone(task.comments[index]))
        },
      })
    ).accepted,
    true,
  )
  assert.equal(
    (
      await invoke({
        mutateTask: (task) => {
          const index = commentIndexFor(task, proposal019Id)
          const conflicting = structuredClone(task.comments[index])
          conflicting.body = conflicting.body.replace(
            setup.tree,
            "f".repeat(40),
          )
          task.comments.push(conflicting)
        },
      })
    ).rejection.code,
    "checkpoint_generation_audit_control_conflict",
  )
  assert.equal(
    (
      await invoke({
        mutateState: (state) => {
          state.runs.push(structuredClone(runFor(state, "019")))
        },
      })
    ).rejection.code,
    "checkpoint_generation_audit_scope",
  )
  assert.equal(
    (
      await invoke({
        mutateTask: (task) => {
          const index = commentIndexFor(task, proposal019Id)
          const activationPrompt = gitReconciliationCheckpointActivationPrompt({
            checkpointId: `git-reconciliation-checkpoint:${"a".repeat(64)}`,
            reconciliationId:
              setup.state.workspaceBranchReconciliations[0].reconciliationId,
            head: setup.head,
            tree: setup.tree,
            cherryPickCommit: setup.cherryPickCommit,
          })
          task.comments[index] = {
            body: checkpointControl({
              instructionId: proposal019Id,
              taskState: "needs_review",
              prompt: activationPrompt,
            }),
          }
        },
      })
    ).rejection.code,
    "checkpoint_generation_audit_control_binding",
  )
  assert.equal(
    (
      await invoke({
        mutateTask: (task) => {
          const index = commentIndexFor(task, proposal019Id)
          task.comments[index].body = task.comments[index].body.replace(
            setup.tree,
            "f".repeat(40),
          )
        },
      })
    ).rejection.code,
    "checkpoint_generation_audit_control_binding",
  )
  assert.equal(
    (
      await invoke({
        mutateTask: (task) => {
          const proposal020Id =
            "production-day1-git-reconciliation-checkpoint-generation-proposal-020"
          const index = commentIndexFor(task, proposal020Id)
          task.comments[index].body = task.comments[index].body.replace(
            "production-day1-git-reconciliation-resume-010",
            "unrelated-reconciliation-receipt",
          )
        },
      })
    ).rejection.code,
    "checkpoint_generation_audit_control_binding",
  )
  assert.equal(
    (
      await invoke({
        mutateState: (state) => {
          state.gitReconciliationCheckpoints.push({
            kind: "proposal",
            proposalInstructionId: proposal019Id,
          })
        },
      })
    ).rejection.code,
    "checkpoint_generation_audit_record_conflict",
  )
  assert.equal(
    (
      await invoke({
        mutateTask: (task, state) => {
          const currentId = state.activeInstruction.instructionId
          const index = commentIndexFor(task, currentId)
          const prompt = gitReconciliationCheckpointGenerationProposalPrompt({
            reconciliationId:
              setup.state.workspaceBranchReconciliations[0].reconciliationId,
            head: "f".repeat(40),
            tree: setup.tree,
            cherryPickCommit: setup.cherryPickCommit,
          })
          task.comments[index] = {
            body: checkpointControl({
              instructionId: currentId,
              taskState: "needs_review",
              prompt,
            }),
          }
          const [instruction] = extractAgentControls(task.comments[index].body)
          state.activeInstruction = { ...instruction, phase: "selected" }
        },
      })
    ).rejection.code,
    "checkpoint_proposal_scope_binding",
  )
})

test("post-015 proposal retry proof rejects unrelated, mutable, ambiguous, and malformed history", async (t) => {
  const setup = await checkpointSetup(t)
  appendRejectedCheckpointProposalAttempt(setup, {
    instructionId: setup.proposalInstruction.instructionId,
    blocker: "checkpoint_proposal_exception",
    addControl: false,
  })
  selectCheckpointProposal(
    setup,
    "production-day1-git-reconciliation-checkpoint-proposal-017",
    setup.proposalInstruction.prompt,
  )
  const baselineState = structuredClone(setup.state)
  const baselineTask = structuredClone(setup.task)
  const attemptId = setup.proposalInstruction.instructionId
  const invoke = async ({ mutateState = () => {}, mutateTask = () => {} }) => {
    const state = structuredClone(baselineState)
    const task = structuredClone(baselineTask)
    mutateState(state)
    mutateTask(task)
    return proposeGitReconciliationCheckpoint({
      ...setup,
      state,
      task,
      instruction: state.activeInstruction,
      now: new Date("2026-08-23T10:02:00.000Z"),
    })
  }
  const replaceAttemptControl = (task, prompt, instructionId = attemptId) => {
    const index = task.comments.findIndex((comment) =>
      comment.body.includes(`instruction_id: ${attemptId}`),
    )
    task.comments[index] = {
      body: checkpointControl({
        instructionId,
        taskState: "needs_review",
        prompt,
      }),
    }
  }

  assert.equal(
    (
      await invoke({
        mutateState: (state) => {
          state.runs.at(-1).instructionId = "unrelated-intervening-run"
        },
      })
    ).rejection.code,
    "checkpoint_post_tail_control_count",
  )
  const reconciliationId =
    setup.state.workspaceBranchReconciliations[0].reconciliationId
  const changedTreePrompt = gitReconciliationCheckpointProposalPrompt({
    reconciliationId,
    head: setup.head,
    tree: setup.cherryPickCommit,
    cherryPickCommit: setup.cherryPickCommit,
  })
  assert.equal(
    (
      await invoke({
        mutateTask: (task) => replaceAttemptControl(task, changedTreePrompt),
      })
    ).rejection.code,
    "checkpoint_post_tail_control_tree",
  )
  assert.equal(
    (
      await invoke({
        mutateTask: (task) =>
          replaceAttemptControl(
            task,
            gitReconciliationCheckpointProposalPrompt({
              reconciliationId: `${reconciliationId}:changed`,
              head: setup.head,
              tree: setup.tree,
              cherryPickCommit: setup.cherryPickCommit,
            }),
          ),
      })
    ).rejection.code,
    "checkpoint_post_tail_control_reconciliation",
  )
  assert.equal(
    (
      await invoke({
        mutateTask: (task) =>
          replaceAttemptControl(
            task,
            gitReconciliationCheckpointProposalPrompt({
              reconciliationId,
              head: "f".repeat(40),
              tree: setup.tree,
              cherryPickCommit: setup.cherryPickCommit,
            }),
          ),
      })
    ).rejection.code,
    "checkpoint_post_tail_control_head",
  )
  assert.equal(
    (
      await invoke({
        mutateTask: (task) =>
          replaceAttemptControl(
            task,
            gitReconciliationCheckpointProposalPrompt({
              reconciliationId,
              head: setup.head,
              tree: setup.tree,
              cherryPickCommit: "e".repeat(40),
            }),
          ),
      })
    ).rejection.code,
    "checkpoint_post_tail_control_cherry_pick",
  )
  assert.equal(
    (
      await invoke({
        mutateTask: (task) =>
          replaceAttemptControl(
            task,
            setup.proposalInstruction.prompt.replace(
              "This proposal must not activate",
              "This prior proposal must not activate",
            ),
          ),
      })
    ).rejection.code,
    "checkpoint_post_tail_control_prompt",
  )
  assert.equal(
    (
      await invoke({
        mutateTask: (task) =>
          replaceAttemptControl(
            task,
            setup.proposalInstruction.prompt.replace(
              "agent/issue-63-production-day1-integration-001",
              "agent/issue-63-unrelated-branch",
            ),
          ),
      })
    ).rejection.code,
    "checkpoint_post_tail_control_prompt",
  )
  assert.equal(
    (
      await invoke({
        mutateTask: (task) => {
          const index = task.comments.findIndex((comment) =>
            comment.body.includes(`instruction_id: ${attemptId}`),
          )
          task.comments[index].body = task.comments[index].body.replace(
            "task_state: needs_review",
            "task_state: needs_owner",
          )
        },
      })
    ).rejection.code,
    "checkpoint_post_tail_control_task_state",
  )
  assert.equal(
    (
      await invoke({
        mutateTask: (task) => {
          const index = task.comments.findIndex((comment) =>
            comment.body.includes(`instruction_id: ${attemptId}`),
          )
          task.comments[index].body = task.comments[index].body.replace(
            "owner_approval_required: false",
            "owner_approval_required: true",
          )
        },
      })
    ).rejection.code,
    "checkpoint_post_tail_control_owner_approval",
  )
  assert.equal(
    (
      await invoke({
        mutateTask: (task) => {
          const index = task.comments.findIndex((comment) =>
            comment.body.includes(`instruction_id: ${attemptId}`),
          )
          task.comments[index].body = task.comments[index].body.replace(
            "action: continue",
            "action: stop",
          )
        },
      })
    ).rejection.code,
    "checkpoint_post_tail_control_action",
  )
  assert.equal(
    (
      await invoke({
        mutateTask: (task) => {
          const duplicate = task.comments.find((comment) =>
            comment.body.includes(`instruction_id: ${attemptId}`),
          )
          task.comments.push(structuredClone(duplicate))
        },
      })
    ).rejection.code,
    "checkpoint_post_tail_control_count",
  )
  assert.equal(
    (
      await invoke({
        mutateState: (state) => {
          state.runs.at(-1).branchPushState = ["Push: **ATTEMPTED**"]
        },
      })
    ).rejection.code,
    "checkpoint_post_tail_evidence",
  )
  assert.equal(
    (
      await invoke({
        mutateState: (state) => {
          state.runs.at(-1).turnCount = 1
        },
      })
    ).rejection.code,
    "checkpoint_post_tail_run_shape",
  )
  assert.equal(
    (
      await invoke({
        mutateState: (state) => {
          state.runs.at(-1).changedFiles = null
        },
      })
    ).rejection.code,
    "checkpoint_post_tail_run_shape",
  )
  assert.equal(
    (
      await invoke({
        mutateState: (state) => {
          state.runs.at(-1).blockers = []
        },
      })
    ).rejection.code,
    "checkpoint_post_tail_evidence",
  )
  assert.equal(
    (
      await invoke({
        mutateState: (state) => {
          state.gitReconciliationCheckpoints = [
            {
              kind: "proposal",
              proposalInstructionId: attemptId,
            },
          ]
        },
      })
    ).rejection.code,
    "checkpoint_post_tail_record_conflict",
  )
  assert.equal(
    (
      await invoke({
        mutateState: (state) => {
          state.gitReconciliationCheckpoints = [
            {
              kind: "activation",
              activationInstructionId: attemptId,
            },
          ]
        },
      })
    ).rejection.code,
    "checkpoint_post_tail_record_conflict",
  )
  const activationPrompt = gitReconciliationCheckpointActivationPrompt({
    checkpointId: `git-reconciliation-checkpoint:${"a".repeat(64)}`,
    reconciliationId:
      setup.state.workspaceBranchReconciliations[0].reconciliationId,
    head: setup.head,
    tree: setup.tree,
    cherryPickCommit: setup.cherryPickCommit,
  })
  assert.equal(
    (
      await invoke({
        mutateTask: (task) => replaceAttemptControl(task, activationPrompt),
      })
    ).rejection.code,
    "checkpoint_post_tail_activation_attempt",
  )
  assert.equal(
    (
      await invoke({
        mutateState: (state) => {
          state.runs.at(-1).originIssueNumber = 64
        },
      })
    ).rejection.code,
    "checkpoint_post_tail_run_shape",
  )
})

test("a retried proposal still requires one separate exact activation and grants only its selected worktree", async (t) => {
  const setup = await checkpointSetup(t)
  appendRejectedCheckpointProposalAttempt(setup, {
    instructionId: setup.proposalInstruction.instructionId,
    blocker: "checkpoint_proposal_exception",
    addControl: false,
  })
  appendRejectedCheckpointProposalAttempt(setup, {
    instructionId:
      "production-day1-git-reconciliation-checkpoint-proposal-017",
    blocker: "checkpoint_historical_tail_scope",
  })
  const proposalInstruction = selectCheckpointProposal(
    setup,
    "production-day1-git-reconciliation-checkpoint-proposal-018",
    setup.proposalInstruction.prompt,
  ).instruction
  const immutableHistory = JSON.stringify(setup.state.runs)
  const proposed = await proposeGitReconciliationCheckpoint({
    ...setup,
    state: setup.state,
    instruction: proposalInstruction,
    now: new Date("2026-08-23T10:03:00.000Z"),
  })
  assert.equal(proposed.accepted, true, JSON.stringify(proposed))
  const proposal = proposed.value.record
  setup.state.gitReconciliationCheckpoints.push(proposal)
  appendAcceptedCheckpointProposalRun(setup, proposal)

  const activationInstructionId =
    "production-day1-git-reconciliation-checkpoint-activation-019"
  const activationPrompt = gitReconciliationCheckpointActivationPrompt({
    checkpointId: proposal.checkpointId,
    reconciliationId: proposal.reconciliationId,
    head: proposal.head,
    tree: proposal.tree,
    cherryPickCommit: proposal.cherryPickCommit,
  })
  const activationBody = checkpointControl({
    instructionId: activationInstructionId,
    taskState: "needs_owner",
    prompt: activationPrompt,
  })
  setup.task.comments.push({ body: activationBody })
  const [activationInstruction] = extractAgentControls(activationBody)
  setup.state.status = "needs_owner"
  setup.state.activeInstruction = {
    ...activationInstruction,
    phase: "selected",
  }
  const activationInput = {
    ...setup,
    state: setup.state,
    instruction: activationInstruction,
  }
  const boundary = await authorizedGitExecutionBoundary(activationInput)
  assert.ok(boundary)
  assert.equal(boundary.checkpointId, proposal.checkpointId)
  assert.equal(boundary.checkpointActivationIsNew, true)
  assert.deepEqual(proposal.priorRejectedProposalInstructionIds, [
    setup.proposalInstruction.instructionId,
    "production-day1-git-reconciliation-checkpoint-proposal-017",
  ])
  assert.equal(
    gitExecutionPathIsCovered(
      boundary,
      path.join(boundary.gitDirectory, "index.lock"),
    ),
    true,
  )
  const sibling = path.join(
    boundary.commonDirectory,
    "worktrees",
    "issue-63-sibling",
    "index.lock",
  )
  assert.equal(gitExecutionPathIsCovered(boundary, sibling), false)
  assert.equal(JSON.stringify(setup.state.runs.slice(0, -1)), immutableHistory)

  const rejectedAttemptProposal = setup.proposal.value.record
  const oldActivationPrompt = gitReconciliationCheckpointActivationPrompt({
    checkpointId: rejectedAttemptProposal.checkpointId,
    reconciliationId: rejectedAttemptProposal.reconciliationId,
    head: rejectedAttemptProposal.head,
    tree: rejectedAttemptProposal.tree,
    cherryPickCommit: rejectedAttemptProposal.cherryPickCommit,
  })
  const oldActivationBody = checkpointControl({
    instructionId:
      "production-day1-git-reconciliation-checkpoint-activation-old-020",
    taskState: "needs_owner",
    prompt: oldActivationPrompt,
  })
  const oldTask = structuredClone(setup.task)
  oldTask.comments.push({ body: oldActivationBody })
  const [oldActivationInstruction] = extractAgentControls(oldActivationBody)
  const oldState = structuredClone(setup.state)
  oldState.gitReconciliationCheckpoints = [rejectedAttemptProposal]
  oldState.activeInstruction = {
    ...oldActivationInstruction,
    phase: "selected",
  }
  let oldDiagnostic = null
  assert.equal(
    await authorizedGitExecutionBoundary({
      ...setup,
      state: oldState,
      task: oldTask,
      instruction: oldActivationInstruction,
      onDiagnostic: (diagnostic) => {
        oldDiagnostic = diagnostic
      },
    }),
    null,
  )
  assert.equal(oldDiagnostic.code, "checkpoint_proposal_run_binding")

  boundary.checkpointActivation.activatedAt =
    "2026-08-23T10:04:00.000Z"
  setup.state.gitReconciliationCheckpoints.push(boundary.checkpointActivation)
  const restarted = await authorizedGitExecutionBoundary({
    ...activationInput,
    state: structuredClone(setup.state),
  })
  assert.ok(restarted)
  assert.equal(restarted.checkpointActivationIsNew, false)
  assert.equal(setup.state.gitReconciliationCheckpoints.length, 2)
})

test("superseding checkpoint proposal fails closed on drift, conflicts, and ambiguity", async (t) => {
  const setup = await checkpointSetup(t)
  assert.equal(setup.proposal.accepted, true, JSON.stringify(setup.proposal))
  const baselineState = structuredClone(setup.state)
  const rejectionFor = async (mutateState, mutateInput = () => {}) => {
    const state = structuredClone(baselineState)
    mutateState(state)
    const input = {
      ...setup,
      state,
      instruction: state.activeInstruction,
      now: new Date("2026-08-23T10:00:00.000Z"),
    }
    mutateInput(input)
    return proposeGitReconciliationCheckpoint(input)
  }

  assert.equal(
    (await rejectionFor((state) => {
      state.task.originIssueNumber = 64
    })).rejection.code,
    "checkpoint_origin_thread_workspace",
  )
  assert.equal(
    (await rejectionFor((state) => {
      state.threadId = "other-thread"
    })).rejection.code,
    "checkpoint_reconciliation_record_count",
  )
  assert.equal(
    (await rejectionFor((state) => {
      state.workspacePath = `${state.workspacePath}-other`
    })).rejection.code,
    "checkpoint_reconciliation_record_count",
  )
  assert.equal(
    (await rejectionFor((state) => {
      state.branch = "agent/issue-63-wrong-branch"
    })).rejection.code,
    "checkpoint_origin_thread_workspace",
  )
  assert.equal(
    (await rejectionFor((state) => {
      state.runs.at(-1).instructionId = "unexpected-tail-015"
    })).rejection.code,
    "checkpoint_historical_tail_scope",
  )
  assert.equal(
    (await rejectionFor((state) => {
      state.runs.at(-2).changedFiles = "unknown"
    })).rejection.code,
    "checkpoint_historical_changed_files",
  )
  assert.equal(
    (await rejectionFor((state) => {
      const run = state.runs.at(-2)
      run.branchPushState[1] = "Push/PR: **UNKNOWN**"
      run.resultArtifact.findings.branchPushState[1] =
        "Push/PR: **UNKNOWN**"
    })).rejection.code,
    "checkpoint_historical_push_pr_conflict",
  )
  assert.equal(
    (await rejectionFor((state) => {
      const run = state.runs.at(-2)
      const mutation = "A production mutation occurred."
      run.productionReadback = [mutation]
      run.resultArtifact.findings.productionReadback = [mutation]
    })).rejection.code,
    "checkpoint_historical_mutation_conflict",
  )
  assert.equal(
    (await rejectionFor((state) => {
      const run = state.runs.at(-2)
      const ambiguity = "Production mutation status is unknown."
      run.productionReadback = [ambiguity]
      run.resultArtifact.findings.productionReadback = [ambiguity]
    })).rejection.code,
    "checkpoint_historical_mutation_ambiguous",
  )
  assert.equal(
    (
      await rejectionFor(
        () => {},
        (input) => {
          input.pullRequestLookup = async () => [63]
        },
      )
    ).rejection.code,
    "checkpoint_pull_request_present",
  )
  assert.equal(
    (await rejectionFor((state) => {
      state.gitReconciliationCheckpoints = [
        setup.proposal.value.record,
        structuredClone(setup.proposal.value.record),
      ]
    })).rejection.code,
    "checkpoint_proposal_ambiguous",
  )

  await writeFile(path.join(setup.workspacePath, "dirty.txt"), "dirty\n")
  assert.equal(
    (await rejectionFor(() => {})).rejection.code,
    "activation_metadata_dirty",
  )
  await unlink(path.join(setup.workspacePath, "dirty.txt"))
  const gitPointer = await readFile(
    path.join(setup.workspacePath, ".git"),
    "utf8",
  )
  const gitDirectory = await realpath(gitPointer.trim().slice(8))
  await writeFile(path.join(gitDirectory, "CHERRY_PICK_HEAD"), `${setup.head}\n`)
  assert.equal(
    (await rejectionFor(() => {})).rejection.code,
    "activation_metadata_operation_marker",
  )
  await unlink(path.join(gitDirectory, "CHERRY_PICK_HEAD"))

  const wrongTreeState = structuredClone(baselineState)
  const wrongPrompt = gitReconciliationCheckpointProposalPrompt({
    reconciliationId:
      wrongTreeState.workspaceBranchReconciliations[0].reconciliationId,
    head: setup.head,
    tree: setup.cherryPickCommit,
    cherryPickCommit: setup.cherryPickCommit,
  })
  const wrongBody = checkpointControl({
    instructionId: wrongTreeState.activeInstruction.instructionId,
    taskState: "needs_review",
    prompt: wrongPrompt,
  })
  setup.task.comments = setup.task.comments.filter(
    (comment) => !comment.body.includes(setup.proposalInstruction.instructionId),
  )
  setup.task.comments.push({ body: wrongBody })
  const [wrongInstruction] = extractAgentControls(wrongBody)
  wrongTreeState.activeInstruction = {
    ...wrongInstruction,
    phase: "selected",
  }
  const wrongTree = await proposeGitReconciliationCheckpoint({
    ...setup,
    state: wrongTreeState,
    instruction: wrongInstruction,
  })
  assert.equal(wrongTree.rejection.code, "checkpoint_tree_drift")
})

test("proposal exceptions expose only stable redacted stage diagnostics", async (t) => {
  const setup = await checkpointSetup(t)
  const invoke = async (overrides = {}) => {
    const state = structuredClone(setup.state)
    const before = JSON.stringify(state)
    let diagnostic = null
    const result = await proposeGitReconciliationCheckpoint({
      ...setup,
      state,
      instruction: state.activeInstruction,
      pullRequestLookup: async () => [],
      ...overrides,
      onDiagnostic: (value) => {
        diagnostic = value
      },
    })
    assert.equal(result.accepted, false)
    assert.equal(result.value, null)
    assert.equal(JSON.stringify(state), before)
    assert.deepEqual(state.gitReconciliationCheckpoints, [])
    assert.doesNotMatch(JSON.stringify(diagnostic), /credential-secret-value/)
    return diagnostic
  }

  const missingExecutable = new Error("credential-secret-value")
  missingExecutable.code = "ENOENT"
  missingExecutable.path = "gh"
  assert.deepEqual(
    await invoke({
      pullRequestLookup: async () => {
        throw missingExecutable
      },
    }),
    {
      code: "checkpoint_proposal_exception",
      stage: "pull_request_lookup",
      reason: "executable_missing",
      errorCode: "ENOENT",
    },
  )

  assert.deepEqual(
    await invoke({
      pullRequestLookup: async () => {
        throw new SyntaxError("credential-secret-value")
      },
    }),
    {
      code: "checkpoint_proposal_exception",
      stage: "pull_request_lookup",
      reason: "invalid_json",
    },
  )

  const invalidResult = new Error("credential-secret-value")
  invalidResult.code = "CHECKPOINT_INVALID_RESULT"
  assert.deepEqual(
    await invoke({
      pullRequestLookup: async () => {
        throw invalidResult
      },
    }),
    {
      code: "checkpoint_proposal_exception",
      stage: "pull_request_lookup",
      reason: "invalid_result",
      errorCode: "CHECKPOINT_INVALID_RESULT",
    },
  )

  const workspaceGitFile = path.join(setup.workspacePath, ".git")
  const hiddenWorkspaceGitFile = path.join(setup.workspacePath, ".git.hidden")
  await rename(workspaceGitFile, hiddenWorkspaceGitFile)
  try {
    assert.deepEqual(await invoke(), {
      code: "checkpoint_proposal_exception",
      stage: "metadata_workspace_git_file_type",
      reason: "not_found",
      errorCode: "ENOENT",
    })
  } finally {
    await rename(hiddenWorkspaceGitFile, workspaceGitFile)
  }

  await git(setup.workspacePath, "remote", "rename", "origin", "unavailable")
  try {
    assert.deepEqual(
      await invoke({ baseRef: setup.proposal.value.record.baseCommit }),
      {
        code: "checkpoint_proposal_exception",
        stage: "remote_branch_lookup",
        reason: "command_failed",
        errorCode: "exit_128",
      },
    )
  } finally {
    await git(setup.workspacePath, "remote", "rename", "unavailable", "origin")
  }

  assert.deepEqual(await invoke({ now: new Date(Number.NaN) }), {
    code: "checkpoint_proposal_exception",
    stage: "checkpoint_timestamp_serialization",
    reason: "invalid_time",
  })
})

test("#63/011 historical activation and request failures have exact bounded reason codes", async (t) => {
  const setup = await fixture(t, { execution011: true })
  const rejectionFor = async (state) => {
    let diagnostic = null
    const boundary = await authorizedGitExecutionBoundary({
      ...setup,
      state,
      onDiagnostic: (value) => {
        diagnostic = value
      },
    })
    assert.equal(boundary, null)
    return diagnostic
  }

  const wrongWorkspace = structuredClone(setup.state)
  wrongWorkspace.runs.at(-1).workspacePath = `${setup.workspacePath}-other`
  assert.equal(
    (await rejectionFor(wrongWorkspace)).code,
    "activation_historical_run_workspace",
  )

  const changedHead = structuredClone(setup.state)
  changedHead.runs.at(-1).commits = ["f".repeat(40)]
  assert.equal(
    (await rejectionFor(changedHead)).code,
    "activation_historical_run_head_proof",
  )

  const ambiguous = structuredClone(setup.state)
  ambiguous.workspaceBranchReconciliations.push(
    structuredClone(ambiguous.workspaceBranchReconciliations[0]),
  )
  assert.equal(
    (await rejectionFor(ambiguous)).code,
    "activation_reconciliation_record_ambiguous",
  )

  const exactRequest = permissionRequest(setup.boundary)
  assert.equal(
    gitExecutionBoundaryRequestDecision({
      boundary: setup.boundary,
      request: exactRequest.request,
      commandExecution: null,
    }).rejection.code,
    "request_command_context_missing",
  )
  const malformedPermissions = structuredClone(exactRequest)
  malformedPermissions.request.details.permissions = {
    file_system: { write: setup.boundary.writablePaths },
  }
  assert.equal(
    gitExecutionBoundaryRequestDecision({
      boundary: setup.boundary,
      ...malformedPermissions,
    }).rejection.code,
    "request_filesystem_permissions",
  )
})

test("boundary rejects other worktrees, issues, path escapes, drift, and missing approval", async (t) => {
  const setup = await fixture(t)
  const { boundary, checkoutPath, workspaceRoot, head } = setup
  assert.ok(boundary)
  const siblingWorkspace = path.join(
    workspaceRoot,
    "issue-64-unrelated-worktree-001",
  )
  await git(
    checkoutPath,
    "worktree",
    "add",
    "-b",
    "agent/issue-64-unrelated-worktree-001",
    siblingWorkspace,
    head,
  )
  const siblingPointer = await readFile(path.join(siblingWorkspace, ".git"), "utf8")
  const siblingGitDirectory = await realpath(
    siblingPointer.trim().slice("gitdir: ".length),
  )
  assert.equal(
    gitExecutionPathIsCovered(boundary, path.join(siblingGitDirectory, "index.lock")),
    false,
  )
  assert.equal(
    gitExecutionPathIsCovered(
      boundary,
      path.join(
        boundary.commonDirectory,
        "refs",
        "heads",
        "agent",
        "issue-64-unrelated-worktree-001",
      ),
    ),
    false,
  )
  assert.equal(
    gitExecutionPathIsCovered(boundary, path.join(boundary.commonDirectory, "config")),
    false,
  )
  assert.equal(
    await authorizedGitExecutionBoundary({
      ...setup,
      workspacePath: siblingWorkspace,
    }),
    null,
  )

  const wrongIssue = structuredClone(setup.state)
  wrongIssue.task.originIssueNumber = 64
  assert.equal(
    await authorizedGitExecutionBoundary({ ...setup, state: wrongIssue }),
    null,
  )
  const mismatchedAction = structuredClone(setup.state)
  mismatchedAction.activeInstruction.instructionId = "another-action"
  assert.equal(
    await authorizedGitExecutionBoundary({ ...setup, state: mismatchedAction }),
    null,
  )
  const unapprovedInstruction = {
    ...setup.instruction,
    prompt: setup.instruction.prompt.replace(
      "The owner explicitly approves",
      "The owner has not approved",
    ),
  }
  const unapprovedTask = structuredClone(setup.task)
  unapprovedTask.comments = unapprovedTask.comments.map((comment) => ({
    ...comment,
    body: comment.body.replace(
      "The owner explicitly approves",
      "The owner has not approved",
    ),
  }))
  const unapprovedState = structuredClone(setup.state)
  unapprovedState.activeInstruction = {
    ...unapprovedInstruction,
    phase: "selected",
  }
  assert.equal(
    await authorizedGitExecutionBoundary({
      ...setup,
      state: unapprovedState,
      instruction: unapprovedInstruction,
      task: unapprovedTask,
    }),
    null,
  )

  const traversalPath = `${workspaceRoot}/nested/../${path.basename(setup.workspacePath)}`
  const traversalState = structuredClone(setup.state)
  traversalState.workspacePath = traversalPath
  traversalState.workspaceBranchReconciliations[0].workspacePath = traversalPath
  assert.equal(
    await authorizedGitExecutionBoundary({
      ...setup,
      state: traversalState,
      workspacePath: traversalPath,
    }),
    null,
  )
  const aliasPath = path.join(workspaceRoot, "issue-63-symlink-alias")
  await symlink(setup.workspacePath, aliasPath)
  const aliasState = structuredClone(setup.state)
  aliasState.workspacePath = aliasPath
  aliasState.workspaceBranchReconciliations[0].workspacePath = aliasPath
  assert.equal(
    await authorizedGitExecutionBoundary({
      ...setup,
      state: aliasState,
      workspacePath: aliasPath,
    }),
    null,
  )

  await writeFile(path.join(setup.workspacePath, "dirty.txt"), "manual drift\n")
  assert.equal(await authorizedGitExecutionBoundary(setup), null)
  await unlink(path.join(setup.workspacePath, "dirty.txt"))

  await writeFile(path.join(boundary.gitDirectory, "CHERRY_PICK_HEAD"), head)
  assert.equal(await authorizedGitExecutionBoundary(setup), null)
  await unlink(path.join(boundary.gitDirectory, "CHERRY_PICK_HEAD"))

  const objectsPath = path.join(boundary.commonDirectory, "objects")
  const escapedObjectsPath = path.join(setup.directory, "escaped-objects")
  await rename(objectsPath, escapedObjectsPath)
  await symlink(escapedObjectsPath, objectsPath)
  assert.equal(await authorizedGitExecutionBoundary(setup), null)
})

test("permission matching rejects unrelated commands and broadened metadata", async (t) => {
  const { boundary } = await fixture(t)
  assert.ok(boundary)
  const ordinary = permissionRequest(boundary)
  ordinary.commandExecution.command = "npm test"
  assert.equal(
    matchGitExecutionBoundaryRequest({ boundary, ...ordinary }),
    null,
  )
  const escalatedValidation = permissionRequest(boundary)
  const validationCommand = boundary.commands.validation[0]
  escalatedValidation.request.method =
    "item/commandExecution/requestApproval"
  escalatedValidation.request.details = {
    command: validationCommand,
    cwd: boundary.workspacePath,
    reason: "Run this command outside the sandbox",
  }
  escalatedValidation.commandExecution.command = validationCommand
  assert.equal(
    matchGitExecutionBoundaryRequest({ boundary, ...escalatedValidation }),
    null,
  )
  const wrongCommit = permissionRequest(boundary)
  wrongCommit.commandExecution.command = wrongCommit.commandExecution.command.replace(
    boundary.cherryPickCommit,
    "f".repeat(40),
  )
  assert.equal(
    matchGitExecutionBoundaryRequest({ boundary, ...wrongCommit }),
    null,
  )
  const siblingMetadata = permissionRequest(boundary)
  siblingMetadata.request.details.permissions.fileSystem.write.push(
    path.join(boundary.commonDirectory, "worktrees", "another-issue"),
  )
  assert.equal(
    matchGitExecutionBoundaryRequest({ boundary, ...siblingMetadata }),
    null,
  )
  const traversal = permissionRequest(boundary)
  traversal.request.details.permissions.fileSystem.write[0] = path.join(
    boundary.gitDirectory,
    "..",
  )
  assert.equal(
    matchGitExecutionBoundaryRequest({ boundary, ...traversal }),
    null,
  )
  const fullAccess = permissionRequest(boundary)
  fullAccess.request.details.permissions = {
    fileSystem: { write: [boundary.commonDirectory] },
  }
  assert.equal(
    matchGitExecutionBoundaryRequest({ boundary, ...fullAccess }),
    null,
  )
  const wrongWorkspace = permissionRequest(boundary)
  wrongWorkspace.commandExecution.cwd = path.dirname(boundary.workspacePath)
  assert.equal(
    matchGitExecutionBoundaryRequest({ boundary, ...wrongWorkspace }),
    null,
  )
})

test("boundary rejects actual branch and HEAD drift independently", async (t) => {
  const setup = await fixture(t)
  assert.ok(setup.boundary)
  await git(setup.workspacePath, "switch", "--detach", setup.head)
  assert.equal(await authorizedGitExecutionBoundary(setup), null)
  await git(setup.workspacePath, "switch", issue63ReconciledBranch)
  await writeFile(path.join(setup.workspacePath, "head-drift.txt"), "drift\n")
  await git(setup.workspacePath, "add", "head-drift.txt")
  await git(setup.workspacePath, "commit", "-m", "unreviewed head drift")
  assert.equal(await authorizedGitExecutionBoundary(setup), null)
})

async function managedExecutionSetup(t) {
  const setup = await checkpointGenerationRetrySetup(t)
  assert.equal(setup.generationRetryProposal.accepted, true)
  const proposal = setup.generationRetryProposal.value.record
  setup.state.gitReconciliationCheckpoints.push(proposal)
  appendAcceptedCheckpointProposalRun(setup, proposal)
  const activationPrompt = gitReconciliationCheckpointActivationPrompt({
    checkpointId: proposal.checkpointId,
    reconciliationId: proposal.reconciliationId,
    head: proposal.head,
    tree: proposal.tree,
    cherryPickCommit: proposal.cherryPickCommit,
    generation: proposal.generation,
    generationId: proposal.generationId,
  }).replace(
    `- reconciliation receipt: \`${proposal.reconciliationId}\``,
    `- reconciliation receipt: \`${setup.state.workspaceBranchReconciliations[0].continuationInstructionId}\``,
  )
  const appendActivationAttempt = ({
    instructionId,
    turnCount,
    status,
    ownerApprovalRequired = false,
  }) => {
    const activationBody = checkpointControl({
      instructionId,
      taskState: "needs_owner",
      prompt: activationPrompt,
      ownerApprovalRequired,
    })
    setup.task.comments.push({ body: activationBody })
    setup.state.runs.push({
      instructionId,
      status,
      threadId: issue63ThreadId,
      workspacePath: setup.workspacePath,
      branch: issue63ReconciledBranch,
      commits: turnCount === 0 ? [] : [setup.head],
      changedFiles:
        turnCount === 0 ? [] : structuredClone(issue63LiveChangedFiles),
      turnCount,
      originIssueNumber: 63,
      originIssueUrl: issue63OriginUrl,
      ownerRequest:
        ownerApprovalRequired
          ? {
              method: "control-plane/ownerGate",
              reason:
                "The control-plane instruction explicitly requires owner approval.",
            }
          : null,
      checks: {
        typecheck: "not_run",
        lint: "not_run",
        tests: "not_run",
        cloudflareReadiness: "not_run",
        build: "not_run",
        diffCheck: turnCount === 0 ? "not_run" : "pass",
      },
      blockers: [],
      ownerGates:
        ownerApprovalRequired
          ? ["The control-plane instruction explicitly requires owner approval."]
          : [],
      productionReadback: [],
      safetyFindings: [],
      branchPushState:
        turnCount === 0
          ? []
          : [
              `Branch/current HEAD: \`${issue63ReconciledBranch}\` at \`${setup.head}\``,
              "Live remote foundation: **PASS**",
              "Push/PR: **NOT ATTEMPTED**",
            ],
      resultArtifact: turnCount === 0 ? null : { status: "completed" },
      completedAt:
        turnCount === 0
          ? "2026-08-23T19:46:42.895Z"
          : "2026-08-23T19:52:30.531Z",
    })
  }
  appendActivationAttempt({
    instructionId:
      "production-day1-git-reconciliation-checkpoint-generation-activation-022",
    turnCount: 0,
    status: "needs_owner",
    ownerApprovalRequired: true,
  })
  appendActivationAttempt({
    instructionId:
      "production-day1-git-reconciliation-checkpoint-generation-activation-023",
    turnCount: 1,
    status: "needs_review",
  })
  const prompt = gitReconciliationCheckpointManagedExecutionPrompt({
    checkpointId: proposal.checkpointId,
    generationId: proposal.generationId,
    reconciliationId: proposal.reconciliationId,
    head: proposal.head,
    tree: proposal.tree,
    cherryPickCommit: proposal.cherryPickCommit,
  })
  const body = checkpointControl({
    instructionId:
      "production-day1-git-reconciliation-checkpoint-generation-execution-024",
    taskState: "needs_review",
    prompt,
  })
  setup.task.comments.push({ body })
  const [instruction] = extractAgentControls(body)
  setup.state.status = "needs_review"
  setup.state.activeInstruction = { ...instruction, phase: "selected" }
  return {
    ...setup,
    proposal,
    prompt,
    instruction,
    input: {
      ...setup,
      state: setup.state,
      instruction,
      pullRequestLookup: async () => [],
      now: new Date("2026-08-23T20:30:00.000Z"),
    },
  }
}

test("managed checkpoint execution writes only the selected linked worktree and recovers exactly once", async (t) => {
  const setup = await managedExecutionSetup(t)
  const siblingPath = path.join(
    path.dirname(setup.workspacePath),
    "issue-63-sibling",
  )
  await git(
    setup.checkoutPath,
    "worktree",
    "add",
    "-b",
    "agent/issue-63-sibling",
    siblingPath,
    setup.head,
  )
  const siblingPointer = await readFile(path.join(siblingPath, ".git"), "utf8")
  const siblingGitDirectory = await realpath(
    siblingPointer.trim().slice("gitdir: ".length),
  )
  const siblingBefore = await fileSnapshot(siblingGitDirectory)

  const initial = await prepareGitReconciliationCheckpointExecution(setup.input)
  assert.equal(initial.accepted, true)
  assert.equal(initial.value.mode, "execute")
  assert.equal(initial.value.isNewIntent, true)
  assert.equal(initial.value.record.checkpointId, setup.proposal.checkpointId)
  assert.equal(initial.value.record.generationId, setup.proposal.generationId)
  assert.equal(initial.value.record.gitDirectory, setup.proposal.gitDirectory)
  assert.notEqual(initial.value.record.gitDirectory, siblingGitDirectory)
  setup.state.gitReconciliationCheckpoints.push(initial.value.record)
  const persisted = await prepareGitReconciliationCheckpointExecution(setup.input)
  assert.equal(persisted.accepted, true)
  assert.equal(persisted.value.mode, "execute")
  assert.equal(persisted.value.isNewIntent, false)
  const executed = await executeGitReconciliationCheckpointMutation({
    plan: persisted.value,
  })
  assert.equal(executed.accepted, true, JSON.stringify(executed))

  const recovered = await prepareGitReconciliationCheckpointExecution(setup.input)
  assert.equal(recovered.accepted, true, JSON.stringify(recovered))
  assert.equal(recovered.value.mode, "recover")
  assert.equal(recovered.value.isNewReceipt, true)
  assert.equal(recovered.value.receipt.parentHead, setup.head)
  assert.equal(recovered.value.receipt.tree, setup.proposal.cherryPickTargetTree)
  assert.equal(await git(setup.workspacePath, "rev-list", "--count", `${setup.head}..HEAD`), "1")
  setup.state.gitReconciliationCheckpoints.push(recovered.value.receipt)

  const replay = await prepareGitReconciliationCheckpointExecution(setup.input)
  assert.equal(replay.accepted, true)
  assert.equal(replay.value.mode, "complete")
  assert.equal(replay.value.isNewReceipt, false)
  assert.equal(
    setup.state.gitReconciliationCheckpoints.filter(
      (record) => record.kind === "execution_intent",
    ).length,
    1,
  )
  assert.equal(
    setup.state.gitReconciliationCheckpoints.filter(
      (record) => record.kind === "execution_receipt",
    ).length,
    1,
  )
  assert.deepEqual(await fileSnapshot(siblingGitDirectory), siblingBefore)
})

test("injected broker channel loss fails closed at every pending protocol phase", async (t) => {
  await t.test("stdin EPIPE during the pending request preserves its cause", async () => {
    const fixture = injectedBrokerFixture()
    const pending = injectedExecution(fixture)
    const error = new Error("broken pipe")
    error.code = "EPIPE"
    fixture.stdin.emit("error", error)
    await assert.rejects(
      settleInjectedBroker(pending),
      (rejection) => assertBrokerLost(rejection, "EPIPE"),
    )
    assert.equal(fixture.killInvocations, 1)
    assert.equal(fixture.listenerCount(), 0)
  })

  await t.test("response end before BOUNDARY_READY", async () => {
    const fixture = injectedBrokerFixture()
    const pending = injectedExecution(fixture)
    fixture.response.emit("end")
    await assert.rejects(settleInjectedBroker(pending), assertBrokerLost)
    assert.equal(fixture.killInvocations, 1)
    assert.equal(fixture.listenerCount(), 0)
  })

  await t.test("response close before BOUNDARY_READY", async () => {
    const fixture = injectedBrokerFixture()
    const pending = injectedExecution(fixture)
    fixture.response.emit("close")
    await assert.rejects(settleInjectedBroker(pending), assertBrokerLost)
    assert.equal(fixture.killInvocations, 1)
    assert.equal(fixture.listenerCount(), 0)
  })

  await t.test(
    "response EOF after BOUNDARY_READY but before MUTATION_COMMITTED",
    async () => {
      const fixture = injectedBrokerFixture()
      const pending = injectedExecution(fixture, {
        afterMutation: async () => {},
      })
      fixture.response.emit("data", Buffer.from("BOUNDARY_READY\n"))
      fixture.response.emit("end")
      await assert.rejects(settleInjectedBroker(pending), assertBrokerLost)
      assert.equal(fixture.killInvocations, 1)
      assert.equal(fixture.listenerCount(), 0)
    },
  )

  await t.test("unexpected stdin close before intentional end", async () => {
    const fixture = injectedBrokerFixture()
    const pending = injectedExecution(fixture)
    fixture.stdin.closeUnexpectedly()
    await assert.rejects(settleInjectedBroker(pending), assertBrokerLost)
    assert.equal(fixture.killInvocations, 1)
    assert.equal(fixture.listenerCount(), 0)
  })

  await t.test("child success exit before required response", async () => {
    const fixture = injectedBrokerFixture()
    const pending = injectedExecution(fixture)
    fixture.closeChild(0, null)
    await assert.rejects(settleInjectedBroker(pending), assertBrokerLost)
    assert.equal(fixture.killInvocations, 0)
    assert.equal(fixture.listenerCount(), 0)
  })

  await t.test("terminal response loss permits no later control write", async () => {
    const fixture = injectedBrokerFixture()
    const pending = injectedExecution(fixture)
    fixture.response.emit("end")
    await assert.rejects(settleInjectedBroker(pending), assertBrokerLost)
    fixture.response.emit("data", Buffer.from("BOUNDARY_READY\n"))
    await Promise.resolve()
    assert.equal(fixture.stdin.writes.length, 1)
    assert.equal(fixture.killInvocations, 1)
    assert.equal(fixture.listenerCount(), 0)
  })

  await t.test("an already exited child is never killed again", async () => {
    const fixture = injectedBrokerFixture()
    fixture.child.exitCode = 0
    const pending = injectedExecution(fixture)
    fixture.closeChild(0, null)
    await assert.rejects(settleInjectedBroker(pending), assertBrokerLost)
    assert.equal(fixture.killInvocations, 0)
    assert.equal(fixture.listenerCount(), 0)
  })
})

test("injected broker terminal races settle once without leaking lifecycle listeners", async (t) => {
  await t.test("response EOF versus child exit", async () => {
    const fixture = injectedBrokerFixture()
    const observed = observedSettlement(injectedExecution(fixture))
    fixture.response.emit("end")
    fixture.closeChild(0, null)
    await assert.rejects(
      settleInjectedBroker(observed.promise),
      assertBrokerLost,
    )
    await Promise.resolve()
    assert.equal(observed.count(), 1)
    assert.equal(fixture.killInvocations, 0)
    assert.equal(fixture.listenerCount(), 0)
  })

  await t.test("response end and close duplicate callbacks", async () => {
    const fixture = injectedBrokerFixture()
    const observed = observedSettlement(injectedExecution(fixture))
    fixture.response.emit("end")
    fixture.response.emit("close")
    await assert.rejects(
      settleInjectedBroker(observed.promise),
      assertBrokerLost,
    )
    await Promise.resolve()
    assert.equal(observed.count(), 1)
    assert.equal(fixture.killInvocations, 1)
    assert.equal(fixture.listenerCount(), 0)
  })

  await t.test("stdin EPIPE versus child exit preserves the first cause", async () => {
    const fixture = injectedBrokerFixture()
    const observed = observedSettlement(injectedExecution(fixture))
    const error = new Error("broken pipe")
    error.code = "EPIPE"
    fixture.stdin.emit("error", error)
    fixture.closeChild(0, null)
    await assert.rejects(
      settleInjectedBroker(observed.promise),
      (rejection) => assertBrokerLost(rejection, "EPIPE"),
    )
    await Promise.resolve()
    assert.equal(observed.count(), 1)
    assert.equal(fixture.killInvocations, 1)
    assert.equal(fixture.listenerCount(), 0)
  })

  await t.test("repeated terminateBroker calls perform one kill", async () => {
    const fixture = injectedBrokerFixture()
    let terminationResults = null
    const observed = observedSettlement(
      injectedExecution(fixture, {
        beforeMutation: ({ terminateBroker }) => {
          terminationResults = [terminateBroker(), terminateBroker()]
        },
      }),
    )
    fixture.response.emit("data", Buffer.from("BOUNDARY_READY\n"))
    await assert.rejects(
      settleInjectedBroker(observed.promise),
      assertBrokerLost,
    )
    await Promise.resolve()
    assert.deepEqual(terminationResults, [true, false])
    assert.equal(observed.count(), 1)
    assert.equal(fixture.stdin.writes.length, 1)
    assert.equal(fixture.killInvocations, 1)
    assert.equal(fixture.listenerCount(), 0)
  })

  await t.test(
    "successful final response and immediate child exit tolerate response close",
    async () => {
      const fixture = injectedBrokerFixture()
      fixture.stdin.onWrite = (value) => {
        if (value === "continue\n") {
          fixture.response.emit(
            "data",
            Buffer.from("MUTATION_COMMITTED\n"),
          )
        }
      }
      fixture.stdin.onEnd = (value) => {
        assert.equal(value, "verify\n")
        fixture.stdout.emit("data", Buffer.from('{"receipt":true}\n'))
        fixture.response.emit("end")
        fixture.response.emit("close")
        fixture.closeChild(0, null)
      }
      const observed = observedSettlement(
        injectedExecution(fixture, { afterMutation: async () => {} }),
      )
      fixture.response.emit("data", Buffer.from("BOUNDARY_READY\n"))
      const result = await settleInjectedBroker(observed.promise)
      await Promise.resolve()
      assert.equal(result.stdout, '{"receipt":true}\n')
      assert.equal(observed.count(), 1)
      assert.equal(fixture.killInvocations, 0)
      assert.equal(fixture.listenerCount(), 0)
    },
  )
})

test("fixed mutation broker serializes duplicate cooperating executions", async (t) => {
  const setup = await managedExecutionSetup(t)
  const prepared = await prepareGitReconciliationCheckpointExecution(setup.input)
  assert.equal(prepared.accepted, true)
  const entered = deferredBarrier()
  const release = deferredBarrier()
  const first = executeGitReconciliationCheckpointMutation({
    plan: prepared.value,
    continueAfterBeforeExecute: true,
    beforeExecute: async () => {
      entered.resolve()
      await release.promise
    },
  })
  await entered.promise
  const duplicate = await executeGitReconciliationCheckpointMutation({
    plan: prepared.value,
  })
  assert.equal(duplicate.accepted, false)
  assert.equal(duplicate.rejection.code, "managed_execution_broker_busy")
  assert.equal(await git(setup.workspacePath, "rev-parse", "HEAD"), setup.head)
  release.resolve()
  const owner = await first
  assert.equal(owner.accepted, true, JSON.stringify(owner))
  assert.equal(
    await git(setup.workspacePath, "rev-list", "--count", `${setup.head}..HEAD`),
    "1",
  )
})

test("fixed mutation broker loss before mutation fails closed", async (t) => {
  const setup = await managedExecutionSetup(t)
  const prepared = await prepareGitReconciliationCheckpointExecution(setup.input)
  assert.equal(prepared.accepted, true)
  let terminationResults = null
  const result = await executeGitReconciliationCheckpointMutation({
    plan: prepared.value,
    continueAfterBeforeExecute: true,
    beforeExecute: async ({ terminateBroker }) => {
      terminationResults = [terminateBroker(), terminateBroker()]
    },
  })
  assert.equal(result.accepted, false)
  assert.equal(result.rejection.code, "managed_execution_broker_lost")
  assert.deepEqual(terminationResults, [true, false])
  assert.equal(await git(setup.workspacePath, "rev-parse", "HEAD"), setup.head)
})

test("broker termination after mutation reconciles one receipt without replay", async (t) => {
  for (
    let iteration = 1;
    iteration <= brokerLifecycleStressIterations;
    iteration += 1
  ) {
    await t.test(`iteration ${iteration}`, async (t) => {
      const setup = await managedExecutionSetup(t)
      const prepared = await prepareGitReconciliationCheckpointExecution(
        setup.input,
      )
      assert.equal(prepared.accepted, true)
      setup.state.gitReconciliationCheckpoints.push(prepared.value.record)
      let terminationResults = null
      const interrupted = await executeGitReconciliationCheckpointMutation({
        plan: prepared.value,
        afterExecuteMutation: async ({ terminateBroker }) => {
          terminationResults = [terminateBroker(), terminateBroker()]
        },
      })
      assert.equal(interrupted.accepted, false)
      assert.deepEqual(terminationResults, [true, false])
      assert.equal(
        await git(
          setup.workspacePath,
          "rev-list",
          "--count",
          `${setup.head}..HEAD`,
        ),
        "1",
      )
      const recovered = await prepareGitReconciliationCheckpointExecution(
        setup.input,
      )
      assert.equal(recovered.accepted, true, JSON.stringify(recovered))
      assert.equal(recovered.value.mode, "recover")
      assert.equal(recovered.value.isNewReceipt, true)
      setup.state.gitReconciliationCheckpoints.push(recovered.value.receipt)
      const replay = await prepareGitReconciliationCheckpointExecution(
        setup.input,
      )
      assert.equal(replay.accepted, true)
      assert.equal(replay.value.mode, "complete")
      assert.equal(
        setup.state.gitReconciliationCheckpoints.filter(
          (record) => record.kind === "execution_intent",
        ).length,
        1,
      )
      assert.equal(
        setup.state.gitReconciliationCheckpoints.filter(
          (record) => record.kind === "execution_receipt",
        ).length,
        1,
      )
      assert.equal(
        await git(
          setup.workspacePath,
          "rev-list",
          "--count",
          `${setup.head}..HEAD`,
        ),
        "1",
      )
    })
  }
})

test("broker post-mutation verification succeeds after a no-op lifecycle hook", async (t) => {
  const setup = await managedExecutionSetup(t)
  const prepared = await prepareGitReconciliationCheckpointExecution(setup.input)
  assert.equal(prepared.accepted, true)
  const result = await executeGitReconciliationCheckpointMutation({
    plan: prepared.value,
    afterExecuteMutation: async () => {},
  })
  assert.equal(result.accepted, true, JSON.stringify(result))
  assert.equal(
    result.value.brokerReceipt.executionId,
    prepared.value.record.executionId,
  )
  assert.equal(
    await git(setup.workspacePath, "rev-list", "--count", `${setup.head}..HEAD`),
    "1",
  )
})

test("managed execution pins the authorized worktree and rejects final path or Git metadata replacement", async (t) => {
  async function setupSibling(setup, suffix) {
    const siblingPath = path.join(
      path.dirname(setup.workspacePath),
      `issue-63-boundary-sibling-${suffix}`,
    )
    await git(
      setup.checkoutPath,
      "worktree",
      "add",
      "-b",
      `agent/issue-63-boundary-sibling-${suffix}`,
      siblingPath,
      setup.head,
    )
    const pointer = await readFile(path.join(siblingPath, ".git"), "utf8")
    const gitDirectory = await realpath(
      pointer.trim().slice("gitdir: ".length),
    )
    return { siblingPath, pointer, gitDirectory }
  }

  await t.test("workspace path replacement", async (t) => {
    const setup = await managedExecutionSetup(t)
    const prepared = await prepareGitReconciliationCheckpointExecution(setup.input)
    assert.equal(prepared.accepted, true)
    const sibling = await setupSibling(setup, "workspace")
    const siblingBefore = await fileSnapshot(sibling.gitDirectory)
    const moved = `${setup.workspacePath}-authorized-moved`
    let replaced = false
    try {
      const result = await executeGitReconciliationCheckpointMutation({
        plan: prepared.value,
        beforeExecute: async () => {
          await rename(setup.workspacePath, moved)
          await symlink(sibling.siblingPath, setup.workspacePath)
          replaced = true
        },
      })
      assert.equal(result.accepted, false)
      assert.equal(result.rejection.code, "managed_execution_boundary_changed")
      assert.equal(await git(moved, "rev-parse", "HEAD"), setup.head)
      assert.equal(await git(sibling.siblingPath, "rev-parse", "HEAD"), setup.head)
      assert.deepEqual(await fileSnapshot(sibling.gitDirectory), siblingBefore)
    } finally {
      if (replaced) {
        await unlink(setup.workspacePath)
        await rename(moved, setup.workspacePath)
      }
    }
  })

  await t.test("workspace Git file replacement", async (t) => {
    const setup = await managedExecutionSetup(t)
    const prepared = await prepareGitReconciliationCheckpointExecution(setup.input)
    assert.equal(prepared.accepted, true)
    const sibling = await setupSibling(setup, "gitfile")
    const siblingBefore = await fileSnapshot(sibling.gitDirectory)
    const gitFile = path.join(setup.workspacePath, ".git")
    const movedGitFile = path.join(setup.workspacePath, ".git.authorized")
    let replaced = false
    try {
      const result = await executeGitReconciliationCheckpointMutation({
        plan: prepared.value,
        beforeExecute: async () => {
          await rename(gitFile, movedGitFile)
          await writeFile(gitFile, sibling.pointer, { mode: 0o600 })
          replaced = true
        },
      })
      assert.equal(result.accepted, false)
      assert.equal(result.rejection.code, "managed_execution_boundary_changed")
      assert.equal(await git(sibling.siblingPath, "rev-parse", "HEAD"), setup.head)
      assert.deepEqual(await fileSnapshot(sibling.gitDirectory), siblingBefore)
    } finally {
      if (replaced) {
        await unlink(gitFile)
        await rename(movedGitFile, gitFile)
      }
    }
  })

  await t.test("HEAD replacement after BOUNDARY_READY", async (t) => {
    const setup = await managedExecutionSetup(t)
    const prepared = await prepareGitReconciliationCheckpointExecution(setup.input)
    assert.equal(prepared.accepted, true)
    const branchRef = `refs/heads/${setup.proposal.branch}`
    let changed = false
    try {
      const result = await executeGitReconciliationCheckpointMutation({
        plan: prepared.value,
        beforeExecute: async () => {
          await git(
            setup.workspacePath,
            "update-ref",
            branchRef,
            setup.proposal.cherryPickCommit,
            setup.head,
          )
          changed = true
        },
      })
      assert.equal(result.accepted, false)
      assert.equal(result.rejection.code, "managed_execution_boundary_changed")
      assert.equal(
        await git(setup.workspacePath, "rev-parse", "HEAD"),
        setup.proposal.cherryPickCommit,
      )
    } finally {
      if (changed) {
        await git(
          setup.workspacePath,
          "update-ref",
          branchRef,
          setup.head,
          setup.proposal.cherryPickCommit,
        )
      }
    }
    assert.equal(await git(setup.workspacePath, "rev-parse", "HEAD"), setup.head)
  })

  for (const drift of [
    "branch",
    "cleanliness",
    "operation marker",
    "selected gitdir",
    "common directory",
    "object directory",
    "refs directory",
  ]) {
    await t.test(`${drift} drift after BOUNDARY_READY`, async (t) => {
      const setup = await managedExecutionSetup(t)
      const prepared = await prepareGitReconciliationCheckpointExecution(
        setup.input,
      )
      assert.equal(prepared.accepted, true)
      const intent = prepared.value.record
      const headFile = path.join(intent.gitDirectory, "HEAD")
      const originalHeadFile = await readFile(headFile, "utf8")
      const dirtyFile = path.join(setup.workspacePath, "post-boundary-drift.txt")
      const markerFile = path.join(intent.gitDirectory, "CHERRY_PICK_HEAD")
      const movedGitDirectory = `${intent.gitDirectory}.authorized-moved`
      const movedCommonDirectory = `${intent.commonDirectory}.authorized-moved`
      const movedObjectsDirectory = `${intent.objectsDirectory}.authorized-moved`
      const movedRefsDirectory = `${intent.refsDirectory}.authorized-moved`
      let cleanup = async () => {}
      try {
        const result = await executeGitReconciliationCheckpointMutation({
          plan: prepared.value,
          beforeExecute: async () => {
            if (drift === "branch") {
              await writeFile(headFile, "ref: refs/heads/unreviewed-branch\n")
              cleanup = () => writeFile(headFile, originalHeadFile)
            } else if (drift === "cleanliness") {
              await writeFile(dirtyFile, "unreviewed\n")
              cleanup = () => unlink(dirtyFile)
            } else if (drift === "operation marker") {
              await writeFile(markerFile, `${setup.proposal.cherryPickCommit}\n`)
              cleanup = () => unlink(markerFile)
            } else if (drift === "selected gitdir") {
              await rename(intent.gitDirectory, movedGitDirectory)
              await mkdir(intent.gitDirectory, { mode: 0o700 })
              cleanup = async () => {
                await rm(intent.gitDirectory, { recursive: true, force: true })
                await rename(movedGitDirectory, intent.gitDirectory)
              }
            } else if (drift === "common directory") {
              await rename(intent.commonDirectory, movedCommonDirectory)
              await mkdir(intent.commonDirectory, { mode: 0o700 })
              cleanup = async () => {
                await rm(intent.commonDirectory, { recursive: true, force: true })
                await rename(movedCommonDirectory, intent.commonDirectory)
              }
            } else if (drift === "object directory") {
              await rename(intent.objectsDirectory, movedObjectsDirectory)
              await symlink(movedObjectsDirectory, intent.objectsDirectory)
              cleanup = async () => {
                await unlink(intent.objectsDirectory)
                await rename(movedObjectsDirectory, intent.objectsDirectory)
              }
            } else {
              await rename(intent.refsDirectory, movedRefsDirectory)
              await mkdir(intent.branchRefParent, { recursive: true, mode: 0o700 })
              const movedBranchRef = path.join(
                movedRefsDirectory,
                path.relative(intent.refsDirectory, intent.branchRef),
              )
              await writeFile(
                intent.branchRef,
                await readFile(movedBranchRef),
                { mode: 0o600 },
              )
              cleanup = async () => {
                assert.equal((await readFile(movedBranchRef, "utf8")).trim(), setup.head)
                await rm(intent.refsDirectory, { recursive: true, force: true })
                await rename(movedRefsDirectory, intent.refsDirectory)
                assert.equal((await readFile(intent.branchRef, "utf8")).trim(), setup.head)
              }
            }
          },
        })
        assert.equal(result.accepted, false)
        assert.equal(
          result.rejection.code,
          "managed_execution_boundary_changed",
          JSON.stringify(result),
        )
      } finally {
        await cleanup()
      }
      assert.equal(await readFile(headFile, "utf8"), originalHeadFile)
      const restoredRef = path.join(
        intent.commonDirectory,
        originalHeadFile.trim().slice("ref: ".length),
      )
      assert.equal(restoredRef, intent.branchRef)
      assert.equal((await readFile(restoredRef, "utf8")).trim(), setup.head)
      assert.equal(
        await git(setup.workspacePath, "cat-file", "-t", setup.head),
        "commit",
      )
      assert.equal(await git(setup.workspacePath, "rev-parse", "HEAD"), setup.head)
    })
  }
})

test("managed execution rejects tampered plans, destination drift, and ambiguous records", async (t) => {
  await t.test("tampered plan", async (t) => {
    const setup = await managedExecutionSetup(t)
    const prepared = await prepareGitReconciliationCheckpointExecution(setup.input)
    const tampered = structuredClone(prepared.value)
    tampered.record.cherryPickCommit = "f".repeat(40)
    const result = await executeGitReconciliationCheckpointMutation({
      plan: tampered,
      execute: () => {
        throw new Error("must not execute")
      },
    })
    assert.equal(result.rejection.code, "managed_execution_plan_binding")
    assert.equal(await git(setup.workspacePath, "rev-parse", "HEAD"), setup.head)
  })

  await t.test("filesystem identities are immutable execution inputs", async (t) => {
    const setup = await managedExecutionSetup(t)
    const prepared = await prepareGitReconciliationCheckpointExecution(setup.input)
    assert.equal(prepared.accepted, true)
    for (const field of [
      "workspaceRootIdentity",
      "workspaceIdentity",
      "workspaceGitFileIdentity",
      "gitDirectoryIdentity",
      "commonDirectoryIdentity",
      "branchRefIdentity",
      "objectsDirectoryIdentity",
      "refsDirectoryIdentity",
      "branchRefParentIdentity",
    ]) {
      const tampered = structuredClone(prepared.value)
      tampered.record[field].ino += 1
      const result = await executeGitReconciliationCheckpointMutation({
        plan: tampered,
        execute: () => {
          throw new Error("must not execute")
        },
      })
      assert.equal(result.accepted, false, field)
      assert.equal(result.rejection.code, "managed_execution_plan_binding", field)
    }
    for (const field of [
      "workspaceGitFileContentsDigest",
      "branchRefContentsDigest",
    ]) {
      const tampered = structuredClone(prepared.value)
      tampered.record[field] = "f".repeat(64)
      const result = await executeGitReconciliationCheckpointMutation({
        plan: tampered,
        execute: () => {
          throw new Error("must not execute")
        },
      })
      assert.equal(result.accepted, false, field)
      assert.equal(result.rejection.code, "managed_execution_plan_binding", field)
    }
    assert.equal(await git(setup.workspacePath, "rev-parse", "HEAD"), setup.head)
  })

  await t.test("broker identity is an immutable authorization input", async (t) => {
    const setup = await managedExecutionSetup(t)
    const prepared = await prepareGitReconciliationCheckpointExecution(setup.input)
    assert.equal(prepared.accepted, true)
    for (const [field, value] of [
      ["brokerVersion", prepared.value.record.brokerVersion + 1],
      ["brokerDigest", "f".repeat(64)],
    ]) {
      const tampered = structuredClone(prepared.value)
      tampered.record[field] = value
      const result = await executeGitReconciliationCheckpointMutation({
        plan: tampered,
        execute: () => {
          throw new Error("must not execute")
        },
      })
      assert.equal(result.accepted, false, field)
      assert.equal(result.rejection.code, "managed_execution_plan_binding", field)
    }
    assert.equal(await git(setup.workspacePath, "rev-parse", "HEAD"), setup.head)
  })

  await t.test("dirty destination", async (t) => {
    const setup = await managedExecutionSetup(t)
    await writeFile(path.join(setup.workspacePath, "unreviewed.txt"), "drift\n")
    const result = await prepareGitReconciliationCheckpointExecution(setup.input)
    assert.equal(result.accepted, false)
    assert.equal(result.rejection.code, "activation_metadata_dirty")
  })

  await t.test("ambiguous intent", async (t) => {
    const setup = await managedExecutionSetup(t)
    const prepared = await prepareGitReconciliationCheckpointExecution(setup.input)
    setup.state.gitReconciliationCheckpoints.push(
      prepared.value.record,
      { ...prepared.value.record, executionId: "conflict" },
    )
    const result = await prepareGitReconciliationCheckpointExecution(setup.input)
    assert.equal(result.accepted, false)
    assert.equal(result.rejection.code, "managed_execution_record_ambiguous")
  })

  await t.test("manipulated prior owner gate", async (t) => {
    const setup = await managedExecutionSetup(t)
    const ownerGateRun = setup.state.runs.find((run) =>
      run.instructionId.endsWith("activation-022"),
    )
    ownerGateRun.ownerRequest.reason = "different durable owner gate"
    const result = await prepareGitReconciliationCheckpointExecution(setup.input)
    assert.equal(result.accepted, false)
    assert.equal(
      result.rejection.code,
      "managed_execution_post_proposal_binding",
    )
  })
})

test("managed execution fails closed on source, binding, remote, and replay drift", async (t) => {
  await t.test("checkpoint and generation binding", async (t) => {
    const setup = await managedExecutionSetup(t)
    const comment = setup.task.comments.at(-1)
    comment.body = comment.body.replace(setup.proposal.generationId, `git-reconciliation-checkpoint-generation:${"f".repeat(64)}`)
    const [instruction] = extractAgentControls(comment.body)
    setup.state.activeInstruction = { ...instruction, phase: "selected" }
    const result = await prepareGitReconciliationCheckpointExecution({
      ...setup.input,
      instruction,
    })
    assert.equal(result.accepted, false)
    assert.equal(result.rejection.code, "managed_execution_proposal_binding")
  })

  await t.test("source binding", async (t) => {
    const setup = await managedExecutionSetup(t)
    setup.state.gitReconciliationCheckpoints[0].cherryPickTargetTree = "f".repeat(40)
    const result = await prepareGitReconciliationCheckpointExecution(setup.input)
    assert.equal(result.accepted, false)
    assert.equal(result.rejection.code, "managed_execution_proposal_binding")
  })

  await t.test("remote changes after persisted intent", async (t) => {
    const setup = await managedExecutionSetup(t)
    const prepared = await prepareGitReconciliationCheckpointExecution(setup.input)
    setup.state.gitReconciliationCheckpoints.push(prepared.value.record)
    await git(
      setup.workspacePath,
      "push",
      "origin",
      `HEAD:refs/heads/${issue63ReconciledBranch}`,
    )
    const result = await prepareGitReconciliationCheckpointExecution(setup.input)
    assert.equal(result.accepted, false)
    assert.equal(result.rejection.code, "checkpoint_remote_branch_present")
  })

  await t.test("state changes after persisted intent", async (t) => {
    const setup = await managedExecutionSetup(t)
    const prepared = await prepareGitReconciliationCheckpointExecution(setup.input)
    setup.state.gitReconciliationCheckpoints.push(prepared.value.record)
    setup.state.threadId = "different-thread"
    const result = await prepareGitReconciliationCheckpointExecution(setup.input)
    assert.equal(result.accepted, false)
    assert.equal(result.rejection.code, "managed_execution_proposal_binding")
  })
})
