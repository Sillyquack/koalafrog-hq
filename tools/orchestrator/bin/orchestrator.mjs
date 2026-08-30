#!/usr/bin/env node
import { helpText, parseConfig } from "../src/config.mjs"
import { Orchestrator } from "../src/orchestrator.mjs"

async function main() {
  const config = parseConfig(process.argv.slice(2))
  if (config.command === "help") {
    process.stdout.write(helpText)
    return
  }

  const orchestrator = new Orchestrator(config)
  const controller = new AbortController()
  const shutdown = () => {
    controller.abort()
    void orchestrator.stop()
  }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)

  try {
    if (config.command === "watch") {
      process.stdout.write(
        `${JSON.stringify({
          event: "orchestrator_watch_starting",
          pid: process.pid,
          repository: config.repository,
          issueNumber: config.issueNumber,
          pollMs: config.pollMs,
        })}\n`,
      )
      await orchestrator.watch({ signal: controller.signal })
    } else {
      const result = await orchestrator.runOnce()
      process.stdout.write(`${JSON.stringify(result)}\n`)
    }
  } finally {
    await orchestrator.stop()
  }
}

main().catch((error) => {
  process.stderr.write(`orchestrator failed: ${error.message}\n`)
  process.exitCode = 1
})
