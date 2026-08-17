#!/usr/bin/env node
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { defaultStateDirectory } from "../src/config.mjs"
import {
  buildLaunchAgentPlist,
  installAndStartLaunchAgent,
  launchAgentLabel,
  launchAgentStatus,
  uninstallLaunchAgent,
  validateLaunchAgentInputs,
} from "../src/launchd.mjs"

const orchestratorScript = fileURLToPath(
  new URL("./repository-orchestrator.mjs", import.meta.url),
)
const repositoryRoot = path.resolve(path.dirname(orchestratorScript), "../../..")

function valueAfter(args, index, name) {
  const value = args[index + 1]
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`)
  return value
}

function positiveInteger(value, name) {
  const number = Number.parseInt(value, 10)
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error(`${name} must be a positive integer`)
  }
  return number
}

function parse(argv) {
  const args = [...argv]
  const command = args.shift() ?? "help"
  if (!new Set(["install", "uninstall", "status", "render", "help"]).has(command)) {
    throw new Error(`Unknown service command: ${command}`)
  }
  const stateDirectory = defaultStateDirectory()
  const config = {
    command,
    label: launchAgentLabel,
    plistPath: path.join(os.homedir(), "Library", "LaunchAgents", `${launchAgentLabel}.plist`),
    nodeBinary: process.execPath,
    orchestratorScript,
    checkoutPath: repositoryRoot,
    codexBinary: "/Applications/ChatGPT.app/Contents/Resources/codex",
    stateDirectory,
    stdoutPath: path.join(stateDirectory, "service", "orchestrator.stdout.log"),
    stderrPath: path.join(stateDirectory, "service", "orchestrator.stderr.log"),
    pollMs: 15_000,
    baseRef: "origin/main",
    maxTurns: 12,
    turnTimeoutMs: 20 * 60_000,
    maxRetries: 2,
    retryBaseMs: 1_000,
    repository: "Sillyquack/koalafrog-hq",
    autoCommit: false,
    model: null,
  }
  let customStdoutPath = false
  let customStderrPath = false
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const take = () => {
      const value = valueAfter(args, index, arg)
      index += 1
      return value
    }
    switch (arg) {
      case "--checkout":
        config.checkoutPath = path.resolve(take())
        break
      case "--repository":
        config.repository = take()
        break
      case "--state-dir":
        config.stateDirectory = path.resolve(take())
        break
      case "--codex-bin":
        config.codexBinary = path.resolve(take())
        break
      case "--node-bin":
        config.nodeBinary = path.resolve(take())
        break
      case "--plist-path":
        config.plistPath = path.resolve(take())
        break
      case "--stdout-path":
        config.stdoutPath = path.resolve(take())
        customStdoutPath = true
        break
      case "--stderr-path":
        config.stderrPath = path.resolve(take())
        customStderrPath = true
        break
      case "--poll-ms":
        config.pollMs = positiveInteger(take(), arg)
        break
      case "--base-ref":
        config.baseRef = take()
        break
      case "--max-turns":
        config.maxTurns = positiveInteger(take(), arg)
        break
      case "--turn-timeout-ms":
        config.turnTimeoutMs = positiveInteger(take(), arg)
        break
      case "--max-retries":
        config.maxRetries = positiveInteger(take(), arg)
        break
      case "--retry-base-ms":
        config.retryBaseMs = positiveInteger(take(), arg)
        break
      case "--model":
        config.model = take()
        break
      case "--auto-commit":
        config.autoCommit = true
        break
      default:
        throw new Error(`Unknown service option: ${arg}`)
    }
  }
  if (!customStdoutPath) {
    config.stdoutPath = path.join(config.stateDirectory, "service", "orchestrator.stdout.log")
  }
  if (!customStderrPath) {
    config.stderrPath = path.join(config.stateDirectory, "service", "orchestrator.stderr.log")
  }
  return config
}

const help = `Koalafrog orchestrator macOS LaunchAgent

Usage:
  node tools/orchestrator/bin/orchestrator-service.mjs install [options]
  node tools/orchestrator/bin/orchestrator-service.mjs status
  node tools/orchestrator/bin/orchestrator-service.mjs uninstall
  node tools/orchestrator/bin/orchestrator-service.mjs render [options]

Options:
  --checkout path             Coordinating Git checkout
  --repository owner/name     GitHub repository to scan
  --state-dir path            Durable orchestrator state root
  --codex-bin path            Authenticated Codex CLI binary
  --node-bin path             Node executable
  --plist-path path           LaunchAgent plist destination
  --stdout-path path          launchd stdout log
  --stderr-path path          launchd stderr log
  --poll-ms number            Bounded GitHub polling interval
  --base-ref ref              New-worktree base
  --max-turns number          Hard turn limit
  --turn-timeout-ms number    Per-turn timeout
  --max-retries number        Bounded retry count
  --retry-base-ms number      Retry backoff base
  --model model               Optional explicit Codex model
  --auto-commit               Commit task-owned changes after a successful turn
`

async function main() {
  const config = parse(process.argv.slice(2))
  if (config.command === "help") {
    process.stdout.write(help)
    return
  }
  if (config.command === "status") {
    const status = await launchAgentStatus({ label: config.label })
    process.stdout.write(status.stdout || status.stderr)
    process.exitCode = status.loaded ? 0 : 1
    return
  }
  if (config.command === "uninstall") {
    const result = await uninstallLaunchAgent(config)
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return
  }

  const contents = buildLaunchAgentPlist(config)
  if (config.command === "render") {
    process.stdout.write(contents)
    return
  }
  await validateLaunchAgentInputs(config)
  const result = await installAndStartLaunchAgent({ ...config, contents })
  process.stdout.write(`${JSON.stringify({ ...result, stdoutPath: config.stdoutPath, stderrPath: config.stderrPath })}\n`)
}

main().catch((error) => {
  process.stderr.write(`orchestrator service failed: ${error.message}\n`)
  process.exitCode = 1
})
