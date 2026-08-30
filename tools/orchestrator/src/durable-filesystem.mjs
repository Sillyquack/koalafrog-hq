import { spawn } from "node:child_process"
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto"
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import {
  link,
  lstat,
  open,
  readdir,
  realpath,
  rename,
  unlink,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  trustedAdvisoryLockBrokerDigest,
  trustedAdvisoryLockBrokerSpec,
  trustedMutationBrokerVersion,
} from "./trusted-mutation-broker.mjs"

const activeLeaseTokens = new Set()
const durablePendingSuffix = ".commit-pending"
const durableTransactionKeyLeaf = ".durable-transaction.key"
const currentProcessIdentity = `node-process:${randomUUID()}`
let descriptorCapabilityCheck = null
const advisoryCapabilityChecks = new Map()
// The broker acquires locks non-blockingly, so a delayed READY is process
// startup/scheduling latency rather than lock-owner serialization. Keep that
// latency bounded without using the former two-second host-load-sensitive cap.
const advisoryHelperReadyTimeoutMs = 10_000
const descriptorCapabilityHelper = String.raw`
import ctypes
import os
import platform

if not hasattr(os, "O_NOFOLLOW") or not hasattr(os, "O_DIRECTORY"):
    raise RuntimeError("descriptor flags unavailable")
if os.open not in os.supports_dir_fd or os.mkdir not in os.supports_dir_fd:
    raise RuntimeError("descriptor-relative operations unavailable")
if os.stat not in os.supports_dir_fd or os.stat not in os.supports_follow_symlinks:
    raise RuntimeError("descriptor-relative stat unavailable")
libc = ctypes.CDLL(None, use_errno=True)
if platform.system() == "Darwin":
    getattr(libc, "renameatx_np")
elif platform.system() == "Linux":
    getattr(libc, "renameat2")
else:
    raise RuntimeError("descriptor-relative exclusive rename unsupported")
print("READY", flush=True)
`
const descriptorDirectoryHelper = String.raw`
import ctypes
import errno
import json
import os
import platform
import stat
import sys
import uuid

request = json.loads(sys.stdin.readline())
target = os.path.realpath(os.path.abspath(request["target"]))
expected_parent = request["expectedParent"]
expected_child = request.get("expectedChild")
directory_flags = os.O_RDONLY | os.O_DIRECTORY
if hasattr(os, "O_NOFOLLOW"):
    directory_flags |= os.O_NOFOLLOW

def identity(value):
    return {"dev": value.st_dev, "ino": value.st_ino}

def same_identity(value, expected):
    return value.st_dev == expected["dev"] and value.st_ino == expected["ino"]

def rename_exclusive(parent_fd, source, destination):
    libc = ctypes.CDLL(None, use_errno=True)
    source_bytes = source.encode("utf-8")
    destination_bytes = destination.encode("utf-8")
    system = platform.system()
    if system == "Darwin":
        function = libc.renameatx_np
        function.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
        function.restype = ctypes.c_int
        result = function(parent_fd, source_bytes, parent_fd, destination_bytes, 0x00000004)
    elif system == "Linux":
        function = libc.renameat2
        function.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
        function.restype = ctypes.c_int
        result = function(parent_fd, source_bytes, parent_fd, destination_bytes, 0x00000001)
    else:
        raise OSError(errno.ENOTSUP, "descriptor-relative exclusive rename is unsupported")
    if result != 0:
        code = ctypes.get_errno()
        raise OSError(code, os.strerror(code))

def open_child(parent_fd, name):
    return os.open(name, directory_flags, dir_fd=parent_fd)

def open_ancestry(absolute_path):
    if not os.path.isabs(absolute_path):
        raise OSError(errno.EINVAL, "guarded parent path is not absolute")
    opened = [os.open(os.path.sep, directory_flags)]
    entries = []
    current = opened[0]
    for name in [part for part in absolute_path.split(os.path.sep) if part]:
        child = open_child(current, name)
        child_stat = os.fstat(child)
        named_stat = os.stat(name, dir_fd=current, follow_symlinks=False)
        if (
            not stat.S_ISDIR(child_stat.st_mode)
            or not stat.S_ISDIR(named_stat.st_mode)
            or not same_identity(named_stat, identity(child_stat))
        ):
            os.close(child)
            raise OSError(errno.ESTALE, "guarded ancestry identity changed")
        entries.append((current, name, child, identity(child_stat)))
        opened.append(child)
        current = child
    return current, opened, entries

def validate_ancestry(entries):
    for parent_fd, name, child_fd, expected in entries:
        child_stat = os.fstat(child_fd)
        named_stat = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
        if (
            not stat.S_ISDIR(child_stat.st_mode)
            or not stat.S_ISDIR(named_stat.st_mode)
            or not same_identity(child_stat, expected)
            or not same_identity(named_stat, expected)
        ):
            raise OSError(errno.ESTALE, "guarded ancestry identity changed")

def mutate_while_attached(phase, action):
    validate_ancestry(ancestry_entries)
    if request.get("pauseBeforeOperations"):
        print(json.dumps({"phase": "beforeOperation", "operation": phase}), flush=True)
        if sys.stdin.readline().strip() != "continue":
            raise OSError(errno.ECANCELED, "directory mutation was cancelled")
        validate_ancestry(ancestry_entries)
    result = action()
    validate_ancestry(ancestry_entries)
    return result

def publish_child(parent_fd, name):
    candidate = ".%s.%s.mkdir-candidate" % (name, uuid.uuid4())
    candidate_fd = None
    try:
        mutate_while_attached(
            "mkdir",
            lambda: os.mkdir(candidate, 0o700, dir_fd=parent_fd),
        )
        candidate_fd = open_child(parent_fd, candidate)
        candidate_stat = os.fstat(candidate_fd)
        if not stat.S_ISDIR(candidate_stat.st_mode):
            raise OSError(errno.ENOTDIR, "created component is not a directory")
        try:
            mutate_while_attached(
                "rename",
                lambda: rename_exclusive(parent_fd, candidate, name),
            )
        except OSError as error:
            if error.errno not in (errno.EEXIST, errno.ENOTEMPTY):
                raise
            os.close(candidate_fd)
            candidate_fd = None
            mutate_while_attached(
                "rmdir",
                lambda: os.rmdir(candidate, dir_fd=parent_fd),
            )
            return open_child(parent_fd, name), False
        published = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
        if not same_identity(published, identity(candidate_stat)):
            raise OSError(errno.ESTALE, "published directory identity changed")
        mutate_while_attached("parentFsync", lambda: os.fsync(parent_fd))
        return candidate_fd, True
    except BaseException:
        if candidate_fd is not None:
            os.close(candidate_fd)
        try:
            mutate_while_attached(
                "cleanupRmdir",
                lambda: os.rmdir(candidate, dir_fd=parent_fd),
            )
        except OSError:
            pass
        raise

def descend(parent_fd, name):
    try:
        return open_child(parent_fd, name), False
    except FileNotFoundError:
        return publish_child(parent_fd, name)

root_fd = None
ancestry_fds = []
ancestry_entries = []
current_fd = None
try:
    parent_path = os.path.abspath(request["parentPath"])
    root_fd, ancestry_fds, ancestry_entries = open_ancestry(parent_path)
    parent_stat = os.fstat(root_fd)
    if not same_identity(parent_stat, expected_parent):
        raise OSError(errno.ESTALE, "guarded parent identity changed")
    expected_target = os.path.join(parent_path, request["leafName"])
    if target != expected_target:
        raise OSError(errno.EINVAL, "guarded child path is not canonical")
    current_fd, created = descend(root_fd, request["leafName"])
    current_stat = os.fstat(current_fd)
    if not stat.S_ISDIR(current_stat.st_mode):
        raise OSError(errno.ENOTDIR, "target is not a directory")
    if expected_child is not None and not same_identity(current_stat, expected_child):
        raise OSError(errno.ESTALE, "existing directory identity changed")
    named_stat = os.stat(request["leafName"], dir_fd=root_fd, follow_symlinks=False)
    if not stat.S_ISDIR(named_stat.st_mode) or not same_identity(named_stat, identity(current_stat)):
        raise OSError(errno.ESTALE, "named directory identity changed")
    if stat.S_IMODE(current_stat.st_mode) != 0o700:
        mutate_while_attached("fchmod", lambda: os.fchmod(current_fd, 0o700))
    if created or stat.S_IMODE(current_stat.st_mode) != 0o700:
        mutate_while_attached("childFsync", lambda: os.fsync(current_fd))
    final_stat = os.stat(request["leafName"], dir_fd=root_fd, follow_symlinks=False)
    if not stat.S_ISDIR(final_stat.st_mode) or not same_identity(final_stat, identity(current_stat)):
        raise OSError(errno.ESTALE, "named directory identity changed after mutation")
    print(json.dumps({"ok": True, "created": created, **identity(current_stat)}), flush=True)
except BaseException as error:
    code = error.errno if isinstance(error, OSError) else None
    semantic_code = "FILESYSTEM_DIRECTORY_REPLACED" if code == errno.ESTALE else None
    print(json.dumps({"ok": False, "errno": code, "reason": type(error).__name__, "code": semantic_code}), flush=True)
    sys.exit(1)
finally:
    if current_fd is not None:
        os.close(current_fd)
    for descriptor in reversed(ancestry_fds):
        os.close(descriptor)
`

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

export class DurableTransactionError extends Error {
  constructor({ code, leafName, cause = null }) {
    super(`Durable transaction is not safely recoverable (${code}) for ${leafName}`)
    this.name = "DurableTransactionError"
    this.code = code
    this.leafName = leafName
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

async function ensureDirectoryDescriptorRelative(
  directory,
  parentGuard = null,
  { expectedChild = null, hooks = null } = {},
) {
  if (!new Set(["darwin", "linux"]).has(process.platform)) {
    throw new UnsafeFilesystemShapeError(
      "FILESYSTEM_DESCRIPTOR_DIRECTORY_UNSUPPORTED",
      path.basename(directory),
    )
  }
  await preflightDescriptorCapability()
  const request = {
    target: path.resolve(directory),
    parentPath: parentGuard.canonicalPath,
    expectedParent: { dev: parentGuard.dev, ino: parentGuard.ino },
    expectedChild: expectedChild
      ? { dev: expectedChild.dev, ino: expectedChild.ino }
      : null,
    leafName: path.basename(directory),
    pauseBeforeOperations:
      typeof hooks?.beforeDescriptorDirectoryOperation === "function" ||
      typeof hooks?.beforeDescriptorDirectoryMutation === "function",
  }
  await callHook(hooks, "beforeDescriptorDirectoryOpen", {
    leafName: request.leafName,
    expectedChild: request.expectedChild,
  })
  const child = spawn("/usr/bin/python3", ["-I", "-c", descriptorDirectoryHelper], {
    stdio: ["pipe", "pipe", "pipe"],
  })
  let stdout = ""
  let response = null
  let hookError = null
  let hookWork = Promise.resolve()
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8")
    let newline = stdout.indexOf("\n")
    while (newline >= 0) {
      const line = stdout.slice(0, newline)
      stdout = stdout.slice(newline + 1)
      let message = null
      try {
        message = JSON.parse(line)
      } catch {
        message = null
      }
      if (message?.phase === "beforeOperation") {
        hookWork = hookWork
          .then(async () => {
            const details = {
              leafName: request.leafName,
              expectedChild: request.expectedChild,
              operation: message.operation,
            }
            await callHook(
              hooks,
              "beforeDescriptorDirectoryOperation",
              details,
            )
            if (
              message.operation === "fchmod" &&
              typeof hooks?.beforeDescriptorDirectoryMutation === "function"
            ) {
              await callHook(
                hooks,
                "beforeDescriptorDirectoryMutation",
                details,
              )
            }
            child.stdin.write("continue\n")
          })
          .catch((error) => {
            hookError = error
            child.kill("SIGKILL")
          })
      } else if (message) {
        response = message
      }
      newline = stdout.indexOf("\n")
    }
  })
  child.stderr.resume()
  child.stdin.write(`${JSON.stringify(request)}\n`)
  if (!request.pauseBeforeOperations) child.stdin.end()
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("exit", (code) => resolve(code))
  }).catch((error) => {
    throw new UnsafeFilesystemShapeError(
      "FILESYSTEM_DESCRIPTOR_DIRECTORY_UNAVAILABLE",
      path.basename(directory),
      { cause: error },
    )
  })
  await hookWork
  if (hookError) throw hookError
  if (!response && stdout.trim()) {
    try {
      response = JSON.parse(stdout)
    } catch {
      // The helper's arbitrary output is intentionally not propagated.
    }
  }
  if (
    result !== 0 ||
    response?.ok !== true ||
    !Number.isSafeInteger(response.dev) ||
    !Number.isSafeInteger(response.ino)
  ) {
    const error = new UnsafeFilesystemShapeError(
      response?.code === "FILESYSTEM_DIRECTORY_REPLACED"
        ? response.code
        : "FILESYSTEM_DESCRIPTOR_DIRECTORY_REJECTED",
      path.basename(directory),
    )
    error.helperReason = response?.reason ?? "unavailable"
    error.helperErrno = response?.errno ?? null
    throw error
  }
  return response
}

async function guardExistingDirectory(directory) {
  const resolved = path.resolve(directory)
  const before = await lstat(resolved)
  if (before.isSymbolicLink() || !before.isDirectory()) {
    throw new UnsafeFilesystemShapeError(
      "FILESYSTEM_DIRECTORY_UNSAFE",
      path.basename(resolved),
    )
  }
  const canonical = await realpath(resolved)
  const descriptorFd = openSync(
    canonical,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  )
  try {
    const descriptor = fstatSync(descriptorFd)
    if (!descriptor.isDirectory() || !sameIdentity(before, descriptor)) {
      throw new UnsafeFilesystemShapeError(
        "FILESYSTEM_DIRECTORY_REPLACED",
        path.basename(resolved),
      )
    }
    const after = await lstat(resolved)
    if (
      after.isSymbolicLink() ||
      !after.isDirectory() ||
      !sameIdentity(descriptor, after) ||
      (await realpath(resolved)) !== canonical
    ) {
      throw new UnsafeFilesystemShapeError(
        "FILESYSTEM_DIRECTORY_REPLACED",
        path.basename(resolved),
      )
    }
    return {
      path: resolved,
      canonicalPath: canonical,
      dev: descriptor.dev,
      ino: descriptor.ino,
    }
  } finally {
    closeSync(descriptorFd)
  }
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
  { parentGuard = null, hooks = null } = {},
) {
  requireNoFollowSupport()
  const resolved = path.resolve(directory)
  const effectiveParentGuard =
    parentGuard ?? (await guardExistingDirectory(path.dirname(resolved)))
  await assertDirectoryStable(effectiveParentGuard)
  const expectedCanonical = path.join(
    effectiveParentGuard.canonicalPath,
    path.basename(resolved),
  )
  let existing = null
  try {
    existing = await lstat(resolved)
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }
  if (existing) {
    if (existing.isSymbolicLink() || !existing.isDirectory()) {
      throw new UnsafeFilesystemShapeError(
        "FILESYSTEM_DIRECTORY_UNSAFE",
        path.basename(resolved),
      )
    }
    const canonical = await realpath(resolved)
    await assertDirectoryStable(effectiveParentGuard)
    if (canonical !== expectedCanonical) {
      throw new UnsafeFilesystemShapeError(
        "FILESYSTEM_DIRECTORY_ESCAPE",
        path.basename(resolved),
      )
    }
    const handle = await open(
      canonical,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    )
    try {
      const descriptor = await handle.stat()
      if (!descriptor.isDirectory() || !sameIdentity(existing, descriptor)) {
        throw new UnsafeFilesystemShapeError(
          "FILESYSTEM_DIRECTORY_REPLACED",
          path.basename(resolved),
        )
      }
      if ((descriptor.mode & 0o777) === 0o700) {
        await assertDirectoryStable(effectiveParentGuard)
        return {
          path: resolved,
          canonicalPath: canonical,
          dev: descriptor.dev,
          ino: descriptor.ino,
        }
      }
    } finally {
      await handle.close()
    }
  }
  const descriptorResult = await ensureDirectoryDescriptorRelative(
    resolved,
    effectiveParentGuard,
    { expectedChild: existing, hooks },
  )
  const info = await lstat(resolved)
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new UnsafeFilesystemShapeError(
      "FILESYSTEM_DIRECTORY_UNSAFE",
      path.basename(resolved),
    )
  }
  const canonical = await realpath(resolved)
  await assertDirectoryStable(effectiveParentGuard)
  if (canonical !== expectedCanonical) {
    throw new UnsafeFilesystemShapeError(
      "FILESYSTEM_DIRECTORY_ESCAPE",
      path.basename(resolved),
    )
  }
  if (!sameIdentity(info, descriptorResult)) {
    throw new UnsafeFilesystemShapeError(
      "FILESYSTEM_DIRECTORY_REPLACED",
      path.basename(resolved),
    )
  }
  if (existing && !sameIdentity(info, existing)) {
    throw new UnsafeFilesystemShapeError(
      "FILESYSTEM_DIRECTORY_REPLACED",
      path.basename(resolved),
    )
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
  } finally {
    await handle.close()
  }
  const guard = {
    path: resolved,
    canonicalPath: canonical,
    dev: existing?.dev ?? info.dev,
    ino: existing?.ino ?? info.ino,
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

function assertDirectoryStableSync(directoryGuard) {
  const info = lstatSync(directoryGuard.path)
  if (
    info.isSymbolicLink() ||
    !info.isDirectory() ||
    info.dev !== directoryGuard.dev ||
    info.ino !== directoryGuard.ino ||
    realpathSync(directoryGuard.path) !== directoryGuard.canonicalPath
  ) {
    throw new UnsafeFilesystemShapeError(
      "FILESYSTEM_DIRECTORY_REPLACED",
      path.basename(directoryGuard.path),
    )
  }
}

function statRegularLeafSync(
  directoryGuard,
  leafName,
  { allowMissing = false, allowMultipleLinks = false } = {},
) {
  try {
    const info = lstatSync(leafPath(directoryGuard, leafName))
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

export async function syncDirectory(
  directoryGuard,
  { hooks = null, phase = "directory_sync", leafName = "directory" } = {},
) {
  await callHook(hooks, "beforeDirectorySync", { phase, leafName })
  assertDirectoryStableSync(directoryGuard)
  const descriptor = openSync(
    directoryGuard.canonicalPath,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  )
  try {
    const info = fstatSync(descriptor)
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
    assertDirectoryStableSync(directoryGuard)
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
  assertDirectoryStableSync(directoryGuard)
}

async function openExistingLeaf(
  directoryGuard,
  leafName,
  { allowMissing = false, allowMultipleLinks = false } = {},
) {
  assertDirectoryStableSync(directoryGuard)
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
  contentsOrProvider,
  { hooks = null } = {},
) {
  assertDirectoryStableSync(directoryGuard)
  const before = statRegularLeafSync(directoryGuard, leafName, {
    allowMissing: true,
  })
  const flags =
    constants.O_WRONLY |
    constants.O_CREAT |
    constants.O_APPEND |
    constants.O_NOFOLLOW
  const descriptorFd = openSync(leafPath(directoryGuard, leafName), flags, 0o600)
  try {
    const descriptor = fstatSync(descriptorFd)
    if (!descriptor.isFile() || descriptor.nlink !== 1) {
      throw new UnsafeFilesystemShapeError("FILESYSTEM_LEAF_NOT_REGULAR", leafName)
    }
    const after = statRegularLeafSync(directoryGuard, leafName)
    if (!sameIdentity(descriptor, after)) {
      throw new UnsafeFilesystemShapeError("FILESYSTEM_LEAF_REPLACED", leafName)
    }
    await callHook(hooks, "beforeFileChmod", { phase: "append", leafName })
    assertDirectoryStableSync(directoryGuard)
    const currentMode = fstatSync(descriptorFd).mode & 0o777
    if (before && currentMode !== 0o600) {
      throw new UnsafeFilesystemShapeError("FILESYSTEM_LEAF_MODE_UNSAFE", leafName)
    }
    if (!before) {
      fsyncSync(descriptorFd)
      await syncDirectory(directoryGuard, {
        hooks,
        phase: "append_create",
        leafName,
      })
    }
    await callHook(hooks, "beforeAppendWrite", { leafName })
    assertDirectoryStableSync(directoryGuard)
    const finalLeaf = statRegularLeafSync(directoryGuard, leafName)
    if (!sameIdentity(descriptor, finalLeaf)) {
      throw new UnsafeFilesystemShapeError("FILESYSTEM_LEAF_REPLACED", leafName)
    }
    const contents =
      typeof contentsOrProvider === "function"
        ? contentsOrProvider()
        : contentsOrProvider
    assertDirectoryStableSync(directoryGuard)
    writeFileSync(descriptorFd, contents)
    fsyncSync(descriptorFd)
  } finally {
    closeSync(descriptorFd)
  }
}

async function unlinkRegularLeaf(
  directoryGuard,
  leafName,
  {
    allowMissing = false,
    allowMultipleLinks = false,
    expectedIdentity = null,
    expectedLinkCount = null,
    sync = false,
    hooks = null,
  } = {},
) {
  const inspectMultipleLinks =
    allowMultipleLinks || Number.isSafeInteger(expectedLinkCount)
  const info = await statRegularLeaf(directoryGuard, leafName, {
    allowMissing,
    allowMultipleLinks: inspectMultipleLinks,
  })
  if (!info) return false
  if (
    (expectedIdentity && !sameIdentity(info, expectedIdentity)) ||
    (Number.isSafeInteger(expectedLinkCount) && info.nlink !== expectedLinkCount)
  ) {
    throw new UnsafeFilesystemShapeError(
      "FILESYSTEM_LEAF_LINK_TOPOLOGY",
      leafName,
    )
  }
  await callHook(hooks, "beforeLeafUnlink", { leafName })
  assertDirectoryStableSync(directoryGuard)
  const current = statRegularLeafSync(directoryGuard, leafName, {
    allowMissing,
    allowMultipleLinks: inspectMultipleLinks,
  })
  if (!current) return false
  if (
    !sameIdentity(info, current) ||
    (expectedIdentity && !sameIdentity(current, expectedIdentity)) ||
    (Number.isSafeInteger(expectedLinkCount) &&
      current.nlink !== expectedLinkCount)
  ) {
    throw new UnsafeFilesystemShapeError(
      "FILESYSTEM_LEAF_LINK_TOPOLOGY",
      leafName,
    )
  }
  assertDirectoryStableSync(directoryGuard)
  unlinkSync(leafPath(directoryGuard, leafName))
  if (sync) {
    await syncDirectory(directoryGuard, {
      hooks,
      phase: "unlink",
      leafName,
    })
  }
  return true
}

function requirePrivateCandidate(info, leafName) {
  if (info.nlink !== 1 || (info.mode & 0o777) !== 0o600) {
    throw new UnsafeFilesystemShapeError(
      "FILESYSTEM_LEAF_LINK_TOPOLOGY",
      leafName,
    )
  }
}

async function unlinkOwnedCanonicalCandidate(
  directoryGuard,
  candidate,
  canonical,
  { hooks = null } = {},
) {
  const canonicalInfo = await statRegularLeaf(directoryGuard, canonical, {
    allowMultipleLinks: true,
  })
  const candidateInfo = await statRegularLeaf(directoryGuard, candidate, {
    allowMultipleLinks: true,
  })
  if (
    canonicalInfo.nlink !== 2 ||
    candidateInfo.nlink !== 2 ||
    (canonicalInfo.mode & 0o777) !== 0o600 ||
    (candidateInfo.mode & 0o777) !== 0o600 ||
    !sameIdentity(canonicalInfo, candidateInfo)
  ) {
    throw new UnsafeFilesystemShapeError(
      "FILESYSTEM_LEAF_LINK_TOPOLOGY",
      candidate,
    )
  }
  await unlinkRegularLeaf(directoryGuard, candidate, {
    allowMultipleLinks: true,
    expectedIdentity: canonicalInfo,
    expectedLinkCount: 2,
    sync: true,
    hooks,
  })
  const normalized = await statRegularLeaf(directoryGuard, canonical)
  if (!sameIdentity(canonicalInfo, normalized)) {
    throw new UnsafeFilesystemShapeError(
      "FILESYSTEM_LEAF_REPLACED",
      canonical,
    )
  }
  return normalized
}

function pendingLeafName(leafName) {
  return `.${safeLeafName(leafName)}${durablePendingSuffix}`
}

function temporaryLeafName(leafName) {
  return `.${safeLeafName(leafName)}.${process.pid}.${randomUUID()}.tmp`
}

function journalCandidateLeafName(leafName) {
  return `.${safeLeafName(leafName)}.${process.pid}.${randomUUID()}.journal-candidate`
}

function transactionKeyCandidateLeafName() {
  return `${durableTransactionKeyLeaf}.${process.pid}.${randomUUID()}.key-candidate`
}

function transactionTargetDigest(directoryGuard, leafName) {
  return sha256(
    `${directoryGuard.canonicalPath}\0${safeLeafName(leafName)}`,
  )
}

function requireTransactionOptions({
  transactionKind,
  deriveSemanticIdentity,
  validateTransition,
}) {
  if (
    typeof transactionKind !== "string" ||
    !/^[a-z][a-z0-9_]{0,63}$/.test(transactionKind) ||
    typeof deriveSemanticIdentity !== "function" ||
    typeof validateTransition !== "function"
  ) {
    throw new DurableTransactionError({
      code: "DURABLE_TRANSACTION_OPTIONS_INVALID",
      leafName: "transaction",
    })
  }
  return { transactionKind, deriveSemanticIdentity, validateTransition }
}

async function readLeafSnapshot(
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
    const contents = await handle.readFile()
    const info = await handle.stat()
    return { contents, info }
  } finally {
    await handle.close()
  }
}

function snapshotEvidence(snapshot, semanticIdentity) {
  if (!snapshot) {
    return {
      exists: false,
      digest: null,
      size: 0,
      dev: null,
      ino: null,
      semanticIdentity,
    }
  }
  return {
    exists: true,
    digest: sha256(snapshot.contents),
    size: snapshot.contents.byteLength,
    dev: snapshot.info.dev,
    ino: snapshot.info.ino,
    semanticIdentity,
  }
}

function exactJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function snapshotMatchesEvidence(snapshot, evidence) {
  if (!evidence?.exists) return snapshot === null
  return Boolean(
    snapshot &&
      snapshot.contents.byteLength === evidence.size &&
      sha256(snapshot.contents) === evidence.digest &&
      snapshot.info.dev === evidence.dev &&
      snapshot.info.ino === evidence.ino,
  )
}

function transactionDigest(record, key) {
  const { integrityDigest: _ignored, ...unsigned } = record
  return createHmac("sha256", key).update(JSON.stringify(unsigned)).digest("hex")
}

function parseTransactionKey(contents) {
  let record
  try {
    record = JSON.parse(contents.toString("utf8"))
  } catch (cause) {
    throw new DurableTransactionError({
      code: "DURABLE_TRANSACTION_KEY_MALFORMED",
      leafName: durableTransactionKeyLeaf,
      cause,
    })
  }
  const expectedKeys = ["schemaVersion", "keyId", "secret"]
  const secret =
    typeof record?.secret === "string"
      ? Buffer.from(record.secret, "base64")
      : null
  if (
    !record ||
    typeof record !== "object" ||
    !exactJson(Object.keys(record).sort(), expectedKeys.sort()) ||
    record.schemaVersion !== 1 ||
    !secret ||
    secret.byteLength !== 32 ||
    secret.toString("base64") !== record.secret ||
    typeof record.keyId !== "string" ||
    record.keyId !== sha256(secret)
  ) {
    throw new DurableTransactionError({
      code: "DURABLE_TRANSACTION_KEY_INVALID",
      leafName: durableTransactionKeyLeaf,
    })
  }
  return { key: secret, keyId: record.keyId }
}

function transactionKeyCandidatePattern() {
  return /^\.durable-transaction\.key\.\d+\.[0-9a-f-]{36}\.key-candidate$/i
}

async function normalizeTransactionKeyLinks(directoryGuard, hooks) {
  const keyInfo = await statRegularLeaf(
    directoryGuard,
    durableTransactionKeyLeaf,
    { allowMissing: true, allowMultipleLinks: true },
  )
  const candidates = (await readdir(directoryGuard.path)).filter((entry) =>
    transactionKeyCandidatePattern().test(entry),
  )
  if (!keyInfo) {
    for (const candidate of candidates) {
      const candidateInfo = await statRegularLeaf(directoryGuard, candidate)
      requirePrivateCandidate(candidateInfo, candidate)
      parseTransactionKey(
        await readFileNoFollow(directoryGuard, candidate),
      )
      await unlinkRegularLeaf(directoryGuard, candidate, {
        allowMissing: true,
        sync: true,
        hooks,
      })
    }
    return false
  }
  if (keyInfo.nlink === 1 && candidates.length === 0) return true
  if (keyInfo.nlink !== 2 || candidates.length !== 1) {
    throw new DurableTransactionError({
      code: "DURABLE_TRANSACTION_KEY_LINKS_AMBIGUOUS",
      leafName: durableTransactionKeyLeaf,
    })
  }
  const candidateInfo = await statRegularLeaf(directoryGuard, candidates[0], {
    allowMultipleLinks: true,
  })
  if (
    !sameIdentity(keyInfo, candidateInfo) ||
    (keyInfo.mode & 0o777) !== 0o600 ||
    (candidateInfo.mode & 0o777) !== 0o600
  ) {
    throw new DurableTransactionError({
      code: "DURABLE_TRANSACTION_KEY_LINKS_AMBIGUOUS",
      leafName: durableTransactionKeyLeaf,
    })
  }
  parseTransactionKey(
    await readFileNoFollow(directoryGuard, durableTransactionKeyLeaf, {
      allowMultipleLinks: true,
    }),
  )
  const normalized = await unlinkOwnedCanonicalCandidate(
    directoryGuard,
    candidates[0],
    durableTransactionKeyLeaf,
    { hooks },
  )
  if (!sameIdentity(keyInfo, normalized)) {
    throw new DurableTransactionError({
      code: "DURABLE_TRANSACTION_KEY_REPLACED",
      leafName: durableTransactionKeyLeaf,
    })
  }
  return true
}

async function readTransactionKey(
  directoryGuard,
  { create = false, hooks = null } = {},
) {
  if (await normalizeTransactionKeyLinks(directoryGuard, hooks)) {
    const contents = await readFileNoFollow(
      directoryGuard,
      durableTransactionKeyLeaf,
    )
    return parseTransactionKey(contents)
  }
  if (!create) return null

  const secret = randomBytes(32)
  const record = {
    schemaVersion: 1,
    keyId: sha256(secret),
    secret: secret.toString("base64"),
  }
  const candidate = transactionKeyCandidateLeafName()
  let descriptorFd = null
  try {
    assertDirectoryStableSync(directoryGuard)
    descriptorFd = openSync(
      leafPath(directoryGuard, candidate),
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    )
    assertDirectoryStableSync(directoryGuard)
    fchmodSync(descriptorFd, 0o600)
    writeFileSync(descriptorFd, `${JSON.stringify(record)}\n`)
    fsyncSync(descriptorFd)
    const candidateInfo = fstatSync(descriptorFd)
    closeSync(descriptorFd)
    descriptorFd = null
    try {
      assertDirectoryStableSync(directoryGuard)
      linkSync(
        leafPath(directoryGuard, candidate),
        leafPath(directoryGuard, durableTransactionKeyLeaf),
      )
    } catch (error) {
      if (error.code !== "EEXIST") throw error
      await unlinkRegularLeaf(directoryGuard, candidate, {
        allowMissing: true,
      })
      return readTransactionKey(directoryGuard, { hooks })
    }
    const published = await statRegularLeaf(
      directoryGuard,
      durableTransactionKeyLeaf,
      { allowMultipleLinks: true },
    )
    if (!sameIdentity(candidateInfo, published)) {
      throw new DurableTransactionError({
        code: "DURABLE_TRANSACTION_KEY_REPLACED",
        leafName: durableTransactionKeyLeaf,
      })
    }
    await syncDirectory(directoryGuard, {
      hooks,
      phase: "transaction_key_create",
      leafName: durableTransactionKeyLeaf,
    })
    await unlinkOwnedCanonicalCandidate(
      directoryGuard,
      candidate,
      durableTransactionKeyLeaf,
      { hooks },
    )
    return { key: secret, keyId: record.keyId }
  } finally {
    if (descriptorFd !== null) closeSync(descriptorFd)
  }
}

function validEvidence(evidence) {
  if (!evidence || typeof evidence !== "object") return false
  const baseKeys = [
    "exists",
    "digest",
    "size",
    "dev",
    "ino",
    "semanticIdentity",
  ]
  const expectedKeys = evidence.tempLeafName
    ? [...baseKeys, "tempLeafName"]
    : baseKeys
  if (!exactJson(Object.keys(evidence).sort(), expectedKeys.sort())) return false
  if (evidence.exists === false) {
    return (
      evidence.digest === null &&
      evidence.size === 0 &&
      evidence.dev === null &&
      evidence.ino === null &&
      evidence.semanticIdentity &&
      typeof evidence.semanticIdentity === "object"
    )
  }
  return Boolean(
    evidence.exists === true &&
      typeof evidence.digest === "string" &&
      /^[a-f0-9]{64}$/.test(evidence.digest) &&
      Number.isSafeInteger(evidence.size) &&
      evidence.size >= 0 &&
      Number.isSafeInteger(evidence.dev) &&
      Number.isSafeInteger(evidence.ino) &&
      evidence.semanticIdentity &&
      typeof evidence.semanticIdentity === "object",
  )
}

function validateTransactionRecord(
  directoryGuard,
  leafName,
  record,
  options,
  transactionKey,
) {
  const expectedKeys = [
    "schemaVersion",
    "operationKind",
    "operationId",
    "target",
    "predecessor",
    "successor",
    "integrityKeyId",
    "integrityDigest",
  ]
  const targetKeys = [
    "leafName",
    "pathDigest",
    "directoryDev",
    "directoryIno",
  ]
  if (
    !record ||
    typeof record !== "object" ||
    !exactJson(Object.keys(record).sort(), [...expectedKeys].sort()) ||
    record.schemaVersion !== 1 ||
    record.operationKind !== options.transactionKind ||
    typeof record.operationId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      record.operationId,
    ) ||
    !record.target ||
    !exactJson(Object.keys(record.target).sort(), targetKeys.sort()) ||
    record.target.leafName !== leafName ||
    record.target.pathDigest !== transactionTargetDigest(directoryGuard, leafName) ||
    record.target.directoryDev !== directoryGuard.dev ||
    record.target.directoryIno !== directoryGuard.ino ||
    !Number.isSafeInteger(record.target.directoryDev) ||
    !Number.isSafeInteger(record.target.directoryIno) ||
    !validEvidence(record.predecessor) ||
    !validEvidence(record.successor) ||
    Object.hasOwn(record.predecessor, "tempLeafName") ||
    record.successor.exists !== true ||
    typeof record.successor.tempLeafName !== "string" ||
    safeLeafName(record.successor.tempLeafName) !== record.successor.tempLeafName ||
    !record.successor.tempLeafName.startsWith(`.${leafName}.`) ||
    !record.successor.tempLeafName.endsWith(".tmp") ||
    record.integrityKeyId !== transactionKey.keyId ||
    typeof record.integrityDigest !== "string" ||
    !/^[a-f0-9]{64}$/.test(record.integrityDigest) ||
    transactionDigest(record, transactionKey.key) !== record.integrityDigest
  ) {
    throw new DurableTransactionError({
      code: "DURABLE_TRANSACTION_JOURNAL_INVALID",
      leafName,
    })
  }
}

function journalCandidatePattern(pendingLeaf) {
  const escaped = safeLeafName(pendingLeaf).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(
    `^\\.${escaped}\\.\\d+\\.[0-9a-f-]{36}\\.journal-candidate$`,
    "i",
  )
}

async function normalizePublishedJournalLinks(
  directoryGuard,
  leafName,
  options,
  hooks,
) {
  const pending = pendingLeafName(leafName)
  const pendingInfo = await statRegularLeaf(directoryGuard, pending, {
    allowMissing: true,
    allowMultipleLinks: true,
  })
  const entries = await readdir(directoryGuard.path)
  const pattern = journalCandidatePattern(pending)
  const candidateNames = entries.filter((entry) => pattern.test(entry))
  if (!pendingInfo) {
    if (candidateNames.length === 0) return false
    const transactionKey = await readTransactionKey(directoryGuard, { hooks })
    if (!transactionKey) {
      throw new DurableTransactionError({
        code: "DURABLE_TRANSACTION_KEY_MISSING",
        leafName,
      })
    }
    for (const candidate of candidateNames) {
      const candidateInfo = await statRegularLeaf(directoryGuard, candidate)
      requirePrivateCandidate(candidateInfo, candidate)
      let record
      try {
        record = await readJsonNoFollow(directoryGuard, candidate)
      } catch (cause) {
        throw new DurableTransactionError({
          code: "DURABLE_TRANSACTION_JOURNAL_MALFORMED",
          leafName,
          cause,
        })
      }
      validateTransactionRecord(
        directoryGuard,
        leafName,
        record,
        options,
        transactionKey,
      )
      await unlinkRegularLeaf(directoryGuard, candidate, {
        allowMissing: true,
        sync: true,
        hooks,
      })
    }
    return false
  }
  if (pendingInfo.nlink === 1 && candidateNames.length === 0) return true
  if (pendingInfo.nlink !== 2 || candidateNames.length !== 1) {
    throw new DurableTransactionError({
      code: "DURABLE_TRANSACTION_JOURNAL_LINKS_AMBIGUOUS",
      leafName,
    })
  }
  const candidateInfo = await statRegularLeaf(
    directoryGuard,
    candidateNames[0],
    { allowMultipleLinks: true },
  )
  if (
    !sameIdentity(pendingInfo, candidateInfo) ||
    (pendingInfo.mode & 0o777) !== 0o600 ||
    (candidateInfo.mode & 0o777) !== 0o600
  ) {
    throw new DurableTransactionError({
      code: "DURABLE_TRANSACTION_JOURNAL_LINKS_AMBIGUOUS",
      leafName,
    })
  }
  const transactionKey = await readTransactionKey(directoryGuard, { hooks })
  if (!transactionKey) {
    throw new DurableTransactionError({
      code: "DURABLE_TRANSACTION_KEY_MISSING",
      leafName,
    })
  }
  let record
  try {
    record = await readJsonNoFollow(directoryGuard, pending, {
      allowMultipleLinks: true,
    })
  } catch (cause) {
    throw new DurableTransactionError({
      code: "DURABLE_TRANSACTION_JOURNAL_MALFORMED",
      leafName,
      cause,
    })
  }
  validateTransactionRecord(
    directoryGuard,
    leafName,
    record,
    options,
    transactionKey,
  )
  const normalized = await unlinkOwnedCanonicalCandidate(
    directoryGuard,
    candidateNames[0],
    pending,
    { hooks },
  )
  if (!sameIdentity(pendingInfo, normalized)) {
    throw new DurableTransactionError({
      code: "DURABLE_TRANSACTION_JOURNAL_REPLACED",
      leafName,
    })
  }
  return true
}

function semanticIdentityFor(options, snapshot) {
  try {
    return options.deriveSemanticIdentity(snapshot?.contents ?? null)
  } catch (cause) {
    throw new DurableTransactionError({
      code: "DURABLE_TRANSACTION_SEMANTIC_IDENTITY_INVALID",
      leafName: "transaction",
      cause,
    })
  }
}

async function writeTransactionJournal(
  directoryGuard,
  leafName,
  record,
  { hooks = null, onPublished = null } = {},
) {
  const pending = pendingLeafName(leafName)
  const candidate = journalCandidateLeafName(pending)
  let descriptorFd = null
  let published = false
  try {
    assertDirectoryStableSync(directoryGuard)
    descriptorFd = openSync(
      leafPath(directoryGuard, candidate),
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    )
    assertDirectoryStableSync(directoryGuard)
    fchmodSync(descriptorFd, 0o600)
    writeFileSync(descriptorFd, `${JSON.stringify(record)}\n`)
    fsyncSync(descriptorFd)
    const descriptor = fstatSync(descriptorFd)
    closeSync(descriptorFd)
    descriptorFd = null
    const candidateInfo = await statRegularLeaf(directoryGuard, candidate)
    if (!sameIdentity(descriptor, candidateInfo)) {
      throw new UnsafeFilesystemShapeError(
        "FILESYSTEM_LEAF_REPLACED",
        candidate,
      )
    }
    assertDirectoryStableSync(directoryGuard)
    linkSync(
      leafPath(directoryGuard, candidate),
      leafPath(directoryGuard, pending),
    )
    published = true
    onPublished?.()
    const pendingInfo = await statRegularLeaf(directoryGuard, pending, {
      allowMultipleLinks: true,
    })
    if (!sameIdentity(descriptor, pendingInfo)) {
      throw new UnsafeFilesystemShapeError(
        "FILESYSTEM_LEAF_REPLACED",
        pending,
      )
    }
    await syncDirectory(directoryGuard, {
      hooks,
      phase: "journal_prepare",
      leafName,
    })
  } catch (cause) {
    if (published) {
      throw new DurableCommitPendingError({
        leafName,
        phase: "journal_prepare",
        cause,
      })
    }
    throw cause
  } finally {
    if (descriptorFd !== null) closeSync(descriptorFd)
    if (published) {
      await unlinkOwnedCanonicalCandidate(
        directoryGuard,
        candidate,
        pending,
        { hooks },
      )
    } else {
      await unlinkRegularLeaf(directoryGuard, candidate, {
        allowMissing: true,
        sync: false,
        hooks,
      })
    }
  }
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
  {
    hooks = null,
    transactionKind,
    deriveSemanticIdentity,
    validateTransition,
  } = {},
) {
  const options = requireTransactionOptions({
    transactionKind,
    deriveSemanticIdentity,
    validateTransition,
  })
  const pending = pendingLeafName(leafName)
  if (
    !(await normalizePublishedJournalLinks(
      directoryGuard,
      leafName,
      options,
      hooks,
    ))
  ) {
    return false
  }
  let record
  try {
    record = await readJsonNoFollow(directoryGuard, pending, {
      allowMissing: true,
    })
  } catch (cause) {
    if (cause instanceof UnsafeFilesystemShapeError) throw cause
    throw new DurableTransactionError({
      code: "DURABLE_TRANSACTION_JOURNAL_MALFORMED",
      leafName,
      cause,
    })
  }
  if (record === null) {
    throw new DurableTransactionError({
      code: "DURABLE_TRANSACTION_JOURNAL_DISAPPEARED",
      leafName,
    })
  }
  const transactionKey = await readTransactionKey(directoryGuard, { hooks })
  if (!transactionKey) {
    throw new DurableTransactionError({
      code: "DURABLE_TRANSACTION_KEY_MISSING",
      leafName,
    })
  }
  validateTransactionRecord(
    directoryGuard,
    leafName,
    record,
    options,
    transactionKey,
  )

  const current = await readLeafSnapshot(directoryGuard, leafName, {
    allowMissing: true,
  })
  const successorTemp = await readLeafSnapshot(
    directoryGuard,
    record.successor.tempLeafName,
    { allowMissing: true },
  )
  const currentSemantic = semanticIdentityFor(options, current)
  if (
    snapshotMatchesEvidence(current, record.successor) &&
    exactJson(currentSemantic, record.successor.semanticIdentity)
  ) {
    if (successorTemp !== null) {
      throw new DurableTransactionError({
        code: "DURABLE_TRANSACTION_SUCCESSOR_DUPLICATED",
        leafName,
      })
    }
    await syncDirectory(directoryGuard, {
      hooks,
      phase: "recovery_confirm",
      leafName,
    })
  } else {
    const predecessorSemantic = semanticIdentityFor(options, current)
    const successorSemantic = semanticIdentityFor(options, successorTemp)
    if (
      !snapshotMatchesEvidence(current, record.predecessor) ||
      !exactJson(predecessorSemantic, record.predecessor.semanticIdentity) ||
      !snapshotMatchesEvidence(successorTemp, record.successor) ||
      !exactJson(successorSemantic, record.successor.semanticIdentity) ||
      options.validateTransition(predecessorSemantic, successorSemantic) !== true
    ) {
      throw new DurableTransactionError({
        code: "DURABLE_TRANSACTION_EVIDENCE_CONFLICT",
        leafName,
      })
    }
    try {
      await callHook(hooks, "beforeRename", {
        phase: "recovery",
        leafName,
      })
      assertDirectoryStableSync(directoryGuard)
      renameSync(
        leafPath(directoryGuard, record.successor.tempLeafName),
        leafPath(directoryGuard, leafName),
      )
      await syncDirectory(directoryGuard, {
        hooks,
        phase: "recovery_commit",
        leafName,
      })
    } catch (cause) {
      throw new DurableCommitPendingError({
        leafName,
        phase: "recovery_commit",
        cause,
      })
    }
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
    })
  }
}

export async function durableAtomicWriteFile(
  directoryGuard,
  leafName,
  contents,
  {
    hooks = null,
    transactionKind,
    deriveSemanticIdentity,
    validateTransition,
  } = {},
) {
  const options = requireTransactionOptions({
    transactionKind,
    deriveSemanticIdentity,
    validateTransition,
  })
  await recoverDurableFileReplace(directoryGuard, leafName, {
    hooks,
    ...options,
  })
  await cleanupOrphanAtomicTemps(directoryGuard, leafName)
  const predecessor = await readLeafSnapshot(directoryGuard, leafName, {
    allowMissing: true,
  })
  const predecessorSemantic = semanticIdentityFor(options, predecessor)
  const transactionKey = await readTransactionKey(directoryGuard, {
    create: true,
    hooks,
  })

  const temporary = temporaryLeafName(leafName)
  let descriptorFd = null
  let temporaryIdentity = null
  let intentCreated = false
  try {
    assertDirectoryStableSync(directoryGuard)
    descriptorFd = openSync(
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
    assertDirectoryStableSync(directoryGuard)
    fchmodSync(descriptorFd, 0o600)
    writeFileSync(descriptorFd, contents)
    await callHook(hooks, "beforeFileSync", { leafName })
    assertDirectoryStableSync(directoryGuard)
    fsyncSync(descriptorFd)
    temporaryIdentity = fstatSync(descriptorFd)
    closeSync(descriptorFd)
    descriptorFd = null

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
    const successor = await readLeafSnapshot(directoryGuard, temporary)
    const successorSemantic = semanticIdentityFor(options, successor)
    if (options.validateTransition(predecessorSemantic, successorSemantic) !== true) {
      throw new DurableTransactionError({
        code: "DURABLE_TRANSACTION_TRANSITION_INVALID",
        leafName,
      })
    }
    const record = {
      schemaVersion: 1,
      operationKind: options.transactionKind,
      operationId: randomUUID(),
      target: {
        leafName,
        pathDigest: transactionTargetDigest(directoryGuard, leafName),
        directoryDev: directoryGuard.dev,
        directoryIno: directoryGuard.ino,
      },
      predecessor: snapshotEvidence(predecessor, predecessorSemantic),
      successor: {
        ...snapshotEvidence(successor, successorSemantic),
        tempLeafName: temporary,
      },
      integrityKeyId: transactionKey.keyId,
    }
    record.integrityDigest = transactionDigest(record, transactionKey.key)
    await writeTransactionJournal(directoryGuard, leafName, record, {
      hooks,
      onPublished: () => {
        intentCreated = true
      },
    })
    await syncDirectory(directoryGuard, {
      hooks,
      phase: "prepare",
      leafName,
    })
    await callHook(hooks, "beforeRename", {
      phase: "commit",
      leafName,
    })
    const current = await readLeafSnapshot(directoryGuard, leafName, {
      allowMissing: true,
    })
    const currentSemantic = semanticIdentityFor(options, current)
    if (
      !snapshotMatchesEvidence(current, record.predecessor) ||
      !exactJson(currentSemantic, record.predecessor.semanticIdentity)
    ) {
      throw new DurableTransactionError({
        code: "DURABLE_TRANSACTION_PREDECESSOR_CHANGED",
        leafName,
      })
    }
    assertDirectoryStableSync(directoryGuard)
    renameSync(
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
    if (error instanceof DurableCommitPendingError) throw error
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
    if (descriptorFd !== null) closeSync(descriptorFd)
    if (!intentCreated) {
      await unlinkRegularLeaf(directoryGuard, temporary, {
        allowMissing: true,
      }).catch(() => {})
    }
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
  if (process.platform === "darwin" || process.platform === "linux") {
    return trustedAdvisoryLockBrokerSpec()
  }
  throw new UnsafeFilesystemShapeError(
    "FILESYSTEM_ADVISORY_LOCK_UNSUPPORTED",
    "filesystem",
  )
}

async function runCapabilityProcess(
  command,
  args,
  stdio = ["ignore", "pipe", "pipe"],
) {
  let child
  try {
    child = spawn(command, args, { stdio })
  } catch (cause) {
    return { ok: false, cause, stdout: "" }
  }
  let stdout = ""
  child.stdout?.on("data", (chunk) => {
    stdout += chunk.toString("utf8")
  })
  child.stderr?.resume()
  child.stdin?.end()
  const result = await new Promise((resolve) => {
    let settled = false
    let timer = null
    const finish = (value) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve(value)
    }
    timer = setTimeout(() => {
      child.kill("SIGKILL")
      finish({ ok: false, timeout: true, stdout })
    }, 2_000)
    child.once("error", (cause) => finish({ ok: false, cause, stdout }))
    child.once("exit", (code) =>
      finish({ ok: code === 0 && /\bREADY\b/.test(stdout), code, stdout }),
    )
  })
  return result
}

async function preflightDescriptorCapability() {
  descriptorCapabilityCheck ??= runCapabilityProcess(
    "/usr/bin/python3",
    ["-I", "-c", descriptorCapabilityHelper],
  ).then((result) => {
    if (!result.ok) {
      throw new UnsafeFilesystemShapeError(
        "FILESYSTEM_DESCRIPTOR_DIRECTORY_UNAVAILABLE",
        "filesystem",
      )
    }
  })
  return descriptorCapabilityCheck
}

function advisoryLockSpec(lockfSpec, guardPath) {
  let spec
  try {
    spec = lockfSpec(guardPath)
  } catch (cause) {
    throw new FileLeaseMetadataError({
      code: "FILE_LEASE_GUARD_UNAVAILABLE",
      leafName: "filesystem",
      recovery: "install the platform advisory-lock primitive before retrying",
      cause,
    })
  }
  if (
    !spec ||
    typeof spec.command !== "string" ||
    !spec.command ||
    !Array.isArray(spec.args) ||
    !(spec.busyCodes instanceof Set) ||
    !Number.isSafeInteger(spec.protocolVersion) ||
    spec.protocolVersion < 1 ||
    typeof spec.contentDigest !== "string" ||
    !/^[0-9a-f]{64}$/.test(spec.contentDigest) ||
    spec.request?.mode !== "advisory_hold" ||
    spec.request?.protocolVersion !== spec.protocolVersion ||
    spec.request?.contentDigest !== spec.contentDigest
  ) {
    throw new FileLeaseMetadataError({
      code: "FILE_LEASE_GUARD_UNAVAILABLE",
      leafName: "filesystem",
      recovery: "configure a valid platform advisory-lock primitive",
    })
  }
  return spec
}

function exactReadyIdentity(stdout, spec) {
  const match = String(stdout).match(
    /^READY\s+(\d+)\s+([0-9a-f]{64})\s+(\d+)\s+(\d+)\r?\n?$/,
  )
  if (!match) return null
  try {
    if (
      Number(match[1]) !== spec.protocolVersion ||
      match[2] !== spec.contentDigest
    ) {
      return null
    }
    return {
      dev: BigInt(match[3]).toString(),
      ino: BigInt(match[4]).toString(),
    }
  } catch {
    return null
  }
}

function startAdvisoryCapabilityProbe(spec, descriptor) {
  const child = spawn(spec.command, spec.args, {
    stdio: ["pipe", "pipe", "pipe", descriptor],
  })
  let stdout = ""
  let settled = false
  let resolveDisposition
  const disposition = new Promise((resolve) => {
    resolveDisposition = resolve
  })
  const finish = (value) => {
    if (settled) return
    settled = true
    resolveDisposition({ ...value, stdout })
  }
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8")
    if (stdout.includes("\n")) finish({ kind: "output" })
  })
  child.stderr.resume()
  child.once("error", (cause) => finish({ kind: "error", cause }))
  child.once("exit", (code) => finish({ kind: "exit", code }))
  child.stdin.write(`${JSON.stringify(spec.request)}\n`)
  return { child, disposition, stdout: () => stdout }
}

async function waitForAdvisoryProbe(
  probe,
  timeoutMs = advisoryHelperReadyTimeoutMs,
) {
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ kind: "timeout", stdout: probe.stdout() }), timeoutMs)
  })
  const result = await Promise.race([probe.disposition, timeout])
  clearTimeout(timer)
  if (result.kind === "timeout") probe.child.kill("SIGKILL")
  return result
}

async function proveAdvisoryCapability(
  spec,
  holderDescriptor,
  contenderDescriptor,
  commandIdentity,
) {
  const holder = startAdvisoryCapabilityProbe(spec, holderDescriptor)
  let contender = null
  try {
    const holderDisposition = await waitForAdvisoryProbe(holder)
    const holderIdentity = exactReadyIdentity(holderDisposition.stdout, spec)
    if (
      holderDisposition.kind !== "output" ||
      !holderIdentity ||
      holderIdentity.dev !== commandIdentity.dev ||
      holderIdentity.ino !== commandIdentity.ino
    ) {
      throw new Error("advisory helper READY identity was not proven")
    }

    contender = startAdvisoryCapabilityProbe(spec, contenderDescriptor)
    contender.child.stdin.end()
    const contenderDisposition = await waitForAdvisoryProbe(contender)
    if (
      contenderDisposition.kind !== "exit" ||
      !spec.busyCodes.has(contenderDisposition.code) ||
      contenderDisposition.stdout !== ""
    ) {
      throw new Error("advisory helper mutual exclusion was not proven")
    }

    holder.child.stdin.end()
    const holderExit = await new Promise((resolve) => {
      if (holder.child.exitCode !== null) resolve(holder.child.exitCode)
      else holder.child.once("exit", resolve)
    })
    if (holderExit !== 0) {
      throw new Error("advisory helper did not release cleanly")
    }
  } finally {
    if (holder.child.exitCode === null) holder.child.kill("SIGKILL")
    if (contender?.child.exitCode === null) contender.child.kill("SIGKILL")
  }
}

async function preflightAdvisoryCapability(
  lockfSpec,
  { cache = true, guardPath = "/dev/null" } = {},
) {
  const spec = advisoryLockSpec(lockfSpec, guardPath)
  const capabilityKey = JSON.stringify([
    guardPath,
    spec.command,
    spec.args,
    [...spec.busyCodes].sort(),
    spec.protocolVersion,
    spec.contentDigest,
    spec.request,
  ])
  let check = cache ? advisoryCapabilityChecks.get(capabilityKey) : null
  if (!check) {
    check = (async () => {
      let commandHandle
      let probeHandle
      let contenderProbeHandle
      let probePath = null
      try {
        commandHandle = await open(
          spec.command,
          constants.O_RDONLY | constants.O_NOFOLLOW,
        )
        const commandInfo = await commandHandle.stat({ bigint: true })
        if (
          !commandInfo.isFile() ||
          commandInfo.uid !== 0n ||
          (commandInfo.mode & 0o022n) !== 0n
        ) {
          throw new Error(
            "helper identity or immutable ownership failed capability preflight",
          )
        }
        const commandIdentity = {
          dev: commandInfo.dev.toString(),
          ino: commandInfo.ino.toString(),
        }

        probePath = path.join(
          os.tmpdir(),
          `.koalafrog-lock-capability.${process.pid}.${randomUUID()}`,
        )
        probeHandle = await open(
          probePath,
          constants.O_RDWR |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          0o600,
        )
        contenderProbeHandle = await open(
          probePath,
          constants.O_RDWR | constants.O_NOFOLLOW,
        )
        const probeInfo = await probeHandle.stat({ bigint: true })
        const contenderProbeInfo = await contenderProbeHandle.stat({ bigint: true })
        if (
          !probeInfo.isFile() ||
          !contenderProbeInfo.isFile() ||
          probeInfo.dev !== contenderProbeInfo.dev ||
          probeInfo.ino !== contenderProbeInfo.ino
        ) {
          throw new Error("capability probe identity changed")
        }
        const probeIdentity = {
          dev: probeInfo.dev.toString(),
          ino: probeInfo.ino.toString(),
        }
        try {
          await proveAdvisoryCapability(
            spec,
            probeHandle.fd,
            contenderProbeHandle.fd,
            probeIdentity,
          )
        } finally {
          await unlink(probePath).catch(() => {})
          probePath = null
          await probeHandle.close().catch(() => {})
          await contenderProbeHandle.close().catch(() => {})
          await commandHandle.close().catch(() => {})
        }
        return { ...spec, commandIdentity }
      } catch (cause) {
        if (probePath) await unlink(probePath).catch(() => {})
        await probeHandle?.close().catch(() => {})
        await contenderProbeHandle?.close().catch(() => {})
        await commandHandle?.close().catch(() => {})
        throw new FileLeaseMetadataError({
          code: "FILE_LEASE_GUARD_UNAVAILABLE",
          leafName: "filesystem",
          recovery: "install the platform advisory-lock primitive before retrying",
          cause,
        })
      }
    })()
    if (cache) advisoryCapabilityChecks.set(capabilityKey, check)
  }
  return check
}

export async function preflightDurableFilesystemCapabilities({
  lockfSpec = defaultLockfSpec,
  guardPaths = ["/dev/null"],
} = {}) {
  await preflightDescriptorCapability()
  for (const guardPath of guardPaths) {
    await preflightAdvisoryCapability(lockfSpec, { guardPath })
  }
}

async function openAdvisoryGuardLeaf(directoryGuard, guardLeaf, hooks) {
  await assertDirectoryStable(directoryGuard)
  const before = await statRegularLeaf(directoryGuard, guardLeaf, {
    allowMissing: true,
  })
  assertDirectoryStableSync(directoryGuard)
  const descriptorFd = openSync(
    leafPath(directoryGuard, guardLeaf),
    constants.O_RDWR |
      constants.O_CREAT |
      constants.O_NOFOLLOW |
      constants.O_NONBLOCK,
    0o600,
  )
  try {
    const descriptor = fstatSync(descriptorFd)
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
    if (before && (descriptor.mode & 0o777) !== 0o600) {
      throw new UnsafeFilesystemShapeError(
        "FILESYSTEM_LEAF_MODE_UNSAFE",
        guardLeaf,
      )
    }
    if (!before) {
      assertDirectoryStableSync(directoryGuard)
      if ((descriptor.mode & 0o777) !== 0o600) fchmodSync(descriptorFd, 0o600)
      fsyncSync(descriptorFd)
      await syncDirectory(directoryGuard, {
        hooks,
        phase: "advisory_guard_create",
        leafName: guardLeaf,
      })
    }
    return { fd: descriptorFd, identity: descriptor }
  } catch (error) {
    closeSync(descriptorFd)
    throw error
  }
}

async function proveActiveAdvisoryExclusion(
  spec,
  directoryGuard,
  guardLeaf,
  expectedIdentity,
) {
  const contenderHandle = await open(
    leafPath(directoryGuard, guardLeaf),
    constants.O_RDWR | constants.O_NOFOLLOW,
  )
  let contender = null
  try {
    const contenderInfo = await contenderHandle.stat()
    if (
      !contenderInfo.isFile() ||
      contenderInfo.nlink !== 1 ||
      !sameIdentity(contenderInfo, expectedIdentity)
    ) {
      throw new UnsafeFilesystemShapeError(
        "FILESYSTEM_LEAF_REPLACED",
        guardLeaf,
      )
    }
    contender = startAdvisoryCapabilityProbe(spec, contenderHandle.fd)
    contender.child.stdin.end()
    const disposition = await waitForAdvisoryProbe(contender)
    if (
      disposition.kind !== "exit" ||
      !spec.busyCodes.has(disposition.code) ||
      disposition.stdout !== ""
    ) {
      throw new FileLeaseMetadataError({
        code: "FILE_LEASE_GUARD_UNAVAILABLE",
        leafName: guardLeaf,
        recovery: "restore the proven advisory-lock helper before retrying",
      })
    }
  } finally {
    if (contender?.child.exitCode === null) contender.child.kill("SIGKILL")
    await contenderHandle.close().catch(() => {})
  }
}

async function acquireAdvisoryGuard(
  directoryGuard,
  guardLeaf,
  { hooks = null, lockfSpec = defaultLockfSpec } = {},
) {
  const guardPath = leafPath(directoryGuard, guardLeaf)
  const spec = await preflightAdvisoryCapability(lockfSpec, {
    guardPath,
  })
  let commandHandle
  try {
    commandHandle = await open(
      spec.command,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    )
    const commandInfo = await commandHandle.stat({ bigint: true })
    if (
      !commandInfo.isFile() ||
      commandInfo.dev.toString() !== spec.commandIdentity.dev ||
      commandInfo.ino.toString() !== spec.commandIdentity.ino
    ) {
      throw new Error("advisory helper identity changed after preflight")
    }
  } catch (cause) {
    await commandHandle?.close().catch(() => {})
    throw new FileLeaseMetadataError({
      code: "FILE_LEASE_GUARD_UNAVAILABLE",
      leafName: guardLeaf,
      recovery: "restore the preflighted advisory-lock helper before retrying",
      cause,
    })
  }
  const opened = await openAdvisoryGuardLeaf(
    directoryGuard,
    guardLeaf,
    hooks,
  ).catch(async (error) => {
    await commandHandle.close().catch(() => {})
    throw error
  })
  try {
    await callHook(hooks, "beforeAdvisoryAcquire", { leafName: guardLeaf })
  } catch (error) {
    closeSync(opened.fd)
    await commandHandle.close().catch(() => {})
    throw error
  }
  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      stdio: [
        "pipe",
        "pipe",
        "pipe",
        opened.fd,
        commandHandle.fd,
      ],
    })
    child.stdin.write(`${JSON.stringify(spec.request)}\n`)
    closeSync(opened.fd)
    void commandHandle.close().catch(() => {})
    let stdout = ""
    let settled = false
    let readyAccepted = false
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
    }, advisoryHelperReadyTimeoutMs)
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
      const ready = exactReadyIdentity(stdout, spec)
      if (!ready || settled || readyAccepted) return
      // READY proves that the holder owns this descriptor. End its scheduling
      // deadline before starting the separately bounded same-inode contender
      // proof; nesting both phases under one timer caused false timeouts.
      readyAccepted = true
      clearTimeout(timer)
      try {
        const current = await statRegularLeaf(directoryGuard, guardLeaf)
        if (
          opened.identity.dev.toString() !== ready.dev ||
          opened.identity.ino.toString() !== ready.ino ||
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
          if ((descriptor.mode & 0o777) !== 0o600) {
            throw new UnsafeFilesystemShapeError(
              "FILESYSTEM_LEAF_MODE_UNSAFE",
              guardLeaf,
            )
          }
        } finally {
          await handle.close()
        }
        await proveActiveAdvisoryExclusion(
          spec,
          directoryGuard,
          guardLeaf,
          opened.identity,
        )
        const guard = {
          child,
          lost: false,
          assertHeld() {
            if (this.lost || child.exitCode !== null || child.signalCode !== null) {
              throw new FileLeaseMetadataError({
                code: "FILE_LEASE_GUARD_LOST",
                leafName: guardLeaf,
                recovery: "retry only after the fixed mutation broker can retain its lock",
              })
            }
          },
        }
        child.once("exit", () => {
          guard.lost = true
        })
        await callHook(hooks, "afterAdvisoryAcquire", {
          leafName: guardLeaf,
          terminateBroker: () =>
            new Promise((resolve) => {
              child.once("exit", resolve)
              child.kill("SIGKILL")
            }),
        })
        guard.assertHeld()
        const finalGuard = await statRegularLeaf(directoryGuard, guardLeaf)
        if (!sameIdentity(finalGuard, opened.identity)) {
          throw new UnsafeFilesystemShapeError(
            "FILESYSTEM_LEAF_REPLACED",
            guardLeaf,
          )
        }
        finish(guard)
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
            code: readyAccepted
              ? "FILE_LEASE_GUARD_LOST"
              : "FILE_LEASE_GUARD_FAILED",
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
    const candidateInfo = await statRegularLeaf(directoryGuard, entry, {
      allowMultipleLinks: true,
    })
    if ((candidateInfo.mode & 0o777) !== 0o600) {
      throw new UnsafeFilesystemShapeError(
        "FILESYSTEM_LEAF_LINK_TOPOLOGY",
        entry,
      )
    }
    let record
    try {
      record = await readJsonNoFollow(directoryGuard, entry, {
        allowMultipleLinks: candidateInfo.nlink !== 1,
      })
    } catch (cause) {
      throw new FileLeaseMetadataError({
        code: "FILE_LEASE_CANDIDATE_MALFORMED",
        leafName: entry,
        recovery: "verify the private task directory before retrying",
        cause,
      })
    }
    if (!validLeaseRecord(record)) {
      throw new FileLeaseMetadataError({
        code: "FILE_LEASE_CANDIDATE_INVALID",
        leafName: entry,
        recovery: "verify the private task directory before retrying",
      })
    }
    if (candidateInfo.nlink === 1) {
      await unlinkRegularLeaf(directoryGuard, entry, {
        allowMissing: true,
        sync: true,
      })
    } else {
      await unlinkOwnedCanonicalCandidate(
        directoryGuard,
        entry,
        lockLeaf,
      )
    }
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
  assertDirectoryStableSync(directoryGuard)
  const descriptorFd = openSync(
    leafPath(directoryGuard, candidate),
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  )
  let published = false
  try {
    assertDirectoryStableSync(directoryGuard)
    fchmodSync(descriptorFd, 0o600)
    writeFileSync(descriptorFd, `${JSON.stringify(record)}\n`)
    fsyncSync(descriptorFd)
    descriptor = fstatSync(descriptorFd)
  } finally {
    closeSync(descriptorFd)
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
    assertDirectoryStableSync(directoryGuard)
    linkSync(
      leafPath(directoryGuard, candidate),
      leafPath(directoryGuard, lockLeaf),
    )
    published = true
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
    if (published) {
      await unlinkOwnedCanonicalCandidate(
        directoryGuard,
        candidate,
        lockLeaf,
        { hooks },
      )
    } else {
      await unlinkRegularLeaf(directoryGuard, candidate, {
        allowMissing: true,
        sync: true,
        hooks,
      })
    }
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
    guard.assertHeld()
    await cleanupOrphanLeaseCandidates(directoryGuard, lockLeaf)
    guard.assertHeld()
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
      guard.assertHeld()
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
      guard.assertHeld()
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
      guard.assertHeld()
      await writeLeaseRecord(directoryGuard, lockLeaf, record, { hooks })
      guard.assertHeld()
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
