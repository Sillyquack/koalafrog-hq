import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { AppServerClient } from "./app-server.mjs"
import {
  completeCheckpointOwnerGateAcknowledgement,
  completeOwnerApprovedAction,
  consumeOwnerApprovalDecision,
  recordPendingApprovalRequest,
  registerCheckpointOwnerGateAcknowledgement,
  registerOwnerApprovalDecisions,
  supersedePendingApprovalRequests,
} from "./approval-decisions.mjs"
import {
  agentResultBindingDigest,
  agentResultPublicationDecision,
  controlPlaneBindingDigest,
  findExistingResult,
  findExistingPickup,
  formatCompletionPacket,
  formatPickupPacket,
  listAgentControls,
  ownerGateReason,
  shouldConsumeInstruction,
} from "./control-plane.mjs"
import { GithubControlPlane } from "./github-control-plane.mjs"
import {
  authorizedGitExecutionBoundary,
  durableTaskInstructionDecision,
  gitExecutionBoundaryIsCurrent,
  gitExecutionBoundaryPrompt,
  gitExecutionBoundaryRequestDecision,
  executeGitReconciliationCheckpointMutation,
  gitReconciliationCheckpointInstructionKind,
  gitReconciliationCheckpointOwnerReason,
  prepareGitReconciliationCheckpointExecution,
  proposeGitReconciliationCheckpoint,
  recoverCompletedCheckpointActivation,
} from "./git-execution-boundary.mjs"
import {
  checksFromResultArtifact,
  resultArtifactFromTurnResult,
  resultCheckNames,
} from "./result-artifact.mjs"
import { extractIssueNumber } from "./repository-discovery.mjs"
import {
  recordTaskOrigin,
  redactForLog,
  StateStore,
} from "./state-store.mjs"
import {
  canStartInstructionTurn,
  instructionTurnCount,
  normalizeTurnAccounting,
  recordInstructionTurnStarted,
} from "./turn-accounting.mjs"
import {
  assertAllowedChanges,
  commitWorkspaceChanges,
  ensureWorkspace,
  inspectWorkspace,
  validateWorkspace,
} from "./workspace.mjs"

const safetyInstructions = `You are running under the Koalafrog local orchestrator.
Work only in the provided isolated Git worktree. Do not deploy, apply production
migrations, modify production data, expose credentials, make purchases, create
external accounts, force-push, merge, or modify unrelated product-domain code.
If owner input or approval is required, request it explicitly and stop. The
orchestrator owns GitHub control-plane comments; do not post to GitHub yourself.`

function promptForInstruction(instruction, allowedPaths) {
  const scope = allowedPaths.length
    ? `\nFor this acceptance run, you may change only:\n${allowedPaths
        .map((file) => `- ${file}`)
        .join("\n")}`
    : ""
  return `${instruction.prompt}\n\n${safetyInstructions}${scope}\n\nRun git diff --check before finishing and summarize the change and validation.`
}

function activeCheckpointRecoveryRecordDecision(state) {
  const active = state.activeInstruction
  const binding = active?.checkpointActivationRecovery ?? null
  if (!binding || typeof binding.recoveryId !== "string") {
    return { accepted: false, code: "result_correction_recovery_binding" }
  }
  const records = (state.checkpointActivationRecoveries ?? []).filter(
    (record) => record?.recoveryId === binding.recoveryId,
  )
  if (
    records.length !== 1 ||
    records[0].status !== "boundary_activated" ||
    records[0].completedAt !== null ||
    !Number.isFinite(Date.parse(records[0].boundaryActivatedAt ?? "")) ||
    records[0].turnId !== active.turnId ||
    typeof active.turnId !== "string" ||
    !active.turnId ||
    !Number.isFinite(Date.parse(active.turnStartedAt ?? "")) ||
    Object.entries(binding).some(
      ([key, value]) => JSON.stringify(records[0][key]) !== JSON.stringify(value),
    )
  ) {
    return { accepted: false, code: "result_correction_recovery_record" }
  }
  return { accepted: true, record: records[0], binding }
}

function compactOwnerQuestion(request) {
  if (!request) return null
  const lines = [
    String(request.reason ?? `Codex requested ${request.method}`),
    `Method: ${request.method ?? "unknown"}`,
  ]
  if (request.serverName) lines.push(`Server: ${request.serverName}`)
  if (request.toolName) lines.push(`Tool: ${request.toolName}`)
  if (request.arguments !== null && request.arguments !== undefined) {
    lines.push(`Arguments: ${JSON.stringify(request.arguments)}`)
  }
  if (request.details && Object.keys(request.details).length) {
    lines.push(`Request details: ${JSON.stringify(request.details)}`)
  }
  return String(redactForLog(lines.join("\n"))).slice(0, 8_000)
}

function compactOwnerRequest(request) {
  if (!request) return null
  return redactForLog({
    requestId: request.requestId ?? null,
    method: request.method ?? null,
    threadId: request.threadId ?? null,
    turnId: request.turnId ?? null,
    itemId: request.itemId ?? null,
    serverName: request.serverName ?? null,
    toolName: request.toolName ?? null,
    arguments: request.arguments ?? null,
    details: request.details ?? null,
    reason: String(request.reason ?? `Codex requested ${request.method}`).slice(
      0,
      2_000,
    ),
  })
}

function uniformChecks(status) {
  return Object.fromEntries(resultCheckNames.map((name) => [name, status]))
}

function checkpointProposalExceptionEventFields(diagnostic) {
  if (diagnostic?.code !== "checkpoint_proposal_exception") return {}
  const fields = {}
  if (/^[a-z][a-z0-9_]{0,79}$/.test(diagnostic.stage ?? "")) {
    fields.stage = diagnostic.stage
  }
  if (/^[a-z][a-z0-9_]{0,47}$/.test(diagnostic.reason ?? "")) {
    fields.reason = diagnostic.reason
  }
  if (
    /^(?:EACCES|ELOOP|ENAMETOOLONG|ENOENT|ENOTDIR|EPERM|CHECKPOINT_INVALID_RESULT|exit_[0-9]{1,3})$/.test(
      diagnostic.errorCode ?? "",
    )
  ) {
    fields.errorCode = diagnostic.errorCode
  }
  return fields
}

function taskIssueUrl(task) {
  return task.issue?.html_url ?? task.issue?.display_url ?? task.issue?.url ?? null
}

function explicitlyAuthorizesBranchTransition(prompt, branch, head, finalMessage) {
  if (
    typeof prompt !== "string" ||
    !prompt.includes(head) ||
    !/\bowner\b[\s\S]{0,160}\bexplicit(?:ly)?\b[\s\S]{0,80}\b(?:approv(?:e|ed|es|al)|authoriz(?:e|ed|es|ation))\b/i.test(
      prompt,
    ) ||
    !/\bstarting exactly from\b/i.test(prompt)
  ) {
    return false
  }

  if (prompt.includes(branch)) {
    return /\b(?:create|switch|use)\b[\s\S]{0,160}\b(?:integration\s+)?branch\b/i.test(
      prompt,
    )
  }

  return Boolean(
    typeof finalMessage === "string" &&
      finalMessage.includes(branch) &&
      /\bcreate\s*\/\s*switch\b[\s\S]{0,160}\bnew integration branch\b/i.test(
        prompt,
      ),
  )
}

function runHasWorkspaceContinuity(run, state) {
  return Boolean(
    run &&
      run.threadId === state.threadId &&
      run.originIssueNumber === state.task.originIssueNumber &&
      run.originIssueUrl === state.task.originIssueUrl &&
      (!Object.hasOwn(run, "workspacePath") ||
        run.workspacePath === null ||
        run.workspacePath === state.workspacePath),
  )
}

function hasOnlyNotRunChecks(checks) {
  return Boolean(
    checks &&
      resultCheckNames.every((name) => checks[name] === "not_run") &&
      Object.keys(checks).every((name) => resultCheckNames.includes(name)),
  )
}

function isEmptyArray(value) {
  return Array.isArray(value) && value.length === 0
}

function hasNoChangedFileMutationEvidence(run) {
  return Boolean(
    run &&
      (!Object.hasOwn(run, "changedFiles") ||
        run.changedFiles === null ||
        isEmptyArray(run.changedFiles)),
  )
}

const explicitOwnerGateReason =
  "The control-plane instruction explicitly requires owner approval."
const classifiedOwnerGatePrefix =
  "The instruction requests an owner-gated action: "

function normalizedGateClause(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 2_000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  ) {
    return null
  }
  return value.replace(/\s+/g, " ").trim() || null
}

function hasDurableOwnerGateBinding(control, durableReason) {
  const currentReason = control ? ownerGateReason(control) : null
  if (!currentReason) return false

  if (control.ownerApprovalRequired) {
    return (
      currentReason === explicitOwnerGateReason &&
      durableReason === explicitOwnerGateReason
    )
  }
  if (
    !currentReason.startsWith(classifiedOwnerGatePrefix) ||
    typeof durableReason !== "string" ||
    !durableReason.startsWith(classifiedOwnerGatePrefix)
  ) {
    return false
  }

  const durableClause = normalizedGateClause(
    durableReason.slice(classifiedOwnerGatePrefix.length),
  )
  if (!durableClause) return false
  const matchingClauses = control.prompt
    .split(/(?<=[.!?])\s+|\n+/)
    .map(normalizedGateClause)
    .filter((clause) => clause === durableClause)
  return matchingClauses.length === 1
}

function isProvablyNonMutatingRun({ run, control, state, workspace }) {
  const durableGate = run?.ownerRequest?.reason
  return Boolean(
    runHasWorkspaceContinuity(run, state) &&
      control?.action === "continue" &&
      hasDurableOwnerGateBinding(control, durableGate) &&
      run.status === "needs_owner" &&
      run.branch === workspace.expectedBranch &&
      isEmptyArray(run.commits) &&
      run.turnCount === 0 &&
      run.resultArtifact === null &&
      run.ownerRequest?.method === "control-plane/ownerGate" &&
      hasOnlyNotRunChecks(run.checks) &&
      isEmptyArray(run.blockers) &&
      Array.isArray(run.ownerGates) &&
      run.ownerGates.length === 1 &&
      run.ownerGates[0] === durableGate &&
      isEmptyArray(run.productionReadback) &&
      isEmptyArray(run.safetyFindings) &&
      isEmptyArray(run.branchPushState) &&
      hasNoChangedFileMutationEvidence(run),
  )
}

function checkHasFailedCommandEvidence(check) {
  return Boolean(
    check?.status === "fail" &&
      Array.isArray(check.evidence) &&
      check.evidence.some(
        (evidence) =>
          evidence?.source === "command_execution" &&
          evidence.status === "fail",
      ),
  )
}

function hasFailedCommandEvidence(resultArtifact) {
  const checks = resultArtifact?.checks
  return Boolean(
    checks && Object.values(checks).some(checkHasFailedCommandEvidence),
  )
}

function hasLaterGitFailureEvidence(run) {
  const finalMessage = run?.resultArtifact?.finalMessage
  return Boolean(
    hasFailedCommandEvidence(run?.resultArtifact) ||
      (typeof finalMessage === "string" &&
        /(?:Git reconciliation stopped safely|Cherry-pick:\s*\*\*FAILED|cherry-pick[^\n]*\b(?:conflict|partially applied)\b)/i.test(
          finalMessage,
        )),
  )
}

function hasExactlyOneLine(lines, expected) {
  return lines.filter((line) => line === expected).length === 1
}

function sameStringArray(left, right) {
  return Boolean(
    Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every(
        (value, index) =>
          typeof value === "string" && value === right[index],
      ),
  )
}

function provesBranchTransitionBeforeLaterFailure({ run, branch, head }) {
  const artifact = run?.resultArtifact
  const finalMessage = artifact?.finalMessage
  if (typeof finalMessage !== "string") return false

  const lines = finalMessage.split(/\r?\n/).map((line) => line.trim())
  const stoppedLine = "Git reconciliation stopped safely before applying any commit."
  const branchLine = `- Integration branch: \`${branch}\``
  const headLine = `- Authorized base/current HEAD: \`${head}\``
  const cleanLine =
    "- No conflict occurred, no `CHERRY_PICK_HEAD` remains, and the worktree is clean."
  const noMutationLine =
    "- Production, migration, deployment, receipt, and Aromantic mutations: **none**"
  const gate = run.ownerGates?.[0]
  const checks = run.checks
  const artifactFindings = artifact.findings
  const failedDiffCommands = artifact.checks?.diffCheck?.evidence?.filter(
    (evidence) =>
      evidence?.source === "command_execution" && evidence.status === "fail",
  )

  return Boolean(
    run.status === "needs_review" &&
      run.ownerRequest === null &&
      Array.isArray(run.commits) &&
      run.commits.length === 1 &&
      run.commits[0] === head &&
      hasNoChangedFileMutationEvidence(run) &&
      checks &&
      Object.keys(checks).length === resultCheckNames.length &&
      checks.typecheck === "unknown" &&
      checks.lint === "unknown" &&
      checks.tests === "unknown" &&
      checks.cloudflareReadiness === "unknown" &&
      checks.build === "unknown" &&
      checks.diffCheck === "pass" &&
      artifact.version === 1 &&
      artifact.source === "completed_turn_final_message" &&
      artifact.turnStatus === "completed" &&
      checkHasFailedCommandEvidence(artifact.checks?.diffCheck) &&
      failedDiffCommands.length === 1 &&
      typeof failedDiffCommands[0].summary === "string" &&
      failedDiffCommands[0].summary.includes("git diff --check") &&
      failedDiffCommands[0].summary.includes(head) &&
      failedDiffCommands[0].summary.includes(`refs/heads/${branch}`) &&
      failedDiffCommands[0].summary.endsWith("(failed, exit 128)") &&
      hasExactlyOneLine(lines, stoppedLine) &&
      hasExactlyOneLine(lines, branchLine) &&
      hasExactlyOneLine(lines, headLine) &&
      lines.filter((line) =>
        /^- Cherry-pick: \*\*FAILED before application\*\* because the sandbox denied creation of the linked worktree(?:'|’)s `index\.lock`\.$/.test(
          line,
        ),
      ).length === 1 &&
      hasExactlyOneLine(lines, cleanLine) &&
      hasExactlyOneLine(lines, "- Commits above base: `0`") &&
      hasExactlyOneLine(
        lines,
        "- Typecheck/lint/tests/readiness/build: **NOT RUN** because the required cherry-pick did not complete.",
      ) &&
      hasExactlyOneLine(lines, "- Push: **NOT ATTEMPTED**") &&
      hasExactlyOneLine(lines, "- PR: **NOT CREATED**") &&
      hasExactlyOneLine(lines, noMutationLine) &&
      Array.isArray(run.blockers) &&
      run.blockers.length === 2 &&
      run.blockers[0] === cleanLine.slice(2) &&
      typeof gate === "string" &&
      run.ownerGates.length === 1 &&
      run.blockers[1] === gate &&
      hasExactlyOneLine(lines, gate) &&
      Array.isArray(run.productionReadback) &&
      run.productionReadback.length === 2 &&
      run.productionReadback[0] === noMutationLine.slice(2) &&
      run.productionReadback[1] === gate &&
      isEmptyArray(run.safetyFindings) &&
      Array.isArray(run.branchPushState) &&
      run.branchPushState.length === 4 &&
      run.branchPushState[0] === stoppedLine &&
      run.branchPushState[1] === branchLine.slice(2) &&
      run.branchPushState[2] === "Push: **NOT ATTEMPTED**" &&
      run.branchPushState[3] === gate &&
      artifactFindings &&
      sameStringArray(artifactFindings.blockers, run.blockers) &&
      sameStringArray(artifactFindings.ownerGates, run.ownerGates) &&
      sameStringArray(
        artifactFindings.productionReadback,
        run.productionReadback,
      ) &&
      sameStringArray(artifactFindings.safetyFindings, run.safetyFindings) &&
      sameStringArray(artifactFindings.branchPushState, run.branchPushState)
  )
}

function transitionSource({ run, controls, state, workspace, head }) {
  if (
    !runHasWorkspaceContinuity(run, state) ||
    run.branch !== workspace.actualBranch ||
    !Array.isArray(run.commits) ||
    run.commits[0] !== head ||
    !Number.isSafeInteger(run.turnCount) ||
    run.turnCount < 1
  ) {
    return null
  }
  const matchingControls = controls.filter(
    (control) => control.instructionId === run.instructionId,
  )
  if (
    matchingControls.length !== 1 ||
    matchingControls[0].action !== "continue" ||
    matchingControls[0].ownerApprovalRequired ||
    !explicitlyAuthorizesBranchTransition(
      matchingControls[0].prompt,
      workspace.actualBranch,
      head,
      run.resultArtifact?.finalMessage ?? "",
    )
  ) {
    return null
  }
  if (
    hasLaterGitFailureEvidence(run) &&
    !provesBranchTransitionBeforeLaterFailure({
      run,
      branch: workspace.actualBranch,
      head,
    })
  ) {
    return null
  }
  return { run, control: matchingControls[0] }
}

const maximumReconciliationSourceDiagnostics = 12

function safeReconciliationIdentifier(value, maximum = 255) {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)
    ? value
    : null
}

function reconciliationDiagnosticBase({ state, instruction, workspace }) {
  return {
    instructionId: safeReconciliationIdentifier(instruction?.instructionId),
    expectedBranch: safeReconciliationIdentifier(workspace?.expectedBranch),
    actualBranch: safeReconciliationIdentifier(workspace?.actualBranch),
    head:
      typeof workspace?.head === "string" &&
      /^[0-9a-f]{40}$/.test(workspace.head)
        ? workspace.head
        : null,
    runCount: Array.isArray(state?.runs) ? state.runs.length : 0,
  }
}

function transitionSourceRejection({ run, controls, state, workspace, head }) {
  let matchedConditions = 0
  const reject = (code) => ({ code, matchedConditions })
  if (!runHasWorkspaceContinuity(run, state)) {
    return reject("source_workspace_continuity")
  }
  matchedConditions += 1
  if (run.branch !== workspace.actualBranch) {
    return reject("source_actual_branch")
  }
  matchedConditions += 1
  if (!Array.isArray(run.commits)) return reject("source_commits_shape")
  matchedConditions += 1
  if (run.commits[0] !== head) return reject("source_head_proof")
  matchedConditions += 1
  if (!Number.isSafeInteger(run.turnCount) || run.turnCount < 1) {
    return reject("source_turn_count")
  }
  matchedConditions += 1

  const matchingControls = controls.filter(
    (control) => control.instructionId === run.instructionId,
  )
  if (matchingControls.length !== 1) return reject("source_control_count")
  matchedConditions += 1
  if (matchingControls[0].action !== "continue") {
    return reject("source_control_action")
  }
  matchedConditions += 1
  if (matchingControls[0].ownerApprovalRequired) {
    return reject("source_control_owner_approval_required")
  }
  matchedConditions += 1
  if (
    !explicitlyAuthorizesBranchTransition(
      matchingControls[0].prompt,
      workspace.actualBranch,
      head,
      run.resultArtifact?.finalMessage ?? "",
    )
  ) {
    return reject("source_explicit_authorization")
  }
  matchedConditions += 1
  if (
    hasLaterGitFailureEvidence(run) &&
    !provesBranchTransitionBeforeLaterFailure({
      run,
      branch: workspace.actualBranch,
      head,
    })
  ) {
    return reject("source_partial_operation_proof")
  }
  return null
}

function interveningRunRejection({ run, control, state, workspace }) {
  const durableGate = run?.ownerRequest?.reason
  if (!runHasWorkspaceContinuity(run, state)) {
    return "intervening_workspace_continuity"
  }
  if (control?.action !== "continue") return "intervening_control_action"
  if (!hasDurableOwnerGateBinding(control, durableGate)) {
    return "intervening_owner_gate_binding"
  }
  if (run.status !== "needs_owner") return "intervening_status"
  if (run.branch !== workspace.expectedBranch) return "intervening_branch"
  if (!isEmptyArray(run.commits)) return "intervening_commits"
  if (run.turnCount !== 0) return "intervening_turn_count"
  if (run.resultArtifact !== null) return "intervening_result_artifact"
  if (run.ownerRequest?.method !== "control-plane/ownerGate") {
    return "intervening_owner_request_method"
  }
  if (!hasOnlyNotRunChecks(run.checks)) return "intervening_checks"
  if (!isEmptyArray(run.blockers)) return "intervening_blockers"
  if (
    !Array.isArray(run.ownerGates) ||
    run.ownerGates.length !== 1 ||
    run.ownerGates[0] !== durableGate
  ) {
    return "intervening_owner_gates"
  }
  if (!isEmptyArray(run.productionReadback)) {
    return "intervening_production_readback"
  }
  if (!isEmptyArray(run.safetyFindings)) {
    return "intervening_safety_findings"
  }
  if (!isEmptyArray(run.branchPushState)) {
    return "intervening_branch_push_state"
  }
  if (!hasNoChangedFileMutationEvidence(run)) {
    return "intervening_changed_files"
  }
  return null
}

export function workspaceBranchReconciliationRejection({
  state,
  instruction,
  task,
  workspace,
}) {
  const diagnostic = (code, context = {}) => ({
    code,
    ...reconciliationDiagnosticBase({ state, instruction, workspace }),
    ...context,
  })
  const issueUrl = taskIssueUrl(task)
  const controls = listAgentControls(task.issue, task.comments)
  const currentControls = controls.filter(
    (control) => control.instructionId === instruction?.instructionId,
  )
  const head = workspace?.head
  const runs = state.runs ?? []
  const historyTail = runs.at(-1)

  if (!state.activeInstruction) return diagnostic("top_active_instruction_missing")
  if (state.activeInstruction.instructionId !== instruction?.instructionId) {
    return diagnostic("top_active_instruction_mismatch")
  }
  if (instruction.action !== "continue") return diagnostic("top_instruction_action")
  if (instruction.taskState !== state.status) return diagnostic("top_task_state")
  if (currentControls.length !== 1) {
    return diagnostic("top_current_control_count", {
      currentControlCount: currentControls.length,
    })
  }
  if (currentControls[0].action !== "continue") {
    return diagnostic("top_current_control_action")
  }
  if (currentControls[0].prompt !== instruction.prompt) {
    return diagnostic("top_current_control_prompt")
  }
  if (!state.workspacePath) return diagnostic("top_workspace_path_missing")
  if (workspace?.path !== state.workspacePath) {
    return diagnostic("top_workspace_path_mismatch")
  }
  if (workspace.expectedBranch !== state.branch) {
    return diagnostic("top_expected_branch_mismatch")
  }
  if (!workspace.actualBranch) return diagnostic("top_actual_branch_missing")
  if (workspace.actualBranch === workspace.expectedBranch) {
    return diagnostic("top_branch_not_changed")
  }
  if (
    !workspace.actualBranch.startsWith(
      `agent/issue-${state.task.originIssueNumber}-`,
    )
  ) {
    return diagnostic("top_branch_namespace")
  }
  if (workspace.dirty !== false) return diagnostic("top_workspace_dirty")
  if (workspace.operationsInProgress?.length !== 0) {
    return diagnostic("top_operations_in_progress", {
      operationCount: Array.isArray(workspace.operationsInProgress)
        ? workspace.operationsInProgress.length
        : null,
    })
  }
  if (typeof head !== "string" || !/^[0-9a-f]{40}$/.test(head)) {
    return diagnostic("top_head_invalid")
  }
  if (!historyTail) return diagnostic("top_history_tail_missing")
  if (state.lastConsumedInstructionId !== historyTail.instructionId) {
    return diagnostic("top_last_consumed_mismatch", {
      historyTailInstructionId: safeReconciliationIdentifier(
        historyTail.instructionId,
      ),
    })
  }
  const duplicateCurrentRunCount = runs.filter(
    (run) => run.instructionId === instruction.instructionId,
  ).length
  if (duplicateCurrentRunCount !== 0) {
    return diagnostic("top_duplicate_current_run", {
      duplicateCurrentRunCount,
    })
  }
  if (extractIssueNumber(task.issue) !== state.task.originIssueNumber) {
    return diagnostic("top_task_origin_issue")
  }
  if (issueUrl === null) return diagnostic("top_origin_url_missing")
  if (issueUrl !== state.task.originIssueUrl) {
    return diagnostic("top_origin_url_mismatch")
  }

  const sources = []
  const sourceRejections = []
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const run = runs[index]
    const source = transitionSource({ run, controls, state, workspace, head })
    if (source) {
      sources.push({ ...source, index })
      continue
    }
    const rejection = transitionSourceRejection({
      run,
      controls,
      state,
      workspace,
      head,
    })
    sourceRejections.push({
      instructionId: safeReconciliationIdentifier(run?.instructionId),
      code: rejection?.code ?? "source_unclassified",
      matchedConditions: rejection?.matchedConditions ?? 0,
    })
  }
  if (sources.length === 0) {
    const ranked = [...sourceRejections].sort(
      (left, right) => right.matchedConditions - left.matchedConditions,
    )
    return diagnostic(ranked[0]?.code ?? "source_count_none", {
      sourceCount: 0,
      sourceCountCode: "source_count_none",
      sourceInstructionId: ranked[0]?.instructionId ?? null,
      sourceRejections: sourceRejections
        .slice(0, maximumReconciliationSourceDiagnostics)
        .map(({ instructionId, code }) => ({ instructionId, code })),
      sourceRejectionsTruncated:
        sourceRejections.length > maximumReconciliationSourceDiagnostics,
    })
  }
  if (sources.length !== 1) {
    return diagnostic("source_count_ambiguous", {
      sourceCount: sources.length,
      sourceInstructionIds: sources
        .slice(0, maximumReconciliationSourceDiagnostics)
        .map(({ run }) => safeReconciliationIdentifier(run.instructionId)),
      sourceListTruncated:
        sources.length > maximumReconciliationSourceDiagnostics,
    })
  }

  const [{ run: sourceRun, index: sourceIndex }] = sources
  const observedInstructionIds = new Set([sourceRun.instructionId])
  for (const run of runs.slice(sourceIndex + 1)) {
    const runInstructionId = safeReconciliationIdentifier(run.instructionId)
    const matchingControls = controls.filter(
      (control) => control.instructionId === run.instructionId,
    )
    if (observedInstructionIds.has(run.instructionId)) {
      return diagnostic("intervening_duplicate_instruction", {
        runInstructionId,
      })
    }
    if (matchingControls.length !== 1) {
      return diagnostic("intervening_control_count", {
        runInstructionId,
        matchingControlCount: matchingControls.length,
      })
    }
    const rejection = interveningRunRejection({
      run,
      control: matchingControls[0],
      state,
      workspace,
    })
    if (rejection) {
      return diagnostic(rejection, { runInstructionId })
    }
    observedInstructionIds.add(run.instructionId)
  }

  const reconciliationId = [
    "authorized-workspace-branch",
    sourceRun.instructionId,
    instruction.instructionId,
    head,
  ].join(":")
  const existing = (state.workspaceBranchReconciliations ?? []).find(
    (record) => record.reconciliationId === reconciliationId,
  )
  if (!existing) return null
  const expectedRecord = {
    reconciliationId,
    precedingInstructionId: sourceRun.instructionId,
    interveningInstructionIds: runs
      .slice(sourceIndex + 1)
      .map((run) => run.instructionId),
    continuationInstructionId: instruction.instructionId,
    originIssueNumber: state.task.originIssueNumber,
    originIssueUrl: state.task.originIssueUrl,
    threadId: state.threadId,
    workspacePath: state.workspacePath,
    fromBranch: workspace.expectedBranch,
    toBranch: workspace.actualBranch,
    head,
  }
  return reconciliationRecordMatches(existing, expectedRecord)
    ? null
    : diagnostic("reconciliation_record_conflict")
}

export async function recordWorkspaceBranchReconciliationRejection({
  store,
  reconciliationInput,
}) {
  let rejection = {
    code: "reconciliation_rejection_unclassified",
    instructionId: safeReconciliationIdentifier(
      reconciliationInput?.instruction?.instructionId,
    ),
  }
  try {
    rejection =
      workspaceBranchReconciliationRejection(reconciliationInput) ?? rejection
  } catch {
    // Classification is best-effort and cannot affect reconciliation.
  }
  const event = {
    type: "workspace_branch_reconciliation_rejected",
    ...rejection,
  }
  try {
    await store.appendEvent(event)
  } catch {
    // Diagnostic persistence must never change reconciliation acceptance.
  }
  return event
}

function reconciliationRecordMatches(existing, expected) {
  return Object.entries(expected).every(([key, value]) => {
    if (!Array.isArray(value)) return existing[key] === value
    return (
      Array.isArray(existing[key]) &&
      existing[key].length === value.length &&
      existing[key].every((item, index) => item === value[index])
    )
  })
}

export function authorizedWorkspaceBranchReconciliation({
  state,
  instruction,
  task,
  workspace,
  reconciledAt = new Date().toISOString(),
}) {
  const issueUrl = taskIssueUrl(task)
  const controls = listAgentControls(task.issue, task.comments)
  const currentControls = controls.filter(
    (control) => control.instructionId === instruction?.instructionId,
  )
  const head = workspace?.head
  const runs = state.runs ?? []
  const historyTail = runs.at(-1)

  if (
    !state.activeInstruction ||
    state.activeInstruction.instructionId !== instruction?.instructionId ||
    instruction.action !== "continue" ||
    instruction.taskState !== state.status ||
    currentControls.length !== 1 ||
    currentControls[0].action !== "continue" ||
    currentControls[0].prompt !== instruction.prompt ||
    !state.workspacePath ||
    workspace?.path !== state.workspacePath ||
    workspace.expectedBranch !== state.branch ||
    !workspace.actualBranch ||
    workspace.actualBranch === workspace.expectedBranch ||
    !workspace.actualBranch.startsWith(
      `agent/issue-${state.task.originIssueNumber}-`,
    ) ||
    workspace.dirty !== false ||
    workspace.operationsInProgress?.length !== 0 ||
    typeof head !== "string" ||
    !/^[0-9a-f]{40}$/.test(head) ||
    !historyTail ||
    state.lastConsumedInstructionId !== historyTail.instructionId ||
    runs.some((run) => run.instructionId === instruction.instructionId) ||
    extractIssueNumber(task.issue) !== state.task.originIssueNumber ||
    issueUrl === null ||
    issueUrl !== state.task.originIssueUrl
  ) {
    return null
  }

  const sources = []
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const run = runs[index]
    const source = transitionSource({ run, controls, state, workspace, head })
    if (source) sources.push({ ...source, index })
  }
  if (sources.length !== 1) return null

  const [{ run: sourceRun, index: sourceIndex }] = sources
  const interveningRuns = runs.slice(sourceIndex + 1)
  const interveningInstructionIds = []
  const observedInstructionIds = new Set([sourceRun.instructionId])
  for (const run of interveningRuns) {
    const matchingControls = controls.filter(
      (control) => control.instructionId === run.instructionId,
    )
    if (
      observedInstructionIds.has(run.instructionId) ||
      matchingControls.length !== 1 ||
      !isProvablyNonMutatingRun({
        run,
        control: matchingControls[0],
        state,
        workspace,
      })
    ) {
      return null
    }
    observedInstructionIds.add(run.instructionId)
    interveningInstructionIds.push(run.instructionId)
  }

  const reconciliationId = [
    "authorized-workspace-branch",
    sourceRun.instructionId,
    instruction.instructionId,
    head,
  ].join(":")
  const existing = (state.workspaceBranchReconciliations ?? []).find(
    (record) => record.reconciliationId === reconciliationId,
  )
  const expectedRecord = {
    reconciliationId,
    precedingInstructionId: sourceRun.instructionId,
    interveningInstructionIds,
    continuationInstructionId: instruction.instructionId,
    originIssueNumber: state.task.originIssueNumber,
    originIssueUrl: state.task.originIssueUrl,
    threadId: state.threadId,
    workspacePath: state.workspacePath,
    fromBranch: workspace.expectedBranch,
    toBranch: workspace.actualBranch,
    head,
  }
  if (existing) {
    return reconciliationRecordMatches(existing, expectedRecord)
      ? { record: existing, isNew: false }
      : null
  }
  return {
    record: { ...expectedRecord, reconciledAt },
    isNew: true,
  }
}

export function recordCompletedTurnResult(
  state,
  turnResult,
  capturedAt = new Date().toISOString(),
) {
  if (!state.activeInstruction) {
    throw new Error("Cannot persist a completed turn without an active instruction")
  }
  const resultArtifact =
    turnResult?.resultArtifact ??
    resultArtifactFromTurnResult(turnResult, capturedAt)
  const persisted = redactForLog({
    status: turnResult?.status ?? turnResult?.turn?.status ?? "failed",
    turn: {
      id: turnResult?.turn?.id ?? state.activeInstruction.turnId ?? null,
      status: turnResult?.turn?.status ?? turnResult?.status ?? "failed",
      error: turnResult?.turn?.error ?? null,
    },
    pendingOwnerRequest: compactOwnerRequest(
      turnResult?.pendingOwnerRequest ?? null,
    ),
    resultArtifact,
  })
  state.activeInstruction.resultArtifact = persisted.resultArtifact
  state.activeInstruction.completedTurnResult = persisted
  if (state.activeInstruction.phase !== "owner_stopped") {
    state.activeInstruction.phase = "turn_completed"
  }
  return persisted
}

export function beginInstruction(state, instruction, selectedAt = new Date()) {
  normalizeTurnAccounting(state)
  if (instruction.action === "start") {
    supersedePendingApprovalRequests({ state, now: selectedAt })
    state.pendingOwnerRequest = null
    state.threadId = null
    state.workspacePath = null
    state.branch = null
    state.retryCount = 0
  }
  const retainsPendingApproval = (state.pendingApprovalRequests ?? []).some(
    (pending) =>
      !pending.clearedAt &&
      pending.reason === state.pendingOwnerRequest?.reason,
  )
  if (!retainsPendingApproval) state.pendingOwnerRequest = null
  const priorTurnCount = instructionTurnCount(state, instruction.instructionId)
  state.activeInstruction = {
    ...instruction,
    phase: "selected",
    attempts: 0,
    turnCount: priorTurnCount,
    selectedAt: selectedAt.toISOString(),
  }
  state.retryInstructionIds = (state.retryInstructionIds ?? []).filter(
    (instructionId) => instructionId !== instruction.instructionId,
  )
  return state.activeInstruction
}

export function supersedeOwnerStoppedInstruction(
  state,
  latestInstruction,
  selectedAt = new Date(),
) {
  const active = state.activeInstruction
  if (
    !active ||
    !latestInstruction ||
    active.instructionId === latestInstruction.instructionId ||
    !state.pendingOwnerRequest ||
    active.phase !== "owner_stopped"
  ) {
    return null
  }

  normalizeTurnAccounting(state)
  state.runs ??= []
  const ownerRequest = state.pendingOwnerRequest
  if (
    !(state.runs ?? []).some(
      (run) =>
        run.instructionId === active.instructionId && run.status === "needs_owner",
    )
  ) {
    state.runs.push({
      instructionId: active.instructionId,
      status: "needs_owner",
      threadId: state.threadId,
      branch: state.branch,
      commits: [],
      turnCount: instructionTurnCount(state, active.instructionId),
      ownerRequest,
      completedAt: selectedAt.toISOString(),
    })
  }
  state.lastConsumedInstructionId = active.instructionId
  const supersededInstructionId = active.instructionId
  beginInstruction(state, latestInstruction, selectedAt)
  state.status = latestInstruction.taskState
  return {
    supersededInstructionId,
    instructionId: latestInstruction.instructionId,
    ownerRequest,
  }
}

export async function ensureTaskThread({
  appServer,
  state,
  workspacePath,
  model,
  gitExecutionBoundary = null,
  save,
}) {
  const durableTurnPhase = new Set([
    "boundary_activated",
    "turn_started",
    "turn_completed",
    "owner_stopped",
    "result_pending",
  ]).has(state.activeInstruction.phase)
  const common = {
    cwd: workspacePath,
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
    sandbox: "workspace-write",
    developerInstructions: safetyInstructions,
    ...(gitExecutionBoundary
      ? { config: { "features.exec_permission_approvals": true } }
      : {}),
  }
  const response = state.threadId
    ? await appServer.resumeThread(state.threadId, common)
    : await appServer.startThread({
        ...common,
        ...(model ? { model } : {}),
        serviceName: "koalafrog_local_orchestrator",
        threadSource: "appServer",
      })
  state.threadId = response.thread.id
  if (!durableTurnPhase) state.activeInstruction.phase = "thread_ready"
  await save(state)
  await appServer.waitForMcpReady(state.threadId)
  return response.thread
}

export class Orchestrator {
  constructor(config, dependencies = {}) {
    this.config = config
    this.store =
      dependencies.store ??
      new StateStore({
        stateDirectory: config.stateDirectory,
        repository: config.repository,
        issueNumber: config.issueNumber,
      })
    this.appServer =
      dependencies.appServer ??
      new AppServerClient({
        binary: config.codexBinary,
        cwd: config.checkoutPath,
        eventSink: (event) => this.store.appendEvent(event),
        stderrSink: (text) => this.store.appendStderr(text),
      })
    this.controlPlane = dependencies.controlPlane ?? null
    this.workspace = {
      assertAllowedChanges,
      commitWorkspaceChanges,
      ensureWorkspace,
      inspectWorkspace,
      validateWorkspace,
      authorizedGitExecutionBoundary,
      gitExecutionBoundaryIsCurrent,
      executeGitReconciliationCheckpointMutation,
      prepareGitReconciliationCheckpointExecution,
      proposeGitReconciliationCheckpoint,
      recoverCompletedCheckpointActivation,
      ...dependencies.workspace,
    }
    this.controlThreadId = null
    this.started = false
  }

  async start() {
    if (this.started) return
    await this.appServer.start()
    if (!this.controlPlane) {
      const response = await this.appServer.startThread({
        cwd: this.config.checkoutPath,
        approvalPolicy: "never",
        sandbox: "read-only",
        ephemeral: true,
        serviceName: "koalafrog_control_plane",
        threadSource: "appServer",
      })
      this.controlThreadId = response.thread.id
      await this.appServer.waitForMcpReady(this.controlThreadId)
      this.controlPlane = new GithubControlPlane({
        appServer: this.appServer,
        threadId: this.controlThreadId,
        repository: this.config.repository,
        issueNumber: this.config.issueNumber,
      })
    }
    this.started = true
  }

  async #save(state) {
    await this.store.save(state)
  }

  async #reconcileWorkspaceBranch(state, instruction, task, workspace) {
    const reconciliationInput = {
      state,
      instruction,
      task,
      workspace,
    }
    const authorized = authorizedWorkspaceBranchReconciliation(
      reconciliationInput,
    )
    if (!authorized) {
      await recordWorkspaceBranchReconciliationRejection({
        store: this.store,
        reconciliationInput,
      })
      return false
    }

    state.workspaceBranchReconciliations ??= []
    if (authorized.isNew) {
      state.workspaceBranchReconciliations.push(authorized.record)
    }
    state.branch = authorized.record.toBranch
    await this.#save(state)
    if (authorized.isNew) {
      await this.store.appendEvent({
        type: "workspace_branch_reconciled",
        ...authorized.record,
      })
    }
    return true
  }

  async #completeInstruction(state, packet, comments) {
    if (state.activeInstruction?.instructionId !== packet.instructionId) {
      throw new Error("Refusing to publish a result for a different instruction")
    }
    if (
      packet.originIssueNumber !== state.task.originIssueNumber ||
      packet.originIssueUrl !== state.task.originIssueUrl
    ) {
      throw new Error("Refusing to publish a result outside its persisted origin")
    }
    packet = redactForLog(packet)
    state.activeInstruction.phase = "result_pending"
    state.activeInstruction.packet = packet
    await this.#save(state)

    const completionComment = formatCompletionPacket(packet)
    const correctionIds = new Set(state.resultCorrectionInstructionIds ?? [])
    const checkpointActivationRecovery =
      state.activeInstruction.checkpointActivationRecovery ?? null
    if (checkpointActivationRecovery) {
      const recovery = activeCheckpointRecoveryRecordDecision(state)
      let rejectionCode = recovery.accepted
        ? null
        : recovery.code
      if (!correctionIds.has(packet.instructionId)) {
        rejectionCode ??= "result_correction_marker_missing"
      }
      const publicationDecision = rejectionCode
        ? null
        : agentResultPublicationDecision({
            comments,
            instructionId: packet.instructionId,
          })
      if (publicationDecision && !publicationDecision.accepted) {
        rejectionCode = publicationDecision.rejection.code
      }
      const publication = publicationDecision?.accepted
        ? publicationDecision.value
        : null
      if (
        publication &&
        (publication.commentId !== checkpointActivationRecovery.resultCommentId ||
          !Number.isSafeInteger(publication.commentId) ||
          publication.commentId < 1)
      ) {
        rejectionCode = "result_correction_comment_id"
      }
      const intendedBodyDigest = controlPlaneBindingDigest(completionComment)
      const intendedPacketDigest = agentResultBindingDigest(packet)
      const isOriginalPublication = Boolean(
        publication &&
          publication.bodyDigest ===
            checkpointActivationRecovery.resultCommentBodyDigest &&
          publication.packetDigest ===
            checkpointActivationRecovery.resultPacketDigest,
      )
      const isCompletedPublication = Boolean(
        publication &&
          publication.bodyDigest === intendedBodyDigest &&
          publication.packetDigest === intendedPacketDigest,
      )
      if (publication && !isOriginalPublication && !isCompletedPublication) {
        rejectionCode = "result_correction_publication_drift"
      }
      if (rejectionCode) {
        await this.store.appendEvent({
          type: "checkpoint_activation_result_correction_rejected",
          code: rejectionCode,
          instructionId: packet.instructionId,
          issueNumber: state.task.originIssueNumber,
        })
        throw new Error(`Recovered result correction rejected: ${rejectionCode}`)
      }
      if (isOriginalPublication) {
        await this.controlPlane.updateComment(
          publication.commentId,
          completionComment,
        )
      }
      correctionIds.delete(packet.instructionId)
      state.resultCorrectionInstructionIds = [...correctionIds]
    } else {
      const existingResult = findExistingResult(comments, packet.instructionId)
      if (!existingResult) {
        await this.controlPlane.postComment(completionComment)
      } else if (
        correctionIds.has(packet.instructionId) &&
        Number.isSafeInteger(existingResult.id)
      ) {
        await this.controlPlane.updateComment(
          existingResult.id,
          completionComment,
        )
        correctionIds.delete(packet.instructionId)
        state.resultCorrectionInstructionIds = [...correctionIds]
      }
    }

    const ownerGateAcknowledgementId =
      state.activeInstruction.ownerGateAcknowledgementId ?? null
    state.lastConsumedInstructionId = packet.instructionId
    state.status = packet.status
    state.pendingOwnerRequest =
      packet.status === "needs_owner"
        ? packet.ownerRequest ??
          (packet.ownerQuestion ? { reason: packet.ownerQuestion } : null)
        : null
    if (!checkpointActivationRecovery) {
      state.runs.push({
        instructionId: packet.instructionId,
        status: packet.status,
        threadId: packet.codexThreadId,
        workspacePath: state.workspacePath,
        branch: packet.branch,
        commits: packet.commits,
        changedFiles: packet.changedFiles,
        turnCount: instructionTurnCount(state, packet.instructionId),
        originIssueNumber: state.task.originIssueNumber,
        originIssueUrl: state.task.originIssueUrl,
        ownerRequest: packet.ownerRequest ?? null,
        checks: packet.checks,
        blockers: packet.blockers ?? [],
        ownerGates: packet.ownerGates ?? [],
        productionReadback: packet.productionReadback ?? [],
        safetyFindings: packet.safetyFindings ?? [],
        branchPushState: packet.branchPushState ?? [],
        resultArtifact: packet.resultArtifact ?? null,
        completedAt: new Date().toISOString(),
      })
    }
    const completedOwnerGateAcknowledgement = ownerGateAcknowledgementId
      ? completeCheckpointOwnerGateAcknowledgement({
          state,
          acknowledgementId: ownerGateAcknowledgementId,
          outcome: packet.status,
        })
      : null
    if (checkpointActivationRecovery) {
      const recoveries = (state.checkpointActivationRecoveries ?? []).filter(
        (record) =>
          record.recoveryId === checkpointActivationRecovery.recoveryId,
      )
      if (
        recoveries.length !== 1 ||
        recoveries[0].status !== "boundary_activated" ||
        recoveries[0].completedAt !== null
      ) {
        throw new Error(
          "Refusing to complete an ambiguous checkpoint activation recovery",
        )
      }
      recoveries[0].status = "completed"
      recoveries[0].completedAt = new Date().toISOString()
      recoveries[0].outcome = packet.status
      recoveries[0].turnId = state.activeInstruction.turnId ?? null
      recoveries[0].resultPacket = packet
    }
    state.activeInstruction = null
    state.retryCount = 0
    await this.#save(state)
    if (completedOwnerGateAcknowledgement) {
      await this.store.appendEvent({
        type: "owner_gate_acknowledgement_completed",
        acknowledgementId:
          completedOwnerGateAcknowledgement.record.acknowledgementId,
        instructionId: packet.instructionId,
        outcome: packet.status,
      })
    }
  }

  async #postPickup(state, instruction, comments) {
    if (findExistingPickup(comments, instruction.instructionId)) return
    await this.controlPlane.postComment(
      formatPickupPacket({
        instructionId: instruction.instructionId,
        originIssueNumber: state.task.originIssueNumber,
        originIssueUrl: state.task.originIssueUrl,
        codexThreadId: state.threadId,
        branch: state.branch,
      }),
    )
    await this.store.appendEvent({
      type: "instruction_pickup_posted",
      instructionId: instruction.instructionId,
      originIssueNumber: state.task.originIssueNumber,
      originIssueUrl: state.task.originIssueUrl,
      threadId: state.threadId,
    })
  }

  async #packetFromWorkspace(state, instruction, turnResult) {
    let workspace = await this.workspace.inspectWorkspace(
      state.workspacePath,
      this.config.baseRef,
    )
    this.workspace.assertAllowedChanges(
      workspace.changedFiles,
      this.config.allowedPaths,
    )

    if (turnResult.status === "completed" && this.config.autoCommit) {
      await this.workspace.commitWorkspaceChanges(
        state.workspacePath,
        `chore(orchestrator): complete ${instruction.instructionId}`,
      )
      workspace = await this.workspace.inspectWorkspace(
        state.workspacePath,
        this.config.baseRef,
      )
    }

    const validation = await this.workspace.validateWorkspace(
      state.workspacePath,
      this.config.baseRef,
    )
    const ownerRequest = turnResult.pendingOwnerRequest
    const structuredOwnerRequest = compactOwnerRequest(ownerRequest)
    const resultArtifact =
      turnResult.resultArtifact ??
      state.activeInstruction?.resultArtifact ??
      resultArtifactFromTurnResult(turnResult)
    const findings = resultArtifact.findings ?? {}
    const finalMessage = resultArtifact.finalMessage ?? ""
    const completed = turnResult.status === "completed" && validation.pass
    const status = ownerRequest
      ? "needs_owner"
      : completed
        ? "needs_review"
        : "failed"
    return {
      instructionId: instruction.instructionId,
      originIssueNumber: state.task.originIssueNumber,
      originIssueUrl: state.task.originIssueUrl,
      codexThreadId: state.threadId,
      status,
      branch: workspace.branch || null,
      commits: workspace.commits,
      changedFiles: workspace.changedFiles,
      checks: checksFromResultArtifact(resultArtifact, {
        diffCheck: validation.pass ? "pass" : "fail",
      }),
      ownerQuestion:
        compactOwnerQuestion(structuredOwnerRequest) ??
        findings.ownerGates?.[0] ??
        null,
      ownerRequest: structuredOwnerRequest,
      blockers: [...(findings.blockers ?? [])],
      ownerGates: [...(findings.ownerGates ?? [])],
      productionReadback: [...(findings.productionReadback ?? [])],
      safetyFindings: [...(findings.safetyFindings ?? [])],
      branchPushState: [...(findings.branchPushState ?? [])],
      resultArtifact,
      detail: [
        validation.pass
          ? "Orchestrator workspace validation: `git diff --check` passed."
          : `Orchestrator workspace validation failed: ${validation.detail || turnResult.turn?.error?.message || "unknown error"}`,
        ownerRequest
          ? "The Codex turn stopped for owner input after the request was cancelled or interrupted fail-closed."
          : null,
        finalMessage
          ? `Final Codex report (redacted):\n\n${finalMessage}`
          : "No final Codex message or command evidence was recoverable; unproven checks are reported as `unknown`.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    }
  }

  async #runWithRetries(state, instruction, gitExecutionBoundary = null) {
    const maxTurns = Math.min(instruction.maxTurns, this.config.maxTurns)
    let result = null
    if ((state.activeInstruction.attempts ?? 0) > this.config.maxRetries) {
      return {
        status: "failed",
        turn: {
          status: "failed",
          error: { message: "Bounded retry limit reached" },
        },
        pendingOwnerRequest: null,
      }
    }
    for (
      let attempt = state.activeInstruction.attempts ?? 0;
      attempt <= this.config.maxRetries;
      attempt += 1
    ) {
      if (!canStartInstructionTurn(state, maxTurns)) {
        return {
          status: "failed",
          turn: {
            status: "failed",
            error: { message: `Hard max_turns reached (${maxTurns})` },
          },
          pendingOwnerRequest: null,
        }
      }

      const retryPrefix = attempt
        ? `Retry attempt ${attempt} for the same idempotent instruction. Inspect the existing worktree before changing anything.\n\n`
        : ""
      result = await this.appServer.runTurn({
        threadId: state.threadId,
        cwd: state.workspacePath,
        timeoutMs: this.config.turnTimeoutMs,
        prompt: `${retryPrefix}${promptForInstruction(instruction, this.config.allowedPaths)}${gitExecutionBoundaryPrompt(gitExecutionBoundary)}`,
        ...(gitExecutionBoundary ? { approvalPolicy: "on-request" } : {}),
        onTurnStarted: async (turnId) => {
          const availableDecisionIds = (state.ownerApprovalDecisions ?? [])
            .filter(
              (decision) =>
                !decision.consumedAt &&
                Date.parse(decision.expiresAt) > Date.now(),
            )
            .map((decision) => decision.decisionId)
          recordInstructionTurnStarted(state, { turnId, attempt })
          const recoveryBinding =
            state.activeInstruction.checkpointActivationRecovery ?? null
          if (recoveryBinding) {
            const recoveries = (
              state.checkpointActivationRecoveries ?? []
            ).filter(
              (record) => record.recoveryId === recoveryBinding.recoveryId,
            )
            if (
              recoveries.length !== 1 ||
              recoveries[0].status !== "boundary_activated" ||
              recoveries[0].completedAt !== null
            ) {
              throw new Error(
                "Refusing to bind a turn to an ambiguous checkpoint recovery",
              )
            }
            recoveries[0].turnId = turnId
          }
          state.retryCount = attempt
          if (state.activeInstruction.ownerRequest) {
            state.activeInstruction.phase = "owner_stopped"
            state.pendingOwnerRequest = state.activeInstruction.ownerRequest
            state.status = "needs_owner"
          } else {
            state.status = "running"
          }
          await this.#save(state)
          await this.store.appendEvent({
            type: "turn_started",
            instructionId: instruction.instructionId,
            threadId: state.threadId,
            turnId,
            attempt,
          })
          if (availableDecisionIds.length) {
            await this.store.appendEvent({
              type: "owner_approval_retry_turn_started",
              instructionId: instruction.instructionId,
              threadId: state.threadId,
              turnId,
              decisionIds: availableDecisionIds,
            })
          }
        },
        onOwnerStop: async (ownerRequest) => {
          recordPendingApprovalRequest({
            state,
            instructionId: instruction.instructionId,
            request: ownerRequest,
          })
          const structuredOwnerRequest = compactOwnerRequest(ownerRequest)
          state.activeInstruction.phase = "owner_stopped"
          state.activeInstruction.ownerRequest = structuredOwnerRequest
          state.pendingOwnerRequest = structuredOwnerRequest
          state.status = "needs_owner"
          await this.#save(state)
        },
        resolveApprovalRequest: async (ownerRequest, requestContext = {}) => {
          let gitGrantRejection = null
          if (!gitExecutionBoundary) {
            gitGrantRejection = { code: "grant_boundary_missing" }
          } else if (
            state.activeInstruction?.instructionId !==
            gitExecutionBoundary.instructionId
          ) {
            gitGrantRejection = { code: "grant_active_instruction" }
          } else if (state.activeInstruction.phase !== "turn_started") {
            gitGrantRejection = { code: "grant_instruction_phase" }
          } else if (state.activeInstruction.turnId !== ownerRequest.turnId) {
            gitGrantRejection = { code: "grant_turn" }
          } else if (state.threadId !== gitExecutionBoundary.threadId) {
            gitGrantRejection = { code: "grant_thread" }
          } else if (state.workspacePath !== gitExecutionBoundary.workspacePath) {
            gitGrantRejection = { code: "grant_workspace" }
          } else if (state.branch !== gitExecutionBoundary.branch) {
            gitGrantRejection = { code: "grant_branch" }
          }

          const requestDecision = gitGrantRejection
            ? null
            : gitExecutionBoundaryRequestDecision({
                boundary: gitExecutionBoundary,
                request: ownerRequest,
                commandExecution: requestContext.commandExecution,
              })
          if (requestDecision && !requestDecision.accepted) {
            gitGrantRejection = requestDecision.rejection
          }

          let currentBoundaryRejection = null
          const matchedGitGrant = requestDecision?.accepted
            ? requestDecision.value
            : null
          const boundaryIsCurrent = matchedGitGrant
            ? await this.workspace.gitExecutionBoundaryIsCurrent(
                gitExecutionBoundary,
                matchedGitGrant.action,
                (diagnostic) => {
                  currentBoundaryRejection = diagnostic
                },
              )
            : false
          if (matchedGitGrant && !boundaryIsCurrent) {
            gitGrantRejection = currentBoundaryRejection ?? {
              code: "current_unclassified",
              action: matchedGitGrant.action,
            }
          }
          const gitGrant = boundaryIsCurrent ? matchedGitGrant : null
          if (gitGrant) {
            state.activeInstruction.gitExecutionPermissionGrants ??= []
            const duplicateAction =
              state.activeInstruction.gitExecutionPermissionGrants.find(
                (grant) =>
                  grant.action === gitGrant.action &&
                  (state.activeInstruction.checkpointActivationRecovery
                    ? true
                    : grant.turnId === ownerRequest.turnId),
              )
            if (duplicateAction && gitGrant.action !== "validation") {
              if (
                duplicateAction.turnId === ownerRequest.turnId &&
                duplicateAction.itemId === ownerRequest.itemId
              ) {
                return { response: gitGrant.response, decisionId: null }
              }
              gitGrantRejection = {
                code: "grant_duplicate_action_conflict",
                action: gitGrant.action,
              }
            }
            if (gitGrantRejection) {
              await this.store.appendEvent({
                type: "git_execution_permission_rejected",
                instructionId: instruction.instructionId,
                issueNumber: state.task.originIssueNumber,
                requestMethod: ownerRequest.method,
                hasCommandContext: Boolean(requestContext.commandExecution),
                ...gitGrantRejection,
              })
              return null
            }
            state.activeInstruction.gitExecutionPermissionGrants.push({
              action: gitGrant.action,
              turnId: ownerRequest.turnId,
              itemId: ownerRequest.itemId,
              grantedAt: new Date().toISOString(),
            })
            await this.#save(state)
            await this.store.appendEvent({
              type: "git_execution_permission_granted",
              instructionId: instruction.instructionId,
              action: gitGrant.action,
              turnId: ownerRequest.turnId,
              itemId: ownerRequest.itemId,
              pathCount:
                gitGrant.action === "cherry_pick"
                  ? gitExecutionBoundary.writablePaths.length
                  : 0,
            })
            return { response: gitGrant.response, decisionId: null }
          }
          if (gitExecutionBoundary && gitGrantRejection) {
            await this.store.appendEvent({
              type: "git_execution_permission_rejected",
              instructionId: instruction.instructionId,
              issueNumber: state.task.originIssueNumber,
              requestMethod: ownerRequest.method,
              hasCommandContext: Boolean(requestContext.commandExecution),
              ...gitGrantRejection,
            })
          }
          const consumed = consumeOwnerApprovalDecision({
            state,
            request: ownerRequest,
          })
          if (!consumed) return null
          await this.#save(state)
          await this.store.appendEvent({
            type: "owner_approval_decision_consumed",
            decisionId: consumed.decision.decisionId,
            scope: consumed.decision.scope,
            instructionId: instruction.instructionId,
            requestMethod: ownerRequest.method,
            requestReasonDigest: consumed.decision.consumedRequestDigest,
          })
          return {
            response: consumed.response,
            decisionId: consumed.decision.decisionId,
          }
        },
        onApprovedActionCompleted: async ({ decisionId, succeeded }) => {
          const completion = completeOwnerApprovedAction({
            state,
            decisionId,
            succeeded,
          })
          if (!completion) return
          if (
            completion.cleared &&
            state.pendingOwnerRequest?.reason === completion.pending?.reason
          ) {
            state.pendingOwnerRequest = null
          }
          await this.#save(state)
          await this.store.appendEvent({
            type: succeeded
              ? "owner_approved_action_completed"
              : "owner_approved_action_failed",
            decisionId,
            pendingRequestKey: completion.decision.pendingRequestKey,
            instructionId: instruction.instructionId,
          })
        },
      })
      if (result.status === "completed" || result.status === "needs_owner") {
        return result
      }
      if (attempt < this.config.maxRetries) {
        const backoff = Math.min(
          this.config.retryBaseMs * 2 ** attempt + Math.floor(Math.random() * 250),
          30_000,
        )
        await this.store.appendEvent({
          type: "retry_scheduled",
          instructionId: instruction.instructionId,
          attempt: attempt + 1,
          backoffMs: backoff,
        })
        await delay(backoff)
      }
    }
    return result
  }

  async runOnce({ task: providedTask = null, expectedInstructionId = null } = {}) {
    await this.start()
    const state = await this.store.load()
    const task = providedTask ?? (await this.controlPlane.fetchTask())
    const decisionIds = new Set(
      (state.ownerApprovalDecisions ?? []).map(
        (decision) => decision.decisionId,
      ),
    )
    const registeredDecisions = registerOwnerApprovalDecisions({
      state,
      controls: listAgentControls(task.issue, task.comments),
    })
    const newDecisions = registeredDecisions.filter(
      (decision) => !decisionIds.has(decision.decisionId),
    )
    if (newDecisions.length) {
      await this.#save(state)
      for (const registeredDecision of newDecisions) {
        await this.store.appendEvent({
          type: "owner_approval_decision_registered",
          decisionId: registeredDecision.decisionId,
          scope: registeredDecision.scope,
          pendingInstructionId: registeredDecision.pendingInstructionId,
          pendingRequestKey: registeredDecision.pendingRequestKey,
          expiresAt: registeredDecision.expiresAt,
        })
      }
    }
    const originIssueUrl =
      task.issue?.html_url ?? task.issue?.display_url ?? task.issue?.url ?? null
    if (originIssueUrl !== state.task.originIssueUrl) {
      recordTaskOrigin(state, {
        issueNumber: this.config.issueNumber,
        issueUrl: originIssueUrl,
      })
      await this.#save(state)
    }
    const instructionDecision = durableTaskInstructionDecision({
      state,
      task,
      recover: (candidate) =>
        this.workspace.recoverCompletedCheckpointActivation(candidate),
    })
    const checkpointActivationRecovery =
      instructionDecision.recoveryDiscovery?.decision ?? null
    const pendingInstruction = instructionDecision.pendingInstruction ??
      (checkpointActivationRecovery?.accepted
        ? checkpointActivationRecovery.value.instruction
        : null)
    const selectedInstruction = instructionDecision.selectedInstruction
    if (
      expectedInstructionId &&
      selectedInstruction?.instructionId !== expectedInstructionId
    ) {
      await this.store.appendEvent({
        type: "queue_claim_changed",
        expectedInstructionId,
        selectedInstructionId: selectedInstruction?.instructionId ?? null,
      })
      return {
        status: "queue_changed",
        instructionId: selectedInstruction?.instructionId ?? null,
      }
    }

    if (state.activeInstruction?.phase === "result_pending") {
      const pendingId = state.activeInstruction.instructionId
      const pendingPacket = state.activeInstruction.packet
      await this.#completeInstruction(
        state,
        pendingPacket,
        task.comments,
      )
      if (
        pendingPacket.status !== "needs_owner" ||
        !pendingInstruction ||
        pendingInstruction.instructionId === pendingId ||
        !shouldConsumeInstruction(state, pendingInstruction)
      ) {
        return {
          status: state.status,
          instructionId: pendingId,
          ownerRequest: state.pendingOwnerRequest,
        }
      }
      await this.store.appendEvent({
        type: "instruction_takeover_after_owner_stop",
        supersededInstructionId: pendingId,
        instructionId: pendingInstruction.instructionId,
      })
    }

    if (state.activeInstruction?.phase === "owner_stopped") {
      const stoppedInstruction = state.activeInstruction
      const stoppedId = stoppedInstruction.instructionId
      const ownerRequest =
        state.pendingOwnerRequest ?? stoppedInstruction.ownerRequest ?? null
      const recoveredTurnResult =
        stoppedInstruction.completedTurnResult ?? {
          status: "needs_owner",
          turn: { id: stoppedInstruction.turnId, status: "interrupted" },
          pendingOwnerRequest: ownerRequest,
          resultArtifact: stoppedInstruction.resultArtifact ?? null,
        }
      let packet
      try {
        packet = await this.#packetFromWorkspace(
          state,
          stoppedInstruction,
          recoveredTurnResult,
        )
      } catch (error) {
        const resultArtifact =
          recoveredTurnResult.resultArtifact ??
          resultArtifactFromTurnResult(recoveredTurnResult)
        const findings = resultArtifact.findings ?? {}
        packet = {
          instructionId: stoppedId,
          originIssueNumber: state.task.originIssueNumber,
          originIssueUrl: state.task.originIssueUrl,
          codexThreadId: state.threadId,
          status: "needs_owner",
          branch: state.branch,
          commits: [],
          changedFiles: [],
          checks: checksFromResultArtifact(resultArtifact),
          ownerQuestion: compactOwnerQuestion(ownerRequest),
          ownerRequest: compactOwnerRequest(ownerRequest),
          blockers: [...(findings.blockers ?? [])],
          ownerGates: [...(findings.ownerGates ?? [])],
          productionReadback: [...(findings.productionReadback ?? [])],
          safetyFindings: [...(findings.safetyFindings ?? [])],
          branchPushState: [...(findings.branchPushState ?? [])],
          resultArtifact,
          detail: `Recovered an owner stop, but local validation failed: ${error.message}`,
        }
      }
      await this.#completeInstruction(state, packet, task.comments)
      if (
        !pendingInstruction ||
        pendingInstruction.instructionId === stoppedId ||
        !shouldConsumeInstruction(state, pendingInstruction)
      ) {
        return {
          status: "needs_owner",
          instructionId: stoppedId,
          ownerRequest: state.pendingOwnerRequest,
        }
      }
      await this.store.appendEvent({
        type: "instruction_takeover_after_owner_stop",
        supersededInstructionId: stoppedId,
        instructionId: pendingInstruction.instructionId,
      })
    }

    const instruction = state.activeInstruction ?? pendingInstruction

    const isCheckpointActivationRecovery = Boolean(
      checkpointActivationRecovery?.accepted &&
        checkpointActivationRecovery.value.instruction.instructionId ===
          instruction?.instructionId,
    )
    if (
      !instruction ||
      (!isCheckpointActivationRecovery &&
        !shouldConsumeInstruction(state, instruction))
    ) {
      await this.store.appendEvent({
        type: "poll_idle",
        instructionId: instruction?.instructionId ?? null,
      })
      return { status: "idle", instructionId: instruction?.instructionId ?? null }
    }

    if (
      state.activeInstruction?.instructionId &&
      pendingInstruction?.instructionId &&
      state.activeInstruction.instructionId !== pendingInstruction.instructionId
    ) {
      await this.store.appendEvent({
        type: "instruction_deferred",
        activeInstructionId: state.activeInstruction.instructionId,
        deferredInstructionId: pendingInstruction.instructionId,
      })
    }

    if (!state.activeInstruction) {
      beginInstruction(state, instruction)
      if (isCheckpointActivationRecovery) {
        const selectedAt = new Date().toISOString()
        const recoveryRecord = checkpointActivationRecovery.value.record
        recoveryRecord.selectedAt = selectedAt
        state.checkpointActivationRecoveries ??= []
        state.checkpointActivationRecoveries.push(recoveryRecord)
        state.activeInstruction.checkpointActivationRecovery = {
          ...checkpointActivationRecovery.value.binding,
          recoveryId: recoveryRecord.recoveryId,
        }
        state.resultCorrectionInstructionIds ??= []
        if (
          !state.resultCorrectionInstructionIds.includes(
            instruction.instructionId,
          )
        ) {
          state.resultCorrectionInstructionIds.push(instruction.instructionId)
        }
      }
      await this.#save(state)
      await this.store.appendEvent({
        type: isCheckpointActivationRecovery
          ? "checkpoint_activation_recovery_selected"
          : "instruction_selected",
        instructionId: instruction.instructionId,
        action: instruction.action,
        ...(isCheckpointActivationRecovery
          ? {
              recoveryId:
                state.activeInstruction.checkpointActivationRecovery.recoveryId,
              checkpointId:
                state.activeInstruction.checkpointActivationRecovery.checkpointId,
              generationId:
                state.activeInstruction.checkpointActivationRecovery.generationId,
            }
          : {}),
      })
    }

    if (instruction.action === "stop") {
      state.lastConsumedInstructionId = instruction.instructionId
      state.status = instruction.taskState
      state.activeInstruction = null
      await this.#save(state)
      return { status: "stopped", instructionId: instruction.instructionId }
    }

    const checkpointInstructionKind =
      gitReconciliationCheckpointInstructionKind(instruction)
    let gate =
      new Set(["proposal", "execution"]).has(checkpointInstructionKind)
        ? null
        : ownerGateReason(instruction)
    if (
      gate &&
      checkpointInstructionKind === "activation" &&
      state.activeInstruction.checkpointActivationRecovery
    ) {
      gate = null
    } else if (gate && checkpointInstructionKind === "activation") {
      const proposals = (state.gitReconciliationCheckpoints ?? []).filter(
        (record) => record.kind === "proposal",
      )
      const pendingReason =
        proposals.length === 1
          ? gitReconciliationCheckpointOwnerReason(proposals[0])
          : null
      const acknowledgement = pendingReason
        ? registerCheckpointOwnerGateAcknowledgement({
            state,
            instruction,
            task,
            gateReason: gate,
            pendingReason,
          })
        : {
            accepted: false,
            rejection: { code: "owner_gate_checkpoint_proposal_count" },
          }
      if (acknowledgement.accepted) {
        gate = null
        if (acknowledgement.value.isNew) {
          await this.#save(state)
          await this.store.appendEvent({
            type: "owner_gate_acknowledgement_consumed",
            code: "owner_gate_acknowledgement_accepted",
            acknowledgementId:
              acknowledgement.value.record.acknowledgementId,
            instructionId: instruction.instructionId,
            issueNumber: state.task.originIssueNumber,
            checkpointId: acknowledgement.value.proposal.checkpointId,
            generationId: acknowledgement.value.proposal.generationId,
            branch: acknowledgement.value.proposal.branch,
            head: acknowledgement.value.proposal.head,
            tree: acknowledgement.value.proposal.tree,
            priorGateAttemptCount:
              acknowledgement.value.priorGateAudit.instructionIds.length,
          })
        }
      } else {
        await this.store.appendEvent({
          type: "owner_gate_acknowledgement_rejected",
          code: acknowledgement.rejection.code,
          instructionId: instruction.instructionId,
          issueNumber: state.task.originIssueNumber,
          branch: state.branch,
          checkpointId: proposals.length === 1 ? proposals[0].checkpointId : null,
          priorAttemptInstructionId:
            acknowledgement.rejection.instructionId ?? null,
          controlCount: acknowledgement.rejection.controlCount ?? null,
          acknowledgementCount:
            acknowledgement.rejection.acknowledgementCount ?? null,
        })
      }
    }
    if (gate) {
      const packet = {
        instructionId: instruction.instructionId,
        originIssueNumber: state.task.originIssueNumber,
        originIssueUrl: state.task.originIssueUrl,
        codexThreadId: state.threadId,
        status: "needs_owner",
        branch: state.branch,
        commits: [],
        changedFiles: [],
        checks: uniformChecks("not_run"),
        ownerQuestion: gate,
        ownerRequest: compactOwnerRequest({
          method: "control-plane/ownerGate",
          reason: gate,
        }),
        blockers: [],
        ownerGates: [gate],
        productionReadback: [],
        safetyFindings: [],
        branchPushState: [],
        resultArtifact: null,
        detail: "No Codex turn was started because the owner gate stopped the instruction.",
      }
      await this.#completeInstruction(state, packet, task.comments)
      return {
        status: "needs_owner",
        instructionId: instruction.instructionId,
        ownerRequest: state.pendingOwnerRequest,
      }
    }

    const workspace = await this.workspace.ensureWorkspace({
      checkoutPath: this.config.checkoutPath,
      workspaceRoot: path.join(this.store.directory, "workspaces"),
      issueNumber: this.config.issueNumber,
      instructionId: instruction.instructionId,
      baseRef: this.config.baseRef,
      existingPath: state.workspacePath,
      existingBranch: state.branch,
      fetchRemote: this.config.fetchRemote,
      reconcileBranch: (workspaceState) =>
        this.#reconcileWorkspaceBranch(
          state,
          instruction,
          task,
          workspaceState,
        ),
    })
    state.workspacePath = workspace.path
    state.branch = workspace.branch
    await this.#save(state)

    if (checkpointInstructionKind === "proposal") {
      let checkpointRejection = null
      const proposal = await this.workspace.proposeGitReconciliationCheckpoint({
        state,
        instruction,
        task,
        workspacePath: state.workspacePath,
        workspaceRoot: path.join(this.store.directory, "workspaces"),
        checkoutPath: this.config.checkoutPath,
        repository: this.config.repository,
        baseRef: this.config.baseRef,
        onDiagnostic: (diagnostic) => {
          checkpointRejection = diagnostic
        },
      })
      const workspaceState = await this.workspace.inspectWorkspace(
        state.workspacePath,
        this.config.baseRef,
      )
      if (!proposal?.accepted) {
        const code = checkpointRejection?.code ?? "checkpoint_unclassified"
        await this.store.appendEvent({
          type: "git_reconciliation_checkpoint_rejected",
          code,
          ...checkpointProposalExceptionEventFields(checkpointRejection),
          instructionId: instruction.instructionId,
          issueNumber: state.task.originIssueNumber,
          branch: state.branch,
        })
        const packet = {
          instructionId: instruction.instructionId,
          originIssueNumber: state.task.originIssueNumber,
          originIssueUrl: state.task.originIssueUrl,
          codexThreadId: state.threadId,
          status: "needs_review",
          branch: workspaceState.branch,
          commits: workspaceState.commits,
          changedFiles: workspaceState.changedFiles,
          checks: uniformChecks("not_run"),
          ownerQuestion: null,
          ownerRequest: null,
          blockers: [code],
          ownerGates: [],
          productionReadback: [],
          safetyFindings: [],
          branchPushState: [],
          resultArtifact: null,
          detail: `Superseding checkpoint proposal failed closed with ${code}.`,
        }
        await this.#completeInstruction(state, packet, task.comments)
        return {
          status: "needs_review",
          instructionId: instruction.instructionId,
          ownerRequest: null,
        }
      }

      state.gitReconciliationCheckpoints ??= []
      if (proposal.value.isNew) {
        state.gitReconciliationCheckpoints.push(proposal.value.record)
        await this.#save(state)
        await this.store.appendEvent({
          type: "git_reconciliation_checkpoint_proposed",
          code: "checkpoint_proposal_accepted",
          checkpointId: proposal.value.record.checkpointId,
          instructionId: instruction.instructionId,
          issueNumber: state.task.originIssueNumber,
          branch: state.branch,
          head: proposal.value.record.head,
          tree: proposal.value.record.tree,
          generation: proposal.value.record.generation ?? null,
          generationId: proposal.value.record.generationId ?? null,
          rejectedProposalAuditDigest:
            proposal.value.record.rejectedProposalAudit?.digest ?? null,
          supersededRunCount:
            proposal.value.record.supersededTailInstructionIds.length,
        })
      }
      const ownerReason = gitReconciliationCheckpointOwnerReason(
        proposal.value.record,
      )
      const ownerRequest = compactOwnerRequest({
        method: "control-plane/gitReconciliationCheckpointActivation",
        reason: ownerReason,
      })
      const packet = {
        instructionId: instruction.instructionId,
        originIssueNumber: state.task.originIssueNumber,
        originIssueUrl: state.task.originIssueUrl,
        codexThreadId: state.threadId,
        status: "needs_owner",
        branch: workspaceState.branch,
        commits: workspaceState.commits,
        changedFiles: workspaceState.changedFiles,
        checks: uniformChecks("not_run"),
        ownerQuestion: ownerReason,
        ownerRequest,
        blockers: [],
        ownerGates: [ownerReason],
        productionReadback: [],
        safetyFindings: [],
        branchPushState: [],
        resultArtifact: null,
        detail:
          "Fresh verification created one immutable proposal; no Git grant or mutation was activated.",
      }
      await this.#completeInstruction(state, packet, task.comments)
      return {
        status: "needs_owner",
        instructionId: instruction.instructionId,
        ownerRequest,
      }
    }

    if (checkpointInstructionKind === "execution") {
      let executionRejection = null
      const prepare = () =>
        this.workspace.prepareGitReconciliationCheckpointExecution({
          state,
          instruction,
          task,
          workspacePath: state.workspacePath,
          workspaceRoot: path.join(this.store.directory, "workspaces"),
          checkoutPath: this.config.checkoutPath,
          repository: this.config.repository,
          baseRef: this.config.baseRef,
          onDiagnostic: (diagnostic) => {
            executionRejection = diagnostic
          },
        })
      let plan = await prepare()
      if (plan?.accepted && plan.value.isNewIntent) {
        state.gitReconciliationCheckpoints ??= []
        state.gitReconciliationCheckpoints.push(plan.value.record)
        await this.#save(state)
        await this.store.appendEvent({
          type: "git_reconciliation_checkpoint_execution_intended",
          code: "managed_execution_intent_persisted",
          instructionId: instruction.instructionId,
          issueNumber: state.task.originIssueNumber,
          branch: state.branch,
          head: plan.value.record.head,
          checkpointId: plan.value.record.checkpointId,
          generation: plan.value.record.generation,
          generationId: plan.value.record.generationId,
          executionId: plan.value.record.executionId,
        })
        executionRejection = null
        plan = await prepare()
      }
      if (plan?.accepted && plan.value.mode === "execute") {
        const executed =
          await this.workspace.executeGitReconciliationCheckpointMutation({
            plan: plan.value,
          })
        if (!executed.accepted) {
          executionRejection = executed.rejection
          plan = executed
        } else {
          executionRejection = null
          plan = await prepare()
        }
      }
      if (
        plan?.accepted &&
        plan.value.mode === "recover" &&
        plan.value.isNewReceipt
      ) {
        state.gitReconciliationCheckpoints.push(plan.value.receipt)
        await this.#save(state)
        await this.store.appendEvent({
          type: "git_reconciliation_checkpoint_execution_completed",
          code: "managed_execution_receipt_persisted",
          instructionId: instruction.instructionId,
          issueNumber: state.task.originIssueNumber,
          branch: state.branch,
          parentHead: plan.value.receipt.parentHead,
          head: plan.value.receipt.head,
          checkpointId: plan.value.receipt.checkpointId,
          generation: plan.value.receipt.generation,
          generationId: plan.value.receipt.generationId,
          executionId: plan.value.receipt.executionId,
          receiptId: plan.value.receipt.receiptId,
        })
        executionRejection = null
        plan = await prepare()
      }
      const workspaceState = await this.workspace.inspectWorkspace(
        state.workspacePath,
        this.config.baseRef,
      )
      if (!plan?.accepted || plan.value.mode !== "complete") {
        const code =
          executionRejection?.code ??
          plan?.rejection?.code ??
          "managed_execution_unclassified"
        await this.store.appendEvent({
          type: "git_reconciliation_checkpoint_execution_rejected",
          code,
          instructionId: instruction.instructionId,
          issueNumber: state.task.originIssueNumber,
          branch: state.branch,
        })
        const packet = {
          instructionId: instruction.instructionId,
          originIssueNumber: state.task.originIssueNumber,
          originIssueUrl: state.task.originIssueUrl,
          codexThreadId: state.threadId,
          status: "needs_review",
          branch: workspaceState.branch,
          commits: workspaceState.commits,
          changedFiles: workspaceState.changedFiles,
          checks: uniformChecks("not_run"),
          ownerQuestion: null,
          ownerRequest: null,
          blockers: [code],
          ownerGates: [],
          productionReadback: [],
          safetyFindings: [],
          branchPushState: [],
          resultArtifact: null,
          detail: `Managed checkpoint execution failed closed with ${code}.`,
        }
        await this.#completeInstruction(state, packet, task.comments)
        return {
          status: "needs_review",
          instructionId: instruction.instructionId,
          ownerRequest: null,
        }
      }

      const checks = uniformChecks("not_run")
      checks.diffCheck = "pass"
      const packet = {
        instructionId: instruction.instructionId,
        originIssueNumber: state.task.originIssueNumber,
        originIssueUrl: state.task.originIssueUrl,
        codexThreadId: state.threadId,
        status: "needs_review",
        branch: workspaceState.branch,
        commits: workspaceState.commits,
        changedFiles: workspaceState.changedFiles,
        checks,
        ownerQuestion: null,
        ownerRequest: null,
        blockers: [],
        ownerGates: [],
        productionReadback: [],
        safetyFindings: [],
        branchPushState: [
          `Branch/current HEAD: \`${workspaceState.branch}\` at \`${plan.value.receipt.head}\``,
          "Push/PR: **NOT ATTEMPTED**",
        ],
        resultArtifact: null,
        detail:
          "The runtime executed and verified exactly one checkpoint-bound cherry-pick, persisted its immutable receipt, started no Codex turn, and stopped before push or PR.",
      }
      await this.#completeInstruction(state, packet, task.comments)
      return {
        status: "needs_review",
        instructionId: instruction.instructionId,
        ownerRequest: null,
      }
    }

    let gitExecutionBoundaryRejection = null
    const gitExecutionBoundary =
      await this.workspace.authorizedGitExecutionBoundary({
        state,
        instruction,
        task,
        workspacePath: state.workspacePath,
        workspaceRoot: path.join(this.store.directory, "workspaces"),
        checkoutPath: this.config.checkoutPath,
        repository: this.config.repository,
        baseRef: this.config.baseRef,
        onDiagnostic: (diagnostic) => {
          gitExecutionBoundaryRejection = diagnostic
        },
      })
    if (gitExecutionBoundary?.checkpointActivation) {
      state.gitReconciliationCheckpoints ??= []
      if (gitExecutionBoundary.checkpointActivationIsNew) {
        gitExecutionBoundary.checkpointActivation.activatedAt =
          new Date().toISOString()
        state.gitReconciliationCheckpoints.push(
          gitExecutionBoundary.checkpointActivation,
        )
        await this.#save(state)
        await this.store.appendEvent({
          type: "git_reconciliation_checkpoint_activated",
          code: "checkpoint_activation_accepted",
          checkpointId: gitExecutionBoundary.checkpointId,
          instructionId: instruction.instructionId,
          issueNumber: state.task.originIssueNumber,
          branch: state.branch,
          head: gitExecutionBoundary.head,
          generation: gitExecutionBoundary.checkpointGeneration ?? null,
          generationId: gitExecutionBoundary.checkpointGenerationId ?? null,
        })
      }
    }
    const activationRecoveryBinding =
      state.activeInstruction.checkpointActivationRecovery ?? null
    if (gitExecutionBoundary && activationRecoveryBinding) {
      const recoveries = (state.checkpointActivationRecoveries ?? []).filter(
        (record) => record.recoveryId === activationRecoveryBinding.recoveryId,
      )
      if (
        recoveries.length !== 1 ||
        !new Set(["selected", "boundary_activated"]).has(
          recoveries[0].status,
        ) ||
        (recoveries[0].status === "selected" &&
          recoveries[0].boundaryActivatedAt !== null) ||
        (recoveries[0].status === "boundary_activated" &&
          !Number.isFinite(
            Date.parse(recoveries[0].boundaryActivatedAt ?? ""),
          ))
      ) {
        throw new Error(
          "Refusing to activate an ambiguous checkpoint activation recovery",
        )
      }
      if (recoveries[0].status === "selected") {
        recoveries[0].status = "boundary_activated"
        recoveries[0].boundaryActivatedAt = new Date().toISOString()
        state.activeInstruction.phase = "boundary_activated"
        await this.#save(state)
        await this.store.appendEvent({
          type: "checkpoint_activation_recovery_activated",
          code: "activation_recovery_accepted",
          recoveryId: recoveries[0].recoveryId,
          instructionId: instruction.instructionId,
          checkpointId: recoveries[0].checkpointId,
          generationId: recoveries[0].generationId,
          branch: recoveries[0].branch,
          head: recoveries[0].head,
        })
      } else if (state.activeInstruction.phase === "selected") {
        state.activeInstruction.phase = "boundary_activated"
        await this.#save(state)
      }
    }
    if (gitExecutionBoundary) {
      await this.store.appendEvent({
        type: "git_execution_boundary_activated",
        code: "activation_accepted",
        instructionId: instruction.instructionId,
        issueNumber: state.task.originIssueNumber,
        branch: state.branch,
        head: gitExecutionBoundary.head,
        provenanceMode:
          gitExecutionBoundary.provenanceMode ?? "injected_boundary",
        priorPredicateCode: gitExecutionBoundary.priorPredicateCode ?? null,
        reconciliationInstructionId:
          gitExecutionBoundary.reconciliationInstructionId ?? null,
        interveningRunCount:
          gitExecutionBoundary.interveningExecutionInstructionIds?.length ?? 0,
        writablePathCount: gitExecutionBoundary.writablePaths.length,
        checkpointId: gitExecutionBoundary.checkpointId ?? null,
        checkpointGeneration:
          gitExecutionBoundary.checkpointGeneration ?? null,
        checkpointGenerationId:
          gitExecutionBoundary.checkpointGenerationId ?? null,
      })
    } else {
      await this.store.appendEvent({
        type: "git_execution_boundary_rejected",
        instructionId: instruction.instructionId,
        issueNumber: state.task.originIssueNumber,
        branch: state.branch,
        ...(gitExecutionBoundaryRejection ?? {
          code: "activation_unclassified",
        }),
      })
    }

    if (
      !gitExecutionBoundary &&
      checkpointInstructionKind === "activation" &&
      new Set(["selected", "boundary_activated", "thread_ready"]).has(
        state.activeInstruction.phase,
      )
    ) {
      const rejectionCode =
        gitExecutionBoundaryRejection?.code ?? "activation_unclassified"
      if (activationRecoveryBinding) {
        const recoveries = (state.checkpointActivationRecoveries ?? []).filter(
          (record) => record.recoveryId === activationRecoveryBinding.recoveryId,
        )
        if (
          recoveries.length !== 1 ||
          !new Set(["selected", "boundary_activated"]).has(
            recoveries[0].status,
          ) ||
          recoveries[0].completedAt !== null
        ) {
          throw new Error(
            "Refusing to reject an ambiguous checkpoint activation recovery",
          )
        }
        recoveries[0].status = "rejected"
        recoveries[0].completedAt = new Date().toISOString()
        recoveries[0].outcome = "needs_review"
        recoveries[0].rejectionCode = rejectionCode
        state.resultCorrectionInstructionIds = (
          state.resultCorrectionInstructionIds ?? []
        ).filter(
          (instructionId) => instructionId !== instruction.instructionId,
        )
        state.activeInstruction = null
        state.status = "needs_review"
        await this.#save(state)
        await this.store.appendEvent({
          type: "checkpoint_activation_recovery_rejected",
          code: rejectionCode,
          recoveryId: recoveries[0].recoveryId,
          instructionId: instruction.instructionId,
          checkpointId: recoveries[0].checkpointId,
          generationId: recoveries[0].generationId,
        })
        return {
          status: "needs_review",
          instructionId: instruction.instructionId,
          ownerRequest: null,
        }
      }

      const workspaceState = await this.workspace.inspectWorkspace(
        state.workspacePath,
        this.config.baseRef,
      )
      const packet = {
        instructionId: instruction.instructionId,
        originIssueNumber: state.task.originIssueNumber,
        originIssueUrl: state.task.originIssueUrl,
        codexThreadId: state.threadId,
        status: "needs_review",
        branch: workspaceState.branch,
        commits: workspaceState.commits,
        changedFiles: workspaceState.changedFiles,
        checks: uniformChecks("not_run"),
        ownerQuestion: null,
        ownerRequest: null,
        blockers: [rejectionCode],
        ownerGates: [],
        productionReadback: [],
        safetyFindings: [],
        branchPushState: [],
        resultArtifact: null,
        detail: `Checkpoint activation failed closed before Codex turn startup with ${rejectionCode}.`,
      }
      await this.#completeInstruction(state, packet, task.comments)
      return {
        status: "needs_review",
        instructionId: instruction.instructionId,
        ownerRequest: null,
      }
    }

    await ensureTaskThread({
      appServer: this.appServer,
      state,
      workspacePath: state.workspacePath,
      model: this.config.model,
      gitExecutionBoundary,
      save: (nextState) => this.#save(nextState),
    })
    await this.#postPickup(state, instruction, task.comments)

    let turnResult =
      state.activeInstruction.phase === "turn_completed"
        ? state.activeInstruction.completedTurnResult
        : null
    if (
      state.activeInstruction.phase === "turn_completed" &&
      !turnResult
    ) {
      throw new Error(
        "Persisted completed turn is missing its durable result artifact",
      )
    }

    if (state.activeInstruction.phase === "turn_started") {
      const recovered = await this.appServer.readThread(state.threadId)
      const priorTurn = recovered.thread?.turns?.find(
        (turn) => turn.id === state.activeInstruction.turnId,
      )
      if (priorTurn?.status === "completed") {
        turnResult = recordCompletedTurnResult(state, {
          status: "completed",
          turn: priorTurn,
          pendingOwnerRequest: null,
        })
        await this.#save(state)
      }
      if (
        !turnResult &&
        new Set(["inProgress", "in_progress", "running"]).has(
          priorTurn?.status,
        )
      ) {
        const turnStartedAt = Date.parse(
          state.activeInstruction.turnStartedAt ??
            state.activeInstruction.selectedAt ??
            "",
        )
        const recoveryAgeMs = Number.isFinite(turnStartedAt)
          ? Date.now() - turnStartedAt
          : Number.POSITIVE_INFINITY
        if (recoveryAgeMs < this.config.turnTimeoutMs) {
          await this.store.appendEvent({
            type: "turn_recovery_deferred",
            instructionId: instruction.instructionId,
            threadId: state.threadId,
            turnId: state.activeInstruction.turnId,
            recoveryAgeMs,
          })
          return {
            status: "claim_deferred",
            instructionId: instruction.instructionId,
          }
        }
        if (
          !Number.isFinite(
            Date.parse(state.activeInstruction.turnTimedOutAt ?? ""),
          )
        ) {
          state.activeInstruction.turnTimedOutAt = new Date().toISOString()
          await this.#save(state)
        }
        if (
          !Number.isFinite(
            Date.parse(
              state.activeInstruction.turnInterruptRequestedAt ?? "",
            ),
          )
        ) {
          try {
            await this.appServer.interruptTurn?.(
              state.threadId,
              state.activeInstruction.turnId,
            )
            state.activeInstruction.turnInterruptRequestedAt =
              new Date().toISOString()
            await this.#save(state)
            await this.store.appendEvent({
              type: "stale_turn_interrupt_requested",
              instructionId: instruction.instructionId,
              turnId: state.activeInstruction.turnId,
            })
          } catch (error) {
            await this.store.appendEvent({
              type: "stale_turn_interrupt_failed",
              instructionId: instruction.instructionId,
              turnId: state.activeInstruction.turnId,
              error: error.message,
            })
            throw new Error("Persisted turn timed out and interruption failed")
          }
        }
        throw new Error(
          "Persisted turn timed out; waiting for terminal interruption state",
        )
      }
      if (
        !turnResult &&
        (!priorTurn ||
          !new Set(["failed", "interrupted", "cancelled", "canceled"]).has(
            priorTurn?.status,
          ))
      ) {
        await this.store.appendEvent({
          type: "turn_recovery_unconfirmed",
          instructionId: instruction.instructionId,
          threadId: state.threadId,
          turnId: state.activeInstruction.turnId,
          status: priorTurn?.status ?? null,
        })
        return {
          status: "claim_deferred",
          instructionId: instruction.instructionId,
        }
      }
      if (!turnResult) {
        state.activeInstruction.phase = "thread_ready"
        state.activeInstruction.attempts += 1
        await this.#save(state)
      }
    }

    if (
      !turnResult &&
      !gitExecutionBoundary &&
      checkpointInstructionKind === "activation"
    ) {
      const rejectionCode =
        gitExecutionBoundaryRejection?.code ?? "activation_unclassified"
      const recoveryBinding =
        state.activeInstruction.checkpointActivationRecovery ?? null
      if (!recoveryBinding) {
        throw new Error(
          "Refusing to restart a checkpoint activation without its boundary",
        )
      }
      const recoveries = (state.checkpointActivationRecoveries ?? []).filter(
        (record) => record.recoveryId === recoveryBinding.recoveryId,
      )
      if (
        recoveries.length !== 1 ||
        recoveries[0].status !== "boundary_activated" ||
        recoveries[0].completedAt !== null
      ) {
        throw new Error(
          "Refusing to restart an ambiguous checkpoint activation recovery",
        )
      }
      recoveries[0].status = "rejected"
      recoveries[0].completedAt = new Date().toISOString()
      recoveries[0].outcome = "needs_review"
      recoveries[0].rejectionCode = rejectionCode
      state.resultCorrectionInstructionIds = (
        state.resultCorrectionInstructionIds ?? []
      ).filter(
        (instructionId) => instructionId !== instruction.instructionId,
      )
      state.activeInstruction = null
      state.status = "needs_review"
      await this.#save(state)
      await this.store.appendEvent({
        type: "checkpoint_activation_recovery_rejected",
        code: rejectionCode,
        recoveryId: recoveries[0].recoveryId,
        instructionId: instruction.instructionId,
        checkpointId: recoveries[0].checkpointId,
        generationId: recoveries[0].generationId,
      })
      return {
        status: "needs_review",
        instructionId: instruction.instructionId,
        ownerRequest: null,
      }
    }

    if (!turnResult) {
      turnResult = await this.#runWithRetries(
        state,
        instruction,
        gitExecutionBoundary,
      )
      turnResult = recordCompletedTurnResult(state, turnResult)
      await this.#save(state)
    }
    let packet
    try {
      packet = await this.#packetFromWorkspace(state, instruction, turnResult)
    } catch (error) {
      const workspaceState = await this.workspace.inspectWorkspace(
        state.workspacePath,
        this.config.baseRef,
      )
      const resultArtifact =
        turnResult.resultArtifact ??
        state.activeInstruction?.resultArtifact ??
        resultArtifactFromTurnResult(turnResult)
      const findings = resultArtifact.findings ?? {}
      packet = {
        instructionId: instruction.instructionId,
        originIssueNumber: state.task.originIssueNumber,
        originIssueUrl: state.task.originIssueUrl,
        codexThreadId: state.threadId,
        status: "failed",
        branch: workspaceState.branch,
        commits: workspaceState.commits,
        changedFiles: workspaceState.changedFiles,
        checks: checksFromResultArtifact(resultArtifact),
        ownerQuestion: findings.ownerGates?.[0] ?? null,
        ownerRequest: compactOwnerRequest(turnResult.pendingOwnerRequest),
        blockers: [...(findings.blockers ?? [])],
        ownerGates: [...(findings.ownerGates ?? [])],
        productionReadback: [...(findings.productionReadback ?? [])],
        safetyFindings: [...(findings.safetyFindings ?? [])],
        branchPushState: [...(findings.branchPushState ?? [])],
        resultArtifact,
        detail: error.message,
      }
    }
    await this.#completeInstruction(state, packet, task.comments)
    return {
      status: packet.status,
      instructionId: instruction.instructionId,
      ownerRequest: packet.ownerRequest ?? null,
    }
  }

  async watch({ signal } = {}) {
    await this.start()
    await this.store.appendEvent({
      type: "watch_started",
      pid: process.pid,
      repository: this.config.repository,
      issueNumber: this.config.issueNumber,
      pollMs: this.config.pollMs,
    })
    while (!signal?.aborted) {
      try {
        await this.runOnce()
      } catch (error) {
        await this.store.appendEvent({ type: "poll_failed", error: error.message })
      }
      try {
        await delay(this.config.pollMs, undefined, { signal })
      } catch (error) {
        if (error.name !== "AbortError") throw error
      }
    }
  }

  async stop() {
    await this.appServer.stop()
    this.started = false
  }
}
