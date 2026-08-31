import os from "node:os"
import path from "node:path"
import { currentStateSchemaVersion } from "./state-store.mjs"

export function defaultStateDirectory() {
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Koalafrog Orchestrator",
    )
  }
  return path.join(
    process.env.XDG_STATE_HOME ?? path.join(os.homedir(), ".local", "state"),
    "koalafrog-orchestrator",
  )
}

function takeValue(args, index, name) {
  const value = args[index + 1]
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`)
  }
  return value
}

export function parseConfig(argv, cwd = process.cwd()) {
  const args = [...argv]
  const command = args[0] && !args[0].startsWith("--") ? args.shift() : "once"
  if (!new Set(["once", "watch", "status", "help"]).has(command)) {
    throw new Error(`Unknown command: ${command}`)
  }

  const config = {
    command,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 53,
    issueNumberExplicit: false,
    checkoutPath: cwd,
    stateDirectory: defaultStateDirectory(),
    baseRef: "origin/main",
    pollMs: 60_000,
    discoveryLimit: 50,
    maxTasksPerPoll: 1,
    maxTurns: 12,
    turnTimeoutMs: 20 * 60_000,
    maxRetries: 2,
    retryBaseMs: 1_000,
    codexBinary: "codex",
    model: null,
    allowedPaths: [],
    autoCommit: false,
    terminalCloseout: false,
    fetchRemote: true,
    requiredLabel: null,
    issueAllowlist: [],
    unsafeDevelopmentWatch: false,
    shutdownTimeoutMs: 75_000,
    healthPath: null,
    supportedStateSchema: currentStateSchemaVersion,
    expectedRuntimeRelease: null,
    expectedManifestSha256: null,
    expectedSourceCommit: null,
    expectedSourceTree: null,
    expectedServiceConfigSha256: null,
    serviceLabel: null,
    serviceRunAtLoad: null,
    serviceKeepAlive: null,
    serviceExitTimeOut: null,
    serviceThrottleInterval: null,
    serviceUmask: null,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    const numeric = (name) => {
      const value = Number.parseInt(takeValue(args, index, name), 10)
      index += 1
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${name} must be a non-negative integer`)
      }
      return value
    }
    switch (arg) {
      case "--repository":
        config.repository = takeValue(args, index, arg)
        index += 1
        break
      case "--issue":
        config.issueNumber = numeric(arg)
        config.issueNumberExplicit = true
        break
      case "--checkout":
        config.checkoutPath = path.resolve(takeValue(args, index, arg))
        index += 1
        break
      case "--state-dir":
        config.stateDirectory = path.resolve(takeValue(args, index, arg))
        index += 1
        break
      case "--base-ref":
        config.baseRef = takeValue(args, index, arg)
        index += 1
        break
      case "--poll-ms":
        config.pollMs = numeric(arg)
        break
      case "--discovery-limit":
        config.discoveryLimit = numeric(arg)
        break
      case "--max-tasks-per-poll":
        config.maxTasksPerPoll = numeric(arg)
        break
      case "--max-turns":
        config.maxTurns = numeric(arg)
        break
      case "--turn-timeout-ms":
        config.turnTimeoutMs = numeric(arg)
        break
      case "--max-retries":
        config.maxRetries = numeric(arg)
        break
      case "--retry-base-ms":
        config.retryBaseMs = numeric(arg)
        break
      case "--codex-bin":
        config.codexBinary = takeValue(args, index, arg)
        index += 1
        break
      case "--model":
        config.model = takeValue(args, index, arg)
        index += 1
        break
      case "--allowed-path":
        config.allowedPaths.push(takeValue(args, index, arg))
        index += 1
        break
      case "--required-label":
        config.requiredLabel = takeValue(args, index, arg)
        index += 1
        break
      case "--allow-issue":
        config.issueAllowlist.push(numeric(arg))
        break
      case "--unsafe-development-watch":
        config.unsafeDevelopmentWatch = true
        break
      case "--shutdown-timeout-ms":
        config.shutdownTimeoutMs = numeric(arg)
        break
      case "--health-path":
        config.healthPath = path.resolve(takeValue(args, index, arg))
        index += 1
        break
      case "--expected-runtime-release":
        config.expectedRuntimeRelease = takeValue(args, index, arg)
        index += 1
        break
      case "--expected-manifest-sha256":
        config.expectedManifestSha256 = takeValue(args, index, arg)
        index += 1
        break
      case "--expected-source-commit":
        config.expectedSourceCommit = takeValue(args, index, arg)
        index += 1
        break
      case "--expected-source-tree":
        config.expectedSourceTree = takeValue(args, index, arg)
        index += 1
        break
      case "--expected-service-config-sha256":
        config.expectedServiceConfigSha256 = takeValue(args, index, arg)
        index += 1
        break
      case "--service-label":
        config.serviceLabel = takeValue(args, index, arg)
        index += 1
        break
      case "--service-run-at-load":
      case "--service-keep-alive": {
        const value = takeValue(args, index, arg)
        index += 1
        if (!new Set(["true", "false"]).has(value)) {
          throw new Error(`${arg} must be true or false`)
        }
        config[
          arg === "--service-run-at-load"
            ? "serviceRunAtLoad"
            : "serviceKeepAlive"
        ] = value === "true"
        break
      }
      case "--service-exit-timeout":
        config.serviceExitTimeOut = numeric(arg)
        break
      case "--service-throttle-interval":
        config.serviceThrottleInterval = numeric(arg)
        break
      case "--service-umask":
        config.serviceUmask = numeric(arg)
        break
      case "--auto-commit":
        config.autoCommit = true
        break
      case "--terminal-closeout":
        config.terminalCloseout = true
        break
      case "--skip-fetch":
        config.fetchRemote = false
        break
      default:
        throw new Error(`Unknown option: ${arg}`)
    }
  }

  if (!/^[-A-Za-z0-9_.]+\/[-A-Za-z0-9_.]+$/.test(config.repository)) {
    throw new Error("--repository must use owner/name form")
  }
  if (
    config.issueNumber < 1 ||
    config.maxTurns < 1 ||
    config.turnTimeoutMs < 1 ||
    config.pollMs < 1 ||
    config.discoveryLimit < 1 ||
    config.maxTasksPerPoll < 1 ||
    config.retryBaseMs < 1 ||
    config.shutdownTimeoutMs < 1
  ) {
    throw new Error(
      "Issue, limits, max turns, timeout, poll interval, and retry base must be positive",
    )
  }
  if (
    config.terminalCloseout &&
    (config.command !== "once" ||
      !config.issueNumberExplicit ||
      config.autoCommit)
  ) {
    throw new Error(
      "--terminal-closeout requires once with one explicit --issue and no --auto-commit",
    )
  }
  if (
    config.requiredLabel !== null &&
    !/^[A-Za-z0-9][A-Za-z0-9._ -]{0,99}$/.test(config.requiredLabel)
  ) {
    throw new Error("--required-label contains unsafe characters")
  }
  if (new Set(config.issueAllowlist).size !== config.issueAllowlist.length) {
    throw new Error("--allow-issue values must be unique")
  }
  if (config.command === "watch" && config.autoCommit) {
    throw new Error("Persistent watch forbids service-wide --auto-commit")
  }
  if (
    config.command === "watch" &&
    !config.requiredLabel &&
    !config.issueNumberExplicit &&
    config.issueAllowlist.length === 0 &&
    !config.unsafeDevelopmentWatch
  ) {
    throw new Error(
      "Persistent watch requires --required-label, --allow-issue, or one explicit --issue",
    )
  }
  if (config.command === "watch" && config.maxTasksPerPoll !== 1) {
    throw new Error("Persistent watcher v2 requires --max-tasks-per-poll 1")
  }
  config.healthPath ??= path.join(
    config.stateDirectory,
    "watcher-v2-health.json",
  )
  config.canaryMode = config.command === "watch" && config.issueNumberExplicit
  return config
}

export const helpText = `Koalafrog local Codex orchestrator

Usage:
  node tools/orchestrator/bin/orchestrator.mjs once [options]
  node tools/orchestrator/bin/orchestrator.mjs watch [options]

Options:
  --repository owner/name       GitHub repository (default: Sillyquack/koalafrog-hq)
  --issue number                Durable task issue (default: 53)
  --checkout path               Clean coordinating checkout
  --state-dir path              Durable state root outside source
  --base-ref ref                Worktree base (default: origin/main)
  --poll-ms milliseconds        Watch interval (default: 60000)
  --discovery-limit number      Maximum explicit issue search results (default: 50)
  --max-tasks-per-poll number   Maximum claimed tasks per cycle (watcher v2: 1)
  --max-turns number            Hard local turn ceiling (default: 12)
  --turn-timeout-ms number      Per-turn timeout (default: 1200000)
  --max-retries number          Bounded failed-turn retries (default: 2)
  --retry-base-ms number        Exponential backoff base (default: 1000)
  --codex-bin path              Codex CLI binary (default: codex)
  --model model                 Optional explicit Codex model
  --allowed-path repo/path      Restrict changed files; repeatable
  --auto-commit                 Legacy bounded once-mode compatibility only
  --required-label label        Persistent-watch opt-in GitHub label
  --allow-issue number          Persistent-watch issue allowlist; repeatable
  --unsafe-development-watch    Non-service development override for discovery
  --shutdown-timeout-ms number  Graceful shutdown deadline (default: 75000)
  --health-path path            Read-only watcher health record path
  --expected-runtime-release id Required immutable runtime release binding
  --expected-manifest-sha256 id Required runtime manifest binding
  --expected-source-commit sha  Required canonical source commit binding
  --expected-source-tree sha    Required canonical source tree binding
  --expected-service-config-sha256 id  Required service-profile binding
  --terminal-closeout           Inspect one explicit closed issue for closeout only
  --skip-fetch                  Do not fetch origin before creating a worktree
`
