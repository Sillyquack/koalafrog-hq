import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { constants } from "node:fs"
import {
  access,
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { promisify } from "node:util"
import {
  darwinXpcproxyExecutable,
  inspectDarwinProcessIdentity,
} from "./darwin-process-identity.mjs"

const execFileAsync = promisify(execFile)

export const launchAgentLabel = "com.sillyquack.koalafrog-orchestrator"
export const defaultServiceStartupTimeoutMs = 30_000
export const defaultServiceStabilityWindowMs = 2_000
export const defaultServiceCleanupTimeoutMs = 75_000

export async function discoverActiveLaunchAgentPlists({
  plistPath,
  label = launchAgentLabel,
}) {
  const directory = path.dirname(plistPath)
  let names
  try {
    names = await readdir(directory)
  } catch (error) {
    if (error.code === "ENOENT") return []
    throw error
  }
  return names
    .filter(
      (name) =>
        name.endsWith(".plist") &&
        (name === `${label}.plist` || name.startsWith(`${label}.`)),
    )
    .map((name) => path.join(directory, name))
    .filter((candidate) => candidate !== plistPath)
    .sort()
}

export async function discoverOrchestratorProcessMatches({
  run = defaultRun,
  currentPid = process.pid,
} = {}) {
  const result = await run("ps", ["-axo", "pid=,ppid=,command="], {
    allowFailure: true,
  })
  if (result.code !== 0) {
    throw new Error("Unable to inspect existing orchestrator processes")
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/)
      return match
        ? { pid: Number(match[1]), parentPid: Number(match[2]), command: match[3] }
        : null
    })
    .filter(Boolean)
    .filter(({ pid, command }) =>
      pid !== currentPid &&
      (/(?:repository-orchestrator|orchestrator-service)\.mjs\b.*\bwatch\b/.test(command) ||
        /Koalafrog Orchestrator\/runtime\/releases\/.+repository-orchestrator\.mjs/.test(command) ||
        /git-(?:mutation|execution)-broker.*Koalafrog/i.test(command) ||
        /\bgit\b.*Koalafrog/i.test(command) ||
        /codex app-server.*Koalafrog/i.test(command)),
    )
}

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function assertAbsolute(name, value) {
  if (!path.isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path`)
  }
}

function argumentLines(arguments_) {
  return arguments_.map((argument) => `    <string>${xml(argument)}</string>`).join("\n")
}

export function buildLaunchAgentPlist({
  label = launchAgentLabel,
  nodeBinary,
  orchestratorScript,
  checkoutPath,
  codexBinary,
  stateDirectory,
  stdoutPath,
  stderrPath,
  healthPath = path.join(stateDirectory, "watcher-v2-health.json"),
  repository = "Sillyquack/koalafrog-hq",
  pollMs = 60_000,
  baseRef = "origin/main",
  maxTurns = 12,
  turnTimeoutMs = 20 * 60_000,
  maxRetries = 2,
  retryBaseMs = 1_000,
  discoveryLimit = 50,
  maxTasksPerPoll = 1,
  autoCommit = false,
  model = null,
  requiredLabel = "koalafrog-orchestrator",
  expectedRuntimeRelease,
  expectedManifestSha256,
  expectedSourceCommit,
  expectedSourceTree,
  serviceConfigSha256,
  runAtLoad = false,
  keepAlive = false,
  exitTimeOut = 90,
  throttleInterval = 60,
  umask = 0o077,
  shutdownTimeoutMs = 75_000,
}) {
  for (const [name, value] of Object.entries({
    nodeBinary,
    orchestratorScript,
    checkoutPath,
    codexBinary,
    stateDirectory,
    stdoutPath,
    stderrPath,
    healthPath,
  })) {
    assertAbsolute(name, value)
  }
  if (!/^[A-Za-z0-9.-]+$/.test(label)) {
    throw new Error("LaunchAgent label contains unsafe characters")
  }
  if (!/^[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+$/.test(repository)) {
    throw new Error("repository must use owner/name form")
  }
  if (autoCommit) {
    throw new Error("Persistent watcher v2 forbids service-wide auto-commit")
  }
  if (!requiredLabel || !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,99}$/.test(requiredLabel)) {
    throw new Error("Persistent watcher v2 requires a safe opt-in label")
  }
  for (const [name, value] of Object.entries({
    expectedRuntimeRelease,
    expectedManifestSha256,
    serviceConfigSha256,
  })) {
    if (!/^[a-f0-9]{64}$/.test(value ?? "")) {
      throw new Error(`${name} must be a SHA-256 identity`)
    }
  }
  for (const [name, value] of Object.entries({
    expectedSourceCommit,
    expectedSourceTree,
  })) {
    if (!/^[a-f0-9]{40}$/.test(value ?? "")) {
      throw new Error(`${name} must be a Git object identity`)
    }
  }
  if (
    !Number.isSafeInteger(exitTimeOut) ||
    exitTimeOut < 1 ||
    !Number.isSafeInteger(throttleInterval) ||
    throttleInterval < 1 ||
    !Number.isSafeInteger(umask) ||
    umask < 0 ||
    umask > 0o777 ||
    !Number.isSafeInteger(shutdownTimeoutMs) ||
    shutdownTimeoutMs < 1 ||
    shutdownTimeoutMs >= exitTimeOut * 1_000
  ) {
    throw new Error("LaunchAgent timing or umask policy is invalid")
  }

  const arguments_ = [
    nodeBinary,
    orchestratorScript,
    "watch",
    "--repository",
    repository,
    "--checkout",
    checkoutPath,
    "--codex-bin",
    codexBinary,
    "--state-dir",
    stateDirectory,
    "--health-path",
    healthPath,
    "--poll-ms",
    String(pollMs),
    "--base-ref",
    baseRef,
    "--max-turns",
    String(maxTurns),
    "--turn-timeout-ms",
    String(turnTimeoutMs),
    "--max-retries",
    String(maxRetries),
    "--retry-base-ms",
    String(retryBaseMs),
    "--discovery-limit",
    String(discoveryLimit),
    "--max-tasks-per-poll",
    String(maxTasksPerPoll),
    "--required-label",
    requiredLabel,
    "--expected-runtime-release",
    expectedRuntimeRelease,
    "--expected-manifest-sha256",
    expectedManifestSha256,
    "--expected-source-commit",
    expectedSourceCommit,
    "--expected-source-tree",
    expectedSourceTree,
    "--expected-service-config-sha256",
    serviceConfigSha256,
    "--service-label",
    label,
    "--service-run-at-load",
    String(runAtLoad),
    "--service-keep-alive",
    String(keepAlive),
    "--service-exit-timeout",
    String(exitTimeOut),
    "--service-throttle-interval",
    String(throttleInterval),
    "--service-umask",
    String(umask),
    "--shutdown-timeout-ms",
    String(shutdownTimeoutMs),
  ]
  if (model) arguments_.push("--model", model)

  const keepAliveXml = keepAlive
    ? `  <key>KeepAlive</key>\n  <true/>\n`
    : ""

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xml(label)}</string>
  <key>ProgramArguments</key>
  <array>
${argumentLines(arguments_)}
  </array>
  <key>WorkingDirectory</key>
  <string>${xml(checkoutPath)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key>
  <${runAtLoad ? "true" : "false"}/>
${keepAliveXml}  <key>ExitTimeOut</key>
  <integer>${exitTimeOut}</integer>
  <key>ThrottleInterval</key>
  <integer>${throttleInterval}</integer>
  <key>ProcessType</key>
  <string>Background</string>
  <key>Umask</key>
  <integer>${umask}</integer>
  <key>StandardOutPath</key>
  <string>${xml(stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(stderrPath)}</string>
</dict>
</plist>
`
}

async function readExisting(filePath) {
  try {
    return await readFile(filePath, "utf8")
  } catch (error) {
    if (error.code === "ENOENT") return null
    throw error
  }
}

async function preserveServiceEvidence(
  directory,
  { label, kind, contents },
) {
  if (!directory || contents === null) return null
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const hash = createHash("sha256").update(contents).digest("hex")
  const evidencePath = path.join(
    directory,
    `${label}.${kind}.${hash}.plist.disabled`,
  )
  if ((await readExisting(evidencePath)) === null) {
    await writeFile(evidencePath, contents, { mode: 0o600 })
  }
  await chmod(evidencePath, 0o600)
  return evidencePath
}

async function preserveStartEvidence(directory, { label, evidence }) {
  if (!directory) return null
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const contents = `${JSON.stringify(evidence, null, 2)}\n`
  const hash = createHash("sha256").update(contents).digest("hex")
  const evidencePath = path.join(
    directory,
    `${label}.failed-start.${hash}.json.disabled`,
  )
  if ((await readExisting(evidencePath)) === null) {
    await writeFile(evidencePath, contents, { mode: 0o600 })
  }
  await chmod(evidencePath, 0o600)
  return evidencePath
}

export async function preflightLaunchAgentCoexistence({
  label = launchAgentLabel,
  plistPath,
  candidatePlistPaths = [],
  processMatches = [],
  uid = process.getuid(),
  run = defaultRun,
}) {
  const target = launchAgentTarget(label, uid)
  const service = await run("launchctl", ["print", target], {
    allowFailure: true,
  })
  const candidates = [...new Set([plistPath, ...candidatePlistPaths])]
  const existingCandidates = []
  for (const candidate of candidates) {
    if ((await readExisting(candidate)) !== null) existingCandidates.push(candidate)
  }
  if (service.code === 0) {
    throw new Error(`Existing LaunchAgent service is active: ${target}`)
  }
  if (processMatches.length > 0) {
    throw new Error("Existing orchestrator process tree must stop before install")
  }
  if (existingCandidates.filter((candidate) => candidate !== plistPath).length) {
    throw new Error("Multiple active LaunchAgent plist candidates were detected")
  }
  return {
    target,
    loaded: false,
    activePlistPresent: existingCandidates.includes(plistPath),
    candidateCount: existingCandidates.length,
  }
}

export async function writeLaunchAgentPlist({
  plistPath,
  contents,
  stdoutPath,
  stderrPath,
  validate = null,
}) {
  await mkdir(path.dirname(plistPath), { recursive: true, mode: 0o755 })
  await mkdir(path.dirname(stdoutPath), { recursive: true, mode: 0o700 })
  await mkdir(path.dirname(stderrPath), { recursive: true, mode: 0o700 })
  const existing = await readExisting(plistPath)
  if (existing === contents) {
    await chmod(plistPath, 0o600)
    return "unchanged"
  }
  const temporary = `${plistPath}.${process.pid}.tmp`
  await writeFile(temporary, contents, { mode: 0o600 })
  try {
    if (validate) await validate(temporary)
    await rename(temporary, plistPath)
  } catch (error) {
    await unlink(temporary).catch((unlinkError) => {
      if (unlinkError.code !== "ENOENT") throw unlinkError
    })
    throw error
  }
  await chmod(plistPath, 0o600)
  return existing === null ? "created" : "updated"
}

export function validateDisabledLaunchAgentPlist(contents) {
  const runAtLoadEntries =
    typeof contents === "string"
      ? [...contents.matchAll(/<key>RunAtLoad<\/key>\s*<(true|false)\/>/g)]
      : []
  if (runAtLoadEntries.length !== 1 || runAtLoadEntries[0][1] !== "false") {
    throw new Error("Disabled LaunchAgent installation requires RunAtLoad=false")
  }
  if (/<key>KeepAlive<\/key>/.test(contents)) {
    throw new Error("Disabled LaunchAgent installation forbids KeepAlive")
  }
  return contents
}

export function validateInstalledLaunchAgentPlist(
  contents,
  { approveRunAtLoad = false } = {},
) {
  const runAtLoadEntries =
    typeof contents === "string"
      ? [...contents.matchAll(/<key>RunAtLoad<\/key>\s*<(true|false)\/>/g)]
      : []
  if (runAtLoadEntries.length !== 1) {
    throw new Error("Installed LaunchAgent profile requires exactly one RunAtLoad value")
  }
  const runAtLoad = runAtLoadEntries[0][1] === "true"
  if (runAtLoad && !approveRunAtLoad) {
    throw new Error(
      "Starting an installed RunAtLoad=true profile requires --approve-run-at-load",
    )
  }
  if (/<key>KeepAlive<\/key>/.test(contents)) {
    throw new Error("Installed LaunchAgent profile forbids KeepAlive")
  }
  const arguments_ = parseLaunchAgentProgramArguments(contents)
  if (arguments_.includes("--auto-commit")) {
    throw new Error("Installed LaunchAgent profile forbids service-wide auto-commit")
  }
  return Object.freeze({ runAtLoad, keepAlive: false, autoCommit: false })
}

export function parseLaunchAgentPrint(contents) {
  const value = typeof contents === "string" ? contents : ""
  const number = (pattern) => {
    const parsed = Number.parseInt(value.match(pattern)?.[1] ?? "", 10)
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  return Object.freeze({
    pid: number(/(?:^|\n)\s*pid\s*=\s*(\d+)\b/i),
    launchCount: number(/(?:^|\n)\s*(?:runs|launch count)\s*=\s*(\d+)\b/i),
    state: value.match(/(?:^|\n)\s*state\s*=\s*([^\n]+)/i)?.[1]?.trim() ?? null,
  })
}

async function healthSnapshot(healthPath) {
  try {
    const contents = await readFile(healthPath)
    const metadata = await stat(healthPath)
    let health = null
    try {
      health = JSON.parse(contents.toString("utf8"))
    } catch {
      // A partial or malformed record can never satisfy startup readiness.
    }
    return {
      exists: true,
      sha256: createHash("sha256").update(contents).digest("hex"),
      mtimeMs: metadata.mtimeMs,
      health,
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      return { exists: false, sha256: null, mtimeMs: null, health: null }
    }
    throw error
  }
}

function validateExpectedHealth(health, expected, { pid, startedAtMs, before }) {
  if (!health || typeof health !== "object") {
    return { accepted: false, reason: "health record is absent or malformed" }
  }
  if (!health.startupSessionId || health.startupSessionId === before.health?.startupSessionId) {
    return { accepted: false, reason: "health startup session is stale" }
  }
  if (health.servicePid !== pid) {
    return { accepted: false, reason: "health PID does not match launchd PID" }
  }
  const startupTimestamp = Date.parse(health.startupTimestamp)
  if (!Number.isFinite(startupTimestamp) || startupTimestamp < startedAtMs - 1_000) {
    return { accepted: false, reason: "health startup timestamp is stale" }
  }
  if (health.state === "stopped") {
    return { accepted: false, reason: "health reports a stopped service" }
  }
  const fields = [
    "serviceLabel",
    "runtimeRelease",
    "manifestSha256",
    "sourceCommit",
    "sourceTree",
    "repository",
    "coordinatorCheckout",
    "serviceConfigSha256",
    "watcherMode",
    "requiredLabel",
    "runAtLoad",
    "keepAlive",
    "pollMs",
    "maxTasksPerPoll",
  ]
  for (const field of fields) {
    if (health[field] !== expected[field]) {
      return { accepted: false, reason: `health ${field} identity mismatch` }
    }
  }
  if (health.autoCommit !== false) {
    return { accepted: false, reason: "health unexpectedly enables auto-commit" }
  }
  return { accepted: true }
}

function decodeXmlString(value) {
  const decoded = value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
  if (/&(?:#\d+|#x[a-f0-9]+|[a-z][a-z0-9]+);/i.test(decoded)) {
    throw new Error("LaunchAgent ProgramArguments contains unsupported XML entities")
  }
  return decoded
}

export function parseLaunchAgentProgramArguments(contents) {
  if (typeof contents !== "string") {
    throw new Error("LaunchAgent plist contents must be text")
  }
  if (/<key>Program<\/key>/.test(contents)) {
    throw new Error("Watcher LaunchAgent profile must derive Program from ProgramArguments")
  }
  const matches = [
    ...contents.matchAll(
      /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/g,
    ),
  ]
  if (matches.length !== 1) {
    throw new Error("LaunchAgent plist must contain exactly one ProgramArguments array")
  }
  const body = matches[0][1]
  const arguments_ = [...body.matchAll(/<string>([\s\S]*?)<\/string>/g)].map(
    (match) => decodeXmlString(match[1]),
  )
  const residue = body.replace(/<string>[\s\S]*?<\/string>/g, "").trim()
  if (arguments_.length < 3 || residue !== "") {
    throw new Error("LaunchAgent ProgramArguments is missing or malformed")
  }
  return Object.freeze(arguments_)
}

async function expectedServiceProcessIdentity({
  contents,
  nodeBinary,
  orchestratorScript,
}) {
  const argv = parseLaunchAgentProgramArguments(contents)
  if (
    argv[0] !== nodeBinary ||
    argv[1] !== orchestratorScript ||
    argv[2] !== "watch"
  ) {
    throw new Error("Installed LaunchAgent execution identity is inconsistent")
  }
  const configuredNode = await lstat(nodeBinary)
  if (configuredNode.isSymbolicLink()) {
    throw new Error("Approved Node executable must not be a symbolic link")
  }
  if (!configuredNode.isFile()) {
    throw new Error("Approved Node executable must be a regular file")
  }
  const resolvedNode = await realpath(nodeBinary)
  if (resolvedNode !== path.resolve(nodeBinary)) {
    throw new Error("Approved Node executable path does not resolve canonically")
  }
  const metadata = await stat(resolvedNode)
  return Object.freeze({
    executablePath: resolvedNode,
    executableDevice: String(metadata.dev),
    executableInode: String(metadata.ino),
    argv,
  })
}

function firstArgvDifference(actual, expected) {
  const length = Math.max(actual.length, expected.length)
  for (let index = 0; index < length; index += 1) {
    if (actual[index] !== expected[index]) {
      if (index >= actual.length) return `argv is missing index ${index}`
      if (index >= expected.length) return `argv contains unexpected index ${index}`
      return `argv differs at index ${index}`
    }
  }
  return null
}

function classifyServiceProcess(processIdentity, expected) {
  if (processIdentity.executablePath === darwinXpcproxyExecutable) {
    if (processIdentity.kernelExecutablePath !== darwinXpcproxyExecutable) {
      return {
        classification: "unavailable",
        accepted: false,
        transitional: false,
        reason: "xpcproxy executable evidence is internally inconsistent",
      }
    }
    return {
      classification: "xpcproxy_pre_exec",
      accepted: false,
      transitional: true,
      reason: "launchd PID remains in xpcproxy pre-exec",
    }
  }
  if (
    processIdentity.executablePath !== expected.executablePath ||
    processIdentity.kernelExecutablePath !== expected.executablePath
  ) {
    return {
      classification: "unexpected_process",
      accepted: false,
      transitional: false,
      reason: `unexpected service executable: ${processIdentity.executablePath}`,
    }
  }
  if (
    processIdentity.executableDevice !== expected.executableDevice ||
    processIdentity.executableInode !== expected.executableInode
  ) {
    return {
      classification: "unexpected_process",
      accepted: false,
      transitional: false,
      reason: "approved Node executable device/inode identity changed",
    }
  }
  const argvDifference = firstArgvDifference(processIdentity.argv, expected.argv)
  if (argvDifference) {
    return {
      classification: "unexpected_process",
      accepted: false,
      transitional: false,
      reason: `service process ${argvDifference}`,
    }
  }
  return {
    classification: "expected_node",
    accepted: true,
    transitional: false,
    reason: null,
  }
}

async function defaultRun(command, args, { allowFailure = false } = {}) {
  try {
    const result = await execFileAsync(command, args, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    })
    return { code: 0, stdout: result.stdout, stderr: result.stderr }
  } catch (error) {
    if (!allowFailure) throw error
    return {
      code: Number.isInteger(error.code) ? error.code : 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? error.message,
    }
  }
}

function commandError(command, args, result) {
  return new Error(
    result.stderr ||
      result.stdout ||
      `${command} ${args.join(" ")} exited ${String(result.code)}`,
  )
}

async function runRequired(run, command, args) {
  const result = await run(command, args)
  if (result.code !== 0) throw commandError(command, args, result)
  return result
}

export async function validateLaunchAgentInputs(
  { nodeBinary, orchestratorScript, checkoutPath, codexBinary },
  {
    accessPath = access,
    inspectPath = lstat,
  } = {},
) {
  await Promise.all([
    accessPath(nodeBinary, constants.X_OK),
    accessPath(codexBinary, constants.X_OK),
    accessPath(orchestratorScript, constants.R_OK),
  ])
  const checkout = await inspectPath(checkoutPath)
  if (!checkout.isDirectory()) {
    throw new Error("--checkout must identify a coordinating Git checkout")
  }
  const gitDirectory = await inspectPath(path.join(checkoutPath, ".git"))
  if (!gitDirectory.isDirectory()) {
    throw new Error(
      "--checkout must be the stable coordinating checkout, not a linked task worktree",
    )
  }
}

export function launchAgentTarget(label = launchAgentLabel, uid = process.getuid()) {
  return `gui/${uid}/${label}`
}

async function prepareLaunchAgentInstallation({
  label = launchAgentLabel,
  plistPath,
  contents,
  stdoutPath,
  stderrPath,
  uid = process.getuid(),
  run = defaultRun,
  evidenceDirectory = null,
  candidatePlistPaths = [],
  processMatches = [],
}) {
  const previousContents = await readExisting(plistPath)
  await preflightLaunchAgentCoexistence({
    label,
    plistPath,
    candidatePlistPaths,
    processMatches,
    uid,
    run,
  })
  if (previousContents !== null) {
    const previousLabel = previousContents.match(
      /<key>Label<\/key>\s*<string>([^<]+)<\/string>/,
    )?.[1]
    if (previousLabel !== label) {
      throw new Error(
        "Inactive LaunchAgent plist does not match the expected service identity",
      )
    }
  }
  const previousEvidencePath = await preserveServiceEvidence(
    evidenceDirectory,
    {
      label,
      kind: "previous-inactive",
      contents: previousContents,
    },
  )
  const validate = async (candidatePath) => {
    await runRequired(run, "plutil", ["-lint", candidatePath])
  }
  const writeStatus = await writeLaunchAgentPlist({
    plistPath,
    contents,
    stdoutPath,
    stderrPath,
    validate,
  })
  if (writeStatus === "unchanged") await validate(plistPath)
  return {
    writeStatus,
    label,
    plistPath,
    target: launchAgentTarget(label, uid),
    previousEvidencePath,
  }
}

async function failDisabledCleanup({
  label,
  plistPath,
  contents,
  target,
  run,
  evidenceDirectory,
}) {
  const failures = []
  let attemptedEvidencePath = null
  try {
    attemptedEvidencePath = await preserveServiceEvidence(
      evidenceDirectory,
      { label, kind: "failed-attempt", contents },
    )
  } catch (error) {
    failures.push(`evidence preservation: ${error.message}`)
  }
  try {
    await run("launchctl", ["bootout", target], { allowFailure: true })
  } catch (error) {
    failures.push(`launchctl bootout: ${error.message}`)
  }
  try {
    await unlink(plistPath)
  } catch (error) {
    if (error.code !== "ENOENT") {
      failures.push(`active plist removal: ${error.message}`)
    }
  }
  try {
    const stillLoaded = await run("launchctl", ["print", target], {
      allowFailure: true,
    })
    if (stillLoaded.code === 0) {
      failures.push("LaunchAgent target remains loaded")
    }
  } catch (error) {
    failures.push(`launchctl absence verification: ${error.message}`)
  }
  if (failures.length > 0) {
    throw new Error(failures.join("; "))
  }
  return attemptedEvidencePath
}

export async function installDisabledLaunchAgent({
  label = launchAgentLabel,
  plistPath,
  contents,
  stdoutPath,
  stderrPath,
  uid = process.getuid(),
  run = defaultRun,
  evidenceDirectory = null,
  candidatePlistPaths = [],
  processMatches = [],
  inspectProcesses = discoverOrchestratorProcessMatches,
  postWriteVerification = null,
}) {
  validateDisabledLaunchAgentPlist(contents)
  const target = launchAgentTarget(label, uid)
  let prepared = null
  try {
    prepared = await prepareLaunchAgentInstallation({
      label,
      plistPath,
      contents,
      stdoutPath,
      stderrPath,
      uid,
      run,
      evidenceDirectory,
      candidatePlistPaths,
      processMatches,
    })
    const installed = await readFile(plistPath, "utf8")
    if (installed !== contents) {
      throw new Error("Disabled LaunchAgent plist readback mismatch")
    }
    if (((await stat(plistPath)).mode & 0o777) !== 0o600) {
      throw new Error("Disabled LaunchAgent plist mode is not 0600")
    }
    await runRequired(run, "plutil", ["-lint", plistPath])
    const service = await run("launchctl", ["print", target], {
      allowFailure: true,
    })
    if (service.code === 0) {
      throw new Error("Disabled LaunchAgent unexpectedly became loaded")
    }
    const remainingProcesses = await inspectProcesses()
    if (remainingProcesses.length > 0) {
      throw new Error("Disabled LaunchAgent installation started a process tree")
    }
    if (postWriteVerification) {
      await postWriteVerification({
        ...prepared,
        contents,
        plistSha256: createHash("sha256").update(contents).digest("hex"),
      })
    }
    return {
      ...prepared,
      loaded: false,
      plistSha256: createHash("sha256").update(contents).digest("hex"),
    }
  } catch (error) {
    const currentContents = await readExisting(plistPath)
    if (prepared || currentContents === contents) {
      let cleanupError = null
      let attemptedEvidencePath = null
      try {
        attemptedEvidencePath = await failDisabledCleanup({
          label,
          plistPath,
          contents,
          target,
          run,
          evidenceDirectory,
        })
      } catch (failure) {
        cleanupError = failure
      }
      if (cleanupError) {
        throw new Error(
          `Disabled LaunchAgent install failed (${error.message}); fail-disabled cleanup also failed (${cleanupError.message})`,
        )
      }
      const failure = new Error(
        `Disabled LaunchAgent install failed; service remains disabled: ${error.message}`,
      )
      failure.code = "LAUNCH_AGENT_DISABLED_INSTALL_FAILED"
      failure.previousEvidencePath = prepared?.previousEvidencePath ?? null
      failure.attemptedEvidencePath = attemptedEvidencePath
      throw failure
    }
    throw error
  }
}

function expectedStartupHealth({
  label,
  expectedRuntimeRelease,
  expectedManifestSha256,
  expectedSourceCommit,
  expectedSourceTree,
  repository,
  checkoutPath,
  serviceConfigSha256,
  requiredLabel,
  runAtLoad,
  keepAlive,
  pollMs,
  maxTasksPerPoll,
}) {
  return Object.freeze({
    serviceLabel: label,
    runtimeRelease: expectedRuntimeRelease,
    manifestSha256: expectedManifestSha256,
    sourceCommit: expectedSourceCommit,
    sourceTree: expectedSourceTree,
    repository,
    coordinatorCheckout: path.resolve(checkoutPath),
    serviceConfigSha256,
    watcherMode: "watch",
    requiredLabel,
    runAtLoad,
    keepAlive,
    pollMs,
    maxTasksPerPoll,
  })
}

async function cleanupFailedStart({
  label,
  plistPath,
  contents,
  target,
  run,
  sleep,
  now,
  inspectProcesses,
  evidenceDirectory,
  cleanupTimeoutMs,
  removePlistOnFailure,
  validatePreservedPlist = validateDisabledLaunchAgentPlist,
  preservedPlistKind = "disabled",
  startEvidence,
}) {
  const failures = []
  let startEvidencePath = null
  try {
    await run("launchctl", ["bootout", target], { allowFailure: true })
  } catch (error) {
    failures.push(`launchctl bootout: ${error.message}`)
  }

  const deadline = now() + cleanupTimeoutMs
  let targetLoaded = true
  let remainingProcesses = []
  do {
    try {
      targetLoaded =
        (await run("launchctl", ["print", target], { allowFailure: true })).code === 0
    } catch (error) {
      failures.push(`launchctl absence verification: ${error.message}`)
      targetLoaded = true
      break
    }
    try {
      remainingProcesses = await inspectProcesses()
    } catch (error) {
      failures.push(`process-tree verification: ${error.message}`)
      remainingProcesses = [{ error: error.message }]
      break
    }
    if (!targetLoaded && remainingProcesses.length === 0) break
    if (now() >= deadline) break
    await sleep(Math.min(100, Math.max(1, deadline - now())))
  } while (true)

  if (targetLoaded) failures.push("LaunchAgent target remains loaded")
  if (remainingProcesses.length > 0) {
    failures.push("orchestrator process tree remains after bootout")
  }
  try {
    startEvidencePath = await preserveStartEvidence(evidenceDirectory, {
      label,
      evidence: startEvidence,
    })
  } catch (error) {
    failures.push(`start evidence preservation: ${error.message}`)
  }
  try {
    await preserveServiceEvidence(evidenceDirectory, {
      label,
      kind: "failed-attempt",
      contents,
    })
  } catch (error) {
    failures.push(`plist evidence preservation: ${error.message}`)
  }
  if (removePlistOnFailure) {
    try {
      await unlink(plistPath)
    } catch (error) {
      if (error.code !== "ENOENT") failures.push(`active plist removal: ${error.message}`)
    }
  } else {
    try {
      const installed = await readFile(plistPath, "utf8")
      if (installed !== contents) {
        failures.push(`installed ${preservedPlistKind} plist drifted`)
      }
      validatePreservedPlist(installed)
    } catch (error) {
      failures.push(`${preservedPlistKind} plist preservation: ${error.message}`)
    }
  }
  if (failures.length > 0) {
    const error = new Error(failures.join("; "))
    error.startEvidencePath = startEvidencePath
    throw error
  }
  return { startEvidencePath }
}

async function verifiedLaunchAgentStart({
  label,
  plistPath,
  contents,
  healthPath,
  nodeBinary,
  orchestratorScript,
  uid,
  run,
  sleep,
  now,
  inspectProcesses,
  evidenceDirectory,
  startupTimeoutMs,
  stabilityWindowMs,
  cleanupTimeoutMs,
  removePlistOnFailure,
  validatePreservedPlist,
  preservedPlistKind,
  expectedHealth,
  inspectProcessIdentity,
}) {
  const domain = `gui/${uid}`
  const target = launchAgentTarget(label, uid)
  const expectedProcess = await expectedServiceProcessIdentity({
    contents,
    nodeBinary,
    orchestratorScript,
  })
  const operationStartedAtMs = now()
  const healthBefore = await healthSnapshot(healthPath)
  const evidence = {
    schemaVersion: 1,
    label,
    target,
    plistPath,
    healthPath,
    startedAt: new Date(operationStartedAtMs).toISOString(),
    healthBefore: {
      exists: healthBefore.exists,
      sha256: healthBefore.sha256,
      mtimeMs: healthBefore.mtimeMs,
      startupSessionId: healthBefore.health?.startupSessionId ?? null,
      servicePid: healthBefore.health?.servicePid ?? null,
    },
    bootstrap: null,
    kickstart: null,
    observations: [],
    failure: null,
  }
  try {
    const bootstrap = await run("launchctl", ["bootstrap", domain, plistPath])
    if (bootstrap.code !== 0) {
      throw commandError("launchctl", ["bootstrap", domain, plistPath], bootstrap)
    }
    evidence.bootstrap = { succeeded: true, at: new Date(now()).toISOString() }

    const definition = await run("launchctl", ["print", target], {
      allowFailure: true,
    })
    if (definition.code !== 0) {
      throw new Error("LaunchAgent definition is absent after bootstrap")
    }
    const beforeKickstart = parseLaunchAgentPrint(definition.stdout)

    const startupBeganAtMs = now()
    const kickstart = await run("launchctl", ["kickstart", "-p", target])
    if (kickstart.code !== 0) {
      throw commandError("launchctl", ["kickstart", "-p", target], kickstart)
    }
    const kickstartPid = Number.parseInt(kickstart.stdout.match(/\d+/)?.[0] ?? "", 10)
    evidence.kickstart = {
      succeeded: true,
      at: new Date(now()).toISOString(),
      reportedPid: Number.isSafeInteger(kickstartPid) ? kickstartPid : null,
      launchCountBefore: beforeKickstart.launchCount,
    }

    const deadline = startupBeganAtMs + startupTimeoutMs
    let observedPid = null
    let observedLaunchCount = null
    let readyAtMs = null
    let lastHealthReason = "new health has not been published"
    let lastProcessReason = "launchd PID has not appeared"
    let finalHealthSnapshot = null
    while (now() <= deadline) {
      const observation = {
        at: new Date(now()).toISOString(),
        pid: null,
        launchCount: null,
        state: null,
        executablePath: null,
        executableDevice: null,
        executableInode: null,
        kernelExecutablePath: null,
        argvRetrievalStatus: "not_attempted",
        argv: null,
        classification: "unavailable",
        healthExists: null,
        healthSha256: null,
        healthState: null,
        healthStartupSessionId: null,
        healthServicePid: null,
        decision: "pending",
        reason: null,
      }
      const record = () => {
        evidence.observations.push(observation)
      }
      const reject = (reason) => {
        observation.decision = "reject"
        observation.reason = reason
        record()
        throw new Error(reason)
      }
      const printed = await run("launchctl", ["print", target], {
        allowFailure: true,
      })
      if (printed.code !== 0) {
        reject("LaunchAgent target disappeared during startup")
      }
      const launchd = parseLaunchAgentPrint(printed.stdout)
      observation.pid = launchd.pid
      observation.launchCount = launchd.launchCount
      observation.state = launchd.state
      if (
        launchd.pid === null &&
        new Set(["exited", "stopped"]).has(launchd.state?.toLowerCase())
      ) {
        reject("LaunchAgent exited before startup identity was ready")
      }
      if (launchd.pid !== null) {
        if (observedPid !== null && launchd.pid !== observedPid) {
          reject("LaunchAgent PID changed during startup")
        }
        observedPid ??= launchd.pid
        if (Number.isSafeInteger(kickstartPid) && observedPid !== kickstartPid) {
          reject("launchd PID differs from kickstart PID")
        }
      } else if (observedPid !== null) {
        reject("LaunchAgent exited during startup")
      }
      if (launchd.launchCount !== null) {
        if (
          observedLaunchCount !== null &&
          launchd.launchCount !== observedLaunchCount
        ) {
          reject("LaunchAgent launch count changed during startup")
        }
        observedLaunchCount ??= launchd.launchCount
      }

      if (observedPid !== null) {
        let processIdentity
        try {
          processIdentity = await inspectProcessIdentity(observedPid)
          observation.executablePath = processIdentity.executablePath
          observation.executableDevice = processIdentity.executableDevice
          observation.executableInode = processIdentity.executableInode
          observation.kernelExecutablePath = processIdentity.kernelExecutablePath
          observation.argvRetrievalStatus = "available"
          observation.argv = [...processIdentity.argv]
        } catch (error) {
          observation.argvRetrievalStatus = "error"
          reject(error.message)
        }
        const processDecision = classifyServiceProcess(
          processIdentity,
          expectedProcess,
        )
        observation.classification = processDecision.classification
        lastProcessReason = processDecision.reason
        if (!processDecision.accepted && !processDecision.transitional) {
          reject(processDecision.reason)
        }

        finalHealthSnapshot = await healthSnapshot(healthPath)
        observation.healthExists = finalHealthSnapshot.exists
        observation.healthSha256 = finalHealthSnapshot.sha256
        observation.healthState = finalHealthSnapshot.health?.state ?? null
        observation.healthStartupSessionId =
          finalHealthSnapshot.health?.startupSessionId ?? null
        observation.healthServicePid = finalHealthSnapshot.health?.servicePid ?? null
        if (processDecision.transitional) {
          observation.decision = "not_ready"
          observation.reason = processDecision.reason
          record()
          await sleep(Math.min(100, Math.max(1, deadline - now())))
          continue
        }
        const newHealth =
          finalHealthSnapshot.exists &&
          (finalHealthSnapshot.sha256 !== healthBefore.sha256 ||
            finalHealthSnapshot.mtimeMs > (healthBefore.mtimeMs ?? -1))
        if (newHealth) {
          const decision = validateExpectedHealth(
            finalHealthSnapshot.health,
            expectedHealth,
            { pid: observedPid, startedAtMs: startupBeganAtMs, before: healthBefore },
          )
          lastHealthReason = decision.reason ?? null
          if (decision.accepted) readyAtMs ??= now()
          else if (readyAtMs !== null) {
            reject(`Watcher health changed after readiness: ${decision.reason}`)
          }
          else if (
            finalHealthSnapshot.health?.startupSessionId &&
            finalHealthSnapshot.health.startupSessionId !==
              healthBefore.health?.startupSessionId
          ) {
            reject(decision.reason)
          }
        } else if (readyAtMs !== null) {
          reject("Watcher health disappeared after readiness")
        }
      }

      observation.decision = readyAtMs === null ? "not_ready" : "stabilizing"
      observation.reason = readyAtMs === null ? lastHealthReason : null
      record()
      if (readyAtMs !== null && now() - readyAtMs >= stabilityWindowMs) {
        const health = finalHealthSnapshot.health
        return {
          label,
          target,
          loaded: true,
          pid: observedPid,
          launchCount: observedLaunchCount,
          startupTimestamp: health.startupTimestamp,
          startupSessionId: health.startupSessionId,
          runtimeRelease: health.runtimeRelease,
          manifestSha256: health.manifestSha256,
          sourceCommit: health.sourceCommit,
          sourceTree: health.sourceTree,
          repository: health.repository,
          serviceConfigSha256: health.serviceConfigSha256,
          healthPath,
          healthSha256: finalHealthSnapshot.sha256,
          plistPath,
          plistSha256: createHash("sha256").update(contents).digest("hex"),
          runAtLoad: health.runAtLoad,
          keepAlive: health.keepAlive,
          startupTimeoutMs,
          stabilityWindowMs,
        }
      }
      await sleep(Math.min(100, Math.max(1, deadline - now())))
    }
    throw new Error(
      `Watcher health startup timed out: ${lastProcessReason ?? lastHealthReason}`,
    )
  } catch (error) {
    evidence.failure = {
      message: error.message,
      at: new Date(now()).toISOString(),
    }
    let cleanup = null
    try {
      cleanup = await cleanupFailedStart({
        label,
        plistPath,
        contents,
        target,
        run,
        sleep,
        now,
        inspectProcesses,
        evidenceDirectory,
        cleanupTimeoutMs,
        removePlistOnFailure,
        validatePreservedPlist,
        preservedPlistKind,
        startEvidence: evidence,
      })
    } catch (cleanupError) {
      const failure = new Error(
        `Verified LaunchAgent start failed (${error.message}); fail-disabled cleanup also failed (${cleanupError.message})`,
      )
      failure.code = "LAUNCH_AGENT_START_CLEANUP_INCOMPLETE"
      failure.startEvidencePath = cleanupError.startEvidencePath ?? null
      throw failure
    }
    const failure = new Error(
      `Verified LaunchAgent start failed; service remains disabled: ${error.message}`,
    )
    failure.code = "LAUNCH_AGENT_START_FAILED_DISABLED"
    failure.startEvidencePath = cleanup?.startEvidencePath ?? null
    throw failure
  }
}

async function startExistingLaunchAgent({
  label = launchAgentLabel,
  plistPath,
  contents,
  healthPath,
  nodeBinary,
  orchestratorScript,
  checkoutPath,
  repository,
  requiredLabel,
  expectedRuntimeRelease,
  expectedManifestSha256,
  expectedSourceCommit,
  expectedSourceTree,
  serviceConfigSha256,
  pollMs = 60_000,
  maxTasksPerPoll = 1,
  uid = process.getuid(),
  run = defaultRun,
  sleep = delay,
  now = Date.now,
  evidenceDirectory = null,
  candidatePlistPaths = [],
  processMatches = [],
  inspectProcesses = discoverOrchestratorProcessMatches,
  inspectProcessIdentity = inspectDarwinProcessIdentity,
  startupTimeoutMs = defaultServiceStartupTimeoutMs,
  stabilityWindowMs = defaultServiceStabilityWindowMs,
  cleanupTimeoutMs = defaultServiceCleanupTimeoutMs,
  validateProfile,
  preservedPlistKind,
}) {
  const canonicalProfile = validateProfile(contents)
  for (const [name, value] of Object.entries({
    startupTimeoutMs,
    stabilityWindowMs,
    cleanupTimeoutMs,
  })) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${name} must be a positive integer`)
    }
  }
  const installed = await readFile(plistPath, "utf8")
  const installedProfile = validateProfile(installed)
  if (installed !== contents) {
    throw new Error("Installed LaunchAgent plist does not match canonical profile")
  }
  if (
    installedProfile.runAtLoad !== canonicalProfile.runAtLoad ||
    installedProfile.keepAlive !== canonicalProfile.keepAlive
  ) {
    throw new Error("Installed LaunchAgent policy does not match canonical profile")
  }
  if (((await stat(plistPath)).mode & 0o777) !== 0o600) {
    throw new Error("Installed LaunchAgent plist mode is not 0600")
  }
  await runRequired(run, "plutil", ["-lint", plistPath])
  await preflightLaunchAgentCoexistence({
    label,
    plistPath,
    candidatePlistPaths,
    processMatches,
    uid,
    run,
  })
  return verifiedLaunchAgentStart({
    label,
    plistPath,
    contents,
    healthPath,
    nodeBinary,
    orchestratorScript,
    uid,
    run,
    sleep,
    now,
    inspectProcesses,
    inspectProcessIdentity,
    evidenceDirectory,
    startupTimeoutMs,
    stabilityWindowMs,
    cleanupTimeoutMs,
    removePlistOnFailure: false,
    validatePreservedPlist: validateProfile,
    preservedPlistKind,
    expectedHealth: expectedStartupHealth({
      label,
      expectedRuntimeRelease,
      expectedManifestSha256,
      expectedSourceCommit,
      expectedSourceTree,
      repository,
      checkoutPath,
      serviceConfigSha256,
      requiredLabel,
      runAtLoad: installedProfile.runAtLoad,
      keepAlive: installedProfile.keepAlive,
      pollMs,
      maxTasksPerPoll,
    }),
  })
}

export async function startOnceLaunchAgent(options) {
  return startExistingLaunchAgent({
    ...options,
    validateProfile: (contents) => {
      validateDisabledLaunchAgentPlist(contents)
      return Object.freeze({ runAtLoad: false, keepAlive: false, autoCommit: false })
    },
    preservedPlistKind: "disabled",
  })
}

export async function startInstalledLaunchAgent({
  approveRunAtLoad = false,
  ...options
}) {
  return startExistingLaunchAgent({
    ...options,
    validateProfile: (contents) =>
      validateInstalledLaunchAgentPlist(contents, { approveRunAtLoad }),
    preservedPlistKind: "installed",
  })
}

export async function installAndStartLaunchAgent({
  label = launchAgentLabel,
  plistPath,
  contents,
  stdoutPath,
  stderrPath,
  uid = process.getuid(),
  run = defaultRun,
  sleep = delay,
  now = Date.now,
  evidenceDirectory = null,
  candidatePlistPaths = [],
  processMatches = [],
  inspectProcesses = discoverOrchestratorProcessMatches,
  inspectProcessIdentity = inspectDarwinProcessIdentity,
  startupTimeoutMs = defaultServiceStartupTimeoutMs,
  stabilityWindowMs = defaultServiceStabilityWindowMs,
  cleanupTimeoutMs = defaultServiceCleanupTimeoutMs,
  healthPath,
  nodeBinary,
  orchestratorScript,
  checkoutPath,
  repository,
  requiredLabel,
  expectedRuntimeRelease,
  expectedManifestSha256,
  expectedSourceCommit,
  expectedSourceTree,
  serviceConfigSha256,
  runAtLoad = false,
  keepAlive = false,
  pollMs = 60_000,
  maxTasksPerPoll = 1,
}) {
  const prepared = await prepareLaunchAgentInstallation({
    label,
    plistPath,
    contents,
    stdoutPath,
    stderrPath,
    uid,
    run,
    evidenceDirectory,
    candidatePlistPaths,
    processMatches,
  })
  const { target } = prepared
  const started = await verifiedLaunchAgentStart({
    label,
    plistPath,
    contents,
    healthPath,
    nodeBinary,
    orchestratorScript,
    uid,
    run,
    sleep,
    now,
    inspectProcesses,
    inspectProcessIdentity,
    evidenceDirectory,
    startupTimeoutMs,
    stabilityWindowMs,
    cleanupTimeoutMs,
    removePlistOnFailure: true,
    expectedHealth: expectedStartupHealth({
      label,
      expectedRuntimeRelease,
      expectedManifestSha256,
      expectedSourceCommit,
      expectedSourceTree,
      repository,
      checkoutPath,
      serviceConfigSha256,
      requiredLabel,
      runAtLoad,
      keepAlive,
      pollMs,
      maxTasksPerPoll,
    }),
  })
  return {
    ...started,
    writeStatus: prepared.writeStatus,
    target,
    previousEvidencePath: prepared.previousEvidencePath,
  }
}

export async function uninstallLaunchAgent({
  label = launchAgentLabel,
  plistPath,
  uid = process.getuid(),
  run = defaultRun,
}) {
  const target = launchAgentTarget(label, uid)
  const loaded = (await run("launchctl", ["print", target], { allowFailure: true })).code === 0
  if (loaded) await run("launchctl", ["bootout", target])
  try {
    await unlink(plistPath)
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }
  return { label, plistPath, stopped: loaded, statePreserved: true }
}

export async function launchAgentStatus({
  label = launchAgentLabel,
  uid = process.getuid(),
  run = defaultRun,
}) {
  const target = launchAgentTarget(label, uid)
  const result = await run("launchctl", ["print", target], {
    allowFailure: true,
  })
  return { ...result, label, target, loaded: result.code === 0 }
}
