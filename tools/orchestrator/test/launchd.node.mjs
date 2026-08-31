import assert from "node:assert/strict"
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import {
  buildLaunchAgentPlist,
  discoverActiveLaunchAgentPlists,
  discoverOrchestratorProcessMatches,
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
    autoCommit: false,
    requiredLabel: "koalafrog-orchestrator",
    expectedRuntimeRelease: "a".repeat(64),
    expectedManifestSha256: "b".repeat(64),
    expectedSourceCommit: "c".repeat(40),
    expectedSourceTree: "d".repeat(40),
    serviceConfigSha256: "e".repeat(64),
  }
  return {
    ...config,
    plistPath: path.join(root, "LaunchAgents", `${launchAgentLabel}.plist`),
    contents: buildLaunchAgentPlist(config),
  }
}

test("LaunchAgent configuration is canary-safe, bounded, and secret-free", () => {
  const contents = fixture("/tmp/koalafrog-launchd").contents
  assert.match(contents, /<key>RunAtLoad<\/key>\s*<false\/>/)
  assert.doesNotMatch(contents, /<key>KeepAlive<\/key>/)
  assert.match(contents, /<key>ExitTimeOut<\/key>\s*<integer>90<\/integer>/)
  assert.match(contents, /<key>ThrottleInterval<\/key>\s*<integer>60<\/integer>/)
  assert.match(contents, /<key>Umask<\/key>\s*<integer>63<\/integer>/)
  assert.match(contents, /<string>60000<\/string>/)
  assert.match(contents, /--max-turns/)
  assert.match(contents, /--turn-timeout-ms/)
  assert.doesNotMatch(contents, /--auto-commit/)
  assert.match(contents, /--required-label/)
  assert.match(contents, /koalafrog-orchestrator/)
  assert.match(contents, /--expected-runtime-release/)
  assert.match(contents, /--health-path/)
  assert.match(contents, /repository-orchestrator\.mjs/)
  assert.match(contents, /--repository/)
  assert.match(contents, /--discovery-limit/)
  assert.match(contents, /--max-tasks-per-poll/)
  assert.match(contents, /koalafrog &amp; hq/)
  assert.doesNotMatch(contents, /(?:github_pat|ghp_|Bearer|OPENAI_API_KEY)/i)
})

test("installer discovery detects multiple active plist candidates", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koalafrog-launchd-candidates-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const options = fixture(root)
  await writeLaunchAgentPlist(options)
  const stalePath = path.join(
    path.dirname(options.plistPath),
    `${launchAgentLabel}.stale.plist`,
  )
  await writeFile(stalePath, "stale")
  assert.deepEqual(await discoverActiveLaunchAgentPlists(options), [stalePath])
})

test("installer process discovery detects watcher and broker trees only", async () => {
  const matches = await discoverOrchestratorProcessMatches({
    currentPid: 999,
    run: async () => ({
      code: 0,
      stderr: "",
      stdout: [
        "101 1 /runtime/bin/repository-orchestrator.mjs watch --required-label x",
        "102 1 codex app-server",
        "103 1 python git-mutation-broker.py /Users/me/Koalafrog/repo",
        "999 1 node orchestrator-service.mjs install",
      ].join("\n"),
    }),
  })
  assert.deepEqual(matches.map((record) => record.pid), [101, 103])
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
  assert.ok(
    firstPlan.files.some(
      (file) => file.relativePath === "src/durable-filesystem.mjs",
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
    runGit: async (args) => {
      if (args.join(" ") === "remote get-url origin") {
        return "https://github.com/Sillyquack/koalafrog-hq.git"
      }
      if (args[0] === "status") return ""
      if (args.at(-1) === "HEAD^{tree}") return "b".repeat(40)
      if (args.at(-1) === "origin/main") return "a".repeat(40)
      if (args.at(-1) === "HEAD") return "a".repeat(40)
      throw new Error(`Unexpected Git fixture call: ${args.join(" ")}`)
    },
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

test("service runtime planning rejects a dirty orchestrator source", async () => {
  await assert.rejects(
    planRuntimeReleaseFromCheckout({
      checkoutPath: repositoryDirectory,
      stateDirectory: "/tmp/synthetic-watcher-runtime",
      runGit: async (args) => {
        if (args.join(" ") === "remote get-url origin") {
          return "https://github.com/Sillyquack/koalafrog-hq.git"
        }
        if (args[0] === "status") return " M tools/orchestrator/src/config.mjs"
        return "a".repeat(40)
      },
    }),
    /uncommitted orchestrator changes/,
  )
})

test("service runtime planning rejects a non-canonical source commit", async () => {
  await assert.rejects(
    planRuntimeReleaseFromCheckout({
      checkoutPath: repositoryDirectory,
      stateDirectory: "/tmp/synthetic-watcher-runtime",
      runGit: async (args) => {
        if (args.join(" ") === "remote get-url origin") {
          return "https://github.com/Sillyquack/koalafrog-hq.git"
        }
        if (args[0] === "status") return ""
        if (args.at(-1) === "HEAD") return "a".repeat(40)
        if (args.at(-1) === "origin/main") return "b".repeat(40)
        return "c".repeat(40)
      },
    }),
    /not at canonical origin\/main/,
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

test("install refuses an already running service instead of replacing it", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koalafrog-launchd-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const calls = []
  const run = async (command, args) => {
    calls.push([command, ...args])
    if (args[0] === "print") {
      return { code: 0, stdout: "loaded", stderr: "" }
    }
    return { code: 0, stdout: "", stderr: "" }
  }
  await assert.rejects(
    installAndStartLaunchAgent({
      ...fixture(root),
      uid: 501,
      run,
      sleep: async () => {},
    }),
    /service is active/,
  )
  assert.deepEqual(calls.map((call) => call[1]), ["print"])
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
  const oldContents = options.contents.replace("60000", "30000")
  await writeLaunchAgentPlist({ ...options, contents: oldContents })
  const calls = []
  const run = async (command, args) => {
    calls.push([command, ...args])
    if (args[0] === "print") {
      return { code: 1, stdout: "", stderr: "not loaded" }
    }
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
  assert.equal(
    calls.some(
      (call) =>
        call[0] === "launchctl" &&
        new Set(["bootout", "bootstrap"]).has(call[1]),
    ),
    false,
  )
})

test("failed install preserves evidence and leaves the service disabled", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koalafrog-launchd-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const options = fixture(root)
  const oldContents = options.contents.replace("60000", "30000")
  await writeLaunchAgentPlist({ ...options, contents: oldContents })
  let bootstrapCount = 0
  const run = async (command, args) => {
    if (command === "plutil") {
      return { code: 0, stdout: "OK", stderr: "" }
    }
    if (args[0] === "print") {
      return { code: 1, stdout: "", stderr: "not loaded" }
    }
    if (args[0] === "bootstrap") {
      bootstrapCount += 1
      return { code: 5, stdout: "", stderr: "Bootstrap failed: 5" }
    }
    return { code: 0, stdout: "", stderr: "" }
  }

  await assert.rejects(
    installAndStartLaunchAgent({
      ...options,
      run,
      sleep: async () => {},
      evidenceDirectory: path.join(root, "disabled"),
    }),
    /service remains disabled/,
  )
  await assert.rejects(readFile(options.plistPath, "utf8"), /ENOENT/)
  assert.equal(bootstrapCount, 3)
  const evidence = await readdir(path.join(root, "disabled"))
  assert.equal(evidence.length, 2)
  assert.ok(evidence.some((name) => name.includes("previous-inactive")))
  assert.ok(evidence.some((name) => name.includes("failed-attempt")))
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
