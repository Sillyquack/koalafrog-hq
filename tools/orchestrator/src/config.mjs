import os from "node:os"
import path from "node:path"

function defaultStateDirectory() {
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
  if (!new Set(["once", "watch", "help"]).has(command)) {
    throw new Error(`Unknown command: ${command}`)
  }

  const config = {
    command,
    repository: "Sillyquack/koalafrog-hq",
    issueNumber: 53,
    checkoutPath: cwd,
    stateDirectory: defaultStateDirectory(),
    baseRef: "origin/main",
    pollMs: 15_000,
    maxTurns: 12,
    turnTimeoutMs: 20 * 60_000,
    maxRetries: 2,
    retryBaseMs: 1_000,
    codexBinary: "codex",
    model: null,
    allowedPaths: [],
    autoCommit: false,
    fetchRemote: true,
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
      case "--auto-commit":
        config.autoCommit = true
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
    config.retryBaseMs < 1
  ) {
    throw new Error(
      "Issue, max turns, timeout, poll interval, and retry base must be positive",
    )
  }
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
  --poll-ms milliseconds        Watch interval (default: 15000)
  --max-turns number            Hard local turn ceiling (default: 12)
  --turn-timeout-ms number      Per-turn timeout (default: 1200000)
  --max-retries number          Bounded failed-turn retries (default: 2)
  --retry-base-ms number        Exponential backoff base (default: 1000)
  --codex-bin path              Codex CLI binary (default: codex)
  --model model                 Optional explicit Codex model
  --allowed-path repo/path      Restrict changed files; repeatable
  --auto-commit                 Commit owned workspace changes after a turn
  --skip-fetch                  Do not fetch origin before creating a worktree
`
