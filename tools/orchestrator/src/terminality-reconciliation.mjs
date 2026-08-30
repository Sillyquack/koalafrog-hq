import { createHash } from "node:crypto"

const interruptedTurnStatuses = new Set([
  "interrupted",
  "cancelled",
  "canceled",
])

const terminalCommandStatuses = new Set([
  "completed",
  "failed",
  "interrupted",
  "cancelled",
  "canceled",
  "declined",
])

const runningCommandStatuses = new Set([
  "inProgress",
  "in_progress",
  "running",
  "started",
])

function stableIdentifier(value) {
  return typeof value === "string" &&
    /^[A-Za-z0-9._:/-]{1,160}$/.test(value)
    ? value
    : null
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value === null || typeof value !== "object") return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalValue(value[key])]),
  )
}

function digest(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalValue(value)))
    .digest("hex")
}

function normalizedStatus(value) {
  if (value === "canceled") return "cancelled"
  return typeof value === "string" ? value : null
}

function terminalOutcome(status, exitCode = null) {
  const normalized = normalizedStatus(status)
  if (!terminalCommandStatuses.has(status) && normalized !== "cancelled") {
    return null
  }
  if (normalized === "completed") {
    return Number.isInteger(exitCode) && exitCode !== 0 ? "failed" : "completed"
  }
  if (new Set(["cancelled", "interrupted", "declined"]).has(normalized)) {
    return "cancelled"
  }
  return "failed"
}

function protocolMessage(event) {
  return event?.type === "notification" && event.message
    ? event.message
    : null
}

function matchingProtocolEvents(events, threadId, turnId) {
  return (Array.isArray(events) ? events : []).filter((event) => {
    const message = protocolMessage(event)
    return message?.threadId === threadId && message?.turnId === turnId
  })
}

function turnFromReadback(threadReadback, turnId) {
  const turns = threadReadback?.thread?.turns
  if (!Array.isArray(turns)) return null
  const matches = turns.filter((turn) => turn?.id === turnId)
  return matches.length === 1 ? matches[0] : matches.length ? matches : null
}

function commandItemsFromTurn(turn) {
  return Array.isArray(turn?.items)
    ? turn.items.filter((item) => item?.type === "commandExecution")
    : []
}

function compactReadbackItem(item) {
  const exitCode = item?.exitCode ?? item?.exit_code ?? null
  const command =
    item?.command ?? item?.commandLine ?? item?.command_line ?? null
  return {
    id: stableIdentifier(item?.id),
    type: item?.type ?? null,
    status: normalizedStatus(item?.status),
    exitCode: Number.isInteger(exitCode) ? exitCode : null,
    ...(typeof command === "string"
      ? { command: command.slice(0, 2_000) }
      : {}),
  }
}

function eventTime(event) {
  const timestamp = Date.parse(event?.at ?? "")
  return Number.isFinite(timestamp) ? timestamp : null
}

function unique(values) {
  return [...new Set(values)]
}

function evidenceSummary({
  turnId,
  items,
  classification,
  terminalOutcome: outcome,
  reasons,
  terminalInteractionCount,
  postInterruptionOutputCount,
  processAbsenceObservationCount,
  readback,
}) {
  const itemSummary = items.length
    ? items
        .map(
          (item) =>
            `${item.itemId}=${item.terminalStatus ?? "unproven"}/${item.source ?? "none"}`,
        )
        .join(", ")
    : "none"
  const reasonSummary = reasons.length ? reasons.join(",") : "none"
  return [
    `turn=${turnId}`,
    `classification=${classification}`,
    `outcome=${outcome ?? "unproven"}`,
    `items=${itemSummary}`,
    `readback=${readback.available ? readback.turnStatus ?? "turn_missing" : "unavailable"}`,
    `readbackError=${readback.errorCode ?? "none"}`,
    `terminalInteraction=${terminalInteractionCount}`,
    `postInterruptionOutput=${postInterruptionOutputCount}`,
    `processAbsence=${processAbsenceObservationCount}`,
    `reasons=${reasonSummary}`,
  ].join("; ")
}

/**
 * Reconciles only interrupted/timed-out turns with known command execution.
 * Process state, silence, elapsed time, EOF, terminalInteraction, and output
 * activity are recorded as non-authoritative context and never prove terminality.
 */
export function interruptedCommandTerminalityDecision({
  state,
  threadReadback = null,
  readbackError = null,
  events = [],
  reconciledAt = new Date().toISOString(),
}) {
  const active = state?.activeInstruction
  const originIssueNumber = state?.task?.originIssueNumber
  const originIssueUrl = state?.task?.originIssueUrl ?? null
  const instructionId = stableIdentifier(active?.instructionId)
  const threadId = stableIdentifier(state?.threadId)
  const turnId = stableIdentifier(active?.turnId)
  if (
    active?.phase !== "turn_started" ||
    !Number.isSafeInteger(originIssueNumber) ||
    originIssueNumber < 1 ||
    !instructionId ||
    !threadId ||
    !turnId
  ) {
    return { applicable: false }
  }

  const protocolEvents = matchingProtocolEvents(events, threadId, turnId)
  const turnCompletionEvents = protocolEvents.filter(
    (event) => protocolMessage(event)?.method === "turn/completed",
  )
  const eventTurnStatuses = unique(
    turnCompletionEvents
      .map((event) => normalizedStatus(protocolMessage(event)?.status))
      .filter(Boolean),
  )
  const readbackTurn = turnFromReadback(threadReadback, turnId)
  const duplicateReadbackTurn = Array.isArray(readbackTurn)
  const priorTurn = duplicateReadbackTurn ? null : readbackTurn
  const readbackTurnStatus = normalizedStatus(priorTurn?.status)
  const interruptionKnown = Boolean(
    Number.isFinite(Date.parse(active.turnTimedOutAt ?? "")) ||
      Number.isFinite(Date.parse(active.turnInterruptRequestedAt ?? "")) ||
      eventTurnStatuses.some((status) => interruptedTurnStatuses.has(status)) ||
      interruptedTurnStatuses.has(readbackTurnStatus),
  )

  const startedEvents = protocolEvents.filter((event) => {
    const message = protocolMessage(event)
    return (
      message?.method === "item/started" &&
      message.itemType === "commandExecution"
    )
  })
  const readbackCommands = commandItemsFromTurn(priorTurn).map(compactReadbackItem)
  const rawItemIds = unique([
    ...startedEvents.map((event) => protocolMessage(event)?.itemId),
    ...readbackCommands.map((item) => item.id),
  ].filter(Boolean))
  const itemIds = rawItemIds.map(stableIdentifier).filter(Boolean).sort()
  if (!interruptionKnown || rawItemIds.length === 0) {
    return { applicable: false }
  }

  const reasons = []
  if (rawItemIds.length !== itemIds.length) reasons.push("unsafe_item_identity")
  if (duplicateReadbackTurn) reasons.push("duplicate_turn_readback")
  if (eventTurnStatuses.length > 1) reasons.push("contradictory_turn_events")
  if (
    eventTurnStatuses.length === 1 &&
    readbackTurnStatus &&
    eventTurnStatuses[0] !== readbackTurnStatus
  ) {
    reasons.push("contradictory_turn_readback")
  }
  if (readbackTurnStatus && runningCommandStatuses.has(readbackTurnStatus)) {
    reasons.push("readback_turn_not_terminal")
  }

  const completedEvents = protocolEvents.filter(
    (event) => protocolMessage(event)?.method === "item/completed",
  )
  const itemEvidence = itemIds.map((itemId) => {
    const itemCompleted = completedEvents.filter(
      (event) => protocolMessage(event)?.itemId === itemId,
    )
    const eventCandidates = itemCompleted
      .filter(
        (event) => protocolMessage(event)?.itemType === "commandExecution",
      )
      .map((event) => {
        const message = protocolMessage(event)
        return {
          status: normalizedStatus(message?.itemStatus),
          exitCode: Number.isInteger(message?.exitCode)
            ? message.exitCode
            : null,
          source: "item/completed",
        }
      })
      .filter(({ status }) => Boolean(status))
    const readbackMatches = readbackCommands.filter((item) => item.id === itemId)
    if (readbackMatches.length > 1) {
      reasons.push(`duplicate_item_readback:${itemId}`)
    }
    const readbackItem = readbackMatches.length === 1 ? readbackMatches[0] : null
    const candidates = [
      ...eventCandidates,
      ...(readbackItem
        ? [
            {
              status: readbackItem.status,
              exitCode: readbackItem.exitCode,
              source: "thread/read",
            },
          ]
        : []),
    ]
    const terminalCandidates = candidates.filter(
      ({ status }) => terminalOutcome(status) !== null,
    )
    const nonTerminalCandidates = candidates.filter(
      ({ status }) => status && terminalOutcome(status) === null,
    )
    if (nonTerminalCandidates.length) {
      reasons.push(`non_terminal_item_evidence:${itemId}`)
    }
    const outcomes = unique(
      terminalCandidates
        .map(({ status, exitCode }) => terminalOutcome(status, exitCode))
        .filter(Boolean),
    )
    const statuses = unique(
      terminalCandidates.map(({ status }) => normalizedStatus(status)),
    )
    const sources = unique(terminalCandidates.map(({ source }) => source))
    if (outcomes.length > 1 || statuses.length > 1) {
      reasons.push(`contradictory_item_evidence:${itemId}`)
    }
    if (terminalCandidates.length === 0) {
      reasons.push(`missing_authoritative_item_terminal_evidence:${itemId}`)
    }
    const accepted =
      terminalCandidates.length > 0 &&
      outcomes.length === 1 &&
      statuses.length === 1 &&
      nonTerminalCandidates.length === 0
        ? terminalCandidates.at(-1)
        : null
    return {
      itemId,
      startedEventCount: startedEvents.filter(
        (event) => protocolMessage(event)?.itemId === itemId,
      ).length,
      itemCompletedEventCount: itemCompleted.length,
      readbackStatus: readbackItem?.status ?? null,
      terminalStatus: accepted?.status ?? null,
      terminalOutcome: accepted
        ? outcomes[0] ?? terminalOutcome(accepted.status, accepted.exitCode)
        : null,
      exitCode: accepted?.exitCode ?? null,
      source:
        sources.length > 1
          ? "protocol_and_readback"
          : sources[0] ?? null,
      ...(readbackItem?.command ? { command: readbackItem.command } : {}),
    }
  })

  const interruptedAt = turnCompletionEvents
    .filter((event) =>
      interruptedTurnStatuses.has(
        normalizedStatus(protocolMessage(event)?.status),
      ),
    )
    .map(eventTime)
    .filter((value) => value !== null)
    .sort((left, right) => left - right)[0] ?? null
  const terminalInteractionCount = protocolEvents.filter(
    (event) =>
      protocolMessage(event)?.method ===
      "item/commandExecution/terminalInteraction",
  ).length
  const postInterruptionOutputCount = protocolEvents.filter((event) => {
    const message = protocolMessage(event)
    const at = eventTime(event)
    return Boolean(
      interruptedAt !== null &&
        at !== null &&
        at > interruptedAt &&
        /output/i.test(message?.method ?? "") &&
        itemIds.includes(message?.itemId),
    )
  }).length
  const processAbsenceObservationCount = (Array.isArray(events) ? events : [])
    .filter(
      (event) =>
        event?.type === "command_process_inspection" &&
        event.threadId === threadId &&
        event.turnId === turnId &&
        itemIds.includes(event.itemId) &&
        event.processPresent === false,
    ).length

  const uniqueReasons = unique(reasons).sort()
  const outcomes = unique(
    itemEvidence.map((item) => item.terminalOutcome).filter(Boolean),
  )
  const proven = uniqueReasons.length === 0 && outcomes.length > 0
  const outcome = proven
    ? outcomes.every((candidate) => candidate === "completed")
      ? "completed"
      : outcomes.includes("failed")
        ? "failed"
        : "cancelled"
    : null
  const classification = proven
    ? "terminality_proven"
    : "terminality_unprovable"
  const readback = {
    available: Boolean(threadReadback) && !readbackError,
    turnFound: Boolean(priorTurn),
    turnStatus: readbackTurnStatus,
    errorCode: readbackError
      ? stableIdentifier(readbackError.code) ?? "READBACK_UNAVAILABLE"
      : null,
  }
  const evidence = {
    eventTurnStatuses,
    readback,
    items: itemEvidence.map(({ command: _command, ...item }) => item),
    terminalInteractionCount,
    postInterruptionOutputCount,
    processAbsenceObservationCount,
    reasons: uniqueReasons,
  }
  const evidenceIdentity = digest(evidence)
  const binding = {
    originIssueNumber,
    originIssueUrl,
    instructionId,
    threadId,
    turnId,
    itemIds,
    evidenceIdentity,
  }
  const reconciliationId = `terminality_reconciliation:${digest(binding)}`
  const summary = evidenceSummary({
    turnId,
    items: itemEvidence,
    classification,
    terminalOutcome: outcome,
    reasons: uniqueReasons,
    terminalInteractionCount,
    postInterruptionOutputCount,
    processAbsenceObservationCount,
    readback,
  })
  const turnStatus =
    readbackTurnStatus ?? eventTurnStatuses.at(-1) ?? "interrupted"
  const record = {
    schemaVersion: 1,
    reconciliationId,
    ...binding,
    classification,
    terminalOutcome: outcome,
    turnStatus,
    evidence,
    evidenceSummary: summary.slice(0, 2_000),
    status: "recorded",
    reconciledAt,
    finalizedAt: null,
    resultStatus: null,
  }
  const commandExecutions = itemEvidence.map((item) => ({
    id: item.itemId,
    ...(item.command ? { command: item.command } : {}),
    status: item.terminalStatus,
    exitCode: item.exitCode,
  }))
  return {
    applicable: true,
    record,
    turnResult: {
      status:
        classification === "terminality_unprovable"
          ? "needs_review"
          : outcome === "completed"
            ? "completed"
            : "failed",
      turn: {
        id: turnId,
        status: turnStatus,
        items: [],
        ...(classification === "terminality_unprovable"
          ? {
              error: {
                code: "TERMINALITY_UNPROVABLE",
                classification: "terminality_unprovable",
                message: summary.slice(0, 2_000),
              },
            }
          : outcome !== "completed"
            ? {
                error: {
                  code: "INTERRUPTED_COMMAND_TERMINAL_FAILURE",
                  classification: "terminality_proven",
                  outcome,
                },
              }
            : {}),
      },
      pendingOwnerRequest: null,
      agentMessage: "",
      commandExecutions,
      terminalityReconciliation: record,
      retryable: false,
    },
  }
}

export function sameTerminalityReconciliation(left, right) {
  const omitMutable = (record) => {
    if (!record) return null
    const {
      status: _status,
      finalizedAt: _finalizedAt,
      resultStatus: _resultStatus,
      ...immutable
    } = record
    return canonicalValue(immutable)
  }
  return JSON.stringify(omitMutable(left)) === JSON.stringify(omitMutable(right))
}

export function terminalityReconciliationRecordIsValid(record) {
  if (
    record?.schemaVersion !== 1 ||
    !Number.isSafeInteger(record.originIssueNumber) ||
    record.originIssueNumber < 1 ||
    (record.originIssueUrl !== null &&
      typeof record.originIssueUrl !== "string") ||
    !stableIdentifier(record.instructionId) ||
    !stableIdentifier(record.threadId) ||
    !stableIdentifier(record.turnId) ||
    !Array.isArray(record.itemIds) ||
    record.itemIds.length === 0 ||
    record.itemIds.some((itemId) => !stableIdentifier(itemId)) ||
    JSON.stringify(record.itemIds) !==
      JSON.stringify([...new Set(record.itemIds)].sort()) ||
    typeof record.evidence !== "object" ||
    record.evidence === null ||
    !Array.isArray(record.evidence.items) ||
    !Array.isArray(record.evidence.reasons) ||
    !new Set(["terminality_proven", "terminality_unprovable"]).has(
      record.classification,
    ) ||
    !new Set(["recorded", "finalized"]).has(record.status) ||
    !Number.isFinite(Date.parse(record.reconciledAt ?? ""))
  ) {
    return false
  }
  const evidenceItemIds = record.evidence.items
    .map((item) => stableIdentifier(item?.itemId))
    .filter(Boolean)
    .sort()
  if (
    evidenceItemIds.length !== record.evidence.items.length ||
    JSON.stringify(evidenceItemIds) !== JSON.stringify(record.itemIds)
  ) {
    return false
  }
  const itemOutcomes = record.evidence.items.map(
    (item) => item?.terminalOutcome ?? null,
  )
  const expectedOutcome = itemOutcomes.every(
    (outcome) => outcome === "completed",
  )
    ? "completed"
    : itemOutcomes.includes("failed")
      ? "failed"
      : itemOutcomes.includes("cancelled") &&
          itemOutcomes.every((outcome) =>
            new Set(["completed", "cancelled"]).has(outcome),
          )
        ? "cancelled"
        : null
  if (
    record.classification === "terminality_proven"
      ? !new Set(["completed", "failed", "cancelled"]).has(
          record.terminalOutcome,
        ) ||
        record.evidence.reasons.length !== 0 ||
        expectedOutcome !== record.terminalOutcome
      : record.terminalOutcome !== null || record.evidence.reasons.length === 0
  ) {
    return false
  }
  if (
    record.status === "finalized"
      ? !Number.isFinite(Date.parse(record.finalizedAt ?? "")) ||
        !new Set(["failed", "needs_review"]).has(record.resultStatus)
      : record.finalizedAt !== null || record.resultStatus !== null
  ) {
    return false
  }
  const evidenceIdentity = digest(record.evidence)
  if (record.evidenceIdentity !== evidenceIdentity) return false
  const binding = {
    originIssueNumber: record.originIssueNumber,
    originIssueUrl: record.originIssueUrl,
    instructionId: record.instructionId,
    threadId: record.threadId,
    turnId: record.turnId,
    itemIds: record.itemIds,
    evidenceIdentity,
  }
  if (
    record.reconciliationId !== `terminality_reconciliation:${digest(binding)}`
  ) {
    return false
  }
  const expectedTurnStatus =
    record.evidence.readback?.turnStatus ??
    record.evidence.eventTurnStatuses?.at(-1) ??
    "interrupted"
  if (record.turnStatus !== expectedTurnStatus) return false
  const expectedSummary = evidenceSummary({
    turnId: record.turnId,
    items: record.evidence.items,
    classification: record.classification,
    terminalOutcome: record.terminalOutcome,
    reasons: record.evidence.reasons,
    terminalInteractionCount: record.evidence.terminalInteractionCount,
    postInterruptionOutputCount: record.evidence.postInterruptionOutputCount,
    processAbsenceObservationCount:
      record.evidence.processAbsenceObservationCount,
    readback: record.evidence.readback,
  }).slice(0, 2_000)
  return record.evidenceSummary === expectedSummary
}
