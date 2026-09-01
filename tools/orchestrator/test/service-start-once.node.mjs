import assert from "node:assert/strict"
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import {
  buildLaunchAgentPlist,
  installDisabledLaunchAgent,
  installAndStartLaunchAgent,
  launchAgentLabel,
  parseLaunchAgentProgramArguments,
  startOnceLaunchAgent,
} from "../src/launchd.mjs"
import { darwinXpcproxyExecutable } from "../src/darwin-process-identity.mjs"

const baseTime = Date.parse("2026-09-01T10:00:00.000Z")

function serviceFixture(root) {
  const stateDirectory = path.join(root, "state")
  const runtimeRelease = "a".repeat(64)
  const manifestSha256 = "b".repeat(64)
  const sourceCommit = "c".repeat(40)
  const sourceTree = "d".repeat(40)
  const serviceConfigSha256 = "e".repeat(64)
  const nodeBinary = process.execPath
  const orchestratorScript = path.join(
    root,
    "runtime",
    "releases",
    runtimeRelease,
    "bin",
    "repository-orchestrator.mjs",
  )
  const options = {
    label: launchAgentLabel,
    plistPath: path.join(root, "home", "Library", "LaunchAgents", `${launchAgentLabel}.plist`),
    contents: null,
    stdoutPath: path.join(stateDirectory, "service", "stdout.log"),
    stderrPath: path.join(stateDirectory, "service", "stderr.log"),
    healthPath: path.join(stateDirectory, "watcher-v2-health.json"),
    stateDirectory,
    nodeBinary,
    orchestratorScript,
    checkoutPath: path.join(root, "coordinator", "koalafrog-hq"),
    codexBinary: path.join(root, "bin", "codex"),
    repository: "Sillyquack/koalafrog-hq",
    requiredLabel: "koalafrog-orchestrator",
    expectedRuntimeRelease: runtimeRelease,
    expectedManifestSha256: manifestSha256,
    expectedSourceCommit: sourceCommit,
    expectedSourceTree: sourceTree,
    serviceConfigSha256,
    runAtLoad: false,
    keepAlive: false,
    pollMs: 60_000,
    maxTasksPerPoll: 1,
    startupTimeoutMs: 1_000,
    stabilityWindowMs: 300,
    cleanupTimeoutMs: 500,
    evidenceDirectory: path.join(root, "evidence"),
    uid: 501,
  }
  options.contents = buildLaunchAgentPlist({
    ...options,
    expectedRuntimeRelease: runtimeRelease,
    expectedManifestSha256: manifestSha256,
    expectedSourceCommit: sourceCommit,
    expectedSourceTree: sourceTree,
  })
  return options
}

async function installInactive(options) {
  await mkdir(path.dirname(options.plistPath), { recursive: true })
  await writeFile(options.plistPath, options.contents, { mode: 0o600 })
}

function expectedHealth(options, clock, overrides = {}) {
  return {
    schemaVersion: 1,
    updatedAt: new Date(clock).toISOString(),
    state: "starting",
    serviceLabel: options.label,
    runtimeRelease: options.expectedRuntimeRelease,
    manifestSha256: options.expectedManifestSha256,
    sourceCommit: options.expectedSourceCommit,
    sourceTree: options.expectedSourceTree,
    repository: options.repository,
    coordinatorCheckout: options.checkoutPath,
    serviceConfigSha256: options.serviceConfigSha256,
    servicePid: 4242,
    startupTimestamp: new Date(clock).toISOString(),
    startupSessionId: "00000000-0000-4000-8000-000000000002",
    watcherMode: "watch",
    requiredLabel: options.requiredLabel,
    autoCommit: false,
    runAtLoad: false,
    keepAlive: false,
    pollMs: options.pollMs,
    maxTasksPerPoll: options.maxTasksPerPoll,
    ...overrides,
  }
}

async function createHarness(options, behavior = {}) {
  let clock = baseTime
  let loaded = behavior.initiallyLoaded ?? false
  let running = false
  let pid = 4242
  let launchCount = 0
  let postKickstartPrints = 0
  let processInspections = 0
  let sleeps = 0
  const calls = []
  const expectedArgv = [...parseLaunchAgentProgramArguments(options.contents)]
  const nodeMetadata = await stat(options.nodeBinary)
  const expectedProcessIdentity = {
    pid,
    executablePath: options.nodeBinary,
    executableDevice: String(nodeMetadata.dev),
    executableInode: String(nodeMetadata.ino),
    kernelExecutablePath: options.nodeBinary,
    argv: expectedArgv,
  }
  const writeHealth = async (overrides = {}) => {
    await mkdir(path.dirname(options.healthPath), { recursive: true })
    const value = behavior.malformedHealth
      ? "{partial"
      : `${JSON.stringify(expectedHealth(options, clock, overrides), null, 2)}\n`
    await writeFile(options.healthPath, value, { mode: 0o600 })
  }
  if (behavior.staleHealth) {
    clock -= 10_000
    await writeHealth({
      servicePid: 3131,
      startupSessionId: "00000000-0000-4000-8000-000000000001",
    })
    clock = baseTime
  }
  const run = async (command, args) => {
    calls.push([command, ...args])
    if (command === "plutil") return { code: 0, stdout: "OK", stderr: "" }
    assert.equal(command, "launchctl")
    if (args[0] === "bootstrap") {
      if (behavior.bootstrapFailure) {
        return { code: 5, stdout: "", stderr: "synthetic bootstrap failure" }
      }
      loaded = true
      return { code: 0, stdout: "", stderr: "" }
    }
    if (args[0] === "kickstart") {
      if (behavior.kickstartFailure) {
        return { code: 5, stdout: "", stderr: "synthetic kickstart failure" }
      }
      running = !behavior.exitBeforeHealth
      launchCount += 1
      if (behavior.healthOnKickstart !== false && running) {
        await writeHealth(behavior.healthOverrides)
      }
      return { code: 0, stdout: "4242\n", stderr: "" }
    }
    if (args[0] === "bootout") {
      if (behavior.cleanupFailure) {
        return { code: 5, stdout: "", stderr: "synthetic bootout failure" }
      }
      loaded = false
      running = false
      return { code: 0, stdout: "", stderr: "" }
    }
    if (args[0] === "print") {
      if (!loaded) return { code: 113, stdout: "", stderr: "not loaded" }
      if (launchCount > 0) postKickstartPrints += 1
      if (
        behavior.exitAfterPrint &&
        postKickstartPrints >= behavior.exitAfterPrint
      ) {
        running = false
      }
      if (
        behavior.restartAfterPrint &&
        postKickstartPrints >= behavior.restartAfterPrint
      ) {
        pid = 4343
        launchCount = 2
      }
      if (
        behavior.launchCountChangeAfterPrint &&
        postKickstartPrints >= behavior.launchCountChangeAfterPrint
      ) {
        launchCount = 2
      }
      if (
        behavior.disappearAfterPrint &&
        postKickstartPrints >= behavior.disappearAfterPrint
      ) {
        loaded = false
        running = false
        return { code: 113, stdout: "", stderr: "not loaded" }
      }
      return {
        code: 0,
        stdout: [
          `gui/501/${options.label} = {`,
          `  state = ${running ? "running" : launchCount ? "exited" : "waiting"}`,
          `  runs = ${launchCount}`,
          ...(running && !behavior.suppressPid ? [`  pid = ${pid}`] : []),
          "}",
        ].join("\n"),
        stderr: "",
      }
    }
    throw new Error(`Unexpected command: ${command} ${args.join(" ")}`)
  }
  const sleep = async (milliseconds) => {
    sleeps += 1
    clock += milliseconds
    if (
      behavior.delayedHealthSleep &&
      sleeps === behavior.delayedHealthSleep
    ) {
      await writeHealth(behavior.healthOverrides)
    }
    if (
      behavior.changeHealthSleep &&
      sleeps === behavior.changeHealthSleep
    ) {
      await writeHealth({ serviceConfigSha256: "f".repeat(64) })
    }
  }
  return {
    run,
    sleep,
    now: () => clock,
    calls,
    inspectProcesses: async () =>
      running
        ? [{ pid, parentPid: 1, command: `${options.nodeBinary} ${options.orchestratorScript} watch` }]
        : [],
    inspectProcessIdentity: async (requestedPid) => {
      if (!running) throw new Error("synthetic process disappeared")
      processInspections += 1
      if (behavior.processIdentityError) {
        throw new Error(behavior.processIdentityError)
      }
      const sequence = behavior.processIdentitySequence ?? []
      const selected =
        sequence[Math.min(processInspections - 1, sequence.length - 1)] ??
        behavior.processIdentity ??
        expectedProcessIdentity
      const value = typeof selected === "function"
        ? await selected({
            requestedPid,
            processInspections,
            expected: expectedProcessIdentity,
            expectedArgv,
          })
        : selected
      return {
        ...expectedProcessIdentity,
        ...value,
        pid: value?.pid ?? requestedPid,
        argv: [...(value?.argv ?? expectedArgv)],
      }
    },
    expectedArgv,
    expectedProcessIdentity,
    state: () => ({ loaded, running, pid, launchCount }),
  }
}

async function invokeStart(options, harness) {
  return startOnceLaunchAgent({
    ...options,
    run: harness.run,
    sleep: harness.sleep,
    now: harness.now,
    inspectProcesses: harness.inspectProcesses,
    inspectProcessIdentity: harness.inspectProcessIdentity,
  })
}

async function withFixture(t, behavior = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "koalafrog-start-once-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const options = serviceFixture(root)
  await installInactive(options)
  return { root, options, harness: await createHarness(options, behavior) }
}

function xpcproxyIdentity(pid = 4242) {
  return {
    pid,
    executablePath: darwinXpcproxyExecutable,
    executableDevice: "16777232",
    executableInode: "1",
    kernelExecutablePath: darwinXpcproxyExecutable,
    argv: [darwinXpcproxyExecutable, "com.sillyquack.koalafrog-orchestrator"],
  }
}

function changedArgv(change) {
  return ({ expectedArgv }) => {
    const argv = [...expectedArgv]
    change(argv)
    return { argv }
  }
}

test("start-once verifies bootstrap, kickstart, PID, health, and stability", async (t) => {
  const { options, harness } = await withFixture(t)
  const result = await invokeStart(options, harness)
  assert.equal(result.loaded, true)
  assert.equal(result.pid, 4242)
  assert.equal(result.launchCount, 1)
  assert.equal(result.runtimeRelease, options.expectedRuntimeRelease)
  assert.equal(result.manifestSha256, options.expectedManifestSha256)
  assert.equal(result.serviceConfigSha256, options.serviceConfigSha256)
  assert.equal(result.runAtLoad, false)
  assert.equal(result.keepAlive, false)
  assert.equal(result.healthSha256.length, 64)
  assert.equal(result.plistSha256.length, 64)
  assert.deepEqual(
    harness.calls
      .filter((call) => call[0] === "launchctl")
      .slice(1, 4)
      .map((call) => call[1]),
    ["bootstrap", "print", "kickstart"],
  )
  assert.equal(
    harness.calls.some((call) => call[1] === "kickstart" && call[2] === "-k"),
    false,
  )
})

test("start-once accepts one same-PID xpcproxy pre-exec observation before exact Node", async (t) => {
  const { options, harness } = await withFixture(t, {
    processIdentitySequence: [xpcproxyIdentity(), ({ expected }) => expected],
  })
  const result = await invokeStart(options, harness)
  assert.equal(result.pid, 4242)
  assert.equal(result.loaded, true)
})

test("start-once accepts multiple bounded xpcproxy observations before exact Node", async (t) => {
  const { options, harness } = await withFixture(t, {
    processIdentitySequence: [
      xpcproxyIdentity(),
      xpcproxyIdentity(),
      xpcproxyIdentity(),
      ({ expected }) => expected,
    ],
  })
  const result = await invokeStart(options, harness)
  assert.equal(result.loaded, true)
})

test("persistent xpcproxy times out, cleans up, and journals the first observation", async (t) => {
  const { options, harness } = await withFixture(t, {
    processIdentity: xpcproxyIdentity(),
  })
  let failure
  try {
    await invokeStart(options, harness)
  } catch (error) {
    failure = error
  }
  assert.match(failure?.message ?? "", /xpcproxy pre-exec/)
  assert.equal(harness.state().loaded, false)
  const evidence = JSON.parse(await readFile(failure.startEvidencePath, "utf8"))
  assert.ok(evidence.observations.length > 1)
  assert.equal(evidence.observations[0].classification, "xpcproxy_pre_exec")
  assert.equal(evidence.observations[0].executablePath, darwinXpcproxyExecutable)
  assert.equal(evidence.observations[0].argvRetrievalStatus, "available")
  assert.equal(evidence.observations[0].decision, "not_ready")
})

test("xpcproxy followed by an unexpected executable rejects and preserves evidence", async (t) => {
  const { options, harness } = await withFixture(t, {
    processIdentitySequence: [
      xpcproxyIdentity(),
      {
        executablePath: "/bin/zsh",
        kernelExecutablePath: "/bin/zsh",
        argv: ["/bin/zsh", "-c", "exit 0"],
      },
    ],
  })
  let failure
  try {
    await invokeStart(options, harness)
  } catch (error) {
    failure = error
  }
  assert.match(failure?.message ?? "", /unexpected service executable/)
  const evidence = JSON.parse(await readFile(failure.startEvidencePath, "utf8"))
  assert.deepEqual(
    evidence.observations.map(({ classification }) => classification),
    ["xpcproxy_pre_exec", "unexpected_process"],
  )
  assert.deepEqual(evidence.observations[1].argv, ["/bin/zsh", "-c", "exit 0"])
  assert.equal(evidence.observations[1].decision, "reject")
})

test("same-PID xpcproxy transition rejects PID, launch-count, or target drift", async (t) => {
  await t.test("PID changes", async (t) => {
    const { options, harness } = await withFixture(t, {
      processIdentity: xpcproxyIdentity(),
      restartAfterPrint: 2,
    })
    await assert.rejects(invokeStart(options, harness), /PID changed/)
  })
  await t.test("launch count changes", async (t) => {
    const { options, harness } = await withFixture(t, {
      processIdentity: xpcproxyIdentity(),
      launchCountChangeAfterPrint: 2,
    })
    await assert.rejects(invokeStart(options, harness), /launch count changed/)
  })
  await t.test("target disappears", async (t) => {
    const { options, harness } = await withFixture(t, {
      processIdentity: xpcproxyIdentity(),
      disappearAfterPrint: 2,
    })
    await assert.rejects(invokeStart(options, harness), /target disappeared/)
  })
})

const argvMutations = [
  [
    "wrong script path",
    changedArgv((argv) => {
      argv[1] = "/tmp/foreign/repository-orchestrator.mjs"
    }),
    /argv differs at index 1/,
  ],
  [
    "alternate runtime path",
    changedArgv((argv) => {
      argv[1] = argv[1].replace("/runtime/releases/", "/runtime/foreign/")
    }),
    /argv differs at index 1/,
  ],
  ["missing argument", changedArgv((argv) => argv.pop()), /argv is missing index/],
  ["extra argument", changedArgv((argv) => argv.push("--foreign")), /unexpected index/],
  [
    "reordered arguments",
    changedArgv((argv) => {
      ;[argv[3], argv[5]] = [argv[5], argv[3]]
    }),
    /argv differs at index 3/,
  ],
  [
    "auto-commit injection",
    changedArgv((argv) => argv.push("--auto-commit")),
    /unexpected index/,
  ],
  [
    "wrong required label",
    changedArgv((argv) => {
      argv[argv.indexOf("--required-label") + 1] = "foreign-label"
    }),
    /argv differs/,
  ],
  [
    "wrong state directory",
    changedArgv((argv) => {
      argv[argv.indexOf("--state-dir") + 1] = "/tmp/foreign-state"
    }),
    /argv differs/,
  ],
  [
    "wrong health path",
    changedArgv((argv) => {
      argv[argv.indexOf("--health-path") + 1] = "/tmp/foreign-health.json"
    }),
    /argv differs/,
  ],
  [
    "wrong runtime identity",
    changedArgv((argv) => {
      argv[argv.indexOf("--expected-runtime-release") + 1] = "f".repeat(64)
    }),
    /argv differs/,
  ],
  [
    "wrong manifest identity",
    changedArgv((argv) => {
      argv[argv.indexOf("--expected-manifest-sha256") + 1] = "f".repeat(64)
    }),
    /argv differs/,
  ],
  [
    "wrong source commit",
    changedArgv((argv) => {
      argv[argv.indexOf("--expected-source-commit") + 1] = "f".repeat(40)
    }),
    /argv differs/,
  ],
  [
    "wrong source tree",
    changedArgv((argv) => {
      argv[argv.indexOf("--expected-source-tree") + 1] = "f".repeat(40)
    }),
    /argv differs/,
  ],
  [
    "wrong service configuration",
    changedArgv((argv) => {
      argv[argv.indexOf("--expected-service-config-sha256") + 1] = "f".repeat(64)
    }),
    /argv differs/,
  ],
]

for (const [name, processIdentity, pattern] of argvMutations) {
  test(`exact process identity rejects ${name}`, async (t) => {
    const { options, harness } = await withFixture(t, { processIdentity })
    await assert.rejects(invokeStart(options, harness), pattern)
    assert.equal(harness.state().loaded, false)
  })
}

for (const [name, processIdentity, pattern] of [
  [
    "alternate Node executable",
    {
      executablePath: "/opt/homebrew/bin/node",
      kernelExecutablePath: "/opt/homebrew/bin/node",
    },
    /unexpected service executable/,
  ],
  [
    "shell wrapper",
    { executablePath: "/bin/zsh", kernelExecutablePath: "/bin/zsh" },
    /unexpected service executable/,
  ],
  [
    "Node device/inode substitution",
    { executableDevice: "999", executableInode: "999" },
    /device\/inode identity changed/,
  ],
  [
    "internally inconsistent xpcproxy evidence",
    {
      executablePath: darwinXpcproxyExecutable,
      kernelExecutablePath: "/usr/local/bin/node",
    },
    /internally inconsistent/,
  ],
]) {
  test(`exact process identity rejects ${name}`, async (t) => {
    const { options, harness } = await withFixture(t, { processIdentity })
    await assert.rejects(invokeStart(options, harness), pattern)
    assert.equal(harness.state().loaded, false)
  })
}

test("executable or argv retrieval failure rejects and journals unavailable evidence", async (t) => {
  const { options, harness } = await withFixture(t, {
    processIdentityError: "Darwin process identity unavailable: synthetic argv failure",
  })
  let failure
  try {
    await invokeStart(options, harness)
  } catch (error) {
    failure = error
  }
  assert.match(failure?.message ?? "", /synthetic argv failure/)
  const evidence = JSON.parse(await readFile(failure.startEvidencePath, "utf8"))
  assert.equal(evidence.observations[0].classification, "unavailable")
  assert.equal(evidence.observations[0].argvRetrievalStatus, "error")
  assert.equal(evidence.observations[0].decision, "reject")
})

test("configured Node symlinks are rejected before launchd mutation", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koalafrog-node-symlink-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const options = serviceFixture(root)
  const linkedNode = path.join(root, "bin", "node")
  await mkdir(path.dirname(linkedNode), { recursive: true })
  await symlink(process.execPath, linkedNode)
  options.nodeBinary = linkedNode
  options.contents = buildLaunchAgentPlist(options)
  await installInactive(options)
  const harness = await createHarness(options)
  await assert.rejects(invokeStart(options, harness), /must not be a symbolic link/)
  assert.equal(harness.calls.some((call) => call[1] === "bootstrap"), false)
})

for (const [name, behavior, message] of [
  ["bootstrap failure", { bootstrapFailure: true }, /bootstrap failure/],
  ["kickstart failure", { kickstartFailure: true }, /kickstart failure/],
  [
    "PID never appears",
    { suppressPid: true, healthOnKickstart: false },
    /health startup timed out/,
  ],
  ["health never appears", { healthOnKickstart: false }, /health startup timed out/],
  ["exit before health", { exitBeforeHealth: true }, /exited before startup identity/],
  [
    "exit immediately after health",
    { exitAfterPrint: 3 },
    /exited (?:during startup|before startup identity)/,
  ],
  ["PID change", { restartAfterPrint: 3 }, /PID changed/],
  ["launch-count increase", { restartAfterPrint: 3 }, /PID changed|launch count changed/],
]) {
  test(`start-once fails disabled on ${name}`, async (t) => {
    const { options, harness } = await withFixture(t, behavior)
    await assert.rejects(invokeStart(options, harness), message)
    assert.deepEqual(harness.state(), {
      loaded: false,
      running: false,
      pid: behavior.restartAfterPrint ? 4343 : 4242,
      launchCount:
        behavior.restartAfterPrint || (!behavior.bootstrapFailure && !behavior.kickstartFailure)
          ? behavior.restartAfterPrint
            ? 2
            : 1
          : 0,
    })
    assert.equal((await stat(options.plistPath)).mode & 0o777, 0o600)
  })
}

for (const [field, value] of [
  ["runtimeRelease", "f".repeat(64)],
  ["manifestSha256", "f".repeat(64)],
  ["sourceCommit", "f".repeat(40)],
  ["sourceTree", "f".repeat(40)],
  ["serviceConfigSha256", "f".repeat(64)],
  ["servicePid", 7777],
]) {
  test(`start-once rejects wrong health ${field}`, async (t) => {
    const { options, harness } = await withFixture(t, {
      healthOverrides: { [field]: value },
    })
    await assert.rejects(invokeStart(options, harness), /health .*mismatch|health PID/)
    assert.equal(harness.state().loaded, false)
  })
}

test("stale health is ignored until a new PID-bound session replaces it", async (t) => {
  const { options, harness } = await withFixture(t, {
    staleHealth: true,
    healthOnKickstart: false,
    delayedHealthSleep: 2,
  })
  const result = await invokeStart(options, harness)
  assert.equal(result.pid, 4242)
  assert.equal(result.startupSessionId, "00000000-0000-4000-8000-000000000002")
})

test("stale same-runtime health with an old PID never satisfies startup", async (t) => {
  const { options, harness } = await withFixture(t, {
    staleHealth: true,
    healthOnKickstart: false,
  })
  await assert.rejects(invokeStart(options, harness), /health startup timed out/)
  assert.equal(harness.state().loaded, false)
})

test("launchd PID must execute the exact installed runtime command", async (t) => {
  const { options, harness } = await withFixture(t, {
    processIdentity: ({ expectedArgv }) => ({
      argv: [
        expectedArgv[0],
        "/tmp/foreign-runtime/repository-orchestrator.mjs",
        ...expectedArgv.slice(2),
      ],
    }),
  })
  await assert.rejects(invokeStart(options, harness), /argv differs at index 1/)
  assert.equal(harness.state().loaded, false)
})

test("malformed, delayed-past-timeout, and changing health never succeeds", async (t) => {
  await t.test("malformed", async (t) => {
    const { options, harness } = await withFixture(t, { malformedHealth: true })
    await assert.rejects(invokeStart(options, harness), /health startup timed out/)
  })
  await t.test("delayed", async (t) => {
    const { options, harness } = await withFixture(t, {
      healthOnKickstart: false,
      delayedHealthSleep: 20,
    })
    await assert.rejects(invokeStart(options, harness), /health startup timed out/)
  })
  await t.test("changes after readiness", async (t) => {
    const { options, harness } = await withFixture(t, { changeHealthSleep: 2 })
    await assert.rejects(invokeStart(options, harness), /health changed after readiness/)
  })
})

test("start-once rejects an already loaded target or active process tree", async (t) => {
  await t.test("loaded target", async (t) => {
    const { options, harness } = await withFixture(t, { initiallyLoaded: true })
    await assert.rejects(invokeStart(options, harness), /service is active/)
    assert.equal(harness.calls.some((call) => call[1] === "bootstrap"), false)
  })
  await t.test("active process", async (t) => {
    const { options, harness } = await withFixture(t)
    await assert.rejects(
      startOnceLaunchAgent({
        ...options,
        processMatches: [{ pid: 9898 }],
        run: harness.run,
      }),
      /process tree must stop/,
    )
    assert.equal(harness.calls.some((call) => call[1] === "bootstrap"), false)
  })
})

test("start-once rejects unsafe plist policies before launchd mutation", async (t) => {
  const { options, harness } = await withFixture(t)
  const runAtLoad = options.contents.replace(
    /<key>RunAtLoad<\/key>\s*<false\/>/,
    "<key>RunAtLoad</key>\n  <true/>",
  )
  const keepAlive = options.contents.replace(
    "</dict>\n</plist>",
    "  <key>KeepAlive</key>\n  <true/>\n</dict>\n</plist>",
  )
  await assert.rejects(
    startOnceLaunchAgent({ ...options, contents: runAtLoad, run: harness.run }),
    /RunAtLoad=false/,
  )
  await assert.rejects(
    startOnceLaunchAgent({ ...options, contents: keepAlive, run: harness.run }),
    /forbids KeepAlive/,
  )
  assert.throws(
    () => buildLaunchAgentPlist({ ...options, autoCommit: true }),
    /forbids service-wide auto-commit/,
  )
  assert.equal(harness.calls.some((call) => call[1] === "bootstrap"), false)
})

test("start-once cleanup failure is loud and preserves evidence", async (t) => {
  const { root, options, harness } = await withFixture(t, {
    kickstartFailure: true,
    cleanupFailure: true,
  })
  await assert.rejects(
    invokeStart(options, harness),
    (error) => {
      assert.equal(error.code, "LAUNCH_AGENT_START_CLEANUP_INCOMPLETE")
      assert.match(error.message, /target remains loaded/)
      return true
    },
  )
  assert.equal(harness.state().loaded, true)
  const evidenceNames = await import("node:fs/promises").then(({ readdir }) =>
    readdir(path.join(root, "evidence")),
  )
  assert.ok(evidenceNames.some((name) => name.includes("failed-start")))
})

test("start-once does not mutate issue state or invoke GitHub, Codex, or Git", async (t) => {
  const { root, options, harness } = await withFixture(t)
  const issueStatePath = path.join(root, "state", "synthetic-issue", "state.json")
  await mkdir(path.dirname(issueStatePath), { recursive: true })
  await writeFile(issueStatePath, "immutable synthetic state\n")
  const before = await readFile(issueStatePath)
  await invokeStart(options, harness)
  assert.deepEqual(await readFile(issueStatePath), before)
  assert.equal(
    harness.calls.some((call) => new Set(["gh", "codex", "git"]).has(call[0])),
    false,
  )
})

test("active install uses the same verified kickstart and health contract", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koalafrog-active-install-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const options = serviceFixture(root)
  const harness = await createHarness(options)
  const result = await installAndStartLaunchAgent({
    ...options,
    run: harness.run,
    sleep: harness.sleep,
    now: harness.now,
    inspectProcesses: harness.inspectProcesses,
    inspectProcessIdentity: harness.inspectProcessIdentity,
  })
  assert.equal(result.loaded, true)
  assert.equal(result.pid, 4242)
  assert.equal(harness.calls.filter((call) => call[1] === "bootstrap").length, 1)
  assert.equal(harness.calls.filter((call) => call[1] === "kickstart").length, 1)
})

test("isolated install-disabled to start-once lifecycle is explicit and recoverable", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koalafrog-service-lifecycle-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const options = serviceFixture(root)
  const harness = await createHarness(options, {
    processIdentitySequence: [xpcproxyIdentity(), ({ expected }) => expected],
  })
  const installed = await installDisabledLaunchAgent({
    ...options,
    run: harness.run,
    inspectProcesses: harness.inspectProcesses,
  })
  assert.equal(installed.loaded, false)
  assert.equal(harness.calls.some((call) => call[1] === "bootstrap"), false)
  assert.equal(harness.calls.some((call) => call[1] === "kickstart"), false)

  const started = await invokeStart(options, harness)
  assert.equal(started.loaded, true)
  await assert.rejects(invokeStart(options, harness), /service is active/)
  await harness.run("launchctl", ["bootout", started.target], {
    allowFailure: true,
  })
  assert.equal(harness.state().loaded, false)
  assert.equal(harness.state().running, false)
  assert.equal((await stat(options.plistPath)).mode & 0o777, 0o600)
})
