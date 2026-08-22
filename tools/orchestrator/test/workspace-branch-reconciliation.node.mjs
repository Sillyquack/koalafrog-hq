import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { promisify } from "node:util"
import {
  extractAgentControls,
  ownerGateReason,
} from "../src/control-plane.mjs"
import { authorizedWorkspaceBranchReconciliation } from "../src/orchestrator.mjs"
import { initialState } from "../src/state-store.mjs"
import { ensureWorkspace } from "../src/workspace.mjs"
import {
  issue63CleanWorkspaceEvidence,
  issue63ContinuationControl,
  issue63DurableOwnerGateReason,
  issue63ExpectedBranch,
  issue63GitMetadataGate,
  issue63InterveningControl,
  issue63InterveningInstructionId,
  issue63NoProductionMutations,
  issue63OriginUrl,
  issue63PriorRun,
  issue63ReconciledBranch,
  issue63ReconciledHead,
  issue63ReconciliationTask,
  issue63WorkspacePath,
  prepareIssue63ReconciliationState,
} from "./fixtures/issue-63-production-day1-git-reconciliation-resume-010.mjs"
import {
  issue68ContinuationControl,
  issue68ExpectedBranch,
  issue68OriginUrl,
  issue68PriorInstructionId,
  issue68ReconciledBranch,
  issue68ReconciledHead,
  issue68ReconciliationTask,
  issue68WorkspacePath,
  prepareIssue68ReconciliationState,
} from "./fixtures/issue-68-branch-reconciliation-continuation-004.mjs"

const execFileAsync = promisify(execFile)

function reconciliationFixture() {
  const [instruction] = extractAgentControls(issue63ContinuationControl)
  const state = prepareIssue63ReconciliationState(
    initialState({
      repository: "Sillyquack/koalafrog-hq",
      issueNumber: 63,
      issueUrl: issue63OriginUrl,
    }),
    instruction,
  )
  return {
    state,
    instruction: state.activeInstruction,
    task: issue63ReconciliationTask(),
    workspace: {
      path: issue63WorkspacePath,
      expectedBranch: issue63ExpectedBranch,
      actualBranch: issue63ReconciledBranch,
      head: issue63ReconciledHead,
      dirty: false,
      operationsInProgress: [],
    },
  }
}

test("Issue #63/010 scans past the exact non-mutating 009 owner stop", () => {
  const fixture = reconciliationFixture()
  const sourceRun = fixture.state.runs[0]
  assert.equal(fixture.state.workspacePath, issue63WorkspacePath)
  assert.equal(sourceRun.workspacePath, null)
  assert.equal(fixture.state.runs[1].workspacePath, null)
  assert.equal(sourceRun.changedFiles, null)
  assert.equal(fixture.state.runs[1].changedFiles, null)
  assert.equal(sourceRun.ownerRequest, null)
  assert.deepEqual(sourceRun.blockers, [
    issue63CleanWorkspaceEvidence,
    issue63GitMetadataGate,
  ])
  assert.deepEqual(sourceRun.ownerGates, [issue63GitMetadataGate])
  assert.deepEqual(sourceRun.productionReadback, [
    issue63NoProductionMutations,
    issue63GitMetadataGate,
  ])
  assert.deepEqual(sourceRun.safetyFindings, [])
  assert.equal(sourceRun.checks.diffCheck, "pass")
  assert.equal(sourceRun.resultArtifact.turnStatus, "completed")
  assert.equal(sourceRun.resultArtifact.checks.diffCheck.status, "fail")
  assert.ok(
    sourceRun.resultArtifact.checks.diffCheck.evidence.some(
      ({ source, status }) =>
        source === "command_execution" && status === "fail",
    ),
  )
  const [interveningControl] = extractAgentControls(issue63InterveningControl)
  assert.notEqual(
    ownerGateReason(interveningControl),
    issue63DurableOwnerGateReason,
  )
  const authorized = authorizedWorkspaceBranchReconciliation({
    ...fixture,
    reconciledAt: "2026-08-22T05:11:00.000Z",
  })

  assert.equal(authorized.isNew, true)
  assert.deepEqual(authorized.record, {
    reconciliationId:
      "authorized-workspace-branch:production-day1-git-reconciliation-008:production-day1-git-reconciliation-resume-010:ec719153c8e726831d7e2b748067383ea7f4e314",
    precedingInstructionId: "production-day1-git-reconciliation-008",
    interveningInstructionIds: [issue63InterveningInstructionId],
    continuationInstructionId:
      "production-day1-git-reconciliation-resume-010",
    originIssueNumber: 63,
    originIssueUrl: issue63OriginUrl,
    threadId: "01a0243c-dcdf-7121-a02d-0aaba354c2dd",
    workspacePath: issue63WorkspacePath,
    fromBranch: issue63ExpectedBranch,
    toBranch: issue63ReconciledBranch,
    head: issue63ReconciledHead,
    reconciledAt: "2026-08-22T05:11:00.000Z",
  })
  fixture.state.workspaceBranchReconciliations.push(authorized.record)
  const replay = authorizedWorkspaceBranchReconciliation({
    ...fixture,
    reconciledAt: "2026-08-22T05:12:00.000Z",
  })
  assert.equal(replay.isNew, false)
  assert.equal(replay.record, authorized.record)
  for (const broaderOperation of [
    "cherryPick",
    "push",
    "pullRequest",
    "migrationApproval",
    "productionAuthorization",
  ]) {
    assert.equal(Object.hasOwn(authorized.record, broaderOperation), false)
  }
})

test("absent historical workspace paths are treated as legacy unknown", () => {
  const fixture = reconciliationFixture()
  delete fixture.state.runs[0].workspacePath
  delete fixture.state.runs[1].workspacePath

  const authorized = authorizedWorkspaceBranchReconciliation(fixture)

  assert.equal(authorized?.isNew, true)
  assert.equal(
    authorized?.record.precedingInstructionId,
    "production-day1-git-reconciliation-008",
  )
  assert.deepEqual(authorized?.record.interveningInstructionIds, [
    issue63InterveningInstructionId,
  ])
})

test("matching explicit historical workspace paths preserve continuity", () => {
  const fixture = reconciliationFixture()
  fixture.state.runs[0].workspacePath = issue63WorkspacePath
  fixture.state.runs[1].workspacePath = issue63WorkspacePath

  const authorized = authorizedWorkspaceBranchReconciliation(fixture)

  assert.equal(authorized?.isNew, true)
  assert.equal(
    authorized?.record.precedingInstructionId,
    "production-day1-git-reconciliation-008",
  )
  assert.deepEqual(authorized?.record.interveningInstructionIds, [
    issue63InterveningInstructionId,
  ])
})

test("mismatched explicit historical workspace path fails closed", () => {
  const fixture = reconciliationFixture()
  fixture.state.runs[0].workspacePath = "/workspaces/different"

  assert.equal(authorizedWorkspaceBranchReconciliation(fixture), null)
  assert.equal(fixture.state.branch, issue63ExpectedBranch)
  assert.deepEqual(fixture.state.workspaceBranchReconciliations, [])
})

for (const [name, setChangedFiles] of [
  ["absent", (run) => delete run.changedFiles],
  ["an explicit empty array", (run) => {
    run.changedFiles = []
  }],
]) {
  test(`historical changedFiles may be ${name}`, () => {
    const fixture = reconciliationFixture()
    for (const run of fixture.state.runs) setChangedFiles(run)

    const authorized = authorizedWorkspaceBranchReconciliation(fixture)

    assert.equal(authorized?.isNew, true)
    assert.equal(
      authorized?.record.precedingInstructionId,
      "production-day1-git-reconciliation-008",
    )
    assert.deepEqual(authorized?.record.interveningInstructionIds, [
      issue63InterveningInstructionId,
    ])
  })
}

test("Issue #68/004 reconciles its reviewed clean branch idempotently", () => {
  const [instruction] = extractAgentControls(issue68ContinuationControl)
  const state = prepareIssue68ReconciliationState(
    initialState({
      repository: "Sillyquack/koalafrog-hq",
      issueNumber: 68,
      issueUrl: issue68OriginUrl,
    }),
    instruction,
  )
  const fixture = {
    state,
    instruction: state.activeInstruction,
    task: issue68ReconciliationTask(),
    workspace: {
      path: issue68WorkspacePath,
      expectedBranch: issue68ExpectedBranch,
      actualBranch: issue68ReconciledBranch,
      head: issue68ReconciledHead,
      dirty: false,
      operationsInProgress: [],
    },
  }

  const authorized = authorizedWorkspaceBranchReconciliation({
    ...fixture,
    reconciledAt: "2026-08-22T09:31:00.000Z",
  })
  assert.equal(authorized.isNew, true)
  assert.equal(authorized.record.precedingInstructionId, issue68PriorInstructionId)
  assert.deepEqual(authorized.record.interveningInstructionIds, [])
  assert.equal(authorized.record.fromBranch, issue68ExpectedBranch)
  assert.equal(authorized.record.toBranch, issue68ReconciledBranch)
  assert.equal(authorized.record.head, issue68ReconciledHead)

  state.workspaceBranchReconciliations.push(authorized.record)
  const replay = authorizedWorkspaceBranchReconciliation(fixture)
  assert.equal(replay.isNew, false)
  assert.equal(replay.record, authorized.record)
})

for (const [name, change] of [
  ["manual branch drift", (fixture) => {
    fixture.state.runs[0].branch = fixture.state.branch
  }],
  ["unrelated HEAD drift", (fixture) => {
    fixture.workspace.head = "f".repeat(40)
  }],
  ["dirty workspace drift", (fixture) => {
    fixture.workspace.dirty = true
  }],
  ["CHERRY_PICK_HEAD remains", (fixture) => {
    fixture.workspace.operationsInProgress = ["CHERRY_PICK_HEAD"]
  }],
  ["ambiguous duplicate authorization", (fixture) => {
    fixture.task.comments.push({ body: fixture.task.issue.body })
  }],
  ["different origin", (fixture) => {
    fixture.task.issue.html_url =
      "https://github.com/Sillyquack/koalafrog-hq/issues/69"
  }],
  ["different thread", (fixture) => {
    fixture.state.runs[0].threadId = "different-thread"
  }],
  ["missing explicit authorization", (fixture) => {
    fixture.task.issue.body = fixture.task.issue.body.replace(
      "The owner has now explicitly approved",
      "A previous report recommended",
    )
  }],
]) {
  test(`branch reconciliation fails closed for ${name}`, () => {
    const fixture = reconciliationFixture()
    change(fixture)
    assert.equal(authorizedWorkspaceBranchReconciliation(fixture), null)
    assert.equal(fixture.state.branch, issue63ExpectedBranch)
    assert.deepEqual(fixture.state.workspaceBranchReconciliations, [])
  })
}

for (const [name, change] of [
  ["branch switch is not durably reported as completed", (fixture) => {
    fixture.state.runs[0].resultArtifact.finalMessage =
      fixture.state.runs[0].resultArtifact.finalMessage.replace(
        `- Integration branch: \`${issue63ReconciledBranch}\``,
        `- Intended integration branch: \`${issue63ReconciledBranch}\``,
      )
  }],
  ["failure during a partially applied cherry-pick", (fixture) => {
    fixture.state.runs[0].resultArtifact.finalMessage =
      fixture.state.runs[0].resultArtifact.finalMessage.replace(
        "**FAILED before application** because the sandbox denied creation of the linked worktree’s `index.lock`.",
        "**FAILED during application** after partially applying the cherry-pick.",
      )
  }],
  ["failure after cherry-pick application", (fixture) => {
    fixture.state.runs[0].resultArtifact.finalMessage =
      fixture.state.runs[0].resultArtifact.finalMessage.replace(
        "**FAILED before application** because the sandbox denied creation of the linked worktree’s `index.lock`.",
        "**FAILED after application** while validating the cherry-pick.",
      )
  }],
  ["missing failure-before-application evidence", (fixture) => {
    fixture.state.runs[0].resultArtifact.finalMessage =
      fixture.state.runs[0].resultArtifact.finalMessage.replace(
        /- Cherry-pick: .*\n/,
        "",
      )
  }],
  ["missing failed-command evidence", (fixture) => {
    fixture.state.runs[0].resultArtifact.checks.diffCheck.evidence =
      fixture.state.runs[0].resultArtifact.checks.diffCheck.evidence.filter(
        ({ source }) => source !== "command_execution",
      )
  }],
  ["failed command belongs only to an unrelated check", (fixture) => {
    const artifact = fixture.state.runs[0].resultArtifact
    const [failedCommand] = artifact.checks.diffCheck.evidence.splice(0, 1)
    artifact.checks.diffCheck.status = "pass"
    artifact.checks.tests.status = "fail"
    artifact.checks.tests.evidence.push(failedCommand)
  }],
  ["nested result findings conflict with the durable run", (fixture) => {
    fixture.state.runs[0].resultArtifact.findings.branchPushState[2] =
      "Push: **SUCCEEDED**"
  }],
  ["ambiguous source-run tree mutation", (fixture) => {
    fixture.state.runs[0].changedFiles = ["partially-applied-change.mjs"]
  }],
  ["malformed source-run changedFiles", (fixture) => {
    fixture.state.runs[0].changedFiles = "unknown"
  }],
  ["conflicting source-run commit history", (fixture) => {
    fixture.state.runs[0].commits.push("a".repeat(40))
  }],
  ["durable CHERRY_PICK_HEAD evidence", (fixture) => {
    const conflictingEvidence =
      "A `CHERRY_PICK_HEAD` remains after the failed cherry-pick."
    fixture.state.runs[0].blockers[0] = conflictingEvidence
    fixture.state.runs[0].resultArtifact.finalMessage =
      fixture.state.runs[0].resultArtifact.finalMessage.replace(
        issue63CleanWorkspaceEvidence,
        conflictingEvidence,
      )
  }],
]) {
  test(`partial-operation provenance fails closed for ${name}`, () => {
    const fixture = reconciliationFixture()
    change(fixture)
    assert.equal(authorizedWorkspaceBranchReconciliation(fixture), null)
    assert.equal(fixture.state.branch, issue63ExpectedBranch)
    assert.deepEqual(fixture.state.workspaceBranchReconciliations, [])
  })
}

for (const [name, change] of [
  ["mutable intervening run", (fixture) => {
    fixture.state.runs[1].changedFiles = ["unexpected-change.mjs"]
  }],
  ["malformed intervening changedFiles", (fixture) => {
    fixture.state.runs[1].changedFiles = { legacy: true }
  }],
  ["conflicting intervening HEAD evidence", (fixture) => {
    fixture.state.runs[1].commits = ["a".repeat(40)]
  }],
  ["intervening wrong thread", (fixture) => {
    fixture.state.runs[1].threadId = "different-thread"
  }],
  ["intervening wrong origin", (fixture) => {
    fixture.state.runs[1].originIssueNumber = 68
  }],
  ["intervening wrong workspace", (fixture) => {
    fixture.state.runs[1].workspacePath = "/workspaces/different"
  }],
  ["conflicting intervening branch evidence", (fixture) => {
    fixture.state.runs[1].branch = issue63ReconciledBranch
  }],
  ["intervening turn execution", (fixture) => {
    fixture.state.runs[1].turnCount = 1
  }],
  ["unrelated durable owner-gate reason", (fixture) => {
    const unrelated =
      "The instruction requests an owner-gated action: Delete an unrelated production database."
    fixture.state.runs[1].ownerRequest.reason = unrelated
    fixture.state.runs[1].ownerGates = [unrelated]
  }],
  ["missing durable owner request", (fixture) => {
    fixture.state.runs[1].ownerRequest = null
  }],
  ["mismatched durable owner-gate evidence", (fixture) => {
    fixture.state.runs[1].ownerGates = [
      "The instruction requests an owner-gated action: unrelated gate.",
    ]
  }],
  ["non-ownerGate durable request", (fixture) => {
    fixture.state.runs[1].ownerRequest.method =
      "item/commandExecution/requestApproval"
  }],
  ["non-gated intervening control", (fixture) => {
    fixture.task.comments[0].body = fixture.task.comments[0].body.replace(
      /  prompt: \|\n[\s\S]*?\n```/,
      "  prompt: |\n    Review the local fixture metadata without changing anything.\n```",
    )
  }],
  ["changed owner-gate semantics", (fixture) => {
    fixture.task.comments[0].body = fixture.task.comments[0].body.replace(
      "owner_approval_required: false",
      "owner_approval_required: true",
    )
  }],
  ["ambiguous intervening controls", (fixture) => {
    fixture.task.comments.push({ body: issue63InterveningControl })
  }],
  ["ambiguous transition sources", (fixture) => {
    fixture.state.runs.splice(1, 0, structuredClone(issue63PriorRun))
  }],
]) {
  test(`history scan fails closed for ${name}`, () => {
    const fixture = reconciliationFixture()
    change(fixture)
    assert.equal(authorizedWorkspaceBranchReconciliation(fixture), null)
    assert.equal(fixture.state.branch, issue63ExpectedBranch)
    assert.deepEqual(fixture.state.workspaceBranchReconciliations, [])
  })
}

test("workspace validation invokes reconciliation only for a proven mismatch", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-workspace-reconciliation-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const repository = path.join(directory, "repository")
  await execFileAsync("git", ["init", "-b", issue63ExpectedBranch, repository])
  await writeFile(path.join(repository, "proof.txt"), "authorized transition\n")
  await execFileAsync(
    "git",
    [
      "-c",
      "user.name=Koalafrog Test",
      "-c",
      "user.email=orchestrator@example.invalid",
      "add",
      "proof.txt",
    ],
    { cwd: repository },
  )
  await execFileAsync(
    "git",
    [
      "-c",
      "user.name=Koalafrog Test",
      "-c",
      "user.email=orchestrator@example.invalid",
      "commit",
      "-m",
      "fixture",
    ],
    { cwd: repository },
  )
  await execFileAsync("git", ["switch", "-c", issue63ReconciledBranch], {
    cwd: repository,
  })
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: repository,
    encoding: "utf8",
  })
  let observed = null

  const reconciled = await ensureWorkspace({
    existingPath: repository,
    existingBranch: issue63ExpectedBranch,
    reconcileBranch(workspace) {
      observed = workspace
      return true
    },
  })

  assert.equal(reconciled.branch, issue63ReconciledBranch)
  assert.deepEqual(observed, {
    path: repository,
    expectedBranch: issue63ExpectedBranch,
    actualBranch: issue63ReconciledBranch,
    head: stdout.trim(),
    dirty: false,
    operationsInProgress: [],
  })
  await assert.rejects(
    ensureWorkspace({
      existingPath: repository,
      existingBranch: issue63ExpectedBranch,
      reconcileBranch: async () => false,
    }),
    new RegExp(
      `Workspace branch changed: expected ${issue63ExpectedBranch}, found ${issue63ReconciledBranch}`,
    ),
  )
})
