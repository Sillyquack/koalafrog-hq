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
  rename,
  unlink,
  writeFile,
} from "node:fs/promises"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export const launchAgentLabel = "com.sillyquack.koalafrog-orchestrator"

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

export async function installAndStartLaunchAgent({
  label = launchAgentLabel,
  plistPath,
  contents,
  stdoutPath,
  stderrPath,
  uid = process.getuid(),
  run = defaultRun,
  sleep = delay,
  retryDelayMs = 250,
  unloadAttempts = 120,
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
  const domain = `gui/${uid}`
  const target = launchAgentTarget(label, uid)
  const loaded = false

  let bootstrapError = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await run("launchctl", ["bootstrap", domain, plistPath])
      if (result.code !== 0) {
        throw new Error(result.stderr || `launchctl bootstrap exited ${result.code}`)
      }
      bootstrapError = null
      break
    } catch (error) {
      bootstrapError = error
      if (attempt < 2) await sleep(retryDelayMs * 2 ** attempt)
    }
  }
  if (bootstrapError) {
    let disableError = null
    let attemptedEvidencePath = null
    try {
      await run("launchctl", ["bootout", target], { allowFailure: true })
      const stillLoaded = await run("launchctl", ["print", target], {
        allowFailure: true,
      })
      if (stillLoaded.code === 0) {
        throw new Error("failed watcher service remains loaded")
      }
      attemptedEvidencePath = await preserveServiceEvidence(
        evidenceDirectory,
        { label, kind: "failed-attempt", contents },
      )
      await unlink(plistPath).catch((error) => {
        if (error.code !== "ENOENT") throw error
      })
    } catch (error) {
      disableError = error
    }
    if (disableError) {
      throw new Error(
        `LaunchAgent bootstrap failed (${bootstrapError.message}); fail-disabled cleanup also failed (${disableError.message})`,
      )
    }
    const error = new Error(
      `LaunchAgent bootstrap failed; service remains disabled: ${bootstrapError.message}`,
    )
    error.code = "LAUNCH_AGENT_INSTALL_FAILED_DISABLED"
    error.previousEvidencePath = previousEvidencePath
    error.attemptedEvidencePath = attemptedEvidencePath
    throw error
  }
  return {
    writeStatus,
    reloaded: loaded,
    label,
    plistPath,
    target,
    previousEvidencePath,
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
