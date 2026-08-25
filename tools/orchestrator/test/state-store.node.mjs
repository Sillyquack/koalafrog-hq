import assert from "node:assert/strict"
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import {
  StateRevisionConflictError,
  StateStore,
} from "../src/state-store.mjs"
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
  await assert.rejects(store.load(), /escapes the configured state root/)
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
