import { randomUUID } from "node:crypto"
import { chmod, mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises"
import path from "node:path"

function safeInstructionId(instructionId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(instructionId)) {
    throw new Error("Cannot claim an unsafe instruction_id")
  }
  return instructionId
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

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"))
  } catch (error) {
    if (error.code === "ENOENT") return null
    throw error
  }
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 })
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  })
  await rename(temporary, filePath)
  await chmod(filePath, 0o600)
}

async function acquireFileLock(
  lockPath,
  {
    isProcessAlive = processIsAlive,
    pid = process.pid,
    now = () => new Date(),
  } = {},
) {
  await mkdir(path.dirname(lockPath), { recursive: true, mode: 0o700 })
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = randomUUID()
    let handle = null
    try {
      handle = await open(lockPath, "wx", 0o600)
      await handle.writeFile(
        `${JSON.stringify({ token, pid, acquiredAt: now().toISOString() })}\n`,
      )
      await handle.close()
      handle = null
      return { token, pid, lockPath }
    } catch (error) {
      await handle?.close().catch(() => {})
      if (error.code !== "EEXIST") throw error
      const existing = await readJson(lockPath).catch(() => null)
      if (existing && isProcessAlive(existing.pid)) return null

      const stalePath = `${lockPath}.${randomUUID()}.stale`
      try {
        await rename(lockPath, stalePath)
        await unlink(stalePath)
      } catch (renameError) {
        if (!new Set(["ENOENT", "EEXIST"]).has(renameError.code)) {
          throw renameError
        }
      }
    }
  }
  return null
}

async function releaseFileLock(lock) {
  if (!lock) return
  const existing = await readJson(lock.lockPath).catch(() => null)
  if (existing?.token !== lock.token) return
  await unlink(lock.lockPath).catch((error) => {
    if (error.code !== "ENOENT") throw error
  })
}

function completedResult(result) {
  return !new Set(["queue_changed", "claim_deferred"]).has(result?.status)
}

export class QueueClaimStore {
  constructor({
    stateDirectory,
    isProcessAlive = processIsAlive,
    pid = process.pid,
    now = () => new Date(),
    retryBaseMs = 1_000,
  }) {
    this.directory = path.join(stateDirectory, "repository-queue")
    this.issueLockDirectory = path.join(this.directory, "issue-locks")
    this.instructionLockDirectory = path.join(
      this.directory,
      "instruction-locks",
    )
    this.recordDirectory = path.join(this.directory, "instructions")
    this.isProcessAlive = isProcessAlive
    this.pid = pid
    this.now = now
    this.retryBaseMs = retryBaseMs
  }

  async #acquire(lockPath) {
    return acquireFileLock(lockPath, {
      isProcessAlive: this.isProcessAlive,
      pid: this.pid,
      now: this.now,
    })
  }

  async withClaim(
    {
      instructionId,
      originIssueNumber,
      originIssueUrl = null,
      retryAllowed = false,
    },
    callback,
  ) {
    const safeId = safeInstructionId(instructionId)
    if (!Number.isSafeInteger(originIssueNumber) || originIssueNumber < 1) {
      throw new Error("Cannot claim an invalid origin issue number")
    }
    const issueLock = await this.#acquire(
      path.join(this.issueLockDirectory, `${originIssueNumber}.lock`),
    )
    if (!issueLock) return { claimed: false, reason: "issue_busy" }

    let instructionLock = null
    try {
      instructionLock = await this.#acquire(
        path.join(this.instructionLockDirectory, `${safeId}.lock`),
      )
      if (!instructionLock) {
        return { claimed: false, reason: "instruction_busy" }
      }

      const recordPath = path.join(this.recordDirectory, `${safeId}.json`)
      const existing = await readJson(recordPath)
      if (
        existing?.originIssueNumber &&
        existing.originIssueNumber !== originIssueNumber
      ) {
        return { claimed: false, reason: "duplicate_instruction_origin" }
      }
      if (existing?.status === "completed" && !retryAllowed) {
        return { claimed: false, reason: "already_consumed" }
      }
      if (
        existing?.status === "retryable_error" &&
        existing.nextEligibleAt &&
        Date.parse(existing.nextEligibleAt) > this.now().getTime()
      ) {
        return {
          claimed: false,
          reason: "retry_backoff",
          nextEligibleAt: existing.nextEligibleAt,
        }
      }

      const attempt = (existing?.attempt ?? 0) + 1
      const active = {
        schemaVersion: 1,
        instructionId: safeId,
        originIssueNumber,
        originIssueUrl,
        status: "active",
        attempt,
        pid: this.pid,
        token: instructionLock.token,
        claimedAt: this.now().toISOString(),
        updatedAt: this.now().toISOString(),
      }
      await writeJsonAtomic(recordPath, active)

      try {
        const value = await callback()
        await writeJsonAtomic(recordPath, {
          ...active,
          status: completedResult(value) ? "completed" : "released",
          resultStatus: value?.status ?? null,
          completedAt: completedResult(value)
            ? this.now().toISOString()
            : null,
          updatedAt: this.now().toISOString(),
        })
        return { claimed: true, value }
      } catch (error) {
        const failureCount = (existing?.failureCount ?? 0) + 1
        const backoffMs = Math.min(
          this.retryBaseMs * 2 ** (failureCount - 1),
          60_000,
        )
        await writeJsonAtomic(recordPath, {
          ...active,
          status: "retryable_error",
          failureCount,
          error: String(error.message).slice(0, 1_000),
          nextEligibleAt: new Date(this.now().getTime() + backoffMs).toISOString(),
          updatedAt: this.now().toISOString(),
        })
        throw error
      }
    } finally {
      await releaseFileLock(instructionLock)
      await releaseFileLock(issueLock)
    }
  }
}
