import path from "node:path"
import {
  acquireCrashSafeFileLease,
  defaultProcessIdentity,
  defaultProcessIsAlive,
  DurableCommitPendingError,
  durableAtomicWriteFile,
  ensurePrivateDirectory,
  fileLeaseIsActive,
  readJsonNoFollow,
  recoverDurableFileReplace,
  releaseCrashSafeFileLease,
} from "./durable-filesystem.mjs"

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

function completedResult(result) {
  return !new Set(["queue_changed", "claim_deferred"]).has(result?.status)
}

export class QueueClaimStore {
  constructor({
    stateDirectory,
    isProcessAlive = defaultProcessIsAlive,
    getProcessIdentity = defaultProcessIdentity,
    pid = process.pid,
    now = () => new Date(),
    retryBaseMs = 1_000,
    fileSystemHooks = null,
    lockfSpec = undefined,
  }) {
    this.stateDirectory = path.resolve(stateDirectory)
    this.directory = path.join(this.stateDirectory, "repository-queue")
    this.issueLockDirectory = path.join(this.directory, "issue-locks")
    this.instructionLockDirectory = path.join(
      this.directory,
      "instruction-locks",
    )
    this.recordDirectory = path.join(this.directory, "instructions")
    this.isProcessAlive = isProcessAlive
    this.getProcessIdentity = getProcessIdentity
    this.pid = pid
    this.now = now
    this.retryBaseMs = retryBaseMs
    this.fileSystemHooks = fileSystemHooks
    this.lockfSpec = lockfSpec
    this.directoryGuards = null
  }

  async #ensureDirectories() {
    const root = await ensurePrivateDirectory(this.stateDirectory)
    const queue = await ensurePrivateDirectory(this.directory, {
      parentGuard: root,
    })
    const issueLocks = await ensurePrivateDirectory(this.issueLockDirectory, {
      parentGuard: queue,
    })
    const instructionLocks = await ensurePrivateDirectory(
      this.instructionLockDirectory,
      { parentGuard: queue },
    )
    const records = await ensurePrivateDirectory(this.recordDirectory, {
      parentGuard: queue,
    })
    this.directoryGuards = {
      [this.issueLockDirectory]: issueLocks,
      [this.instructionLockDirectory]: instructionLocks,
      [this.recordDirectory]: records,
    }
  }

  #guardFor(filePath) {
    const guard = this.directoryGuards?.[path.dirname(filePath)]
    if (!guard) throw new Error("Queue file is outside its private directory")
    return guard
  }

  async #acquire(lockPath) {
    await this.#ensureDirectories()
    return acquireCrashSafeFileLease({
      directoryGuard: this.#guardFor(lockPath),
      lockLeaf: path.basename(lockPath),
      isProcessAlive: this.isProcessAlive,
      getProcessIdentity: this.getProcessIdentity,
      pid: this.pid,
      now: this.now,
      hooks: this.fileSystemHooks,
      ...(this.lockfSpec ? { lockfSpec: this.lockfSpec } : {}),
    })
  }

  async #readRecord(recordPath) {
    await this.#ensureDirectories()
    const guard = this.#guardFor(recordPath)
    const leafName = path.basename(recordPath)
    await recoverDurableFileReplace(guard, leafName, {
      hooks: this.fileSystemHooks,
    })
    return readJsonNoFollow(guard, leafName, { allowMissing: true })
  }

  async #writeRecord(recordPath, value) {
    await this.#ensureDirectories()
    await durableAtomicWriteFile(
      this.#guardFor(recordPath),
      path.basename(recordPath),
      `${JSON.stringify(value, null, 2)}\n`,
      { hooks: this.fileSystemHooks },
    )
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
    if (!(await fileLeaseIsActive(issueClaim.lease))) {
      throw new Error("Instruction claim issue lease is no longer active")
    }

    let instructionLock = null
    try {
      const instructionDecision = await this.#acquire(
        path.join(this.instructionLockDirectory, `${safeId}.lock`),
      )
      if (!instructionDecision.acquired) {
        return {
          claimed: false,
          reason:
            instructionDecision.reason === "lease_busy"
              ? "instruction_busy"
              : `instruction_${instructionDecision.reason}`,
          ...(instructionDecision.recovery
            ? { recovery: instructionDecision.recovery }
            : {}),
        }
      }
      instructionLock = instructionDecision.lease

      const recordPath = path.join(this.recordDirectory, `${safeId}.json`)
      const existing = await this.#readRecord(recordPath)
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
      await this.#writeRecord(recordPath, active)

      try {
        const value = await callback()
        if (
          existing?.status === "completed" &&
          safeRetryId &&
          !completedResult(value)
        ) {
          await this.#writeRecord(recordPath, existing)
        } else {
          await this.#writeRecord(recordPath, {
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
        if (error instanceof DurableCommitPendingError) throw error
        const failureCount = (existing?.failureCount ?? 0) + 1
        const backoffMs = Math.min(
          this.retryBaseMs * 2 ** (failureCount - 1),
          60_000,
        )
        await this.#writeRecord(recordPath, {
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
      await releaseCrashSafeFileLease(instructionLock)
    }
  }

  async withIssueClaim({ originIssueNumber }, callback) {
    if (!Number.isSafeInteger(originIssueNumber) || originIssueNumber < 1) {
      throw new Error("Cannot claim an invalid origin issue number")
    }
    const issueDecision = await this.#acquire(
      path.join(this.issueLockDirectory, `${originIssueNumber}.lock`),
    )
    if (!issueDecision.acquired) {
      return {
        claimed: false,
        reason:
          issueDecision.reason === "lease_busy"
            ? "issue_busy"
            : `issue_${issueDecision.reason}`,
        ...(issueDecision.recovery ? { recovery: issueDecision.recovery } : {}),
      }
    }
    const issueLock = issueDecision.lease
    const claim = {
      [issueClaimBrand]: this,
      originIssueNumber,
      token: issueLock.token,
      lease: issueLock,
    }
    try {
      return { claimed: true, value: await callback(claim) }
    } finally {
      await releaseCrashSafeFileLease(issueLock)
    }
  }
}
