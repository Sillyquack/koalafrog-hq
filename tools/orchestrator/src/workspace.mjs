import { execFile } from "node:child_process"
import { access, mkdir } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

async function git(
  args,
  cwd,
  { allowFailure = false, trim = true } = {},
) {
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    })
    return {
      stdout: trim ? result.stdout.trim() : result.stdout,
      stderr: result.stderr.trim(),
      code: 0,
    }
  } catch (error) {
    if (!allowFailure) {
      throw new Error(
        `git ${args.join(" ")} failed: ${error.stderr?.trim() || error.message}`,
      )
    }
    return {
      stdout: error.stdout?.trim() ?? "",
      stderr: error.stderr?.trim() ?? "",
      code: error.code ?? 1,
    }
  }
}

function safeSegment(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
}

async function exists(target) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

export function branchForInstruction(issueNumber, instructionId) {
  return `agent/issue-${issueNumber}-${safeSegment(instructionId)}`
}

export async function ensureWorkspace({
  checkoutPath,
  workspaceRoot,
  issueNumber,
  instructionId,
  baseRef,
  existingPath,
  existingBranch,
  fetchRemote = true,
}) {
  if (existingPath) {
    if (!(await exists(existingPath))) {
      throw new Error(`Persisted workspace is missing: ${existingPath}`)
    }
    const branch = await git(["branch", "--show-current"], existingPath)
    if (existingBranch && branch.stdout !== existingBranch) {
      throw new Error(
        `Workspace branch changed: expected ${existingBranch}, found ${branch.stdout}`,
      )
    }
    return { path: existingPath, branch: branch.stdout }
  }

  const branch = branchForInstruction(issueNumber, instructionId)
  const workspacePath = path.join(
    workspaceRoot,
    `issue-${issueNumber}-${safeSegment(instructionId)}`,
  )
  await mkdir(workspaceRoot, { recursive: true, mode: 0o700 })
  if (await exists(workspacePath)) {
    throw new Error(
      `Refusing to overwrite unexpected workspace path: ${workspacePath}`,
    )
  }

  if (fetchRemote) await git(["fetch", "--prune", "origin"], checkoutPath)

  const branchExists = await git(
    ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
    checkoutPath,
    { allowFailure: true },
  )
  if (branchExists.code === 0) {
    await git(["worktree", "add", workspacePath, branch], checkoutPath)
  } else {
    await git(
      ["worktree", "add", "-b", branch, workspacePath, baseRef],
      checkoutPath,
    )
  }
  return { path: workspacePath, branch }
}

export function parseStatusFiles(status) {
  const files = []
  for (const entry of status.split("\0")) {
    if (!entry) continue
    const file = entry.slice(3)
    if (file) files.push(file.includes(" -> ") ? file.split(" -> ").at(-1) : file)
  }
  return files
}

export async function inspectWorkspace(workspacePath, baseRef) {
  const [branch, commits, committedFiles, workingStatus] = await Promise.all([
    git(["branch", "--show-current"], workspacePath),
    git(["log", "--format=%H", `${baseRef}..HEAD`], workspacePath),
    git(["diff", "--name-only", `${baseRef}...HEAD`], workspacePath),
    git(["status", "--porcelain=v1", "-z"], workspacePath, { trim: false }),
  ])
  const changedFiles = new Set(
    committedFiles.stdout.split("\n").filter(Boolean),
  )
  for (const file of parseStatusFiles(workingStatus.stdout)) changedFiles.add(file)
  return {
    branch: branch.stdout,
    commits: commits.stdout.split("\n").filter(Boolean),
    changedFiles: [...changedFiles].sort(),
    dirty: workingStatus.stdout !== "",
  }
}

function pathAllowed(file, allowedPaths) {
  return allowedPaths.some((allowed) => {
    const normalized = allowed.replace(/^\.\//, "").replace(/\/$/, "")
    return file === normalized || file.startsWith(`${normalized}/`)
  })
}

export function assertAllowedChanges(changedFiles, allowedPaths) {
  if (!allowedPaths.length) return
  const disallowed = changedFiles.filter((file) => !pathAllowed(file, allowedPaths))
  if (disallowed.length) {
    throw new Error(
      `Codex changed files outside the allowed proof scope: ${disallowed.join(", ")}`,
    )
  }
}

export async function commitWorkspaceChanges(workspacePath, message) {
  const status = await git(["status", "--porcelain=v1"], workspacePath)
  if (!status.stdout) return null
  await git(["add", "--all"], workspacePath)
  await git(["commit", "-m", message], workspacePath)
  return (await git(["rev-parse", "HEAD"], workspacePath)).stdout
}

export async function validateWorkspace(workspacePath, baseRef) {
  const committed = await git(
    ["diff", "--check", `${baseRef}...HEAD`],
    workspacePath,
    { allowFailure: true },
  )
  const working = await git(["diff", "--check"], workspacePath, {
    allowFailure: true,
  })
  const staged = await git(["diff", "--cached", "--check"], workspacePath, {
    allowFailure: true,
  })
  const pass = committed.code === 0 && working.code === 0 && staged.code === 0
  return {
    pass,
    detail: [committed.stderr, working.stderr, staged.stderr]
      .filter(Boolean)
      .join("\n"),
  }
}
