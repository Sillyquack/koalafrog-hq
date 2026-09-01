import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export const darwinXpcproxyExecutable = "/usr/libexec/xpcproxy"
export const defaultDarwinProcessInspectionTimeoutMs = 1_000

const darwinProcessInspector = String.raw`
import ctypes
import json
import os
import struct
import sys
import time

CTL_KERN = 1
KERN_PROCARGS2 = 49
PROC_PIDPATHINFO_MAXSIZE = 4096
MAX_PROCARGS_SIZE = 1024 * 1024

pid = int(sys.argv[1])
libproc = ctypes.CDLL("/usr/lib/libproc.dylib", use_errno=True)
libsystem = ctypes.CDLL("/usr/lib/libSystem.B.dylib", use_errno=True)
libproc.proc_pidpath.argtypes = [ctypes.c_int, ctypes.c_void_p, ctypes.c_uint32]
libproc.proc_pidpath.restype = ctypes.c_int
libsystem.sysctl.argtypes = [
    ctypes.POINTER(ctypes.c_int),
    ctypes.c_uint,
    ctypes.c_void_p,
    ctypes.POINTER(ctypes.c_size_t),
    ctypes.c_void_p,
    ctypes.c_size_t,
]
libsystem.sysctl.restype = ctypes.c_int

def fail(message):
    raise RuntimeError(message)

def process_path():
    buffer = ctypes.create_string_buffer(PROC_PIDPATHINFO_MAXSIZE)
    length = libproc.proc_pidpath(pid, buffer, len(buffer))
    if length <= 0:
        errno = ctypes.get_errno()
        fail("proc_pidpath failed with errno %d" % errno)
    return os.fsdecode(buffer.raw[:length])

def process_arguments():
    mib = (ctypes.c_int * 3)(CTL_KERN, KERN_PROCARGS2, pid)
    size = ctypes.c_size_t(0)
    if libsystem.sysctl(mib, 3, None, ctypes.byref(size), None, 0) != 0:
        fail("KERN_PROCARGS2 size lookup failed with errno %d" % ctypes.get_errno())
    if size.value < ctypes.sizeof(ctypes.c_int) or size.value > MAX_PROCARGS_SIZE:
        fail("KERN_PROCARGS2 returned an invalid size")
    buffer = ctypes.create_string_buffer(size.value)
    if libsystem.sysctl(mib, 3, buffer, ctypes.byref(size), None, 0) != 0:
        fail("KERN_PROCARGS2 read failed with errno %d" % ctypes.get_errno())
    data = buffer.raw[:size.value]
    argc = struct.unpack_from("=i", data, 0)[0]
    if argc < 1 or argc > 4096:
        fail("KERN_PROCARGS2 returned an invalid argc")
    offset = ctypes.sizeof(ctypes.c_int)
    executable_end = data.find(b"\0", offset)
    if executable_end < 0:
        fail("KERN_PROCARGS2 omitted the executable terminator")
    kernel_executable = os.fsdecode(data[offset:executable_end])
    offset = executable_end
    while offset < len(data) and data[offset] == 0:
        offset += 1
    argv = []
    for _ in range(argc):
        argument_end = data.find(b"\0", offset)
        if argument_end < 0:
            fail("KERN_PROCARGS2 returned truncated argv")
        argv.append(os.fsdecode(data[offset:argument_end]))
        offset = argument_end + 1
    return kernel_executable, argv

last_transition = None
for attempt in range(4):
    before = process_path()
    kernel_executable, argv = process_arguments()
    after = process_path()
    if before == after:
        metadata = os.stat(after, follow_symlinks=True)
        print(json.dumps({
            "pid": pid,
            "executablePath": after,
            "executableDevice": str(metadata.st_dev),
            "executableInode": str(metadata.st_ino),
            "kernelExecutablePath": kernel_executable,
            "argv": argv,
        }, separators=(",", ":")))
        sys.exit(0)
    last_transition = [before, after]
    time.sleep(0.002)

fail("process executable changed during identity inspection: %r" % (last_transition,))
`

async function defaultRunInspector(pid, { timeoutMs }) {
  return execFileAsync(
    "/usr/bin/python3",
    ["-I", "-c", darwinProcessInspector, String(pid)],
    {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: timeoutMs,
      windowsHide: true,
    },
  )
}

function invalidEvidence(message) {
  const error = new Error(`Darwin process identity unavailable: ${message}`)
  error.code = "DARWIN_PROCESS_IDENTITY_UNAVAILABLE"
  return error
}

function validateIdentity(value, pid) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidEvidence("helper returned a non-object record")
  }
  if (value.pid !== pid) {
    throw invalidEvidence("helper PID does not match requested PID")
  }
  for (const field of [
    "executablePath",
    "executableDevice",
    "executableInode",
    "kernelExecutablePath",
  ]) {
    if (typeof value[field] !== "string" || value[field].length === 0) {
      throw invalidEvidence(`helper omitted ${field}`)
    }
  }
  if (
    !Array.isArray(value.argv) ||
    value.argv.length === 0 ||
    value.argv.some((argument) => typeof argument !== "string")
  ) {
    throw invalidEvidence("helper returned malformed argv")
  }
  return Object.freeze({
    pid,
    executablePath: value.executablePath,
    executableDevice: value.executableDevice,
    executableInode: value.executableInode,
    kernelExecutablePath: value.kernelExecutablePath,
    argv: Object.freeze([...value.argv]),
  })
}

export async function inspectDarwinProcessIdentity(
  pid,
  {
    platform = process.platform,
    timeoutMs = defaultDarwinProcessInspectionTimeoutMs,
    runInspector = defaultRunInspector,
  } = {},
) {
  if (platform !== "darwin") {
    throw invalidEvidence("process inspection requires Darwin")
  }
  if (!Number.isSafeInteger(pid) || pid < 1) {
    throw invalidEvidence("PID must be a positive integer")
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw invalidEvidence("inspection timeout must be positive")
  }
  let result
  try {
    result = await runInspector(pid, { timeoutMs })
  } catch (error) {
    throw invalidEvidence(error.message)
  }
  const stdout = typeof result === "string" ? result : result?.stdout
  if (typeof stdout !== "string" || stdout.trim() === "") {
    throw invalidEvidence("helper returned empty output")
  }
  let parsed
  try {
    parsed = JSON.parse(stdout)
  } catch {
    throw invalidEvidence("helper returned malformed JSON")
  }
  return validateIdentity(parsed, pid)
}
