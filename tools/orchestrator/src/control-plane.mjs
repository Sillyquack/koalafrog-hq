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
          isInstructionEligible(control),
      ) ?? null
  )
}

const eligibleStatesByAction = {
  start: new Set(["ready", "failed"]),
  continue: new Set(["ready", "failed", "needs_review", "needs_owner"]),
  stop: taskStates,
}

export function isInstructionEligible(instruction) {
  return Boolean(
    instruction &&
      eligibleStatesByAction[instruction.action]?.has(instruction.taskState),
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

export function findExistingResult(comments, instructionId) {
  const escaped = instructionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(
    `agent_result:\\s*[\\s\\S]*?instruction_id:\\s*["']?${escaped}["']?(?:\\s|$)`,
  )
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
    typecheck: ${packet.checks.typecheck}
    lint: ${packet.checks.lint}
    tests: ${packet.checks.tests}
    build: ${packet.checks.build}
  owner_question: ${yamlScalar(packet.ownerQuestion)}
${ownerRequest}
\`\`\`${files}${detail}`
}
