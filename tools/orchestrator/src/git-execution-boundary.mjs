import { execFile } from "node:child_process"
import { lstat, readFile, readdir, realpath } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { listAgentControls } from "./control-plane.mjs"
import { extractIssueNumber } from "./repository-discovery.mjs"

const execFileAsync = promisify(execFile)
const fullShaPattern = /^[0-9a-f]{40}$/
const safeBranchPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/
const gitOperationMarkers = [
  "CHERRY_PICK_HEAD",
  "MERGE_HEAD",
  "REVERT_HEAD",
  "REBASE_HEAD",
]
const gitOperationDirectories = ["rebase-merge", "rebase-apply", "sequencer"]

function accepted(value, context = {}) {
  return { accepted: true, value, context }
}

function rejected(code, context = {}) {
  return { accepted: false, value: null, rejection: { code, ...context } }
}

function reportDecision(decision, onDiagnostic) {
  if (!decision.accepted && typeof onDiagnostic === "function") {
    onDiagnostic(decision.rejection)
  }
  return decision
}

async function git(args, cwd, { allowFailure = false, trim = true } = {}) {
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    })
    return trim ? result.stdout.trim() : result.stdout
  } catch (error) {
    if (allowFailure) return null
    throw error
  }
}

async function regularPath(target, type) {
  const stat = await lstat(target)
  if (stat.isSymbolicLink()) return false
  return type === "file" ? stat.isFile() : stat.isDirectory()
}

async function optionalPathExists(target) {
  try {
    await lstat(target)
    return true
  } catch (error) {
    if (error.code === "ENOENT") return false
    throw error
  }
}

async function readSmallFile(target) {
  const stat = await lstat(target)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4_096) return null
  return readFile(target, "utf8")
}

async function treeContainsSymlink(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) return true
    if (
      entry.isDirectory() &&
      (await treeContainsSymlink(path.join(root, entry.name)))
    ) {
      return true
    }
  }
  return false
}

function exactPathWithin(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return Boolean(
    relative && !relative.startsWith("..") && !path.isAbsolute(relative),
  )
}

function currentIssueUrl(task) {
  return (
    task?.issue?.html_url ??
    task?.issue?.display_url ??
    task?.issue?.url ??
    null
  )
}

function extractAuthorizedCherryPick(prompt, head) {
  if (
    typeof prompt !== "string" ||
    !prompt.includes(head) ||
    !/\bowner\b[\s\S]{0,120}\bexplicit(?:ly)?\b[\s\S]{0,100}\bapprov(?:e|ed|es|al)\b/i.test(
      prompt,
    ) ||
    !/\bexact linked-worktree Git metadata writes required\b/i.test(prompt) ||
    !/\bexecute only this approved Git path\b/i.test(prompt) ||
    !/\bstarting exactly from\b/i.test(prompt) ||
    !/\bpush the new integration branch normally\b/i.test(prompt) ||
    !/\bopen a PR for review\b/i.test(prompt) ||
    !/\bstop at review\b/i.test(prompt)
  ) {
    return null
  }
  const commits = [
    ...prompt.matchAll(/\bcherry-pick only\s+`?([0-9a-f]{40})`?/gi),
  ].map((match) => match[1].toLowerCase())
  return commits.length === 1 ? commits[0] : null
}

const durableFindingKeys = [
  "blockers",
  "ownerGates",
  "productionReadback",
  "safetyFindings",
  "branchPushState",
]
const structuredNoMutationStatements = [
  "No source, production, migration, deployment, receipt, or remote Git mutation occurred.",
  "No deployment, migration, production write, receipt, or other external mutation occurred.",
  "No alternate mechanism, production change, migration, deployment, receipt, or remote Git mutation was attempted.",
]

function missingStructured(code) {
  return { ...rejected(code), legacyEligible: true }
}

function normalizedChangedFiles(value) {
  if (value == null) return { status: "missing", files: null }
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || !entry.length) ||
    new Set(value).size !== value.length
  ) {
    return { status: "invalid", files: null }
  }
  return { status: "valid", files: [...value].sort() }
}

function sameStringArray(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((entry, index) => entry === right[index])
  )
}

function hasPositiveMutationEvidence(value) {
  let unexplained = String(value)
  for (const statement of structuredNoMutationStatements) {
    unexplained = unexplained.replaceAll(statement, "")
  }
  return /\b(?:source|production|migration|deployment|receipt|remote Git)\b[^.]*\bmutation (?:occurred|was attempted)\b/i.test(
    unexplained,
  )
}

function structuredHistoricalPreApplicationDecision(
  run,
  record,
  expectedChangedFiles,
  prefix,
) {
  const changedFiles = normalizedChangedFiles(run.changedFiles)
  if (changedFiles.status === "missing" || expectedChangedFiles == null) {
    return missingStructured(`${prefix}_structured_changed_files_missing`)
  }
  if (changedFiles.status !== "valid") {
    return rejected(`${prefix}_structured_changed_files_invalid`)
  }
  if (!sameStringArray(changedFiles.files, expectedChangedFiles)) {
    return rejected(`${prefix}_structured_changed_files_conflict`, {
      changedFileCount: changedFiles.files.length,
      expectedChangedFileCount: expectedChangedFiles.length,
    })
  }

  const findings = run.resultArtifact?.findings
  if (!findings || typeof findings !== "object") {
    return missingStructured(`${prefix}_structured_findings_missing`)
  }
  for (const key of durableFindingKeys) {
    if (!Array.isArray(run[key]) || !Array.isArray(findings[key])) {
      return missingStructured(`${prefix}_structured_findings_shape`)
    }
    if (JSON.stringify(run[key]) !== JSON.stringify(findings[key])) {
      return rejected(`${prefix}_structured_findings_conflict`)
    }
    if (
      run[key].some(
        (entry) => typeof entry !== "string" || entry.length === 0,
      )
    ) {
      return rejected(`${prefix}_structured_findings_invalid`)
    }
  }

  const allFindings = durableFindingKeys.flatMap((key) => run[key])
  if (
    allFindings.some(
      (entry) => {
        const dirty =
          /\bworktree\b[^.]*\b(?:dirty|modified|uncommitted)\b/i.test(entry)
        const operationPresent =
          /\b(?:CHERRY_PICK_HEAD|MERGE_HEAD|REVERT_HEAD|REBASE_HEAD)\b[^.]*\b(?:present|remains?|exists?)\b/i.test(
            entry,
          ) &&
          !/\bno\s+`?(?:CHERRY_PICK_HEAD|MERGE_HEAD|REVERT_HEAD|REBASE_HEAD)`?/i.test(
            entry,
          ) &&
          !/\ball absent\b/i.test(entry)
        return dirty || operationPresent
      },
    )
  ) {
    return rejected(`${prefix}_structured_git_state_conflict`)
  }
  if (
    allFindings.some((entry) => hasPositiveMutationEvidence(entry))
  ) {
    return rejected(`${prefix}_structured_mutation_conflict`)
  }
  if (
    ![...run.productionReadback, ...run.safetyFindings].some(
      (entry) =>
        structuredNoMutationStatements.some((statement) =>
          entry.includes(statement),
        ),
    )
  ) {
    return missingStructured(`${prefix}_structured_no_mutation_evidence`)
  }

  const branchEvidence = run.branchPushState
  if (
    !branchEvidence.includes(`Branch: \`${record.toBranch}\``) &&
    !branchEvidence.includes(`Integration branch: \`${record.toBranch}\``)
  ) {
    return missingStructured(`${prefix}_structured_branch_evidence`)
  }
  if (
    branchEvidence.some(
      (entry) =>
        /\bPush:\s*\*\*(?!NOT ATTEMPTED)/i.test(entry) ||
        /\b(?:pushed|push succeeded|remote branch created)\b/i.test(entry),
    )
  ) {
    return rejected(`${prefix}_structured_push_conflict`)
  }
  if (!branchEvidence.some((entry) => /Push:\s*\*\*NOT ATTEMPTED\*\*/i.test(entry))) {
    return missingStructured(`${prefix}_structured_push_evidence`)
  }
  if (
    allFindings.some((entry) => /\bPR:\s*\*\*(?:CREATED|OPENED)/i.test(entry))
  ) {
    return rejected(`${prefix}_structured_pr_conflict`)
  }

  const diffCheck = run.resultArtifact?.checks?.diffCheck
  const commandEvidence = diffCheck?.evidence?.find(
    (evidence) =>
      evidence?.source === "command_execution" &&
      evidence.status === "pass" &&
      typeof evidence.summary === "string",
  )
  const commandSummary = commandEvidence?.summary ?? ""
  if (
    run.checks?.diffCheck !== "pass" ||
    diffCheck?.status !== "pass" ||
    !commandEvidence
  ) {
    return missingStructured(`${prefix}_structured_check_evidence`)
  }
  if (
    !commandSummary.includes("git diff --check") ||
    !commandSummary.includes("git status --porcelain=v1") ||
    !commandSummary.includes(`git rev-list --count ${record.head}..HEAD`) ||
    !gitOperationMarkers.every((marker) => commandSummary.includes(marker)) ||
    !/\(completed, exit 0\)/i.test(commandSummary)
  ) {
    return missingStructured(`${prefix}_structured_git_state_evidence`)
  }

  const finalMessage = run.resultArtifact?.finalMessage
  if (typeof finalMessage !== "string") {
    return missingStructured(`${prefix}_structured_pre_application_evidence`)
  }
  const recordedHeads = [
    ...finalMessage.matchAll(
      /Starting\/current HEAD:\s*`?([0-9a-f]{40})`?/gi,
    ),
  ].map((match) => match[1].toLowerCase())
  const recordedBranches = [
    ...finalMessage.matchAll(/^\s*-\s*Branch:\s*`([^`]+)`\s*$/gim),
  ].map((match) => match[1])
  const markerStates = [
    ...finalMessage.matchAll(/In-progress Git markers:\s*([^\n]+)/gi),
  ].map((match) => match[1].trim().toLowerCase())
  const compactNoMarkerEvidence =
    /Worktree:\s*clean;\s*zero commits above base;\s*no Git operation markers\s*$/im.test(
      finalMessage,
    )
  if (
    (recordedHeads.length > 0 &&
      (recordedHeads.length !== 1 || recordedHeads[0] !== record.head)) ||
    (recordedBranches.length > 0 &&
      (recordedBranches.length !== 1 ||
        recordedBranches[0] !== record.toBranch)) ||
    /Cherry-pick:\s*\*\*(?:SUCCEEDED|APPLIED|PARTIALLY APPLIED)/i.test(
      finalMessage,
    ) ||
    /Cherry-pick:[^\n]*\b(?:during|after|partial(?:ly)?)\b[^\n]*\bapplication\b/i.test(
      finalMessage,
    ) ||
    /Worktree:\s*(?:dirty|modified|has uncommitted)/i.test(finalMessage) ||
    markerStates.length > 1 ||
    markerStates.some((state) => state !== "all absent") ||
    /\bGit operation markers?\s*(?::|are)?\s*(?:present|remain|exist)/i.test(
      finalMessage,
    ) ||
    (/\b(?:CHERRY_PICK_HEAD|MERGE_HEAD|REVERT_HEAD|REBASE_HEAD)\b[^.\n]*\b(?:present|remains?|exists?)\b/i.test(
      finalMessage,
    ) &&
      !/\bno\s+`?(?:CHERRY_PICK_HEAD|MERGE_HEAD|REVERT_HEAD|REBASE_HEAD)`?/i.test(
        finalMessage,
      )) ||
    /Commits above base:\s*`?[1-9][0-9]*`?/i.test(finalMessage) ||
    /\b(?:[1-9][0-9]*|one|two|three|four|five)\s+commits?\s+above base\b/i.test(
      finalMessage,
    ) ||
    /Push:\s*\*\*(?!NOT ATTEMPTED)/i.test(finalMessage) ||
    /PR:\s*\*\*(?:CREATED|OPENED)/i.test(finalMessage) ||
    hasPositiveMutationEvidence(finalMessage)
  ) {
    return rejected(`${prefix}_structured_final_message_conflict`)
  }
  if (
    !/Cherry-pick:\s*\*\*FAILED before application\*\*/i.test(finalMessage) ||
    recordedHeads.length !== 1 ||
    recordedBranches.length !== 1 ||
    !/Worktree:\s*clean[;,]\s*zero commits above base/i.test(finalMessage) ||
    (markerStates.length !== 1 && !compactNoMarkerEvidence) ||
    !/PR:\s*\*\*NOT CREATED\*\*/i.test(finalMessage)
  ) {
    return missingStructured(`${prefix}_structured_pre_application_evidence`)
  }
  return accepted(run, { proofMode: "structured" })
}

function legacyPreApplicationGitFailureDecision(run, prefix) {
  const finalMessage = run?.resultArtifact?.finalMessage
  if (typeof finalMessage !== "string") {
    return rejected(`${prefix}_final_message`)
  }
  if (!/Cherry-pick:\s*\*\*FAILED before application\*\*/i.test(finalMessage)) {
    return rejected(`${prefix}_failure_before_application`)
  }
  if (
    !/linked worktree(?:'|’|\s)s?\s*`index\.lock`/i.test(finalMessage) &&
    !/linked worktree\s+`\.git\/worktrees\/\.\.\.\/index\.lock`/i.test(
      finalMessage,
    )
  ) {
    return rejected(`${prefix}_index_lock_evidence`)
  }
  if (
    !/no `CHERRY_PICK_HEAD` remains[^\n]*worktree is clean/i.test(finalMessage) &&
    !/Worktree:\s*clean;\s*no `CHERRY_PICK_HEAD`;\s*zero commits above base/i.test(
      finalMessage,
    )
  ) {
    return rejected(`${prefix}_clean_no_operation_evidence`)
  }
  if (!/Push:\s*\*\*NOT ATTEMPTED\*\*/i.test(finalMessage)) {
    return rejected(`${prefix}_push_not_attempted`)
  }
  return accepted(run, { proofMode: "legacy_final_message" })
}

function preApplicationGitFailureDecision(
  run,
  record,
  {
    expectedInstructionId,
    prefix,
    state = null,
    requireWorkspace = false,
    expectedChangedFiles = null,
    allowStructured = false,
  },
) {
  if (run?.instructionId !== expectedInstructionId) {
    return rejected(`${prefix}_instruction`)
  }
  if (run.status !== "needs_review") return rejected(`${prefix}_status`)
  if (run.branch !== record.toBranch) return rejected(`${prefix}_branch`)
  if (
    !Array.isArray(run.commits) ||
    run.commits.length !== 1 ||
    run.commits[0] !== record.head
  ) {
    return rejected(`${prefix}_head_proof`, {
      commitCount: Array.isArray(run.commits) ? run.commits.length : -1,
    })
  }
  if (run.turnCount !== 1) return rejected(`${prefix}_turn_count`)
  if (
    state &&
    (run.originIssueNumber !== state.task.originIssueNumber ||
      run.originIssueUrl !== state.task.originIssueUrl ||
      run.threadId !== state.threadId)
  ) {
    return rejected(`${prefix}_origin_thread`)
  }
  if (requireWorkspace && run.workspacePath !== state.workspacePath) {
    return rejected(`${prefix}_workspace`)
  }
  if (run.ownerRequest != null) return rejected(`${prefix}_owner_request`)
  if (
    run.resultArtifact?.source !== "completed_turn_final_message" ||
    run.resultArtifact?.turnStatus !== "completed"
  ) {
    return rejected(`${prefix}_artifact`)
  }
  if (allowStructured) {
    const structured = structuredHistoricalPreApplicationDecision(
      run,
      record,
      expectedChangedFiles,
      prefix,
    )
    if (structured.accepted || !structured.legacyEligible) return structured
  }
  return legacyPreApplicationGitFailureDecision(run, prefix)
}

function authorizationDecision({ state, instruction, task }) {
  if (!state?.activeInstruction) {
    return rejected("activation_active_instruction_missing")
  }
  if (state.activeInstruction.instructionId !== instruction?.instructionId) {
    return rejected("activation_instruction_id")
  }
  if (!new Set(["selected", "thread_ready"]).has(state.activeInstruction.phase)) {
    return rejected("activation_instruction_phase")
  }
  if (instruction.action !== "continue") return rejected("activation_action")
  if (instruction.taskState !== state.status) {
    return rejected("activation_task_state")
  }
  if (instruction.ownerApprovalRequired) {
    return rejected("activation_instruction_owner_gate")
  }
  if (extractIssueNumber(task?.issue) !== state.task?.originIssueNumber) {
    return rejected("activation_origin_issue")
  }
  if (currentIssueUrl(task) !== state.task?.originIssueUrl) {
    return rejected("activation_origin_url")
  }
  const controls = listAgentControls(task.issue, task.comments)
  const matches = controls.filter(
    (control) => control.instructionId === instruction.instructionId,
  )
  if (matches.length !== 1) {
    return rejected("activation_control_count", { controlCount: matches.length })
  }
  if (matches[0].action !== "continue") {
    return rejected("activation_control_action")
  }
  if (matches[0].prompt !== instruction.prompt) {
    return rejected("activation_control_prompt")
  }
  if (matches[0].ownerApprovalRequired) {
    return rejected("activation_control_owner_gate")
  }

  const records = (state.workspaceBranchReconciliations ?? []).filter(
    (record) =>
      record.originIssueNumber === state.task.originIssueNumber &&
      record.originIssueUrl === state.task.originIssueUrl &&
      record.threadId === state.threadId &&
      record.workspacePath === state.workspacePath &&
      record.toBranch === state.branch &&
      fullShaPattern.test(record.head ?? ""),
  )
  if (records.length !== 1) {
    return rejected(
      records.length === 0
        ? "activation_reconciliation_record_none"
        : "activation_reconciliation_record_ambiguous",
      { recordCount: records.length },
    )
  }
  const record = records[0]
  const expectedId = [
    "authorized-workspace-branch",
    record.precedingInstructionId,
    record.continuationInstructionId,
    record.head,
  ].join(":")
  if (record.reconciliationId !== expectedId) {
    return rejected("activation_reconciliation_id")
  }

  let provenanceMode = "current_instruction"
  let interveningExecutionInstructionIds = []
  if (record.continuationInstructionId !== instruction.instructionId) {
    provenanceMode = "historical_reconciliation"
    if ((state.runs ?? []).some((run) => run.instructionId === instruction.instructionId)) {
      return rejected("activation_current_run_duplicate")
    }
    const receiptRuns = (state.runs ?? []).filter(
      (run) => run.instructionId === record.continuationInstructionId,
    )
    if (receiptRuns.length !== 1) {
      return rejected("activation_historical_receipt_run_count", {
        runCount: receiptRuns.length,
      })
    }
    const receiptIndex = state.runs.indexOf(receiptRuns[0])
    const tail = state.runs.slice(receiptIndex)
    if (new Set(tail.map((run) => run.instructionId)).size !== tail.length) {
      return rejected("activation_historical_tail_duplicate")
    }
    const receiptChangedFiles = normalizedChangedFiles(
      receiptRuns[0].changedFiles,
    )
    const expectedChangedFiles =
      receiptChangedFiles.status === "valid"
        ? receiptChangedFiles.files
        : null
    for (const run of tail) {
      const proof = preApplicationGitFailureDecision(run, record, {
        expectedInstructionId: run.instructionId,
        prefix: "activation_historical_run",
        state,
        requireWorkspace: true,
        expectedChangedFiles,
        allowStructured: true,
      })
      if (!proof.accepted) return proof
    }
    interveningExecutionInstructionIds = tail.map((run) => run.instructionId)
  }

  const sourceRuns = (state.runs ?? []).filter(
    (run) => run.instructionId === record.precedingInstructionId,
  )
  if (sourceRuns.length !== 1) {
    return rejected("activation_source_run_count", {
      runCount: sourceRuns.length,
    })
  }
  const sourceProof = preApplicationGitFailureDecision(sourceRuns[0], record, {
    expectedInstructionId: record.precedingInstructionId,
    prefix: "activation_source_run",
  })
  if (!sourceProof.accepted) return sourceProof
  const cherryPickCommit = extractAuthorizedCherryPick(
    instruction.prompt,
    record.head,
  )
  if (!cherryPickCommit) return rejected("activation_explicit_authorization")
  return accepted({
    record,
    cherryPickCommit,
    provenanceMode,
    interveningExecutionInstructionIds,
  })
}

async function linkedWorktreeMetadataDecision({
  state,
  workspacePath,
  workspaceRoot,
  checkoutPath,
  record,
  cherryPickCommit,
}) {
  const normalizedWorkspace = path.resolve(workspacePath)
  const normalizedRoot = path.resolve(workspaceRoot)
  const normalizedCheckout = path.resolve(checkoutPath)
  if (
    workspacePath !== normalizedWorkspace ||
    workspaceRoot !== normalizedRoot ||
    checkoutPath !== normalizedCheckout ||
    state.workspacePath !== normalizedWorkspace ||
    path.dirname(normalizedWorkspace) !== normalizedRoot ||
    !path.basename(normalizedWorkspace).startsWith(
      `issue-${state.task.originIssueNumber}-`,
    ) ||
    !safeBranchPattern.test(state.branch ?? "") ||
    state.branch
      .split("/")
      .some((segment) => segment === "." || segment === "..")
  ) {
    return rejected("activation_metadata_path_shape")
  }

  if (
    !(await regularPath(normalizedRoot, "directory")) ||
    !(await regularPath(normalizedWorkspace, "directory")) ||
    !(await regularPath(normalizedCheckout, "directory"))
  ) {
    return rejected("activation_metadata_path_type")
  }
  const [rootReal, workspaceReal, checkoutReal] = await Promise.all([
    realpath(normalizedRoot),
    realpath(normalizedWorkspace),
    realpath(normalizedCheckout),
  ])
  if (
    rootReal !== normalizedRoot ||
    workspaceReal !== normalizedWorkspace ||
    checkoutReal !== normalizedCheckout ||
    !exactPathWithin(rootReal, workspaceReal)
  ) {
    return rejected("activation_metadata_realpath")
  }

  const workspaceGitFile = path.join(workspaceReal, ".git")
  const checkoutGitDirectory = path.join(checkoutReal, ".git")
  if (
    !(await regularPath(workspaceGitFile, "file")) ||
    !(await regularPath(checkoutGitDirectory, "directory"))
  ) {
    return rejected("activation_metadata_git_path_type")
  }
  const pointer = await readSmallFile(workspaceGitFile)
  const pointerMatch = pointer?.match(/^gitdir: ([^\r\n]+)\r?\n?$/)
  if (!pointerMatch) return rejected("activation_metadata_git_pointer")
  const pointerTarget = path.isAbsolute(pointerMatch[1])
    ? path.normalize(pointerMatch[1])
    : path.resolve(workspaceReal, pointerMatch[1])

  const [gitDirectoryOutput, commonDirectoryOutput, checkoutCommonOutput] =
    await Promise.all([
      git(["rev-parse", "--path-format=absolute", "--git-dir"], workspaceReal),
      git(
        ["rev-parse", "--path-format=absolute", "--git-common-dir"],
        workspaceReal,
      ),
      git(
        ["rev-parse", "--path-format=absolute", "--git-common-dir"],
        checkoutReal,
      ),
    ])
  const [gitDirectory, commonDirectory, checkoutCommonDirectory] =
    await Promise.all([
      realpath(gitDirectoryOutput),
      realpath(commonDirectoryOutput),
      realpath(checkoutCommonOutput),
    ])
  if (
    pointerTarget !== gitDirectory ||
    commonDirectory !== checkoutCommonDirectory ||
    commonDirectory !== checkoutGitDirectory ||
    !(await regularPath(gitDirectory, "directory")) ||
    !(await regularPath(commonDirectory, "directory"))
  ) {
    return rejected("activation_metadata_git_resolution")
  }

  const worktreesDirectory = path.join(commonDirectory, "worktrees")
  if (
    !(await regularPath(worktreesDirectory, "directory")) ||
    path.dirname(gitDirectory) !== worktreesDirectory ||
    !exactPathWithin(worktreesDirectory, gitDirectory)
  ) {
    return rejected("activation_metadata_worktree_boundary")
  }
  const worktreeName = path.basename(gitDirectory)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(worktreeName)) {
    return rejected("activation_metadata_worktree_name")
  }

  const commonPointer = await readSmallFile(path.join(gitDirectory, "commondir"))
  const workspacePointer = await readSmallFile(path.join(gitDirectory, "gitdir"))
  if (
    commonPointer?.trim() !== "../.." ||
    path.normalize(workspacePointer?.trim() ?? "") !== workspaceGitFile ||
    (await realpath(path.resolve(gitDirectory, commonPointer.trim()))) !==
      commonDirectory ||
    (await realpath(path.normalize(workspacePointer.trim()))) !== workspaceGitFile
  ) {
    return rejected("activation_metadata_back_pointer")
  }

  const [branch, head, status, branchHead, commitType] = await Promise.all([
    git(["branch", "--show-current"], workspaceReal),
    git(["rev-parse", "HEAD"], workspaceReal),
    git(["status", "--porcelain=v1", "-z"], workspaceReal, { trim: false }),
    git(["rev-parse", `refs/heads/${state.branch}`], workspaceReal),
    git(["cat-file", "-t", `${cherryPickCommit}^{commit}`], workspaceReal),
  ])
  if (branch !== state.branch) return rejected("activation_metadata_branch")
  if (head !== record.head) return rejected("activation_metadata_head")
  if (branchHead !== record.head) {
    return rejected("activation_metadata_branch_head")
  }
  if (status !== "") return rejected("activation_metadata_dirty")
  if (commitType !== "commit") {
    return rejected("activation_metadata_target_commit")
  }
  for (const marker of gitOperationMarkers) {
    if (await optionalPathExists(path.join(gitDirectory, marker))) {
      return rejected("activation_metadata_operation_marker")
    }
  }
  for (const directory of gitOperationDirectories) {
    if (await optionalPathExists(path.join(gitDirectory, directory))) {
      return rejected("activation_metadata_operation_directory")
    }
  }

  const objectsDirectory = path.join(commonDirectory, "objects")
  if (
    !(await regularPath(objectsDirectory, "directory")) ||
    (await treeContainsSymlink(gitDirectory)) ||
    (await treeContainsSymlink(objectsDirectory))
  ) {
    return rejected("activation_metadata_symlink_or_objects")
  }
  const branchRef = path.join(
    commonDirectory,
    "refs",
    "heads",
    ...state.branch.split("/"),
  )
  if (
    !exactPathWithin(path.join(commonDirectory, "refs", "heads"), branchRef) ||
    !(await regularPath(branchRef, "file")) ||
    (await readSmallFile(branchRef))?.trim() !== record.head
  ) {
    return rejected("activation_metadata_branch_ref")
  }
  const branchLog = path.join(
    commonDirectory,
    "logs",
    "refs",
    "heads",
    ...state.branch.split("/"),
  )
  if (
    (await optionalPathExists(branchLog)) &&
    !(await regularPath(branchLog, "file"))
  ) {
    return rejected("activation_metadata_branch_log")
  }

  return accepted({
    gitDirectory,
    commonDirectory,
    writablePaths: [
      gitDirectory,
      objectsDirectory,
      branchRef,
      `${branchRef}.lock`,
      branchLog,
      `${branchLog}.lock`,
    ],
  })
}

function exactGitCommands({ cherryPickCommit, branch, baseBranch }) {
  const cherryPick = `git -c core.hooksPath=/dev/null -c commit.gpgSign=false -c rerere.enabled=false cherry-pick ${cherryPickCommit}`
  return {
    cherry_pick: [cherryPick],
    push: [`git push origin ${branch}`],
    ...(baseBranch
      ? {
          pull_request: [
            `gh pr create --base ${baseBranch} --head ${branch} --fill`,
          ],
        }
      : {}),
    validation: [
      "npm run lint",
      "npm test",
      "npm run test:cloudflare",
      "npm run build",
      "npx tsc -b",
      "git diff --check",
      "git status --short --branch",
      "git status --porcelain=v1",
      "git rev-parse HEAD",
      "git rev-parse HEAD^{tree}",
      "git log -1 --format=%H",
    ],
  }
}

function normalizedDisplayedCommand(value) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  const single = trimmed.match(/^\/bin\/zsh -lc '([^']+)'$/)
  if (single) return single[1]
  const double = trimmed.match(/^\/bin\/zsh -lc "([^"$`\\]+)"$/)
  if (double) return double[1]
  return trimmed
}

function exactFilesystemWriteRequest(permissions, writablePaths) {
  if (!permissions || typeof permissions !== "object") return false
  const keys = Object.keys(permissions).sort()
  if (keys.length !== 1 || keys[0] !== "fileSystem") return false
  const fileSystem = permissions.fileSystem
  if (!fileSystem || typeof fileSystem !== "object") return false
  const fileSystemKeys = Object.keys(fileSystem).sort()
  if (fileSystemKeys.length !== 1 || fileSystemKeys[0] !== "write") return false
  if (!Array.isArray(fileSystem.write)) return false
  const requested = [...fileSystem.write].sort()
  const expected = [...writablePaths].sort()
  return (
    requested.length === expected.length &&
    requested.every((entry, index) => entry === expected[index])
  )
}

function exactNetworkRequest(permissions) {
  return Boolean(
    permissions &&
      typeof permissions === "object" &&
      Object.keys(permissions).length === 1 &&
      permissions.network &&
      typeof permissions.network === "object" &&
      Object.keys(permissions.network).length === 1 &&
      permissions.network.enabled === true,
  )
}

export async function authorizedGitExecutionBoundary({
  state,
  instruction,
  task,
  workspacePath,
  workspaceRoot,
  checkoutPath,
  repository,
  baseRef,
  onDiagnostic = null,
}) {
  try {
    const authorization = authorizationDecision({ state, instruction, task })
    if (!authorization.accepted) {
      reportDecision(authorization, onDiagnostic)
      return null
    }
    if (repository !== "Sillyquack/koalafrog-hq") {
      reportDecision(rejected("activation_repository"), onDiagnostic)
      return null
    }
    const metadata = await linkedWorktreeMetadataDecision({
      state,
      workspacePath,
      workspaceRoot,
      checkoutPath,
      record: authorization.value.record,
      cherryPickCommit: authorization.value.cherryPickCommit,
    })
    if (!metadata.accepted) {
      reportDecision(metadata, onDiagnostic)
      return null
    }
    const baseMatch = String(baseRef ?? "").match(
      /^origin\/([A-Za-z0-9._/-]+)$/,
    )
    const baseBranch =
      baseMatch &&
      !baseMatch[1]
        .split("/")
        .some((segment) => segment === "." || segment === "..")
        ? baseMatch[1]
        : null
    return {
      schemaVersion: 1,
      instructionId: instruction.instructionId,
      issueNumber: state.task.originIssueNumber,
      originIssueUrl: state.task.originIssueUrl,
      threadId: state.threadId,
      workspacePath,
      branch: state.branch,
      head: authorization.value.record.head,
      cherryPickCommit: authorization.value.cherryPickCommit,
      provenanceMode: authorization.value.provenanceMode,
      priorPredicateCode:
        authorization.value.provenanceMode === "historical_reconciliation"
          ? "activation_reconciliation_current_instruction_missing"
          : null,
      reconciliationInstructionId:
        authorization.value.record.continuationInstructionId,
      interveningExecutionInstructionIds:
        authorization.value.interveningExecutionInstructionIds,
      gitDirectory: metadata.value.gitDirectory,
      commonDirectory: metadata.value.commonDirectory,
      writablePaths: metadata.value.writablePaths,
      repository,
      commands: exactGitCommands({
        cherryPickCommit: authorization.value.cherryPickCommit,
        branch: state.branch,
        baseBranch,
      }),
    }
  } catch (error) {
    reportDecision(
      rejected("activation_exception", {
        errorName: typeof error?.name === "string" ? error.name : "Error",
      }),
      onDiagnostic,
    )
    return null
  }
}

export function gitExecutionBoundaryPrompt(boundary) {
  if (!boundary) return ""
  return `\n\nOrchestrator-managed Git execution boundary (current instruction only):
- Keep ordinary commands in the default workspace-write sandbox.
- For the one authorized cherry-pick, run exactly: \`${boundary.commands.cherry_pick[0]}\`.
- Request \`sandbox_permissions: "with_additional_permissions"\` for that command with exactly \`additional_permissions.file_system.write\` set to this JSON array: ${JSON.stringify(boundary.writablePaths)}.
- Do not request any other filesystem paths or unsandboxed/full-access execution.
- The normal push and PR commands authorized by this instruction are exactly \`${boundary.commands.push[0]}\`${boundary.commands.pull_request ? ` and \`${boundary.commands.pull_request[0]}\`` : ""}; request only \`additional_permissions.network.enabled: true\` if either command requires network access.
- After the bounded grant, use only the exact Git commands above and these established validation/evidence commands: ${boundary.commands.validation.map((command) => `\`${command}\``).join(", ")}.
- Any different command or permission request will stop for owner review.`
}

export function gitExecutionBoundaryRequestDecision({
  boundary,
  request,
  commandExecution,
}) {
  if (!boundary) return rejected("request_boundary_missing")
  if (
    !new Set([
      "item/permissions/requestApproval",
      "item/commandExecution/requestApproval",
    ]).has(request?.method)
  ) {
    return rejected("request_method")
  }
  if (request.threadId !== boundary.threadId) {
    return rejected("request_thread")
  }
  if (!commandExecution) return rejected("request_command_context_missing")
  if (request.itemId !== commandExecution.id) {
    return rejected("request_item_id")
  }
  if (commandExecution.type !== "commandExecution") {
    return rejected("request_command_type")
  }
  if (commandExecution.source !== "agent") {
    return rejected("request_command_source")
  }
  if (commandExecution.cwd !== boundary.workspacePath) {
    return rejected("request_command_workspace")
  }
  if (request.details?.cwd !== boundary.workspacePath) {
    return rejected("request_workspace")
  }
  const command = normalizedDisplayedCommand(commandExecution.command)
  const action = Object.entries(boundary.commands).find(([, commands]) =>
    commands.includes(command),
  )?.[0]
  if (!action) return rejected("request_command_unrecognized")
  if (request.method === "item/commandExecution/requestApproval") {
    if (normalizedDisplayedCommand(request.details?.command) !== command) {
      return rejected("request_command_serialization", { action })
    }
    if (request.details?.reason != null) {
      return rejected("request_command_reason", { action })
    }
    if (request.details?.networkApprovalContext != null) {
      return rejected("request_command_network_context", { action })
    }
    if (request.details?.proposedExecpolicyAmendment != null) {
      return rejected("request_command_exec_policy", { action })
    }
    if (request.details?.proposedNetworkPolicyAmendments != null) {
      return rejected("request_command_network_policy", { action })
    }
    return accepted({ action, response: { decision: "accept" } })
  }
  const permissions = request.details?.permissions
  const matches =
    action === "cherry_pick"
      ? exactFilesystemWriteRequest(permissions, boundary.writablePaths)
      : new Set(["push", "pull_request"]).has(action) &&
        exactNetworkRequest(permissions)
  if (!matches) {
    return rejected(
      action === "cherry_pick"
        ? "request_filesystem_permissions"
        : "request_network_permissions",
      { action },
    )
  }
  return accepted({
    action,
    response: {
      permissions,
      scope: "turn",
      strictAutoReview: true,
    },
  })
}

export function matchGitExecutionBoundaryRequest(input) {
  const decision = gitExecutionBoundaryRequestDecision(input)
  return decision.accepted ? decision.value : null
}

export async function gitExecutionBoundaryIsCurrent(
  boundary,
  action,
  onDiagnostic = null,
) {
  const fail = (code, context = {}) => {
    reportDecision(rejected(code, context), onDiagnostic)
    return false
  }
  try {
    if (!boundary) return fail("current_boundary_missing")
    if (
      !new Set([
        "cherry_pick",
        "push",
        "pull_request",
        "validation",
      ]).has(action)
    ) {
      return fail("current_action")
    }
    if ((await realpath(boundary.workspacePath)) !== boundary.workspacePath) {
      return fail("current_workspace_realpath", { action })
    }
    if ((await realpath(boundary.gitDirectory)) !== boundary.gitDirectory) {
      return fail("current_gitdir_realpath", { action })
    }
    if ((await realpath(boundary.commonDirectory)) !== boundary.commonDirectory) {
      return fail("current_common_dir_realpath", { action })
    }
    if (!(await regularPath(boundary.workspacePath, "directory"))) {
      return fail("current_workspace_type", { action })
    }
    if (!(await regularPath(boundary.gitDirectory, "directory"))) {
      return fail("current_gitdir_type", { action })
    }
    if (!(await regularPath(boundary.commonDirectory, "directory"))) {
      return fail("current_common_dir_type", { action })
    }
    if (await treeContainsSymlink(boundary.gitDirectory)) {
      return fail("current_gitdir_symlink", { action })
    }
    if (await treeContainsSymlink(path.join(boundary.commonDirectory, "objects"))) {
      return fail("current_objects_symlink", { action })
    }
    const pointer = await readSmallFile(path.join(boundary.workspacePath, ".git"))
    const pointerMatch = pointer?.match(/^gitdir: ([^\r\n]+)\r?\n?$/)
    if (!pointerMatch) return fail("current_git_pointer", { action })
    const pointerTarget = path.isAbsolute(pointerMatch[1])
      ? path.normalize(pointerMatch[1])
      : path.resolve(boundary.workspacePath, pointerMatch[1])
    if ((await realpath(pointerTarget)) !== boundary.gitDirectory) {
      return fail("current_git_pointer_target", { action })
    }

    const [branch, head, status, branchHead] = await Promise.all([
      git(["branch", "--show-current"], boundary.workspacePath),
      git(["rev-parse", "HEAD"], boundary.workspacePath),
      git(["status", "--porcelain=v1", "-z"], boundary.workspacePath, {
        trim: false,
      }),
      git(
        ["rev-parse", `refs/heads/${boundary.branch}`],
        boundary.workspacePath,
      ),
    ])
    if (branch !== boundary.branch) return fail("current_branch", { action })
    if (status !== "") return fail("current_dirty", { action })
    if (branchHead !== head) return fail("current_branch_head", { action })
    for (const marker of gitOperationMarkers) {
      if (await optionalPathExists(path.join(boundary.gitDirectory, marker))) {
        return fail("current_operation_marker", { action })
      }
    }
    for (const directory of gitOperationDirectories) {
      if (await optionalPathExists(path.join(boundary.gitDirectory, directory))) {
        return fail("current_operation_directory", { action })
      }
    }
    if (action === "cherry_pick") {
      return head === boundary.head || fail("current_cherry_pick_head", { action })
    }

    const [parent, count, actualTree, reviewedTree] = await Promise.all([
      git(["rev-parse", "HEAD^"], boundary.workspacePath),
      git(["rev-list", "--count", `${boundary.head}..HEAD`], boundary.workspacePath),
      git(["rev-parse", "HEAD^{tree}"], boundary.workspacePath),
      git(
        ["rev-parse", `${boundary.cherryPickCommit}^{tree}`],
        boundary.workspacePath,
      ),
    ])
    if (parent !== boundary.head) return fail("current_result_parent", { action })
    if (count !== "1") return fail("current_result_commit_count", { action })
    if (actualTree !== reviewedTree) return fail("current_result_tree", { action })
    return true
  } catch (error) {
    return fail("current_exception", {
      action,
      errorName: typeof error?.name === "string" ? error.name : "Error",
    })
  }
}

export function gitExecutionPathIsCovered(boundary, target) {
  const normalized = path.resolve(target)
  return Boolean(
    boundary?.writablePaths?.some((root) => {
      const relative = path.relative(root, normalized)
      return (
        relative === "" ||
        (!relative.startsWith("..") && !path.isAbsolute(relative))
      )
    }),
  )
}
