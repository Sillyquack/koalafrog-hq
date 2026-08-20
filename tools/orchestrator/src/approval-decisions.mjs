import { createHash } from "node:crypto"

export const ownerApprovalDecisionTtlMs = 24 * 60 * 60 * 1_000

const launchAgentScope =
  "launchagent:koalafrog:user:install-reload:content-addressed-runtime:stable-checkout"

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
  return `command:${digest(reason)}`
}

function approvedParagraph(prompt) {
  return String(prompt ?? "")
    .split(/\n\s*\n/)
    .find(
      (paragraph) =>
        /\bowner\b[\s\S]{0,80}\bapprov(?:al|ed)\b/i.test(paragraph) &&
        hasLaunchAgentScope(paragraph),
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
  const paragraph = approvedParagraph(instruction.prompt)
  if (paragraph) return launchAgentScope

  const pendingScope = pendingActionScope(pendingRequest, { allowLegacy: true })
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

export function registerOwnerApprovalDecision({
  state,
  controls,
  now = new Date(),
  ttlMs = ownerApprovalDecisionTtlMs,
}) {
  state.ownerApprovalDecisions ??= []
  const pendingScope = pendingActionScope(state.pendingOwnerRequest, {
    allowLegacy: true,
  })
  if (!pendingScope) return null

  const pendingRun = latestPendingRun(state)
  const pendingAt = Date.parse(pendingRun?.completedAt ?? "")
  if (!Number.isFinite(pendingAt) || now.getTime() - pendingAt > ttlMs) {
    return null
  }

  const instruction = [...controls]
    .reverse()
    .find(
      (control) =>
        decisionInstructionScope(control, state.pendingOwnerRequest) ===
        pendingScope,
    )
  if (!instruction) return null

  const existing = state.ownerApprovalDecisions.find(
    (decision) => decision.decisionId === instruction.instructionId,
  )
  if (existing) {
    if (existing.scope !== pendingScope) {
      throw new Error("Owner approval decision ID was reused for another scope")
    }
    return existing
  }

  const registeredAt = now.toISOString()
  const decision = {
    schemaVersion: 1,
    decisionId: instruction.instructionId,
    scope: pendingScope,
    pendingInstructionId: pendingRun.instructionId,
    pendingReasonDigest: digest(state.pendingOwnerRequest.reason),
    registeredAt,
    expiresAt: new Date(pendingAt + ttlMs).toISOString(),
    consumedAt: null,
    consumedRequestDigest: null,
  }
  state.ownerApprovalDecisions.push(decision)
  return decision
}

export function consumeOwnerApprovalDecision({
  state,
  request,
  now = new Date(),
}) {
  const scope = pendingActionScope(request)
  if (!scope) return null
  const decision = (state.ownerApprovalDecisions ?? []).find(
    (candidate) =>
      candidate.scope === scope &&
      !candidate.consumedAt &&
      Date.parse(candidate.expiresAt) > now.getTime(),
  )
  if (!decision) return null

  decision.consumedAt = now.toISOString()
  decision.consumedRequestDigest = digest(request.reason)
  return {
    decision,
    response: { decision: "accept" },
  }
}
