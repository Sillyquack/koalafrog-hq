import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
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
  })
  const secondStore = new QueueClaimStore({
    stateDirectory: directory,
    pid: 333,
    isProcessAlive: (pid) => pid !== 111,
  })
  const issueLock = path.join(firstStore.issueLockDirectory, "63.lock")
  await mkdir(path.dirname(issueLock), { recursive: true })
  await writeFile(issueLock, JSON.stringify({ token: "dead", pid: 111 }))
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
