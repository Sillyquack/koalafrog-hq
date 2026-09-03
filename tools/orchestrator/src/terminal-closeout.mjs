import {
  agentControlBindingDigest,
  agentResultPublicationDecision,
  controlPlaneBindingDigest,
  consumedInstructionIds,
  durableSupersededInstructionIds,
  findExistingPickup,
  findExistingResult,
  isInstructionEligible,
  listAgentControls,
} from "./control-plane.mjs"
import {
  pendingActionScope,
  pendingApprovalRequestKey,
} from "./approval-decisions.mjs"
import { currentStateSchemaVersion } from "./state-store.mjs"

const instructionIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const digestPattern = /^[0-9a-f]{64}$/
const ownerApprovalDecisionTtlMs = 24 * 60 * 60 * 1_000
const terminalCloseoutStateSchemaCompatibility = new Map([
  [12, new Set([12, 13])],
  [13, new Set([13])],
])
const schema13AdditiveLedgerNames = [
  "instructionQuarantines",
  "quarantineReopens",
  "watcherNotifications",
  "watcherNotificationDeliveries",
  "checkpointRecoveryRejections",
  "commitAuthorizationReceipts",
]

function rejected(code, details = {}) {
  return { accepted: false, rejection: { code, ...details } }
}

export function isTerminalCloseoutControl(control) {
  return Boolean(
    control?.action === "stop" &&
      control.taskState === "needs_review" &&
      control.terminalState === "done" &&
      control.closeout?.retireAllUnconsumedControls === true &&
      control.closeout?.supersedePendingApprovals === true &&
      control.closeout?.requireNoActiveClaims === true &&
      control.closeout?.requireOriginIssueClosed === true &&
      Number.isSafeInteger(control.expectedStateRevision),
  )
}

function terminalCloseoutIdentity(binding) {
  return `task-terminal-closeout:${controlPlaneBindingDigest(
    JSON.stringify([
      1,
      binding.issueNumber,
      binding.originIssueUrl,
      binding.closeoutInstructionId,
      binding.closeoutControlIndex,
      binding.closeoutControlDigest,
      binding.priorTaskState,
      binding.terminalState,
      binding.expectedStateRevision,
      binding.committedStateRevision,
      binding.expectedLastConsumedInstructionId,
      binding.retiredInstructionIds,
      binding.retiredControls,
      binding.approvalTombstones,
      binding.githubIssueState,
      binding.githubIssueUpdatedAt,
      binding.claimInspectionDigest,
    ]),
  )}`
}

function supportedHistoricalStateSchema(expectedSchemaVersion) {
  return Boolean(
    Number.isSafeInteger(expectedSchemaVersion) &&
      expectedSchemaVersion <= currentStateSchemaVersion &&
      terminalCloseoutStateSchemaCompatibility.has(expectedSchemaVersion),
  )
}

function terminalCloseoutStateSchemaIsCompatible(record, state) {
  const compatibleStateSchemas =
    terminalCloseoutStateSchemaCompatibility.get(record.expectedSchemaVersion)
  if (
    !compatibleStateSchemas?.has(state.schemaVersion) ||
    state.schemaVersion > currentStateSchemaVersion
  ) {
    return false
  }
  if (record.expectedSchemaVersion !== 12) return true
  if (state.schemaVersion === 12) {
    return schema13AdditiveLedgerNames.every(
      (name) => !Object.hasOwn(state, name),
    )
  }
  return Boolean(
    state.schemaVersion === 13 &&
      state.stateRevision > record.committedStateRevision &&
      schema13AdditiveLedgerNames.every(
        (name) => Array.isArray(state[name]) && state[name].length === 0,
      ),
  )
}

function basicRecordIsValid(record) {
  return Boolean(
    record?.schemaVersion === 1 &&
      typeof record.closeoutId === "string" &&
      /^task-terminal-closeout:[0-9a-f]{64}$/.test(record.closeoutId) &&
      Number.isSafeInteger(record.issueNumber) &&
      record.issueNumber > 0 &&
      (record.originIssueUrl === null ||
        typeof record.originIssueUrl === "string") &&
      instructionIdPattern.test(record.closeoutInstructionId ?? "") &&
      Number.isSafeInteger(record.closeoutControlIndex) &&
      record.closeoutControlIndex >= 0 &&
      digestPattern.test(record.closeoutControlDigest ?? "") &&
      record.priorTaskState === "needs_review" &&
      record.terminalState === "done" &&
      supportedHistoricalStateSchema(record.expectedSchemaVersion) &&
      Number.isSafeInteger(record.expectedStateRevision) &&
      record.expectedStateRevision >= 0 &&
      record.committedStateRevision === record.expectedStateRevision + 1 &&
      instructionIdPattern.test(
        record.expectedLastConsumedInstructionId ?? "",
      ) &&
      record.priorLastConsumedInstructionId ===
        record.expectedLastConsumedInstructionId &&
      Array.isArray(record.retiredInstructionIds) &&
      new Set(record.retiredInstructionIds).size ===
        record.retiredInstructionIds.length &&
      record.retiredInstructionIds.every((id) =>
        instructionIdPattern.test(id),
      ) &&
      Array.isArray(record.retiredControls) &&
      record.retiredControls.length === record.retiredInstructionIds.length &&
      Array.isArray(record.approvalTombstones) &&
      record.githubIssueState === "closed" &&
      Number.isFinite(Date.parse(record.githubIssueUpdatedAt ?? "")) &&
      digestPattern.test(record.claimInspectionDigest ?? "") &&
      record.activeClaimCount === 0 &&
      record.executionOccurred === false &&
      record.reason === "terminal_closeout" &&
      Number.isFinite(Date.parse(record.recordedAt ?? "")),
  )
}

export function validateTerminalCloseoutRecord(
  record,
  { state = null, controls = null } = {},
) {
  if (!basicRecordIsValid(record)) {
    throw new Error("Durable terminal closeout record is malformed")
  }
  for (let index = 0; index < record.retiredControls.length; index += 1) {
    const retired = record.retiredControls[index]
    if (
      retired?.instructionId !== record.retiredInstructionIds[index] ||
      !Number.isSafeInteger(retired.controlIndex) ||
      retired.controlIndex < 0 ||
      !new Set(["start", "continue", "stop"]).has(retired.action) ||
      typeof retired.taskState !== "string" ||
      !digestPattern.test(retired.controlDigest ?? "") ||
      typeof retired.priorEligibility !== "boolean" ||
      retired.executionOccurred !== false ||
      retired.reason !== "terminal_closeout"
    ) {
      throw new Error("Durable terminal control retirement is malformed")
    }
  }
  for (const approval of record.approvalTombstones) {
    if (
      approval?.schemaVersion !== 1 ||
      typeof approval.key !== "string" ||
      typeof approval.scope !== "string" ||
      !digestPattern.test(approval.reasonDigest ?? "") ||
      !instructionIdPattern.test(approval.sourceInstructionId ?? "") ||
      approval.priorStatus !== "interrupted" ||
      !Array.isArray(approval.requestIdentityDigests) ||
      approval.requestIdentityDigests.length === 0 ||
      approval.requestIdentityDigests.some(
        (identity) => !digestPattern.test(identity),
      ) ||
      approval.decisionCreated !== false ||
      approval.acknowledgementCreated !== false ||
      approval.reason !== "terminal_closeout"
    ) {
      throw new Error("Durable terminal approval tombstone is malformed")
    }
  }
  if (terminalCloseoutIdentity(record) !== record.closeoutId) {
    throw new Error("Durable terminal closeout identity is invalid")
  }
  if (state) {
    if (
      !terminalCloseoutStateSchemaIsCompatible(record, state) ||
      state.status !== "done" ||
      state.activeInstruction !== null ||
      state.lastConsumedInstructionId !== record.closeoutInstructionId ||
      state.task?.originIssueNumber !== record.issueNumber ||
      state.task?.originIssueClosed !== true ||
      state.stateRevision < record.committedStateRevision
    ) {
      throw new Error("Durable terminal closeout state binding drifted")
    }
    for (const approval of record.approvalTombstones) {
      const matches = (state.pendingApprovalRequests ?? []).filter(
        (candidate) => candidate.key === approval.key,
      )
      if (
        matches.length !== 1 ||
        matches[0].status !== "terminally_retired" ||
        matches[0].terminalCloseoutId !== record.closeoutId ||
        matches[0].clearReason !== "terminal_closeout" ||
        matches[0].clearedAt !== record.recordedAt ||
        matches[0].decisionId !== null
      ) {
        throw new Error("Terminal approval tombstone state binding drifted")
      }
    }
  }
  if (controls) {
    const controllerMatches = controls
      .map((control, controlIndex) => ({ control, controlIndex }))
      .filter(
        ({ control }) =>
          control.instructionId === record.closeoutInstructionId,
      )
    if (
      controllerMatches.length !== 1 ||
      controllerMatches[0].controlIndex !== record.closeoutControlIndex ||
      agentControlBindingDigest(controllerMatches[0].control) !==
        record.closeoutControlDigest
    ) {
      throw new Error("Terminal closeout control binding drifted")
    }
    for (const retired of record.retiredControls) {
      const matches = controls
        .map((control, controlIndex) => ({ control, controlIndex }))
        .filter(
          ({ control }) => control.instructionId === retired.instructionId,
        )
      if (
        matches.length !== 1 ||
        matches[0].controlIndex !== retired.controlIndex ||
        matches[0].control.action !== retired.action ||
        matches[0].control.taskState !== retired.taskState ||
        agentControlBindingDigest(matches[0].control) !== retired.controlDigest
      ) {
        throw new Error("Terminally retired control binding drifted")
      }
    }
  }
  return record
}

function existingTerminalCloseout(state, controls) {
  const records = state.terminalCloseouts ?? []
  if (!Array.isArray(records) || records.length > 1) {
    throw new Error("Durable terminal closeout ledger is ambiguous")
  }
  if (records.length === 0) return null
  return validateTerminalCloseoutRecord(records[0], { state, controls })
}

export function selectTerminalCloseoutCandidate(
  issue,
  comments = [],
  state = {},
) {
  const controls = listAgentControls(issue, comments)
  const existing = existingTerminalCloseout(state, controls)
  if (existing) {
    return controls[existing.closeoutControlIndex]
  }
  if (state.status === "done") return null
  const candidates = controls.filter(isTerminalCloseoutControl)
  if (candidates.length > 1) {
    throw new Error("Terminal closeout control is ambiguous")
  }
  const candidate = candidates[0] ?? null
  if (!candidate) return null
  return isInstructionEligible(candidate, state.status) ? candidate : null
}

function approvalTombstoneDecision(pending, now) {
  const identityDigests = pending?.requestIdentities?.map(
    (identity) => identity?.identityDigest,
  )
  const request = {
    method: pending?.requestIdentities?.[0]?.method,
    reason: pending?.reason,
  }
  const expectedScope = pendingActionScope(request)
  const expectedKey = pendingApprovalRequestKey(request)
  const expectedReasonDigest = expectedKey?.slice(
    `${expectedScope}:`.length,
  )
  if (
    pending?.schemaVersion !== 1 ||
    typeof pending.key !== "string" ||
    typeof pending.scope !== "string" ||
    typeof pending.reason !== "string" ||
    pending.scope !== expectedScope ||
    pending.key !== expectedKey ||
    pending.reasonDigest !== expectedReasonDigest ||
    !instructionIdPattern.test(pending.sourceInstructionId ?? "") ||
    pending.status !== "interrupted" ||
    pending.decisionId !== null ||
    pending.clearedAt !== null ||
    pending.clearReason !== null ||
    !Array.isArray(identityDigests) ||
    identityDigests.length === 0 ||
    identityDigests.some((identity) => !digestPattern.test(identity ?? "")) ||
    pending.requestIdentities.some(
      (identity) =>
        identity?.method !== "item/commandExecution/requestApproval" ||
        !Number.isFinite(Date.parse(identity.observedAt ?? "")),
    ) ||
    !Number.isFinite(Date.parse(pending.lastObservedAt ?? ""))
  ) {
    return rejected("pending_approval_identity_mismatch", {
      pendingApprovalKey: pending?.key ?? null,
    })
  }
  return {
    accepted: true,
    value: {
      schemaVersion: 1,
      key: pending.key,
      scope: pending.scope,
      reasonDigest: pending.reasonDigest,
      sourceInstructionId: pending.sourceInstructionId,
      capturedAt: pending.capturedAt,
      lastObservedAt: pending.lastObservedAt,
      priorStatus: pending.status,
      requestIdentityDigests: identityDigests,
      expiredAtCloseout:
        now.getTime() - Date.parse(pending.lastObservedAt) >
        ownerApprovalDecisionTtlMs,
      decisionCreated: false,
      acknowledgementCreated: false,
      reason: "terminal_closeout",
    },
  }
}

function unresolvedStateResidue(state) {
  if (state.activeInstruction) return "active_instruction"
  if (state.retryCount !== 0) return "active_retry_count"
  if ((state.retryInstructionIds ?? []).length) return "active_retry_marker"
  if ((state.resultCorrectionInstructionIds ?? []).length) {
    return "active_result_correction"
  }
  if (state.pendingOwnerRequest) return "pending_owner_request"
  if (
    (state.ownerApprovalDecisions ?? []).some(
      (decision) => !decision.completedAt,
    )
  ) {
    return "pending_mutation_grant"
  }
  if (
    (state.ownerGateAcknowledgements ?? []).some(
      (acknowledgement) => !acknowledgement.completedAt,
    )
  ) {
    return "pending_owner_gate_acknowledgement"
  }
  if (
    (state.checkpointActivationRecoveries ?? []).some(
      (recovery) => !recovery.completedAt,
    )
  ) {
    return "pending_checkpoint_recovery"
  }
  if (
    (state.terminalityReconciliations ?? []).some(
      (record) => record.status !== "finalized",
    )
  ) {
    return "pending_terminality_reconciliation"
  }
  const checkpoints = state.gitReconciliationCheckpoints ?? []
  const intents = checkpoints.filter(
    (record) => record.kind === "execution_intent",
  )
  const receipts = checkpoints.filter(
    (record) => record.kind === "execution_receipt",
  )
  if (
    intents.some(
      (intent) =>
        receipts.filter(
          (receipt) => receipt.executionId === intent.executionId,
        ).length !== 1,
    )
  ) {
    return "pending_broker_receipt"
  }
  return null
}

function claimEvidenceDigest(claimRecords) {
  return controlPlaneBindingDigest(
    JSON.stringify(
      Object.entries(claimRecords)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([instructionId, claim]) => [
          instructionId,
          claim
            ? {
                originIssueNumber: claim.originIssueNumber,
                status: claim.status,
                attempt: claim.attempt,
                resultStatus: claim.resultStatus ?? null,
                completedAt: claim.completedAt ?? null,
              }
            : null,
        ]),
    ),
  )
}

export function terminalCloseoutDecision({
  issue,
  comments = [],
  state,
  closeoutInstruction,
  claimRecords = {},
  now = new Date(),
}) {
  const controls = listAgentControls(issue, comments)
  const existing = existingTerminalCloseout(state, controls)
  if (existing) {
    if (
      closeoutInstruction?.instructionId !== existing.closeoutInstructionId ||
      agentControlBindingDigest(closeoutInstruction) !==
        existing.closeoutControlDigest
    ) {
      return rejected("terminal_closeout_already_committed")
    }
    return { accepted: true, value: { alreadyApplied: true, record: existing } }
  }
  if (!isTerminalCloseoutControl(closeoutInstruction)) {
    return rejected("terminal_closeout_missing")
  }
  const candidate = selectTerminalCloseoutCandidate(issue, comments, state)
  if (
    !candidate ||
    candidate.instructionId !== closeoutInstruction.instructionId ||
    agentControlBindingDigest(candidate) !==
      agentControlBindingDigest(closeoutInstruction)
  ) {
    return rejected("terminal_closeout_control_changed")
  }
  const controlsById = new Map()
  for (let controlIndex = 0; controlIndex < controls.length; controlIndex += 1) {
    const control = controls[controlIndex]
    const matches = controlsById.get(control.instructionId) ?? []
    matches.push({ control, controlIndex })
    controlsById.set(control.instructionId, matches)
    if (!Object.hasOwn(claimRecords, control.instructionId)) {
      return rejected("claim_inspection_missing", {
        instructionId: control.instructionId,
      })
    }
  }
  const issueNumber = issue?.number ?? issue?.issue_number
  const issueUrl = issue?.html_url ?? issue?.display_url ?? issue?.url ?? null
  const issueUpdatedAt = issue?.updated_at ?? issue?.updatedAt ?? null
  if (
    issueNumber !== state.task?.originIssueNumber ||
    state.task?.issueNumber !== state.task?.originIssueNumber ||
    (state.task?.originIssueUrl && issueUrl !== state.task.originIssueUrl)
  ) {
    return rejected("issue_origin_mismatch")
  }
  if (
    issue?.state !== "closed" ||
    !Number.isFinite(Date.parse(issueUpdatedAt ?? ""))
  ) {
    return rejected("github_issue_not_closed")
  }
  if (
    state.schemaVersion !== currentStateSchemaVersion ||
    state.status !== "needs_review" ||
    closeoutInstruction.taskState !== state.status ||
    closeoutInstruction.terminalState !== "done"
  ) {
    return rejected("terminal_state_binding_mismatch")
  }
  if (closeoutInstruction.expectedStateRevision !== state.stateRevision) {
    return rejected("state_revision_mismatch", {
      expectedStateRevision: closeoutInstruction.expectedStateRevision,
      actualStateRevision: state.stateRevision,
    })
  }
  if (
    closeoutInstruction.closeout.expectedLastConsumedInstructionId !==
      state.lastConsumedInstructionId
  ) {
    return rejected("last_consumed_instruction_mismatch", {
      expectedLastConsumedInstructionId:
        closeoutInstruction.closeout.expectedLastConsumedInstructionId,
      actualLastConsumedInstructionId: state.lastConsumedInstructionId,
    })
  }
  const residue = unresolvedStateResidue(state)
  if (residue) return rejected(residue)

  let activeClaimCount = 0
  for (const [instructionId, claim] of Object.entries(claimRecords)) {
    if (!claim) continue
    if (claim.originIssueNumber !== state.task.originIssueNumber) {
      return rejected("claim_origin_mismatch", { instructionId })
    }
    if (claim.status === "active") activeClaimCount += 1
    if (new Set(["retryable_error", "released"]).has(claim.status)) {
      return rejected("active_queue_retry", {
        instructionId,
        claimStatus: claim.status,
      })
    }
  }
  if (activeClaimCount !== 0) {
    return rejected("active_queue_claim", { activeClaimCount })
  }
  if (claimRecords[closeoutInstruction.instructionId] !== null) {
    return rejected("closeout_control_claimed")
  }

  const lastConsumedId = state.lastConsumedInstructionId
  const lastRuns = (state.runs ?? []).filter(
    (run) => run.instructionId === lastConsumedId,
  )
  if (lastRuns.length !== 1) {
    return rejected("last_consumed_run_count", { runCount: lastRuns.length })
  }
  const publication = agentResultPublicationDecision({
    comments,
    instructionId: lastConsumedId,
  })
  if (!publication.accepted) {
    return rejected("incomplete_result_publication", {
      publicationCode: publication.rejection.code,
    })
  }
  const lastClaim = claimRecords[lastConsumedId]
  if (
    !lastClaim ||
    lastClaim.status !== "completed" ||
    lastClaim.resultStatus !== lastRuns[0].status
  ) {
    return rejected("last_consumed_queue_incomplete")
  }

  const superseded = durableSupersededInstructionIds(state, controls)
  const consumed = consumedInstructionIds(state, comments, controls)
  const retiredControls = []
  const runIds = new Set((state.runs ?? []).map((run) => run.instructionId))
  for (let controlIndex = 0; controlIndex < controls.length; controlIndex += 1) {
    const control = controls[controlIndex]
    if (control.instructionId === closeoutInstruction.instructionId) continue
    if (superseded.has(control.instructionId)) continue
    if (consumed.has(control.instructionId)) continue
    const hasPickup = Boolean(findExistingPickup(comments, control.instructionId))
    const hasResult = Boolean(findExistingResult(comments, control.instructionId))
    if (hasPickup && !runIds.has(control.instructionId)) {
      return rejected("unconsumed_target_pickup", {
        instructionId: control.instructionId,
      })
    }
    if (hasResult && !runIds.has(control.instructionId)) {
      return rejected("unconsumed_target_result", {
        instructionId: control.instructionId,
      })
    }
    if (controlsById.get(control.instructionId).length !== 1) {
      return rejected("unconsumed_target_ambiguous", {
        instructionId: control.instructionId,
      })
    }
    if (state.activeInstruction?.instructionId === control.instructionId) {
      return rejected("unconsumed_target_active", {
        instructionId: control.instructionId,
      })
    }
    if ((state.retryInstructionIds ?? []).includes(control.instructionId)) {
      return rejected("unconsumed_target_retry", {
        instructionId: control.instructionId,
      })
    }
    if ((state.resultCorrectionInstructionIds ?? []).includes(control.instructionId)) {
      return rejected("unconsumed_target_result_correction", {
        instructionId: control.instructionId,
      })
    }
    const claim = claimRecords[control.instructionId]
    if (claim) {
      return rejected("unconsumed_target_claimed", {
        instructionId: control.instructionId,
        claimStatus: claim.status,
      })
    }
    retiredControls.push({
      instructionId: control.instructionId,
      controlIndex,
      action: control.action,
      taskState: control.taskState,
      controlDigest: agentControlBindingDigest(control),
      priorEligibility: isInstructionEligible(control, state.status),
      executionOccurred: false,
      reason: "terminal_closeout",
    })
  }

  const approvalTombstones = []
  for (const pending of state.pendingApprovalRequests ?? []) {
    if (pending.clearedAt) continue
    const tombstone = approvalTombstoneDecision(pending, now)
    if (!tombstone.accepted) return tombstone
    approvalTombstones.push(tombstone.value)
  }
  const closeoutMatches = controlsById.get(closeoutInstruction.instructionId)
  if (closeoutMatches?.length !== 1) {
    return rejected("closeout_control_ambiguous")
  }
  const closeoutControl = closeoutMatches[0]
  return {
    accepted: true,
    value: {
      alreadyApplied: false,
      issueNumber,
      originIssueUrl: issueUrl,
      closeoutInstructionId: closeoutInstruction.instructionId,
      closeoutControlIndex: closeoutControl.controlIndex,
      closeoutControlDigest: agentControlBindingDigest(closeoutInstruction),
      priorTaskState: state.status,
      terminalState: "done",
      expectedSchemaVersion: currentStateSchemaVersion,
      expectedStateRevision: state.stateRevision,
      committedStateRevision: state.stateRevision + 1,
      expectedLastConsumedInstructionId: lastConsumedId,
      priorLastConsumedInstructionId: lastConsumedId,
      retiredInstructionIds: retiredControls.map(
        (control) => control.instructionId,
      ),
      retiredControls,
      approvalTombstones,
      githubIssueState: "closed",
      githubIssueUpdatedAt: issueUpdatedAt,
      claimInspectionDigest: claimEvidenceDigest(claimRecords),
      activeClaimCount,
      executionOccurred: false,
      reason: "terminal_closeout",
    },
  }
}

export function recordTerminalCloseout(
  state,
  decision,
  { now = new Date() } = {},
) {
  if (
    decision?.alreadyApplied ||
    state.schemaVersion !== decision?.expectedSchemaVersion ||
    state.stateRevision !== decision?.expectedStateRevision ||
    state.status !== decision?.priorTaskState ||
    state.status !== "needs_review" ||
    state.activeInstruction !== null ||
    state.lastConsumedInstructionId !==
      decision?.expectedLastConsumedInstructionId ||
    !Array.isArray(state.terminalCloseouts) ||
    state.terminalCloseouts.length !== 0
  ) {
    throw new Error("Terminal closeout state binding changed")
  }
  const record = {
    schemaVersion: 1,
    ...decision,
    recordedAt: now.toISOString(),
  }
  delete record.alreadyApplied
  record.closeoutId = terminalCloseoutIdentity(record)
  const successor = structuredClone(state)
  for (const tombstone of record.approvalTombstones) {
    const matches = (successor.pendingApprovalRequests ?? []).filter(
      (pending) => pending.key === tombstone.key,
    )
    if (
      matches.length !== 1 ||
      matches[0].status !== tombstone.priorStatus ||
      matches[0].decisionId !== null ||
      matches[0].clearedAt !== null
    ) {
      throw new Error("Terminal approval tombstone binding changed")
    }
    matches[0].status = "terminally_retired"
    matches[0].terminalCloseoutId = record.closeoutId
    matches[0].clearedAt = record.recordedAt
    matches[0].clearReason = "terminal_closeout"
  }
  successor.terminalCloseouts.push(record)
  successor.status = "done"
  successor.lastConsumedInstructionId = record.closeoutInstructionId
  successor.activeInstruction = null
  successor.task.originIssueClosed = true
  successor.task.lastObservedIssueUpdatedAt = record.githubIssueUpdatedAt
  validateTerminalCloseoutRecord(record, {
    state: { ...successor, stateRevision: record.committedStateRevision },
  })
  for (const key of Object.keys(state)) delete state[key]
  Object.assign(state, successor)
  return record
}

export function terminalCloseoutAuditEvents(record) {
  validateTerminalCloseoutRecord(record)
  const digest = record.closeoutId.slice("task-terminal-closeout:".length)
  const base = {
    closeoutId: record.closeoutId,
    issueNumber: record.issueNumber,
    originIssueUrl: record.originIssueUrl,
    closeoutInstructionId: record.closeoutInstructionId,
    priorTaskState: record.priorTaskState,
    terminalState: record.terminalState,
    expectedStateRevision: record.expectedStateRevision,
    committedStateRevision: record.committedStateRevision,
    expectedLastConsumedInstructionId:
      record.expectedLastConsumedInstructionId,
    githubIssueState: record.githubIssueState,
    githubIssueUpdatedAt: record.githubIssueUpdatedAt,
    claimInspectionDigest: record.claimInspectionDigest,
    activeClaimCount: record.activeClaimCount,
    recordedAt: record.recordedAt,
    reason: "terminal_closeout",
    executionOccurred: false,
  }
  return [
    {
      eventId: `task_terminally_closed:${digest}`,
      type: "task_terminally_closed",
      ...base,
      retiredInstructionIds: record.retiredInstructionIds,
      approvalKeys: record.approvalTombstones.map((approval) => approval.key),
    },
    ...record.retiredControls.map((control, index) => ({
      eventId: `instruction_terminally_retired:${digest}:${index + 1}`,
      type: "instruction_terminally_retired",
      ...base,
      retiredInstructionId: control.instructionId,
      retiredTaskState: control.taskState,
      priorEligibility: control.priorEligibility,
      controlIndex: control.controlIndex,
      controlDigest: control.controlDigest,
    })),
    ...record.approvalTombstones.map((approval, index) => ({
      eventId: `approval_terminally_retired:${digest}:${index + 1}`,
      type: "approval_terminally_retired",
      ...base,
      pendingApprovalKey: approval.key,
      pendingApprovalScope: approval.scope,
      pendingApprovalReasonDigest: approval.reasonDigest,
      sourceInstructionId: approval.sourceInstructionId,
      requestIdentityDigests: approval.requestIdentityDigests,
      expiredAtCloseout: approval.expiredAtCloseout,
      decisionCreated: false,
      acknowledgementCreated: false,
    })),
  ]
}
