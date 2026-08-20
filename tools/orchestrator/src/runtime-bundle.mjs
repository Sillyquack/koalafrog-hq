import { createHash, randomUUID } from "node:crypto"
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import path from "node:path"

const runtimeFiles = [
  "package.json",
  "bin/orchestrator.mjs",
  "bin/orchestrator-service.mjs",
  "bin/repository-orchestrator.mjs",
  "src/app-server.mjs",
  "src/config.mjs",
  "src/control-plane.mjs",
  "src/github-control-plane.mjs",
  "src/launchd.mjs",
  "src/orchestrator.mjs",
  "src/queue-claim-store.mjs",
  "src/repository-discovery.mjs",
  "src/repository-runner.mjs",
  "src/runtime-bundle.mjs",
  "src/runtime-policy.mjs",
  "src/state-store.mjs",
  "src/turn-accounting.mjs",
  "src/workspace.mjs",
]

function digest(value) {
  return createHash("sha256").update(value).digest("hex")
}

async function inspectSource(sourceDirectory) {
  const files = []
  const releaseDigest = createHash("sha256")
  for (const relativePath of runtimeFiles) {
    const contents = await readFile(path.join(sourceDirectory, relativePath))
    const fileDigest = digest(contents)
    files.push({ relativePath, contents, digest: fileDigest })
    releaseDigest.update(relativePath)
    releaseDigest.update("\0")
    releaseDigest.update(contents)
    releaseDigest.update("\0")
  }
  return { files, digest: releaseDigest.digest("hex") }
}

export async function planRuntimeRelease({
  sourceDirectory,
  stateDirectory,
  runtimeDirectory = path.join(stateDirectory, "runtime"),
}) {
  if (!path.isAbsolute(sourceDirectory) || !path.isAbsolute(runtimeDirectory)) {
    throw new Error("Runtime source and destination must be absolute paths")
  }
  const inspected = await inspectSource(sourceDirectory)
  const releaseDirectory = path.join(
    runtimeDirectory,
    "releases",
    inspected.digest,
  )
  return {
    ...inspected,
    sourceDirectory,
    runtimeDirectory,
    releaseDirectory,
    orchestratorScript: path.join(
      releaseDirectory,
      "bin",
      "repository-orchestrator.mjs",
    ),
  }
}

async function verifyRelease(plan) {
  const manifestPath = path.join(plan.releaseDirectory, "manifest.json")
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
  if (manifest.digest !== plan.digest) {
    throw new Error("Installed runtime manifest does not match its release path")
  }
  for (const file of plan.files) {
    const installed = await readFile(
      path.join(plan.releaseDirectory, file.relativePath),
    )
    if (digest(installed) !== file.digest) {
      throw new Error(
        `Installed immutable runtime was modified: ${file.relativePath}`,
      )
    }
  }
}

export async function materializeRuntimeRelease(plan) {
  let releaseExists = false
  try {
    const release = await stat(plan.releaseDirectory)
    if (!release.isDirectory()) {
      throw new Error("Runtime release destination is not a directory")
    }
    releaseExists = true
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }
  if (releaseExists) {
    await verifyRelease(plan)
    return { status: "unchanged", ...plan }
  }

  const releasesDirectory = path.dirname(plan.releaseDirectory)
  await mkdir(releasesDirectory, { recursive: true, mode: 0o700 })
  const temporary = path.join(
    releasesDirectory,
    `.${plan.digest}.${process.pid}.${randomUUID()}.tmp`,
  )
  try {
    await mkdir(temporary, { recursive: false, mode: 0o700 })
    for (const file of plan.files) {
      const destination = path.join(temporary, file.relativePath)
      await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 })
      await writeFile(destination, file.contents, { mode: 0o600 })
    }
    const manifest = {
      schemaVersion: 1,
      digest: plan.digest,
      files: plan.files.map(({ relativePath, digest: fileDigest }) => ({
        path: relativePath,
        sha256: fileDigest,
      })),
    }
    await writeFile(
      path.join(temporary, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { mode: 0o600 },
    )
    await rename(temporary, plan.releaseDirectory)
  } catch (error) {
    if (new Set(["EEXIST", "ENOTEMPTY"]).has(error.code)) {
      await rm(temporary, { recursive: true, force: true })
      await verifyRelease(plan)
      return { status: "unchanged", ...plan }
    }
    await rm(temporary, { recursive: true, force: true })
    throw error
  }
  await chmod(plan.releaseDirectory, 0o700)
  await verifyRelease(plan)
  return { status: "created", ...plan }
}
