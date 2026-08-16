#!/usr/bin/env node
import { setTimeout as delay } from "node:timers/promises"
import { AppServerClient } from "../src/app-server.mjs"
import { parseConfig } from "../src/config.mjs"
import { selectLatestInstruction } from "../src/control-plane.mjs"
import { GithubControlPlane } from "../src/github-control-plane.mjs"
import { Orchestrator } from "../src/orchestrator.mjs"
import { discoverIssueNumbers } from "../src/repository-discovery.mjs"
import { installTaskThreadPolicy } from "../src/runtime-policy.mjs"

installTaskThreadPolicy(AppServerClient)

function unwrap(result, operation) {
  if (!result || result.isError) {
    throw new Error(`${operation} failed through the connected GitHub app`)
  }
  const content = result.structuredContent ?? {}
  return content.result ?? content
}

async function createScanner(config) {
  const appServer = new AppServerClient({
    binary: config.codexBinary,
    cwd: config.checkoutPath,
  })
  await appServer.start()
  const response = await appServer.startThread({
    cwd: config.checkoutPath,
    approvalPolicy: "never",
    sandbox: "read-only",
    ephemeral: true,
    serviceName: "koalafrog_repository_control_plane",
    threadSource: "appServer",
  })
  const threadId = response.thread.id
  await appServer.waitForMcpReady(threadId)
  return { appServer, threadId }
}

async function searchOpenIssueNumbers(scanner, config) {
  const result = await scanner.appServer.callMcpTool({
    threadId: scanner.threadId,
    server: "codex_apps",
    tool: "github.search_issues",
    arguments: {
      query: `repo:${config.repository} is:issue is:open`,
      repository_full_name: config.repository,
      topn: 100,
    },
  })
  return discoverIssueNumbers(unwrap(result, "Search repository issues"))
}

async function runIssue(scanner, baseConfig, issueNumber) {
  const controlPlane = new GithubControlPlane({
    appServer: scanner.appServer,
    threadId: scanner.threadId,
    repository: baseConfig.repository,
    issueNumber,
  })
  const task = await controlPlane.fetchTask()
  const instruction = selectLatestInstruction(task.issue, task.comments)
  if (!instruction) return { issueNumber, status: "no_agent_control" }

  const orchestrator = new Orchestrator(
    { ...baseConfig, command: "once", issueNumber },
    { controlPlane },
  )
  try {
    const result = await orchestrator.runOnce()
    return { issueNumber, ...result }
  } finally {
    await orchestrator.stop()
  }
}

async function runCycle(scanner, config) {
  const issueNumbers = await searchOpenIssueNumbers(scanner, config)
  const results = []
  for (const issueNumber of issueNumbers) {
    try {
      results.push(await runIssue(scanner, config, issueNumber))
    } catch (error) {
      results.push({ issueNumber, status: "failed", error: error.message })
    }
  }
  return results
}

async function main() {
  const config = parseConfig(process.argv.slice(2))
  if (config.command === "help") {
    process.stdout.write(
      "Repository orchestrator: scans all open issues for agent_control blocks and runs each task with per-issue durable state.\n",
    )
    return
  }

  const scanner = await createScanner(config)
  const controller = new AbortController()
  const shutdown = () => controller.abort()
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)

  try {
    if (config.command === "watch") {
      while (!controller.signal.aborted) {
        const results = await runCycle(scanner, config)
        process.stdout.write(`${JSON.stringify(results)}\n`)
        try {
          await delay(config.pollMs, undefined, { signal: controller.signal })
        } catch (error) {
          if (error.name !== "AbortError") throw error
        }
      }
    } else {
      const results = await runCycle(scanner, config)
      process.stdout.write(`${JSON.stringify(results)}\n`)
    }
  } finally {
    await scanner.appServer.stop()
  }
}

main().catch((error) => {
  process.stderr.write(`repository orchestrator failed: ${error.message}\n`)
  process.exitCode = 1
})
