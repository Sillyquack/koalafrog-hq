import assert from "node:assert/strict"
import test from "node:test"
import { watchRepository } from "../src/repository-runner.mjs"

test("repository watch reconnects and keeps polling after needs_owner", async () => {
  const controller = new AbortController()
  const stopped = []
  let scannerCount = 0
  const createScanner = async () => {
    scannerCount += 1
    const id = scannerCount
    return {
      id,
      appServer: {
        async stop() {
          stopped.push(id)
        },
      },
    }
  }
  let cycles = 0
  const runCycle = async () => {
    cycles += 1
    if (cycles === 1) throw new Error("transient scanner disconnect")
    if (cycles === 2) {
      return [
        {
          issueNumber: 53,
          instructionId: "owner-stop-001",
          status: "needs_owner",
        },
      ]
    }
    controller.abort()
    return [
      {
        issueNumber: 53,
        instructionId: "owner-follow-up-002",
        status: "needs_review",
      },
    ]
  }
  const sleeps = []
  const sleep = async (milliseconds, _value, { signal }) => {
    sleeps.push(milliseconds)
    if (signal.aborted) {
      const error = new Error("aborted")
      error.name = "AbortError"
      throw error
    }
  }
  const lines = []

  await watchRepository(
    {
      repository: "Sillyquack/koalafrog-hq",
      pollMs: 15_000,
      retryBaseMs: 1_000,
    },
    {
      signal: controller.signal,
      createScanner,
      runCycle,
      sleep,
      write: (line) => lines.push(JSON.parse(line)),
    },
  )

  assert.equal(cycles, 3)
  assert.equal(scannerCount, 2)
  assert.deepEqual(stopped, [1, 2])
  assert.deepEqual(sleeps, [1_000, 15_000, 15_000])
  assert.equal(lines[0].event, "repository_watch_started")
  assert.equal(lines[1].event, "repository_poll_failed")
  assert.deepEqual(
    lines
      .filter((line) => line.event === "repository_poll_completed")
      .map((line) => line.results[0].status),
    ["needs_owner", "needs_review"],
  )
})
