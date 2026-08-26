import assert from "node:assert/strict"
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { DurableTransactionError } from "../src/durable-filesystem.mjs"
import { QueueClaimStore } from "../src/queue-claim-store.mjs"

test("overlapping duplicate reads start one instruction callback", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-claim-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new QueueClaimStore({ stateDirectory: directory })
  let release
  let announce
  const entered = new Promise((resolve) => {
    announce = resolve
  })
  const gate = new Promise((resolve) => {
    release = resolve
  })
  let callbacks = 0
  const first = store.withClaim(
    {
      instructionId: "production-day1-stock-equipment-001",
      originIssueNumber: 63,
      originIssueUrl: "https://github.com/Sillyquack/koalafrog-hq/issues/63",
    },
    async () => {
      callbacks += 1
      const leaves = [
        path.join(store.issueLockDirectory, "63.lock"),
        path.join(
          store.instructionLockDirectory,
          "production-day1-stock-equipment-001.lock",
        ),
        path.join(
          store.recordDirectory,
          "production-day1-stock-equipment-001.json",
        ),
      ]
      for (const leaf of leaves) {
        assert.equal((await stat(leaf)).mode & 0o777, 0o600)
      }
      announce()
      await gate
      return { status: "needs_review" }
    },
  )
  await entered
  const duplicate = await store.withClaim(
    {
      instructionId: "production-day1-stock-equipment-001",
      originIssueNumber: 63,
    },
    async () => {
      callbacks += 1
      return { status: "needs_review" }
    },
  )
  assert.equal(duplicate.claimed, false)
  assert.match(duplicate.reason, /busy/)
  release()
  assert.equal((await first).claimed, true)
  assert.equal(callbacks, 1)
})

test("instruction origin is durable and cannot be rerouted to another issue", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-origin-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const firstStore = new QueueClaimStore({ stateDirectory: directory })
  const first = await firstStore.withClaim(
    { instructionId: "globally-unique-001", originIssueNumber: 63 },
    async () => ({ status: "needs_review" }),
  )
  assert.equal(first.claimed, true)

  const restartedStore = new QueueClaimStore({ stateDirectory: directory })
  const replay = await restartedStore.withClaim(
    { instructionId: "globally-unique-001", originIssueNumber: 63 },
    async () => ({ status: "unexpected" }),
  )
  assert.deepEqual(replay, { claimed: false, reason: "already_consumed" })
  const rerouted = await restartedStore.withClaim(
    { instructionId: "globally-unique-001", originIssueNumber: 64 },
    async () => ({ status: "unexpected" }),
  )
  assert.deepEqual(rerouted, {
    claimed: false,
    reason: "duplicate_instruction_origin",
  })
})

test("restart reclaims dead process locks and resumes the durable claim", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-reclaim-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new QueueClaimStore({
    stateDirectory: directory,
    pid: 222,
    isProcessAlive: () => false,
    getProcessIdentity: async (pid) => `test-process:${pid}`,
  })
  const instructionId = "restart-safe-001"
  const issueLock = path.join(store.issueLockDirectory, "63.lock")
  const instructionLock = path.join(
    store.instructionLockDirectory,
    `${instructionId}.lock`,
  )
  const recordPath = path.join(store.recordDirectory, `${instructionId}.json`)
  await mkdir(path.dirname(issueLock), { recursive: true })
  await mkdir(path.dirname(instructionLock), { recursive: true })
  await mkdir(path.dirname(recordPath), { recursive: true })
  await writeFile(issueLock, JSON.stringify({ token: "old", pid: 111 }))
  await writeFile(instructionLock, JSON.stringify({ token: "old", pid: 111 }))
  await writeFile(
    `${issueLock}.reaper`,
    JSON.stringify({ token: "old-issue-reaper", pid: 111 }),
  )
  await writeFile(
    `${instructionLock}.reaper`,
    JSON.stringify({ token: "old-instruction-reaper", pid: 111 }),
  )
  await writeFile(
    recordPath,
    JSON.stringify({
      instructionId,
      originIssueNumber: 63,
      status: "active",
      attempt: 1,
      pid: 111,
    }),
  )

  let callbacks = 0
  const resumed = await store.withClaim(
    { instructionId, originIssueNumber: 63 },
    async () => {
      callbacks += 1
      return { status: "needs_review" }
    },
  )
  assert.equal(resumed.claimed, true)
  assert.equal(callbacks, 1)
  const record = JSON.parse(await readFile(recordPath, "utf8"))
  assert.equal(record.status, "completed")
  assert.equal(record.attempt, 2)
})

test("an issue claim serializes fresh-state selection and can nest one instruction claim", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-issue-lease-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new QueueClaimStore({ stateDirectory: directory })
  let release
  let announce
  const entered = new Promise((resolve) => {
    announce = resolve
  })
  const gate = new Promise((resolve) => {
    release = resolve
  })
  let retainedIssueClaim = null
  const first = store.withIssueClaim(
    { originIssueNumber: 63 },
    async (issueClaim) => {
      retainedIssueClaim = issueClaim
      const nested = await store.withClaim(
        { instructionId: "nested-claim-001", originIssueNumber: 63 },
        async () => {
          announce()
          await gate
          return { status: "needs_review" }
        },
        { issueClaim },
      )
      return nested
    },
  )
  await entered
  const competing = await store.withIssueClaim(
    { originIssueNumber: 63 },
    async () => ({ status: "unexpected" }),
  )
  assert.deepEqual(competing, { claimed: false, reason: "issue_busy" })
  release()
  const result = await first
  assert.equal(result.claimed, true)
  assert.equal(result.value.claimed, true)
  await assert.rejects(
    store.withClaim(
      { instructionId: "replayed-lease-002", originIssueNumber: 63 },
      async () => ({ status: "unexpected" }),
      { issueClaim: retainedIssueClaim },
    ),
    /issue lease is no longer active/,
  )
})

test("a deferred authorized retry cannot downgrade an existing completed claim", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-claim-terminal-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new QueueClaimStore({ stateDirectory: directory })
  const instructionId = "completed-recovery-027"
  await store.withClaim(
    { instructionId, originIssueNumber: 63 },
    async () => ({ status: "needs_review" }),
  )
  const retry = await store.withClaim(
    {
      instructionId,
      originIssueNumber: 63,
      retryAuthorizationId: "checkpoint-recovery:bounded-027",
    },
    async () => ({ status: "queue_changed" }),
  )
  assert.equal(retry.claimed, true)
  assert.equal(retry.value.status, "queue_changed")
  const record = JSON.parse(
    await readFile(
      path.join(store.recordDirectory, `${instructionId}.json`),
      "utf8",
    ),
  )
  assert.equal(record.status, "completed")
  assert.equal(record.attempt, 1)
})

test("a durable terminal result completes an interrupted queue claim without replaying its callback", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-terminal-queue-completion-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new QueueClaimStore({
    stateDirectory: directory,
    retryBaseMs: 60_000,
  })
  const instructionId = "orchestrator-bootstrap-direct-canonical-review-047"
  let callbacks = 0
  await assert.rejects(
    store.withClaim(
      {
        instructionId,
        originIssueNumber: 70,
        originIssueUrl: "https://github.com/Sillyquack/koalafrog-hq/issues/70",
      },
      async () => {
        callbacks += 1
        throw new Error("simulated process loss before queue completion")
      },
    ),
    /simulated process loss/,
  )

  const completion = await store.completeClaimFromDurableTerminalFailure({
    instructionId,
    originIssueNumber: 70,
    originIssueUrl: "https://github.com/Sillyquack/koalafrog-hq/issues/70",
    resultStatus: "failed",
  })
  assert.equal(completion.completed, true)
  assert.equal(callbacks, 1)
  const replay = await store.completeClaimFromDurableTerminalFailure({
    instructionId,
    originIssueNumber: 70,
    originIssueUrl: "https://github.com/Sillyquack/koalafrog-hq/issues/70",
    resultStatus: "failed",
  })
  assert.equal(replay.completed, false)
  assert.equal(replay.reason, "already_completed")
  assert.equal(callbacks, 1)
  const record = JSON.parse(
    await readFile(
      path.join(store.recordDirectory, `${instructionId}.json`),
      "utf8",
    ),
  )
  assert.equal(record.status, "completed")
  assert.equal(record.resultStatus, "failed")
  assert.equal(record.attempt, 2)
})

test("terminal queue completion recovers across both durable write crash boundaries", async (t) => {
  for (const failedWrite of [1, 2]) {
    await t.test(`write_${failedWrite}`, async (t) => {
      const directory = await mkdtemp(
        path.join(os.tmpdir(), `koalafrog-terminal-queue-write-${failedWrite}-`),
      )
      t.after(() => rm(directory, { recursive: true, force: true }))
      const instructionId = `terminal-queue-write-${failedWrite}-047`
      const binding = {
        instructionId,
        originIssueNumber: 70,
        originIssueUrl:
          "https://github.com/Sillyquack/koalafrog-hq/issues/70",
      }
      let callbacks = 0
      const initial = new QueueClaimStore({ stateDirectory: directory })
      await assert.rejects(
        initial.withClaim(binding, async () => {
          callbacks += 1
          throw new Error("simulated runner crash")
        }),
        /simulated runner crash/,
      )

      let commitSyncs = 0
      const interrupted = new QueueClaimStore({
        stateDirectory: directory,
        fileSystemHooks: {
          beforeDirectorySync: async ({ phase, leafName }) => {
            if (phase !== "commit" || leafName !== `${instructionId}.json`) {
              return
            }
            commitSyncs += 1
            if (commitSyncs === failedWrite) {
              throw new Error(`injected terminal queue write ${failedWrite}`)
            }
          },
        },
      })
      await assert.rejects(
        interrupted.completeClaimFromDurableTerminalFailure({
          ...binding,
          resultStatus: "failed",
        }),
        (error) =>
          error.code === "DURABLE_COMMIT_PENDING" &&
          error.cause?.message === `injected terminal queue write ${failedWrite}`,
      )

      const restarted = new QueueClaimStore({ stateDirectory: directory })
      const completion =
        await restarted.completeClaimFromDurableTerminalFailure({
          ...binding,
          resultStatus: "failed",
        })
      assert.ok(
        completion.completed || completion.reason === "already_completed",
      )
      assert.equal(callbacks, 1)
      const record = JSON.parse(
        await readFile(
          path.join(restarted.recordDirectory, `${instructionId}.json`),
          "utf8",
        ),
      )
      assert.equal(record.status, "completed")
      assert.equal(record.resultStatus, "failed")
    })
  }
})

test("a stale issue claim cannot survive loss or replacement of its durable lease", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-issue-lease-loss-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const firstStore = new QueueClaimStore({ stateDirectory: directory })
  const secondStore = new QueueClaimStore({ stateDirectory: directory })
  let releaseSecond
  let secondEntered
  const entered = new Promise((resolve) => {
    secondEntered = resolve
  })
  const secondGate = new Promise((resolve) => {
    releaseSecond = resolve
  })

  const first = firstStore.withIssueClaim(
    { originIssueNumber: 63 },
    async (issueClaim) => {
      await unlink(path.join(firstStore.issueLockDirectory, "63.lock"))
      const second = secondStore.withIssueClaim(
        { originIssueNumber: 63 },
        async () => {
          secondEntered()
          await secondGate
          return { status: "needs_review" }
        },
      )
      await entered
      await assert.rejects(
        firstStore.withClaim(
          {
            instructionId: "stale-issue-lease-001",
            originIssueNumber: 63,
          },
          async () => ({ status: "unexpected" }),
          { issueClaim },
        ),
        /issue lease is no longer active/,
      )
      releaseSecond()
      assert.equal((await second).claimed, true)
      return { status: "needs_review" }
    },
  )
  assert.equal((await first).claimed, true)
})

test("one bounded retry identity can supersede a legacy completion only once", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-claim-retry-id-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new QueueClaimStore({ stateDirectory: directory })
  const instructionId = "completed-recovery-identity-027"
  const retryAuthorizationId =
    `git-reconciliation-checkpoint-activation-recovery:${"a".repeat(64)}`
  await store.withClaim(
    { instructionId, originIssueNumber: 63 },
    async () => ({ status: "needs_review" }),
  )
  const retry = await store.withClaim(
    { instructionId, originIssueNumber: 63, retryAuthorizationId },
    async () => ({ status: "needs_review" }),
  )
  assert.equal(retry.claimed, true)
  const replay = await store.withClaim(
    { instructionId, originIssueNumber: 63, retryAuthorizationId },
    async () => ({ status: "unexpected" }),
  )
  assert.deepEqual(replay, { claimed: false, reason: "already_consumed" })
  const substitution = await store.withClaim(
    {
      instructionId,
      originIssueNumber: 63,
      retryAuthorizationId:
        `git-reconciliation-checkpoint-activation-recovery:${"b".repeat(64)}`,
    },
    async () => ({ status: "unexpected" }),
  )
  assert.deepEqual(substitution, {
    claimed: false,
    reason: "retry_authorization_conflict",
  })
  const record = JSON.parse(
    await readFile(
      path.join(store.recordDirectory, `${instructionId}.json`),
      "utf8",
    ),
  )
  assert.equal(record.status, "completed")
  assert.equal(record.attempt, 2)
  assert.equal(record.retryAuthorizationId, retryAuthorizationId)
})

test("concurrent stale-lock reclaimers cannot both enter an issue claim", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-claim-reapers-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const firstStore = new QueueClaimStore({
    stateDirectory: directory,
    pid: 222,
    isProcessAlive: (pid) => pid !== 111,
    getProcessIdentity: async (pid) => `test-process:${pid}`,
  })
  const secondStore = new QueueClaimStore({
    stateDirectory: directory,
    pid: 333,
    isProcessAlive: (pid) => pid !== 111,
    getProcessIdentity: async (pid) => `test-process:${pid}`,
  })
  const issueLock = path.join(firstStore.issueLockDirectory, "63.lock")
  await mkdir(path.dirname(issueLock), { recursive: true })
  await writeFile(issueLock, JSON.stringify({ token: "dead", pid: 111 }))
  await writeFile(
    `${issueLock}.reaper`,
    JSON.stringify({ token: "dead-reaper", pid: 111 }),
  )
  let release
  let announce
  const entered = new Promise((resolve) => {
    announce = resolve
  })
  const gate = new Promise((resolve) => {
    release = resolve
  })
  let callbacks = 0
  const attempt = (store) =>
    store.withIssueClaim({ originIssueNumber: 63 }, async () => {
      callbacks += 1
      announce()
      await gate
      return { status: "needs_review" }
    })
  const first = attempt(firstStore)
  const second = attempt(secondStore)
  await entered
  await new Promise((resolve) => setTimeout(resolve, 10))
  release()
  const results = await Promise.all([first, second])
  assert.equal(callbacks, 1)
  assert.equal(results.filter((result) => result.claimed).length, 1)
  assert.equal(
    results.filter((result) => result.reason === "issue_busy").length,
    1,
  )
})

test("live and malformed queue reapers fail closed with bounded recovery guidance", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-queue-reaper-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new QueueClaimStore({ stateDirectory: directory })
  await mkdir(store.issueLockDirectory, { recursive: true })
  const reaper = path.join(store.issueLockDirectory, "63.lock.reaper")
  await writeFile(
    reaper,
    JSON.stringify({
      token: "live-reaper",
      pid: process.pid,
      acquiredAt: "2000-01-01T00:00:00.000Z",
    }),
    { mode: 0o600 },
  )
  const live = await store.withIssueClaim(
    { originIssueNumber: 63 },
    async () => ({ status: "unexpected" }),
  )
  assert.equal(live.claimed, false)
  assert.equal(live.reason, "issue_lease_owner_ambiguous")
  assert.match(live.recovery, /stop the recorded process/)
  assert.equal((await stat(reaper)).isFile(), true)

  await unlink(reaper)
  await writeFile(reaper, "{malformed", { mode: 0o600 })
  await assert.rejects(
    store.withIssueClaim(
      { originIssueNumber: 63 },
      async () => ({ status: "unexpected" }),
    ),
    (error) =>
      error.code === "FILE_LEASE_METADATA_MALFORMED" &&
      /remove only this malformed marker/.test(error.recovery),
  )
  await unlink(reaper)
  const recovered = await store.withIssueClaim(
    { originIssueNumber: 63 },
    async () => ({ status: "needs_review" }),
  )
  assert.equal(recovered.claimed, true)
})

test("failed lease publication never removes a concurrently published successor", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-lease-successor-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  let successorWritten = false
  let lockPath = null
  const store = new QueueClaimStore({
    stateDirectory: directory,
    pid: 222,
    isProcessAlive: (pid) => pid !== 111,
    getProcessIdentity: async (pid) =>
      pid === 222 ? "current-owner" : "successor-owner",
    fileSystemHooks: {
      afterLeaseMarkerRemoved: async ({ leafName }) => {
        if (successorWritten || leafName !== "63.lock") return
        successorWritten = true
        await writeFile(
          lockPath,
          `${JSON.stringify({
            schemaVersion: 2,
            token: "successor-token",
            pid: 333,
            processIdentity: "successor-owner",
            acquiredAt: "2026-08-25T12:00:00.000Z",
          })}\n`,
          { mode: 0o600 },
        )
      },
    },
  })
  await mkdir(store.issueLockDirectory, { recursive: true })
  lockPath = path.join(store.issueLockDirectory, "63.lock")
  await writeFile(
    lockPath,
    `${JSON.stringify({ token: "dead-owner", pid: 111 })}\n`,
    { mode: 0o600 },
  )

  await assert.rejects(
    store.withIssueClaim(
      { originIssueNumber: 63 },
      async () => ({ status: "unexpected" }),
    ),
    (error) => error.code === "EEXIST",
  )
  assert.equal(JSON.parse(await readFile(lockPath, "utf8")).token, "successor-token")
})

test("queue PID reuse requires a distinct structured process identity", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-queue-pid-reuse-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new QueueClaimStore({
    stateDirectory: directory,
    isProcessAlive: () => true,
    getProcessIdentity: async (pid) =>
      pid === process.pid ? "current-owner" : "reused-process",
  })
  await mkdir(store.issueLockDirectory, { recursive: true })
  await writeFile(
    path.join(store.issueLockDirectory, "63.lock.reaper"),
    JSON.stringify({
      schemaVersion: 2,
      token: "00000000-0000-4000-8000-000000000002",
      pid: 987_654,
      processIdentity: "original-process",
      acquiredAt: "2000-01-01T00:00:00.000Z",
    }),
    { mode: 0o600 },
  )
  const result = await store.withIssueClaim(
    { originIssueNumber: 63 },
    async () => ({ status: "needs_review" }),
  )
  assert.equal(result.claimed, true)
})

test("queue record, lock, reaper, and takeover symlink leaves never reach outside targets", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-queue-leaves-"))
  const outside = await mkdtemp(path.join(os.tmpdir(), "koalafrog-queue-leaves-outside-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  t.after(() => rm(outside, { recursive: true, force: true }))
  const target = path.join(outside, "target")
  await writeFile(target, "outside-sentinel\n", { mode: 0o600 })
  const store = new QueueClaimStore({ stateDirectory: directory })
  await mkdir(store.recordDirectory, { recursive: true })
  const instructionId = "symlink-record-001"
  const record = path.join(store.recordDirectory, `${instructionId}.json`)
  await symlink(target, record)
  await assert.rejects(
    store.withClaim(
      { instructionId, originIssueNumber: 63 },
      async () => ({ status: "unexpected" }),
    ),
    (error) => error.code === "FILESYSTEM_LEAF_SYMLINK",
  )
  await unlink(record)

  await mkdir(store.issueLockDirectory, { recursive: true })
  const lock = path.join(store.issueLockDirectory, "64.lock")
  await symlink(target, lock)
  await assert.rejects(
    store.withIssueClaim(
      { originIssueNumber: 64 },
      async () => ({ status: "unexpected" }),
    ),
    (error) => error.code === "FILESYSTEM_LEAF_SYMLINK",
  )
  await unlink(lock)

  await symlink(target, `${lock}.reaper`)
  await assert.rejects(
    store.withIssueClaim(
      { originIssueNumber: 64 },
      async () => ({ status: "unexpected" }),
    ),
    (error) => error.code === "FILESYSTEM_LEAF_SYMLINK",
  )
  await unlink(`${lock}.reaper`)

  let replaced = false
  const racing = new QueueClaimStore({
    stateDirectory: directory,
    fileSystemHooks: {
      afterAdvisoryAcquire: async ({ leafName }) => {
        if (replaced || leafName !== "65.lock.takeover") return
        replaced = true
        const guardPath = path.join(store.issueLockDirectory, leafName)
        await unlink(guardPath)
        await symlink(target, guardPath)
      },
    },
  })
  await assert.rejects(
    racing.withIssueClaim(
      { originIssueNumber: 65 },
      async () => ({ status: "unexpected" }),
    ),
    (error) => error.code === "FILESYSTEM_LEAF_SYMLINK",
  )
  assert.equal(await readFile(target, "utf8"), "outside-sentinel\n")
})

test("a durability-uncertain completion is recovered and never downgraded or replayed", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-queue-durable-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const instructionId = "durable-completion-001"
  let commitSyncs = 0
  let callbacks = 0
  const failing = new QueueClaimStore({
    stateDirectory: directory,
    fileSystemHooks: {
      beforeDirectorySync: async ({ phase, leafName }) => {
        if (phase !== "commit" || leafName !== `${instructionId}.json`) return
        commitSyncs += 1
        if (commitSyncs === 2) throw new Error("injected completion directory sync")
      },
    },
  })
  await assert.rejects(
    failing.withClaim(
      { instructionId, originIssueNumber: 63 },
      async () => {
        callbacks += 1
        return { status: "needs_review" }
      },
    ),
    (error) =>
      error.code === "DURABLE_COMMIT_PENDING" &&
      /completion directory sync/.test(error.cause?.message ?? ""),
  )
  assert.equal(callbacks, 1)

  const restarted = new QueueClaimStore({ stateDirectory: directory })
  const replay = await restarted.withClaim(
    { instructionId, originIssueNumber: 63 },
    async () => {
      callbacks += 1
      return { status: "unexpected" }
    },
  )
  assert.deepEqual(replay, { claimed: false, reason: "already_consumed" })
  assert.equal(callbacks, 1)
  const durable = JSON.parse(
    await readFile(
      path.join(restarted.recordDirectory, `${instructionId}.json`),
      "utf8",
    ),
  )
  assert.equal(durable.status, "completed")
  assert.equal(durable.attempt, 1)
})

test("stale and forged queue journals cannot reopen a completed claim", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-queue-journal-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const instructionId = "bound-journal-completion-001"
  const retryAuthorizationId = "git-recovery:bound-journal-001"
  let commitSyncs = 0
  let callbacks = 0
  const interrupted = new QueueClaimStore({
    stateDirectory: directory,
    fileSystemHooks: {
      beforeDirectorySync: async ({ phase, leafName }) => {
        if (phase !== "commit" || leafName !== `${instructionId}.json`) return
        commitSyncs += 1
        if (commitSyncs === 2) throw new Error("injected completion uncertainty")
      },
    },
  })
  await assert.rejects(
    interrupted.withClaim(
      { instructionId, originIssueNumber: 63 },
      async () => {
        callbacks += 1
        return { status: "needs_review" }
      },
    ),
    (error) => error.code === "DURABLE_COMMIT_PENDING",
  )
  const recordPath = path.join(
    interrupted.recordDirectory,
    `${instructionId}.json`,
  )
  const pendingPath = path.join(
    interrupted.recordDirectory,
    `.${instructionId}.json.commit-pending`,
  )
  const staleJournal = await readFile(pendingPath)

  const restarted = new QueueClaimStore({ stateDirectory: directory })
  assert.deepEqual(
    await restarted.withClaim(
      { instructionId, originIssueNumber: 63 },
      async () => {
        callbacks += 1
        return { status: "unexpected" }
      },
    ),
    { claimed: false, reason: "already_consumed" },
  )
  const retried = await restarted.withClaim(
    { instructionId, originIssueNumber: 63, retryAuthorizationId },
    async () => {
      callbacks += 1
      return { status: "needs_review" }
    },
  )
  assert.equal(retried.claimed, true)
  assert.equal(callbacks, 2)
  const protectedContents = await readFile(recordPath)

  await writeFile(pendingPath, staleJournal, { mode: 0o600 })
  await assert.rejects(
    restarted.withClaim(
      { instructionId, originIssueNumber: 63, retryAuthorizationId },
      async () => {
        callbacks += 1
        return { status: "unexpected" }
      },
    ),
    (error) =>
      error instanceof DurableTransactionError &&
      error.code === "DURABLE_TRANSACTION_EVIDENCE_CONFLICT",
  )
  assert.equal(callbacks, 2)
  assert.deepEqual(await readFile(recordPath), protectedContents)
  await unlink(pendingPath)

  const forged = JSON.parse(protectedContents.toString("utf8"))
  forged.status = "released"
  await writeFile(pendingPath, `${JSON.stringify(forged)}\n`, { mode: 0o600 })
  await assert.rejects(
    restarted.withClaim(
      { instructionId, originIssueNumber: 63, retryAuthorizationId },
      async () => {
        callbacks += 1
        return { status: "unexpected" }
      },
    ),
    (error) =>
      error instanceof DurableTransactionError &&
      error.code === "DURABLE_TRANSACTION_JOURNAL_INVALID",
  )
  assert.equal(callbacks, 2)
  assert.deepEqual(await readFile(recordPath), protectedContents)
})
