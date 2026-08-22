import { createHash, randomUUID } from "node:crypto"
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import path from "node:path"

const runtimeEntrypoints = [
  "bin/orchestrator.mjs",
  "bin/orchestrator-service.mjs",
  "bin/repository-orchestrator.mjs",
]
const runtimeModuleDirectories = ["bin", "src"]
const staticImportPattern =
  /^\s*import\s+(?:[\s\S]*?\s+from\s+)?(["'])([^"'\r\n]+)\1/gm
const staticExportPattern =
  /^\s*export\s+(?:\*|\{[\s\S]*?\})\s+from\s+(["'])([^"'\r\n]+)\1/gm
const dynamicImportPattern =
  /\bimport\s*\(\s*(["'])([^"'\r\n]+)\1\s*\)/g

function digest(value) {
  return createHash("sha256").update(value).digest("hex")
}

async function discoverRuntimeFiles(sourceDirectory) {
  const files = ["package.json"]
  const packageStat = await lstat(path.join(sourceDirectory, "package.json"))
  if (!packageStat.isFile() || packageStat.isSymbolicLink()) {
    throw new Error("Runtime package.json must be a regular file")
  }

  const visit = async (relativeDirectory) => {
    const directory = path.join(sourceDirectory, relativeDirectory)
    const directoryStat = await lstat(directory)
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      throw new Error(
        `Runtime module directory must be a regular directory: ${relativeDirectory}`,
      )
    }
    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const relativePath = path.posix.join(relativeDirectory, entry.name)
      if (entry.isSymbolicLink()) {
        throw new Error(`Runtime source cannot contain symlinks: ${relativePath}`)
      }
      if (entry.isDirectory()) {
        await visit(relativePath)
      } else if (entry.isFile() && path.extname(entry.name) === ".mjs") {
        files.push(relativePath)
      }
    }
  }
  for (const directory of runtimeModuleDirectories) await visit(directory)
  files.sort()

  const discovered = new Set(files)
  for (const entrypoint of runtimeEntrypoints) {
    if (!discovered.has(entrypoint)) {
      throw new Error(`Runtime entrypoint is missing: ${entrypoint}`)
    }
  }
  return files
}

function moduleSpecifiers(contents) {
  const source = contents.toString("utf8")
  const specifiers = []
  for (const pattern of [
    staticImportPattern,
    staticExportPattern,
    dynamicImportPattern,
  ]) {
    pattern.lastIndex = 0
    for (const match of source.matchAll(pattern)) specifiers.push(match[2])
  }
  return specifiers
}

function verifyLocalDependencyClosure(files) {
  const packaged = new Set(files.map((file) => file.relativePath))
  for (const file of files.filter(({ relativePath }) =>
    relativePath.endsWith(".mjs"),
  )) {
    for (const specifier of moduleSpecifiers(file.contents)) {
      if (specifier.startsWith("node:")) continue
      if (!specifier.startsWith(".")) {
        throw new Error(
          `Runtime dependency must be local or a Node built-in: ${file.relativePath} -> ${specifier}`,
        )
      }
      const dependency = path.posix.normalize(
        path.posix.join(path.posix.dirname(file.relativePath), specifier),
      )
      if (
        dependency.startsWith("../") ||
        path.posix.isAbsolute(dependency) ||
        !packaged.has(dependency)
      ) {
        throw new Error(
          `Runtime local dependency is missing: ${file.relativePath} -> ${specifier}`,
        )
      }
    }
  }
}

async function inspectSource(sourceDirectory) {
  const files = []
  const releaseDigest = createHash("sha256")
  for (const relativePath of await discoverRuntimeFiles(sourceDirectory)) {
    const contents = await readFile(path.join(sourceDirectory, relativePath))
    const fileDigest = digest(contents)
    files.push({ relativePath, contents, digest: fileDigest })
    releaseDigest.update(relativePath)
    releaseDigest.update("\0")
    releaseDigest.update(contents)
    releaseDigest.update("\0")
  }
  verifyLocalDependencyClosure(files)
  return { files, digest: releaseDigest.digest("hex") }
}

export function runtimeSourceDirectoryForCheckout(checkoutPath) {
  if (!path.isAbsolute(checkoutPath)) {
    throw new Error("Runtime checkout must be an absolute path")
  }
  return path.join(checkoutPath, "tools", "orchestrator")
}

export async function planRuntimeReleaseFromCheckout({
  checkoutPath,
  stateDirectory,
  runtimeDirectory = path.join(stateDirectory, "runtime"),
}) {
  return planRuntimeRelease({
    sourceDirectory: runtimeSourceDirectoryForCheckout(checkoutPath),
    stateDirectory,
    runtimeDirectory,
  })
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
