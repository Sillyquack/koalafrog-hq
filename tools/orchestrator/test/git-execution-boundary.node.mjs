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
} from "../src/git-execution-boundary.mjs"
import {
  issue63ContinuationControl,
  issue63ContinuationInstructionId,
  issue63ExecutionControl,
  issue63ExecutionInstructionId,
  issue63FailedExecutionRun,
  issue63InterveningRun,
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

async function fixture(t, { execution011 = false } = {}) {
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
  if (execution011) task.comments.push({ body: executionControl })
  const [instruction] = extractAgentControls(
    execution011 ? executionControl : continuationControl,
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
  receiptRun.changedFiles = Array.from(
    { length: 30 },
    (_, index) => `reviewed/path-${String(index + 1).padStart(2, "0")}.ts`,
  )
  receiptRun.resultArtifact = structuredClone(
    issue63FailedExecutionRun.resultArtifact,
  )
  receiptRun.resultArtifact.finalMessage =
    receiptRun.resultArtifact.finalMessage.replaceAll(
      "ec719153c8e726831d7e2b748067383ea7f4e314",
      head,
    )
  receiptRun.completedAt = "2026-08-22T23:10:00.000Z"
  const state = {
    status: execution011 ? "needs_review" : "needs_owner",
    task: { originIssueNumber: 63, originIssueUrl: issue63OriginUrl },
    threadId: issue63ThreadId,
    workspacePath,
    branch: issue63ReconciledBranch,
    activeInstruction: { ...instruction, phase: "selected" },
    runs: execution011
      ? [sourceRun, structuredClone(issue63InterveningRun), receiptRun]
      : [sourceRun],
    workspaceBranchReconciliations: [
      {
        reconciliationId,
        precedingInstructionId: sourceRun.instructionId,
        interveningInstructionIds: execution011
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
