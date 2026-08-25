import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
  buildLaunchAgentPlist,
  installAndStartLaunchAgent,
  launchAgentLabel,
  validateLaunchAgentInputs,
  writeLaunchAgentPlist,
} from "../src/launchd.mjs"
import {
  materializeRuntimeRelease,
  planRuntimeRelease,
  planRuntimeReleaseFromCheckout,
} from "../src/runtime-bundle.mjs"

const orchestratorDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
)
const repositoryDirectory = path.resolve(orchestratorDirectory, "..", "..")

function fixture(root) {
  const stateDirectory = path.join(root, "state & logs")
  const stdoutPath = path.join(stateDirectory, "service", "stdout.log")
  const stderrPath = path.join(stateDirectory, "service", "stderr.log")
  const config = {
    nodeBinary: "/usr/local/bin/node",
    orchestratorScript:
      "/repo/tools/orchestrator/bin/repository-orchestrator.mjs",
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
  assert.match(contents, /repository-orchestrator\.mjs/)
  assert.match(contents, /--repository/)
  assert.match(contents, /--discovery-limit/)
  assert.match(contents, /--max-tasks-per-poll/)
  assert.match(contents, /koalafrog &amp; hq/)
  assert.doesNotMatch(contents, /(?:github_pat|ghp_|Bearer|OPENAI_API_KEY)/i)
})

test("service runtime release is deterministic, immutable, and outside a task worktree", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koalafrog-runtime-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const sourceDirectory = orchestratorDirectory
  const options = {
    sourceDirectory,
    stateDirectory: root,
  }
  const firstPlan = await planRuntimeRelease(options)
  const secondPlan = await planRuntimeRelease(options)
  assert.equal(firstPlan.digest, secondPlan.digest)
  assert.ok(
    firstPlan.files.some(
      (file) => file.relativePath === "src/result-artifact.mjs",
    ),
  )
  assert.ok(
    firstPlan.files.some(
      (file) => file.relativePath === "src/git-execution-boundary.mjs",
    ),
  )
  assert.match(firstPlan.orchestratorScript, /runtime\/releases\/[a-f0-9]{64}\/bin\/repository-orchestrator\.mjs$/)
  assert.equal((await materializeRuntimeRelease(firstPlan)).status, "created")
  assert.equal((await materializeRuntimeRelease(secondPlan)).status, "unchanged")

  await writeFile(firstPlan.orchestratorScript, "tampered\n")
  await assert.rejects(
    materializeRuntimeRelease(firstPlan),
    /immutable runtime was modified/,
  )
})

test("service runtime release is planned from the coordinating checkout", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koalafrog-checkout-runtime-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const checkoutPath = repositoryDirectory
  const plan = await planRuntimeReleaseFromCheckout({
    checkoutPath,
    stateDirectory: root,
  })

  assert.equal(
    plan.sourceDirectory,
    path.join(checkoutPath, "tools", "orchestrator"),
  )
  assert.equal(
    plan.files.find((file) => file.relativePath === "src/app-server.mjs")
      ?.digest,
    (await planRuntimeRelease({
      sourceDirectory: path.join(checkoutPath, "tools", "orchestrator"),
      stateDirectory: root,
    })).files.find((file) => file.relativePath === "src/app-server.mjs")
      ?.digest,
  )
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
    "-lint",
    "print",
    "bootout",
    "print",
    "print",
    "bootstrap",
  ])
  assert.equal(calls[2][2], `gui/501/${launchAgentLabel}`)
  assert.equal(calls[5][2], "gui/501")
})

test("bootstrap retries a transient launchd reload race", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koalafrog-launchd-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  let bootstrapAttempts = 0
  const sleeps = []
  const run = async (command, args) => {
    if (command === "plutil") {
      return { code: 0, stdout: "OK", stderr: "" }
    }
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

test("invalid generated plist is rejected before an existing service unloads", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koalafrog-launchd-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const options = fixture(root)
  const oldContents = options.contents.replace("15000", "30000")
  await writeLaunchAgentPlist({ ...options, contents: oldContents })
  const calls = []
  const run = async (command, args) => {
    calls.push([command, ...args])
    if (command === "plutil") {
      return { code: 1, stdout: "", stderr: "invalid plist" }
    }
    return { code: 0, stdout: "", stderr: "" }
  }

  await assert.rejects(
    installAndStartLaunchAgent({ ...options, run }),
    /invalid plist/,
  )
  assert.equal(await readFile(options.plistPath, "utf8"), oldContents)
  assert.equal(calls.some((call) => call[0] === "launchctl"), false)
})

test("failed reload restores the prior plist and service", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koalafrog-launchd-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const options = fixture(root)
  const oldContents = options.contents.replace("15000", "30000")
  await writeLaunchAgentPlist({ ...options, contents: oldContents })
  let printCount = 0
  let bootstrapCount = 0
  const run = async (command, args) => {
    if (command === "plutil") {
      return { code: 0, stdout: "OK", stderr: "" }
    }
    if (args[0] === "print") {
      printCount += 1
      return printCount === 1
        ? { code: 0, stdout: "loaded", stderr: "" }
        : { code: 1, stdout: "", stderr: "not loaded" }
    }
    if (args[0] === "bootstrap") {
      bootstrapCount += 1
      return bootstrapCount <= 3
        ? { code: 5, stdout: "", stderr: "Bootstrap failed: 5" }
        : { code: 0, stdout: "", stderr: "" }
    }
    return { code: 0, stdout: "", stderr: "" }
  }

  await assert.rejects(
    installAndStartLaunchAgent({
      ...options,
      run,
      sleep: async () => {},
    }),
    /previous configuration was restored/,
  )
  assert.equal(await readFile(options.plistPath, "utf8"), oldContents)
  assert.equal(bootstrapCount, 4)
})

test("LaunchAgent preflight requires a stable coordinating checkout", async () => {
  const accessed = []
  const inspectPath = async (candidate) => ({
    isDirectory: () => candidate !== "/repo/.git",
  })
  await assert.rejects(
    validateLaunchAgentInputs(
      {
        nodeBinary: "/usr/local/bin/node",
        codexBinary: "/Applications/ChatGPT.app/Contents/Resources/codex",
        orchestratorScript:
          "/runtime/tools/orchestrator/bin/repository-orchestrator.mjs",
        checkoutPath: "/repo",
      },
      {
        accessPath: async (candidate) => accessed.push(candidate),
        inspectPath,
      },
    ),
    /stable coordinating checkout/,
  )
  assert.equal(accessed.length, 3)
})
