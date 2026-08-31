#!/usr/bin/env node
import { parseConfig } from "../src/config.mjs"
import {
  runRepositoryOnce,
  watchRepository,
} from "../src/repository-runner.mjs"
import {
  readWatcherHealth,
  ShutdownCoordinator,
} from "../src/watcher-v2.mjs"

async function main() {
  const config = parseConfig(process.argv.slice(2))
  if (config.command === "help") {
    process.stdout.write(
      "Repository orchestrator: scans all open issues for agent_control blocks and runs each task with per-issue durable state.\n",
    )
    return
  }
  if (config.command === "status") {
    const status = await readWatcherHealth(config.healthPath)
    process.stdout.write(`${JSON.stringify(status)}\n`)
    return
  }

  const shutdown = new ShutdownCoordinator({
    timeoutMs: config.shutdownTimeoutMs,
  })
  let deadlineTimer = null
  const requestShutdown = (signalName) => {
    const status = shutdown.request(signalName)
    process.stderr.write(
      `repository orchestrator shutdown requested (${signalName}, signal ${status.signalCount})\n`,
    )
    deadlineTimer ??= setTimeout(() => {
      process.stderr.write(
        "repository orchestrator graceful shutdown deadline exceeded\n",
      )
      process.exitCode = 1
    }, config.shutdownTimeoutMs)
    deadlineTimer.unref?.()
  }
  const onSigint = () => requestShutdown("SIGINT")
  const onSigterm = () => requestShutdown("SIGTERM")
  process.on("SIGINT", onSigint)
  process.on("SIGTERM", onSigterm)

  try {
    if (config.command === "watch") {
      await watchRepository(config, { signal: shutdown.controller.signal })
    } else {
      const results = await runRepositoryOnce(config)
      process.stdout.write(`${JSON.stringify(results)}\n`)
    }
  } finally {
    clearTimeout(deadlineTimer)
    process.off("SIGINT", onSigint)
    process.off("SIGTERM", onSigterm)
  }
}

main().catch((error) => {
  process.stderr.write(`repository orchestrator failed: ${error.message}\n`)
  process.exitCode = 1
})
