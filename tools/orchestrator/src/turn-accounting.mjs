function isNonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0
}

function latestCompletedTurnCount(state, instructionId) {
  for (let index = (state.runs ?? []).length - 1; index >= 0; index -= 1) {
    const run = state.runs[index]
    if (
      run.instructionId === instructionId &&
      isNonNegativeInteger(run.turnCount)
    ) {
      return run.turnCount
    }
  }
  return 0
}

function legacyActiveTurnCount(activeInstruction) {
  const attempts = isNonNegativeInteger(activeInstruction?.attempts)
    ? activeInstruction.attempts
    : 0
  return attempts + (activeInstruction?.phase === "turn_started" ? 1 : 0)
}

export function instructionTurnCount(
  state,
  instructionId = state.activeInstruction?.instructionId,
) {
  if (!instructionId) return 0
  const completedTurns = latestCompletedTurnCount(state, instructionId)
  if (state.activeInstruction?.instructionId !== instructionId) {
    return completedTurns
  }
  if (isNonNegativeInteger(state.activeInstruction.turnCount)) {
    return state.activeInstruction.turnCount
  }
  return completedTurns + legacyActiveTurnCount(state.activeInstruction)
}

export function normalizeTurnAccounting(state) {
  if (!isNonNegativeInteger(state.turnCount)) state.turnCount = 0
  if (
    state.activeInstruction &&
    !isNonNegativeInteger(state.activeInstruction.turnCount)
  ) {
    state.activeInstruction.turnCount = instructionTurnCount(
      state,
      state.activeInstruction.instructionId,
    )
  }
  return state
}

export function canStartInstructionTurn(state, maxTurns) {
  return instructionTurnCount(state) < maxTurns
}

export function recordInstructionTurnStarted(
  state,
  { turnId, attempt, startedAt = new Date() },
) {
  normalizeTurnAccounting(state)
  const activeInstruction = state.activeInstruction
  if (!activeInstruction) {
    throw new Error("Cannot count a turn without an active instruction")
  }
  if (
    activeInstruction.phase === "turn_started" &&
    activeInstruction.turnId === turnId
  ) {
    return false
  }
  const turnStartedAt =
    startedAt instanceof Date ? startedAt.toISOString() : String(startedAt)
  if (!Number.isFinite(Date.parse(turnStartedAt))) {
    throw new Error("Turn start time must be a valid durable timestamp")
  }

  state.turnCount += 1
  activeInstruction.turnCount += 1
  activeInstruction.phase = "turn_started"
  activeInstruction.turnId = turnId
  activeInstruction.turnStartedAt = turnStartedAt
  activeInstruction.attempts = attempt
  return true
}
