import { appendFile, chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

function redactString(value) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{12,})\b/g,
      "[redacted]",
    )
    .replace(
      /([?&](?:sig|token|key|secret|password)=)[^&\s]+/gi,
      "$1[redacted]",
    )
    .replace(
      /\b([A-Z0-9_]*(?:TOKEN|KEY|SECRET|PASSWORD))=\S+/g,
      "$1=[redacted]",
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
    if (/token|password|secret|authorization|credential/i.test(key)) {
      redacted[key] = "[redacted]"
    } else {
      redacted[key] = redactForLog(item, seen)
    }
  }
  return redacted
}

export function initialState({ repository, issueNumber }) {
  return {
    schemaVersion: 1,
    task: { repository, issueNumber },
    status: "ready",
    lastConsumedInstructionId: null,
    activeInstruction: null,
    threadId: null,
    workspacePath: null,
    branch: null,
    turnCount: 0,
    retryCount: 0,
    pendingOwnerRequest: null,
    runs: [],
    updatedAt: new Date().toISOString(),
  }
}

export class StateStore {
  constructor({ stateDirectory, repository, issueNumber }) {
    const taskName = `${repository.replaceAll("/", "-")}-issue-${issueNumber}`
    this.directory = path.join(stateDirectory, taskName)
    this.statePath = path.join(this.directory, "state.json")
    this.eventPath = path.join(this.directory, "events.jsonl")
    this.stderrPath = path.join(this.directory, "app-server.stderr.log")
    this.repository = repository
    this.issueNumber = issueNumber
  }

  async ensureDirectory() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    await chmod(this.directory, 0o700)
  }

  async load() {
    await this.ensureDirectory()
    try {
      const parsed = JSON.parse(await readFile(this.statePath, "utf8"))
      if (parsed.schemaVersion !== 1) {
        throw new Error(`Unsupported state schema: ${parsed.schemaVersion}`)
      }
      return parsed
    } catch (error) {
      if (error.code !== "ENOENT") throw error
      const state = initialState({
        repository: this.repository,
        issueNumber: this.issueNumber,
      })
      await this.save(state)
      return state
    }
  }

  async save(state) {
    await this.ensureDirectory()
    state.updatedAt = new Date().toISOString()
    const temporary = `${this.statePath}.${process.pid}.tmp`
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
      mode: 0o600,
    })
    await rename(temporary, this.statePath)
    await chmod(this.statePath, 0o600)
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
