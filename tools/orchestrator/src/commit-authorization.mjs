import { createHash } from "node:crypto"
import { lstat, readFile } from "node:fs/promises"
import path from "node:path"

const digestPattern = /^[a-f0-9]{64}$/
const headPattern = /^[a-f0-9]{40}$/

function digest(value) {
  return createHash("sha256").update(value).digest("hex")
}

function normalizedAllowedPath(value) {
  if (
    typeof value !== "string" ||
    !value ||
    path.isAbsolute(value) ||
    value.split(/[\\/]/).includes("..") ||
    value === ".git" ||
    value.startsWith(".git/")
  ) {
    throw new Error("Commit authorization contains an unsafe allowed path")
  }
  return value.replace(/^\.\//, "").replace(/\/$/, "")
}

export function commitAuthorizationBindingDigest(value) {
  const binding = {
    repository: value.repository,
    issueNumber: value.issueNumber,
    instructionId: value.instructionId,
    worktreePath: value.worktreePath,
    branch: value.branch,
    expectedHead: value.expectedHead,
    allowedPaths: [...value.allowedPaths].sort(),
    maximumCommitCount: value.maximumCommitCount,
    commitMessageDigest: value.commitMessageDigest,
    pushAuthorized: value.pushAuthorized,
  }
  return digest(JSON.stringify(binding))
}

export async function validateCommitAuthorization(
  authorization,
  context,
  { inspectPath = lstat, read = readFile } = {},
) {
  if (
    authorization?.repository !== context.repository ||
    authorization?.issueNumber !== context.issueNumber ||
    authorization?.instructionId !== context.instructionId ||
    authorization?.worktreePath !== context.worktreePath ||
    authorization?.branch !== context.branch ||
    authorization?.expectedHead !== context.head ||
    authorization?.maximumCommitCount !== 1 ||
    authorization?.pushAuthorized !== false ||
    !headPattern.test(authorization.expectedHead ?? "") ||
    !digestPattern.test(authorization.commitMessageDigest ?? "") ||
    !Array.isArray(authorization.allowedPaths) ||
    authorization.allowedPaths.length === 0
  ) {
    return { accepted: false, code: "commit_authorization_binding" }
  }
  if (
    path.resolve(authorization.worktreePath) !==
      path.resolve(context.worktreePath) ||
    path.resolve(context.worktreePath) === path.resolve(context.coordinatorPath) ||
    (context.parentWorkspacePath &&
      path.resolve(context.worktreePath) === path.resolve(context.parentWorkspacePath)) ||
    (context.siblingWorktreePaths ?? []).some(
      (candidate) =>
        path.resolve(candidate) === path.resolve(context.worktreePath),
    )
  ) {
    return { accepted: false, code: "commit_authorization_checkout" }
  }
  let gitMetadata
  try {
    gitMetadata = await inspectPath(path.join(context.worktreePath, ".git"))
  } catch {
    return { accepted: false, code: "commit_authorization_git_metadata" }
  }
  if (!gitMetadata.isFile()) {
    return { accepted: false, code: "commit_authorization_git_pointer" }
  }
  try {
    const contents = await read(path.join(context.worktreePath, ".git"), "utf8")
    const match = contents.match(/^gitdir:\s*(.+)\s*$/)
    if (!match || contents.trim().split("\n").length !== 1) {
      return { accepted: false, code: "commit_authorization_git_pointer" }
    }
    const gitPointer = path.resolve(context.worktreePath, match[1])
    const expectedRoot = `${path.resolve(
      context.coordinatorPath,
      ".git",
      "worktrees",
    )}${path.sep}`
    if (!gitPointer.startsWith(expectedRoot)) {
      return { accepted: false, code: "commit_authorization_git_pointer_scope" }
    }
    if (!(await inspectPath(gitPointer)).isDirectory()) {
      return { accepted: false, code: "commit_authorization_git_pointer_target" }
    }
  } catch {
    return { accepted: false, code: "commit_authorization_git_pointer" }
  }
  let allowedPaths
  try {
    allowedPaths = authorization.allowedPaths.map(normalizedAllowedPath)
  } catch {
    return { accepted: false, code: "commit_authorization_path" }
  }
  if (new Set(allowedPaths).size !== allowedPaths.length) {
    return { accepted: false, code: "commit_authorization_path_duplicate" }
  }
  const changed = context.changedFiles.map(normalizedAllowedPath)
  if (
    changed.some(
      (file) =>
        !allowedPaths.some(
          (allowed) => file === allowed || file.startsWith(`${allowed}/`),
        ),
    )
  ) {
    return { accepted: false, code: "commit_authorization_path_widening" }
  }
  if (
    changed.some((file) =>
      (context.gitlinkPaths ?? []).some(
        (gitlink) => file === gitlink || file.startsWith(`${gitlink}/`),
      ),
    )
  ) {
    return { accepted: false, code: "commit_authorization_gitlink" }
  }
  if (digest(context.commitMessage) !== authorization.commitMessageDigest) {
    return { accepted: false, code: "commit_authorization_message" }
  }
  return {
    accepted: true,
    bindingDigest: commitAuthorizationBindingDigest(authorization),
    allowedPaths,
  }
}

export function commitAuthorizationReceipt({
  authorization,
  commitSha,
  committedPaths,
  committedAt = new Date(),
}) {
  if (!headPattern.test(commitSha ?? "")) {
    throw new Error("Commit authorization receipt requires a commit SHA")
  }
  return Object.freeze({
    schemaVersion: 1,
    bindingDigest: commitAuthorizationBindingDigest(authorization),
    commitSha,
    committedPaths: Object.freeze([...committedPaths].sort()),
    commitCount: 1,
    pushOccurred: false,
    committedAt: committedAt.toISOString(),
  })
}
