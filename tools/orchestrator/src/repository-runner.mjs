import { setTimeout as delay } from "node:timers/promises"
import { AppServerClient } from "./app-server.mjs"
import { selectLatestInstruction } from "./control-plane.mjs"
import { GithubControlPlane } from "./github-control-plane.mjs"
import { Orchestrator } from "./orchestrator.mjs"
import { discoverIssueNumbers } from "./repository-discovery.mjs"
import { installTaskThreadPolicy } from "./runtime-policy.mjs"
import { redactForLog } from "./state-store.mjs"

installTaskThreadPolicy(AppServerClient)

function unwrap(result, operation) {
  if (!result || result.isError) {
    throw new Error(`${operation} failed through the connected GitHub app`)
  }
  const content = result.structuredContent ?? {}
  return content.result ?? content
}

function writeJson(write, value) {
  write(`${JSON.stringify(redactForLog(value))}\n`)
}

async function stopScanner(scanner) {
  if (!scanner?.appServer) return
  await scanner.appServer.stop()
}

async function waitForNextCycle(milliseconds, signal, sleep) {
  try {
    await sleep(milliseconds, undefined, { signal })
  } catch (error) {
    if (error.name !== "AbortError") throw error
  }
}

export async function createRepositoryScanner(config) {
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

export async function searchOpenIssueNumbers(scanner, config) {
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

export async function runRepositoryIssue(
  scanner,
  baseConfig,
  issueNumber,
  { OrchestratorClass = Orchestrator } = {},
) {
  const controlPlane = new GithubControlPlane({
    appServer: scanner.appServer,
    threadId: scanner.threadId,
    repository: baseConfig.repository,
    issueNumber,
  })
  const task = await controlPlane.fetchTask()
  const instruction = selectLatestInstruction(task.issue, task.comments)
  if (!instruction) return { issueNumber, status: "no_agent_control" }

  const orchestrator = new OrchestratorClass(
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

export async function runRepositoryCycle(
  scanner,
  config,
  {
    search = searchOpenIssueNumbers,
    runIssue = runRepositoryIssue,
  } = {},
) {
  const issueNumbers = await search(scanner, config)
  const results = []
  for (const issueNumber of issueNumbers) {
    try {
      results.push(await runIssue(scanner, config, issueNumber))
    } catch (error) {
      results.push({
        issueNumber,
        status: "failed",
        error: error.message,
      })
    }
  }
  return results
}

export async function runRepositoryOnce(
  config,
  {
    createScanner = createRepositoryScanner,
    runCycle = runRepositoryCycle,
  } = {},
) {
  const scanner = await createScanner(config)
  try {
    return await runCycle(scanner, config)
  } finally {
    await stopScanner(scanner)
  }
}

export async function watchRepository(
  config,
  {
    signal,
    createScanner = createRepositoryScanner,
    runCycle = runRepositoryCycle,
    sleep = delay,
    write = (line) => process.stdout.write(line),
  } = {},
) {
  let scanner = null
  writeJson(write, {
    event: "repository_watch_started",
    pid: process.pid,
    repository: config.repository,
    pollMs: config.pollMs,
  })

  try {
    while (!signal?.aborted) {
      try {
        scanner ??= await createScanner(config)
        const results = await runCycle(scanner, config)
        writeJson(write, {
          event: "repository_poll_completed",
          results,
        })
        await waitForNextCycle(config.pollMs, signal, sleep)
      } catch (error) {
        writeJson(write, {
          event: "repository_poll_failed",
          error: error.message,
        })
        try {
          await stopScanner(scanner)
        } catch (stopError) {
          writeJson(write, {
            event: "repository_scanner_stop_failed",
            error: stopError.message,
          })
        }
        scanner = null
        await waitForNextCycle(
          Math.min(config.retryBaseMs, config.pollMs),
          signal,
          sleep,
        )
      }
    }
  } finally {
    await stopScanner(scanner)
  }
}
