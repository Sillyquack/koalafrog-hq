import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { promisify } from "node:util"
import { extractAgentControls } from "../src/control-plane.mjs"
import { authorizedWorkspaceBranchReconciliation } from "../src/orchestrator.mjs"
import { initialState } from "../src/state-store.mjs"
import { ensureWorkspace } from "../src/workspace.mjs"
import {
  issue63ContinuationControl,
  issue63ExpectedBranch,
  issue63InterveningInstructionId,
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
})

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
  ["in-progress Git operation", (fixture) => {
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
  ["mutable intervening run", (fixture) => {
    fixture.state.runs[1].changedFiles = ["unexpected-change.mjs"]
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
