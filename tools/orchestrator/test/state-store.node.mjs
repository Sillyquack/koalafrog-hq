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
import {
  StateRevisionConflictError,
  StateRevisionOverflowError,
  StateStore,
} from "../src/state-store.mjs"
import { DurableCommitPendingError } from "../src/durable-filesystem.mjs"
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
  state.status = "running"
  await assert.rejects(
    racing.save(state),
    (error) =>
      error instanceof DurableCommitPendingError &&
      error.cause?.code === "FILESYSTEM_LEAF_SYMLINK",
  )
  assert.equal(await readFile(target, "utf8"), "outside-sentinel\n")
  await unlink(baseline.statePath)
  assert.equal((await baseline.load()).status, "running")

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
