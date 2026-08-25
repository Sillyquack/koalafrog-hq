import { createHash } from "node:crypto"

const actions = new Set(["start", "continue", "stop"])
const taskStates = new Set([
  "ready",
  "running",
  "needs_review",
  "needs_owner",
  "done",
  "failed",
])

function scalar(value) {
  const trimmed = value.trim()
  if (trimmed === "true") return true
  if (trimmed === "false") return false
  if (trimmed === "null") return null
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10)
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

export function parseAgentControlBlock(block) {
  const lines = block.replaceAll("\r\n", "\n").split("\n")
  const root = lines.findIndex((line) => /^agent_control:\s*$/.test(line.trim()))
  if (root === -1) return null

  const value = {}
  for (let index = root + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === "") continue
    if (!/^\s+/.test(line)) break

    const field = line.match(/^\s{2}([a-z_]+):\s*(.*)$/)
    if (!field) continue
    const [, key, rawValue] = field

    if (key === "prompt" && rawValue.trim() === "|") {
      const prompt = []
      index += 1
      while (index < lines.length) {
        const promptLine = lines[index]
        if (promptLine.trim() !== "" && !/^\s{4}/.test(promptLine)) {
          index -= 1
          break
        }
        prompt.push(promptLine.replace(/^\s{4}/, ""))
        index += 1
      }
      value.prompt = prompt.join("\n").trimEnd()
      continue
    }

    value[key] = scalar(rawValue)
  }

  if (!actions.has(value.action)) {
    throw new Error(`Invalid agent_control.action: ${String(value.action)}`)
  }
  if (!taskStates.has(value.task_state)) {
    throw new Error(
      `Invalid agent_control.task_state: ${String(value.task_state)}`,
    )
  }
  if (
    typeof value.instruction_id !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.instruction_id)
  ) {
    throw new Error("agent_control.instruction_id must be a safe unique string")
  }
  if (!Number.isSafeInteger(value.max_turns) || value.max_turns < 1) {
    throw new Error("agent_control.max_turns must be a positive integer")
  }
  if (typeof value.owner_approval_required !== "boolean") {
    throw new Error("agent_control.owner_approval_required must be boolean")
  }
  if (typeof value.prompt !== "string" || value.prompt.trim() === "") {
    throw new Error("agent_control.prompt must be a non-empty block scalar")
  }

  return Object.freeze({
    action: value.action,
    taskState: value.task_state,
    instructionId: value.instruction_id,
    maxTurns: value.max_turns,
    ownerApprovalRequired: value.owner_approval_required,
    prompt: value.prompt,
  })
}

export function extractAgentControls(markdown) {
  if (typeof markdown !== "string") return []
  const controls = []
  const fences = /```(?:yaml|yml)\s*\n([\s\S]*?)```/gi
  for (const match of markdown.matchAll(fences)) {
    if (!/^\s*agent_control:\s*$/m.test(match[1])) continue
    const control = parseAgentControlBlock(match[1])
    if (control) controls.push(control)
  }
  return controls
}

export function extractValidAgentControls(markdown) {
  if (typeof markdown !== "string") return []
  const controls = []
  const fences = /```(?:yaml|yml)\s*\n([\s\S]*?)```/gi
  for (const match of markdown.matchAll(fences)) {
    if (!/^\s*agent_control:\s*$/m.test(match[1])) continue
    try {
      const control = parseAgentControlBlock(match[1])
      if (control) controls.push(control)
    } catch {
      // A malformed explicit block is ineligible, not an inferred task.
    }
  }
  return controls
}

const ownerGateAcknowledgementIdPattern =
  /^owner-gate-acknowledgement:[0-9a-f]{64}$/
const checkpointIdPattern = /^git-reconciliation-checkpoint:[0-9a-f]{64}$/
const generationIdPattern =
  /^git-reconciliation-checkpoint-generation:[0-9a-f]{64}$/
const digestPattern = /^[0-9a-f]{64}$/
const fullShaPattern = /^[0-9a-f]{40}$/
const safeIdentityPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/
const branchPattern = /^agent\/issue-[0-9]+-[A-Za-z0-9._/-]+$/

export function controlPlaneBindingDigest(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex")
}

export function ownerGateAcknowledgementId(binding) {
  return `owner-gate-acknowledgement:${controlPlaneBindingDigest(
    JSON.stringify([
      1,
      binding.instructionId,
      binding.proposalInstructionId,
      binding.originIssueNumber,
      binding.originIssueUrlDigest,
      binding.codexThreadId,
      binding.workspacePathDigest,
      binding.checkpointId,
      binding.generationId,
      binding.reconciliationId,
      binding.branch,
      binding.head,
      binding.tree,
      binding.controlPromptDigest,
      binding.gateReasonDigest,
      binding.pendingReasonDigest,
      binding.priorGateAuditDigest,
    ]),
  )}`
}

export function parseOwnerGateAcknowledgementBlock(block) {
  const lines = block.replaceAll("\r\n", "\n").split("\n")
  const root = lines.findIndex((line) =>
    /^owner_gate_acknowledgement:\s*$/.test(line.trim()),
  )
  if (root === -1) return null

  const value = {}
  for (let index = root + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === "") continue
    if (!/^\s+/.test(line)) break
    const field = line.match(/^\s{2}([a-z_]+):\s*(.*)$/)
    if (!field) continue
    const [, key, rawValue] = field
    if (Object.hasOwn(value, key)) {
      throw new Error(`Duplicate owner_gate_acknowledgement.${key}`)
    }
    value[key] = scalar(rawValue)
  }

  const expectedKeys = [
    "acknowledgement_id",
    "branch",
    "checkpoint_id",
    "codex_thread_id",
    "control_prompt_digest",
    "gate_reason_digest",
    "generation_id",
    "head",
    "instruction_id",
    "origin_issue_number",
    "origin_issue_url_digest",
    "pending_reason_digest",
    "prior_gate_audit_digest",
    "proposal_instruction_id",
    "reconciliation_id",
    "tree",
    "workspace_path_digest",
  ]
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify(expectedKeys.slice().sort())
  ) {
    throw new Error("owner_gate_acknowledgement fields are not canonical")
  }

  const acknowledgement = {
    acknowledgementId: value.acknowledgement_id,
    instructionId: value.instruction_id,
    proposalInstructionId: value.proposal_instruction_id,
    originIssueNumber: value.origin_issue_number,
    originIssueUrlDigest: value.origin_issue_url_digest,
    codexThreadId: value.codex_thread_id,
    workspacePathDigest: value.workspace_path_digest,
    checkpointId: value.checkpoint_id,
    generationId: value.generation_id,
    reconciliationId: value.reconciliation_id,
    branch: value.branch,
    head: value.head,
    tree: value.tree,
    controlPromptDigest: value.control_prompt_digest,
    gateReasonDigest: value.gate_reason_digest,
    pendingReasonDigest: value.pending_reason_digest,
    priorGateAuditDigest: value.prior_gate_audit_digest,
  }
  const valid =
    ownerGateAcknowledgementIdPattern.test(acknowledgement.acknowledgementId) &&
    safeIdentityPattern.test(acknowledgement.instructionId) &&
    safeIdentityPattern.test(acknowledgement.proposalInstructionId) &&
    Number.isSafeInteger(acknowledgement.originIssueNumber) &&
    acknowledgement.originIssueNumber > 0 &&
    digestPattern.test(acknowledgement.originIssueUrlDigest) &&
    safeIdentityPattern.test(acknowledgement.codexThreadId) &&
    digestPattern.test(acknowledgement.workspacePathDigest) &&
    checkpointIdPattern.test(acknowledgement.checkpointId) &&
    generationIdPattern.test(acknowledgement.generationId) &&
    safeIdentityPattern.test(acknowledgement.reconciliationId) &&
    branchPattern.test(acknowledgement.branch) &&
    fullShaPattern.test(acknowledgement.head) &&
    fullShaPattern.test(acknowledgement.tree) &&
    digestPattern.test(acknowledgement.controlPromptDigest) &&
    digestPattern.test(acknowledgement.gateReasonDigest) &&
    digestPattern.test(acknowledgement.pendingReasonDigest) &&
    digestPattern.test(acknowledgement.priorGateAuditDigest) &&
    ownerGateAcknowledgementId(acknowledgement) ===
      acknowledgement.acknowledgementId
  if (!valid) {
    throw new Error("owner_gate_acknowledgement binding is malformed")
  }
  return Object.freeze(acknowledgement)
}

export function extractValidOwnerGateAcknowledgements(markdown) {
  if (typeof markdown !== "string") return []
  const acknowledgements = []
  const fences = /```(?:yaml|yml)\s*\n([\s\S]*?)```/gi
  for (const match of markdown.matchAll(fences)) {
    if (!/^\s*owner_gate_acknowledgement:\s*$/m.test(match[1])) continue
    try {
      const acknowledgement = parseOwnerGateAcknowledgementBlock(match[1])
      if (acknowledgement) acknowledgements.push(acknowledgement)
    } catch {
      // A malformed explicit acknowledgement is ineligible and fails closed.
    }
  }
  return acknowledgements
}

export function listOwnerGateAcknowledgements(issue, comments = []) {
  const sources = [
    { body: issue?.body ?? "" },
    ...comments.map((comment) => ({
      body: comment.body ?? comment.comment ?? "",
    })),
  ]
  const acknowledgements = []
  for (const source of sources) {
    const pairedControls = extractValidAgentControls(source.body)
    for (const acknowledgement of extractValidOwnerGateAcknowledgements(
      source.body,
    )) {
      acknowledgements.push(
        Object.freeze({
          ...acknowledgement,
          pairedControls: pairedControls.filter(
            (control) =>
              control.instructionId === acknowledgement.instructionId,
          ),
        }),
      )
    }
  }
  return acknowledgements
}

export function listAgentControls(issue, comments = []) {
  const sources = [
    { body: issue?.body ?? "" },
    ...comments.map((comment) => ({
      body: comment.body ?? comment.comment ?? "",
    })),
  ]

  const controls = []
  for (const source of sources) {
    controls.push(...extractValidAgentControls(source.body))
  }
  return controls
}

export function selectLatestInstruction(issue, comments = []) {
  return listAgentControls(issue, comments).at(-1) ?? null
}

export function selectNextInstruction(issue, comments = [], state = {}) {
  const retryable = new Set(state.retryInstructionIds ?? [])
  const consumed = new Set(
    (state.runs ?? []).map((run) => run.instructionId).filter(Boolean),
  )
  if (state.lastConsumedInstructionId) {
    consumed.add(state.lastConsumedInstructionId)
  }

  const controls = listAgentControls(issue, comments)
  for (const control of controls) {
    if (
      !retryable.has(control.instructionId) &&
      findExistingResult(comments, control.instructionId)
    ) {
      consumed.add(control.instructionId)
    }
  }
  for (const instructionId of retryable) consumed.delete(instructionId)

  return (
    controls
      .slice()
      .find(
        (control) =>
          !consumed.has(control.instructionId) &&
          isInstructionEligible(control, state.status),
      ) ?? null
  )
}

const eligibleStatesByAction = {
  start: new Set(["ready", "failed"]),
  continue: new Set(["ready", "failed", "needs_review", "needs_owner"]),
  stop: taskStates,
}

export function isInstructionEligible(instruction, currentTaskState) {
  return Boolean(
    instruction &&
      eligibleStatesByAction[instruction.action]?.has(instruction.taskState) &&
      (currentTaskState === undefined ||
        instruction.taskState === currentTaskState),
  )
}

export function shouldConsumeInstruction(state, instruction) {
  if (!instruction) return false
  if ((state.retryInstructionIds ?? []).includes(instruction.instructionId)) {
    return true
  }
  if (state.activeInstruction?.instructionId === instruction.instructionId) {
    return true
  }
  return state.lastConsumedInstructionId !== instruction.instructionId
}

const resultCheckFields = new Map([
  ["typecheck", "typecheck"],
  ["lint", "lint"],
  ["tests", "tests"],
  ["cloudflare_readiness", "cloudflareReadiness"],
  ["build", "build"],
  ["diff_check", "diffCheck"],
])
const resultTopLevelFields = new Set([
  "instruction_id",
  "origin_issue_number",
  "origin_issue_url",
  "codex_thread_id",
  "status",
  "branch",
  "commits",
  "checks",
  "owner_question",
  "owner_request",
  "blockers",
  "owner_gates",
  "production_readback",
  "safety_findings",
  "branch_push_state",
  "result_artifact",
])
const resultOwnerRequestFields = new Map([
  ["method", "method"],
  ["server", "serverName"],
  ["tool", "toolName"],
  ["arguments", "arguments"],
  ["details", "details"],
])

function resultScalar(rawValue) {
  const trimmed = rawValue.trim()
  if (trimmed.startsWith('"')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      throw new Error("agent_result contains an invalid quoted scalar")
    }
  }
  return scalar(trimmed)
}

function resultJson(rawValue, field, expectedType) {
  let parsed
  try {
    parsed = JSON.parse(rawValue)
  } catch {
    throw new Error(`agent_result.${field} must contain canonical JSON`)
  }
  if (expectedType === "array" && !Array.isArray(parsed)) {
    throw new Error(`agent_result.${field} must be an array`)
  }
  if (
    expectedType === "object_or_null" &&
    parsed !== null &&
    (typeof parsed !== "object" || Array.isArray(parsed))
  ) {
    throw new Error(`agent_result.${field} must be an object or null`)
  }
  return parsed
}

function resultNestedJson(value) {
  if (value === null) return null
  if (typeof value !== "string") {
    throw new Error("agent_result owner request JSON must be a string or null")
  }
  return resultJson(value, "owner_request", "object_or_null")
}

function resultInstructionPattern(instructionId, flags = "") {
  const escaped = instructionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(
    `agent_result:\\s*[\\s\\S]*?instruction_id:\\s*["']?${escaped}["']?(?:\\s|$)`,
    flags,
  )
}

export function parseAgentResultBlock(block) {
  const lines = block.replaceAll("\r\n", "\n").split("\n")
  const root = lines.findIndex((line) => /^agent_result:\s*$/.test(line.trim()))
  if (root === -1) return null
  const raw = {}
  for (let index = root + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === "") continue
    const field = line.match(/^\s{2}([a-z_]+):\s*(.*)$/)
    if (!field) {
      throw new Error("agent_result contains non-canonical indentation")
    }
    const [, key, rawValue] = field
    if (!resultTopLevelFields.has(key) || Object.hasOwn(raw, key)) {
      throw new Error("agent_result fields are not canonical")
    }

    if (key === "commits" && rawValue === "") {
      const commits = []
      while (index + 1 < lines.length) {
        const item = lines[index + 1].match(/^\s{4}-\s+(.*)$/)
        if (!item) break
        commits.push(resultScalar(item[1]))
        index += 1
      }
      raw.commits = commits
      continue
    }
    if (key === "checks") {
      if (rawValue !== "") {
        throw new Error("agent_result.checks must be a mapping")
      }
      const checks = {}
      while (index + 1 < lines.length) {
        const item = lines[index + 1].match(/^\s{4}([a-z_]+):\s*(.*)$/)
        if (!item) break
        const [, checkKey, checkValue] = item
        const normalized = resultCheckFields.get(checkKey)
        if (!normalized || Object.hasOwn(checks, normalized)) {
          throw new Error("agent_result.checks fields are not canonical")
        }
        checks[normalized] = resultScalar(checkValue)
        index += 1
      }
      raw.checks = checks
      continue
    }
    if (key === "owner_request" && rawValue === "") {
      const request = {}
      while (index + 1 < lines.length) {
        const item = lines[index + 1].match(/^\s{4}([a-z_]+):\s*(.*)$/)
        if (!item) break
        const [, requestKey, requestValue] = item
        const normalized = resultOwnerRequestFields.get(requestKey)
        if (!normalized || Object.hasOwn(request, normalized)) {
          throw new Error("agent_result.owner_request fields are not canonical")
        }
        request[normalized] = resultScalar(requestValue)
        index += 1
      }
      request.arguments = resultNestedJson(request.arguments)
      request.details = resultNestedJson(request.details)
      raw.owner_request = request
      continue
    }
    if (rawValue === "") {
      throw new Error(`agent_result.${key} must not be empty`)
    }
    raw[key] = resultScalar(rawValue)
  }

  if (
    raw.commits === "[]" ||
    (typeof raw.commits === "string" && raw.commits.trim() === "[]")
  ) {
    raw.commits = []
  }
  for (const field of [
    "blockers",
    "owner_gates",
    "production_readback",
    "safety_findings",
    "branch_push_state",
  ]) {
    if (typeof raw[field] === "string") {
      raw[field] = resultJson(raw[field], field, "array")
    }
  }
  if (typeof raw.result_artifact === "string") {
    raw.result_artifact = resultJson(
      raw.result_artifact,
      "result_artifact",
      "object_or_null",
    )
  }
  if (raw.owner_request === "null") raw.owner_request = null

  if (
    JSON.stringify(Object.keys(raw).sort()) !==
    JSON.stringify([...resultTopLevelFields].sort())
  ) {
    throw new Error("agent_result fields are not canonical")
  }
  if (
    !Array.isArray(raw.commits) ||
    raw.commits.some((commit) => typeof commit !== "string") ||
    JSON.stringify(Object.keys(raw.checks ?? {}).sort()) !==
      JSON.stringify([...resultCheckFields.values()].sort()) ||
    Object.values(raw.checks).some(
      (value) => typeof value !== "string" || value.length === 0,
    ) ||
    (raw.owner_request !== null &&
      JSON.stringify(Object.keys(raw.owner_request).sort()) !==
        JSON.stringify([...resultOwnerRequestFields.values()].sort())) ||
    !Array.isArray(raw.blockers) ||
    !Array.isArray(raw.owner_gates) ||
    !Array.isArray(raw.production_readback) ||
    !Array.isArray(raw.safety_findings) ||
    !Array.isArray(raw.branch_push_state)
  ) {
    throw new Error("agent_result structure is malformed")
  }
  if (
    typeof raw.instruction_id !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(raw.instruction_id) ||
    !Number.isSafeInteger(raw.origin_issue_number) ||
    raw.origin_issue_number < 1 ||
    typeof raw.origin_issue_url !== "string" ||
    !raw.origin_issue_url ||
    typeof raw.codex_thread_id !== "string" ||
    !raw.codex_thread_id ||
    !taskStates.has(raw.status) ||
    typeof raw.branch !== "string" ||
    !raw.branch
  ) {
    throw new Error("agent_result identity binding is malformed")
  }

  return Object.freeze({
    instructionId: raw.instruction_id,
    originIssueNumber: raw.origin_issue_number,
    originIssueUrl: raw.origin_issue_url,
    codexThreadId: raw.codex_thread_id,
    status: raw.status,
    branch: raw.branch,
    commits: raw.commits,
    checks: raw.checks,
    ownerQuestion: raw.owner_question,
    ownerRequest: raw.owner_request,
    blockers: raw.blockers,
    ownerGates: raw.owner_gates,
    productionReadback: raw.production_readback,
    safetyFindings: raw.safety_findings,
    branchPushState: raw.branch_push_state,
    resultArtifact: raw.result_artifact,
  })
}

function agentResultBinding(packet) {
  return {
    instructionId: packet.instructionId,
    originIssueNumber: packet.originIssueNumber,
    originIssueUrl: packet.originIssueUrl,
    codexThreadId: packet.codexThreadId,
    status: packet.status,
    branch: packet.branch,
    commits: packet.commits,
    checks: packet.checks,
    ownerRequest: packet.ownerRequest,
    blockers: packet.blockers,
    ownerGates: packet.ownerGates,
    productionReadback: packet.productionReadback,
    safetyFindings: packet.safetyFindings,
    branchPushState: packet.branchPushState,
    resultArtifact: packet.resultArtifact,
  }
}

export function agentResultBindingDigest(packet) {
  return controlPlaneBindingDigest(JSON.stringify(agentResultBinding(packet)))
}

export function agentResultPublicationDecision({
  comments,
  instructionId,
  expectedPacket = null,
}) {
  const publications = []
  let textualCount = 0
  for (const comment of comments ?? []) {
    const body = comment?.body ?? comment?.comment ?? ""
    textualCount += [...body.matchAll(resultInstructionPattern(instructionId, "g"))].length
    const fences = /```(?:yaml|yml)\s*\n([\s\S]*?)```/gi
    for (const match of body.matchAll(fences)) {
      if (!/^\s*agent_result:\s*$/m.test(match[1])) continue
      let packet
      try {
        packet = parseAgentResultBlock(match[1])
      } catch {
        continue
      }
      if (packet?.instructionId !== instructionId) continue
      publications.push({
        commentId: comment.id,
        bodyDigest: controlPlaneBindingDigest(body),
        packetDigest: agentResultBindingDigest(packet),
        packet,
      })
    }
  }
  if (textualCount === 0) {
    return { accepted: false, rejection: { code: "result_publication_missing" } }
  }
  if (textualCount !== publications.length) {
    return {
      accepted: false,
      rejection: {
        code: "result_publication_malformed",
        textualCount,
        validCount: publications.length,
      },
    }
  }
  if (publications.length !== 1) {
    return {
      accepted: false,
      rejection: {
        code: "result_publication_ambiguous",
        publicationCount: publications.length,
      },
    }
  }
  const publication = publications[0]
  if (
    !Number.isSafeInteger(publication.commentId) ||
    publication.commentId < 1
  ) {
    return {
      accepted: false,
      rejection: { code: "result_publication_comment_id" },
    }
  }
  if (
    expectedPacket &&
    JSON.stringify(agentResultBinding(publication.packet)) !==
      JSON.stringify(agentResultBinding(expectedPacket))
  ) {
    return {
      accepted: false,
      rejection: { code: "result_publication_binding" },
    }
  }
  return { accepted: true, value: publication }
}

export function findExistingResult(comments, instructionId) {
  const pattern = resultInstructionPattern(instructionId)
  return comments.find((comment) =>
    pattern.test(comment.body ?? comment.comment ?? ""),
  )
}

export function findExistingPickup(comments, instructionId) {
  const escaped = instructionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(
    `agent_pickup:\\s*[\\s\\S]*?instruction_id:\\s*["']?${escaped}["']?(?:\\s|$)`,
  )
  return comments.find((comment) =>
    pattern.test(comment.body ?? comment.comment ?? ""),
  )
}

export function formatPickupPacket(packet) {
  return `\`\`\`yaml
agent_pickup:
  instruction_id: ${yamlScalar(packet.instructionId)}
  origin_issue_number: ${packet.originIssueNumber}
  origin_issue_url: ${yamlScalar(packet.originIssueUrl)}
  codex_thread_id: ${yamlScalar(packet.codexThreadId)}
  status: running
  branch: ${yamlScalar(packet.branch)}
\`\`\`

The persistent orchestrator claimed this explicit instruction and started or resumed its isolated task context.`
}

const gatedPatterns = [
  /\bdeploy(?:ment)?\b.*\bproduction\b/i,
  /\bapply\b.*\bproduction\b.*\bmigration/i,
  /\b(?:modify|delete|truncate|overwrite)\b.*\bproduction\b.*\bdata\b/i,
  /\b(?:expose|print|log|commit)\b.*\b(?:secret|credential|token|password)\b/i,
  /\bmerge\b.*\b(?:main|master|default branch)\b/i,
  /\bforce[- ]?push\b/i,
  /^\s*(?:-\s*)?(?:purchase|pay|buy)\b/i,
  /\b(?:make|execute|submit|send|authorize|initiate|complete)\b.*\b(?:purchase|payment)\b/i,
  /\b(?:create|open|register)\b.*\bexternal account\b/i,
]

const constraintIntentPattern =
  /(?:^|\b)(?:no\b|do not|don't|does not|doesn't|never|must not|without|not authorized?|not permitted|not allowed|keep(?:s|ing)? blocked|remain(?:s|ing)? blocked|explicitly block(?:ed|s|ing)?|prohibit(?:ed|s|ing)?|exclude(?:d|s|ing)?(?:\s+from\s+scope)?|outside (?:the )?(?:authorized )?scope|preserve(?:s|d|ing)? (?:the )?(?:safety |authorization )?boundary)\b/i

const protectedTermPattern =
  /\b(?:deploy(?:ment)?|production|migration|data|secret|credential|token|password|merge|main|master|default branch|force[- ]?push|purchase|payment|external account)\b/i

const postposedConstraintPattern =
  /\b(?:is|are|remain(?:s|ing)?|must remain)\s+(?:blocked|prohibited|excluded|not authorized|not permitted|not allowed|outside (?:the )?(?:authorized )?scope)\b/i

const keepObjectBlockedPattern =
  /\bkeep(?:s|ing)?\s+([^,;.!?]{1,80}?)\s+blocked\b/i

function maskQuotedConstraintExamples(value) {
  return value.replace(/(`+)([\s\S]*?)\1/g, (match, _ticks, contents) =>
    constraintIntentPattern.test(contents) ? " ".repeat(match.length) : match,
  )
}

function intentSegments(clause) {
  return maskQuotedConstraintExamples(clause)
    .split(/\s*(?:;|\bbut\b|\bhowever\b|\bexcept\b|\binstead\b|\bthen\b)\s*/i)
    .map((segment) => segment.trim())
    .filter(Boolean)
}

function isConstrainedProtectedMention(segment) {
  const constraint = segment.match(constraintIntentPattern)
  const protectedTerm = segment.match(protectedTermPattern)
  const keepObjectBlocked = segment.match(keepObjectBlockedPattern)
  const keepStart = keepObjectBlocked?.index ?? -1
  const keepEnd = keepObjectBlocked
    ? keepStart + keepObjectBlocked[0].length
    : -1
  return Boolean(
    protectedTerm &&
      ((constraint &&
        ((constraint.index ?? 0) <= (protectedTerm.index ?? 0) ||
          postposedConstraintPattern.test(segment))) ||
        (keepObjectBlocked &&
          (protectedTerm.index ?? 0) >= keepStart &&
          (protectedTerm.index ?? 0) < keepEnd)),
  )
}

export function ownerGateReason(instruction) {
  if (instruction.ownerApprovalRequired) {
    return "The control-plane instruction explicitly requires owner approval."
  }

  const clauses = instruction.prompt.split(/(?<=[.!?])\s+|\n+/)
  for (const clause of clauses) {
    for (const segment of intentSegments(clause)) {
      if (
        /\bzero side effects?\b/i.test(segment) ||
        isConstrainedProtectedMention(segment)
      ) {
        continue
      }
      if (gatedPatterns.some((pattern) => pattern.test(segment))) {
        return `The instruction requests an owner-gated action: ${clause.trim()}`
      }
    }
  }
  return null
}

function yamlScalar(value) {
  if (value === null || value === undefined || value === "") return "null"
  return JSON.stringify(String(value))
}

export function formatCompletionPacket(packet) {
  const commits = packet.commits?.length
    ? `  commits:\n${packet.commits
        .map((commit) => `    - ${yamlScalar(commit)}`)
        .join("\n")}`
    : "  commits: []"
  const files = packet.changedFiles?.length
    ? `\nChanged files:\n${packet.changedFiles.map((file) => `- \`${file}\``).join("\n")}`
    : "\nChanged files: none"
  const detail = packet.detail ? `\n\n${packet.detail}` : ""
  const resultArtifact = packet.resultArtifact
    ? JSON.stringify(packet.resultArtifact)
    : "null"
  const blockers = JSON.stringify(packet.blockers ?? [])
  const ownerGates = JSON.stringify(packet.ownerGates ?? [])
  const productionReadback = JSON.stringify(packet.productionReadback ?? [])
  const safetyFindings = JSON.stringify(packet.safetyFindings ?? [])
  const branchPushState = JSON.stringify(packet.branchPushState ?? [])
  const check = (name) => packet.checks?.[name] ?? "unknown"
  const ownerRequest = packet.ownerRequest
    ? `  owner_request:
    method: ${yamlScalar(packet.ownerRequest.method)}
    server: ${yamlScalar(packet.ownerRequest.serverName)}
    tool: ${yamlScalar(packet.ownerRequest.toolName)}
    arguments: ${yamlScalar(packet.ownerRequest.arguments === null ? null : JSON.stringify(packet.ownerRequest.arguments))}
    details: ${yamlScalar(packet.ownerRequest.details === null ? null : JSON.stringify(packet.ownerRequest.details))}`
    : "  owner_request: null"

  return `\`\`\`yaml
agent_result:
  instruction_id: ${yamlScalar(packet.instructionId)}
  origin_issue_number: ${packet.originIssueNumber ?? "null"}
  origin_issue_url: ${yamlScalar(packet.originIssueUrl)}
  codex_thread_id: ${yamlScalar(packet.codexThreadId)}
  status: ${packet.status}
  branch: ${yamlScalar(packet.branch)}
${commits}
  checks:
    typecheck: ${check("typecheck")}
    lint: ${check("lint")}
    tests: ${check("tests")}
    cloudflare_readiness: ${check("cloudflareReadiness")}
    build: ${check("build")}
    diff_check: ${check("diffCheck")}
  owner_question: ${yamlScalar(packet.ownerQuestion)}
${ownerRequest}
  blockers: ${blockers}
  owner_gates: ${ownerGates}
  production_readback: ${productionReadback}
  safety_findings: ${safetyFindings}
  branch_push_state: ${branchPushState}
  result_artifact: ${resultArtifact}
\`\`\`${files}${detail}`
}
