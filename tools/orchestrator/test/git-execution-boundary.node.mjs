import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
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
import { extractAgentControls } from "../src/control-plane.mjs"
import {
  authorizedGitExecutionBoundary,
  gitExecutionBoundaryIsCurrent,
  gitExecutionBoundaryPrompt,
  gitExecutionPathIsCovered,
  gitExecutionBoundaryRequestDecision,
  matchGitExecutionBoundaryRequest,
  gitReconciliationCheckpointActivationPrompt,
  gitReconciliationCheckpointOwnerReason,
  gitReconciliationCheckpointProposalPrompt,
  proposeGitReconciliationCheckpoint,
} from "../src/git-execution-boundary.mjs"
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

function checkpointControl({ instructionId, taskState, prompt }) {
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
  owner_approval_required: false
  prompt: |
${indentedPrompt}
\`\`\``
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
