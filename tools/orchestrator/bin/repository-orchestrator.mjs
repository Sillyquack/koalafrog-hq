#!/usr/bin/env node
import { parseConfig } from "../src/config.mjs"
import {
  runRepositoryOnce,
  watchRepository,
} from "../src/repository-runner.mjs"

async function main() {
  const config = parseConfig(process.argv.slice(2))
  if (config.command === "help") {
    process.stdout.write(
      "Repository orchestrator: scans all open issues for agent_control blocks and runs each task with per-issue durable state.\n",
    )
    return
  }

  const controller = new AbortController()
  const shutdown = () => controller.abort()
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)

  if (config.command === "watch") {
    await watchRepository(config, { signal: controller.signal })
  } else {
    const results = await runRepositoryOnce(config)
    process.stdout.write(`${JSON.stringify(results)}\n`)
  }
}

main().catch((error) => {
  process.stderr.write(`repository orchestrator failed: ${error.message}\n`)
  process.exitCode = 1
})
