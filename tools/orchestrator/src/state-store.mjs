import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { recoverPendingApprovalRequestsFromEvents } from "./approval-decisions.mjs"
import {
  acquireCrashSafeFileLease,
  appendFileNoFollow,
  cleanupOrphanAtomicTemps,
  defaultProcessIdentity,
  defaultProcessIsAlive,
  durableAtomicWriteFile,
  ensurePrivateDirectory,
  FileLeaseMetadataError,
  readFileNoFollow,
  recoverDurableFileReplace,
  releaseCrashSafeFileLease,
} from "./durable-filesystem.mjs"
import { normalizeTurnAccounting } from "./turn-accounting.mjs"

export const currentStateSchemaVersion = 9

const stateLockAttempts = 400
const stateLockDelayMs = 5

export class StateRevisionConflictError extends Error {
  constructor({ expectedRevision, actualRevision }) {
    super(
      `Persisted state revision changed (expected ${expectedRevision}, actual ${actualRevision})`,
    )
    this.name = "StateRevisionConflictError"
    this.code = "STATE_REVISION_CONFLICT"
    this.expectedRevision = expectedRevision
    this.actualRevision = actualRevision
  }
}

export class StateRevisionOverflowError extends Error {
  constructor(revision) {
    super(`Persisted state revision cannot advance beyond ${revision}`)
    this.name = "StateRevisionOverflowError"
    this.code = "STATE_REVISION_OVERFLOW"
    this.revision = revision
  }
}

function durableRevision(value, { legacy = false } = {}) {
  if (legacy && value == null) return 0
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Persisted state revision is invalid")
  }
  return value
}

function nextDurableRevision(revision) {
  const current = durableRevision(revision)
  if (current >= Number.MAX_SAFE_INTEGER) {
    throw new StateRevisionOverflowError(current)
  }
  return current + 1
}

function persistedRevision(contents) {
  if (contents === null) return 0
  const parsed = JSON.parse(contents.toString("utf8"))
  return durableRevision(parsed.stateRevision, {
    legacy: Number.isSafeInteger(parsed.schemaVersion) && parsed.schemaVersion < 9,
  })
}

function stateTransactionIdentity(contents) {
  if (contents === null) return { kind: "missing", revision: 0 }
  const parsed = JSON.parse(contents.toString("utf8"))
  const schemaVersion = parsed.schemaVersion
  const revision = durableRevision(parsed.stateRevision, {
    legacy: Number.isSafeInteger(schemaVersion) && schemaVersion < 9,
  })
  const repository = parsed.task?.repository
  const issueNumber = parsed.task?.issueNumber
  const originIssueNumber = parsed.task?.originIssueNumber ?? issueNumber
  if (
    !Number.isSafeInteger(schemaVersion) ||
    typeof repository !== "string" ||
    !Number.isSafeInteger(issueNumber) ||
    !Number.isSafeInteger(originIssueNumber)
  ) {
    throw new Error("Durable state transaction identity is malformed")
  }
  return {
    kind: "state",
    schemaVersion,
    revision,
    repository,
    issueNumber,
    originIssueNumber,
  }
}

function validStateTransaction(predecessor, successor) {
  if (successor?.kind !== "state" || successor.schemaVersion !== 9) return false
  if (predecessor?.kind === "missing") return successor.revision === 1
  return Boolean(
    predecessor?.kind === "state" &&
      successor.repository === predecessor.repository &&
      successor.issueNumber === predecessor.issueNumber &&
      successor.originIssueNumber === predecessor.originIssueNumber &&
      successor.revision === predecessor.revision + 1,
  )
}

const stateTransactionOptions = {
  transactionKind: "task_state_replace",
  deriveSemanticIdentity: stateTransactionIdentity,
  validateTransition: validStateTransaction,
}

function redactString(value) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
      "[redacted]",
    )
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{12,})\b/g,
      "[redacted]",
    )
    .replace(
      /([?&](?:access[_-]?key|api[_-]?key|sig|token|key|secret|password)=)[^&\s]+/gi,
      "$1[redacted]",
    )
    .replace(
      /\b([A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD))=\S+/g,
      "$1=[redacted]",
    )
    .replace(
      /(["']?(?:access[_-]?token|api[_-]?key|authorization|credential|password|secret|service[_-]?role[_-]?key|token)["']?\s*(?::|=>|=)\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^,}\s;]+)/gi,
      "$1[redacted]",
    )
}

function canonicalLogValue(value) {
  if (Array.isArray(value)) return value.map(canonicalLogValue)
  if (value === null || typeof value !== "object") return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalLogValue(value[key])]),
  )
}

function parseEventLog(contents) {
  if (contents === null) return []
  return contents
    .toString("utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        const event = JSON.parse(line)
        if (!event || typeof event !== "object" || Array.isArray(event)) {
          throw new Error("event is not an object")
        }
        return event
      } catch (error) {
        const failure = new Error("Durable event log is malformed")
        failure.code = "EVENT_LOG_MALFORMED"
        failure.cause = error
        throw failure
      }
    })
}

function eventPayload(event) {
  const { at: _at, ...payload } = event
  return canonicalLogValue(payload)
}

export function redactForLog(value, seen = new WeakSet()) {
  if (typeof value === "string") return redactString(value)
  if (value === null || typeof value !== "object") return value
  if (seen.has(value)) return "[circular]"
  seen.add(value)

  if (Array.isArray(value)) return value.map((item) => redactForLog(item, seen))

  const redacted = {}
  for (const [key, item] of Object.entries(value)) {
    if (
      /token|password|secret|authorization|credential|api[_-]?key|private[_-]?key|service[_-]?role/i.test(
        key,
      )
    ) {
      redacted[key] = "[redacted]"
    } else {
      redacted[key] = redactForLog(item, seen)
    }
  }
  return redacted
}

export function initialState({ repository, issueNumber, issueUrl = null }) {
  return {
    schemaVersion: currentStateSchemaVersion,
    stateRevision: 0,
    task: {
      repository,
      issueNumber,
      originIssueNumber: issueNumber,
      originIssueUrl: issueUrl,
      lastObservedIssueUpdatedAt: null,
      originIssueClosed: false,
    },
    status: "ready",
    lastConsumedInstructionId: null,
    activeInstruction: null,
    threadId: null,
    workspacePath: null,
    branch: null,
    turnCount: 0,
    retryCount: 0,
    pendingOwnerRequest: null,
    retryInstructionIds: [],
    resultCorrectionInstructionIds: [],
    ownerApprovalDecisions: [],
    pendingApprovalRequests: [],
    ownerGateAcknowledgements: [],
    workspaceBranchReconciliations: [],
    gitReconciliationCheckpoints: [],
    checkpointActivationRecoveries: [],
    runs: [],
    updatedAt: new Date().toISOString(),
  }
}

export function migrateState(state, { repository, issueNumber }) {
  if (state.schemaVersion === 1) {
    state.schemaVersion = 2
    state.task ??= { repository, issueNumber }
    state.task.originIssueNumber ??= state.task.issueNumber ?? issueNumber
    state.task.originIssueUrl ??= state.task.issueUrl ?? null
    state.task.lastObservedIssueUpdatedAt ??= null
    state.task.originIssueClosed ??= false
    state.retryInstructionIds ??= []
    state.resultCorrectionInstructionIds ??= []
  }
  if (state.schemaVersion === 2) {
    state.schemaVersion = 3
    state.ownerApprovalDecisions ??= []
  }
  if (state.schemaVersion === 3) {
    state.schemaVersion = 4
    state.pendingApprovalRequests ??= []
  }
  if (state.schemaVersion === 4) {
    state.schemaVersion = 5
  }
  if (state.schemaVersion === 5) {
    state.schemaVersion = 6
    state.workspaceBranchReconciliations ??= []
  }
  if (state.schemaVersion === 6) {
    state.schemaVersion = 7
    state.gitReconciliationCheckpoints ??= []
  }
  if (state.schemaVersion === 7) {
    state.schemaVersion = 8
    state.ownerGateAcknowledgements ??= []
  }
  if (state.schemaVersion === 8) {
    state.schemaVersion = currentStateSchemaVersion
    state.stateRevision = 0
  }
  if (state.schemaVersion !== currentStateSchemaVersion) {
    throw new Error(`Unsupported state schema: ${state.schemaVersion}`)
  }
  if (
    state.task?.repository !== repository ||
    state.task?.issueNumber !== issueNumber ||
    state.task?.originIssueNumber !== issueNumber
  ) {
    throw new Error("Persisted task origin does not match the requested issue")
  }
  state.task.originIssueUrl ??= null
  state.task.lastObservedIssueUpdatedAt ??= null
  state.task.originIssueClosed ??= false
  state.retryInstructionIds ??= []
  state.resultCorrectionInstructionIds ??= []
  state.ownerApprovalDecisions ??= []
  state.pendingApprovalRequests ??= []
  state.ownerGateAcknowledgements ??= []
  state.workspaceBranchReconciliations ??= []
  state.gitReconciliationCheckpoints ??= []
  state.checkpointActivationRecoveries ??= []
  durableRevision(state.stateRevision)
  return normalizeTurnAccounting(state)
}

export function recordTaskOrigin(state, { issueNumber, issueUrl }) {
  if (state.task.originIssueNumber !== issueNumber) {
    throw new Error("Refusing to reroute persisted task state to another issue")
  }
  if (issueUrl) state.task.originIssueUrl = issueUrl
}

export function recordIssueObservation(
  state,
  { issueNumber, issueUrl, updatedAt, closed },
) {
  recordTaskOrigin(state, { issueNumber, issueUrl })
  if (updatedAt) state.task.lastObservedIssueUpdatedAt = updatedAt
  state.task.originIssueClosed = Boolean(closed)
}

export class StateStore {
  constructor({
    stateDirectory,
    repository,
    issueNumber,
    fileSystemHooks = null,
    isProcessAlive = defaultProcessIsAlive,
    getProcessIdentity = defaultProcessIdentity,
    lockfSpec = undefined,
  }) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
      throw new Error("Cannot create state for an unsafe repository name")
    }
    if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) {
      throw new Error("Cannot create state for an invalid issue number")
    }
    const taskName = `${repository.replaceAll("/", "-")}-issue-${issueNumber}`
    this.stateDirectory = path.resolve(stateDirectory)
    this.directory = path.join(this.stateDirectory, taskName)
    this.statePath = path.join(this.directory, "state.json")
    this.stateLockPath = path.join(this.directory, ".state-write.lock")
    this.eventPath = path.join(this.directory, "events.jsonl")
    this.stderrPath = path.join(this.directory, "app-server.stderr.log")
    this.repository = repository
    this.issueNumber = issueNumber
    this.fileSystemHooks = fileSystemHooks
    this.isProcessAlive = isProcessAlive
    this.getProcessIdentity = getProcessIdentity
    this.lockfSpec = lockfSpec
    this.stateRootGuard = null
    this.directoryGuard = null
  }

  async ensureDirectory() {
    this.stateRootGuard = await ensurePrivateDirectory(this.stateDirectory)
    this.directoryGuard = await ensurePrivateDirectory(this.directory, {
      parentGuard: this.stateRootGuard,
    })
  }

  async #acquireWriteLock() {
    for (let attempt = 0; attempt < stateLockAttempts; attempt += 1) {
      const decision = await acquireCrashSafeFileLease({
        directoryGuard: this.directoryGuard,
        lockLeaf: path.basename(this.stateLockPath),
        isProcessAlive: this.isProcessAlive,
        getProcessIdentity: this.getProcessIdentity,
        hooks: this.fileSystemHooks,
        ...(this.lockfSpec ? { lockfSpec: this.lockfSpec } : {}),
      })
      if (decision.acquired) return decision.lease
      if (decision.reason !== "lease_busy") {
        throw new FileLeaseMetadataError({
          code: decision.reason.toUpperCase(),
          leafName: path.basename(this.stateLockPath),
          recovery: decision.recovery,
        })
      }
      await delay(stateLockDelayMs)
    }
    throw new Error("Timed out acquiring the task state write lock")
  }

  async #releaseWriteLock(lock) {
    await releaseCrashSafeFileLease(lock)
  }

  async #readStateContents() {
    const lock = await this.#acquireWriteLock()
    try {
      await recoverDurableFileReplace(
        this.directoryGuard,
        path.basename(this.statePath),
        { hooks: this.fileSystemHooks, ...stateTransactionOptions },
      )
      await cleanupOrphanAtomicTemps(
        this.directoryGuard,
        path.basename(this.statePath),
      )
      return readFileNoFollow(
        this.directoryGuard,
        path.basename(this.statePath),
        { allowMissing: true },
      )
    } finally {
      await this.#releaseWriteLock(lock)
    }
  }

  async load() {
    await this.ensureDirectory()
    try {
      const contents = await this.#readStateContents()
      if (contents === null) {
        const state = initialState({
          repository: this.repository,
          issueNumber: this.issueNumber,
        })
        try {
          await this.save(state)
          return state
        } catch (saveError) {
          if (saveError.code !== "STATE_REVISION_CONFLICT") throw saveError
          return this.load()
        }
      }
      const parsed = JSON.parse(contents.toString("utf8"))
      const priorSchemaVersion = parsed.schemaVersion
      const state = migrateState(parsed, {
        repository: this.repository,
        issueNumber: this.issueNumber,
      })
      if (priorSchemaVersion < 4 && state.pendingApprovalRequests.length === 0) {
        try {
          const eventContents = await readFileNoFollow(
            this.directoryGuard,
            path.basename(this.eventPath),
            { allowMissing: true },
          )
          const events = (eventContents?.toString("utf8") ?? "")
            .split("\n")
            .filter(Boolean)
            .flatMap((line) => {
              try {
                return [JSON.parse(line)]
              } catch {
                return []
              }
            })
          state.pendingApprovalRequests =
            recoverPendingApprovalRequestsFromEvents(events)
        } catch (error) {
          throw error
        }
      }
      if (priorSchemaVersion !== currentStateSchemaVersion) {
        try {
          await this.save(state)
        } catch (error) {
          if (error.code !== "STATE_REVISION_CONFLICT") throw error
          return this.load()
        }
      }
      return state
    } catch (error) {
      throw error
    }
  }

  async save(state) {
    await this.ensureDirectory()
    if (
      state?.schemaVersion !== currentStateSchemaVersion ||
      state.task?.repository !== this.repository ||
      state.task?.issueNumber !== this.issueNumber ||
      state.task?.originIssueNumber !== this.issueNumber
    ) {
      throw new Error("Refusing to save state outside its canonical task origin")
    }
    const expectedRevision = durableRevision(state.stateRevision)
    const newRevision = nextDurableRevision(expectedRevision)
    const lock = await this.#acquireWriteLock()
    const priorUpdatedAt = state.updatedAt
    try {
      await recoverDurableFileReplace(
        this.directoryGuard,
        path.basename(this.statePath),
        { hooks: this.fileSystemHooks, ...stateTransactionOptions },
      )
      const persisted = await readFileNoFollow(
        this.directoryGuard,
        path.basename(this.statePath),
        { allowMissing: true },
      )
      const actualRevision = persistedRevision(persisted)
      if (actualRevision !== expectedRevision) {
        throw new StateRevisionConflictError({
          expectedRevision,
          actualRevision,
        })
      }
      state.stateRevision = newRevision
      state.updatedAt = new Date().toISOString()
      await durableAtomicWriteFile(
        this.directoryGuard,
        path.basename(this.statePath),
        `${JSON.stringify(state, null, 2)}\n`,
        { hooks: this.fileSystemHooks, ...stateTransactionOptions },
      )
      return state.stateRevision
    } catch (error) {
      state.stateRevision = expectedRevision
      state.updatedAt = priorUpdatedAt
      throw error
    } finally {
      await this.#releaseWriteLock(lock)
    }
  }

  async appendEvent(event) {
    await this.ensureDirectory()
    const record = {
      at: new Date().toISOString(),
      ...redactForLog(event),
    }
    await appendFileNoFollow(
      this.directoryGuard,
      path.basename(this.eventPath),
      `${JSON.stringify(record)}\n`,
      { hooks: this.fileSystemHooks },
    )
  }

  async appendEventOnce(eventId, event) {
    if (
      typeof eventId !== "string" ||
      !/^[A-Za-z0-9._:/-]{1,512}$/.test(eventId)
    ) {
      throw new Error("Cannot persist an event with an unsafe identity")
    }
    await this.ensureDirectory()
    const record = {
      at: new Date().toISOString(),
      ...redactForLog(event),
      eventId,
    }
    const lock = await this.#acquireWriteLock()
    try {
      const contents = await readFileNoFollow(
        this.directoryGuard,
        path.basename(this.eventPath),
        { allowMissing: true },
      )
      const matches = parseEventLog(contents).filter(
        (candidate) => candidate.eventId === eventId,
      )
      if (matches.length > 1) {
        const error = new Error("Durable event identity is ambiguous")
        error.code = "EVENT_ID_AMBIGUOUS"
        throw error
      }
      if (matches.length === 1) {
        if (
          JSON.stringify(eventPayload(matches[0])) !==
          JSON.stringify(eventPayload(record))
        ) {
          const error = new Error("Durable event identity conflicts")
          error.code = "EVENT_ID_CONFLICT"
          throw error
        }
        return { created: false, event: matches[0] }
      }
      await appendFileNoFollow(
        this.directoryGuard,
        path.basename(this.eventPath),
        `${JSON.stringify(record)}\n`,
        { hooks: this.fileSystemHooks },
      )
      return { created: true, event: record }
    } finally {
      await this.#releaseWriteLock(lock)
    }
  }

  async findEvent(eventId) {
    if (
      typeof eventId !== "string" ||
      !/^[A-Za-z0-9._:/-]{1,512}$/.test(eventId)
    ) {
      throw new Error("Cannot read an event with an unsafe identity")
    }
    await this.ensureDirectory()
    const lock = await this.#acquireWriteLock()
    try {
      const contents = await readFileNoFollow(
        this.directoryGuard,
        path.basename(this.eventPath),
        { allowMissing: true },
      )
      const matches = parseEventLog(contents).filter(
        (candidate) => candidate.eventId === eventId,
      )
      if (matches.length > 1) {
        const error = new Error("Durable event identity is ambiguous")
        error.code = "EVENT_ID_AMBIGUOUS"
        throw error
      }
      return matches[0] ?? null
    } finally {
      await this.#releaseWriteLock(lock)
    }
  }

  async appendStderr(text) {
    await this.ensureDirectory()
    await appendFileNoFollow(
      this.directoryGuard,
      path.basename(this.stderrPath),
      redactString(text),
      { hooks: this.fileSystemHooks },
    )
  }
}
