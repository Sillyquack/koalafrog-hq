import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { constants } from "node:fs"
import {
  link,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  unlink,
} from "node:fs/promises"
import path from "node:path"

const activeLeaseTokens = new Set()
const durablePendingSuffix = ".commit-pending"
const currentProcessIdentity = `node-process:${randomUUID()}`

export class UnsafeFilesystemShapeError extends Error {
  constructor(code, leafName) {
    super(`Unsafe durable filesystem shape (${code}) for ${leafName}`)
    this.name = "UnsafeFilesystemShapeError"
    this.code = code
    this.leafName = leafName
  }
}

export class DurableCommitPendingError extends Error {
  constructor({ leafName, phase, cause = null }) {
    super(`Durable replacement requires recovery for ${leafName} at ${phase}`)
    this.name = "DurableCommitPendingError"
    this.code = "DURABLE_COMMIT_PENDING"
    this.leafName = leafName
    this.phase = phase
    if (cause) this.cause = cause
  }
}

export class FileLeaseMetadataError extends Error {
  constructor({ code, leafName, recovery, cause = null }) {
    super(`File lease metadata is not safely recoverable (${code}) for ${leafName}`)
    this.name = "FileLeaseMetadataError"
    this.code = code
    this.leafName = leafName
    this.recovery = recovery
    if (cause) this.cause = cause
  }
}

function requireNoFollowSupport() {
  if (
    !Number.isInteger(constants.O_NOFOLLOW) ||
    !Number.isInteger(constants.O_DIRECTORY)
  ) {
    throw new UnsafeFilesystemShapeError(
      "FILESYSTEM_NOFOLLOW_UNSUPPORTED",
      "filesystem",
    )
  }
}

function safeLeafName(leafName) {
  if (
    typeof leafName !== "string" ||
    !leafName ||
    leafName === "." ||
    leafName === ".." ||
    path.basename(leafName) !== leafName ||
    leafName.includes("\0")
  ) {
    throw new UnsafeFilesystemShapeError("FILESYSTEM_LEAF_INVALID", "leaf")
  }
  return leafName
}

function leafPath(directoryGuard, leafName) {
  return path.join(directoryGuard.path, safeLeafName(leafName))
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino
}

async function callHook(hooks, name, context) {
  if (typeof hooks?.[name] === "function") await hooks[name](context)
}

async function statRegularLeaf(
  directoryGuard,
  leafName,
  { allowMissing = false, allowMultipleLinks = false } = {},
) {
  const filePath = leafPath(directoryGuard, leafName)
  try {
    const info = await lstat(filePath)
    if (info.isSymbolicLink()) {
      throw new UnsafeFilesystemShapeError("FILESYSTEM_LEAF_SYMLINK", leafName)
    }
    if (!info.isFile()) {
      throw new UnsafeFilesystemShapeError("FILESYSTEM_LEAF_NOT_REGULAR", leafName)
    }
    if (!allowMultipleLinks && info.nlink !== 1) {
      throw new UnsafeFilesystemShapeError("FILESYSTEM_LEAF_LINK_COUNT", leafName)
    }
    return info
  } catch (error) {
    if (allowMissing && error.code === "ENOENT") return null
    throw error
  }
}

export async function ensurePrivateDirectory(
  directory,
  { parentGuard = null } = {},
) {
  requireNoFollowSupport()
  const resolved = path.resolve(directory)
  let existed = true
  try {
    await lstat(resolved)
  } catch (error) {
    if (error.code !== "ENOENT") throw error
    existed = false
  }
  await mkdir(resolved, { recursive: true, mode: 0o700 })
  const info = await lstat(resolved)
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new UnsafeFilesystemShapeError(
      "FILESYSTEM_DIRECTORY_UNSAFE",
      path.basename(resolved),
    )
  }
  const canonical = await realpath(resolved)
  if (parentGuard) {
    await assertDirectoryStable(parentGuard)
    if (canonical !== path.join(parentGuard.canonicalPath, path.basename(resolved))) {
      throw new UnsafeFilesystemShapeError(
        "FILESYSTEM_DIRECTORY_ESCAPE",
        path.basename(resolved),
      )
    }
  }
  const handle = await open(
    canonical,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  )
  try {
    const descriptor = await handle.stat()
    if (!descriptor.isDirectory() || !sameIdentity(info, descriptor)) {
      throw new UnsafeFilesystemShapeError(
        "FILESYSTEM_DIRECTORY_REPLACED",
        path.basename(resolved),
      )
    }
    await handle.chmod(0o700)
    await handle.sync()
  } finally {
    await handle.close()
  }
  const guard = {
    path: resolved,
    canonicalPath: canonical,
    dev: info.dev,
    ino: info.ino,
  }
  if (!existed && parentGuard) {
    await syncDirectory(parentGuard, {
      phase: "directory_create",
      leafName: path.basename(resolved),
    })
  }
  return guard
}

export async function assertDirectoryStable(directoryGuard) {
  const info = await lstat(directoryGuard.path)
  if (
    info.isSymbolicLink() ||
    !info.isDirectory() ||
    info.dev !== directoryGuard.dev ||
    info.ino !== directoryGuard.ino ||
    (await realpath(directoryGuard.path)) !== directoryGuard.canonicalPath
  ) {
    throw new UnsafeFilesystemShapeError(
      "FILESYSTEM_DIRECTORY_REPLACED",
      path.basename(directoryGuard.path),
    )
  }
}

export async function syncDirectory(
  directoryGuard,
  { hooks = null, phase = "directory_sync", leafName = "directory" } = {},
) {
  await callHook(hooks, "beforeDirectorySync", { phase, leafName })
  await assertDirectoryStable(directoryGuard)
  const handle = await open(
    directoryGuard.canonicalPath,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  )
  try {
    const info = await handle.stat()
    if (
      !info.isDirectory() ||
      info.dev !== directoryGuard.dev ||
      info.ino !== directoryGuard.ino
    ) {
      throw new UnsafeFilesystemShapeError(
        "FILESYSTEM_DIRECTORY_REPLACED",
        path.basename(directoryGuard.path),
      )
    }
    await handle.sync()
  } finally {
    await handle.close()
  }
  await assertDirectoryStable(directoryGuard)
}

async function openExistingLeaf(
  directoryGuard,
  leafName,
  { allowMissing = false, allowMultipleLinks = false } = {},
) {
  await assertDirectoryStable(directoryGuard)
  const before = await statRegularLeaf(directoryGuard, leafName, {
    allowMissing,
    allowMultipleLinks,
  })
  if (!before) return null
  let handle
  try {
    handle = await open(
      leafPath(directoryGuard, leafName),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    )
  } catch (error) {
    if (allowMissing && error.code === "ENOENT") return null
    throw error
  }
  try {
    const descriptor = await handle.stat()
    if (
      !descriptor.isFile() ||
      (!allowMultipleLinks && descriptor.nlink !== 1) ||
      !sameIdentity(before, descriptor)
    ) {
      throw new UnsafeFilesystemShapeError("FILESYSTEM_LEAF_REPLACED", leafName)
    }
    const after = await statRegularLeaf(directoryGuard, leafName, {
      allowMultipleLinks,
    })
    if (!sameIdentity(descriptor, after)) {
      throw new UnsafeFilesystemShapeError("FILESYSTEM_LEAF_REPLACED", leafName)
    }
    return handle
  } catch (error) {
    await handle.close().catch(() => {})
    throw error
  }
}

export async function readFileNoFollow(
  directoryGuard,
  leafName,
  { allowMissing = false, allowMultipleLinks = false } = {},
) {
  const handle = await openExistingLeaf(directoryGuard, leafName, {
    allowMissing,
    allowMultipleLinks,
  })
  if (!handle) return null
  try {
    return await handle.readFile()
  } finally {
    await handle.close()
  }
}

export async function readJsonNoFollow(
  directoryGuard,
  leafName,
  options = {},
) {
  const contents = await readFileNoFollow(directoryGuard, leafName, options)
  if (contents === null) return null
  return JSON.parse(contents.toString("utf8"))
}

export async function appendFileNoFollow(
  directoryGuard,
  leafName,
  contents,
  { hooks = null } = {},
) {
  await assertDirectoryStable(directoryGuard)
  const before = await statRegularLeaf(directoryGuard, leafName, {
    allowMissing: true,
  })
  const flags =
    constants.O_WRONLY |
    constants.O_CREAT |
    constants.O_APPEND |
    constants.O_NOFOLLOW
  const handle = await open(leafPath(directoryGuard, leafName), flags, 0o600)
  try {
    const descriptor = await handle.stat()
    if (!descriptor.isFile() || descriptor.nlink !== 1) {
      throw new UnsafeFilesystemShapeError("FILESYSTEM_LEAF_NOT_REGULAR", leafName)
    }
    const after = await statRegularLeaf(directoryGuard, leafName)
    if (!sameIdentity(descriptor, after)) {
      throw new UnsafeFilesystemShapeError("FILESYSTEM_LEAF_REPLACED", leafName)
    }
    await callHook(hooks, "beforeFileChmod", { phase: "append", leafName })
    await handle.chmod(0o600)
    if (!before) {
      await handle.sync()
      await syncDirectory(directoryGuard, {
        hooks,
        phase: "append_create",
        leafName,
      })
    }
    await callHook(hooks, "beforeAppendWrite", { leafName })
    const finalLeaf = await statRegularLeaf(directoryGuard, leafName)
    if (!sameIdentity(descriptor, finalLeaf)) {
      throw new UnsafeFilesystemShapeError("FILESYSTEM_LEAF_REPLACED", leafName)
    }
    await handle.writeFile(contents)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function unlinkRegularLeaf(
  directoryGuard,
  leafName,
  { allowMissing = false, allowMultipleLinks = false, sync = false, hooks = null } = {},
) {
  const info = await statRegularLeaf(directoryGuard, leafName, {
    allowMissing,
    allowMultipleLinks,
  })
  if (!info) return false
  await assertDirectoryStable(directoryGuard)
  await unlink(leafPath(directoryGuard, leafName))
  if (sync) {
    await syncDirectory(directoryGuard, {
      hooks,
      phase: "unlink",
      leafName,
    })
  }
  return true
}

function pendingLeafName(leafName) {
  return `.${safeLeafName(leafName)}${durablePendingSuffix}`
}

function temporaryLeafName(leafName) {
  return `.${safeLeafName(leafName)}.${process.pid}.${randomUUID()}.tmp`
}

async function cleanupPendingAfterDurableCommit(
  directoryGuard,
  leafName,
  { hooks = null } = {},
) {
  const pending = pendingLeafName(leafName)
  try {
    if (
      await unlinkRegularLeaf(directoryGuard, pending, {
        allowMissing: true,
        allowMultipleLinks: true,
      })
    ) {
      await syncDirectory(directoryGuard, {
        hooks,
        phase: "pending_cleanup",
        leafName,
      }).catch(() => {})
    }
  } catch {
    // The destination was already directory-synced. A retained pending link is
    // safe and will be reconciled before the next read or replacement.
  }
}

export async function recoverDurableFileReplace(
  directoryGuard,
  leafName,
  { hooks = null } = {},
) {
  const pending = pendingLeafName(leafName)
  const pendingContents = await readFileNoFollow(directoryGuard, pending, {
    allowMissing: true,
    allowMultipleLinks: true,
  })
  if (pendingContents === null) return false

  const current = await readFileNoFollow(directoryGuard, leafName, {
    allowMissing: true,
    allowMultipleLinks: true,
  })
  if (!current || !current.equals(pendingContents)) {
    const recoveryTemp = temporaryLeafName(leafName)
    try {
      await assertDirectoryStable(directoryGuard)
      const pendingInfo = await statRegularLeaf(directoryGuard, pending, {
        allowMultipleLinks: true,
      })
      await link(
        leafPath(directoryGuard, pending),
        leafPath(directoryGuard, recoveryTemp),
      )
      const recoveryInfo = await statRegularLeaf(
        directoryGuard,
        recoveryTemp,
        { allowMultipleLinks: true },
      )
      if (!sameIdentity(pendingInfo, recoveryInfo)) {
        throw new UnsafeFilesystemShapeError(
          "FILESYSTEM_LEAF_REPLACED",
          recoveryTemp,
        )
      }
      await callHook(hooks, "beforeRename", {
        phase: "recovery",
        leafName,
      })
      await statRegularLeaf(directoryGuard, leafName, {
        allowMissing: true,
        allowMultipleLinks: true,
      })
      await assertDirectoryStable(directoryGuard)
      await rename(
        leafPath(directoryGuard, recoveryTemp),
        leafPath(directoryGuard, leafName),
      )
      await syncDirectory(directoryGuard, {
        hooks,
        phase: "recovery_commit",
        leafName,
      })
    } catch (error) {
      throw new DurableCommitPendingError({
        leafName,
        phase: "recovery_commit",
        cause: error,
      })
    } finally {
      await unlinkRegularLeaf(directoryGuard, recoveryTemp, {
        allowMissing: true,
        allowMultipleLinks: true,
      }).catch(() => {})
    }
  } else {
    await syncDirectory(directoryGuard, {
      hooks,
      phase: "recovery_confirm",
      leafName,
    })
  }
  await cleanupPendingAfterDurableCommit(directoryGuard, leafName, { hooks })
  return true
}

export async function cleanupOrphanAtomicTemps(directoryGuard, leafName) {
  const prefix = `.${safeLeafName(leafName)}.`
  const currentPattern = /^\.[A-Za-z0-9._-]+\.\d+\.[0-9a-f-]{36}\.tmp$/i
  const legacyPattern = /^[A-Za-z0-9._-]+\.\d+\.[0-9a-f-]{36}\.tmp$/i
  const entries = await readdir(directoryGuard.path)
  for (const entry of entries) {
    if (
      !(
        (entry.startsWith(prefix) && currentPattern.test(entry)) ||
        (entry.startsWith(`${safeLeafName(leafName)}.`) &&
          legacyPattern.test(entry))
      )
    ) {
      continue
    }
    await unlinkRegularLeaf(directoryGuard, entry, {
      allowMissing: true,
      allowMultipleLinks: true,
    })
  }
}

export async function durableAtomicWriteFile(
  directoryGuard,
  leafName,
  contents,
  { hooks = null } = {},
) {
  await recoverDurableFileReplace(directoryGuard, leafName, { hooks })
  await cleanupOrphanAtomicTemps(directoryGuard, leafName)
  await statRegularLeaf(directoryGuard, leafName, { allowMissing: true })

  const temporary = temporaryLeafName(leafName)
  const pending = pendingLeafName(leafName)
  let handle = null
  let temporaryIdentity = null
  let intentCreated = false
  try {
    handle = await open(
      leafPath(directoryGuard, temporary),
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    )
    await callHook(hooks, "beforeFileChmod", {
      phase: "atomic_replace",
      leafName,
    })
    await handle.chmod(0o600)
    await handle.writeFile(contents)
    await callHook(hooks, "beforeFileSync", { leafName })
    await handle.sync()
    temporaryIdentity = await handle.stat()
    await handle.close()
    handle = null

    await callHook(hooks, "afterTemporaryFileSynced", {
      leafName,
      temporaryLeafName: temporary,
    })
    await assertDirectoryStable(directoryGuard)
    const temporaryLeaf = await statRegularLeaf(directoryGuard, temporary)
    if (!sameIdentity(temporaryIdentity, temporaryLeaf)) {
      throw new UnsafeFilesystemShapeError(
        "FILESYSTEM_LEAF_REPLACED",
        temporary,
      )
    }
    await link(
      leafPath(directoryGuard, temporary),
      leafPath(directoryGuard, pending),
    )
    const pendingLeaf = await statRegularLeaf(directoryGuard, pending, {
      allowMultipleLinks: true,
    })
    if (!sameIdentity(temporaryIdentity, pendingLeaf)) {
      throw new UnsafeFilesystemShapeError(
        "FILESYSTEM_LEAF_REPLACED",
        pending,
      )
    }
    intentCreated = true
    await syncDirectory(directoryGuard, {
      hooks,
      phase: "prepare",
      leafName,
    })
    await callHook(hooks, "beforeRename", {
      phase: "commit",
      leafName,
    })
    await statRegularLeaf(directoryGuard, leafName, {
      allowMissing: true,
    })
    await assertDirectoryStable(directoryGuard)
    await rename(
      leafPath(directoryGuard, temporary),
      leafPath(directoryGuard, leafName),
    )
    await syncDirectory(directoryGuard, {
      hooks,
      phase: "commit",
      leafName,
    })
    await cleanupPendingAfterDurableCommit(directoryGuard, leafName, { hooks })
  } catch (error) {
    if (intentCreated) {
      throw error instanceof DurableCommitPendingError
        ? error
        : new DurableCommitPendingError({
            leafName,
            phase: "commit",
            cause: error,
          })
    }
    throw error
  } finally {
    await handle?.close().catch(() => {})
    await unlinkRegularLeaf(directoryGuard, temporary, {
      allowMissing: true,
      allowMultipleLinks: true,
    }).catch(() => {})
  }
}

function validLeaseRecord(record) {
  const schema2 = record?.schemaVersion === 2
  return Boolean(
    record &&
      typeof record === "object" &&
      typeof record.token === "string" &&
      record.token.length > 0 &&
      record.token.length <= 256 &&
      /^[A-Za-z0-9._:-]+$/.test(record.token) &&
      Number.isSafeInteger(record.pid) &&
      record.pid > 0 &&
      (schema2
        ? typeof record.acquiredAt === "string" &&
          Number.isFinite(Date.parse(record.acquiredAt))
        : record.acquiredAt == null ||
          Number.isFinite(Date.parse(record.acquiredAt))) &&
      (record.schemaVersion == null || record.schemaVersion === 2) &&
      (schema2
        ? typeof record.processIdentity === "string" &&
          record.processIdentity.length > 0 &&
          record.processIdentity.length <= 256
        : record.processIdentity == null ||
        (typeof record.processIdentity === "string" &&
          record.processIdentity.length > 0 &&
          record.processIdentity.length <= 256)),
  )
}

async function leaseOwnerDecision(
  record,
  { pid, processIdentity, isProcessAlive, getProcessIdentity },
) {
  if (!validLeaseRecord(record)) return { status: "invalid" }
  if (record.pid === pid) {
    if (
      record.schemaVersion === 2 &&
      record.processIdentity === processIdentity
    ) {
      return {
        status: activeLeaseTokens.has(record.token) ? "live" : "dead",
      }
    }
    return {
      status:
        record.schemaVersion === 2 && record.processIdentity
          ? "dead_pid_reused"
          : "ambiguous",
    }
  }
  if (!isProcessAlive(record.pid)) return { status: "dead" }
  if (record.schemaVersion !== 2 || !record.processIdentity) {
    return { status: "ambiguous" }
  }
  const observedIdentity = await getProcessIdentity(record.pid)
  if (!observedIdentity) return { status: "ambiguous" }
  return {
    status:
      observedIdentity === record.processIdentity ? "live" : "dead_pid_reused",
  }
}

function defaultLockfSpec() {
  if (process.platform === "darwin") {
    return {
      command: "/bin/sh",
      args: [
        "-c",
        "/usr/bin/lockf -s -t 0 3 || exit $?; " +
          '/usr/bin/stat -Lf "READY %d %i" /dev/fd/3; ' +
          "/bin/cat >/dev/null",
        "koalafrog-lockf-fd",
      ],
      busyCodes: new Set([75]),
    }
  }
  if (process.platform === "linux") {
    return {
      command: "/bin/sh",
      args: [
        "-c",
        "/usr/bin/flock -n 3 || exit $?; " +
          '/usr/bin/stat -Lc "READY %d %i" /proc/self/fd/3; ' +
          "/bin/cat >/dev/null",
        "koalafrog-flock-fd",
      ],
      busyCodes: new Set([1]),
    }
  }
  throw new UnsafeFilesystemShapeError(
    "FILESYSTEM_ADVISORY_LOCK_UNSUPPORTED",
    path.basename(guardPath),
  )
}

async function openAdvisoryGuardLeaf(directoryGuard, guardLeaf, hooks) {
  await assertDirectoryStable(directoryGuard)
  const before = await statRegularLeaf(directoryGuard, guardLeaf, {
    allowMissing: true,
  })
  const handle = await open(
    leafPath(directoryGuard, guardLeaf),
    constants.O_RDWR |
      constants.O_CREAT |
      constants.O_NOFOLLOW |
      constants.O_NONBLOCK,
    0o600,
  )
  try {
    const descriptor = await handle.stat()
    if (!descriptor.isFile() || descriptor.nlink !== 1) {
      throw new UnsafeFilesystemShapeError(
        "FILESYSTEM_LEAF_NOT_REGULAR",
        guardLeaf,
      )
    }
    const current = await statRegularLeaf(directoryGuard, guardLeaf)
    if (!sameIdentity(descriptor, current)) {
      throw new UnsafeFilesystemShapeError(
        "FILESYSTEM_LEAF_REPLACED",
        guardLeaf,
      )
    }
    await handle.chmod(0o600)
    await handle.sync()
    if (!before) {
      await syncDirectory(directoryGuard, {
        hooks,
        phase: "advisory_guard_create",
        leafName: guardLeaf,
      })
    }
    return { handle, identity: descriptor }
  } catch (error) {
    await handle.close().catch(() => {})
    throw error
  }
}

async function acquireAdvisoryGuard(
  directoryGuard,
  guardLeaf,
  { hooks = null, lockfSpec = defaultLockfSpec } = {},
) {
  const opened = await openAdvisoryGuardLeaf(
    directoryGuard,
    guardLeaf,
    hooks,
  )
  await callHook(hooks, "beforeAdvisoryAcquire", { leafName: guardLeaf })
  const spec = lockfSpec(leafPath(directoryGuard, guardLeaf))
  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      stdio: ["pipe", "pipe", "pipe", opened.handle.fd],
    })
    void opened.handle.close().catch(() => {})
    let stdout = ""
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill("SIGKILL")
      reject(
        new FileLeaseMetadataError({
          code: "FILE_LEASE_GUARD_TIMEOUT",
          leafName: guardLeaf,
          recovery: "retry after the active orchestrator lease exits",
        }),
      )
    }, 2_000)
    const finish = (value, error = null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve(value)
    }
    child.on("error", (error) => {
      finish(
        null,
        new FileLeaseMetadataError({
          code: "FILE_LEASE_GUARD_UNAVAILABLE",
          leafName: guardLeaf,
          recovery: "install the platform advisory-lock primitive before retrying",
          cause: error,
        }),
      )
    })
    child.stdout.on("data", async (chunk) => {
      stdout += chunk.toString("utf8")
      const ready = stdout.match(/READY\s+(\d+)\s+(\d+)/)
      if (!ready || settled) return
      try {
        await callHook(hooks, "afterAdvisoryAcquire", { leafName: guardLeaf })
        const current = await statRegularLeaf(directoryGuard, guardLeaf)
        if (
          opened.identity.ino !== Number(ready[2]) ||
          !sameIdentity(current, opened.identity)
        ) {
          throw new UnsafeFilesystemShapeError(
            "FILESYSTEM_LEAF_REPLACED",
            guardLeaf,
          )
        }
        const handle = await open(
          leafPath(directoryGuard, guardLeaf),
          constants.O_WRONLY | constants.O_NOFOLLOW,
        )
        try {
          const descriptor = await handle.stat()
          if (!sameIdentity(current, descriptor) || descriptor.nlink !== 1) {
            throw new UnsafeFilesystemShapeError(
              "FILESYSTEM_LEAF_REPLACED",
              guardLeaf,
            )
          }
          await handle.chmod(0o600)
        } finally {
          await handle.close()
        }
        finish({ child })
      } catch (error) {
        child.stdin.end()
        finish(null, error)
      }
    })
    child.on("exit", (code) => {
      if (settled) return
      if (spec.busyCodes.has(code)) finish({ busy: true })
      else {
        finish(
          null,
          new FileLeaseMetadataError({
            code: "FILE_LEASE_GUARD_FAILED",
            leafName: guardLeaf,
            recovery: "verify the private state directory and retry",
          }),
        )
      }
    })
  })
}

async function releaseAdvisoryGuard(guard) {
  if (!guard?.child) return
  guard.child.stdin.end()
  await new Promise((resolve) => {
    if (guard.child.exitCode !== null) return resolve()
    const timer = setTimeout(() => {
      guard.child.kill("SIGKILL")
    }, 1_000)
    guard.child.once("exit", () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

function leaseCandidateLeafName(lockLeaf) {
  return `.${safeLeafName(lockLeaf)}.${process.pid}.${randomUUID()}.lease-candidate`
}

async function cleanupOrphanLeaseCandidates(directoryGuard, lockLeaf) {
  const prefix = `.${safeLeafName(lockLeaf)}.`
  const pattern = /^\.[A-Za-z0-9._-]+\.\d+\.[0-9a-f-]{36}\.lease-candidate$/i
  for (const entry of await readdir(directoryGuard.path)) {
    if (!entry.startsWith(prefix) || !pattern.test(entry)) continue
    await unlinkRegularLeaf(directoryGuard, entry, {
      allowMissing: true,
      allowMultipleLinks: true,
      sync: true,
    })
  }
}

async function writeLeaseRecord(
  directoryGuard,
  lockLeaf,
  record,
  { hooks = null } = {},
) {
  await cleanupOrphanLeaseCandidates(directoryGuard, lockLeaf)
  const candidate = leaseCandidateLeafName(lockLeaf)
  let descriptor = null
  const handle = await open(
    leafPath(directoryGuard, candidate),
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  )
  try {
    await handle.chmod(0o600)
    await handle.writeFile(`${JSON.stringify(record)}\n`)
    await handle.sync()
    descriptor = await handle.stat()
  } finally {
    await handle.close()
  }
  try {
    await callHook(hooks, "afterLeaseCandidateSynced", {
      leafName: lockLeaf,
    })
    const candidateLeaf = await statRegularLeaf(directoryGuard, candidate)
    if (!sameIdentity(descriptor, candidateLeaf)) {
      throw new UnsafeFilesystemShapeError(
        "FILESYSTEM_LEAF_REPLACED",
        candidate,
      )
    }
    await link(
      leafPath(directoryGuard, candidate),
      leafPath(directoryGuard, lockLeaf),
    )
    const durableLeaf = await statRegularLeaf(directoryGuard, lockLeaf, {
      allowMultipleLinks: true,
    })
    if (!sameIdentity(descriptor, durableLeaf)) {
      throw new UnsafeFilesystemShapeError(
        "FILESYSTEM_LEAF_REPLACED",
        lockLeaf,
      )
    }
    await syncDirectory(directoryGuard, {
      hooks,
      phase: "lease_create",
      leafName: lockLeaf,
    })
  } finally {
    await unlinkRegularLeaf(directoryGuard, candidate, {
      allowMissing: true,
      allowMultipleLinks: true,
      sync: true,
      hooks,
    })
  }
}

async function removeOwnedLeaseRecord(
  directoryGuard,
  lockLeaf,
  token,
  { hooks = null } = {},
) {
  let record
  try {
    record = await readJsonNoFollow(directoryGuard, lockLeaf, {
      allowMissing: true,
    })
  } catch {
    return false
  }
  if (record?.token !== token) return false
  await unlinkRegularLeaf(directoryGuard, lockLeaf, {
    allowMissing: true,
    sync: true,
    hooks,
  })
  return true
}

async function inspectLeaseLeaf(
  directoryGuard,
  leafName,
  context,
) {
  let record
  try {
    record = await readJsonNoFollow(directoryGuard, leafName, {
      allowMissing: true,
    })
  } catch (error) {
    if (error instanceof UnsafeFilesystemShapeError) throw error
    throw new FileLeaseMetadataError({
      code: "FILE_LEASE_METADATA_MALFORMED",
      leafName,
      recovery:
        "stop all orchestrator processes, verify the task scope, then remove only this malformed marker",
    })
  }
  if (!record) return { status: "missing" }
  const decision = await leaseOwnerDecision(record, context)
  if (decision.status === "invalid") {
    throw new FileLeaseMetadataError({
      code: "FILE_LEASE_METADATA_INVALID",
      leafName,
      recovery:
        "stop all orchestrator processes, verify the task scope, then remove only this invalid marker",
    })
  }
  return { ...decision, record }
}

export function defaultProcessIsAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error.code === "EPERM"
  }
}

export async function defaultProcessIdentity(pid) {
  return pid === process.pid ? currentProcessIdentity : null
}

export async function acquireCrashSafeFileLease({
  directoryGuard,
  lockLeaf,
  pid = process.pid,
  now = () => new Date(),
  isProcessAlive = defaultProcessIsAlive,
  getProcessIdentity = defaultProcessIdentity,
  hooks = null,
  lockfSpec = defaultLockfSpec,
}) {
  const guardLeaf = `${safeLeafName(lockLeaf)}.takeover`
  const reaperLeaf = `${lockLeaf}.reaper`
  const guard = await acquireAdvisoryGuard(directoryGuard, guardLeaf, {
    hooks,
    lockfSpec,
  })
  if (guard.busy) return { acquired: false, reason: "lease_busy" }
  try {
    await cleanupOrphanLeaseCandidates(directoryGuard, lockLeaf)
    const processIdentity = await getProcessIdentity(pid)
    if (!processIdentity) {
      throw new FileLeaseMetadataError({
        code: "FILE_LEASE_PROCESS_IDENTITY_UNAVAILABLE",
        leafName: lockLeaf,
        recovery: "retry after process identity can be verified",
      })
    }
    const context = {
      pid,
      processIdentity,
      isProcessAlive,
      getProcessIdentity,
    }
    for (const candidate of [reaperLeaf, lockLeaf]) {
      const existing = await inspectLeaseLeaf(
        directoryGuard,
        candidate,
        context,
      )
      if (existing.status === "missing") continue
      if (existing.status === "live") {
        return { acquired: false, reason: "lease_busy" }
      }
      if (existing.status === "ambiguous") {
        return {
          acquired: false,
          reason: "lease_owner_ambiguous",
          recovery:
            "stop the recorded process and retry, or verify task scope before removing the legacy marker",
        }
      }
      await unlinkRegularLeaf(directoryGuard, candidate, {
        allowMissing: true,
        sync: true,
        hooks,
      })
      await callHook(hooks, "afterLeaseMarkerRemoved", {
        leafName: candidate,
      })
    }

    const token = randomUUID()
    const record = {
      schemaVersion: 2,
      token,
      pid,
      processIdentity,
      acquiredAt: now().toISOString(),
    }
    try {
      await writeLeaseRecord(directoryGuard, lockLeaf, record, { hooks })
    } catch (error) {
      await removeOwnedLeaseRecord(
        directoryGuard,
        lockLeaf,
        token,
        { hooks },
      ).catch(() => {})
      throw error
    }
    await callHook(hooks, "afterLeaseRecordCreated", { leafName: lockLeaf })
    activeLeaseTokens.add(token)
    return {
      acquired: true,
      lease: {
        directoryGuard,
        lockLeaf,
        token,
        pid,
        processIdentity,
        hooks,
        lockfSpec,
        active: true,
      },
    }
  } finally {
    await releaseAdvisoryGuard(guard)
  }
}

export async function fileLeaseIsActive(lease) {
  if (
    !lease?.active ||
    typeof lease.token !== "string" ||
    !activeLeaseTokens.has(lease.token)
  ) {
    return false
  }
  try {
    const record = await readJsonNoFollow(
      lease.directoryGuard,
      lease.lockLeaf,
      { allowMissing: true },
    )
    return Boolean(
      record?.schemaVersion === 2 &&
        record.token === lease.token &&
        record.pid === lease.pid &&
        record.processIdentity === lease.processIdentity,
    )
  } catch {
    return false
  }
}

export async function releaseCrashSafeFileLease(lease) {
  if (!lease) return
  lease.active = false
  activeLeaseTokens.delete(lease.token)
  let guard = null
  try {
    guard = await acquireAdvisoryGuard(
      lease.directoryGuard,
      `${lease.lockLeaf}.takeover`,
      { hooks: lease.hooks, lockfSpec: lease.lockfSpec },
    )
    if (guard.busy) return
    const record = await readJsonNoFollow(
      lease.directoryGuard,
      lease.lockLeaf,
      { allowMissing: true },
    )
    if (record?.token !== lease.token) return
    await unlinkRegularLeaf(lease.directoryGuard, lease.lockLeaf, {
      allowMissing: true,
      sync: true,
      hooks: lease.hooks,
    })
  } catch {
    // The inactive token lets this process reclaim a leftover marker safely;
    // another process can reclaim it after proving this process identity dead.
  } finally {
    await releaseAdvisoryGuard(guard)
  }
}
