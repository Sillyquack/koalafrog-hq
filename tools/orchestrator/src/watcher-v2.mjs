import { createHash } from "node:crypto"
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises"
import path from "node:path"

export const watcherV2QueueBackoffMs = Object.freeze([
  60_000,
  2 * 60_000,
  4 * 60_000,
  8 * 60_000,
])
export const watcherV2PublicationBackoffMs = Object.freeze([
  60_000,
  2 * 60_000,
  4 * 60_000,
  8 * 60_000,
  15 * 60_000,
])
export const watcherV2DiscoveryBackoffMs = Object.freeze([
  60_000,
  2 * 60_000,
  4 * 60_000,
  8 * 60_000,
  15 * 60_000,
])
export const watcherV2DiscoveryProbeMs = 30 * 60_000
export const watcherV2ClaimWindowMs = 24 * 60 * 60_000
export const watcherV2MaximumClaimFailures = 5

const digestPattern = /^[a-f0-9]{64}$/
const safeInstructionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const safeRepositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
const safeRefPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

export function normalizeWatcherFailure(error) {
  const source = String(error?.message ?? error ?? "unknown watcher failure")
  const normalized = source
    .toLowerCase()
    .replaceAll(/\b[a-f0-9]{40,64}\b/g, "<digest>")
    .replaceAll(/\b\d+\b/g, "<n>")
    .replaceAll(/\/(?:[^\s:'\"]+\/)+[^\s:'\"]+/g, "<path>")
    .replaceAll(/\s+/g, " ")
    .trim()
    .slice(0, 1_000)
  const rules = [
    ["branch_already_checked_out", /already checked out|is already used by worktree/],
    ["stale_provenance", /stale.*(?:provenance|worktree)|(?:provenance|worktree).*mismatch/],
    ["unsupported_task_shape", /unsupported task|task shape|malformed agent_control/],
    ["deterministic_configuration", /configuration|config(?:uration)? .*invalid|requires --required-label/],
    ["unsupported_schema", /unsupported (?:state )?schema/],
    ["checkpoint_recovery_rejection", /checkpoint.*re(?:covery|jection)/],
    ["result_publication", /result.*public|public.*result/],
    ["network_discovery", /network|github.*(?:unavailable|timeout)|discovery.*fail|econn|enotfound/],
  ]
  const failureClass =
    rules.find(([, pattern]) => pattern.test(normalized))?.[0] ??
    "transient_instruction"
  const permanent = new Set([
    "branch_already_checked_out",
    "stale_provenance",
    "unsupported_task_shape",
    "deterministic_configuration",
    "unsupported_schema",
  ]).has(failureClass)
  return Object.freeze({
    failureClass,
    normalized,
    errorDigest: sha256(`${failureClass}\0${normalized}`),
    permanent,
  })
}

export function watcherV2QueueFailureDecision({
  existing = null,
  error,
  now = new Date(),
}) {
  const failure = normalizeWatcherFailure(error)
  const nowMs = now.getTime()
  const history = (existing?.failureHistory ?? [])
    .filter(
      (entry) =>
        Number.isFinite(Date.parse(entry?.at ?? "")) &&
        nowMs - Date.parse(entry.at) < watcherV2ClaimWindowMs,
    )
    .map((entry) => ({ ...entry }))
  history.push({ at: now.toISOString(), errorDigest: failure.errorDigest })
  const legacyFailureCount = Number.isSafeInteger(existing?.failureCount)
    ? existing.failureCount
    : 0
  const migratedLegacyExhaustion =
    history.length === 1 &&
    legacyFailureCount >= watcherV2MaximumClaimFailures &&
    !Array.isArray(existing?.failureHistory)
  const maximumFailures =
    failure.failureClass === "result_publication"
      ? watcherV2PublicationBackoffMs.length + 1
      : watcherV2MaximumClaimFailures
  const quarantined =
    failure.permanent ||
    migratedLegacyExhaustion ||
    history.length >= maximumFailures
  const failureCount = Math.max(legacyFailureCount + 1, history.length)
  const schedule =
    failure.failureClass === "result_publication"
      ? watcherV2PublicationBackoffMs
      : watcherV2QueueBackoffMs
  const backoffIndex = Math.max(
    0,
    Math.min(history.length - 1, schedule.length - 1),
  )
  return Object.freeze({
    failure,
    history: Object.freeze(history),
    failureCount,
    quarantined,
    migratedLegacyExhaustion,
    nextEligibleAt: quarantined
      ? null
      : new Date(nowMs + schedule[backoffIndex]).toISOString(),
    exhaustedReason: failure.permanent
      ? "permanent_failure"
      : migratedLegacyExhaustion
        ? "legacy_retry_count_exhausted"
        : quarantined
          ? failure.failureClass === "result_publication"
            ? "result_publication_retry_exhausted"
            : "claim_retry_policy_exhausted"
          : null,
    notificationKind: quarantined
      ? "quarantine"
      : history.length === 3
        ? "third_failure_warning"
        : null,
  })
}

function activeQuarantineIds(state) {
  const reopened = new Set(
    (state.quarantineReopens ?? []).map((record) => record.quarantineId),
  )
  return new Set(
    (state.instructionQuarantines ?? [])
      .filter((record) => !reopened.has(record.quarantineId))
      .map((record) => record.quarantineId),
  )
}

export function activeInstructionQuarantines(state) {
  const active = activeQuarantineIds(state)
  return (state.instructionQuarantines ?? []).filter((record) =>
    active.has(record.quarantineId),
  )
}

export function instructionIsQuarantined(state, instructionId) {
  return activeInstructionQuarantines(state).some(
    (record) => record.instructionId === instructionId,
  )
}

export function createInstructionQuarantineRecord({
  state,
  instructionId,
  failure,
  attemptCount,
  firstFailureAt,
  lastFailureAt,
  exhaustedReason,
  executionOccurred = false,
  now = new Date(),
}) {
  if (!safeInstructionPattern.test(instructionId ?? "")) {
    throw new Error("Quarantine requires a safe instruction ID")
  }
  const normalized = failure?.errorDigest
    ? failure
    : normalizeWatcherFailure(failure)
  if (!digestPattern.test(normalized.errorDigest ?? "")) {
    throw new Error("Quarantine requires a normalized error digest")
  }
  if (!Number.isSafeInteger(attemptCount) || attemptCount < 0) {
    throw new Error("Quarantine attempt count is invalid")
  }
  const binding = {
    repository: state.task.repository,
    issueNumber: state.task.originIssueNumber,
    instructionId,
    stateRevision: state.stateRevision,
    failureClass: normalized.failureClass,
    errorDigest: normalized.errorDigest,
    attemptCount,
    exhaustedReason,
  }
  return Object.freeze({
    schemaVersion: 1,
    quarantineId: `instruction-quarantine:${sha256(stableJson(binding))}`,
    issueNumber: state.task.originIssueNumber,
    originIssueUrl: state.task.originIssueUrl ?? null,
    instructionId,
    stateRevision: state.stateRevision,
    failureClass: normalized.failureClass,
    normalizedErrorDigest: normalized.errorDigest,
    attemptCount,
    firstFailureAt,
    lastFailureAt,
    quarantinedAt: now.toISOString(),
    retryPolicyExhaustedReason: exhaustedReason,
    ownerNotificationState: "pending",
    reopeningRequirements: Object.freeze({
      quarantineId: `instruction-quarantine:${sha256(stableJson(binding))}`,
      normalizedErrorDigest: normalized.errorDigest,
      quarantineCommittedRevision: state.stateRevision + 1,
      expectedStateRevisionMustEqualCurrent: true,
      explicitReopenRequired: true,
    }),
    executionOccurred: Boolean(executionOccurred),
  })
}

export function recordInstructionQuarantine(state, record) {
  state.instructionQuarantines ??= []
  state.quarantineReopens ??= []
  const existing = state.instructionQuarantines.find(
    (candidate) => candidate.quarantineId === record.quarantineId,
  )
  if (existing) {
    if (stableJson(existing) !== stableJson(record)) {
      throw new Error("Quarantine identity conflicts with durable history")
    }
    return { record: existing, appended: false }
  }
  if (
    activeInstructionQuarantines(state).some(
      (candidate) => candidate.instructionId === record.instructionId,
    )
  ) {
    throw new Error("Instruction already has an active quarantine")
  }
  state.instructionQuarantines.push(record)
  return { record, appended: true }
}

export function quarantineAuditEvent(record) {
  return {
    eventId: `instruction_quarantined:${record.quarantineId.slice("instruction-quarantine:".length)}`,
    type: "instruction_quarantined",
    quarantineId: record.quarantineId,
    issueNumber: record.issueNumber,
    instructionId: record.instructionId,
    failureClass: record.failureClass,
    normalizedErrorDigest: record.normalizedErrorDigest,
    attemptCount: record.attemptCount,
    retryPolicyExhaustedReason: record.retryPolicyExhaustedReason,
    executionOccurred: record.executionOccurred,
    quarantinedAt: record.quarantinedAt,
  }
}

export function quarantineReopenDecision(state, instruction) {
  const binding = instruction?.quarantineReopen
  if (!binding) return { accepted: false, code: "reopen_not_declared" }
  const matches = activeInstructionQuarantines(state).filter(
    (record) => record.quarantineId === binding.quarantineId,
  )
  if (matches.length !== 1) {
    return { accepted: false, code: "quarantine_id_mismatch" }
  }
  const quarantine = matches[0]
  if (binding.normalizedErrorDigest !== quarantine.normalizedErrorDigest) {
    return { accepted: false, code: "quarantine_digest_mismatch" }
  }
  if (binding.expectedStateRevision !== state.stateRevision) {
    return { accepted: false, code: "quarantine_revision_mismatch" }
  }
  if (
    binding.intendedAction !== instruction.action ||
    binding.clearQuarantine !== true
  ) {
    return { accepted: false, code: "quarantine_reopen_intent_mismatch" }
  }
  return { accepted: true, quarantine }
}

export function recordQuarantineReopen(
  state,
  instruction,
  { now = new Date() } = {},
) {
  state.quarantineReopens ??= []
  const requestedBinding = instruction?.quarantineReopen
  if (requestedBinding) {
    const requestedReopenId = `quarantine-reopen:${sha256(
      stableJson({
        quarantineId: requestedBinding.quarantineId,
        reopeningInstructionId: instruction.instructionId,
        expectedStateRevision: requestedBinding.expectedStateRevision,
        normalizedErrorDigest: requestedBinding.normalizedErrorDigest,
      }),
    )}`
    const existing = state.quarantineReopens.find(
      (record) => record.reopenId === requestedReopenId,
    )
    if (existing) return { accepted: true, record: existing, appended: false }
  }
  const decision = quarantineReopenDecision(state, instruction)
  if (!decision.accepted) return decision
  const binding = {
    quarantineId: decision.quarantine.quarantineId,
    reopeningInstructionId: instruction.instructionId,
    expectedStateRevision: state.stateRevision,
    normalizedErrorDigest: decision.quarantine.normalizedErrorDigest,
  }
  const reopenId = `quarantine-reopen:${sha256(stableJson(binding))}`
  const record = Object.freeze({
    schemaVersion: 1,
    reopenId,
    ...binding,
    intendedAction: instruction.action,
    reopenedAt: now.toISOString(),
    historicalAttemptCount: decision.quarantine.attemptCount,
  })
  state.quarantineReopens.push(record)
  return { accepted: true, record, appended: true }
}

export function quarantineAllowsControl(state, control) {
  const active = activeInstructionQuarantines(state)
  if (active.length === 0) return true
  return quarantineReopenDecision(state, control).accepted
}

export function recordWatcherNotification(
  state,
  { kind, quarantineId = null, instructionId, errorDigest, now = new Date() },
) {
  state.watcherNotifications ??= []
  const notificationId = `watcher-notification:${sha256(
    stableJson({ kind, quarantineId, instructionId, errorDigest }),
  )}`
  const existing = state.watcherNotifications.find(
    (record) => record.notificationId === notificationId,
  )
  if (existing) return { record: existing, appended: false }
  const record = Object.freeze({
    schemaVersion: 1,
    notificationId,
    kind,
    quarantineId,
    instructionId,
    normalizedErrorDigest: errorDigest,
    status: "pending",
    createdAt: now.toISOString(),
  })
  state.watcherNotifications.push(record)
  return { record, appended: true }
}

export function watcherNotificationComment(record) {
  const reopening = record.quarantineId
    ? `\n  quarantine_id: ${record.quarantineId}\n  normalized_error_digest: ${record.normalizedErrorDigest}`
    : ""
  return `<!-- koalafrog-watcher-notification:${record.notificationId} -->
\`\`\`yaml
watcher_notification:
  notification_id: ${record.notificationId}
  kind: ${record.kind}
  instruction_id: ${record.instructionId}${reopening}
  owner_action_required: true
\`\`\`

Persistent Watcher v2 recorded this warning once. A quarantined instruction can
resume only through a fresh control with the exact durable reopen bindings.`
}

export function recordWatcherNotificationDelivery(
  state,
  { notificationId, commentId = null, observedExisting = false, now = new Date() },
) {
  state.watcherNotificationDeliveries ??= []
  const existing = state.watcherNotificationDeliveries.find(
    (record) => record.notificationId === notificationId,
  )
  if (existing) return { record: existing, appended: false }
  const notification = (state.watcherNotifications ?? []).find(
    (record) => record.notificationId === notificationId,
  )
  if (!notification) {
    throw new Error("Watcher notification delivery has no durable intent")
  }
  const record = Object.freeze({
    schemaVersion: 1,
    deliveryId: `watcher-notification-delivery:${sha256(notificationId)}`,
    notificationId,
    commentId,
    observedExisting: Boolean(observedExisting),
    deliveredAt: now.toISOString(),
  })
  state.watcherNotificationDeliveries.push(record)
  return { record, appended: true }
}

export function checkpointRecoveryRejectionDecision(
  state,
  { instructionId, rejectionCode, evidence = null, now = new Date() },
) {
  state.checkpointRecoveryRejections ??= []
  const evidenceDigest = sha256(
    stableJson({ instructionId, rejectionCode, evidence }),
  )
  const prior = state.checkpointRecoveryRejections.filter(
    (record) => record.instructionId === instructionId,
  )
  const duplicate = prior.find(
    (record) => record.evidenceDigest === evidenceDigest,
  )
  if (duplicate) {
    return {
      appended: false,
      quarantine: true,
      reason: "checkpoint_rejection_evidence_unchanged",
      record: duplicate,
    }
  }
  const record = Object.freeze({
    schemaVersion: 1,
    rejectionId: `checkpoint-rejection:${evidenceDigest}`,
    instructionId,
    rejectionCode,
    evidenceDigest,
    sequence: prior.length + 1,
    recordedAt: now.toISOString(),
    automaticExecutionRetryOccurred: false,
  })
  state.checkpointRecoveryRejections.push(record)
  return {
    appended: true,
    quarantine: prior.length >= 1,
    reason:
      prior.length >= 1
        ? "checkpoint_rejection_second_evidence"
        : "checkpoint_rejection_recorded_no_retry",
    record,
  }
}

function issueLabels(issue) {
  return (issue?.labels ?? [])
    .map((label) => (typeof label === "string" ? label : label?.name))
    .filter((label) => typeof label === "string")
}

export function persistentIssueOptedIn(issue, config) {
  const number = issue?.issueNumber ?? issue?.number ?? issue?.issue_number
  if (config.issueNumberExplicit && number === config.issueNumber) return true
  if ((config.issueAllowlist ?? []).includes(number)) return true
  return Boolean(
    config.requiredLabel && issueLabels(issue).includes(config.requiredLabel),
  )
}

export function filterPersistentCandidates(candidates, config) {
  if (config.command !== "watch") return [...candidates]
  return candidates.filter((candidate) => persistentIssueOptedIn(candidate, config))
}

export class WatcherCircuitBreaker {
  constructor({ now = () => new Date() } = {}) {
    this.now = now
    this.failureCount = 0
    this.nextProbeAt = null
    this.lastErrorDigest = null
  }

  success() {
    this.failureCount = 0
    this.nextProbeAt = null
    this.lastErrorDigest = null
    return this.snapshot()
  }

  fail(error) {
    this.failureCount += 1
    this.lastErrorDigest = normalizeWatcherFailure(error).errorDigest
    const delay =
      this.failureCount <= watcherV2DiscoveryBackoffMs.length
        ? watcherV2DiscoveryBackoffMs[this.failureCount - 1]
        : watcherV2DiscoveryProbeMs
    this.nextProbeAt = new Date(this.now().getTime() + delay).toISOString()
    return this.snapshot()
  }

  snapshot() {
    return Object.freeze({
      failureCount: this.failureCount,
      state: this.failureCount === 0 ? "closed" : "open",
      nextProbeAt: this.nextProbeAt,
      lastErrorDigest: this.lastErrorDigest,
    })
  }

}

export async function preflightRawTaskSchemas(
  config,
  candidates,
  { read = readFile } = {},
) {
  const inspected = []
  for (const candidate of candidates) {
    const issueNumber = candidate.issueNumber ?? candidate
    const taskName = `${config.repository.replaceAll("/", "-")}-issue-${issueNumber}`
    const statePath = path.join(config.stateDirectory, taskName, "state.json")
    let parsed
    try {
      parsed = JSON.parse(await read(statePath, "utf8"))
    } catch (error) {
      if (error.code === "ENOENT") continue
      throw error
    }
    inspected.push({ issueNumber, schemaVersion: parsed.schemaVersion, statePath })
    if (
      !Number.isSafeInteger(parsed.schemaVersion) ||
      parsed.schemaVersion > config.supportedStateSchema
    ) {
      const error = new Error(
        `Unsupported state schema ${String(parsed.schemaVersion)} for issue ${issueNumber}`,
      )
      error.code = "WATCHER_UNSUPPORTED_SCHEMA"
      error.issueNumber = issueNumber
      error.schemaVersion = parsed.schemaVersion
      throw error
    }
  }
  return inspected
}

export function watcherIdentityDecision(expected, observed) {
  const fields = [
    "runtimeRelease",
    "manifestSha256",
    "sourceCommit",
    "sourceTree",
    "repository",
    "coordinatorCheckout",
    "serviceConfigSha256",
  ]
  for (const field of fields) {
    if (!expected?.[field] || expected[field] !== observed?.[field]) {
      return { accepted: false, code: `identity_${field}_mismatch`, field }
    }
  }
  return { accepted: true, identity: Object.freeze({ ...observed }) }
}

export function serviceConfigurationDigest(profile) {
  return sha256(stableJson(profile))
}

export function watcherServiceProfile(config) {
  return Object.freeze({
    label: config.serviceLabel,
    repository: config.repository,
    checkoutPath: path.resolve(config.checkoutPath),
    stateDirectory: path.resolve(config.stateDirectory),
    healthPath: path.resolve(config.healthPath),
    runtimeRelease: config.expectedRuntimeRelease,
    manifestSha256: config.expectedManifestSha256,
    sourceCommit: config.expectedSourceCommit,
    sourceTree: config.expectedSourceTree,
    codexBinary: config.codexBinary,
    pollMs: config.pollMs,
    baseRef: config.baseRef,
    maxTurns: config.maxTurns,
    turnTimeoutMs: config.turnTimeoutMs,
    maxRetries: config.maxRetries,
    retryBaseMs: config.retryBaseMs,
    discoveryLimit: config.discoveryLimit,
    maxTasksPerPoll: config.maxTasksPerPoll,
    requiredLabel: config.requiredLabel,
    runAtLoad: config.serviceRunAtLoad,
    keepAlive: config.serviceKeepAlive,
    exitTimeOut: config.serviceExitTimeOut,
    throttleInterval: config.serviceThrottleInterval,
    umask: config.serviceUmask,
    shutdownTimeoutMs: config.shutdownTimeoutMs,
  })
}

export function validateWatcherIdentityShape(identity) {
  if (
    !digestPattern.test(identity?.runtimeRelease ?? "") ||
    !digestPattern.test(identity?.manifestSha256 ?? "") ||
    !/^[a-f0-9]{40}$/.test(identity?.sourceCommit ?? "") ||
    !/^[a-f0-9]{40}$/.test(identity?.sourceTree ?? "") ||
    !safeRepositoryPattern.test(identity?.repository ?? "") ||
    !path.isAbsolute(identity?.coordinatorCheckout ?? "") ||
    !digestPattern.test(identity?.serviceConfigSha256 ?? "")
  ) {
    throw new Error("Watcher startup identity is incomplete or malformed")
  }
  return identity
}

export class WatcherHealthStore {
  constructor(filePath, { now = () => new Date() } = {}) {
    this.filePath = path.resolve(filePath)
    this.now = now
  }

  async write(value) {
    const record = {
      schemaVersion: 1,
      updatedAt: this.now().toISOString(),
      ...value,
    }
    const temporary = `${this.filePath}.${process.pid}.tmp`
    await mkdir(path.dirname(this.filePath), { recursive: true, mode: 0o700 })
    await writeFile(temporary, `${JSON.stringify(record, null, 2)}\n`, {
      mode: 0o600,
    })
    await rename(temporary, this.filePath)
    return record
  }

  async read() {
    return JSON.parse(await readFile(this.filePath, "utf8"))
  }
}

export async function readWatcherHealth(filePath, { read = readFile } = {}) {
  try {
    return JSON.parse(await read(path.resolve(filePath), "utf8"))
  } catch (error) {
    if (error.code === "ENOENT") return { state: "absent", path: path.resolve(filePath) }
    throw error
  }
}

export class ShutdownCoordinator {
  constructor({ timeoutMs = 75_000, now = () => new Date() } = {}) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
      throw new Error("Shutdown deadline must be positive")
    }
    this.timeoutMs = timeoutMs
    this.now = now
    this.controller = new AbortController()
    this.requestedAt = null
    this.deadlineAt = null
    this.signalCount = 0
  }

  request(reason = "shutdown_requested") {
    this.signalCount += 1
    if (!this.requestedAt) {
      this.requestedAt = this.now().toISOString()
      this.deadlineAt = new Date(
        Date.parse(this.requestedAt) + this.timeoutMs,
      ).toISOString()
      this.controller.abort(reason)
    }
    return this.snapshot()
  }

  snapshot() {
    return Object.freeze({
      requested: Boolean(this.requestedAt),
      inProgress: Boolean(this.requestedAt),
      requestedAt: this.requestedAt,
      deadlineAt: this.deadlineAt,
      signalCount: this.signalCount,
    })
  }

  deadlineExpired(at = this.now()) {
    return Boolean(
      this.deadlineAt && at.getTime() >= Date.parse(this.deadlineAt),
    )
  }
}

export async function discoverRawStateEntries(
  config,
  { list = readdir } = {},
) {
  const prefix = `${config.repository.replaceAll("/", "-")}-issue-`
  let entries
  try {
    entries = await list(config.stateDirectory, { withFileTypes: true })
  } catch (error) {
    if (error.code === "ENOENT") return []
    throw error
  }
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => Number.parseInt(entry.name.slice(prefix.length), 10))
    .filter((number) => Number.isSafeInteger(number) && number > 0)
    .filter(
      (number) =>
        config.issueNumberExplicit ||
        (config.issueAllowlist ?? []).includes(number),
    )
    .map((issueNumber) => ({ issueNumber }))
}

export function assertSafeWatcherRef(value) {
  if (!safeRefPattern.test(value ?? "") || value.includes("..")) {
    throw new Error("Watcher ref is unsafe")
  }
  return value
}
