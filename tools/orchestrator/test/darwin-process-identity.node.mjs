import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { realpath } from "node:fs/promises"
import test from "node:test"
import {
  inspectDarwinProcessIdentity,
} from "../src/darwin-process-identity.mjs"

function record(pid, overrides = {}) {
  return {
    pid,
    executablePath: "/usr/local/bin/node",
    executableDevice: "16777232",
    executableInode: "5261233",
    kernelExecutablePath: "/usr/local/bin/node",
    argv: ["/usr/local/bin/node", "/tmp/service.mjs", "watch"],
    ...overrides,
  }
}

test("Darwin process helper returns a frozen structured identity", async () => {
  const value = await inspectDarwinProcessIdentity(4242, {
    platform: "darwin",
    runInspector: async () => ({ stdout: JSON.stringify(record(4242)) }),
  })
  assert.equal(value.pid, 4242)
  assert.equal(value.executablePath, "/usr/local/bin/node")
  assert.deepEqual(value.argv, [
    "/usr/local/bin/node",
    "/tmp/service.mjs",
    "watch",
  ])
  assert.equal(Object.isFrozen(value), true)
  assert.equal(Object.isFrozen(value.argv), true)
})

for (const [name, options, pattern] of [
  ["non-Darwin platform", { platform: "linux" }, /requires Darwin/],
  [
    "helper failure",
    {
      platform: "darwin",
      runInspector: async () => {
        throw new Error("synthetic proc failure")
      },
    },
    /synthetic proc failure/,
  ],
  [
    "empty output",
    { platform: "darwin", runInspector: async () => ({ stdout: "" }) },
    /empty output/,
  ],
  [
    "malformed JSON",
    { platform: "darwin", runInspector: async () => ({ stdout: "{" }) },
    /malformed JSON/,
  ],
  [
    "wrong PID",
    {
      platform: "darwin",
      runInspector: async () => ({ stdout: JSON.stringify(record(3131)) }),
    },
    /PID does not match/,
  ],
  [
    "truncated argv",
    {
      platform: "darwin",
      runInspector: async () => ({
        stdout: JSON.stringify(record(4242, { argv: [] })),
      }),
    },
    /malformed argv/,
  ],
]) {
  test(`Darwin process helper fails closed on ${name}`, async () => {
    await assert.rejects(inspectDarwinProcessIdentity(4242, options), pattern)
  })
}

test(
  "Darwin integration reads the executable and NUL-delimited argv of a harmless Node child",
  { skip: process.platform !== "darwin" },
  async (t) => {
    const source = "setTimeout(() => {}, 30000)"
    const child = spawn(process.execPath, ["-e", source, "alpha", "beta gamma"], {
      stdio: "ignore",
    })
    t.after(() => {
      if (child.exitCode === null) child.kill("SIGTERM")
    })
    await once(child, "spawn")
    const identity = await inspectDarwinProcessIdentity(child.pid)
    assert.equal(identity.pid, child.pid)
    assert.equal(identity.executablePath, await realpath(process.execPath))
    assert.equal(identity.kernelExecutablePath, process.execPath)
    assert.deepEqual(identity.argv, [
      process.execPath,
      "-e",
      source,
      "alpha",
      "beta gamma",
    ])
    child.kill("SIGTERM")
    await once(child, "exit")
  },
)
