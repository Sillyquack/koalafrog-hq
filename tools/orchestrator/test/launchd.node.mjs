import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, stat } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import {
  buildLaunchAgentPlist,
  installAndStartLaunchAgent,
  launchAgentLabel,
  writeLaunchAgentPlist,
} from "../src/launchd.mjs"

function fixture(root) {
  const stateDirectory = path.join(root, "state & logs")
  const stdoutPath = path.join(stateDirectory, "service", "stdout.log")
  const stderrPath = path.join(stateDirectory, "service", "stderr.log")
  const config = {
    nodeBinary: "/usr/local/bin/node",
    orchestratorScript: "/repo/tools/orchestrator/bin/orchestrator.mjs",
    checkoutPath: "/repo/koalafrog & hq",
    codexBinary: "/Applications/ChatGPT.app/Contents/Resources/codex",
    stateDirectory,
    stdoutPath,
    stderrPath,
    autoCommit: true,
  }
  return {
    ...config,
    plistPath: path.join(root, "LaunchAgents", `${launchAgentLabel}.plist`),
    contents: buildLaunchAgentPlist(config),
  }
}

test("LaunchAgent configuration is persistent, bounded, and secret-free", () => {
  const contents = fixture("/tmp/koalafrog-launchd").contents
  assert.match(contents, /<key>RunAtLoad<\/key>\s*<true\/>/)
  assert.match(contents, /<key>SuccessfulExit<\/key>\s*<false\/>/)
  assert.match(contents, /<string>15000<\/string>/)
  assert.match(contents, /--max-turns/)
  assert.match(contents, /--turn-timeout-ms/)
  assert.match(contents, /--auto-commit/)
  assert.match(contents, /koalafrog &amp; hq/)
  assert.doesNotMatch(contents, /(?:github_pat|ghp_|Bearer|OPENAI_API_KEY)/i)
})

test("plist installation is atomic and idempotent", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koalafrog-launchd-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const options = fixture(root)
  assert.equal(await writeLaunchAgentPlist(options), "created")
  assert.equal(await writeLaunchAgentPlist(options), "unchanged")
  assert.equal(await readFile(options.plistPath, "utf8"), options.contents)
  assert.equal((await stat(options.plistPath)).mode & 0o777, 0o600)
})

test("reinstall keeps one label by reloading the existing service", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koalafrog-launchd-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const calls = []
  let printCount = 0
  const run = async (command, args) => {
    calls.push([command, ...args])
    if (args[0] === "print") {
      printCount += 1
      return printCount <= 2
        ? { code: 0, stdout: "loaded", stderr: "" }
        : { code: 1, stdout: "", stderr: "not loaded" }
    }
    return { code: 0, stdout: "", stderr: "" }
  }
  const result = await installAndStartLaunchAgent({
    ...fixture(root),
    uid: 501,
    run,
    sleep: async () => {},
  })
  assert.equal(result.reloaded, true)
  assert.deepEqual(calls.map((call) => call[1]), [
    "print",
    "bootout",
    "print",
    "print",
    "bootstrap",
  ])
  assert.equal(calls[1][2], `gui/501/${launchAgentLabel}`)
  assert.equal(calls[4][2], "gui/501")
})

test("bootstrap retries a transient launchd reload race", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koalafrog-launchd-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  let bootstrapAttempts = 0
  const sleeps = []
  const run = async (_command, args) => {
    if (args[0] === "print") {
      return { code: 1, stdout: "", stderr: "not loaded" }
    }
    bootstrapAttempts += 1
    if (bootstrapAttempts === 1) throw new Error("Bootstrap failed: 5")
    return { code: 0, stdout: "", stderr: "" }
  }
  await installAndStartLaunchAgent({
    ...fixture(root),
    run,
    retryDelayMs: 25,
    sleep: async (milliseconds) => sleeps.push(milliseconds),
  })
  assert.equal(bootstrapAttempts, 2)
  assert.deepEqual(sleeps, [25])
})
