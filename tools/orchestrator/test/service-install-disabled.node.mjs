import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const orchestratorDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
)
const repositoryDirectory = path.resolve(orchestratorDirectory, "..", "..")
const serviceLabel = "com.sillyquack.koalafrog-orchestrator"

async function writeExecutable(filePath, lines) {
  await writeFile(filePath, `${lines.join("\n")}\n`, { mode: 0o700 })
  await chmod(filePath, 0o700)
}

async function createSyntheticCoordinator(root) {
  const checkoutPath = path.join(root, "coordinator", "koalafrog-hq")
  await mkdir(path.join(checkoutPath, "tools"), { recursive: true })
  await cp(
    path.join(repositoryDirectory, "tools", "orchestrator"),
    path.join(checkoutPath, "tools", "orchestrator"),
    { recursive: true },
  )
  const git = async (args) =>
    execFileAsync("git", args, { cwd: checkoutPath, encoding: "utf8" })
  await git(["init", "--quiet"])
  await git(["config", "user.name", "Synthetic Installer Test"])
  await git(["config", "user.email", "installer-test@example.invalid"])
  await git(["add", "tools/orchestrator"])
  await git(["commit", "--quiet", "-m", "synthetic canonical source"])
  await git([
    "remote",
    "add",
    "origin",
    "https://github.com/Sillyquack/koalafrog-hq.git",
  ])
  await git(["update-ref", "refs/remotes/origin/main", "HEAD"])
  return checkoutPath
}

async function createFakeSystem(root) {
  const binaryDirectory = path.join(root, "fake-system-bin")
  await mkdir(binaryDirectory, { recursive: true })
  await writeExecutable(path.join(binaryDirectory, "launchctl"), [
    "#!/bin/sh",
    "printf 'launchctl %s\\n' \"$*\" >> \"$KOALAFROG_TEST_TRACE\"",
    "if [ \"$1\" = \"print\" ]; then",
    "  if [ \"${KOALAFROG_TEST_LAUNCHCTL_MODE:-unloaded}\" = \"loaded\" ]; then exit 0; fi",
    "  if [ \"${KOALAFROG_TEST_LAUNCHCTL_MODE:-unloaded}\" = \"post-loaded\" ]; then",
    "    count=0",
    "    if [ -f \"$KOALAFROG_TEST_COUNTER\" ]; then count=$(sed -n '1p' \"$KOALAFROG_TEST_COUNTER\"); fi",
    "    count=$((count + 1))",
    "    printf '%s\\n' \"$count\" > \"$KOALAFROG_TEST_COUNTER\"",
    "    if [ \"$count\" -eq 2 ]; then exit 0; fi",
    "  fi",
    "  exit 1",
    "fi",
    "exit 0",
  ])
  await writeExecutable(path.join(binaryDirectory, "plutil"), [
    "#!/bin/sh",
    "printf 'plutil %s\\n' \"$*\" >> \"$KOALAFROG_TEST_TRACE\"",
    "if [ \"${KOALAFROG_TEST_PLUTIL_FAIL:-false}\" = \"true\" ]; then exit 1; fi",
    "exit 0",
  ])
  await writeExecutable(path.join(binaryDirectory, "ps"), [
    "#!/bin/sh",
    "printf 'ps %s\\n' \"$*\" >> \"$KOALAFROG_TEST_TRACE\"",
    "exit 0",
  ])
  const codexBinary = path.join(binaryDirectory, "codex")
  await writeExecutable(codexBinary, [
    "#!/bin/sh",
    "printf 'codex %s\\n' \"$*\" >> \"$KOALAFROG_TEST_TRACE\"",
    "exit 99",
  ])
  await writeExecutable(path.join(binaryDirectory, "gh"), [
    "#!/bin/sh",
    "printf 'gh %s\\n' \"$*\" >> \"$KOALAFROG_TEST_TRACE\"",
    "exit 99",
  ])
  return { binaryDirectory, codexBinary }
}

function installPaths(root, name) {
  const installationRoot = path.join(root, name)
  return {
    stateDirectory: path.join(installationRoot, "state"),
    runtimeDirectory: path.join(installationRoot, "runtime"),
    plistPath: path.join(
      installationRoot,
      "home",
      "Library",
      "LaunchAgents",
      `${serviceLabel}.plist`,
    ),
    stdoutPath: path.join(installationRoot, "logs", "stdout.log"),
    stderrPath: path.join(installationRoot, "logs", "stderr.log"),
    tracePath: path.join(installationRoot, "system.trace"),
    counterPath: path.join(installationRoot, "launchctl.count"),
  }
}

async function invokeService({
  checkoutPath,
  system,
  paths,
  command = "install-disabled",
  extraArgs = [],
  launchctlMode = "unloaded",
}) {
  await mkdir(path.dirname(paths.tracePath), { recursive: true })
  await writeFile(paths.tracePath, "")
  const serviceScript = path.join(
    checkoutPath,
    "tools",
    "orchestrator",
    "bin",
    "orchestrator-service.mjs",
  )
  const args = [
    serviceScript,
    command,
    "--checkout",
    checkoutPath,
    "--state-dir",
    paths.stateDirectory,
    "--runtime-dir",
    paths.runtimeDirectory,
    "--plist-path",
    paths.plistPath,
    "--stdout-path",
    paths.stdoutPath,
    "--stderr-path",
    paths.stderrPath,
    "--node-bin",
    process.execPath,
    "--codex-bin",
    system.codexBinary,
    ...extraArgs,
  ]
  return execFileAsync(process.execPath, args, {
    cwd: checkoutPath,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: path.join(path.dirname(paths.stateDirectory), "home"),
      PATH: `${system.binaryDirectory}:${process.env.PATH}`,
      KOALAFROG_TEST_TRACE: paths.tracePath,
      KOALAFROG_TEST_COUNTER: paths.counterPath,
      KOALAFROG_TEST_LAUNCHCTL_MODE: launchctlMode,
    },
  })
}

function assertNeverActivated(trace) {
  assert.doesNotMatch(trace, /launchctl (?:bootstrap|kickstart|load)\b/)
  assert.doesNotMatch(trace, /^codex /m)
  assert.doesNotMatch(trace, /^gh /m)
}

test("install-disabled CLI materializes an immutable runtime and remains unloaded", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koalafrog-install-disabled-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const checkoutPath = await createSyntheticCoordinator(root)
  const system = await createFakeSystem(root)
  const paths = installPaths(root, "success")

  const first = JSON.parse(
    (await invokeService({ checkoutPath, system, paths })).stdout,
  )
  assert.equal(first.installationMode, "disabled")
  assert.equal(first.runtimeStatus, "created")
  assert.equal(first.writeStatus, "created")
  assert.equal(first.loaded, false)
  assert.equal((await stat(paths.plistPath)).mode & 0o777, 0o600)
  const plist = await readFile(paths.plistPath, "utf8")
  assert.match(plist, /<key>RunAtLoad<\/key>\s*<false\/>/)
  assert.doesNotMatch(plist, /<key>KeepAlive<\/key>/)
  const manifest = JSON.parse(
    await readFile(path.join(first.runtimeRelease, "manifest.json"), "utf8"),
  )
  const manifestContents = await readFile(
    path.join(first.runtimeRelease, "manifest.json"),
  )
  assert.equal(manifest.files.length, 27)
  assert.equal(manifest.source.repository, "Sillyquack/koalafrog-hq")
  assert.equal(manifest.source.commit.length, 40)
  assert.equal(manifest.source.tree.length, 40)
  assert.equal(
    createHash("sha256").update(manifestContents).digest("hex"),
    first.runtimeManifestSha256,
  )
  assert.equal(first.sourceCommit, manifest.source.commit)
  assert.equal(first.sourceTree, manifest.source.tree)

  const second = JSON.parse(
    (await invokeService({ checkoutPath, system, paths })).stdout,
  )
  assert.equal(second.runtimeStatus, "unchanged")
  assert.equal(second.writeStatus, "unchanged")
  assert.equal(second.runtimeRelease, first.runtimeRelease)
  assertNeverActivated(await readFile(paths.tracePath, "utf8"))
  await assert.rejects(
    readFile(path.join(paths.stateDirectory, "watcher-v2-health.json"), "utf8"),
    /ENOENT/,
  )
  assert.equal(
    (await readdir(paths.stateDirectory)).some((name) => name.startsWith("issue-")),
    false,
  )
})

test("render remains a read-only preview and materializes no runtime or plist", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koalafrog-install-disabled-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const checkoutPath = await createSyntheticCoordinator(root)
  const system = await createFakeSystem(root)
  const paths = installPaths(root, "render")

  const result = await invokeService({
    checkoutPath,
    system,
    paths,
    command: "render",
  })
  assert.match(result.stdout, /<key>RunAtLoad<\/key>\s*<false\/>/)
  assert.doesNotMatch(result.stdout, /<key>KeepAlive<\/key>/)
  await assert.rejects(readFile(paths.plistPath, "utf8"), /ENOENT/)
  await assert.rejects(stat(paths.runtimeDirectory), /ENOENT/)
  assert.equal(await readFile(paths.tracePath, "utf8"), "")
})

test("install-disabled CLI fails disabled after post-write launchd drift", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koalafrog-install-disabled-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const checkoutPath = await createSyntheticCoordinator(root)
  const system = await createFakeSystem(root)
  const paths = installPaths(root, "post-write-failure")

  await assert.rejects(
    invokeService({
      checkoutPath,
      system,
      paths,
      launchctlMode: "post-loaded",
    }),
    (error) => {
      assert.equal(error.code, 1)
      assert.match(error.stderr, /service remains disabled/)
      return true
    },
  )
  await assert.rejects(readFile(paths.plistPath, "utf8"), /ENOENT/)
  const evidenceDirectory = path.join(
    paths.stateDirectory,
    "service",
    "disabled",
    "watcher-v2-install-attempts",
  )
  assert.ok(
    (await readdir(evidenceDirectory)).some((name) =>
      name.includes("failed-attempt"),
    ),
  )
  const trace = await readFile(paths.tracePath, "utf8")
  assert.match(trace, /launchctl bootout /)
  assertNeverActivated(trace)
})

test("install-disabled CLI rejects coexistence and boot-start approval without activation", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "koalafrog-install-disabled-"))
  t.after(() => rm(root, { recursive: true, force: true }))
  const checkoutPath = await createSyntheticCoordinator(root)
  const system = await createFakeSystem(root)

  const loadedPaths = installPaths(root, "loaded")
  await assert.rejects(
    invokeService({
      checkoutPath,
      system,
      paths: loadedPaths,
      launchctlMode: "loaded",
    }),
    /service is active/,
  )
  await assert.rejects(readFile(loadedPaths.plistPath, "utf8"), /ENOENT/)
  assertNeverActivated(await readFile(loadedPaths.tracePath, "utf8"))

  const conflictingPaths = installPaths(root, "conflicting-plist")
  const conflictingPlist = path.join(
    path.dirname(conflictingPaths.plistPath),
    `${serviceLabel}.stale.plist`,
  )
  await mkdir(path.dirname(conflictingPlist), { recursive: true })
  await writeFile(conflictingPlist, "inactive evidence")
  await assert.rejects(
    invokeService({ checkoutPath, system, paths: conflictingPaths }),
    /Multiple active LaunchAgent plist candidates/,
  )
  await assert.rejects(readFile(conflictingPaths.plistPath, "utf8"), /ENOENT/)
  assertNeverActivated(await readFile(conflictingPaths.tracePath, "utf8"))

  const approvalPaths = installPaths(root, "run-at-load")
  await assert.rejects(
    invokeService({
      checkoutPath,
      system,
      paths: approvalPaths,
      extraArgs: ["--approve-run-at-load"],
    }),
    /install-disabled rejects --approve-run-at-load/,
  )
  await assert.rejects(readFile(approvalPaths.plistPath, "utf8"), /ENOENT/)
  assert.equal(await readFile(approvalPaths.tracePath, "utf8"), "")
})
