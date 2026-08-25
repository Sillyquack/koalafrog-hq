import { randomUUID } from "node:crypto"
import {
  chmod,
  link,
  mkdir,
  open,
  readFile,
  rename,
  unlink,
} from "node:fs/promises"
import path from "node:path"

const issueClaimBrand = Symbol("koalafrog-issue-claim")

function safeInstructionId(instructionId) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(instructionId)) {
    throw new Error("Cannot claim an unsafe instruction_id")
  }
  return instructionId
}

function safeRetryAuthorizationId(retryAuthorizationId) {
  if (retryAuthorizationId == null) return null
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(retryAuthorizationId)
  ) {
    throw new Error("Cannot claim an unsafe retry authorization")
  }
  return retryAuthorizationId
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
  let handle = null
  try {
    handle = await open(temporary, "wx", 0o600)
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`)
    await handle.sync()
    await handle.close()
    handle = null
    await rename(temporary, filePath)
    await chmod(filePath, 0o600)
  } finally {
    await handle?.close().catch(() => {})
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error
    })
  }
}

async function tryCreateFileLock(lockPath, record) {
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

async function releaseFileLockPath(lockPath, token) {
  const existing = await readJson(lockPath).catch(() => null)
  if (existing?.token !== token) return
  await unlink(lockPath).catch((error) => {
    if (error.code !== "ENOENT") throw error
  })
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
  const reaperPath = `${lockPath}.reaper`
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await readJson(reaperPath)) return null
    const token = randomUUID()
    if (
      await tryCreateFileLock(lockPath, {
        token,
        pid,
        acquiredAt: now().toISOString(),
      })
    ) {
      return { token, pid, lockPath }
    }

    const existing = await readJson(lockPath).catch(() => null)
    if (!existing || isProcessAlive(existing.pid)) return null

    const reaperToken = randomUUID()
    if (
      !(await tryCreateFileLock(reaperPath, {
        token: reaperToken,
        pid,
        acquiredAt: now().toISOString(),
      }))
    ) {
      return null
    }
    try {
      const current = await readJson(lockPath).catch(() => null)
      if (current && !isProcessAlive(current.pid)) {
        const stalePath = `${lockPath}.${randomUUID()}.stale`
        try {
          await rename(lockPath, stalePath)
          await unlink(stalePath)
        } catch (renameError) {
          if (renameError.code !== "ENOENT") throw renameError
        }
      }
    } finally {
      await releaseFileLockPath(reaperPath, reaperToken)
    }
  }
  return null
}

async function releaseFileLock(lock) {
  if (!lock) return
  await releaseFileLockPath(lock.lockPath, lock.token)
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
      retryAuthorizationId = null,
    },
    callback,
    { issueClaim = null } = {},
  ) {
    const safeId = safeInstructionId(instructionId)
    const safeRetryId = safeRetryAuthorizationId(retryAuthorizationId)
    if (!Number.isSafeInteger(originIssueNumber) || originIssueNumber < 1) {
      throw new Error("Cannot claim an invalid origin issue number")
    }
    if (!issueClaim) {
      const result = await this.withIssueClaim(
        { originIssueNumber },
        (claimedIssue) =>
          this.withClaim(
            {
              instructionId: safeId,
              originIssueNumber,
              originIssueUrl,
              retryAuthorizationId: safeRetryId,
            },
            callback,
            { issueClaim: claimedIssue },
          ),
      )
      return result.claimed
        ? result.value
        : { claimed: false, reason: result.reason }
    }
    if (
      issueClaim[issueClaimBrand] !== this ||
      issueClaim.originIssueNumber !== originIssueNumber
    ) {
      throw new Error("Instruction claim is not bound to the active issue claim")
    }
    const durableIssueClaim = await readJson(
      path.join(this.issueLockDirectory, `${originIssueNumber}.lock`),
    )
    if (durableIssueClaim?.token !== issueClaim.token) {
      throw new Error("Instruction claim issue lease is no longer active")
    }

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
      if (existing?.status === "completed") {
        if (!safeRetryId || existing.retryAuthorizationId === safeRetryId) {
          return { claimed: false, reason: "already_consumed" }
        }
        if (existing.retryAuthorizationId) {
          return { claimed: false, reason: "retry_authorization_conflict" }
        }
      }
      if (
        existing?.retryAuthorizationId &&
        existing.retryAuthorizationId !== safeRetryId
      ) {
        return { claimed: false, reason: "retry_authorization_conflict" }
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
        retryAuthorizationId: safeRetryId,
        claimedAt: this.now().toISOString(),
        updatedAt: this.now().toISOString(),
      }
      await writeJsonAtomic(recordPath, active)

      try {
        const value = await callback()
        if (
          existing?.status === "completed" &&
          safeRetryId &&
          !completedResult(value)
        ) {
          await writeJsonAtomic(recordPath, existing)
        } else {
          await writeJsonAtomic(recordPath, {
            ...active,
            status: completedResult(value) ? "completed" : "released",
            resultStatus: value?.status ?? null,
            completedAt: completedResult(value)
              ? this.now().toISOString()
              : null,
            updatedAt: this.now().toISOString(),
          })
        }
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
    }
  }

  async withIssueClaim({ originIssueNumber }, callback) {
    if (!Number.isSafeInteger(originIssueNumber) || originIssueNumber < 1) {
      throw new Error("Cannot claim an invalid origin issue number")
    }
    const issueLock = await this.#acquire(
      path.join(this.issueLockDirectory, `${originIssueNumber}.lock`),
    )
    if (!issueLock) return { claimed: false, reason: "issue_busy" }
    const claim = {
      [issueClaimBrand]: this,
      originIssueNumber,
      token: issueLock.token,
    }
    try {
      return { claimed: true, value: await callback(claim) }
    } finally {
      await releaseFileLock(issueLock)
    }
  }
}
