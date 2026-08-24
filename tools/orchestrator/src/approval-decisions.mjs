import { createHash } from "node:crypto"
import {
  controlPlaneBindingDigest,
  listAgentControls,
  listOwnerGateAcknowledgements,
  ownerGateAcknowledgementId,
} from "./control-plane.mjs"
import { extractIssueNumber } from "./repository-discovery.mjs"

export const ownerApprovalDecisionTtlMs = 24 * 60 * 60 * 1_000

const launchAgentScope =
  "launchagent:koalafrog:user:install-reload:content-addressed-runtime:stable-checkout"
const approvalRecoveryCommitScope =
  "git:commit:issue-53:staged-reviewed-orchestrator-approval-recovery"
const checkpointActivationRequestMethod =
  "control-plane/gitReconciliationCheckpointActivation"
const genericOwnerGateMethod = "control-plane/ownerGate"

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function digest(value) {
  return createHash("sha256").update(normalize(value)).digest("hex")
}

function hasLaunchAgentScope(value) {
  const normalized = normalize(value)
  return Boolean(
    /\bkoalafrog\b/.test(normalized) &&
      /\buser(?: level)? launchagent\b/.test(normalized) &&
      /\binstall(?:ation|ing)?\b/.test(normalized) &&
      /\breload(?:ing)?\b/.test(normalized) &&
      /\bcontent addressed (?:orchestrator )?runtime\b/.test(normalized) &&
      /\bstable coordinating checkout\b/.test(normalized),
  )
}

function hasApprovalRecoveryCommitScope(value, { requireIssue = true } = {}) {
  const normalized = normalize(value)
  return Boolean(
    /\b(?:create|complete)\b/.test(normalized) &&
      /\b(?:exactly one|the authorized issue 53) commit\b/.test(normalized) &&
      /\balready staged\b/.test(normalized) &&
      /\breviewed orchestrator approval recovery files\b/.test(normalized) &&
      (!requireIssue || /\bissue 53\b/.test(normalized)),
  )
}

const broaderPendingActionPattern =
  /\b(?:deploy(?:ment)?|merge|force[- ]?push|migration|schema|production data|secrets?|credentials?|purchases?|payments?|external account|default branch|main branch|git (?:reset|clean)|rewrite history|destructive git|another (?:mac|repository)|system wide)\b/i

export function pendingActionScope(request, { allowLegacy = false } = {}) {
  if (!request) return null
  if (
    !allowLegacy &&
    request.method !== "item/commandExecution/requestApproval"
  ) {
    return null
  }
  const reason = String(request.reason ?? "")
  if (!normalize(reason) || broaderPendingActionPattern.test(reason)) return null
  if (hasLaunchAgentScope(reason)) return launchAgentScope
  if (hasApprovalRecoveryCommitScope(reason)) {
    return approvalRecoveryCommitScope
  }
  return `command:${digest(reason)}`
}

function approvedParagraph(prompt, pendingScope) {
  return String(prompt ?? "")
    .split(/\n\s*\n/)
    .find(
      (paragraph) =>
        /\bowner\b[\s\S]{0,80}\bapprov(?:al|ed)\b/i.test(paragraph) &&
        ((pendingScope === launchAgentScope && hasLaunchAgentScope(paragraph)) ||
          (pendingScope === approvalRecoveryCommitScope &&
            hasApprovalRecoveryCommitScope(paragraph, {
              requireIssue: false,
            }))),
    )
}

export function decisionInstructionScope(instruction, pendingRequest = null) {
  if (
    instruction?.action !== "continue" ||
    instruction?.taskState !== "needs_owner" ||
    instruction?.ownerApprovalRequired !== false
  ) {
    return null
  }
  const pendingScope = pendingActionScope(pendingRequest, { allowLegacy: true })
  const paragraph = approvedParagraph(instruction.prompt, pendingScope)
  if (paragraph) return pendingScope

  const normalizedReason = normalize(pendingRequest?.reason)
  const exactParagraph = String(instruction.prompt ?? "")
    .split(/\n\s*\n/)
    .find(
      (candidate) =>
        /\bowner\b[\s\S]{0,80}\bapprov(?:al|ed)\b/i.test(candidate) &&
        normalizedReason &&
        normalize(candidate).includes(normalizedReason),
    )
  return exactParagraph ? pendingScope : null
}

function latestPendingRun(state) {
  return [...(state.runs ?? [])]
    .reverse()
    .find((run) => run.status === "needs_owner" && run.completedAt)
}

function requestIdentity(request) {
  return {
    requestId: request?.requestId ?? null,
    method: request?.method ?? null,
    threadId: request?.threadId ?? null,
    turnId: request?.turnId ?? null,
    itemId: request?.itemId ?? null,
  }
}

export function pendingApprovalRequestKey(
  request,
  { allowLegacy = false } = {},
) {
  const scope = pendingActionScope(request, { allowLegacy })
  const reasonDigest = digest(request?.reason)
  return scope ? `${scope}:${reasonDigest}` : null
}

export function recordPendingApprovalRequest({
  state,
  instructionId,
  request,
  now = new Date(),
  allowLegacy = false,
}) {
  state.pendingApprovalRequests ??= []
  const scope = pendingActionScope(request, { allowLegacy })
  const key = pendingApprovalRequestKey(request, { allowLegacy })
  if (!scope || !key) return null
  const identity = requestIdentity(request)
  const identityDigest = digest(JSON.stringify(identity))
  let pending = state.pendingApprovalRequests.find(
    (candidate) => candidate.key === key && !candidate.clearedAt,
  )
  if (!pending) {
    pending = {
      schemaVersion: 1,
      key,
      scope,
      reason: String(request.reason),
      reasonDigest: digest(request.reason),
      sourceInstructionId: instructionId ?? null,
      capturedAt: now.toISOString(),
      lastObservedAt: now.toISOString(),
      status: "interrupted",
      requestIdentities: [],
      decisionId: null,
      clearedAt: null,
      clearReason: null,
    }
    state.pendingApprovalRequests.push(pending)
  } else {
    pending.lastObservedAt = now.toISOString()
    pending.sourceInstructionId = instructionId ?? pending.sourceInstructionId
    pending.status = "interrupted"
  }
  if (
    !pending.requestIdentities.some(
      (candidate) => candidate.identityDigest === identityDigest,
    )
  ) {
    pending.requestIdentities.push({
      ...identity,
      identityDigest,
      observedAt: now.toISOString(),
    })
    pending.requestIdentities = pending.requestIdentities.slice(-8)
  }
  return pending
}

export function recoverPendingApprovalRequestsFromEvents(
  events = [],
  now = new Date(),
) {
  const state = { pendingApprovalRequests: [] }
  const instructionByTurn = new Map()
  const pendingByTurn = new Map()
  for (const event of events) {
    if (event?.type === "turn_started" && event.turnId) {
      instructionByTurn.set(event.turnId, event.instructionId ?? null)
      continue
    }
    if (
      event?.type === "server_request" &&
      event.message?.method === "item/commandExecution/requestApproval"
    ) {
      const request = {
        requestId: event.message.id,
        method: event.message.method,
        threadId: event.message.threadId,
        turnId: event.message.turnId,
        itemId: event.message.itemId,
        reason: event.message.reason,
      }
      const pending = recordPendingApprovalRequest({
        state,
        instructionId: instructionByTurn.get(request.turnId) ?? null,
        request,
        now: new Date(event.at),
      })
      if (pending && request.turnId) pendingByTurn.set(request.turnId, pending)
      continue
    }
    if (
      event?.type === "server_request_auto_resolved" &&
      event.message?.turnId
    ) {
      const pending = pendingByTurn.get(event.message.turnId)
      if (pending) {
        pending.clearedAt = event.at
        pending.clearReason = "legacy_auto_resolved"
        pending.status = "completed"
      }
    }
  }
  return state.pendingApprovalRequests.filter((pending) => {
    const observedAt = Date.parse(pending.lastObservedAt)
    return (
      !pending.clearedAt &&
      Number.isFinite(observedAt) &&
      now.getTime() - observedAt <= ownerApprovalDecisionTtlMs
    )
  })
}

function pendingRequests(state) {
  const durable = (state.pendingApprovalRequests ?? []).filter(
    (pending) => !pending.clearedAt,
  )
  if (durable.length || !state.pendingOwnerRequest) return durable
  const pending = recordPendingApprovalRequest({
    state,
    instructionId: latestPendingRun(state)?.instructionId ?? null,
    request: state.pendingOwnerRequest,
    now: new Date(latestPendingRun(state)?.completedAt ?? Date.now()),
    allowLegacy: true,
  })
  return pending ? [pending] : []
}

export function registerOwnerApprovalDecisions({
  state,
  controls,
  now = new Date(),
  ttlMs = ownerApprovalDecisionTtlMs,
}) {
  state.ownerApprovalDecisions ??= []
  const registered = []
  for (const pending of pendingRequests(state)) {
    const pendingAt = Date.parse(pending.lastObservedAt ?? pending.capturedAt)
    if (!Number.isFinite(pendingAt) || now.getTime() - pendingAt > ttlMs) {
      continue
    }
    const instruction = [...controls]
      .reverse()
      .find(
        (control) =>
          decisionInstructionScope(control, {
            method: "item/commandExecution/requestApproval",
            reason: pending.reason,
          }) === pending.scope,
      )
    if (!instruction) continue

    const existing = state.ownerApprovalDecisions.find(
      (decision) => decision.decisionId === instruction.instructionId,
    )
    if (existing) {
      if (
        existing.scope !== pending.scope ||
        existing.pendingReasonDigest !== pending.reasonDigest
      ) {
        throw new Error("Owner approval decision ID was reused for another action")
      }
      pending.decisionId = existing.decisionId
      registered.push(existing)
      continue
    }

    const decision = {
      schemaVersion: 2,
      decisionId: instruction.instructionId,
      scope: pending.scope,
      pendingRequestKey: pending.key,
      pendingInstructionId: pending.sourceInstructionId,
      pendingReasonDigest: pending.reasonDigest,
      registeredAt: now.toISOString(),
      expiresAt: new Date(pendingAt + ttlMs).toISOString(),
      consumedAt: null,
      consumedRequestDigest: null,
      completedAt: null,
    }
    pending.decisionId = decision.decisionId
    state.ownerApprovalDecisions.push(decision)
    registered.push(decision)
  }
  return registered
}

export function registerOwnerApprovalDecision({
  state,
  controls,
  now = new Date(),
  ttlMs = ownerApprovalDecisionTtlMs,
}) {
  const registered = registerOwnerApprovalDecisions({
    state,
    controls,
    now,
    ttlMs,
  })
  return registered.at(-1) ?? null
}

export function consumeOwnerApprovalDecision({
  state,
  request,
  now = new Date(),
}) {
  const scope = pendingActionScope(request)
  if (!scope) return null
  const requestReasonDigest = digest(request.reason)
  const decision = (state.ownerApprovalDecisions ?? []).find(
    (candidate) =>
      candidate.scope === scope &&
      candidate.pendingReasonDigest === requestReasonDigest &&
      !candidate.consumedAt &&
      Date.parse(candidate.expiresAt) > now.getTime(),
  )
  if (!decision) return null

  decision.consumedAt = now.toISOString()
  decision.consumedRequestDigest = requestReasonDigest
  const pending = (state.pendingApprovalRequests ?? []).find(
    (candidate) => candidate.key === decision.pendingRequestKey,
  )
  if (pending) {
    pending.status = "decision_consumed"
    pending.decisionId = decision.decisionId
  }
  return {
    decision,
    response: { decision: "accept" },
  }
}

export function completeOwnerApprovedAction({
  state,
  decisionId,
  succeeded,
  now = new Date(),
}) {
  const decision = (state.ownerApprovalDecisions ?? []).find(
    (candidate) => candidate.decisionId === decisionId,
  )
  if (!decision?.consumedAt || decision.completedAt) return null
  const pending = (state.pendingApprovalRequests ?? []).find(
    (candidate) => candidate.key === decision.pendingRequestKey,
  )
  if (!succeeded) {
    if (pending) pending.status = "approved_action_failed"
    return { decision, pending, cleared: false }
  }
  decision.completedAt = now.toISOString()
  if (pending) {
    pending.status = "completed"
    pending.clearedAt = now.toISOString()
    pending.clearReason = "approved_action_succeeded"
  }
  return { decision, pending, cleared: true }
}

export function supersedePendingApprovalRequests({ state, now = new Date() }) {
  for (const pending of state.pendingApprovalRequests ?? []) {
    if (pending.clearedAt) continue
    pending.status = "superseded"
    pending.clearedAt = now.toISOString()
    pending.clearReason = "new_task_superseded_pending_action"
  }
}

function currentIssueUrl(task) {
  return (
    task?.issue?.html_url ??
    task?.issue?.display_url ??
    task?.issue?.url ??
    null
  )
}

function sameStringArray(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  )
}

function ownerGateRejected(code, context = {}) {
  return { accepted: false, rejection: { code, ...context } }
}

function ownerGateAccepted(value) {
  return { accepted: true, value }
}

function normalizedChangedFiles(value) {
  if (!Array.isArray(value) || value.some((file) => typeof file !== "string")) {
    return null
  }
  return [...new Set(value)].sort()
}

const legacyCheckpointActivationInstructionId =
  "production-day1-git-reconciliation-checkpoint-generation-activation-023"
const legacyCheckpointNoMutationFinding =
  "No fallback Git path, sibling metadata access, source change, production action, deployment, migration, purchase, or receipt mutation occurred."

function oneHistoricalPromptValue(prompt, pattern) {
  const matches = [...prompt.matchAll(pattern)]
  return matches.length === 1 ? matches[0][1] : null
}

function normalizedHistoricalPromptLines(prompt) {
  return prompt
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^- cherry-pick only:\s+/, "- cherry-pick only "),
    )
    .filter(Boolean)
}

function historicalCheckpointActivationPromptDecision({
  state,
  proposal,
  prompt,
  activationPrompt,
}) {
  if (prompt === activationPrompt) {
    return ownerGateAccepted({ mode: "owner_gate_stop_exact_prompt" })
  }
  if (typeof prompt !== "string") {
    return ownerGateRejected("owner_gate_prior_attempt_prompt_binding")
  }
  const checkpointId = oneHistoricalPromptValue(
    prompt,
    /^The owner explicitly approves activation of superseding Git reconciliation checkpoint `(git-reconciliation-checkpoint:[0-9a-f]{64})`\.$/gm,
  )
  const generation = oneHistoricalPromptValue(
    prompt,
    /^The owner explicitly approves only superseding generation `([1-9][0-9]*)` with generation ID `git-reconciliation-checkpoint-generation:[0-9a-f]{64}`\.$/gm,
  )
  const generationId = oneHistoricalPromptValue(
    prompt,
    /^The owner explicitly approves only superseding generation `[1-9][0-9]*` with generation ID `(git-reconciliation-checkpoint-generation:[0-9a-f]{64})`\.$/gm,
  )
  const reconciliationReference = oneHistoricalPromptValue(
    prompt,
    /^- reconciliation receipt:\s*`([^`\n]+)`\s*$/gm,
  )
  const branch = oneHistoricalPromptValue(
    prompt,
    /^- branch:\s*`([^`\n]+)`\s*$/gm,
  )
  const head = oneHistoricalPromptValue(
    prompt,
    /^- starting exactly from HEAD:\s*`([0-9a-f]{40})`\s*$/gm,
  )
  const tree = oneHistoricalPromptValue(
    prompt,
    /^- tree:\s*`([0-9a-f]{40})`\s*$/gm,
  )
  const cherryPickCommit = oneHistoricalPromptValue(
    prompt,
    /^- cherry-pick only:?\s*`([0-9a-f]{40})`\s*$/gm,
  )
  const matchingReceipts = (state.workspaceBranchReconciliations ?? []).filter(
    (record) =>
      record.reconciliationId === proposal.reconciliationId &&
      record.originIssueNumber === proposal.originIssueNumber &&
      record.originIssueUrl === proposal.originIssueUrl &&
      record.threadId === proposal.threadId &&
      record.workspacePath === proposal.workspacePath &&
      record.toBranch === proposal.branch &&
      record.head === proposal.head,
  )
  const reconciliationMatches =
    reconciliationReference === proposal.reconciliationId ||
    (matchingReceipts.length === 1 &&
      reconciliationReference ===
        matchingReceipts[0].continuationInstructionId)
  const lines = normalizedHistoricalPromptLines(prompt)
  const isProhibition = (line) =>
    !/\b(?:also|but|except|unless|then)\b/i.test(line) &&
    (/^(?:do not|must not)\b/i.test(line) ||
      /\b(?:does not authorize|not authorized|not attempted)\b/i.test(line))
  const isKnownScopeLine = (line) => {
    if (
      line ===
        `The owner explicitly approves activation of superseding Git reconciliation checkpoint \`${proposal.checkpointId}\`.` ||
      line ===
        `The owner explicitly approves only superseding generation \`${proposal.generation}\` with generation ID \`${proposal.generationId}\`.`
    ) {
      return true
    }
    if (
      line ===
      `- reconciliation receipt: \`${reconciliationReference}\``
    ) {
      return true
    }
    if (
      new Set([
        `- branch: \`${proposal.branch}\``,
        `- starting exactly from HEAD: \`${proposal.head}\``,
        `- tree: \`${proposal.tree}\``,
      ]).has(line)
    ) {
      return true
    }
    if (/^The exact checkpoint and generation binding is approved\.$/i.test(line)) {
      return true
    }
    if (
      /^The owner explicitly approves the exact linked-worktree Git metadata writes required for (?:this|the) checkpoint and no broader filesystem access\.$/i.test(
        line,
      )
    ) {
      return true
    }
    if (/^execute only this approved git path:?$/i.test(line)) return true
    if (
      /^(?:[0-9]+\. )?activate only the selected linked-worktree metadata boundary;?$/i.test(
        line,
      )
    ) {
      return true
    }
    if (
      /^(?:- |[0-9]+\. )/.test(line) &&
      new Set([
        `cherry-pick only \`${proposal.cherryPickCommit}\``,
        `cherry-pick only \`${proposal.cherryPickCommit}\`;`,
      ]).has(line.replace(/^(?:- |[0-9]+\. )/, ""))
    ) {
      return true
    }
    if (
      /^[0-9]+\. if and only if validation is green, push the new integration branch normally and open a PR for review;?$/i.test(
        line,
      )
    ) {
      return true
    }
    if (/^[0-9]+\. run the established complete validation suite;?$/i.test(line)) {
      return true
    }
    if (/^[0-9]+\. stop at review\.?$/i.test(line)) return true
    return isProhibition(line)
  }
  const scopeVocabulary =
    /\b(?:approve\w*|authoriz\w*|permit\w*|grant\w*|allow\w*|execute\w*|activate\w*|cherry-pick|push\w*|pr|merge\w*|deploy\w*|migrat\w*|production|purchase\w*|receipt\w*|filesystem|access\w*|write\w*)\b/i
  const scopeConflictIndex = lines.findIndex(
    (line) => scopeVocabulary.test(line) && !isKnownScopeLine(line),
  )
  const quotedValues = [...prompt.matchAll(/`([^`\n]+)`/g)].map(
    (match) => match[1],
  )
  const allowedQuotedValues = new Set([
    proposal.checkpointId,
    String(proposal.generation),
    proposal.generationId,
    reconciliationReference,
    proposal.branch,
    proposal.head,
    proposal.tree,
    proposal.cherryPickCommit,
  ])
  const predicates = {
    checkpoint: checkpointId === proposal.checkpointId,
    generation: Number(generation) === proposal.generation,
    generation_id: generationId === proposal.generationId,
    reconciliation: reconciliationMatches,
    branch: branch === proposal.branch,
    head: head === proposal.head,
    tree: tree === proposal.tree,
    cherry_pick: cherryPickCommit === proposal.cherryPickCommit,
    scope: scopeConflictIndex === -1,
    quoted_values:
      quotedValues.length > 0 &&
      quotedValues.every((value) => allowedQuotedValues.has(value)),
  }
  const failedPredicate = Object.entries(predicates).find(
    ([, accepted]) => !accepted,
  )?.[0]
  return !failedPredicate
    ? ownerGateAccepted({
        mode:
          reconciliationReference === proposal.reconciliationId
            ? "owner_gate_stop_structural_prompt"
            : "owner_gate_stop_structural_receipt_alias",
      })
    : ownerGateRejected("owner_gate_prior_attempt_prompt_binding", {
        predicate: failedPredicate,
      })
}

function legacyCheckpointActivationAttemptDecision({
  state,
  run,
  control,
  proposal,
  activationPrompt,
}) {
  if (run.instructionId !== legacyCheckpointActivationInstructionId) {
    return ownerGateRejected("owner_gate_prior_attempt_not_legacy")
  }
  const changedFiles = normalizedChangedFiles(run.changedFiles)
  const artifact = run.resultArtifact
  const commandEvidence = artifact?.checks?.diffCheck?.evidence?.filter(
    (evidence) => evidence?.source === "command_execution",
  )
  const summary = commandEvidence?.[0]?.summary ?? ""
  const finalMessage = artifact?.finalMessage ?? ""
  const expectedBranchState =
    `Branch/current HEAD: \`${proposal.branch}\` at \`${proposal.head}\``
  const artifactChecks = artifact?.checks ?? {}
  const nonDiffChecks = [
    "typecheck",
    "lint",
    "tests",
    "cloudflareReadiness",
    "build",
  ]
  const promptBinding = historicalCheckpointActivationPromptDecision({
    state,
    proposal,
    prompt: control.prompt,
    activationPrompt,
  })
  const acceptedShape =
    control.action === "continue" &&
    control.taskState === "needs_owner" &&
    control.ownerApprovalRequired === false &&
    promptBinding.accepted &&
    run.status === "needs_review" &&
    run.turnCount === 1 &&
    run.originIssueNumber === proposal.originIssueNumber &&
    run.originIssueUrl === proposal.originIssueUrl &&
    run.threadId === proposal.threadId &&
    run.workspacePath === proposal.workspacePath &&
    run.branch === proposal.branch &&
    sameStringArray(run.commits, [proposal.head]) &&
    changedFiles &&
    changedFiles.length === proposal.changedFileCount &&
    controlPlaneBindingDigest(JSON.stringify(changedFiles)) ===
      proposal.changedFilesDigest &&
    run.ownerRequest === null &&
    sameStringArray(run.blockers, []) &&
    sameStringArray(run.ownerGates, []) &&
    sameStringArray(run.safetyFindings, []) &&
    sameStringArray(run.productionReadback, [legacyCheckpointNoMutationFinding]) &&
    sameStringArray(run.branchPushState, [
      expectedBranchState,
      "Live remote foundation: **PASS**",
      "Push/PR: **NOT ATTEMPTED**",
    ]) &&
    run.checks?.diffCheck === "pass" &&
    nonDiffChecks.every((name) => run.checks?.[name] === "unknown") &&
    artifact?.version === 1 &&
    artifact.source === "completed_turn_final_message" &&
    artifact.turnStatus === "completed" &&
    artifact.checks?.diffCheck?.status === "pass" &&
    nonDiffChecks.every(
      (name) =>
        artifactChecks[name]?.status === "unknown" &&
        sameStringArray(artifactChecks[name]?.evidence, []),
    ) &&
    Array.isArray(commandEvidence) &&
    commandEvidence.length === 1 &&
    commandEvidence[0].status === "pass" &&
    /git status --porcelain=v1 --branch/.test(summary) &&
    /git branch --show-current/.test(summary) &&
    /git rev-parse HEAD/.test(summary) &&
    /git rev-list --count/.test(summary) &&
    ["CHERRY_PICK_HEAD", "MERGE_HEAD", "REVERT_HEAD", "REBASE_HEAD"].every(
      (marker) => summary.includes(marker),
    ) &&
    /git diff --check/.test(summary) &&
    /\(completed, exit 0\)/.test(summary) &&
    sameStringArray(
      artifact.findings?.productionReadback,
      run.productionReadback,
    ) &&
    sameStringArray(artifact.findings?.branchPushState, run.branchPushState) &&
    sameStringArray(artifact.findings?.blockers, []) &&
    sameStringArray(artifact.findings?.ownerGates, []) &&
    sameStringArray(artifact.findings?.safetyFindings, []) &&
    finalMessage.includes(expectedBranchState) &&
    finalMessage.includes(`Current tree: \`${proposal.tree}\``) &&
    finalMessage.includes("Checkpoint binding and lineage preflight: **PASS**") &&
    finalMessage.includes("Live remote foundation: **PASS**") &&
    finalMessage.includes("Cherry-pick: **FAILED before application**") &&
    finalMessage.includes("linked-worktree `index.lock: Operation not permitted`") &&
    finalMessage.includes(
      "Worktree: clean; zero commits above base; no Git operation markers",
    ) &&
    finalMessage.includes("Push/PR: **NOT ATTEMPTED**") &&
    finalMessage.includes(legacyCheckpointNoMutationFinding) &&
    Number.isFinite(Date.parse(run.completedAt ?? ""))
  return acceptedShape
    ? ownerGateAccepted({
        mode: `legacy_pre_application_failure:${promptBinding.value.mode}`,
      })
    : ownerGateRejected("owner_gate_prior_legacy_attempt_evidence", {
        instructionId: run.instructionId,
        predicate: promptBinding.accepted
          ? null
          : promptBinding.rejection.predicate,
      })
}

export function checkpointOwnerGateAttemptAuditDecision({
  state,
  task,
  proposal,
  activationPrompt,
  gateReason,
}) {
  const proposalRuns = (state.runs ?? []).filter(
    (run) => run.instructionId === proposal?.proposalInstructionId,
  )
  if (proposalRuns.length !== 1) {
    return ownerGateRejected("owner_gate_proposal_run_count", {
      runCount: proposalRuns.length,
    })
  }
  const proposalIndex = state.runs.indexOf(proposalRuns[0])
  const attempts = state.runs.slice(proposalIndex + 1)
  if (new Set(attempts.map((run) => run.instructionId)).size !== attempts.length) {
    return ownerGateRejected("owner_gate_prior_attempt_instruction_duplicate")
  }
  const controls = listAgentControls(task.issue, task.comments)
  const expectedChecks = [
    "typecheck",
    "lint",
    "tests",
    "cloudflareReadiness",
    "build",
    "diffCheck",
  ]
  const modes = []
  for (const run of attempts) {
    const matches = controls.filter(
      (control) => control.instructionId === run.instructionId,
    )
    if (matches.length !== 1) {
      return ownerGateRejected("owner_gate_prior_attempt_control_count", {
        instructionId: run.instructionId,
        controlCount: matches.length,
      })
    }
    const control = matches[0]
    if (run.instructionId === legacyCheckpointActivationInstructionId) {
      const legacy = legacyCheckpointActivationAttemptDecision({
        state,
        run,
        control,
        proposal,
        activationPrompt,
      })
      if (!legacy.accepted) return legacy
      modes.push(legacy.value.mode)
      continue
    }
    const changedFiles = normalizedChangedFiles(run.changedFiles)
    const promptBinding = historicalCheckpointActivationPromptDecision({
      state,
      proposal,
      prompt: control.prompt,
      activationPrompt,
    })
    if (
      control.action !== "continue" ||
      !new Set(["needs_owner", "needs_review"]).has(control.taskState) ||
      control.ownerApprovalRequired !== true ||
      !promptBinding.accepted ||
      run.status !== "needs_owner" ||
      run.turnCount !== 0 ||
      run.originIssueNumber !== proposal.originIssueNumber ||
      run.originIssueUrl !== proposal.originIssueUrl ||
      run.threadId !== proposal.threadId ||
      run.workspacePath !== proposal.workspacePath ||
      run.branch !== proposal.branch ||
      !sameStringArray(run.commits, []) ||
      !changedFiles ||
      changedFiles.length !== 0 ||
      run.resultArtifact !== null ||
      run.ownerRequest?.method !== genericOwnerGateMethod ||
      run.ownerRequest?.reason !== gateReason ||
      !sameStringArray(run.ownerGates, [gateReason]) ||
      !run.checks ||
      Object.keys(run.checks).length !== expectedChecks.length ||
      expectedChecks.some((check) => !Object.hasOwn(run.checks, check)) ||
      Object.values(run.checks).some((status) => status !== "not_run") ||
      !sameStringArray(run.blockers, []) ||
      !sameStringArray(run.productionReadback, []) ||
      !sameStringArray(run.safetyFindings, []) ||
      !sameStringArray(run.branchPushState, []) ||
      !Number.isFinite(Date.parse(run.completedAt ?? ""))
    ) {
      return ownerGateRejected("owner_gate_prior_attempt_mutation_or_binding", {
        instructionId: run.instructionId,
        predicate: promptBinding.accepted
          ? null
          : promptBinding.rejection.predicate,
      })
    }
    modes.push(promptBinding.value.mode)
  }
  const binding = attempts.map((run, index) => {
    const controlsForRun = controls.filter(
      (control) => control.instructionId === run.instructionId,
    )
    return {
      instructionId: run.instructionId,
      mode: modes[index],
      completedAt: run.completedAt,
      runDigest: controlPlaneBindingDigest(JSON.stringify(run)),
      controlDigest: controlPlaneBindingDigest(
        JSON.stringify(controlsForRun[0]),
      ),
    }
  })
  return ownerGateAccepted({
    instructionIds: attempts.map((run) => run.instructionId),
    digest: controlPlaneBindingDigest(JSON.stringify(binding)),
  })
}

export function registerCheckpointOwnerGateAcknowledgement({
  state,
  instruction,
  task,
  gateReason,
  pendingReason,
  now = new Date(),
}) {
  const activePhase = state?.activeInstruction?.phase
  const resumablePhases = new Set([
    "selected",
    "thread_ready",
    "turn_started",
    "turn_completed",
  ])
  if (
    !state?.activeInstruction ||
    state.activeInstruction.instructionId !== instruction?.instructionId ||
    !resumablePhases.has(activePhase) ||
    instruction.action !== "continue" ||
    instruction.taskState !== state.status ||
    instruction.ownerApprovalRequired !== true
  ) {
    return ownerGateRejected("owner_gate_active_instruction")
  }
  if (
    extractIssueNumber(task?.issue) !== state.task?.originIssueNumber ||
    currentIssueUrl(task) !== state.task?.originIssueUrl
  ) {
    return ownerGateRejected("owner_gate_origin")
  }
  const controls = listAgentControls(task.issue, task.comments).filter(
    (control) => control.instructionId === instruction.instructionId,
  )
  if (
    controls.length !== 1 ||
    controls[0].prompt !== instruction.prompt ||
    controls[0].ownerApprovalRequired !== true
  ) {
    return ownerGateRejected("owner_gate_control_count_or_binding", {
      controlCount: controls.length,
    })
  }
  const acknowledgements = listOwnerGateAcknowledgements(
    task.issue,
    task.comments,
  ).filter(
    (acknowledgement) =>
      acknowledgement.instructionId === instruction.instructionId,
  )
  if (
    acknowledgements.length !== 1 ||
    acknowledgements[0].pairedControls.length !== 1 ||
    acknowledgements[0].pairedControls[0].prompt !== instruction.prompt
  ) {
    return ownerGateRejected("owner_gate_acknowledgement_count_or_pairing", {
      acknowledgementCount: acknowledgements.length,
    })
  }
  const acknowledgement = acknowledgements[0]
  const checkpoints = state.gitReconciliationCheckpoints
  if (!Array.isArray(checkpoints)) {
    return ownerGateRejected("owner_gate_checkpoint_records_missing")
  }
  const proposals = checkpoints.filter((record) => record.kind === "proposal")
  const activations = checkpoints.filter((record) => record.kind === "activation")
  if (proposals.length !== 1 || activations.length > 1) {
    return ownerGateRejected("owner_gate_checkpoint_record_count", {
      proposalCount: proposals.length,
      activationCount: activations.length,
    })
  }
  const proposal = proposals[0]
  if (
    proposal.schemaVersion !== 2 ||
    proposal.checkpointId !== acknowledgement.checkpointId ||
    proposal.generationId !== acknowledgement.generationId ||
    proposal.reconciliationId !== acknowledgement.reconciliationId ||
    proposal.proposalInstructionId !== acknowledgement.proposalInstructionId ||
    proposal.originIssueNumber !== state.task.originIssueNumber ||
    proposal.originIssueUrl !== state.task.originIssueUrl ||
    proposal.threadId !== state.threadId ||
    proposal.workspacePath !== state.workspacePath ||
    proposal.branch !== state.branch ||
    proposal.head !== acknowledgement.head ||
    proposal.tree !== acknowledgement.tree
  ) {
    return ownerGateRejected("owner_gate_checkpoint_binding")
  }
  const pending = (state.pendingApprovalRequests ?? []).filter(
    (candidate) =>
      !candidate.clearedAt &&
      candidate.sourceInstructionId === proposal.proposalInstructionId &&
      candidate.reason === pendingReason,
  )
  if (pending.length !== 1) {
    return ownerGateRejected("owner_gate_pending_request_count", {
      pendingCount: pending.length,
    })
  }
  const pendingRequest = pending[0]
  if (
    !new Set(["interrupted", "owner_gate_acknowledged"]).has(
      pendingRequest.status,
    ) ||
    pendingRequest.reasonDigest !== digest(pendingReason) ||
    !Array.isArray(pendingRequest.requestIdentities) ||
    pendingRequest.requestIdentities.length === 0 ||
    pendingRequest.requestIdentities.some(
      (identity) => identity.method !== checkpointActivationRequestMethod,
    )
  ) {
    return ownerGateRejected("owner_gate_pending_request_binding")
  }
  const audit = checkpointOwnerGateAttemptAuditDecision({
    state,
    task,
    proposal,
    activationPrompt: instruction.prompt,
    gateReason,
  })
  if (!audit.accepted) return audit
  const expected = {
    instructionId: instruction.instructionId,
    proposalInstructionId: proposal.proposalInstructionId,
    originIssueNumber: state.task.originIssueNumber,
    originIssueUrlDigest: controlPlaneBindingDigest(state.task.originIssueUrl),
    codexThreadId: state.threadId,
    workspacePathDigest: controlPlaneBindingDigest(state.workspacePath),
    checkpointId: proposal.checkpointId,
    generationId: proposal.generationId,
    reconciliationId: proposal.reconciliationId,
    branch: proposal.branch,
    head: proposal.head,
    tree: proposal.tree,
    controlPromptDigest: controlPlaneBindingDigest(instruction.prompt),
    gateReasonDigest: controlPlaneBindingDigest(gateReason),
    pendingReasonDigest: controlPlaneBindingDigest(pendingReason),
    priorGateAuditDigest: audit.value.digest,
  }
  expected.acknowledgementId = ownerGateAcknowledgementId(expected)
  const supplied = { ...acknowledgement }
  delete supplied.pairedControls
  if (
    Object.keys(supplied).length !== Object.keys(expected).length ||
    Object.entries(expected).some(([key, value]) => supplied[key] !== value)
  ) {
    return ownerGateRejected("owner_gate_acknowledgement_binding")
  }
  state.ownerGateAcknowledgements ??= []
  const sameId = state.ownerGateAcknowledgements.filter(
    (record) => record.acknowledgementId === expected.acknowledgementId,
  )
  if (sameId.length > 1) {
    return ownerGateRejected("owner_gate_acknowledgement_ambiguous")
  }
  if (sameId.length === 1) {
    const existing = sameId[0]
    const activation = activations[0] ?? null
    const reusableActivation =
      !activation ||
      (activation.schemaVersion === proposal.schemaVersion &&
        activation.checkpointId === proposal.checkpointId &&
        activation.generation === proposal.generation &&
        activation.generationId === proposal.generationId &&
        activation.historicalTailDigest === proposal.historicalTailDigest &&
        activation.rejectedProposalAuditDigest ===
          proposal.rejectedProposalAudit?.digest &&
        activation.activationInstructionId === instruction.instructionId &&
        activation.originIssueNumber === proposal.originIssueNumber &&
        activation.originIssueUrl === proposal.originIssueUrl &&
        activation.threadId === proposal.threadId &&
        activation.workspacePath === proposal.workspacePath &&
        activation.branch === proposal.branch &&
        activation.head === proposal.head &&
        activation.tree === proposal.tree &&
        activation.cherryPickCommit === proposal.cherryPickCommit &&
        activation.cherryPickParent === proposal.cherryPickParent &&
        activation.cherryPickTargetTree === proposal.cherryPickTargetTree &&
        Number.isFinite(Date.parse(activation.activatedAt ?? "")))
    const reusable =
      existing.instructionId === instruction.instructionId &&
      existing.completedAt === null &&
      reusableActivation &&
      pendingRequest.status === "owner_gate_acknowledged" &&
      pendingRequest.decisionId === existing.acknowledgementId &&
      state.activeInstruction.ownerGateAcknowledgementId ===
        existing.acknowledgementId
    return reusable
      ? ownerGateAccepted({
          record: existing,
          proposal,
          priorGateAudit: audit.value,
          isNew: false,
        })
      : ownerGateRejected("owner_gate_acknowledgement_replay")
  }
  if (
    activePhase !== "selected" ||
    activations.length !== 0 ||
    pendingRequest.status !== "interrupted" ||
    pendingRequest.decisionId !== null ||
    state.ownerGateAcknowledgements.some(
      (record) =>
        record.instructionId === instruction.instructionId ||
        record.checkpointId === proposal.checkpointId,
    )
  ) {
    return ownerGateRejected("owner_gate_acknowledgement_conflict")
  }
  const at = now.toISOString()
  const record = {
    schemaVersion: 1,
    kind: "checkpoint_activation",
    ...expected,
    priorGateInstructionIds: audit.value.instructionIds,
    pendingRequestKey: pendingRequest.key,
    registeredAt: at,
    consumedAt: at,
    completedAt: null,
    outcome: null,
  }
  state.ownerGateAcknowledgements.push(record)
  state.activeInstruction.ownerGateAcknowledgementId =
    record.acknowledgementId
  pendingRequest.status = "owner_gate_acknowledged"
  pendingRequest.decisionId = record.acknowledgementId
  return ownerGateAccepted({
    record,
    proposal,
    priorGateAudit: audit.value,
    isNew: true,
  })
}

export function completeCheckpointOwnerGateAcknowledgement({
  state,
  acknowledgementId,
  outcome,
  now = new Date(),
}) {
  const matches = (state.ownerGateAcknowledgements ?? []).filter(
    (record) => record.acknowledgementId === acknowledgementId,
  )
  if (matches.length !== 1 || matches[0].completedAt) return null
  const record = matches[0]
  record.completedAt = now.toISOString()
  record.outcome = outcome
  const pending = (state.pendingApprovalRequests ?? []).find(
    (candidate) => candidate.key === record.pendingRequestKey,
  )
  if (pending?.decisionId === record.acknowledgementId) {
    pending.status = "completed"
    pending.clearedAt = record.completedAt
    pending.clearReason = "owner_gate_acknowledged_instruction_completed"
  }
  return { record, pending: pending ?? null }
}

export function reconcileLaunchAgentApproval({
  state,
  serviceLabel,
  expectedServiceLabel,
  orchestratorScript,
  runtimeDirectory,
  checkoutPath,
  workingDirectory,
  now = new Date(),
}) {
  const relativeRuntimePath = String(orchestratorScript ?? "").startsWith(
    `${runtimeDirectory}/releases/`,
  )
  const contentAddressedScript =
    relativeRuntimePath &&
    /\/releases\/[a-f0-9]{64}\/bin\/repository-orchestrator\.mjs$/.test(
      String(orchestratorScript),
    )
  if (
    serviceLabel !== expectedServiceLabel ||
    !contentAddressedScript ||
    checkoutPath !== workingDirectory
  ) {
    return null
  }
  const decision = (state.ownerApprovalDecisions ?? []).find(
    (candidate) =>
      candidate.scope === launchAgentScope &&
      candidate.consumedAt &&
      !candidate.completedAt,
  )
  if (!decision) return null
  return completeOwnerApprovedAction({
    state,
    decisionId: decision.decisionId,
    succeeded: true,
    now,
  })
}
