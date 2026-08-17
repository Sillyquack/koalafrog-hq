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

export function selectLatestInstruction(issue, comments = []) {
  const sources = [
    { body: issue?.body ?? "" },
    ...comments.map((comment) => ({
      body: comment.body ?? comment.comment ?? "",
    })),
  ]

  let latest = null
  for (const source of sources) {
    for (const control of extractAgentControls(source.body)) latest = control
  }
  return latest
}

export function shouldConsumeInstruction(state, instruction) {
  if (!instruction) return false
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

const gatedPatterns = [
  /\bdeploy(?:ment)?\b.*\bproduction\b/i,
  /\bapply\b.*\bproduction\b.*\bmigration/i,
  /\b(?:modify|delete|truncate|overwrite)\b.*\bproduction\b.*\bdata\b/i,
  /\b(?:expose|print|log|commit)\b.*\b(?:secret|credential|token|password)\b/i,
  /\bmerge\b.*\b(?:main|master|default branch)\b/i,
  /\bforce[- ]?push\b/i,
  /\b(?:purchase|payment|buy|new external account)\b/i,
]

const prohibitionPattern =
  /\b(?:do not|don't|does not|doesn't|never|must not|without|not authorized?|not permitted|not allowed)\b/i

export function ownerGateReason(instruction) {
  if (instruction.ownerApprovalRequired) {
    return "The control-plane instruction explicitly requires owner approval."
  }

  const clauses = instruction.prompt.split(/(?<=[.!?])\s+|\n+/)
  for (const clause of clauses) {
    if (prohibitionPattern.test(clause)) continue
    if (gatedPatterns.some((pattern) => pattern.test(clause))) {
      return `The instruction requests an owner-gated action: ${clause.trim()}`
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

  return `\`\`\`yaml
agent_result:
  instruction_id: ${yamlScalar(packet.instructionId)}
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
\`\`\`${files}${detail}`
}
