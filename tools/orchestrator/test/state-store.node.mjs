import assert from "node:assert/strict"
import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { setTimeout as delay } from "node:timers/promises"
import {
  StateRevisionConflictError,
  StateRevisionOverflowError,
  StateStore,
} from "../src/state-store.mjs"
import {
  DurableCommitPendingError,
  DurableTransactionError,
  ensurePrivateDirectory,
} from "../src/durable-filesystem.mjs"
import { QueueClaimStore } from "../src/queue-claim-store.mjs"

const repository = "Sillyquack/koalafrog-hq"

function options(stateDirectory) {
  return { stateDirectory, repository, issueNumber: 63 }
}

test("state revision CAS rejects a stale whole-state replacement", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-state-cas-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new StateStore(options(directory))
  const protectedState = await store.load()
  const staleState = structuredClone(protectedState)

  protectedState.status = "running"
  protectedState.activeInstruction = {
    instructionId: "protected-recovery-027",
    checkpointActivationRecovery: { recoveryId: "recovery-current" },
  }
  protectedState.checkpointActivationRecoveries = [
    { recoveryId: "recovery-current", status: "boundary_activated" },
  ]
  protectedState.ownerGateAcknowledgements = [
    { acknowledgementId: "owner-ack-027", status: "completed" },
  ]
  await store.save(protectedState)

  staleState.status = "needs_review"
  await assert.rejects(
    store.save(staleState),
    (error) => {
      assert.ok(error instanceof StateRevisionConflictError)
      assert.equal(error.code, "STATE_REVISION_CONFLICT")
      assert.equal(error.expectedRevision, 1)
      assert.equal(error.actualRevision, 2)
      return true
    },
  )

  const durable = await store.load()
  assert.equal(durable.status, "running")
  assert.equal(durable.activeInstruction.instructionId, "protected-recovery-027")
  assert.equal(durable.checkpointActivationRecoveries.length, 1)
  assert.equal(durable.ownerGateAcknowledgements.length, 1)
  assert.equal(staleState.stateRevision, 1)
})

test("concurrent state writers have one CAS winner and the loser can reload and recompute", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-state-race-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const firstStore = new StateStore(options(directory))
  const secondStore = new StateStore(options(directory))
  const first = await firstStore.load()
  const second = await secondStore.load()
  first.task.originIssueUrl = "https://github.com/Sillyquack/koalafrog-hq/issues/63"
  second.task.lastObservedIssueUpdatedAt = "2026-08-25T12:00:00.000Z"

  const writes = await Promise.allSettled([
    firstStore.save(first),
    secondStore.save(second),
  ])
  assert.equal(writes.filter((result) => result.status === "fulfilled").length, 1)
  assert.equal(writes.filter((result) => result.status === "rejected").length, 1)
  assert.equal(
    writes.find((result) => result.status === "rejected").reason.code,
    "STATE_REVISION_CONFLICT",
  )

  const recomputed = await secondStore.load()
  recomputed.task.originIssueUrl ??=
    "https://github.com/Sillyquack/koalafrog-hq/issues/63"
  recomputed.task.lastObservedIssueUpdatedAt ??=
    "2026-08-25T12:00:00.000Z"
  await secondStore.save(recomputed)
  const durable = await firstStore.load()
  assert.equal(
    durable.task.originIssueUrl,
    "https://github.com/Sillyquack/koalafrog-hq/issues/63",
  )
  assert.equal(
    durable.task.lastObservedIssueUpdatedAt,
    "2026-08-25T12:00:00.000Z",
  )
})

test("distinct concurrent observations converge by retrying under the issue claim", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-state-issue-claim-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new StateStore(options(directory))
  await store.load()
  const claims = new QueueClaimStore({ stateDirectory: directory })

  async function mutateWithRetry(mutate) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = await claims.withIssueClaim(
        { originIssueNumber: 63 },
        async () => {
          const current = await store.load()
          mutate(current)
          await store.save(current)
        },
      )
      if (result.claimed) return
      await new Promise((resolve) => setTimeout(resolve, 5))
    }
    throw new Error("Issue claim did not become available")
  }

  await Promise.all([
    mutateWithRetry((state) => {
      state.task.originIssueUrl =
        "https://github.com/Sillyquack/koalafrog-hq/issues/63"
    }),
    mutateWithRetry((state) => {
      state.task.lastObservedIssueUpdatedAt = "2026-08-25T12:00:00.000Z"
    }),
  ])
  const durable = await store.load()
  assert.equal(
    durable.task.originIssueUrl,
    "https://github.com/Sillyquack/koalafrog-hq/issues/63",
  )
  assert.equal(
    durable.task.lastObservedIssueUpdatedAt,
    "2026-08-25T12:00:00.000Z",
  )
})

test("dead state locks and orphan temporary files recover without corrupting state", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-state-crash-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new StateStore(options(directory))
  const state = await store.load()
  await writeFile(
    store.stateLockPath,
    `${JSON.stringify({ token: "dead", pid: 2_147_483_647 })}\n`,
    { mode: 0o600 },
  )
  await writeFile(`${store.statePath}.orphan.tmp`, "{incomplete", {
    mode: 0o600,
  })
  const orphanCandidate = path.join(
    store.directory,
    `..state-write.lock.${process.pid}.00000000-0000-4000-8000-000000000003.lease-candidate`,
  )
  await link(store.stateLockPath, orphanCandidate)
  assert.equal((await stat(store.stateLockPath)).nlink, 2)
  state.status = "needs_review"
  await store.save(state)

  const durable = JSON.parse(await readFile(store.statePath, "utf8"))
  assert.equal(durable.status, "needs_review")
  assert.equal(durable.stateRevision, 2)
  assert.equal((await stat(store.statePath)).mode & 0o777, 0o600)
  assert.equal((await stat(store.directory)).mode & 0o777, 0o700)
  assert.deepEqual(
    (await readdir(store.directory)).filter((name) =>
      name.includes(`.${process.pid}.`) && name.endsWith(".tmp"),
    ),
    [],
  )
  await assert.rejects(stat(orphanCandidate), (error) => error.code === "ENOENT")
})

test("task state path and symlink escapes fail closed", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-state-path-"))
  const outside = await mkdtemp(path.join(os.tmpdir(), "koalafrog-state-outside-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  t.after(() => rm(outside, { recursive: true, force: true }))
  const taskDirectory = path.join(directory, "Sillyquack-koalafrog-hq-issue-63")
  await mkdir(directory, { recursive: true })
  await symlink(outside, taskDirectory)
  const store = new StateStore(options(directory))
  await assert.rejects(
    store.load(),
    /FILESYSTEM_DIRECTORY_(?:UNSAFE|ESCAPE)/,
  )
  assert.throws(
    () =>
      new StateStore({
        stateDirectory: directory,
        repository: "../../escape/repository",
        issueNumber: 63,
      }),
    /unsafe repository name/,
  )
  await chmod(outside, 0o700)
})

test("guarded directory creation cannot mutate through a replaced parent", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-dir-parent-"))
  const outside = await mkdtemp(path.join(os.tmpdir(), "koalafrog-dir-outside-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  t.after(() => rm(outside, { recursive: true, force: true }))
  const guardedPath = path.join(directory, "guarded")
  const movedPath = path.join(directory, "guarded-original")
  await mkdir(guardedPath, { mode: 0o700 })
  const guard = await ensurePrivateDirectory(guardedPath)
  await rename(guardedPath, movedPath)
  await symlink(outside, guardedPath)
  const before = await readdir(outside)

  await assert.rejects(
    ensurePrivateDirectory(path.join(guardedPath, "child"), {
      parentGuard: guard,
    }),
    (error) => error.code === "FILESYSTEM_DIRECTORY_REPLACED",
  )

  assert.deepEqual(await readdir(outside), before)
  await assert.rejects(
    stat(path.join(outside, "child")),
    (error) => error.code === "ENOENT",
  )

  const alias = path.join(directory, "outside-alias")
  await symlink(outside, alias)
  await assert.rejects(
    ensurePrivateDirectory(path.join(alias, "untrusted-child")),
    (error) => error.code === "FILESYSTEM_DIRECTORY_UNSAFE",
  )
  assert.deepEqual(await readdir(outside), before)
})

test("descriptor mutation rejects a parent displaced outside guarded ancestry before touching its child", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-ancestry-"))
  const outside = await mkdtemp(path.join(os.tmpdir(), "koalafrog-displaced-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  t.after(() => rm(outside, { recursive: true, force: true }))
  const guardedPath = path.join(directory, "guarded")
  const replacementPath = path.join(directory, "replacement")
  const child = path.join(guardedPath, "child")
  const sentinel = path.join(child, "sentinel.txt")
  const displaced = path.join(outside, "displaced")
  await mkdir(guardedPath, { mode: 0o700 })
  await mkdir(replacementPath, { mode: 0o700 })
  await mkdir(child, { mode: 0o755 })
  await chmod(child, 0o755)
  await writeFile(sentinel, "authorized ancestry only\n", { mode: 0o600 })
  const guard = await ensurePrivateDirectory(guardedPath)
  const beforeChild = await stat(child)
  const beforeSentinel = await stat(sentinel)
  const beforeContents = await readFile(sentinel, "utf8")

  await assert.rejects(
    ensurePrivateDirectory(child, {
      parentGuard: guard,
      hooks: {
        beforeDescriptorDirectoryMutation: async () => {
          await rename(guardedPath, displaced)
          await symlink(replacementPath, guardedPath)
        },
      },
    }),
    (error) => error.code === "FILESYSTEM_DIRECTORY_REPLACED",
  )

  const displacedChild = path.join(displaced, "child")
  const afterChild = await stat(displacedChild)
  const afterSentinel = await stat(path.join(displacedChild, "sentinel.txt"))
  assert.equal(afterChild.mode, beforeChild.mode)
  assert.equal(afterChild.nlink, beforeChild.nlink)
  assert.equal(afterChild.ctimeMs, beforeChild.ctimeMs)
  assert.equal(afterSentinel.mode, beforeSentinel.mode)
  assert.equal(afterSentinel.nlink, beforeSentinel.nlink)
  assert.equal(afterSentinel.ctimeMs, beforeSentinel.ctimeMs)
  assert.equal(
    await readFile(path.join(displacedChild, "sentinel.txt"), "utf8"),
    beforeContents,
  )
  assert.deepEqual(await readdir(replacementPath), [])
})

test("required advisory-lock capability failure occurs before state or queue filesystem mutation", async (t) => {
  const stateDirectory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-capability-state-"),
  )
  const queueDirectory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-capability-queue-"),
  )
  t.after(() => rm(stateDirectory, { recursive: true, force: true }))
  t.after(() => rm(queueDirectory, { recursive: true, force: true }))
  await chmod(stateDirectory, 0o755)
  await chmod(queueDirectory, 0o755)
  const beforeState = await stat(stateDirectory)
  const beforeQueue = await stat(queueDirectory)
  const pathDependentLockfSpec = (guardPath) =>
    guardPath === "/dev/null"
      ? {
          command: "/bin/sh",
          args: [
            "-c",
            'printf "READY 1 1\\n"; /bin/cat >/dev/null',
            "capability-only-lock-helper",
          ],
          busyCodes: new Set([75]),
        }
      : {
          command: "/definitely/missing/koalafrog-lock-helper",
          args: [],
          busyCodes: new Set([75]),
        }

  const stateStore = new StateStore({
    ...options(stateDirectory),
    lockfSpec: pathDependentLockfSpec,
  })
  await assert.rejects(
    stateStore.load(),
    (error) => error.code === "FILE_LEASE_GUARD_UNAVAILABLE",
  )
  const queueStore = new QueueClaimStore({
    stateDirectory: queueDirectory,
    lockfSpec: pathDependentLockfSpec,
  })
  await assert.rejects(
    queueStore.withIssueClaim({ originIssueNumber: 63 }, async () => null),
    (error) => error.code === "FILE_LEASE_GUARD_UNAVAILABLE",
  )

  const afterState = await stat(stateDirectory)
  const afterQueue = await stat(queueDirectory)
  assert.deepEqual(await readdir(stateDirectory), [])
  assert.deepEqual(await readdir(queueDirectory), [])
  assert.equal(afterState.mode, beforeState.mode)
  assert.equal(afterState.nlink, beforeState.nlink)
  assert.equal(afterState.ctimeMs, beforeState.ctimeMs)
  assert.equal(afterQueue.mode, beforeQueue.mode)
  assert.equal(afterQueue.nlink, beforeQueue.nlink)
  assert.equal(afterQueue.ctimeMs, beforeQueue.ctimeMs)
})

test("existing private-directory identity is immutable before permission normalization", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-dir-identity-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const parentGuard = await ensurePrivateDirectory(directory)

  for (let round = 0; round < 100; round += 1) {
    const child = path.join(directory, `child-${round}`)
    const replacement = path.join(directory, `replacement-${round}`)
    const moved = path.join(directory, `moved-${round}`)
    await mkdir(child, { mode: 0o755 })
    await mkdir(replacement, { mode: 0o755 })
    await chmod(child, 0o755)
    await chmod(replacement, 0o755)
    let replacementAfterSwap = null
    await assert.rejects(
      ensurePrivateDirectory(child, {
        parentGuard,
        hooks: {
          beforeDescriptorDirectoryOpen: async () => {
            await rename(child, moved)
            await rename(replacement, child)
            replacementAfterSwap = await stat(child)
          },
        },
      }),
      (error) => error.code === "FILESYSTEM_DIRECTORY_REPLACED",
    )
    const after = await stat(child)
    assert.equal(after.dev, replacementAfterSwap.dev)
    assert.equal(after.ino, replacementAfterSwap.ino)
    assert.equal(after.mode, replacementAfterSwap.mode)
    assert.equal(after.nlink, replacementAfterSwap.nlink)
    assert.equal(after.ctimeMs, replacementAfterSwap.ctimeMs)
  }
})

test("descriptor-open directory swaps reject before chmod or fsync", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-dir-mutation-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const parentGuard = await ensurePrivateDirectory(directory)

  for (let round = 0; round < 8; round += 1) {
    const child = path.join(directory, `child-${round}`)
    const replacement = path.join(directory, `replacement-${round}`)
    const moved = path.join(directory, `moved-${round}`)
    await mkdir(child, { mode: 0o755 })
    await mkdir(replacement, { mode: 0o755 })
    await chmod(child, 0o755)
    await chmod(replacement, 0o755)
    let replacementAfterSwap = null
    await assert.rejects(
      ensurePrivateDirectory(child, {
        parentGuard,
        hooks: {
          beforeDescriptorDirectoryMutation: async () => {
            await delay(30)
            await rename(child, moved)
            await rename(replacement, child)
            replacementAfterSwap = await stat(child)
          },
        },
      }),
      (error) => error.code === "FILESYSTEM_DIRECTORY_REPLACED",
    )
    const after = await stat(child)
    assert.equal(after.dev, replacementAfterSwap.dev)
    assert.equal(after.ino, replacementAfterSwap.ino)
    assert.equal(after.mode, replacementAfterSwap.mode)
    assert.equal(after.nlink, replacementAfterSwap.nlink)
    assert.equal(after.ctimeMs, replacementAfterSwap.ctimeMs)
  }
})

test("dead reapers recover while live and ambiguous owners remain fail-closed", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-state-reaper-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new StateStore(options(directory))
  const state = await store.load()
  const reaperPath = `${store.stateLockPath}.reaper`

  await writeFile(
    reaperPath,
    `${JSON.stringify({ token: "dead-reaper", pid: 2_147_483_647, acquiredAt: "2000-01-01T00:00:00.000Z" })}\n`,
    { mode: 0o600 },
  )
  state.status = "needs_review"
  await store.save(state)
  assert.equal((await store.load()).status, "needs_review")

  await writeFile(
    reaperPath,
    `${JSON.stringify({ token: "live-reaper", pid: process.pid, acquiredAt: "2000-01-01T00:00:00.000Z" })}\n`,
    { mode: 0o600 },
  )
  state.status = "running"
  await assert.rejects(
    store.save(state),
    (error) =>
      error.code === "LEASE_OWNER_AMBIGUOUS" &&
      /stop the recorded process/.test(error.recovery),
  )
  assert.equal((await stat(reaperPath)).isFile(), true)
  await unlink(reaperPath)

  await writeFile(reaperPath, "{malformed", { mode: 0o600 })
  await assert.rejects(
    store.save(state),
    (error) =>
      error.code === "FILE_LEASE_METADATA_MALFORMED" &&
      /remove only this malformed marker/.test(error.recovery),
  )
  await unlink(reaperPath)

  await writeFile(
    reaperPath,
    `${JSON.stringify({
      schemaVersion: 2,
      token: "incomplete-v2-reaper",
      pid: 2_147_483_647,
      acquiredAt: "2000-01-01T00:00:00.000Z",
    })}\n`,
    { mode: 0o600 },
  )
  await assert.rejects(
    store.save(state),
    (error) =>
      error.code === "FILE_LEASE_METADATA_INVALID" &&
      /remove only this invalid marker/.test(error.recovery),
  )
  await unlink(reaperPath)
  await store.save(state)
})

test("PID-reuse-like lease evidence is reclaimed only with a distinct durable identity", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-state-pid-reuse-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new StateStore({
    ...options(directory),
    isProcessAlive: () => true,
    getProcessIdentity: async (pid) =>
      pid === process.pid ? "current-owner" : "reused-process",
  })
  const state = await store.load()
  await writeFile(
    `${store.stateLockPath}.reaper`,
    `${JSON.stringify({
      schemaVersion: 2,
      token: "00000000-0000-4000-8000-000000000001",
      pid: 987_654,
      processIdentity: "original-process",
      acquiredAt: "2000-01-01T00:00:00.000Z",
    })}\n`,
    { mode: 0o600 },
  )
  state.status = "needs_review"
  await store.save(state)
  assert.equal((await store.load()).status, "needs_review")

  const samePid = await store.load()
  await writeFile(
    `${store.stateLockPath}.reaper`,
    `${JSON.stringify({
      schemaVersion: 2,
      token: "00000000-0000-4000-8000-000000000004",
      pid: process.pid,
      processIdentity: "previous-process-with-reused-pid",
      acquiredAt: "2000-01-01T00:00:00.000Z",
    })}\n`,
    { mode: 0o600 },
  )
  samePid.status = "running"
  await store.save(samePid)
  assert.equal((await store.load()).status, "running")
})

test("takeover crash phases converge without stealing or duplicating state", async (t) => {
  const phases = [
    "afterAdvisoryAcquire",
    "afterLeaseMarkerRemoved",
    "afterLeaseCandidateSynced",
    "afterLeaseRecordCreated",
  ]
  for (const phase of phases) {
    await t.test(phase, async () => {
      const directory = await mkdtemp(
        path.join(os.tmpdir(), `koalafrog-state-takeover-${phase}-`),
      )
      t.after(() => rm(directory, { recursive: true, force: true }))
      const baseline = new StateStore(options(directory))
      const state = await baseline.load()
      if (phase === "afterLeaseMarkerRemoved") {
        await writeFile(
          `${baseline.stateLockPath}.reaper`,
          `${JSON.stringify({ token: "dead-reaper", pid: 2_147_483_647 })}\n`,
          { mode: 0o600 },
        )
      }
      let injected = false
      const crash = new StateStore({
        ...options(directory),
        fileSystemHooks: {
          [phase]: async () => {
            if (injected) return
            injected = true
            throw new Error(`simulated crash at ${phase}`)
          },
        },
      })
      state.status = "running"
      await assert.rejects(crash.save(state), /simulated crash/)

      const restarted = new StateStore(options(directory))
      const recovered = await restarted.load()
      recovered.status = "needs_review"
      await restarted.save(recovered)
      const durable = await restarted.load()
      assert.equal(durable.status, "needs_review")
      assert.equal(durable.stateRevision, 2)
    })
  }
})

test("event and stderr leaf symlinks are rejected without touching outside files", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-state-log-leaf-"))
  const outside = await mkdtemp(path.join(os.tmpdir(), "koalafrog-state-log-outside-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  t.after(() => rm(outside, { recursive: true, force: true }))
  const eventTarget = path.join(outside, "event-target")
  const stderrTarget = path.join(outside, "stderr-target")
  await writeFile(eventTarget, "event-sentinel\n", { mode: 0o600 })
  await writeFile(stderrTarget, "stderr-sentinel\n", { mode: 0o600 })
  const store = new StateStore(options(directory))
  await store.load()
  await symlink(eventTarget, store.eventPath)
  await symlink(stderrTarget, store.stderrPath)

  await assert.rejects(
    store.appendEvent({ type: "must_not_escape" }),
    (error) => error.code === "FILESYSTEM_LEAF_SYMLINK",
  )
  await assert.rejects(
    store.appendStderr("must not escape\n"),
    (error) => error.code === "FILESYSTEM_LEAF_SYMLINK",
  )
  const legacy = JSON.parse(await readFile(store.statePath, "utf8"))
  legacy.schemaVersion = 3
  delete legacy.pendingApprovalRequests
  await writeFile(store.statePath, `${JSON.stringify(legacy, null, 2)}\n`, {
    mode: 0o600,
  })
  await assert.rejects(
    store.load(),
    (error) => error.code === "FILESYSTEM_LEAF_SYMLINK",
  )
  assert.equal(await readFile(eventTarget, "utf8"), "event-sentinel\n")
  assert.equal(await readFile(stderrTarget, "utf8"), "stderr-sentinel\n")
})

test("transaction key symlinks are rejected without touching outside files", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-key-leaf-"))
  const outside = await mkdtemp(path.join(os.tmpdir(), "koalafrog-key-outside-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  t.after(() => rm(outside, { recursive: true, force: true }))
  const target = path.join(outside, "key-target")
  await writeFile(target, "outside-sentinel\n", { mode: 0o600 })
  const store = new StateStore(options(directory))
  const state = await store.load()
  const keyPath = path.join(store.directory, ".durable-transaction.key")
  await unlink(keyPath)
  await symlink(target, keyPath)
  state.status = "needs_review"

  await assert.rejects(
    store.save(state),
    (error) => error.code === "FILESYSTEM_LEAF_SYMLINK",
  )
  assert.equal(await readFile(target, "utf8"), "outside-sentinel\n")
  assert.equal((await readFile(store.statePath, "utf8")).includes('"status": "ready"'), true)
})

test("ambiguous transaction-key hard links never mutate outside inode metadata", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-key-links-"))
  const outside = await mkdtemp(path.join(os.tmpdir(), "koalafrog-key-links-outside-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  t.after(() => rm(outside, { recursive: true, force: true }))

  await t.test("candidate to outside", async () => {
    const store = new StateStore(options(path.join(directory, "candidate")))
    const state = await store.load()
    await unlink(path.join(store.directory, ".durable-transaction.key"))
    const outsideFile = path.join(outside, "candidate-sentinel")
    await writeFile(outsideFile, "candidate-sentinel\n", { mode: 0o600 })
    const candidate = path.join(
      store.directory,
      `.durable-transaction.key.${process.pid}.00000000-0000-4000-8000-000000000021.key-candidate`,
    )
    await link(outsideFile, candidate)
    const before = await stat(outsideFile)
    state.status = "needs_review"
    await assert.rejects(
      store.save(state),
      (error) =>
        error.code === "FILESYSTEM_LEAF_LINK_COUNT" ||
        error.code === "FILESYSTEM_LEAF_LINK_TOPOLOGY",
    )
    const after = await stat(outsideFile)
    assert.equal(await readFile(outsideFile, "utf8"), "candidate-sentinel\n")
    assert.equal(after.mode, before.mode)
    assert.equal(after.nlink, before.nlink)
    assert.equal(after.ctimeMs, before.ctimeMs)
  })

  await t.test("canonical to outside", async () => {
    const store = new StateStore(options(path.join(directory, "canonical")))
    const state = await store.load()
    const keyPath = path.join(store.directory, ".durable-transaction.key")
    const outsideAlias = path.join(outside, "canonical-alias")
    await link(keyPath, outsideAlias)
    const before = await stat(outsideAlias)
    state.status = "needs_review"
    await assert.rejects(
      store.save(state),
      (error) => error.code === "DURABLE_TRANSACTION_KEY_LINKS_AMBIGUOUS",
    )
    const after = await stat(outsideAlias)
    assert.equal(after.mode, before.mode)
    assert.equal(after.nlink, before.nlink)
    assert.equal(after.ctimeMs, before.ctimeMs)
    assert.deepEqual(await readFile(outsideAlias), await readFile(keyPath))
  })

  await t.test("multiple candidate aliases", async () => {
    const store = new StateStore(options(path.join(directory, "aliases")))
    const state = await store.load()
    await unlink(path.join(store.directory, ".durable-transaction.key"))
    const outsideFile = path.join(outside, "multi-sentinel")
    await writeFile(outsideFile, "multi-sentinel\n", { mode: 0o600 })
    for (const suffix of ["22", "23"]) {
      await link(
        outsideFile,
        path.join(
          store.directory,
          `.durable-transaction.key.${process.pid}.00000000-0000-4000-8000-0000000000${suffix}.key-candidate`,
        ),
      )
    }
    const before = await stat(outsideFile)
    state.status = "needs_review"
    await assert.rejects(
      store.save(state),
      (error) => error.code === "FILESYSTEM_LEAF_LINK_COUNT",
    )
    const after = await stat(outsideFile)
    assert.equal(after.mode, before.mode)
    assert.equal(after.nlink, before.nlink)
    assert.equal(after.ctimeMs, before.ctimeMs)
    assert.equal(await readFile(outsideFile, "utf8"), "multi-sentinel\n")
  })
})

test("a genuine transaction-key publication artifact is normalized exactly once", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-key-owned-link-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const first = new StateStore(options(directory))
  const initial = await first.load()
  const keyPath = path.join(first.directory, ".durable-transaction.key")
  const candidate = path.join(
    first.directory,
    `.durable-transaction.key.${process.pid}.00000000-0000-4000-8000-000000000024.key-candidate`,
  )
  await link(keyPath, candidate)
  assert.equal((await stat(keyPath)).nlink, 2)

  const second = new StateStore(options(directory))
  const firstUpdate = structuredClone(initial)
  const secondUpdate = structuredClone(initial)
  firstUpdate.status = "needs_review"
  secondUpdate.status = "needs_owner"
  const saves = await Promise.allSettled([
    first.save(firstUpdate),
    second.save(secondUpdate),
  ])
  assert.equal(saves.filter((result) => result.status === "fulfilled").length, 1)
  assert.equal(saves.filter((result) => result.status === "rejected").length, 1)
  assert.equal((await stat(keyPath)).nlink, 1)
  await assert.rejects(stat(candidate), (error) => error.code === "ENOENT")
})

test("state, pending, lock, and takeover leaf replacement races fail closed", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-state-leaf-race-"))
  const outside = await mkdtemp(path.join(os.tmpdir(), "koalafrog-state-leaf-race-outside-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  t.after(() => rm(outside, { recursive: true, force: true }))
  const target = path.join(outside, "target")
  await writeFile(target, "outside-sentinel\n", { mode: 0o600 })
  const baseline = new StateStore(options(directory))
  let state = await baseline.load()

  const pendingPath = path.join(
    baseline.directory,
    `.${path.basename(baseline.statePath)}.commit-pending`,
  )
  await symlink(target, pendingPath)
  state.status = "needs_review"
  await assert.rejects(
    baseline.save(state),
    (error) => error.code === "FILESYSTEM_LEAF_SYMLINK",
  )
  await unlink(pendingPath)

  let temporaryPath = null
  const tempRace = new StateStore({
    ...options(directory),
    fileSystemHooks: {
      afterTemporaryFileSynced: async ({ leafName, temporaryLeafName }) => {
        if (temporaryPath || leafName !== "state.json") return
        temporaryPath = path.join(baseline.directory, temporaryLeafName)
        await unlink(temporaryPath)
        await symlink(target, temporaryPath)
      },
    },
  })
  state = await baseline.load()
  state.status = "needs_owner"
  await assert.rejects(
    tempRace.save(state),
    (error) => error.code === "FILESYSTEM_LEAF_SYMLINK",
  )
  assert.equal(await readFile(target, "utf8"), "outside-sentinel\n")
  await unlink(temporaryPath)

  let replaced = false
  const racing = new StateStore({
    ...options(directory),
    fileSystemHooks: {
      beforeRename: async ({ phase, leafName }) => {
        if (replaced || phase !== "commit" || leafName !== "state.json") return
        replaced = true
        await unlink(baseline.statePath)
        await symlink(target, baseline.statePath)
      },
    },
  })
  state = await racing.load()
  const predecessorContents = await readFile(baseline.statePath)
  state.status = "running"
  await assert.rejects(
    racing.save(state),
    (error) =>
      error instanceof DurableCommitPendingError &&
      error.cause?.code === "FILESYSTEM_LEAF_SYMLINK",
  )
  assert.equal(await readFile(target, "utf8"), "outside-sentinel\n")
  await unlink(baseline.statePath)
  await assert.rejects(
    baseline.load(),
    (error) =>
      error instanceof DurableTransactionError &&
      error.code === "DURABLE_TRANSACTION_EVIDENCE_CONFLICT",
  )
  for (const entry of await readdir(baseline.directory)) {
    if (
      entry === ".state.json.commit-pending" ||
      (/^\.state\.json\..+\.tmp$/.test(entry))
    ) {
      await unlink(path.join(baseline.directory, entry))
    }
  }
  await writeFile(baseline.statePath, predecessorContents, { mode: 0o600 })

  await symlink(target, baseline.stateLockPath)
  await assert.rejects(
    baseline.load(),
    (error) => error.code === "FILESYSTEM_LEAF_SYMLINK",
  )
  await unlink(baseline.stateLockPath)

  let guardReplaced = false
  const guardRace = new StateStore({
    ...options(directory),
    fileSystemHooks: {
      afterAdvisoryAcquire: async ({ leafName }) => {
        if (guardReplaced || leafName !== ".state-write.lock.takeover") return
        guardReplaced = true
        const guardPath = path.join(baseline.directory, leafName)
        await unlink(guardPath)
        await symlink(target, guardPath)
      },
    },
  })
  await assert.rejects(
    guardRace.load(),
    (error) => error.code === "FILESYSTEM_LEAF_SYMLINK",
  )
  assert.equal(await readFile(target, "utf8"), "outside-sentinel\n")

  await unlink(path.join(baseline.directory, ".state-write.lock.takeover"))
  let preGuardReplaced = false
  const preGuardRace = new StateStore({
    ...options(directory),
    fileSystemHooks: {
      beforeAdvisoryAcquire: async ({ leafName }) => {
        if (preGuardReplaced || leafName !== ".state-write.lock.takeover") return
        preGuardReplaced = true
        const guardPath = path.join(baseline.directory, leafName)
        await unlink(guardPath)
        await symlink(target, guardPath)
      },
    },
  })
  await assert.rejects(
    preGuardRace.load(),
    (error) => error.code === "FILESYSTEM_LEAF_SYMLINK",
  )
  assert.equal(await readFile(target, "utf8"), "outside-sentinel\n")
})

test("state transaction journals reject stale and forged authorization state", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-state-journal-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const baseline = new StateStore(options(directory))
  const pendingPath = path.join(baseline.directory, ".state.json.commit-pending")
  let state = await baseline.load()
  let injected = false
  const interrupted = new StateStore({
    ...options(directory),
    fileSystemHooks: {
      beforeDirectorySync: async ({ phase, leafName }) => {
        if (injected || phase !== "commit" || leafName !== "state.json") return
        injected = true
        throw new Error("injected post-rename uncertainty")
      },
    },
  })
  state.status = "needs_review"
  await assert.rejects(
    interrupted.save(state),
    (error) => error.code === "DURABLE_COMMIT_PENDING",
  )
  const staleJournal = await readFile(pendingPath)
  const interruptedCandidate = path.join(
    baseline.directory,
    `..state.json.commit-pending.${process.pid}.00000000-0000-4000-8000-000000000004.journal-candidate`,
  )
  await link(pendingPath, interruptedCandidate)
  assert.equal((await stat(pendingPath)).nlink, 2)
  assert.equal((await baseline.load()).status, "needs_review")
  await assert.rejects(
    stat(interruptedCandidate),
    (error) => error.code === "ENOENT",
  )

  state = await baseline.load()
  state.status = "needs_owner"
  await baseline.save(state)
  const protectedContents = await readFile(baseline.statePath)

  const otherStore = new StateStore({
    stateDirectory: directory,
    repository,
    issueNumber: 64,
  })
  await otherStore.load()
  const otherContents = await readFile(otherStore.statePath)
  const otherPendingPath = path.join(
    otherStore.directory,
    ".state.json.commit-pending",
  )
  await writeFile(otherPendingPath, staleJournal, { mode: 0o600 })
  await assert.rejects(
    otherStore.load(),
    (error) =>
      error instanceof DurableTransactionError &&
      error.code === "DURABLE_TRANSACTION_JOURNAL_INVALID",
  )
  assert.deepEqual(await readFile(otherStore.statePath), otherContents)

  const tamperedJournal = JSON.parse(staleJournal.toString("utf8"))
  tamperedJournal.successor.semanticIdentity.revision = 777
  await writeFile(pendingPath, `${JSON.stringify(tamperedJournal)}\n`, {
    mode: 0o600,
  })
  await assert.rejects(
    baseline.load(),
    (error) =>
      error instanceof DurableTransactionError &&
      error.code === "DURABLE_TRANSACTION_JOURNAL_INVALID",
  )
  assert.deepEqual(await readFile(baseline.statePath), protectedContents)
  await unlink(pendingPath)

  await writeFile(pendingPath, staleJournal, { mode: 0o600 })
  const duplicateOne = path.join(
    baseline.directory,
    `..state.json.commit-pending.${process.pid}.00000000-0000-4000-8000-000000000005.journal-candidate`,
  )
  const duplicateTwo = path.join(
    baseline.directory,
    `..state.json.commit-pending.${process.pid}.00000000-0000-4000-8000-000000000006.journal-candidate`,
  )
  await link(pendingPath, duplicateOne)
  await link(pendingPath, duplicateTwo)
  await assert.rejects(
    baseline.load(),
    (error) =>
      error instanceof DurableTransactionError &&
      error.code === "DURABLE_TRANSACTION_JOURNAL_LINKS_AMBIGUOUS",
  )
  assert.deepEqual(await readFile(baseline.statePath), protectedContents)
  await unlink(duplicateOne)
  await unlink(duplicateTwo)
  await assert.rejects(
    baseline.load(),
    (error) =>
      error instanceof DurableTransactionError &&
      error.code === "DURABLE_TRANSACTION_EVIDENCE_CONFLICT",
  )
  assert.deepEqual(await readFile(baseline.statePath), protectedContents)
  await unlink(pendingPath)

  const forged = JSON.parse(protectedContents.toString("utf8"))
  forged.status = "running"
  forged.stateRevision = 777
  await writeFile(pendingPath, `${JSON.stringify(forged)}\n`, { mode: 0o600 })
  await assert.rejects(
    baseline.load(),
    (error) =>
      error instanceof DurableTransactionError &&
      error.code === "DURABLE_TRANSACTION_JOURNAL_INVALID",
  )
  assert.deepEqual(await readFile(baseline.statePath), protectedContents)
})

test("durable replacement failures are pre-commit or explicitly recoverable", async (t) => {
  const preCommitHooks = ["beforeFileChmod", "beforeFileSync"]
  for (const hookName of preCommitHooks) {
    await t.test(hookName, async () => {
      const directory = await mkdtemp(
        path.join(os.tmpdir(), `koalafrog-state-${hookName}-`),
      )
      t.after(() => rm(directory, { recursive: true, force: true }))
      const baseline = new StateStore(options(directory))
      const state = await baseline.load()
      const before = await readFile(baseline.statePath)
      let injected = false
      const failing = new StateStore({
        ...options(directory),
        fileSystemHooks: {
          [hookName]: async ({ leafName, phase }) => {
            if (injected || leafName !== "state.json" || phase === "append") return
            injected = true
            throw new Error(`injected ${hookName}`)
          },
        },
      })
      state.status = "running"
      await assert.rejects(failing.save(state), new RegExp(`injected ${hookName}`))
      assert.deepEqual(await readFile(baseline.statePath), before)
      assert.equal((await baseline.load()).status, "ready")
    })
  }

  for (const failure of ["rename", "prepare_sync", "commit_sync"]) {
    await t.test(failure, async () => {
      const directory = await mkdtemp(
        path.join(os.tmpdir(), `koalafrog-state-${failure}-`),
      )
      t.after(() => rm(directory, { recursive: true, force: true }))
      const baseline = new StateStore(options(directory))
      const state = await baseline.load()
      let injected = false
      const hooks = {
        beforeRename: async ({ phase, leafName }) => {
          if (failure !== "rename" || injected || phase !== "commit" || leafName !== "state.json") return
          injected = true
          throw new Error("injected rename")
        },
        beforeDirectorySync: async ({ phase, leafName }) => {
          const expected = failure === "prepare_sync" ? "prepare" : "commit"
          if (!failure.endsWith("sync") || injected || phase !== expected || leafName !== "state.json") return
          injected = true
          throw new Error(`injected ${failure}`)
        },
      }
      const failing = new StateStore({ ...options(directory), fileSystemHooks: hooks })
      state.status = "needs_review"
      await assert.rejects(
        failing.save(state),
        (error) =>
          error.code === "DURABLE_COMMIT_PENDING" &&
          /injected/.test(error.cause?.message ?? ""),
      )
      const recovered = await baseline.load()
      assert.equal(recovered.status, "needs_review")
      assert.equal(recovered.stateRevision, 2)
    })
  }
})

test("task-directory replacement during commit is detected before rename", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-state-dir-race-"))
  const outside = await mkdtemp(path.join(os.tmpdir(), "koalafrog-state-dir-race-outside-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  t.after(() => rm(outside, { recursive: true, force: true }))
  const sentinel = path.join(outside, "sentinel")
  await writeFile(sentinel, "outside-sentinel\n", { mode: 0o600 })
  const baseline = new StateStore(options(directory))
  const state = await baseline.load()
  const moved = `${baseline.directory}.moved`
  let replaced = false
  const racing = new StateStore({
    ...options(directory),
    fileSystemHooks: {
      beforeRename: async ({ phase, leafName }) => {
        if (replaced || phase !== "commit" || leafName !== "state.json") return
        replaced = true
        await rename(baseline.directory, moved)
        await symlink(outside, baseline.directory)
      },
    },
  })
  state.status = "needs_review"
  await assert.rejects(
    racing.save(state),
    (error) =>
      error.code === "DURABLE_COMMIT_PENDING" &&
      error.cause?.code === "FILESYSTEM_DIRECTORY_REPLACED",
  )
  assert.equal(await readFile(sentinel, "utf8"), "outside-sentinel\n")
  await unlink(baseline.directory)
  await rename(moved, baseline.directory)
  assert.equal((await baseline.load()).status, "needs_review")
})

test("revision ceiling never persists a value the loader rejects", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "koalafrog-state-revision-max-"))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new StateStore(options(directory))
  let state = await store.load()
  let durable = JSON.parse(await readFile(store.statePath, "utf8"))
  durable.stateRevision = Number.MAX_SAFE_INTEGER - 1
  await writeFile(store.statePath, `${JSON.stringify(durable, null, 2)}\n`, {
    mode: 0o600,
  })
  state = await store.load()
  state.status = "needs_review"
  await store.save(state)
  assert.equal(state.stateRevision, Number.MAX_SAFE_INTEGER)
  const atMaximum = await readFile(store.statePath)
  const loaded = await store.load()
  loaded.status = "running"
  await assert.rejects(
    store.save(loaded),
    (error) =>
      error instanceof StateRevisionOverflowError &&
      error.code === "STATE_REVISION_OVERFLOW",
  )
  assert.deepEqual(await readFile(store.statePath), atMaximum)
  assert.equal(loaded.stateRevision, Number.MAX_SAFE_INTEGER)
})

test("durable turn failure events are idempotent and conflict-safe", async (t) => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "koalafrog-state-turn-failure-"),
  )
  t.after(() => rm(directory, { recursive: true, force: true }))
  const store = new StateStore(options(directory))
  await store.load()
  const eventId = "turn_failed:thread-1:turn-1"
  const event = {
    type: "turn_failed",
    eventId,
    errorClass: "AppServerTurnError",
    code: "APP_SERVER_TURN_ERROR",
    category: "cyberPolicy",
    codexErrorInfo: "cyberPolicy",
    willRetry: false,
    threadId: "thread-1",
    turnId: "turn-1",
  }

  assert.equal((await store.appendEventOnce(eventId, event)).created, true)
  assert.equal((await store.appendEventOnce(eventId, event)).created, false)
  assert.equal((await store.findEvent(eventId)).turnId, "turn-1")
  await assert.rejects(
    store.appendEventOnce(eventId, { ...event, willRetry: true }),
    (error) => error.code === "EVENT_ID_CONFLICT",
  )
  const events = (await readFile(store.eventPath, "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse)
  assert.equal(events.filter((candidate) => candidate.eventId === eventId).length, 1)
})
