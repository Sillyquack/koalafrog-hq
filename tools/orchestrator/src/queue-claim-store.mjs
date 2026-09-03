import path from "node:path"
import {
  acquireCrashSafeFileLease,
  defaultProcessIdentity,
  defaultProcessIsAlive,
  DurableCommitPendingError,
  durableAtomicWriteFile,
  ensurePrivateDirectory,
  fileLeaseIsActive,
  preflightDurableFilesystemCapabilities,
  readJsonNoFollow,
  recoverDurableFileReplace,
  releaseCrashSafeFileLease,
} from "./durable-filesystem.mjs"
import {
  normalizeWatcherFailure,
  watcherV2MaximumClaimFailures,
  watcherV2QueueFailureDecision,
} from "./watcher-v2.mjs"

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

function historicalFailureFields(record) {
  if (!record) return {}
  const hasFailureCount = Object.hasOwn(record, "failureCount")
  const hasFailureHistory = Object.hasOwn(record, "failureHistory")
  const failureCount = hasFailureCount ? record.failureCount : 0
  const failureHistory = hasFailureHistory ? record.failureHistory : []
  if (
    (hasFailureCount &&
      (!Number.isSafeInteger(failureCount) || failureCount < 0)) ||
    (hasFailureHistory &&
      (!Array.isArray(failureHistory) ||
        failureHistory.some(
          (entry) =>
            !entry ||
            typeof entry !== "object" ||
            !Number.isFinite(Date.parse(entry.at ?? "")) ||
            !/^[a-f0-9]{64}$/.test(entry.errorDigest ?? ""),
        ))) ||
    (hasFailureHistory && !hasFailureCount) ||
    failureCount < failureHistory.length
  ) {
    throw new Error("Durable queue failure history is malformed")
  }
  return {
    ...(hasFailureCount ? { failureCount } : {}),
    ...(hasFailureHistory
      ? { failureHistory: failureHistory.map((entry) => ({ ...entry })) }
      : {}),
  }
}

function failureHistoryIsPrefix(predecessor, successor) {
  const prior = predecessor.failureHistory ?? []
  const next = successor.failureHistory ?? []
  return Boolean(
    successor.failureCount >= predecessor.failureCount &&
      prior.length <= next.length &&
      prior.every(
        (entry, index) => JSON.stringify(entry) === JSON.stringify(next[index]),
      ),
  )
}

function queueTransactionIdentity(contents) {
  if (contents === null) return { kind: "missing", attempt: 0 }
  const parsed = JSON.parse(contents.toString("utf8"))
  if (
    (parsed?.schemaVersion != null && parsed.schemaVersion !== 1) ||
    typeof parsed.instructionId !== "string" ||
    !Number.isSafeInteger(parsed.originIssueNumber) ||
    !Number.isSafeInteger(parsed.attempt) ||
    parsed.attempt < 1 ||
    typeof parsed.status !== "string" ||
    !new Set([
      "active",
      "released",
      "retryable_error",
      "quarantined",
      "completed",
    ]).has(parsed.status)
  ) {
    throw new Error("Durable queue transaction identity is malformed")
  }
  const historicalFailure = historicalFailureFields(parsed)
  return {
    kind: "queue_claim",
    schemaVersion: parsed.schemaVersion ?? 0,
    instructionId: parsed.instructionId,
    originIssueNumber: parsed.originIssueNumber,
    status: parsed.status,
    attempt: parsed.attempt,
    token: parsed.token ?? null,
    retryAuthorizationId: parsed.retryAuthorizationId ?? null,
    failureCount: historicalFailure.failureCount ?? 0,
    failureHistory: historicalFailure.failureHistory ?? [],
  }
}

function sameQueueBinding(left, right) {
  return Boolean(
    left?.kind === "queue_claim" &&
      right?.kind === "queue_claim" &&
      left.instructionId === right.instructionId &&
      left.originIssueNumber === right.originIssueNumber,
  )
}

function validQueueTransaction(predecessor, successor) {
  if (successor?.kind !== "queue_claim") return false
  if (predecessor?.kind === "missing") {
    return Boolean(
      successor.status === "active" &&
        successor.attempt === 1 &&
        successor.failureCount === 0 &&
        successor.failureHistory.length === 0,
    )
  }
  if (!sameQueueBinding(predecessor, successor)) return false
  if (!failureHistoryIsPrefix(predecessor, successor)) return false
  if (
    successor.status === "quarantined" &&
    new Set(["active", "retryable_error", "released"]).has(
      predecessor.status,
    )
  ) {
    return successor.attempt === predecessor.attempt
  }
  if (successor.status === "active") {
    if (successor.attempt !== predecessor.attempt + 1) return false
    if (predecessor.status === "completed") {
      return Boolean(
        predecessor.retryAuthorizationId === null &&
          typeof successor.retryAuthorizationId === "string" &&
          successor.retryAuthorizationId.length > 0,
      )
    }
    return successor.retryAuthorizationId === predecessor.retryAuthorizationId
  }
  if (predecessor.status !== "active") return false
  if (
    successor.status === "completed" &&
    predecessor.retryAuthorizationId !== null &&
    successor.retryAuthorizationId === null &&
    successor.attempt === predecessor.attempt - 1
  ) {
    return true
  }
  return Boolean(
    new Set(["released", "retryable_error", "completed"]).has(
      successor.status,
    ) &&
      successor.attempt === predecessor.attempt &&
      successor.token === predecessor.token &&
      successor.retryAuthorizationId === predecessor.retryAuthorizationId,
  )
}

const queueTransactionOptions = {
  transactionKind: "queue_claim_replace",
  deriveSemanticIdentity: queueTransactionIdentity,
  validateTransition: validQueueTransaction,
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
    watcherV2 = false,
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
    this.watcherV2 = watcherV2
    this.directoryGuards = null
  }

  async #ensureDirectories() {
    await preflightDurableFilesystemCapabilities({
      ...(this.lockfSpec ? { lockfSpec: this.lockfSpec } : {}),
    })
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
    await preflightDurableFilesystemCapabilities({
      ...(this.lockfSpec ? { lockfSpec: this.lockfSpec } : {}),
      guardPaths: [`${lockPath}.takeover`],
    })
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
      ...queueTransactionOptions,
    })
    return readJsonNoFollow(guard, leafName, { allowMissing: true })
  }

  async #writeRecord(recordPath, value) {
    await this.#ensureDirectories()
    await durableAtomicWriteFile(
      this.#guardFor(recordPath),
      path.basename(recordPath),
      `${JSON.stringify(value, null, 2)}\n`,
      { hooks: this.fileSystemHooks, ...queueTransactionOptions },
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
      if (
        existing?.originIssueUrl &&
        originIssueUrl &&
        existing.originIssueUrl !== originIssueUrl
      ) {
        throw new Error("Durable queue claim origin URL conflicts")
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
      if (existing?.status === "quarantined") {
        return {
          claimed: false,
          reason: "instruction_quarantined",
          quarantineRecord: existing,
        }
      }
      if (
        this.watcherV2 &&
        existing?.status === "retryable_error" &&
        !Array.isArray(existing.failureHistory) &&
        Number.isSafeInteger(existing.failureCount) &&
        existing.failureCount >= watcherV2MaximumClaimFailures
      ) {
        const failure = normalizeWatcherFailure(
          existing.error ?? "legacy retry policy exhausted",
        )
        const quarantined = {
          ...existing,
          status: "quarantined",
          failureClass: failure.failureClass,
          normalizedErrorDigest: failure.errorDigest,
          legacyFailureCount: existing.failureCount,
          retryPolicyExhaustedReason: "legacy_retry_count_exhausted",
          quarantinedAt: this.now().toISOString(),
          nextEligibleAt: null,
          updatedAt: this.now().toISOString(),
        }
        await this.#writeRecord(recordPath, quarantined)
        return {
          claimed: false,
          reason: "legacy_retry_quarantined",
          quarantineRecord: quarantined,
        }
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
      const historicalFailure = historicalFailureFields(existing)
      const active = {
        schemaVersion: 1,
        instructionId: safeId,
        originIssueNumber,
        originIssueUrl: existing?.originIssueUrl ?? originIssueUrl,
        ...historicalFailure,
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
        if (error?.name === "AbortError" || error?.code === "WATCHER_SHUTDOWN") {
          await this.#writeRecord(recordPath, {
            ...active,
            status: "released",
            resultStatus: "shutdown_requested",
            completedAt: null,
            updatedAt: this.now().toISOString(),
          })
          throw error
        }
        let failedRecord
        if (this.watcherV2) {
          const decision = watcherV2QueueFailureDecision({
            existing,
            error,
            now: this.now(),
          })
          failedRecord = {
            ...active,
            status: decision.quarantined
              ? "quarantined"
              : "retryable_error",
            failureCount: decision.failureCount,
            failureHistory: decision.history,
            failureClass: decision.failure.failureClass,
            normalizedErrorDigest: decision.failure.errorDigest,
            error: decision.failure.normalized,
            nextEligibleAt: decision.nextEligibleAt,
            retryPolicyExhaustedReason: decision.exhaustedReason,
            quarantinedAt: decision.quarantined
              ? this.now().toISOString()
              : null,
            notificationKind: decision.notificationKind,
            updatedAt: this.now().toISOString(),
          }
          error.queueFailureDecision = decision
        } else {
          const failureCount = (existing?.failureCount ?? 0) + 1
          const backoffMs = Math.min(
            this.retryBaseMs * 2 ** (failureCount - 1),
            60_000,
          )
          failedRecord = {
            ...active,
            status: "retryable_error",
            failureCount,
            error: String(error.message).slice(0, 1_000),
            nextEligibleAt: new Date(
              this.now().getTime() + backoffMs,
            ).toISOString(),
            updatedAt: this.now().toISOString(),
          }
        }
        await this.#writeRecord(recordPath, failedRecord)
        error.queueRecord = failedRecord
        throw error
      }
    } finally {
      await releaseCrashSafeFileLease(instructionLock)
    }
  }

  async inspectInstructionClaims(
    { instructionIds, originIssueNumber },
    { issueClaim = null } = {},
  ) {
    if (
      !Array.isArray(instructionIds) ||
      instructionIds.length === 0 ||
      new Set(instructionIds).size !== instructionIds.length
    ) {
      throw new Error("Instruction claim inspection requires unique IDs")
    }
    const safeIds = instructionIds.map(safeInstructionId)
    if (!Number.isSafeInteger(originIssueNumber) || originIssueNumber < 1) {
      throw new Error("Cannot inspect claims for an invalid origin issue")
    }
    if (
      !issueClaim ||
      issueClaim[issueClaimBrand] !== this ||
      issueClaim.originIssueNumber !== originIssueNumber
    ) {
      throw new Error(
        "Instruction claim inspection requires the active issue claim",
      )
    }
    if (!(await fileLeaseIsActive(issueClaim.lease))) {
      throw new Error("Instruction claim inspection issue lease is no longer active")
    }

    const records = {}
    for (const instructionId of safeIds) {
      records[instructionId] = await this.#readRecord(
        path.join(this.recordDirectory, `${instructionId}.json`),
      )
    }
    return records
  }

  async completeClaimFromDurableTerminalFailure(
    binding,
    options = {},
  ) {
    if (binding?.resultStatus !== "failed") {
      throw new Error("Cannot reconcile a non-failure through the failure path")
    }
    return this.completeClaimFromDurableTerminalResult(binding, options)
  }

  async completeClaimFromDurableTerminalResult(
    {
      instructionId,
      originIssueNumber,
      originIssueUrl = null,
      resultStatus,
    },
    { issueClaim = null } = {},
  ) {
    const safeId = safeInstructionId(instructionId)
    if (!Number.isSafeInteger(originIssueNumber) || originIssueNumber < 1) {
      throw new Error("Cannot complete a claim for an invalid origin issue")
    }
    if (
      typeof resultStatus !== "string" ||
      !new Set(["failed", "needs_review"]).has(resultStatus) ||
      !completedResult({ status: resultStatus })
    ) {
      throw new Error("Cannot reconcile a non-terminal durable result")
    }
    if (!issueClaim) {
      const result = await this.withIssueClaim(
        { originIssueNumber },
        (claimedIssue) =>
          this.completeClaimFromDurableTerminalResult(
            {
              instructionId: safeId,
              originIssueNumber,
              originIssueUrl,
              resultStatus,
            },
            { issueClaim: claimedIssue },
          ),
      )
      return result.claimed
        ? result.value
        : { completed: false, reason: result.reason }
    }
    if (
      issueClaim[issueClaimBrand] !== this ||
      issueClaim.originIssueNumber !== originIssueNumber
    ) {
      throw new Error(
        "Durable queue completion is not bound to the active issue claim",
      )
    }
    if (!(await fileLeaseIsActive(issueClaim.lease))) {
      throw new Error("Durable queue completion issue lease is no longer active")
    }

    let instructionLock = null
    try {
      const instructionDecision = await this.#acquire(
        path.join(this.instructionLockDirectory, `${safeId}.lock`),
      )
      if (!instructionDecision.acquired) {
        return {
          completed: false,
          reason:
            instructionDecision.reason === "lease_busy"
              ? "instruction_busy"
              : `instruction_${instructionDecision.reason}`,
        }
      }
      instructionLock = instructionDecision.lease
      const recordPath = path.join(this.recordDirectory, `${safeId}.json`)
      const existing = await this.#readRecord(recordPath)
      if (!existing) return { completed: false, reason: "claim_missing" }
      if (existing.originIssueNumber !== originIssueNumber) {
        throw new Error("Durable queue completion origin conflicts")
      }
      if (
        existing.originIssueUrl &&
        originIssueUrl &&
        existing.originIssueUrl !== originIssueUrl
      ) {
        throw new Error("Durable queue completion URL conflicts")
      }
      if (existing.status === "completed") {
        if (existing.resultStatus !== resultStatus) {
          throw new Error("Durable queue completion result conflicts")
        }
        return { completed: false, reason: "already_completed", record: existing }
      }

      const now = this.now().toISOString()
      const historicalFailure = historicalFailureFields(existing)
      const active = {
        schemaVersion: 1,
        instructionId: safeId,
        originIssueNumber,
        originIssueUrl: existing.originIssueUrl ?? originIssueUrl,
        ...historicalFailure,
        status: "active",
        attempt: existing.attempt + 1,
        pid: this.pid,
        token: instructionLock.token,
        retryAuthorizationId: existing.retryAuthorizationId ?? null,
        claimedAt: now,
        updatedAt: now,
      }
      await this.#writeRecord(recordPath, active)
      const completed = {
        ...active,
        status: "completed",
        resultStatus,
        completedAt: this.now().toISOString(),
        updatedAt: this.now().toISOString(),
      }
      await this.#writeRecord(recordPath, completed)
      return { completed: true, record: completed }
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
