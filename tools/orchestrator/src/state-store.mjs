import { randomUUID } from "node:crypto"
import {
  appendFile,
  chmod,
  link,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
} from "node:fs/promises"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { recoverPendingApprovalRequestsFromEvents } from "./approval-decisions.mjs"
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

function processIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === "EPERM"
  }
}

function durableRevision(value, { legacy = false } = {}) {
  if (legacy && value == null) return 0
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Persisted state revision is invalid")
  }
  return value
}

async function readPersistedRevision(statePath) {
  try {
    const parsed = JSON.parse(await readFile(statePath, "utf8"))
    return durableRevision(parsed.stateRevision, {
      legacy: Number.isSafeInteger(parsed.schemaVersion) && parsed.schemaVersion < 9,
    })
  } catch (error) {
    if (error.code === "ENOENT") return 0
    throw error
  }
}

async function readLock(lockPath) {
  try {
    return JSON.parse(await readFile(lockPath, "utf8"))
  } catch (error) {
    if (error.code === "ENOENT") return null
    return null
  }
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
  constructor({ stateDirectory, repository, issueNumber }) {
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
  }

  async ensureDirectory() {
    await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 })
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const root = await realpath(this.stateDirectory)
    const directory = await realpath(this.directory)
    if (
      directory !== path.join(root, path.basename(this.directory)) ||
      !directory.startsWith(`${root}${path.sep}`)
    ) {
      throw new Error("Task state directory escapes the configured state root")
    }
    await chmod(this.directory, 0o700)
  }

  async #tryCreateLock(lockPath, record) {
    const candidatePath = `${lockPath}.${record.token}.candidate`
    let handle = null
    try {
      handle = await open(candidatePath, "wx", 0o600)
      await handle.writeFile(`${JSON.stringify(record)}\n`)
      await handle.sync()
      await handle.close()
      handle = null
      await link(candidatePath, lockPath)
      return true
    } catch (error) {
      if (error.code === "EEXIST") return false
      throw error
    } finally {
      await handle?.close().catch(() => {})
      await unlink(candidatePath).catch((error) => {
        if (error.code !== "ENOENT") throw error
      })
    }
  }

  async #releaseLockPath(lockPath, token) {
    const existing = await readLock(lockPath)
    if (existing?.token !== token) return
    await unlink(lockPath).catch((error) => {
      if (error.code !== "ENOENT") throw error
    })
  }

  async #acquireWriteLock() {
    const reaperPath = `${this.stateLockPath}.reaper`
    for (let attempt = 0; attempt < stateLockAttempts; attempt += 1) {
      const token = randomUUID()
      if (await readLock(reaperPath)) {
        await delay(stateLockDelayMs)
        continue
      }
      if (
        await this.#tryCreateLock(this.stateLockPath, {
          token,
          pid: process.pid,
        })
      ) {
        return { token }
      }

      const reaperToken = randomUUID()
      if (
        !(await this.#tryCreateLock(reaperPath, {
          token: reaperToken,
          pid: process.pid,
        }))
      ) {
        await delay(stateLockDelayMs)
        continue
      }
      try {
        const existing = await readLock(this.stateLockPath)
        if (existing && !processIsAlive(existing.pid)) {
          const stalePath = `${this.stateLockPath}.${randomUUID()}.stale`
          try {
            await rename(this.stateLockPath, stalePath)
            await unlink(stalePath)
          } catch (renameError) {
            if (renameError.code !== "ENOENT") throw renameError
          }
        }
      } finally {
        await this.#releaseLockPath(reaperPath, reaperToken)
      }
      await delay(stateLockDelayMs)
    }
    throw new Error("Timed out acquiring the task state write lock")
  }

  async #releaseWriteLock(lock) {
    await this.#releaseLockPath(this.stateLockPath, lock.token)
  }

  async load() {
    await this.ensureDirectory()
    try {
      const parsed = JSON.parse(await readFile(this.statePath, "utf8"))
      const priorSchemaVersion = parsed.schemaVersion
      const state = migrateState(parsed, {
        repository: this.repository,
        issueNumber: this.issueNumber,
      })
      if (priorSchemaVersion < 4 && state.pendingApprovalRequests.length === 0) {
        try {
          const events = (await readFile(this.eventPath, "utf8"))
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
          if (error.code !== "ENOENT") throw error
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
      if (error.code !== "ENOENT") throw error
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
    const lock = await this.#acquireWriteLock()
    const temporary = `${this.statePath}.${process.pid}.${randomUUID()}.tmp`
    const priorUpdatedAt = state.updatedAt
    let handle = null
    try {
      const actualRevision = await readPersistedRevision(this.statePath)
      if (actualRevision !== expectedRevision) {
        throw new StateRevisionConflictError({
          expectedRevision,
          actualRevision,
        })
      }
      state.stateRevision = expectedRevision + 1
      state.updatedAt = new Date().toISOString()
      handle = await open(temporary, "wx", 0o600)
      await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`)
      await handle.sync()
      await handle.close()
      handle = null
      await rename(temporary, this.statePath)
      await chmod(this.statePath, 0o600)
      return state.stateRevision
    } catch (error) {
      state.stateRevision = expectedRevision
      state.updatedAt = priorUpdatedAt
      throw error
    } finally {
      await handle?.close().catch(() => {})
      await unlink(temporary).catch((error) => {
        if (error.code !== "ENOENT") throw error
      })
      await this.#releaseWriteLock(lock)
    }
  }

  async appendEvent(event) {
    await this.ensureDirectory()
    const record = {
      at: new Date().toISOString(),
      ...redactForLog(event),
    }
    await appendFile(this.eventPath, `${JSON.stringify(record)}\n`, { mode: 0o600 })
  }

  async appendStderr(text) {
    await this.ensureDirectory()
    await appendFile(this.stderrPath, redactString(text), { mode: 0o600 })
  }
}
