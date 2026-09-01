#!/usr/bin/env node
import os from "node:os"
import path from "node:path"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import { defaultStateDirectory } from "../src/config.mjs"
import {
  buildLaunchAgentPlist,
  discoverActiveLaunchAgentPlists,
  discoverOrchestratorProcessMatches,
  installDisabledLaunchAgent,
  installAndStartLaunchAgent,
  launchAgentLabel,
  launchAgentStatus,
  startOnceLaunchAgent,
  uninstallLaunchAgent,
  validateLaunchAgentInputs,
} from "../src/launchd.mjs"
import {
  materializeRuntimeRelease,
  planRuntimeReleaseFromCheckout,
  runtimeManifestContentsForPlan,
  verifyRuntimeRelease,
} from "../src/runtime-bundle.mjs"
import {
  readWatcherHealth,
  serviceConfigurationDigest,
  watcherServiceProfile,
} from "../src/watcher-v2.mjs"

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
  if (
    !new Set([
      "install",
      "install-disabled",
      "start-once",
      "uninstall",
      "status",
      "render",
      "help",
    ]).has(command)
  ) {
    throw new Error(`Unknown service command: ${command}`)
  }
  const stateDirectory = defaultStateDirectory()
  const config = {
    command,
    label: launchAgentLabel,
    plistPath: path.join(os.homedir(), "Library", "LaunchAgents", `${launchAgentLabel}.plist`),
    nodeBinary: process.execPath,
    orchestratorScript,
    checkoutPath: path.join(
      stateDirectory,
      "coordinator",
      "koalafrog-hq",
    ),
    codexBinary: "/Applications/ChatGPT.app/Contents/Resources/codex",
    stateDirectory,
    stdoutPath: path.join(stateDirectory, "service", "orchestrator.stdout.log"),
    stderrPath: path.join(stateDirectory, "service", "orchestrator.stderr.log"),
    pollMs: 60_000,
    baseRef: "origin/main",
    maxTurns: 12,
    turnTimeoutMs: 20 * 60_000,
    maxRetries: 2,
    retryBaseMs: 1_000,
    discoveryLimit: 50,
    maxTasksPerPoll: 1,
    repository: "Sillyquack/koalafrog-hq",
    autoCommit: false,
    model: null,
    requiredLabel: "koalafrog-orchestrator",
    runAtLoad: false,
    keepAlive: false,
    exitTimeOut: 90,
    throttleInterval: 60,
    umask: 0o077,
    shutdownTimeoutMs: 75_000,
    healthPath: path.join(stateDirectory, "watcher-v2-health.json"),
    startupTimeoutMs: 30_000,
    stabilityWindowMs: 2_000,
    cleanupTimeoutMs: 75_000,
  }
  let customStdoutPath = false
  let customStderrPath = false
  let customRuntimeDirectory = false
  config.runtimeDirectory = path.join(config.stateDirectory, "runtime")
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
      case "--runtime-dir":
        config.runtimeDirectory = path.resolve(take())
        customRuntimeDirectory = true
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
      case "--discovery-limit":
        config.discoveryLimit = positiveInteger(take(), arg)
        break
      case "--max-tasks-per-poll":
        config.maxTasksPerPoll = positiveInteger(take(), arg)
        break
      case "--model":
        config.model = take()
        break
      case "--required-label":
        config.requiredLabel = take()
        break
      case "--approve-run-at-load":
        config.runAtLoad = true
        break
      case "--startup-timeout-ms":
        config.startupTimeoutMs = positiveInteger(take(), arg)
        break
      case "--startup-stability-ms":
        config.stabilityWindowMs = positiveInteger(take(), arg)
        break
      case "--startup-cleanup-timeout-ms":
        config.cleanupTimeoutMs = positiveInteger(take(), arg)
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
  if (!customRuntimeDirectory) {
    config.runtimeDirectory = path.join(config.stateDirectory, "runtime")
  }
  config.healthPath = path.join(config.stateDirectory, "watcher-v2-health.json")
  if (
    new Set(["install-disabled", "start-once"]).has(config.command) &&
    config.runAtLoad
  ) {
    throw new Error(`${config.command} rejects --approve-run-at-load`)
  }
  return config
}

const help = `Koalafrog orchestrator macOS LaunchAgent

Usage:
  node tools/orchestrator/bin/orchestrator-service.mjs install [options]
  node tools/orchestrator/bin/orchestrator-service.mjs install-disabled [options]
  node tools/orchestrator/bin/orchestrator-service.mjs start-once [options]
  node tools/orchestrator/bin/orchestrator-service.mjs status
  node tools/orchestrator/bin/orchestrator-service.mjs uninstall
  node tools/orchestrator/bin/orchestrator-service.mjs render [options]

Options:
  --checkout path             Dedicated coordinating Git checkout
  --repository owner/name     GitHub repository to scan
  --state-dir path            Durable orchestrator state root
  --runtime-dir path          Immutable service runtime releases
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
  --discovery-limit number    Bounded open-issue search result count
  --max-tasks-per-poll number Bounded claimed tasks per poll
  --model model               Optional explicit Codex model
  --required-label label      Required persistent-watch opt-in label
  --approve-run-at-load       Explicit post-canary owner-approved boot start
  --startup-timeout-ms number Bounded start-once PID/health deadline
  --startup-stability-ms num  Post-health process stability window
  --startup-cleanup-timeout-ms num  Fail-disabled bootout deadline

Persistent watcher v2 never enables service-wide --auto-commit or KeepAlive.
install-disabled materializes the runtime and atomically installs a validated
RunAtLoad=false plist without bootstrap, load, kickstart, or watcher execution.
start-once verifies that installed profile, bootstraps and kickstarts it once,
and succeeds only after exact PID/health identity remains stable. Any startup
failure is booted out and leaves the installed profile disabled.
Failed installation leaves the service disabled and preserves diagnostics.
`

async function main() {
  const config = parse(process.argv.slice(2))
  if (config.command === "help") {
    process.stdout.write(help)
    return
  }
  if (config.command === "status") {
    const status = await launchAgentStatus({ label: config.label })
    const health = await readWatcherHealth(config.healthPath)
    process.stdout.write(`${JSON.stringify({ service: status, health })}\n`)
    return
  }
  if (config.command === "uninstall") {
    const result = await uninstallLaunchAgent(config)
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return
  }

  const runtimePlan = await planRuntimeReleaseFromCheckout({
    checkoutPath: config.checkoutPath,
    stateDirectory: config.stateDirectory,
    runtimeDirectory: config.runtimeDirectory,
  })
  const manifestSha256 = createHash("sha256")
    .update(runtimeManifestContentsForPlan(runtimePlan))
    .digest("hex")
  const serviceConfigWithoutDigest = {
    ...config,
    orchestratorScript: runtimePlan.orchestratorScript,
    expectedRuntimeRelease: runtimePlan.digest,
    expectedManifestSha256: manifestSha256,
    expectedSourceCommit: runtimePlan.sourceIdentity.commit,
    expectedSourceTree: runtimePlan.sourceIdentity.tree,
    serviceLabel: config.label,
    serviceRunAtLoad: config.runAtLoad,
    serviceKeepAlive: false,
    serviceExitTimeOut: config.exitTimeOut,
    serviceThrottleInterval: config.throttleInterval,
    serviceUmask: config.umask,
  }
  const serviceConfigSha256 = serviceConfigurationDigest(
    watcherServiceProfile(serviceConfigWithoutDigest),
  )
  const serviceConfig = {
    ...serviceConfigWithoutDigest,
    serviceConfigSha256,
    evidenceDirectory: path.join(
      config.stateDirectory,
      "service",
      "disabled",
      "watcher-v2-install-attempts",
    ),
  }
  const contents = buildLaunchAgentPlist(serviceConfig)
  if (config.command === "render") {
    process.stdout.write(contents)
    return
  }
  await validateLaunchAgentInputs(config)
  const runtime =
    config.command === "start-once"
      ? await verifyRuntimeRelease(runtimePlan)
      : await materializeRuntimeRelease(runtimePlan)
  await validateLaunchAgentInputs(serviceConfig)
  const [candidatePlistPaths, processMatches] = await Promise.all([
    discoverActiveLaunchAgentPlists(serviceConfig),
    discoverOrchestratorProcessMatches(),
  ])
  const install =
    config.command === "install-disabled"
      ? installDisabledLaunchAgent
      : config.command === "start-once"
        ? startOnceLaunchAgent
        : installAndStartLaunchAgent
  const result = await install({
    ...serviceConfig,
    contents,
    candidatePlistPaths,
    processMatches,
  })
  process.stdout.write(`${JSON.stringify({
    ...result,
    installationMode:
      config.command === "install-disabled"
        ? "disabled"
        : config.command === "start-once"
          ? "start-once"
          : "active",
    runtimeStatus: runtime.status,
    runtimeRelease: runtime.releaseDirectory,
    runtimeManifestSha256: manifestSha256,
    sourceCommit: runtimePlan.sourceIdentity.commit,
    sourceTree: runtimePlan.sourceIdentity.tree,
    orchestratorScript: runtime.orchestratorScript,
    checkoutPath: config.checkoutPath,
    stdoutPath: config.stdoutPath,
    stderrPath: config.stderrPath,
    serviceConfigSha256,
  })}\n`)
}

main().catch((error) => {
  process.stderr.write(`orchestrator service failed: ${error.message}\n`)
  process.exitCode = 1
})
