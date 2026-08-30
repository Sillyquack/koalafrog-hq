import { redactForLog } from "./state-store.mjs"

export const resultCheckNames = [
  "typecheck",
  "lint",
  "tests",
  "cloudflareReadiness",
  "build",
  "diffCheck",
]

const checkPatterns = {
  typecheck: /\b(?:type[ -]?check|typescript|tsc)\b/i,
  lint: /\b(?:eslint|lint(?:ing)?)\b/i,
  tests: /\b(?:tests?|test suite|vitest|playwright)\b/i,
  cloudflareReadiness: /\bcloudflare\b.*\breadiness\b|\breadiness\b.*\bcloudflare\b/i,
  build: /\b(?:production )?build\b|\bvite build\b/i,
  diffCheck: /\bgit diff --check\b|\bdiff check\b/i,
}

const commandPatterns = {
  typecheck: /\btsc\b|\b(?:npm|pnpm|yarn)\s+(?:run\s+)?typecheck\b/i,
  lint: /\beslint\b|\b(?:npm|pnpm|yarn)\s+(?:run\s+)?lint\b/i,
  tests:
    /\bvitest\b|\bplaywright\s+test\b|\bnode\s+--test\b|\b(?:npm|pnpm|yarn)\s+(?:run\s+)?test\b/i,
  cloudflareReadiness: /\btest-cloudflare-readiness\b|\btest:cloudflare\b/i,
  build: /\bvite\s+build\b|\b(?:npm|pnpm|yarn)\s+(?:run\s+)?build\b/i,
  diffCheck: /\bgit\s+diff\s+--check\b/i,
}

const statusPatterns = [
  {
    status: "unknown",
    pattern:
      /\b(?:not[_ -]?run|not executed|not verified|unverified|unknown|unable to verify|could not verify)\b/gi,
  },
  {
    status: "fail",
    pattern:
      /\b(?:fail(?:ed|ure|ures|ing)?|unsuccessful|non[- ]zero|error(?:ed|s)?)\b/gi,
  },
  {
    status: "pass",
    pattern: /\b(?:pass(?:ed|es|ing)?|succeed(?:ed|s)?|successful|green)\b/gi,
  },
]

function bounded(value, maximum = 24_000) {
  const text = String(value ?? "")
  if (text.length <= maximum) return text
  const half = Math.floor((maximum - 80) / 2)
  return `${text.slice(0, half)}\n\n[redacted result artifact truncated]\n\n${text.slice(-half)}`
}

function normalizedLine(line) {
  return String(line)
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .slice(0, 2_000)
}

function explicitStatus(line) {
  const candidates = []
  const zeroFailures = line.match(/\b0\s+(?:fail(?:ed|ures?)|errors?)\b/i)
  if (zeroFailures) {
    candidates.push({ status: "pass", index: zeroFailures.index ?? 0 })
  }
  for (const { status, pattern } of statusPatterns) {
    pattern.lastIndex = 0
    for (const match of line.matchAll(pattern)) {
      if (
        status === "fail" &&
        /^(?:fail(?:ed|ures?)|errors?)$/i.test(match[0]) &&
        /\b0\s*$/.test(line.slice(0, match.index))
      ) {
        continue
      }
      candidates.push({ status, index: match.index ?? 0 })
    }
  }
  return candidates.sort((left, right) => left.index - right.index).at(-1)?.status ?? null
}

function finalMessageEvidence(finalMessage) {
  const evidence = Object.fromEntries(resultCheckNames.map((name) => [name, []]))
  const lines = finalMessage.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = normalizedLine(lines[index])
    if (!line) continue
    for (const name of resultCheckNames) {
      if (!checkPatterns[name].test(line)) continue
      const next = normalizedLine(lines[index + 1] ?? "")
      const candidate = explicitStatus(line) ? line : `${line} ${next}`.trim()
      const status = explicitStatus(candidate)
      if (!status) continue
      evidence[name].push({
        source: "final_message",
        status,
        summary: bounded(candidate, 1_000),
      })
    }
  }
  return evidence
}

function commandText(item) {
  const value =
    item?.command ??
    item?.commandLine ??
    item?.command_line ??
    item?.parsedCommand ??
    item?.parsed_command ??
    ""
  if (Array.isArray(value)) return value.map(String).join(" ")
  if (typeof value === "object" && value !== null) return JSON.stringify(value)
  return String(value)
}

function commandStatus(item) {
  const exitCode = item?.exitCode ?? item?.exit_code ?? null
  if (exitCode === 0 && item?.status === "completed") return "pass"
  if (
    (Number.isInteger(exitCode) && exitCode !== 0) ||
    new Set(["failed", "cancelled", "canceled", "interrupted"]).has(item?.status)
  ) {
    return "fail"
  }
  return "unknown"
}

export function compactCommandExecution(item) {
  return redactForLog({
    id: item?.id ?? null,
    command: bounded(commandText(item), 2_000),
    status: item?.status ?? null,
    exitCode: item?.exitCode ?? item?.exit_code ?? null,
  })
}

function commandEvidence(commandExecutions) {
  const evidence = Object.fromEntries(resultCheckNames.map((name) => [name, []]))
  const seen = new Set()
  for (const rawItem of commandExecutions) {
    const item = compactCommandExecution(rawItem)
    const identity = `${item.id ?? ""}\u0000${item.command}\u0000${item.status}\u0000${item.exitCode}`
    if (seen.has(identity)) continue
    seen.add(identity)
    const names = resultCheckNames.filter((name) =>
      commandPatterns[name].test(item.command),
    )
    const status = commandStatus(item)
    for (const name of names) {
      evidence[name].push({
        source: "command_execution",
        status: status === "fail" && names.length > 1 ? "unknown" : status,
        summary: bounded(
          `${item.command || "command"} (${item.status ?? "unknown"}, exit ${item.exitCode ?? "unknown"})`,
          1_000,
        ),
      })
    }
  }
  return evidence
}

function mergeCheckEvidence(messageEvidence, executionEvidence) {
  return Object.fromEntries(
    resultCheckNames.map((name) => {
      const evidence = [...executionEvidence[name], ...messageEvidence[name]]
      const finalMessage = messageEvidence[name]
        .filter(({ status }) => status === "pass" || status === "fail")
        .at(-1)
      const lastExecution = executionEvidence[name]
        .filter(({ status }) => status === "pass" || status === "fail")
        .at(-1)
      const status =
        lastExecution?.status === "fail" || finalMessage?.status === "fail"
          ? "fail"
          : finalMessage?.status ?? lastExecution?.status ?? "unknown"
      return [
        name,
        {
          status,
          evidence,
        },
      ]
    }),
  )
}

function uniqueFindings(lines, pattern, maximum = 20) {
  const findings = []
  const seen = new Set()
  for (const rawLine of lines) {
    const line = normalizedLine(rawLine)
    if (!line || !pattern.test(line)) continue
    const key = line.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    findings.push(bounded(line, 2_000))
    if (findings.length === maximum) break
  }
  return findings
}

function extractFindings(finalMessage) {
  const lines = finalMessage.split(/\r?\n/)
  return {
    blockers: uniqueFindings(
      lines,
      /\b(?:blocker|blocked|blocking|divergen|conflict|unresolved|remaining risk)\b/i,
    ),
    ownerGates: uniqueFindings(
      lines,
      /\bowner\b.*\b(?:gate|approval|decision|question|review)\b|\b(?:gate|approval)\b.*\bowner\b/i,
    ),
    productionReadback: uniqueFindings(
      lines,
      /\b(?:production readback|production receipt|receipt|inventory lot|supplier batch|duplicate|partial write|read[- ]?back|aromantic|5507-161|3877-222|1585-270|3947-372)\b/i,
    ),
    safetyFindings: uniqueFindings(
      lines,
      /\b(?:concurr|overlap|active command|safety|fail closed|read-only|no (?:new )?(?:production )?(?:write|mutation|deployment|migration))\b/i,
    ),
    branchPushState: uniqueFindings(
      lines,
      /\b(?:branch|commit|sha|push(?:ed)?|remote|divergen)\b/i,
    ),
  }
}

export function finalAgentMessageFromTurn(turn) {
  const items = Array.isArray(turn?.items) ? turn.items : []
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (item?.type === "agentMessage" && typeof item.text === "string") {
      return item.text
    }
  }
  return ""
}

export function resultArtifactFromTurnResult(
  turnResult,
  capturedAt = new Date().toISOString(),
) {
  const turn = turnResult?.turn ?? null
  const terminality = turnResult?.terminalityReconciliation
    ? {
        reconciliationId:
          turnResult.terminalityReconciliation.reconciliationId ?? null,
        classification:
          turnResult.terminalityReconciliation.classification ?? null,
        terminalOutcome:
          turnResult.terminalityReconciliation.terminalOutcome ?? null,
        evidenceIdentity:
          turnResult.terminalityReconciliation.evidenceIdentity ?? null,
        originIssueNumber:
          turnResult.terminalityReconciliation.originIssueNumber ?? null,
        instructionId:
          turnResult.terminalityReconciliation.instructionId ?? null,
        threadId: turnResult.terminalityReconciliation.threadId ?? null,
        turnId: turnResult.terminalityReconciliation.turnId ?? turn?.id ?? null,
        itemIds: Array.isArray(turnResult.terminalityReconciliation.itemIds)
          ? turnResult.terminalityReconciliation.itemIds
          : [],
        evidenceSummary:
          turnResult.terminalityReconciliation.evidenceSummary ?? null,
      }
    : null
  const appServerFailure = turnResult?.appServerFailure
    ? {
        eventId: turnResult.appServerFailure.eventId ?? null,
        errorClass: turnResult.appServerFailure.errorClass ?? null,
        code: turnResult.appServerFailure.code ?? null,
        category: turnResult.appServerFailure.category ?? null,
        codexErrorInfo: turnResult.appServerFailure.codexErrorInfo ?? null,
        willRetry: turnResult.appServerFailure.willRetry === true,
        threadId: turnResult.appServerFailure.threadId ?? null,
        turnId: turnResult.appServerFailure.turnId ?? turn?.id ?? null,
        ...(Number.isSafeInteger(
          turnResult.appServerFailure.terminalGeneration,
        ) && turnResult.appServerFailure.terminalGeneration > 0
          ? {
              terminalGeneration:
                turnResult.appServerFailure.terminalGeneration,
              terminalTransactionId:
                turnResult.appServerFailure.terminalTransactionId ?? null,
            }
          : {}),
      }
    : null
  const finalMessage = bounded(
    redactForLog(
      turnResult?.agentMessage || finalAgentMessageFromTurn(turn) || "",
    ),
  )
  const commandExecutions = [
    ...(Array.isArray(turnResult?.commandExecutions)
      ? turnResult.commandExecutions
      : []),
    ...(Array.isArray(turn?.items)
      ? turn.items.filter((item) => item?.type === "commandExecution")
      : []),
  ]
  const checks = mergeCheckEvidence(
    finalMessageEvidence(finalMessage),
    commandEvidence(commandExecutions),
  )
  return redactForLog({
    version: 1,
    source: terminality
      ? "interrupted_command_terminality_reconciliation"
      : appServerFailure
        ? "app_server_turn_failure"
        : finalMessage
          ? "completed_turn_final_message"
          : commandExecutions.length
            ? "completed_turn_execution_evidence"
            : "completed_turn_unverified",
    capturedAt,
    turnId: turn?.id ?? null,
    turnStatus: turn?.status ?? turnResult?.status ?? null,
    ...(appServerFailure ? { failure: appServerFailure } : {}),
    ...(terminality ? { terminality } : {}),
    finalMessage,
    checks,
    findings: extractFindings(finalMessage),
  })
}

export function checksFromResultArtifact(artifact, overrides = {}) {
  return Object.fromEntries(
    resultCheckNames.map((name) => [
      name,
      overrides[name] ?? artifact?.checks?.[name]?.status ?? "unknown",
    ]),
  )
}
