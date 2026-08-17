import { execFile } from "node:child_process"
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export const launchAgentLabel = "com.sillyquack.koalafrog-orchestrator"

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
  pollMs = 15_000,
  baseRef = "origin/main",
  maxTurns = 12,
  turnTimeoutMs = 20 * 60_000,
  maxRetries = 2,
  retryBaseMs = 1_000,
  autoCommit = false,
  model = null,
}) {
  for (const [name, value] of Object.entries({
    nodeBinary,
    orchestratorScript,
    checkoutPath,
    codexBinary,
    stateDirectory,
    stdoutPath,
    stderrPath,
  })) {
    assertAbsolute(name, value)
  }
  if (!/^[A-Za-z0-9.-]+$/.test(label)) {
    throw new Error("LaunchAgent label contains unsafe characters")
  }

  const arguments_ = [
    nodeBinary,
    orchestratorScript,
    "watch",
    "--checkout",
    checkoutPath,
    "--codex-bin",
    codexBinary,
    "--state-dir",
    stateDirectory,
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
  ]
  if (autoCommit) arguments_.push("--auto-commit")
  if (model) arguments_.push("--model", model)

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
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>ProcessType</key>
  <string>Background</string>
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

export async function writeLaunchAgentPlist({
  plistPath,
  contents,
  stdoutPath,
  stderrPath,
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
  await rename(temporary, plistPath)
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
}) {
  const writeStatus = await writeLaunchAgentPlist({
    plistPath,
    contents,
    stdoutPath,
    stderrPath,
  })
  const domain = `gui/${uid}`
  const target = launchAgentTarget(label, uid)
  const loaded = (await run("launchctl", ["print", target], { allowFailure: true })).code === 0
  if (loaded) {
    await run("launchctl", ["bootout", target])
    let unloaded = false
    for (let attempt = 0; attempt < unloadAttempts; attempt += 1) {
      const status = await run("launchctl", ["print", target], {
        allowFailure: true,
      })
      if (status.code !== 0) {
        unloaded = true
        break
      }
      await sleep(retryDelayMs)
    }
    if (!unloaded) throw new Error(`LaunchAgent did not unload: ${target}`)
  }

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
  if (bootstrapError) throw bootstrapError
  return { writeStatus, reloaded: loaded, label, plistPath, target }
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
