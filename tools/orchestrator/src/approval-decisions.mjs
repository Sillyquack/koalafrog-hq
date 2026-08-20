import { createHash } from "node:crypto"

export const ownerApprovalDecisionTtlMs = 24 * 60 * 60 * 1_000

const launchAgentScope =
  "launchagent:koalafrog:user:install-reload:content-addressed-runtime:stable-checkout"
const approvalRecoveryCommitScope =
  "git:commit:issue-53:staged-reviewed-orchestrator-approval-recovery"

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
