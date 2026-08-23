import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
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
const checkpointIssueNumber = 63
const checkpointBranch =
  "agent/issue-63-production-day1-integration-001"
const checkpointProposalPrefix =
  "Create only a read-only superseding Git reconciliation checkpoint proposal for Issue #63."
const checkpointGenerationProposalPrefix =
  "Create only a read-only superseding Git reconciliation checkpoint generation 2 proposal for Issue #63."
const checkpointActivationPrefix =
  "The owner explicitly approves activation of superseding Git reconciliation checkpoint"
const checkpointOperationScope =
  "issue-63-reviewed-integration-branch-cherry-pick"
const checkpointPrecedingInstructionId =
  "production-day1-git-reconciliation-008"
const checkpointReceiptInstructionId =
  "production-day1-git-reconciliation-resume-010"
const checkpointHistoricalTailInstructionIds = [
  checkpointReceiptInstructionId,
  "production-day1-git-reconciliation-execution-011",
  "production-day1-git-reconciliation-execution-012",
  "production-day1-git-reconciliation-execution-013",
  "production-day1-git-reconciliation-execution-014",
  "production-day1-git-reconciliation-execution-015",
]
const checkpointGeneration = 2
const checkpointGenerationAuditInstructionIds = [
  "production-day1-git-reconciliation-checkpoint-proposal-016",
  "production-day1-git-reconciliation-checkpoint-proposal-017",
  "production-day1-git-reconciliation-checkpoint-proposal-018",
]
const checkpointGenerationAuditRejectionCodes = new Map([
  [checkpointGenerationAuditInstructionIds[0], "checkpoint_proposal_exception"],
  [checkpointGenerationAuditInstructionIds[1], "checkpoint_historical_tail_scope"],
  [
    checkpointGenerationAuditInstructionIds[2],
    "checkpoint_post_tail_control_binding",
  ],
])
const checkpointGenerationRetryRejectionCodes = new Set([
  "checkpoint_proposal_exception",
  "checkpoint_proposal_scope_binding",
])
const retryableCheckpointProposalRejectionCodes = new Set([
  "checkpoint_proposal_exception",
  "checkpoint_historical_tail_scope",
])
const checkpointNegatedMutationStatements = [
  "No fallback path or mutation was attempted.",
  "No fallback, source change, remote Git mutation, deployment, migration, receipt, or production action occurred.",
]

function accepted(value, context = {}) {
  return { accepted: true, value, context }
}

function rejected(code, context = {}) {
  return { accepted: false, value: null, rejection: { code, ...context } }
}

class CheckpointProposalStageError extends Error {
  constructor(stage, cause) {
    super("Checkpoint proposal stage failed", { cause })
    this.name = "CheckpointProposalStageError"
    this.stage = stage
  }
}

async function checkpointProposalStage(stage, operation) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof CheckpointProposalStageError) throw error
    throw new CheckpointProposalStageError(stage, error)
  }
}

function checkpointProposalExceptionDiagnostic(error) {
  const staged = error instanceof CheckpointProposalStageError
  const cause = staged ? error.cause : error
  const stage = staged ? error.stage : "proposal_unclassified"
  const rawCode = cause?.code
  let reason = "unexpected_error"
  let errorCode = null
  if (rawCode === "ENOENT") {
    reason =
      (stage === "pull_request_lookup" && cause?.path === "gh") ||
      (stage.endsWith("_lookup") && cause?.path === "git")
        ? "executable_missing"
        : "not_found"
    errorCode = rawCode
  } else if (rawCode === "EACCES" || rawCode === "EPERM") {
    reason = "permission_denied"
    errorCode = rawCode
  } else if (rawCode === "ENOTDIR") {
    reason = "path_type_invalid"
    errorCode = rawCode
  } else if (rawCode === "ELOOP") {
    reason = "symlink_loop"
    errorCode = rawCode
  } else if (rawCode === "ENAMETOOLONG") {
    reason = "path_invalid"
    errorCode = rawCode
  } else if (rawCode === "CHECKPOINT_INVALID_RESULT") {
    reason = "invalid_result"
    errorCode = rawCode
  } else if (Number.isSafeInteger(rawCode)) {
    reason = "command_failed"
    errorCode = `exit_${rawCode}`
  } else if (cause instanceof SyntaxError) {
    reason = "invalid_json"
  } else if (cause instanceof RangeError) {
    reason = "invalid_time"
  } else if (cause instanceof TypeError) {
    reason = "invalid_input"
  } else if (cause?.name === "DataCloneError") {
    reason = "state_not_cloneable"
  }
  return {
    stage,
    reason,
    ...(errorCode ? { errorCode } : {}),
  }
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

async function githubPullRequestNumbers({ repository, branch, cwd }) {
  const result = await execFileAsync(
    "gh",
    [
      "pr",
      "list",
      "--repo",
      repository,
      "--state",
      "all",
      "--head",
      branch,
      "--json",
      "number",
      "--limit",
      "2",
    ],
    { cwd, encoding: "utf8", maxBuffer: 1024 * 1024 },
  )
  const parsed = JSON.parse(result.stdout)
  if (
    !Array.isArray(parsed) ||
    parsed.some(
      (entry) =>
        !entry ||
        Object.keys(entry).length !== 1 ||
        !Number.isSafeInteger(entry.number) ||
        entry.number <= 0,
    )
  ) {
    const error = new Error("Malformed pull request lookup result")
    error.code = "CHECKPOINT_INVALID_RESULT"
    throw error
  }
  return parsed.map((entry) => entry.number)
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

export function gitReconciliationCheckpointProposalPrompt({
  reconciliationId,
  head,
  tree,
  cherryPickCommit,
}) {
  return `${checkpointProposalPrefix}

This proposal must not activate a grant or execute any Git mutation.

Exact reviewed binding:
- reconciliation receipt: \`${reconciliationId}\`
- branch: \`${checkpointBranch}\`
- HEAD: \`${head}\`
- tree: \`${tree}\`
- cherry-pick only: \`${cherryPickCommit}\`

Verify the current linked worktree read-only, preserve all prior history, and create one immutable proposal record. Activation requires a later explicit owner control naming the resulting checkpoint ID.`
}

export function gitReconciliationCheckpointGenerationProposalPrompt({
  reconciliationId,
  head,
  tree,
  cherryPickCommit,
  auditInstructionIds = checkpointGenerationAuditInstructionIds,
}) {
  return `${checkpointGenerationProposalPrefix}

This proposal must not activate a grant or execute any Git mutation.

Exact superseding generation:
- generation: \`${checkpointGeneration}\`
- rejected proposal audit: \`${auditInstructionIds.join(",")}\`

Exact reviewed binding:
- reconciliation receipt: \`${reconciliationId}\`
- branch: \`${checkpointBranch}\`
- HEAD: \`${head}\`
- tree: \`${tree}\`
- cherry-pick only: \`${cherryPickCommit}\`

Verify the current linked worktree read-only, preserve the original historical tail and every rejected proposal attempt, and create one immutable generation proposal record. Activation requires a later explicit owner control naming the resulting checkpoint and generation IDs.`
}

export function gitReconciliationCheckpointActivationPrompt({
  checkpointId,
  reconciliationId,
  head,
  tree,
  cherryPickCommit,
  generation = null,
  generationId = null,
}) {
  const generationBinding =
    generation === checkpointGeneration && typeof generationId === "string"
      ? `\n\nThe owner explicitly approves only superseding generation \`${generation}\` with generation ID \`${generationId}\`.`
      : ""
  return `${checkpointActivationPrefix} \`${checkpointId}\`.${generationBinding}

The owner explicitly approves the exact linked-worktree Git metadata writes required for this checkpoint and no broader filesystem access.

Exact reviewed binding:
- reconciliation receipt: \`${reconciliationId}\`
- branch: \`${checkpointBranch}\`
- starting exactly from HEAD: \`${head}\`
- tree: \`${tree}\`
- cherry-pick only \`${cherryPickCommit}\`

Execute only this approved Git path:
1. activate only the selected linked-worktree metadata boundary;
2. cherry-pick only \`${cherryPickCommit}\`;
3. run the established complete validation suite;
4. if and only if validation is green, push the new integration branch normally and open a PR for review;
5. stop at review.

Do not merge, deploy, migrate, write production data, purchase, create receipts, or access sibling worktree metadata.`
}

function parseCheckpointProposalPrompt(prompt) {
  if (typeof prompt !== "string") {
    return null
  }
  const generationPrompt = prompt.startsWith(checkpointGenerationProposalPrefix)
  if (!generationPrompt && !prompt.startsWith(checkpointProposalPrefix)) {
    return null
  }
  const reconciliationId = prompt.match(
    /^- reconciliation receipt: `([^`]+)`$/m,
  )?.[1]
  const head = prompt.match(/^- HEAD: `([0-9a-f]{40})`$/m)?.[1]
  const tree = prompt.match(/^- tree: `([0-9a-f]{40})`$/m)?.[1]
  const cherryPickCommit = prompt.match(
    /^- cherry-pick only: `([0-9a-f]{40})`$/m,
  )?.[1]
  if (!reconciliationId || !head || !tree || !cherryPickCommit) {
    return { malformed: true }
  }
  const auditInstructionIds = generationPrompt
    ? prompt
        .match(/^- rejected proposal audit: `([^`]+)`$/m)?.[1]
        ?.split(",")
    : null
  const generation = generationPrompt
    ? Number(prompt.match(/^- generation: `([0-9]+)`$/m)?.[1])
    : null
  if (
    generationPrompt &&
    (generation !== checkpointGeneration ||
      !sameStringArray(
        auditInstructionIds,
        checkpointGenerationAuditInstructionIds,
      ))
  ) {
    return { malformed: true }
  }
  const value = {
    reconciliationId,
    head,
    tree,
    cherryPickCommit,
    ...(generationPrompt
      ? { generation, auditInstructionIds }
      : {}),
  }
  return prompt ===
    (generationPrompt
      ? gitReconciliationCheckpointGenerationProposalPrompt(value)
      : gitReconciliationCheckpointProposalPrompt(value))
    ? value
    : { malformed: true }
}

function checkpointPromptDigest(prompt) {
  return sha256(`git-reconciliation-checkpoint-prompt-v1\n${prompt}`)
}

export function gitReconciliationCheckpointInstructionKind(instruction) {
  const prompt = instruction?.prompt
  if (typeof prompt !== "string") return null
  if (prompt.startsWith(checkpointGenerationProposalPrefix)) return "proposal"
  if (prompt.startsWith(checkpointProposalPrefix)) return "proposal"
  if (prompt.startsWith(checkpointActivationPrefix)) return "activation"
  return null
}

export function gitReconciliationCheckpointOwnerReason(checkpoint) {
  const generation =
    checkpoint.generation === checkpointGeneration && checkpoint.generationId
      ? ` generation ${checkpoint.generation} (${checkpoint.generationId}),`
      : ""
  return `Explicit owner activation is required for superseding Git reconciliation checkpoint ${checkpoint.checkpointId},${generation} bound to branch ${checkpoint.branch} at HEAD ${checkpoint.head} and tree ${checkpoint.tree}.`
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
  "No source, remote Git, production, migration, deployment, purchase, or receipt mutation occurred.",
]
const structuredNoPushStatements = new Set([
  "Push: **NOT ATTEMPTED**",
  "Push/PR: **NOT ATTEMPTED**",
])

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
  return /\b(?:source|production|migration|deployment|purchase|receipt|remote Git)\b[^.]*\bmutation (?:occurred|was attempted)\b/i.test(
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
  if (allFindings.some((entry) => hasPositiveMutationEvidence(entry))) {
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
        (/^Push(?:\/PR)?:/i.test(entry) &&
          !structuredNoPushStatements.has(entry)) ||
        /\b(?:pushed|push succeeded|remote branch created)\b/i.test(entry),
    )
  ) {
    return rejected(`${prefix}_structured_push_conflict`)
  }
  if (!branchEvidence.some((entry) => structuredNoPushStatements.has(entry))) {
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
  const markerStates = [
    ...finalMessage.matchAll(/In-progress Git markers:\s*([^\n]+)/gi),
  ].map((match) => match[1].trim().toLowerCase())
  const compactNoMarkerEvidence =
    /Worktree:\s*clean;\s*zero commits above base;\s*no Git operation markers\s*$/im.test(
      finalMessage,
    )
  const combinedPushPrNotAttempted =
    /^\s*-\s*Push\/PR:\s*\*\*NOT ATTEMPTED\*\*\s*$/im.test(
      finalMessage,
    )
  if (
    (recordedHeads.length > 0 &&
      (recordedHeads.length !== 1 || recordedHeads[0] !== record.head)) ||
    /Cherry-pick:\s*\*\*(?:SUCCEEDED|APPLIED|PARTIALLY APPLIED)/i.test(
      finalMessage,
    ) ||
    /Cherry-pick:[^\n]*\b(?:during|after|partial(?:ly)?)\b[^\n]*\bapplication\b/i.test(
      finalMessage,
    ) ||
    /Worktree:\s*(?:dirty|modified|has uncommitted)/i.test(finalMessage) ||
    markerStates.length > 1 ||
    markerStates.some((state) => state !== "all absent") ||
    (/\b(?:CHERRY_PICK_HEAD|MERGE_HEAD|REVERT_HEAD|REBASE_HEAD)\b[^.\n]*\b(?:present|remains?|exists?)\b/i.test(
      finalMessage,
    ) &&
      !/\bno\s+`?(?:CHERRY_PICK_HEAD|MERGE_HEAD|REVERT_HEAD|REBASE_HEAD)`?/i.test(
        finalMessage,
      )) ||
    /Commits above base:\s*`?[1-9][0-9]*`?/i.test(finalMessage) ||
    /Push(?:\/PR)?:\s*\*\*(?!NOT ATTEMPTED)/i.test(finalMessage) ||
    (/^\s*-\s*Push\/PR:/im.test(finalMessage) &&
      !combinedPushPrNotAttempted) ||
    /PR:\s*\*\*(?:CREATED|OPENED)/i.test(finalMessage) ||
    hasPositiveMutationEvidence(finalMessage)
  ) {
    return rejected(`${prefix}_structured_final_message_conflict`)
  }
  if (
    !/Cherry-pick:\s*\*\*FAILED before application\*\*/i.test(finalMessage) ||
    recordedHeads.length !== 1 ||
    !/Worktree:\s*clean[;,]\s*zero commits above base/i.test(finalMessage) ||
    (markerStates.length !== 1 && !compactNoMarkerEvidence) ||
    (!/PR:\s*\*\*NOT CREATED\*\*/i.test(finalMessage) &&
      !combinedPushPrNotAttempted)
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
  let structuredFallback = null
  if (allowStructured) {
    const structured = structuredHistoricalPreApplicationDecision(
      run,
      record,
      expectedChangedFiles,
      prefix,
    )
    if (structured.accepted || !structured.legacyEligible) return structured
    structuredFallback = structured
  }
  const legacy = legacyPreApplicationGitFailureDecision(run, prefix)
  if (!structuredFallback || legacy.accepted) return legacy
  return {
    ...legacy,
    rejection: {
      ...legacy.rejection,
      structuredReason: structuredFallback.rejection.code,
      legacyReason: legacy.rejection.code,
      proofMode: "legacy_fallback",
    },
  }
}

function checkpointHistoricalContradictionDecision(
  run,
  record,
  expectedChangedFiles,
) {
  if (
    run?.status !== "needs_review" ||
    run.branch !== record.toBranch ||
    !Array.isArray(run.commits) ||
    run.commits.length !== 1 ||
    run.commits[0] !== record.head ||
    run.turnCount !== 1 ||
    run.ownerRequest != null ||
    run.resultArtifact?.source !== "completed_turn_final_message" ||
    run.resultArtifact?.turnStatus !== "completed"
  ) {
    return rejected("checkpoint_historical_run_shape", {
      instructionId: run?.instructionId ?? null,
    })
  }
  const audit = structuredClone(run)
  const findings = audit.resultArtifact?.findings
  const changedFiles = normalizedChangedFiles(run.changedFiles)
  if (
    changedFiles.status !== "valid" ||
    !sameStringArray(changedFiles.files, expectedChangedFiles)
  ) {
    return rejected("checkpoint_historical_changed_files", {
      instructionId: run.instructionId,
    })
  }
  if (!findings || typeof findings !== "object") {
    return rejected("checkpoint_historical_findings_missing", {
      instructionId: run.instructionId,
    })
  }
  for (const key of durableFindingKeys) {
    if (
      !Array.isArray(audit[key]) ||
      !Array.isArray(findings[key]) ||
      JSON.stringify(audit[key]) !== JSON.stringify(findings[key]) ||
      audit[key].some(
        (entry) => typeof entry !== "string" || entry.length === 0,
      )
    ) {
      return rejected("checkpoint_historical_findings_shape", {
        instructionId: run.instructionId,
        finding: key,
      })
    }
  }

  const finalMessage = audit.resultArtifact.finalMessage
  if (typeof finalMessage !== "string") {
    return rejected("checkpoint_historical_final_message", {
      instructionId: run.instructionId,
    })
  }
  const allEvidence = [
    ...durableFindingKeys.flatMap((key) => audit[key]),
    finalMessage,
  ]
  const operationPresent = allEvidence.some(
    (entry) =>
      /\b(?:CHERRY_PICK_HEAD|MERGE_HEAD|REVERT_HEAD|REBASE_HEAD)\b[^.\n]*\b(?:present|remains?|exists?)\b/i.test(
        entry,
      ) &&
      !/\bno\s+`?(?:CHERRY_PICK_HEAD|MERGE_HEAD|REVERT_HEAD|REBASE_HEAD)`?/i.test(
        entry,
      ) &&
      !/\ball absent\b/i.test(entry),
  )
  if (
    operationPresent ||
    allEvidence.some((entry) =>
      /\bworktree\b[^.\n]*\b(?:dirty|modified|uncommitted)\b/i.test(entry),
    ) ||
    /Commits above base:\s*`?[1-9][0-9]*`?/i.test(finalMessage) ||
    /Cherry-pick:\s*\*\*(?:SUCCEEDED|APPLIED|PARTIALLY APPLIED)/i.test(
      finalMessage,
    ) ||
    /Cherry-pick:[^\n]*\b(?:during|after|partial(?:ly)?)\b[^\n]*\bapplication\b/i.test(
      finalMessage,
    )
  ) {
    return rejected("checkpoint_historical_git_state_conflict", {
      instructionId: run.instructionId,
    })
  }

  const withoutKnownNegation = (value) => {
    let normalized = String(value)
    for (const statement of [
      ...structuredNoMutationStatements,
      ...checkpointNegatedMutationStatements,
    ]) {
      normalized = normalized.replaceAll(statement, "")
    }
    return normalized
  }
  const unexplainedMutationEvidence = allEvidence.map(withoutKnownNegation)
  if (
    unexplainedMutationEvidence.some((entry) =>
      hasPositiveMutationEvidence(entry),
    )
  ) {
    return rejected("checkpoint_historical_mutation_conflict", {
      instructionId: run.instructionId,
    })
  }
  if (
    unexplainedMutationEvidence.some((entry) =>
      /\bmutation\b|\b(?:source change|production (?:write|action)|migration|deployment|purchase|receipts?|remote Git)\b[^.\n]{0,80}\b(?:occurred|attempted|completed|succeeded|unknown|status)\b/i.test(
        entry,
      ),
    )
  ) {
    return rejected("checkpoint_historical_mutation_ambiguous", {
      instructionId: run.instructionId,
    })
  }

  if (
    audit.branchPushState.some(
      (entry) =>
        (/^Push(?:\/PR)?:/i.test(entry) &&
          !structuredNoPushStatements.has(entry)) ||
        /\b(?:pushed|push succeeded|remote branch created)\b/i.test(entry),
    ) ||
    allEvidence.some((entry) =>
      /\bPR:\s*\*\*(?:CREATED|OPENED|ATTEMPTED)/i.test(entry),
    ) ||
    /Push(?:\/PR)?:\s*\*\*(?!NOT ATTEMPTED)/i.test(finalMessage)
  ) {
    return rejected("checkpoint_historical_push_pr_conflict", {
      instructionId: run.instructionId,
    })
  }
  if (
    !audit.branchPushState.some((entry) =>
      structuredNoPushStatements.has(entry),
    ) ||
    !/Cherry-pick:\s*\*\*FAILED before application\*\*/i.test(finalMessage) ||
    !/Worktree:\s*clean[;,]\s*(?:no `CHERRY_PICK_HEAD`;\s*)?zero commits above base/i.test(
      finalMessage,
    )
  ) {
    return rejected("checkpoint_historical_incomplete_safe_stop", {
      instructionId: run.instructionId,
    })
  }

  const diffCheck = audit.resultArtifact?.checks?.diffCheck
  const commandEvidence = diffCheck?.evidence?.filter(
    (evidence) =>
      evidence?.source === "command_execution" &&
      evidence.status === "pass" &&
      typeof evidence.summary === "string",
  )
  if (
    audit.checks?.diffCheck !== "pass" ||
    diffCheck?.status !== "pass" ||
    !Array.isArray(commandEvidence) ||
    commandEvidence.length !== 1 ||
    !commandEvidence[0].summary.includes("git diff --check") ||
    (!commandEvidence[0].summary.includes("git status --porcelain=v1") &&
      !commandEvidence[0].summary.includes("git status --short --branch")) ||
    !commandEvidence[0].summary.includes(
      `git rev-list --count ${record.head}..HEAD`,
    ) ||
    !/\(completed, exit 0\)/i.test(commandEvidence[0].summary)
  ) {
    return rejected("checkpoint_historical_command_evidence", {
      instructionId: run.instructionId,
    })
  }
  return accepted(run)
}

function rejectedCheckpointProposalTailDecision({
  state,
  task,
  runs,
  record,
  expectedChangedFiles,
  expectedBinding,
  currentInstructionId = null,
}) {
  if (!Array.isArray(runs)) {
    return rejected("checkpoint_post_tail_runs_invalid")
  }
  const instructionIds = runs.map((run) => run?.instructionId)
  if (
    instructionIds.some(
      (instructionId) =>
        typeof instructionId !== "string" || !instructionId,
    ) ||
    new Set(instructionIds).size !== instructionIds.length ||
    instructionIds.some((instructionId) =>
      checkpointHistoricalTailInstructionIds.includes(instructionId),
    ) ||
    (currentInstructionId && instructionIds.includes(currentInstructionId))
  ) {
    return rejected("checkpoint_post_tail_instruction_duplicate")
  }

  const controls = listAgentControls(task.issue, task.comments)
  const canonicalCheckNames = [
    "build",
    "cloudflareReadiness",
    "diffCheck",
    "lint",
    "tests",
    "typecheck",
  ]
  for (const run of runs) {
    const matchingControls = controls.filter(
      (control) => control.instructionId === run.instructionId,
    )
    if (matchingControls.length !== 1) {
      return rejected("checkpoint_post_tail_control_count", {
        instructionId: run.instructionId,
        controlCount: matchingControls.length,
      })
    }
    const control = matchingControls[0]
    const instructionKind = gitReconciliationCheckpointInstructionKind(control)
    if (instructionKind === "activation") {
      return rejected("checkpoint_post_tail_activation_attempt", {
        instructionId: run.instructionId,
      })
    }
    if (instructionKind !== "proposal") {
      return rejected("checkpoint_post_tail_unrelated_control", {
        instructionId: run.instructionId,
      })
    }
    const parsed = parseCheckpointProposalPrompt(control.prompt)
    if (control.action !== "continue") {
      return rejected("checkpoint_post_tail_control_action", {
        instructionId: run.instructionId,
      })
    }
    if (control.taskState !== "needs_review") {
      return rejected("checkpoint_post_tail_control_task_state", {
        instructionId: run.instructionId,
      })
    }
    if (control.ownerApprovalRequired) {
      return rejected("checkpoint_post_tail_control_owner_approval", {
        instructionId: run.instructionId,
      })
    }
    if (!parsed || parsed.malformed) {
      return rejected("checkpoint_post_tail_control_prompt", {
        instructionId: run.instructionId,
      })
    }
    if (parsed.reconciliationId !== expectedBinding.reconciliationId) {
      return rejected("checkpoint_post_tail_control_reconciliation", {
        instructionId: run.instructionId,
      })
    }
    if (parsed.head !== expectedBinding.head) {
      return rejected("checkpoint_post_tail_control_head", {
        instructionId: run.instructionId,
      })
    }
    if (parsed.tree !== expectedBinding.tree) {
      return rejected("checkpoint_post_tail_control_tree", {
        instructionId: run.instructionId,
      })
    }
    if (parsed.cherryPickCommit !== expectedBinding.cherryPickCommit) {
      return rejected("checkpoint_post_tail_control_cherry_pick", {
        instructionId: run.instructionId,
      })
    }

    const changedFiles = normalizedChangedFiles(run.changedFiles)
    if (
      run.status !== "needs_review" ||
      run.turnCount !== 0 ||
      run.branch !== record.toBranch ||
      run.originIssueNumber !== state.task.originIssueNumber ||
      run.originIssueUrl !== state.task.originIssueUrl ||
      run.threadId !== state.threadId ||
      run.workspacePath !== state.workspacePath ||
      run.ownerRequest !== null ||
      run.resultArtifact !== null ||
      !Array.isArray(run.commits) ||
      run.commits.length !== 1 ||
      run.commits[0] !== record.head ||
      changedFiles.status !== "valid" ||
      !sameStringArray(changedFiles.files, expectedChangedFiles) ||
      !run.checks ||
      !sameStringArray(Object.keys(run.checks).sort(), canonicalCheckNames) ||
      Object.values(run.checks).some((status) => status !== "not_run") ||
      !Number.isFinite(Date.parse(run.completedAt ?? ""))
    ) {
      return rejected("checkpoint_post_tail_run_shape", {
        instructionId: run.instructionId,
      })
    }
    if (
      !Array.isArray(run.blockers) ||
      run.blockers.length !== 1 ||
      !retryableCheckpointProposalRejectionCodes.has(run.blockers[0]) ||
      !Array.isArray(run.ownerGates) ||
      run.ownerGates.length !== 0 ||
      !Array.isArray(run.productionReadback) ||
      run.productionReadback.length !== 0 ||
      !Array.isArray(run.safetyFindings) ||
      run.safetyFindings.length !== 0 ||
      !Array.isArray(run.branchPushState) ||
      run.branchPushState.length !== 0
    ) {
      return rejected("checkpoint_post_tail_evidence", {
        instructionId: run.instructionId,
      })
    }
  }

  const checkpoints = state.gitReconciliationCheckpoints
  if (!Array.isArray(checkpoints)) {
    return rejected("checkpoint_records_invalid")
  }
  const instructionIdSet = new Set(instructionIds)
  if (
    checkpoints.some(
      (checkpoint) =>
        instructionIdSet.has(checkpoint?.proposalInstructionId) ||
        instructionIdSet.has(checkpoint?.activationInstructionId),
    )
  ) {
    return rejected("checkpoint_post_tail_record_conflict")
  }
  return accepted({ instructionIds })
}

function checkpointGenerationAuditDigest(attempts) {
  return sha256(
    JSON.stringify({
      version: 1,
      operationScope: checkpointOperationScope,
      historicalTailInstructionIds: checkpointHistoricalTailInstructionIds,
      attempts,
    }),
  )
}

function checkpointReconciliationReferenceMatches(value, record) {
  return (
    value === record.reconciliationId ||
    value === record.continuationInstructionId
  )
}

function checkpointGenerationAuditDecision({
  state,
  task,
  runs,
  record,
  expectedChangedFiles,
  expectedBinding,
  currentInstructionId = null,
}) {
  const instructionIds = Array.isArray(runs)
    ? runs.map((run) => run?.instructionId)
    : []
  const baseInstructionIds = instructionIds.slice(
    0,
    checkpointGenerationAuditInstructionIds.length,
  )
  const retryInstructionIds = instructionIds.slice(
    checkpointGenerationAuditInstructionIds.length,
  )
  if (
    !Array.isArray(runs) ||
    !sameStringArray(
      baseInstructionIds,
      checkpointGenerationAuditInstructionIds,
    ) ||
    retryInstructionIds.some(
      (instructionId, index) =>
        instructionId !==
        `production-day1-git-reconciliation-checkpoint-generation-proposal-${String(19 + index).padStart(3, "0")}`,
    ) ||
    new Set(instructionIds).size !== instructionIds.length ||
    (currentInstructionId &&
      runs.some((run) => run.instructionId === currentInstructionId))
  ) {
    return rejected("checkpoint_generation_audit_scope", {
      runCount: Array.isArray(runs) ? runs.length : -1,
    })
  }

  const controls = listAgentControls(task.issue, task.comments)
  const canonicalCheckNames = [
    "build",
    "cloudflareReadiness",
    "diffCheck",
    "lint",
    "tests",
    "typecheck",
  ]
  const attempts = []
  for (const [index, run] of runs.entries()) {
    const legacyAttempt =
      index < checkpointGenerationAuditInstructionIds.length
    const matchingControls = controls.filter(
      (control) => control.instructionId === run.instructionId,
    )
    if (matchingControls.length !== 1) {
      return rejected("checkpoint_generation_audit_control_count", {
        instructionId: run.instructionId,
        controlCount: matchingControls.length,
      })
    }
    const control = matchingControls[0]
    const parsed = parseCheckpointProposalPrompt(control.prompt)
    if (
      gitReconciliationCheckpointInstructionKind(control) !== "proposal" ||
      !parsed ||
      parsed.malformed ||
      control.action !== "continue" ||
      control.taskState !== "needs_review" ||
      control.ownerApprovalRequired ||
      (legacyAttempt
        ? parsed.generation != null ||
          parsed.reconciliationId !== record.reconciliationId ||
          parsed.head !== record.head ||
          !fullShaPattern.test(parsed.tree)
        : parsed.generation !== checkpointGeneration ||
          !sameStringArray(
            parsed.auditInstructionIds,
            checkpointGenerationAuditInstructionIds,
          ) ||
          !checkpointReconciliationReferenceMatches(
            parsed.reconciliationId,
            record,
          ) ||
          parsed.head !== expectedBinding.head ||
          parsed.tree !== expectedBinding.tree) ||
      parsed.cherryPickCommit !== checkpointGenerationAuditCherryPickCommit({
        state,
        task,
        record,
      }) ||
      (!legacyAttempt &&
        parsed.cherryPickCommit !== expectedBinding.cherryPickCommit)
    ) {
      return rejected("checkpoint_generation_audit_control_binding", {
        instructionId: run.instructionId,
      })
    }

    const changedFiles = normalizedChangedFiles(run.changedFiles)
    const rejectionCode = legacyAttempt
      ? checkpointGenerationAuditRejectionCodes.get(run.instructionId)
      : Array.isArray(run.blockers) && run.blockers.length === 1
        ? run.blockers[0]
        : null
    if (
      run.status !== "needs_review" ||
      run.turnCount !== 0 ||
      run.branch !== record.toBranch ||
      run.originIssueNumber !== state.task.originIssueNumber ||
      run.originIssueUrl !== state.task.originIssueUrl ||
      run.threadId !== state.threadId ||
      run.workspacePath !== state.workspacePath ||
      run.ownerRequest !== null ||
      run.resultArtifact !== null ||
      !Array.isArray(run.commits) ||
      run.commits.length !== 1 ||
      run.commits[0] !== record.head ||
      changedFiles.status !== "valid" ||
      !sameStringArray(changedFiles.files, expectedChangedFiles) ||
      !run.checks ||
      !sameStringArray(Object.keys(run.checks).sort(), canonicalCheckNames) ||
      Object.values(run.checks).some((status) => status !== "not_run") ||
      !Number.isFinite(Date.parse(run.completedAt ?? ""))
    ) {
      return rejected("checkpoint_generation_audit_run_shape", {
        instructionId: run.instructionId,
      })
    }
    if (
      !rejectionCode ||
      (!legacyAttempt &&
        (!checkpointGenerationRetryRejectionCodes.has(rejectionCode) ||
          (rejectionCode === "checkpoint_proposal_scope_binding" &&
            parsed.reconciliationId !== record.continuationInstructionId))) ||
      !sameStringArray(run.blockers, [rejectionCode]) ||
      !sameStringArray(run.ownerGates, []) ||
      !sameStringArray(run.productionReadback, []) ||
      !sameStringArray(run.safetyFindings, []) ||
      !sameStringArray(run.branchPushState, [])
    ) {
      return rejected("checkpoint_generation_audit_evidence", {
        instructionId: run.instructionId,
      })
    }

    const runBinding = {
      status: run.status,
      turnCount: run.turnCount,
      originIssueNumber: run.originIssueNumber,
      originIssueUrl: run.originIssueUrl,
      threadId: run.threadId,
      workspacePath: run.workspacePath,
      branch: run.branch,
      commits: run.commits,
      changedFiles: changedFiles.files,
      checks: Object.fromEntries(
        Object.entries(run.checks).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      blocker: rejectionCode,
      completedAt: run.completedAt,
    }
    attempts.push({
      instructionId: run.instructionId,
      rejectionCode,
      reconciliationId: parsed.reconciliationId,
      head: parsed.head,
      tree: parsed.tree,
      cherryPickCommit: parsed.cherryPickCommit,
      promptDigest: checkpointPromptDigest(control.prompt),
      runBindingDigest: sha256(JSON.stringify(runBinding)),
    })
  }

  if (
    attempts[0].tree !== attempts[1].tree ||
    attempts[2].tree === attempts[0].tree
  ) {
    return rejected("checkpoint_generation_audit_tree_conflict")
  }

  const checkpoints = state.gitReconciliationCheckpoints
  if (!Array.isArray(checkpoints)) {
    return rejected("checkpoint_records_invalid")
  }
  const instructionIdSet = new Set(instructionIds)
  if (
    checkpoints.some(
      (checkpoint) =>
        instructionIdSet.has(checkpoint?.proposalInstructionId) ||
        instructionIdSet.has(checkpoint?.activationInstructionId),
    )
  ) {
    return rejected("checkpoint_generation_audit_record_conflict")
  }
  const audit = {
    schemaVersion: 1,
    instructionIds,
    attempts,
  }
  audit.digest = checkpointGenerationAuditDigest(attempts)
  return accepted(audit)
}

function checkpointGenerationAuditCherryPickCommit({ state, task, record }) {
  const controls = listAgentControls(task.issue, task.comments).filter(
    (control) => control.instructionId === record.continuationInstructionId,
  )
  return controls.length === 1
    ? extractAuthorizedCherryPick(controls[0].prompt, record.head)
    : null
}

function checkpointContextDecision({
  state,
  task,
  expectedTailInstructionIds = null,
}) {
  if (
    state?.task?.originIssueNumber !== checkpointIssueNumber ||
    extractIssueNumber(task?.issue) !== checkpointIssueNumber ||
    currentIssueUrl(task) !== state.task.originIssueUrl ||
    state.branch !== checkpointBranch ||
    typeof state.threadId !== "string" ||
    !state.threadId ||
    typeof state.workspacePath !== "string" ||
    !state.workspacePath
  ) {
    return rejected("checkpoint_origin_thread_workspace")
  }
  const records = (state.workspaceBranchReconciliations ?? []).filter(
    (record) =>
      record.originIssueNumber === checkpointIssueNumber &&
      record.originIssueUrl === state.task.originIssueUrl &&
      record.threadId === state.threadId &&
      record.workspacePath === state.workspacePath &&
      record.toBranch === checkpointBranch &&
      record.precedingInstructionId === checkpointPrecedingInstructionId &&
      record.continuationInstructionId === checkpointReceiptInstructionId &&
      record.head &&
      fullShaPattern.test(record.head),
  )
  if (records.length !== 1) {
    return rejected("checkpoint_reconciliation_record_count", {
      recordCount: records.length,
    })
  }
  const record = records[0]
  const expectedId = [
    "authorized-workspace-branch",
    record.precedingInstructionId,
    record.continuationInstructionId,
    record.head,
  ].join(":")
  if (record.reconciliationId !== expectedId) {
    return rejected("checkpoint_reconciliation_id")
  }
  const controls = listAgentControls(task.issue, task.comments)
  const receiptControls = controls.filter(
    (control) => control.instructionId === record.continuationInstructionId,
  )
  if (receiptControls.length !== 1) {
    return rejected("checkpoint_receipt_control_count", {
      controlCount: receiptControls.length,
    })
  }
  const cherryPickCommit = extractAuthorizedCherryPick(
    receiptControls[0].prompt,
    record.head,
  )
  if (!cherryPickCommit) return rejected("checkpoint_reviewed_scope")
  const receiptRuns = (state.runs ?? []).filter(
    (run) => run.instructionId === record.continuationInstructionId,
  )
  if (receiptRuns.length !== 1) {
    return rejected("checkpoint_receipt_run_count", {
      runCount: receiptRuns.length,
    })
  }
  const receiptIndex = state.runs.indexOf(receiptRuns[0])
  const completeTail = state.runs.slice(receiptIndex)
  const tail = completeTail.slice(
    0,
    checkpointHistoricalTailInstructionIds.length,
  )
  if (
    tail.length !== checkpointHistoricalTailInstructionIds.length ||
    new Set(tail.map((run) => run.instructionId)).size !== tail.length ||
    (expectedTailInstructionIds &&
      !sameStringArray(
        expectedTailInstructionIds,
        checkpointHistoricalTailInstructionIds,
      ))
  ) {
    return rejected("checkpoint_historical_tail_ambiguous")
  }
  if (
    !sameStringArray(
      tail.map((run) => run.instructionId),
      checkpointHistoricalTailInstructionIds,
    )
  ) {
    return rejected("checkpoint_historical_tail_scope")
  }
  const receiptChangedFiles = normalizedChangedFiles(receiptRuns[0].changedFiles)
  if (receiptChangedFiles.status !== "valid") {
    return rejected("checkpoint_changed_files_missing_or_invalid")
  }
  for (const run of tail) {
    if (
      run.originIssueNumber !== checkpointIssueNumber ||
      run.originIssueUrl !== state.task.originIssueUrl ||
      run.threadId !== state.threadId ||
      run.workspacePath !== state.workspacePath
    ) {
      return rejected("checkpoint_historical_origin_thread_workspace", {
        instructionId: run.instructionId,
      })
    }
    const contradiction = checkpointHistoricalContradictionDecision(
      run,
      record,
      receiptChangedFiles.files,
    )
    if (!contradiction.accepted) return contradiction
  }
  return accepted({
    record,
    cherryPickCommit,
    expectedChangedFiles: receiptChangedFiles.files,
    supersededTailInstructionIds: tail.map((run) => run.instructionId),
    historicalTailDigest: sha256(
      stableJson(
        tail.map((run) => ({
          instructionId: run.instructionId,
          runDigest: sha256(stableJson(run)),
        })),
      ),
    ),
    laterRuns: completeTail.slice(checkpointHistoricalTailInstructionIds.length),
  })
}

function checkpointControlDecision({ state, instruction, task }) {
  if (
    !state?.activeInstruction ||
    state.activeInstruction.instructionId !== instruction?.instructionId ||
    !new Set(["selected", "thread_ready"]).has(state.activeInstruction.phase) ||
    instruction.action !== "continue" ||
    instruction.taskState !== state.status ||
    instruction.ownerApprovalRequired
  ) {
    return rejected("checkpoint_instruction")
  }
  const controls = listAgentControls(task.issue, task.comments).filter(
    (control) => control.instructionId === instruction.instructionId,
  )
  if (
    controls.length !== 1 ||
    controls[0].action !== "continue" ||
    controls[0].prompt !== instruction.prompt ||
    controls[0].ownerApprovalRequired
  ) {
    return rejected("checkpoint_control", { controlCount: controls.length })
  }
  return accepted(controls[0])
}

function checkpointProposalBinding(record) {
  if (!record || record.kind !== "proposal") return null
  return {
    schemaVersion: record.schemaVersion,
    kind: record.kind,
    checkpointId: record.checkpointId,
    generation: record.generation,
    generationId: record.generationId,
    operationScope: record.operationScope,
    proposalInstructionId: record.proposalInstructionId,
    reconciliationId: record.reconciliationId,
    supersededTailInstructionIds: record.supersededTailInstructionIds,
    historicalTailDigest: record.historicalTailDigest,
    priorRejectedProposalInstructionIds:
      record.priorRejectedProposalInstructionIds,
    rejectedProposalAudit: record.rejectedProposalAudit,
    originIssueNumber: record.originIssueNumber,
    originIssueUrl: record.originIssueUrl,
    threadId: record.threadId,
    workspacePath: record.workspacePath,
    branch: record.branch,
    head: record.head,
    tree: record.tree,
    baseCommit: record.baseCommit,
    cherryPickCommit: record.cherryPickCommit,
    cherryPickParent: record.cherryPickParent,
    cherryPickTargetTree: record.cherryPickTargetTree,
    changedFilesDigest: record.changedFilesDigest,
    changedFileCount: record.changedFileCount,
    gitDirectory: record.gitDirectory,
    commonDirectory: record.commonDirectory,
    verification: record.verification,
    proposalControl: record.proposalControl,
    ownerActivationRequired: record.ownerActivationRequired,
  }
}

function checkpointGenerationId(binding) {
  return `git-reconciliation-checkpoint-generation:${sha256(
    JSON.stringify({
      version: checkpointGeneration,
      operationScope: binding.operationScope,
      proposalInstructionId: binding.proposalInstructionId,
      reconciliationId: binding.reconciliationId,
      supersededTailInstructionIds: binding.supersededTailInstructionIds,
      historicalTailDigest: binding.historicalTailDigest,
      rejectedProposalAuditDigest: binding.rejectedProposalAudit?.digest,
      originIssueNumber: binding.originIssueNumber,
      originIssueUrl: binding.originIssueUrl,
      threadId: binding.threadId,
      workspacePath: binding.workspacePath,
      branch: binding.branch,
      head: binding.head,
      tree: binding.tree,
      baseCommit: binding.baseCommit,
      cherryPickCommit: binding.cherryPickCommit,
      cherryPickParent: binding.cherryPickParent,
      cherryPickTargetTree: binding.cherryPickTargetTree,
      changedFilesDigest: binding.changedFilesDigest,
      gitDirectory: binding.gitDirectory,
      commonDirectory: binding.commonDirectory,
      proposalControl: binding.proposalControl,
    }),
  )}`
}

function validCheckpointGenerationAudit(audit) {
  const instructionIds = Array.isArray(audit?.instructionIds)
    ? audit.instructionIds
    : []
  const baseInstructionIds = instructionIds.slice(
    0,
    checkpointGenerationAuditInstructionIds.length,
  )
  const retryInstructionIds = instructionIds.slice(
    checkpointGenerationAuditInstructionIds.length,
  )
  if (
    !audit ||
    audit.schemaVersion !== 1 ||
    !sameStringArray(
      baseInstructionIds,
      checkpointGenerationAuditInstructionIds,
    ) ||
    retryInstructionIds.some(
      (instructionId, index) =>
        instructionId !==
        `production-day1-git-reconciliation-checkpoint-generation-proposal-${String(19 + index).padStart(3, "0")}`,
    ) ||
    new Set(instructionIds).size !== instructionIds.length ||
    !Array.isArray(audit.attempts) ||
    audit.attempts.length !== instructionIds.length ||
    typeof audit.digest !== "string" ||
    !/^[0-9a-f]{64}$/.test(audit.digest) ||
    checkpointGenerationAuditDigest(audit.attempts) !== audit.digest
  ) {
    return false
  }
  return audit.attempts.every(
    (attempt, index) =>
      attempt &&
      sameStringArray(Object.keys(attempt).sort(), [
        "cherryPickCommit",
        "head",
        "instructionId",
        "promptDigest",
        "reconciliationId",
        "rejectionCode",
        "runBindingDigest",
        "tree",
      ]) &&
      attempt.instructionId === instructionIds[index] &&
      (index < checkpointGenerationAuditInstructionIds.length
        ? attempt.rejectionCode ===
          checkpointGenerationAuditRejectionCodes.get(attempt.instructionId)
        : checkpointGenerationRetryRejectionCodes.has(
            attempt.rejectionCode,
          )) &&
      typeof attempt.reconciliationId === "string" &&
      fullShaPattern.test(attempt.head ?? "") &&
      fullShaPattern.test(attempt.tree ?? "") &&
      fullShaPattern.test(attempt.cherryPickCommit ?? "") &&
      /^[0-9a-f]{64}$/.test(attempt.promptDigest ?? "") &&
      /^[0-9a-f]{64}$/.test(attempt.runBindingDigest ?? ""),
  )
}

function checkpointProposalId(binding) {
  return `git-reconciliation-checkpoint:${sha256(
    JSON.stringify({
      version: binding.schemaVersion === 2 ? 2 : 1,
      ...(binding.schemaVersion === 2
        ? {
            generation: binding.generation,
            generationId: binding.generationId,
          }
        : {}),
      operationScope: binding.operationScope,
      proposalInstructionId: binding.proposalInstructionId,
      reconciliationId: binding.reconciliationId,
      supersededTailInstructionIds: binding.supersededTailInstructionIds,
      ...(binding.schemaVersion === 2
        ? { historicalTailDigest: binding.historicalTailDigest }
        : {}),
      priorRejectedProposalInstructionIds:
        binding.priorRejectedProposalInstructionIds,
      ...(binding.schemaVersion === 2
        ? { rejectedProposalAudit: binding.rejectedProposalAudit }
        : {}),
      originIssueNumber: binding.originIssueNumber,
      originIssueUrl: binding.originIssueUrl,
      threadId: binding.threadId,
      workspacePath: binding.workspacePath,
      branch: binding.branch,
      head: binding.head,
      tree: binding.tree,
      baseCommit: binding.baseCommit,
      cherryPickCommit: binding.cherryPickCommit,
      cherryPickParent: binding.cherryPickParent,
      cherryPickTargetTree: binding.cherryPickTargetTree,
      changedFilesDigest: binding.changedFilesDigest,
      gitDirectory: binding.gitDirectory,
      commonDirectory: binding.commonDirectory,
      proposalControl: binding.proposalControl,
    }),
  )}`
}

function checkpointActivationDecision({ state, instruction, task }) {
  const control = checkpointControlDecision({ state, instruction, task })
  if (!control.accepted) return control
  const checkpointId = instruction.prompt.match(
    /^The owner explicitly approves activation of superseding Git reconciliation checkpoint `(git-reconciliation-checkpoint:[0-9a-f]{64})`\.$/m,
  )?.[1]
  if (!checkpointId) return rejected("checkpoint_activation_prompt")

  const checkpoints = state.gitReconciliationCheckpoints
  if (!Array.isArray(checkpoints)) {
    return rejected("checkpoint_records_missing")
  }
  const proposals = checkpoints.filter((record) => record.kind === "proposal")
  const matches = proposals.filter(
    (record) => record.checkpointId === checkpointId,
  )
  if (proposals.length !== 1 || matches.length !== 1) {
    return rejected("checkpoint_proposal_count", {
      proposalCount: proposals.length,
      matchingProposalCount: matches.length,
    })
  }
  const proposal = matches[0]
  const generationProposal = proposal.schemaVersion === 2
  if (
    !new Set([1, 2]).has(proposal.schemaVersion) ||
    proposal.operationScope !== checkpointOperationScope ||
    proposal.ownerActivationRequired !== true ||
    !sameStringArray(
      proposal.supersededTailInstructionIds,
      checkpointHistoricalTailInstructionIds,
    ) ||
    !Array.isArray(proposal.priorRejectedProposalInstructionIds) ||
    proposal.priorRejectedProposalInstructionIds.some(
      (instructionId) =>
        typeof instructionId !== "string" || !instructionId,
    ) ||
    new Set(proposal.priorRejectedProposalInstructionIds).size !==
      proposal.priorRejectedProposalInstructionIds.length ||
    proposal.originIssueNumber !== checkpointIssueNumber ||
    proposal.originIssueUrl !== state.task.originIssueUrl ||
    proposal.threadId !== state.threadId ||
    proposal.workspacePath !== state.workspacePath ||
    proposal.branch !== state.branch ||
    proposal.branch !== checkpointBranch ||
    !fullShaPattern.test(proposal.head ?? "") ||
    !fullShaPattern.test(proposal.tree ?? "") ||
    !fullShaPattern.test(proposal.baseCommit ?? "") ||
    !fullShaPattern.test(proposal.cherryPickCommit ?? "") ||
    !fullShaPattern.test(proposal.cherryPickParent ?? "") ||
    !fullShaPattern.test(proposal.cherryPickTargetTree ?? "") ||
    typeof proposal.proposalControl?.promptDigest !== "string" ||
    checkpointProposalId(proposal) !== proposal.checkpointId ||
    !Number.isFinite(Date.parse(proposal.createdAt ?? ""))
  ) {
    return rejected("checkpoint_proposal_binding")
  }
  if (
    generationProposal &&
    (proposal.generation !== checkpointGeneration ||
      !/^git-reconciliation-checkpoint-generation:[0-9a-f]{64}$/.test(
        proposal.generationId ?? "",
      ) ||
      !/^[0-9a-f]{64}$/.test(proposal.historicalTailDigest ?? "") ||
      !validCheckpointGenerationAudit(proposal.rejectedProposalAudit) ||
      !sameStringArray(
        proposal.priorRejectedProposalInstructionIds,
        proposal.rejectedProposalAudit?.instructionIds,
      ) ||
      checkpointGenerationId(proposal) !== proposal.generationId)
  ) {
    return rejected("checkpoint_generation_binding")
  }
  if (
    !generationProposal &&
    (proposal.generation != null ||
      proposal.generationId != null ||
      proposal.rejectedProposalAudit != null)
  ) {
    return rejected("checkpoint_proposal_binding")
  }
  const proposalControls = listAgentControls(task.issue, task.comments).filter(
    (candidate) =>
      candidate.instructionId === proposal.proposalInstructionId,
  )
  const parsedProposalControl =
    proposalControls.length === 1
      ? parseCheckpointProposalPrompt(proposalControls[0].prompt)
      : null
  if (
    proposalControls.length !== 1 ||
    proposalControls[0].action !== "continue" ||
    proposalControls[0].taskState !== "needs_review" ||
    proposalControls[0].ownerApprovalRequired ||
    checkpointPromptDigest(proposalControls[0].prompt) !==
      proposal.proposalControl.promptDigest ||
    parsedProposalControl?.malformed ||
    !parsedProposalControl ||
    (generationProposal
      ? !checkpointReconciliationReferenceMatches(
          parsedProposalControl.reconciliationId,
          {
            reconciliationId: proposal.reconciliationId,
            continuationInstructionId: checkpointReceiptInstructionId,
          },
        )
      : parsedProposalControl.reconciliationId !==
        proposal.reconciliationId) ||
    parsedProposalControl.head !== proposal.head ||
    parsedProposalControl.tree !== proposal.tree ||
    parsedProposalControl.cherryPickCommit !== proposal.cherryPickCommit ||
    (generationProposal
      ? parsedProposalControl.generation !== checkpointGeneration ||
        !sameStringArray(
          parsedProposalControl.auditInstructionIds,
          checkpointGenerationAuditInstructionIds,
        )
      : parsedProposalControl.generation != null)
  ) {
    return rejected("checkpoint_proposal_control_binding", {
      controlCount: proposalControls.length,
    })
  }
  const expectedPrompt = gitReconciliationCheckpointActivationPrompt({
    checkpointId,
    reconciliationId: proposal.reconciliationId,
    head: proposal.head,
    tree: proposal.tree,
    cherryPickCommit: proposal.cherryPickCommit,
    ...(generationProposal
      ? {
          generation: proposal.generation,
          generationId: proposal.generationId,
        }
      : {}),
  })
  if (instruction.prompt !== expectedPrompt) {
    return rejected("checkpoint_activation_prompt_binding")
  }

  const context = checkpointContextDecision({
    state,
    task,
    expectedTailInstructionIds: proposal.supersededTailInstructionIds,
  })
  if (!context.accepted) return context
  if (
    context.value.record.reconciliationId !== proposal.reconciliationId ||
    context.value.record.head !== proposal.head ||
    context.value.cherryPickCommit !== proposal.cherryPickCommit ||
    (generationProposal &&
      context.value.historicalTailDigest !== proposal.historicalTailDigest) ||
    sha256(JSON.stringify(context.value.expectedChangedFiles)) !==
      proposal.changedFilesDigest ||
    context.value.expectedChangedFiles.length !== proposal.changedFileCount
  ) {
    return rejected("checkpoint_current_context_binding")
  }
  if (
    context.value.laterRuns.length !==
      proposal.priorRejectedProposalInstructionIds.length + 1 ||
    !sameStringArray(
      context.value.laterRuns
        .slice(0, -1)
        .map((run) => run.instructionId),
      proposal.priorRejectedProposalInstructionIds,
    ) ||
    context.value.laterRuns.at(-1)?.instructionId !==
      proposal.proposalInstructionId
  ) {
    return rejected("checkpoint_post_tail_run_count", {
      runCount: context.value.laterRuns.length,
    })
  }
  const priorAttempts = generationProposal
    ? checkpointGenerationAuditDecision({
        state,
        task,
        runs: context.value.laterRuns.slice(0, -1),
        record: context.value.record,
        expectedChangedFiles: context.value.expectedChangedFiles,
        expectedBinding: {
          head: proposal.head,
          tree: proposal.tree,
          cherryPickCommit: proposal.cherryPickCommit,
        },
        currentInstructionId: proposal.proposalInstructionId,
      })
    : rejectedCheckpointProposalTailDecision({
        state,
        task,
        runs: context.value.laterRuns.slice(0, -1),
        record: context.value.record,
        expectedChangedFiles: context.value.expectedChangedFiles,
        expectedBinding: {
          reconciliationId: proposal.reconciliationId,
          head: proposal.head,
          tree: proposal.tree,
          cherryPickCommit: proposal.cherryPickCommit,
        },
        currentInstructionId: proposal.proposalInstructionId,
      })
  if (!priorAttempts.accepted) return priorAttempts
  if (
    generationProposal &&
    JSON.stringify(priorAttempts.value) !==
      JSON.stringify(proposal.rejectedProposalAudit)
  ) {
    return rejected("checkpoint_generation_audit_drift")
  }
  const proposalRun = context.value.laterRuns.at(-1)
  const ownerReason = gitReconciliationCheckpointOwnerReason(proposal)
  const proposalChangedFiles = normalizedChangedFiles(proposalRun.changedFiles)
  if (
    proposalRun.status !== "needs_owner" ||
    proposalRun.turnCount !== 0 ||
    proposalRun.branch !== proposal.branch ||
    proposalRun.originIssueNumber !== proposal.originIssueNumber ||
    proposalRun.originIssueUrl !== proposal.originIssueUrl ||
    proposalRun.threadId !== proposal.threadId ||
    proposalRun.workspacePath !== proposal.workspacePath ||
    proposalRun.resultArtifact !== null ||
    proposalRun.ownerRequest?.method !==
      "control-plane/gitReconciliationCheckpointActivation" ||
    proposalRun.ownerRequest?.reason !== ownerReason ||
    !sameStringArray(proposalRun.ownerGates, [ownerReason]) ||
    proposalChangedFiles.status !== "valid" ||
    sha256(JSON.stringify(proposalChangedFiles.files)) !==
      proposal.changedFilesDigest ||
    !Array.isArray(proposalRun.commits) ||
    proposalRun.commits.length !== 1 ||
    proposalRun.commits[0] !== proposal.head ||
    !proposalRun.checks ||
    Object.keys(proposalRun.checks).length !== 6 ||
    Object.values(proposalRun.checks).some((status) => status !== "not_run") ||
    !Array.isArray(proposalRun.blockers) ||
    proposalRun.blockers.length !== 0 ||
    !Array.isArray(proposalRun.productionReadback) ||
    proposalRun.productionReadback.length !== 0 ||
    !Array.isArray(proposalRun.safetyFindings) ||
    proposalRun.safetyFindings.length !== 0 ||
    !Array.isArray(proposalRun.branchPushState) ||
    proposalRun.branchPushState.length !== 0
  ) {
    return rejected("checkpoint_proposal_run_binding")
  }

  const activationPromptDigest = checkpointPromptDigest(instruction.prompt)
  if (
    (state.runs ?? []).some(
      (run) => run.instructionId === instruction.instructionId,
    )
  ) {
    return rejected("checkpoint_activation_current_run_duplicate")
  }
  const activationId = `git-reconciliation-checkpoint-activation:${sha256(
    JSON.stringify({
      checkpointId,
      ...(generationProposal
        ? {
            generation: proposal.generation,
            generationId: proposal.generationId,
            historicalTailDigest: proposal.historicalTailDigest,
            rejectedProposalAuditDigest:
              proposal.rejectedProposalAudit.digest,
          }
        : {}),
      instructionId: instruction.instructionId,
      promptDigest: activationPromptDigest,
    }),
  )}`
  const activationRecords = checkpoints.filter(
    (record) => record.kind === "activation",
  )
  if (checkpoints.length !== proposals.length + activationRecords.length) {
    return rejected("checkpoint_record_kind")
  }
  const matchingActivations = activationRecords.filter(
    (record) => record.checkpointId === checkpointId,
  )
  if (matchingActivations.length > 1 || activationRecords.length > 1) {
    return rejected("checkpoint_activation_record_ambiguous", {
      activationCount: activationRecords.length,
      matchingActivationCount: matchingActivations.length,
    })
  }
  let activationRecord = matchingActivations[0] ?? null
  let isNew = false
  if (activationRecord) {
    if (
      activationRecord.schemaVersion !== proposal.schemaVersion ||
      activationRecord.activationId !== activationId ||
      activationRecord.activationInstructionId !== instruction.instructionId ||
      activationRecord.activationPromptDigest !== activationPromptDigest ||
      activationRecord.operationScope !== checkpointOperationScope ||
      activationRecord.originIssueNumber !== proposal.originIssueNumber ||
      activationRecord.threadId !== proposal.threadId ||
      activationRecord.workspacePath !== proposal.workspacePath ||
      activationRecord.branch !== proposal.branch ||
      activationRecord.head !== proposal.head ||
      activationRecord.tree !== proposal.tree ||
      activationRecord.cherryPickCommit !== proposal.cherryPickCommit ||
      activationRecord.cherryPickParent !== proposal.cherryPickParent ||
      activationRecord.cherryPickTargetTree !==
        proposal.cherryPickTargetTree ||
      (generationProposal &&
        (activationRecord.generation !== proposal.generation ||
          activationRecord.generationId !== proposal.generationId ||
          activationRecord.historicalTailDigest !==
            proposal.historicalTailDigest ||
          activationRecord.rejectedProposalAuditDigest !==
            proposal.rejectedProposalAudit.digest)) ||
      !Number.isFinite(Date.parse(activationRecord.activatedAt ?? ""))
    ) {
      return rejected("checkpoint_activation_record_conflict")
    }
  } else {
    isNew = true
    activationRecord = {
      schemaVersion: proposal.schemaVersion,
      kind: "activation",
      activationId,
      checkpointId,
      ...(generationProposal
        ? {
            generation: proposal.generation,
            generationId: proposal.generationId,
            historicalTailDigest: proposal.historicalTailDigest,
            rejectedProposalAuditDigest:
              proposal.rejectedProposalAudit.digest,
          }
        : {}),
      operationScope: checkpointOperationScope,
      activationInstructionId: instruction.instructionId,
      activationPromptDigest,
      originIssueNumber: proposal.originIssueNumber,
      originIssueUrl: proposal.originIssueUrl,
      threadId: proposal.threadId,
      workspacePath: proposal.workspacePath,
      branch: proposal.branch,
      head: proposal.head,
      tree: proposal.tree,
      cherryPickCommit: proposal.cherryPickCommit,
      cherryPickParent: proposal.cherryPickParent,
      cherryPickTargetTree: proposal.cherryPickTargetTree,
      activatedAt: null,
    }
  }
  return accepted({
    record: context.value.record,
    cherryPickCommit: context.value.cherryPickCommit,
    provenanceMode: "superseding_checkpoint",
    interveningExecutionInstructionIds:
      context.value.supersededTailInstructionIds,
    checkpointProposal: proposal,
    checkpointActivation: activationRecord,
    checkpointActivationIsNew: isNew,
  })
}

function authorizationDecision({ state, instruction, task }) {
  if (
    gitReconciliationCheckpointInstructionKind(instruction) === "activation"
  ) {
    return checkpointActivationDecision({ state, instruction, task })
  }
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
  stageOperation = async (_stage, operation) => operation(),
}) {
  const [normalizedWorkspace, normalizedRoot, normalizedCheckout] =
    await stageOperation("metadata_path_normalization", () => [
      path.resolve(workspacePath),
      path.resolve(workspaceRoot),
      path.resolve(checkoutPath),
    ])
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
    !(await stageOperation("metadata_workspace_root_type", () =>
      regularPath(normalizedRoot, "directory"),
    ))
  ) {
    return rejected("activation_metadata_path_type")
  }
  if (
    !(await stageOperation("metadata_workspace_type", () =>
      regularPath(normalizedWorkspace, "directory"),
    ))
  ) {
    return rejected("activation_metadata_path_type")
  }
  if (
    !(await stageOperation("metadata_checkout_type", () =>
      regularPath(normalizedCheckout, "directory"),
    ))
  ) {
    return rejected("activation_metadata_path_type")
  }
  const [rootReal, workspaceReal, checkoutReal] = await Promise.all([
    stageOperation("metadata_workspace_root_realpath", () =>
      realpath(normalizedRoot),
    ),
    stageOperation("metadata_workspace_realpath", () =>
      realpath(normalizedWorkspace),
    ),
    stageOperation("metadata_checkout_realpath", () =>
      realpath(normalizedCheckout),
    ),
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
    !(await stageOperation("metadata_workspace_git_file_type", () =>
      regularPath(workspaceGitFile, "file"),
    ))
  ) {
    return rejected("activation_metadata_git_path_type")
  }
  if (
    !(await stageOperation("metadata_checkout_git_directory_type", () =>
      regularPath(checkoutGitDirectory, "directory"),
    ))
  ) {
    return rejected("activation_metadata_git_path_type")
  }
  const pointer = await stageOperation("metadata_workspace_git_pointer", () =>
    readSmallFile(workspaceGitFile),
  )
  const pointerMatch = pointer?.match(/^gitdir: ([^\r\n]+)\r?\n?$/)
  if (!pointerMatch) return rejected("activation_metadata_git_pointer")
  const pointerTarget = path.isAbsolute(pointerMatch[1])
    ? path.normalize(pointerMatch[1])
    : path.resolve(workspaceReal, pointerMatch[1])

  const [gitDirectoryOutput, commonDirectoryOutput, checkoutCommonOutput] =
    await Promise.all([
      stageOperation("metadata_git_directory_lookup", () =>
        git(
          ["rev-parse", "--path-format=absolute", "--git-dir"],
          workspaceReal,
        ),
      ),
      stageOperation("metadata_common_directory_lookup", () =>
        git(
          ["rev-parse", "--path-format=absolute", "--git-common-dir"],
          workspaceReal,
        ),
      ),
      stageOperation("metadata_checkout_common_directory_lookup", () =>
        git(
          ["rev-parse", "--path-format=absolute", "--git-common-dir"],
          checkoutReal,
        ),
      ),
    ])
  const [gitDirectory, commonDirectory, checkoutCommonDirectory] =
    await Promise.all([
      stageOperation("metadata_git_directory_realpath", () =>
        realpath(gitDirectoryOutput),
      ),
      stageOperation("metadata_common_directory_realpath", () =>
        realpath(commonDirectoryOutput),
      ),
      stageOperation("metadata_checkout_common_directory_realpath", () =>
        realpath(checkoutCommonOutput),
      ),
    ])
  if (
    pointerTarget !== gitDirectory ||
    commonDirectory !== checkoutCommonDirectory ||
    commonDirectory !== checkoutGitDirectory
  ) {
    return rejected("activation_metadata_git_resolution")
  }
  if (
    !(await stageOperation("metadata_git_directory_type", () =>
      regularPath(gitDirectory, "directory"),
    ))
  ) {
    return rejected("activation_metadata_git_resolution")
  }
  if (
    !(await stageOperation("metadata_common_directory_type", () =>
      regularPath(commonDirectory, "directory"),
    ))
  ) {
    return rejected("activation_metadata_git_resolution")
  }

  const worktreesDirectory = path.join(commonDirectory, "worktrees")
  if (
    !(await stageOperation("metadata_worktrees_directory_type", () =>
      regularPath(worktreesDirectory, "directory"),
    )) ||
    path.dirname(gitDirectory) !== worktreesDirectory ||
    !exactPathWithin(worktreesDirectory, gitDirectory)
  ) {
    return rejected("activation_metadata_worktree_boundary")
  }
  const worktreeName = path.basename(gitDirectory)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(worktreeName)) {
    return rejected("activation_metadata_worktree_name")
  }

  const commonPointer = await stageOperation("metadata_common_pointer", () =>
    readSmallFile(path.join(gitDirectory, "commondir")),
  )
  const workspacePointer = await stageOperation(
    "metadata_workspace_back_pointer",
    () => readSmallFile(path.join(gitDirectory, "gitdir")),
  )
  if (
    commonPointer?.trim() !== "../.." ||
    path.normalize(workspacePointer?.trim() ?? "") !== workspaceGitFile
  ) {
    return rejected("activation_metadata_back_pointer")
  }
  const resolvedCommonPointer = await stageOperation(
    "metadata_common_pointer_realpath",
    () => realpath(path.resolve(gitDirectory, commonPointer?.trim() ?? "")),
  )
  if (resolvedCommonPointer !== commonDirectory) {
    return rejected("activation_metadata_back_pointer")
  }
  const resolvedWorkspacePointer = await stageOperation(
    "metadata_workspace_back_pointer_realpath",
    () => realpath(path.normalize(workspacePointer?.trim() ?? "")),
  )
  if (resolvedWorkspacePointer !== workspaceGitFile) {
    return rejected("activation_metadata_back_pointer")
  }

  const [branch, head, status, branchHead, commitType] = await Promise.all([
    stageOperation("metadata_branch_lookup", () =>
      git(["branch", "--show-current"], workspaceReal),
    ),
    stageOperation("metadata_head_lookup", () =>
      git(["rev-parse", "HEAD"], workspaceReal),
    ),
    stageOperation("metadata_status_lookup", () =>
      git(["status", "--porcelain=v1", "-z"], workspaceReal, {
        trim: false,
      }),
    ),
    stageOperation("metadata_branch_head_lookup", () =>
      git(["rev-parse", `refs/heads/${state.branch}`], workspaceReal),
    ),
    stageOperation("metadata_target_commit_lookup", () =>
      git(["cat-file", "-t", `${cherryPickCommit}^{commit}`], workspaceReal),
    ),
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
    if (
      await stageOperation("metadata_operation_marker_lookup", () =>
        optionalPathExists(path.join(gitDirectory, marker)),
      )
    ) {
      return rejected("activation_metadata_operation_marker")
    }
  }
  for (const directory of gitOperationDirectories) {
    if (
      await stageOperation("metadata_operation_directory_lookup", () =>
        optionalPathExists(path.join(gitDirectory, directory)),
      )
    ) {
      return rejected("activation_metadata_operation_directory")
    }
  }

  const objectsDirectory = path.join(commonDirectory, "objects")
  const objectsIsDirectory = await stageOperation(
    "metadata_objects_directory_type",
    () => regularPath(objectsDirectory, "directory"),
  )
  if (!objectsIsDirectory) {
    return rejected("activation_metadata_symlink_or_objects")
  }
  const gitDirectoryHasSymlink = await stageOperation(
    "metadata_git_directory_symlink_scan",
    () => treeContainsSymlink(gitDirectory),
  )
  if (gitDirectoryHasSymlink) {
    return rejected("activation_metadata_symlink_or_objects")
  }
  const objectsHaveSymlink = await stageOperation(
    "metadata_objects_symlink_scan",
    () => treeContainsSymlink(objectsDirectory),
  )
  if (objectsHaveSymlink) {
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
    !(await stageOperation("metadata_branch_ref_type", () =>
      regularPath(branchRef, "file"),
    )) ||
    (
      await stageOperation("metadata_branch_ref_read", () =>
        readSmallFile(branchRef),
      )
    )?.trim() !== record.head
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
  const branchLogExists = await stageOperation(
    "metadata_branch_log_lookup",
    () => optionalPathExists(branchLog),
  )
  if (
    branchLogExists &&
    !(await stageOperation("metadata_branch_log_type", () =>
      regularPath(branchLog, "file"),
    ))
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

async function checkpointFreshVerificationDecision({
  state,
  workspacePath,
  workspaceRoot,
  checkoutPath,
  baseRef,
  repository,
  pullRequestLookup,
  context,
  expectedTree,
  stageOperation = async (_stage, operation) => operation(),
}) {
  const metadata = await linkedWorktreeMetadataDecision({
    state,
    workspacePath,
    workspaceRoot,
    checkoutPath,
    record: context.record,
    cherryPickCommit: context.cherryPickCommit,
    stageOperation,
  })
  if (!metadata.accepted) return metadata
  if (!fullShaPattern.test(expectedTree ?? "")) {
    return rejected("checkpoint_tree_invalid")
  }
  const [
    tree,
    baseCommit,
    mergeBase,
    commitsAboveHead,
    changedFiles,
    remote,
    diffCheck,
    cherryPickParent,
    cherryPickParentTree,
    cherryPickTargetTree,
    pullRequestNumbers,
  ] = await Promise.all([
      stageOperation("current_tree_lookup", () =>
        git(["rev-parse", "HEAD^{tree}"], workspacePath),
      ),
      stageOperation("base_ref_lookup", () =>
        git(["rev-parse", baseRef], workspacePath),
      ),
      stageOperation("merge_base_lookup", () =>
        git(["merge-base", baseRef, "HEAD"], workspacePath),
      ),
      stageOperation("commits_above_reviewed_head_lookup", () =>
        git(
          ["rev-list", "--count", `${context.record.head}..HEAD`],
          workspacePath,
        ),
      ),
      stageOperation("changed_files_lookup", () =>
        git(["diff", "--name-only", `${baseRef}...HEAD`], workspacePath),
      ),
      stageOperation("remote_branch_lookup", () =>
        git(
          [
            "ls-remote",
            "--heads",
            "origin",
            `refs/heads/${checkpointBranch}`,
          ],
          workspacePath,
        ),
      ),
      stageOperation("diff_check", () =>
        git(["diff", "--check"], workspacePath),
      ),
      stageOperation("cherry_pick_parent_lookup", () =>
        git(["rev-parse", `${context.cherryPickCommit}^`], workspacePath),
      ),
      stageOperation("cherry_pick_parent_tree_lookup", () =>
        git(
          ["rev-parse", `${context.cherryPickCommit}^1^{tree}`],
          workspacePath,
        ),
      ),
      stageOperation("cherry_pick_target_tree_lookup", () =>
        git(
          ["rev-parse", `${context.cherryPickCommit}^{tree}`],
          workspacePath,
        ),
      ),
      stageOperation("pull_request_lookup", () =>
        pullRequestLookup({
          repository,
          branch: checkpointBranch,
          cwd: workspacePath,
        }),
      ),
    ])
  if (tree !== expectedTree) return rejected("checkpoint_tree_drift")
  if (!fullShaPattern.test(baseCommit) || mergeBase !== baseCommit) {
    return rejected("checkpoint_lineage")
  }
  if (commitsAboveHead !== "0") {
    return rejected("checkpoint_commits_above_reviewed_head")
  }
  if (
    diffCheck !== "" ||
    !fullShaPattern.test(cherryPickParent) ||
    cherryPickParentTree !== tree ||
    !fullShaPattern.test(cherryPickTargetTree) ||
    cherryPickTargetTree === tree
  ) {
    return rejected("checkpoint_reviewed_commit_lineage")
  }
  const actualChangedFiles = changedFiles.split("\n").filter(Boolean).sort()
  if (!sameStringArray(actualChangedFiles, context.expectedChangedFiles)) {
    return rejected("checkpoint_changed_files_drift", {
      changedFileCount: actualChangedFiles.length,
      expectedChangedFileCount: context.expectedChangedFiles.length,
    })
  }
  if (remote !== "") {
    return rejected("checkpoint_remote_branch_present")
  }
  if (!Array.isArray(pullRequestNumbers) || pullRequestNumbers.length !== 0) {
    return rejected("checkpoint_pull_request_present", {
      pullRequestCount: Array.isArray(pullRequestNumbers)
        ? pullRequestNumbers.length
        : -1,
    })
  }
  return accepted({
    metadata: metadata.value,
    tree,
    baseCommit,
    mergeBase,
    cherryPickParent,
    cherryPickTargetTree,
    commitsAboveReviewedHead: 0,
    changedFiles: actualChangedFiles,
    remoteIntegrationBranch: "absent",
    pullRequestCount: 0,
    dirty: false,
    operationMarkers: [],
  })
}

export async function proposeGitReconciliationCheckpoint({
  state,
  instruction,
  task,
  workspacePath,
  workspaceRoot,
  checkoutPath,
  repository,
  baseRef,
  now = new Date(),
  pullRequestLookup = githubPullRequestNumbers,
  onDiagnostic = null,
}) {
  if (
    gitReconciliationCheckpointInstructionKind(instruction) !== "proposal"
  ) {
    return null
  }
  const finish = (decision) => reportDecision(decision, onDiagnostic)
  try {
    if (repository !== "Sillyquack/koalafrog-hq") {
      return finish(rejected("checkpoint_repository"))
    }
    const parsed = await checkpointProposalStage("proposal_prompt_parse", () =>
      parseCheckpointProposalPrompt(instruction.prompt),
    )
    if (!parsed || parsed.malformed) {
      return finish(rejected("checkpoint_proposal_prompt"))
    }
    const control = await checkpointProposalStage("control_validation", () =>
      checkpointControlDecision({ state, instruction, task }),
    )
    if (!control.accepted) return finish(control)
    const context = await checkpointProposalStage(
      "historical_tail_validation",
      () => checkpointContextDecision({ state, task }),
    )
    if (!context.accepted) return finish(context)
    const generationProposal = parsed.generation === checkpointGeneration
    if (
      (generationProposal
        ? !checkpointReconciliationReferenceMatches(
            parsed.reconciliationId,
            context.value.record,
          )
        : parsed.reconciliationId !==
          context.value.record.reconciliationId) ||
      parsed.head !== context.value.record.head ||
      parsed.cherryPickCommit !== context.value.cherryPickCommit
    ) {
      return finish(rejected("checkpoint_proposal_scope_binding"))
    }
    const priorAttempts = generationProposal
      ? checkpointGenerationAuditDecision({
          state,
          task,
          runs: context.value.laterRuns,
          record: context.value.record,
          expectedChangedFiles: context.value.expectedChangedFiles,
          expectedBinding: parsed,
          currentInstructionId: instruction.instructionId,
        })
      : rejectedCheckpointProposalTailDecision({
          state,
          task,
          runs: context.value.laterRuns,
          record: context.value.record,
          expectedChangedFiles: context.value.expectedChangedFiles,
          expectedBinding: parsed,
          currentInstructionId: instruction.instructionId,
        })
    if (!priorAttempts.accepted) return finish(priorAttempts)
    const fresh = await checkpointFreshVerificationDecision({
      state,
      workspacePath,
      workspaceRoot,
      checkoutPath,
      baseRef,
      repository,
      pullRequestLookup,
      context: context.value,
      expectedTree: parsed.tree,
      stageOperation: checkpointProposalStage,
    })
    if (!fresh.accepted) return finish(fresh)

    const changedFilesDigest = await checkpointProposalStage(
      "changed_files_hash",
      () => sha256(JSON.stringify(context.value.expectedChangedFiles)),
    )
    const proposalPromptDigest = await checkpointProposalStage(
      "proposal_prompt_hash",
      () => checkpointPromptDigest(instruction.prompt),
    )

    const binding = {
      schemaVersion: generationProposal ? 2 : 1,
      kind: "proposal",
      checkpointId: null,
      ...(generationProposal
        ? {
            generation: checkpointGeneration,
            generationId: null,
          }
        : {}),
      operationScope: checkpointOperationScope,
      proposalInstructionId: instruction.instructionId,
      reconciliationId: context.value.record.reconciliationId,
      supersededTailInstructionIds:
        context.value.supersededTailInstructionIds,
      ...(generationProposal
        ? { historicalTailDigest: context.value.historicalTailDigest }
        : {}),
      priorRejectedProposalInstructionIds:
        generationProposal
          ? priorAttempts.value.instructionIds
          : priorAttempts.value.instructionIds,
      ...(generationProposal
        ? { rejectedProposalAudit: priorAttempts.value }
        : {}),
      originIssueNumber: checkpointIssueNumber,
      originIssueUrl: state.task.originIssueUrl,
      threadId: state.threadId,
      workspacePath: state.workspacePath,
      branch: state.branch,
      head: context.value.record.head,
      tree: fresh.value.tree,
      baseCommit: fresh.value.baseCommit,
      cherryPickCommit: context.value.cherryPickCommit,
      cherryPickParent: fresh.value.cherryPickParent,
      cherryPickTargetTree: fresh.value.cherryPickTargetTree,
      changedFilesDigest,
      changedFileCount: context.value.expectedChangedFiles.length,
      gitDirectory: fresh.value.metadata.gitDirectory,
      commonDirectory: fresh.value.metadata.commonDirectory,
      verification: {
        dirty: false,
        commitsAboveReviewedHead: 0,
        mergeBase: fresh.value.mergeBase,
        operationMarkers: [],
        remoteIntegrationBranch: "absent",
        pullRequestCount: 0,
      },
      proposalControl: {
        instructionId: instruction.instructionId,
        promptDigest: proposalPromptDigest,
      },
      ownerActivationRequired: true,
    }
    if (generationProposal) {
      binding.generationId = await checkpointProposalStage(
        "generation_id_hash",
        () => checkpointGenerationId(binding),
      )
    }
    binding.checkpointId = await checkpointProposalStage(
      "checkpoint_id_hash",
      () => checkpointProposalId(binding),
    )
    const record = {
      ...binding,
      createdAt: await checkpointProposalStage(
        "checkpoint_timestamp_serialization",
        () => now.toISOString(),
      ),
    }
    const checkpoints = await checkpointProposalStage(
      "checkpoint_state_validation",
      () => state.gitReconciliationCheckpoints ?? [],
    )
    if (!Array.isArray(checkpoints)) {
      return finish(rejected("checkpoint_records_invalid"))
    }
    const proposals = await checkpointProposalStage(
      "checkpoint_state_validation",
      () =>
        checkpoints.filter((checkpoint) => checkpoint.kind === "proposal"),
    )
    if (proposals.length > 1) {
      return finish(
        rejected("checkpoint_proposal_ambiguous", {
          proposalCount: proposals.length,
        }),
      )
    }
    if (proposals.length === 1) {
      const sameProposal = await checkpointProposalStage(
        "checkpoint_record_comparison",
        () =>
          proposals[0].checkpointId === record.checkpointId &&
          JSON.stringify(checkpointProposalBinding(proposals[0])) ===
            JSON.stringify(checkpointProposalBinding(record)),
      )
      if (!sameProposal) {
        return finish(rejected("checkpoint_proposal_conflict"))
      }
      return accepted({
        record: proposals[0],
        isNew: false,
        verification: fresh.value,
      })
    }
    if (checkpoints.length !== 0) {
      return finish(rejected("checkpoint_record_without_proposal"))
    }
    return accepted({ record, isNew: true, verification: fresh.value })
  } catch (error) {
    return finish(
      rejected("checkpoint_proposal_exception", {
        ...checkpointProposalExceptionDiagnostic(error),
      }),
    )
  }
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
  pullRequestLookup = githubPullRequestNumbers,
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
    if (authorization.value.provenanceMode === "superseding_checkpoint") {
      const proposal = authorization.value.checkpointProposal
      const context = {
        record: authorization.value.record,
        cherryPickCommit: authorization.value.cherryPickCommit,
        expectedChangedFiles: null,
      }
      const changedFiles = normalizedChangedFiles(
        state.runs.find(
          (run) =>
            run.instructionId ===
            authorization.value.record.continuationInstructionId,
        )?.changedFiles,
      )
      if (changedFiles.status !== "valid") {
        reportDecision(
          rejected("checkpoint_activation_changed_files"),
          onDiagnostic,
        )
        return null
      }
      context.expectedChangedFiles = changedFiles.files
      const fresh = await checkpointFreshVerificationDecision({
        state,
        workspacePath,
        workspaceRoot,
        checkoutPath,
        baseRef,
        repository,
        pullRequestLookup,
        context,
        expectedTree: proposal.tree,
      })
      if (!fresh.accepted) {
        reportDecision(fresh, onDiagnostic)
        return null
      }
      if (
        proposal.baseCommit !== fresh.value.baseCommit ||
        proposal.cherryPickParent !== fresh.value.cherryPickParent ||
        proposal.cherryPickTargetTree !== fresh.value.cherryPickTargetTree ||
        proposal.verification?.mergeBase !== fresh.value.mergeBase ||
        proposal.verification?.commitsAboveReviewedHead !== 0 ||
        proposal.verification?.remoteIntegrationBranch !== "absent" ||
        proposal.verification?.pullRequestCount !== 0 ||
        proposal.verification?.dirty !== false ||
        !sameStringArray(proposal.verification?.operationMarkers, []) ||
        proposal.gitDirectory !== fresh.value.metadata.gitDirectory ||
        proposal.commonDirectory !== fresh.value.metadata.commonDirectory ||
        proposal.changedFilesDigest !==
          sha256(JSON.stringify(fresh.value.changedFiles)) ||
        proposal.changedFileCount !== fresh.value.changedFiles.length
      ) {
        reportDecision(
          rejected("checkpoint_activation_fresh_binding"),
          onDiagnostic,
        )
        return null
      }
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
          : authorization.value.provenanceMode === "superseding_checkpoint"
            ? "activation_historical_run_structured_no_mutation_evidence"
            : null,
      reconciliationInstructionId:
        authorization.value.record.continuationInstructionId,
      interveningExecutionInstructionIds:
        authorization.value.interveningExecutionInstructionIds,
      checkpointId:
        authorization.value.checkpointProposal?.checkpointId ?? null,
      checkpointGeneration:
        authorization.value.checkpointProposal?.generation ?? null,
      checkpointGenerationId:
        authorization.value.checkpointProposal?.generationId ?? null,
      checkpointActivation:
        authorization.value.checkpointActivation ?? null,
      checkpointActivationIsNew:
        authorization.value.checkpointActivationIsNew ?? false,
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
