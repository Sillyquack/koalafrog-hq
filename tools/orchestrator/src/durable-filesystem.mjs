import { spawn } from "node:child_process"
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto"
import { constants } from "node:fs"
import {
  link,
  lstat,
  open,
  readdir,
  realpath,
  rename,
  unlink,
} from "node:fs/promises"
import path from "node:path"

const activeLeaseTokens = new Set()
const durablePendingSuffix = ".commit-pending"
const durableTransactionKeyLeaf = ".durable-transaction.key"
const currentProcessIdentity = `node-process:${randomUUID()}`
const descriptorDirectoryHelper = String.raw`
import ctypes
import errno
import json
import os
import platform
import stat
import sys
import uuid

request = json.load(sys.stdin)
target = os.path.realpath(os.path.abspath(request["target"]))
expected_parent = request["expectedParent"]
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

def publish_child(parent_fd, name):
    candidate = ".%s.%s.mkdir-candidate" % (name, uuid.uuid4())
    candidate_fd = None
    try:
        os.mkdir(candidate, 0o700, dir_fd=parent_fd)
        candidate_fd = open_child(parent_fd, candidate)
        candidate_stat = os.fstat(candidate_fd)
        if not stat.S_ISDIR(candidate_stat.st_mode):
            raise OSError(errno.ENOTDIR, "created component is not a directory")
        try:
            rename_exclusive(parent_fd, candidate, name)
        except OSError as error:
            if error.errno not in (errno.EEXIST, errno.ENOTEMPTY):
                raise
            os.close(candidate_fd)
            candidate_fd = None
            os.rmdir(candidate, dir_fd=parent_fd)
            return open_child(parent_fd, name), False
        published = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
        if not same_identity(published, identity(candidate_stat)):
            raise OSError(errno.ESTALE, "published directory identity changed")
        os.fsync(parent_fd)
        return candidate_fd, True
    except BaseException:
        if candidate_fd is not None:
            os.close(candidate_fd)
        try:
            os.rmdir(candidate, dir_fd=parent_fd)
        except OSError:
            pass
        raise

def descend(parent_fd, name):
    try:
        return open_child(parent_fd, name), False
    except FileNotFoundError:
        return publish_child(parent_fd, name)

root_fd = None
current_fd = None
try:
    parent_path = os.path.abspath(request["parentPath"])
    root_fd = os.open(parent_path, directory_flags)
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
    os.fchmod(current_fd, 0o700)
    os.fsync(current_fd)
    print(json.dumps({"ok": True, "created": created, **identity(current_stat)}))
except BaseException as error:
    code = error.errno if isinstance(error, OSError) else None
    print(json.dumps({"ok": False, "errno": code, "reason": type(error).__name__}))
    sys.exit(1)
finally:
    if current_fd is not None:
        os.close(current_fd)
    if root_fd is not None:
        os.close(root_fd)
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

async function ensureDirectoryDescriptorRelative(directory, parentGuard = null) {
  if (!new Set(["darwin", "linux"]).has(process.platform)) {
    throw new UnsafeFilesystemShapeError(
      "FILESYSTEM_DESCRIPTOR_DIRECTORY_UNSUPPORTED",
      path.basename(directory),
    )
  }
  const request = {
    target: path.resolve(directory),
    parentPath: parentGuard.canonicalPath,
    expectedParent: { dev: parentGuard.dev, ino: parentGuard.ino },
    leafName: path.basename(directory),
  }
  const child = spawn("/usr/bin/python3", ["-I", "-c", descriptorDirectoryHelper], {
    stdio: ["pipe", "pipe", "pipe"],
  })
  let stdout = ""
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8")
  })
  child.stderr.resume()
  child.stdin.end(`${JSON.stringify(request)}\n`)
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
  let response = null
  try {
    response = JSON.parse(stdout)
  } catch {
    // The helper's arbitrary stderr is intentionally not propagated.
  }
  if (
    result !== 0 ||
    response?.ok !== true ||
    !Number.isSafeInteger(response.dev) ||
    !Number.isSafeInteger(response.ino)
  ) {
    const error = new UnsafeFilesystemShapeError(
      "FILESYSTEM_DESCRIPTOR_DIRECTORY_REJECTED",
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
  const handle = await open(
    canonical,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  )
  try {
    const descriptor = await handle.stat()
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
    await handle.close()
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
  { parentGuard = null } = {},
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
    dev: info.dev,
    ino: info.ino,
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
      await unlinkRegularLeaf(directoryGuard, candidate, {
        allowMissing: true,
        allowMultipleLinks: true,
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
  if (!sameIdentity(keyInfo, candidateInfo)) {
    throw new DurableTransactionError({
      code: "DURABLE_TRANSACTION_KEY_LINKS_AMBIGUOUS",
      leafName: durableTransactionKeyLeaf,
    })
  }
  await unlinkRegularLeaf(directoryGuard, candidates[0], {
    allowMultipleLinks: true,
    sync: true,
    hooks,
  })
  const normalized = await statRegularLeaf(
    directoryGuard,
    durableTransactionKeyLeaf,
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
  let handle = null
  try {
    await assertDirectoryStable(directoryGuard)
    handle = await open(
      leafPath(directoryGuard, candidate),
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    )
    await handle.chmod(0o600)
    await handle.writeFile(`${JSON.stringify(record)}\n`)
    await handle.sync()
    const candidateInfo = await handle.stat()
    await handle.close()
    handle = null
    try {
      await assertDirectoryStable(directoryGuard)
      await link(
        leafPath(directoryGuard, candidate),
        leafPath(directoryGuard, durableTransactionKeyLeaf),
      )
    } catch (error) {
      if (error.code !== "EEXIST") throw error
      await unlinkRegularLeaf(directoryGuard, candidate, {
        allowMissing: true,
        allowMultipleLinks: true,
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
    await unlinkRegularLeaf(directoryGuard, candidate, {
      allowMultipleLinks: true,
      sync: true,
      hooks,
    })
    return { key: secret, keyId: record.keyId }
  } finally {
    await handle?.close().catch(() => {})
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

async function normalizePublishedJournalLinks(directoryGuard, leafName, hooks) {
  const pending = pendingLeafName(leafName)
  const pendingInfo = await statRegularLeaf(directoryGuard, pending, {
    allowMissing: true,
    allowMultipleLinks: true,
  })
  const entries = await readdir(directoryGuard.path)
  const pattern = journalCandidatePattern(pending)
  const candidateNames = entries.filter((entry) => pattern.test(entry))
  if (!pendingInfo) {
    for (const candidate of candidateNames) {
      await unlinkRegularLeaf(directoryGuard, candidate, {
        allowMissing: true,
        allowMultipleLinks: true,
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
  if (!sameIdentity(pendingInfo, candidateInfo)) {
    throw new DurableTransactionError({
      code: "DURABLE_TRANSACTION_JOURNAL_LINKS_AMBIGUOUS",
      leafName,
    })
  }
  await unlinkRegularLeaf(directoryGuard, candidateNames[0], {
    allowMultipleLinks: true,
    sync: true,
    hooks,
  })
  const normalized = await statRegularLeaf(directoryGuard, pending)
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
  let handle = null
  let published = false
  try {
    await assertDirectoryStable(directoryGuard)
    handle = await open(
      leafPath(directoryGuard, candidate),
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    )
    await handle.chmod(0o600)
    await handle.writeFile(`${JSON.stringify(record)}\n`)
    await handle.sync()
    const descriptor = await handle.stat()
    await handle.close()
    handle = null
    const candidateInfo = await statRegularLeaf(directoryGuard, candidate)
    if (!sameIdentity(descriptor, candidateInfo)) {
      throw new UnsafeFilesystemShapeError(
        "FILESYSTEM_LEAF_REPLACED",
        candidate,
      )
    }
    await assertDirectoryStable(directoryGuard)
    await link(
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
    await handle?.close().catch(() => {})
    await unlinkRegularLeaf(directoryGuard, candidate, {
      allowMissing: true,
      allowMultipleLinks: true,
      sync: published,
      hooks,
    }).catch(() => {})
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
  if (!(await normalizePublishedJournalLinks(directoryGuard, leafName, hooks))) {
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
      await assertDirectoryStable(directoryGuard)
      await rename(
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
      allowMultipleLinks: true,
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
  let handle = null
  let temporaryIdentity = null
  let intentCreated = false
  try {
    await assertDirectoryStable(directoryGuard)
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
    await handle?.close().catch(() => {})
    if (!intentCreated) {
      await unlinkRegularLeaf(directoryGuard, temporary, {
        allowMissing: true,
        allowMultipleLinks: true,
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
  await assertDirectoryStable(directoryGuard)
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
    await assertDirectoryStable(directoryGuard)
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
