import { execFile } from "node:child_process"
import { lstat, readFile, readdir, realpath } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { listAgentControls } from "./control-plane.mjs"
import { extractIssueNumber } from "./repository-discovery.mjs"

const execFileAsync = promisify(execFile)
const fullShaPattern = /^[0-9a-f]{40}$/
const safeBranchPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/
const gitOperationMarkers = [
  "CHERRY_PICK_HEAD",
  "MERGE_HEAD",
  "REVERT_HEAD",
  "REBASE_HEAD",
]
const gitOperationDirectories = ["rebase-merge", "rebase-apply", "sequencer"]

async function git(args, cwd, { allowFailure = false, trim = true } = {}) {
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    })
    return trim ? result.stdout.trim() : result.stdout
  } catch (error) {
    if (allowFailure) return null
    throw error
  }
}

async function regularPath(target, type) {
  const stat = await lstat(target)
  if (stat.isSymbolicLink()) return false
  return type === "file" ? stat.isFile() : stat.isDirectory()
}

async function optionalPathExists(target) {
  try {
    await lstat(target)
    return true
  } catch (error) {
    if (error.code === "ENOENT") return false
    throw error
  }
}

async function readSmallFile(target) {
  const stat = await lstat(target)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4_096) return null
  return readFile(target, "utf8")
}

async function treeContainsSymlink(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) return true
    if (
      entry.isDirectory() &&
      (await treeContainsSymlink(path.join(root, entry.name)))
    ) {
      return true
    }
  }
  return false
}

function exactPathWithin(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return Boolean(
    relative && !relative.startsWith("..") && !path.isAbsolute(relative),
  )
}

function currentIssueUrl(task) {
  return (
    task?.issue?.html_url ??
    task?.issue?.display_url ??
    task?.issue?.url ??
    null
  )
}

function extractAuthorizedCherryPick(prompt, head) {
  if (
    typeof prompt !== "string" ||
    !prompt.includes(head) ||
    !/\bowner\b[\s\S]{0,120}\bexplicit(?:ly)?\b[\s\S]{0,100}\bapprov(?:e|ed|es|al)\b/i.test(
      prompt,
    ) ||
    !/\bexact linked-worktree Git metadata writes required\b/i.test(prompt) ||
    !/\bexecute only this approved Git path\b/i.test(prompt) ||
    !/\bstarting exactly from\b/i.test(prompt) ||
    !/\bpush the new integration branch normally\b/i.test(prompt) ||
    !/\bopen a PR for review\b/i.test(prompt) ||
    !/\bstop at review\b/i.test(prompt)
  ) {
    return null
  }
  const commits = [
    ...prompt.matchAll(/\bcherry-pick only\s+`?([0-9a-f]{40})`?/gi),
  ].map((match) => match[1].toLowerCase())
  return commits.length === 1 ? commits[0] : null
}

function sourceRunProvesPreApplicationGitFailure(run, record) {
  const finalMessage = run?.resultArtifact?.finalMessage
  return Boolean(
    run?.instructionId === record.precedingInstructionId &&
      run.status === "needs_review" &&
      run.branch === record.toBranch &&
      Array.isArray(run.commits) &&
      run.commits.length === 1 &&
      run.commits[0] === record.head &&
      run.resultArtifact?.source === "completed_turn_final_message" &&
      run.resultArtifact?.turnStatus === "completed" &&
      typeof finalMessage === "string" &&
      /Cherry-pick:\s*\*\*FAILED before application\*\*/i.test(finalMessage) &&
      /linked worktree(?:'|’|\s)s?\s*`index\.lock`/i.test(finalMessage) &&
      /no `CHERRY_PICK_HEAD` remains[^\n]*worktree is clean/i.test(finalMessage) &&
      /Push:\s*\*\*NOT ATTEMPTED\*\*/i.test(finalMessage),
  )
}

function authorizationRecord({ state, instruction, task }) {
  if (
    !state?.activeInstruction ||
    state.activeInstruction.instructionId !== instruction?.instructionId ||
    !new Set(["selected", "thread_ready"]).has(state.activeInstruction.phase) ||
    instruction.action !== "continue" ||
    instruction.taskState !== state.status ||
    instruction.ownerApprovalRequired ||
    extractIssueNumber(task?.issue) !== state.task?.originIssueNumber ||
    currentIssueUrl(task) !== state.task?.originIssueUrl
  ) {
    return null
  }
  const controls = listAgentControls(task.issue, task.comments)
  const matches = controls.filter(
    (control) => control.instructionId === instruction.instructionId,
  )
  if (
    matches.length !== 1 ||
    matches[0].action !== "continue" ||
    matches[0].prompt !== instruction.prompt ||
    matches[0].ownerApprovalRequired
  ) {
    return null
  }
  const records = (state.workspaceBranchReconciliations ?? []).filter(
    (record) =>
      record.continuationInstructionId === instruction.instructionId &&
      record.originIssueNumber === state.task.originIssueNumber &&
      record.originIssueUrl === state.task.originIssueUrl &&
      record.threadId === state.threadId &&
      record.workspacePath === state.workspacePath &&
      record.toBranch === state.branch &&
      fullShaPattern.test(record.head ?? ""),
  )
  if (records.length !== 1) return null
  const record = records[0]
  const expectedId = [
    "authorized-workspace-branch",
    record.precedingInstructionId,
    instruction.instructionId,
    record.head,
  ].join(":")
  if (record.reconciliationId !== expectedId) return null
  const sourceRuns = (state.runs ?? []).filter(
    (run) => run.instructionId === record.precedingInstructionId,
  )
  if (
    sourceRuns.length !== 1 ||
    !sourceRunProvesPreApplicationGitFailure(sourceRuns[0], record)
  ) {
    return null
  }
  const cherryPickCommit = extractAuthorizedCherryPick(
    instruction.prompt,
    record.head,
  )
  return cherryPickCommit ? { record, cherryPickCommit } : null
}

async function linkedWorktreeMetadata({
  state,
  workspacePath,
  workspaceRoot,
  checkoutPath,
  record,
  cherryPickCommit,
}) {
  const normalizedWorkspace = path.resolve(workspacePath)
  const normalizedRoot = path.resolve(workspaceRoot)
  const normalizedCheckout = path.resolve(checkoutPath)
  if (
    workspacePath !== normalizedWorkspace ||
    workspaceRoot !== normalizedRoot ||
    checkoutPath !== normalizedCheckout ||
    state.workspacePath !== normalizedWorkspace ||
    path.dirname(normalizedWorkspace) !== normalizedRoot ||
    !path.basename(normalizedWorkspace).startsWith(
      `issue-${state.task.originIssueNumber}-`,
    ) ||
    !safeBranchPattern.test(state.branch ?? "") ||
    state.branch
      .split("/")
      .some((segment) => segment === "." || segment === "..")
  ) {
    return null
  }

  if (
    !(await regularPath(normalizedRoot, "directory")) ||
    !(await regularPath(normalizedWorkspace, "directory")) ||
    !(await regularPath(normalizedCheckout, "directory"))
  ) {
    return null
  }
  const [rootReal, workspaceReal, checkoutReal] = await Promise.all([
    realpath(normalizedRoot),
    realpath(normalizedWorkspace),
    realpath(normalizedCheckout),
  ])
  if (
    rootReal !== normalizedRoot ||
    workspaceReal !== normalizedWorkspace ||
    checkoutReal !== normalizedCheckout ||
    !exactPathWithin(rootReal, workspaceReal)
  ) {
    return null
  }

  const workspaceGitFile = path.join(workspaceReal, ".git")
  const checkoutGitDirectory = path.join(checkoutReal, ".git")
  if (
    !(await regularPath(workspaceGitFile, "file")) ||
    !(await regularPath(checkoutGitDirectory, "directory"))
  ) {
    return null
  }
  const pointer = await readSmallFile(workspaceGitFile)
  const pointerMatch = pointer?.match(/^gitdir: ([^\r\n]+)\r?\n?$/)
  if (!pointerMatch) return null
  const pointerTarget = path.isAbsolute(pointerMatch[1])
    ? path.normalize(pointerMatch[1])
    : path.resolve(workspaceReal, pointerMatch[1])

  const [gitDirectoryOutput, commonDirectoryOutput, checkoutCommonOutput] =
    await Promise.all([
      git(["rev-parse", "--path-format=absolute", "--git-dir"], workspaceReal),
      git(
        ["rev-parse", "--path-format=absolute", "--git-common-dir"],
        workspaceReal,
      ),
      git(
        ["rev-parse", "--path-format=absolute", "--git-common-dir"],
        checkoutReal,
      ),
    ])
  const [gitDirectory, commonDirectory, checkoutCommonDirectory] =
    await Promise.all([
      realpath(gitDirectoryOutput),
      realpath(commonDirectoryOutput),
      realpath(checkoutCommonOutput),
    ])
  if (
    pointerTarget !== gitDirectory ||
    commonDirectory !== checkoutCommonDirectory ||
    commonDirectory !== checkoutGitDirectory ||
    !(await regularPath(gitDirectory, "directory")) ||
    !(await regularPath(commonDirectory, "directory"))
  ) {
    return null
  }

  const worktreesDirectory = path.join(commonDirectory, "worktrees")
  if (
    !(await regularPath(worktreesDirectory, "directory")) ||
    path.dirname(gitDirectory) !== worktreesDirectory ||
    !exactPathWithin(worktreesDirectory, gitDirectory)
  ) {
    return null
  }
  const worktreeName = path.basename(gitDirectory)
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(worktreeName)) return null

  const commonPointer = await readSmallFile(path.join(gitDirectory, "commondir"))
  const workspacePointer = await readSmallFile(path.join(gitDirectory, "gitdir"))
  if (
    commonPointer?.trim() !== "../.." ||
    path.normalize(workspacePointer?.trim() ?? "") !== workspaceGitFile ||
    (await realpath(path.resolve(gitDirectory, commonPointer.trim()))) !==
      commonDirectory ||
    (await realpath(path.normalize(workspacePointer.trim()))) !== workspaceGitFile
  ) {
    return null
  }

  const [branch, head, status, branchHead, commitType] = await Promise.all([
    git(["branch", "--show-current"], workspaceReal),
    git(["rev-parse", "HEAD"], workspaceReal),
    git(["status", "--porcelain=v1", "-z"], workspaceReal, { trim: false }),
    git(["rev-parse", `refs/heads/${state.branch}`], workspaceReal),
    git(["cat-file", "-t", `${cherryPickCommit}^{commit}`], workspaceReal),
  ])
  if (
    branch !== state.branch ||
    head !== record.head ||
    branchHead !== record.head ||
    status !== "" ||
    commitType !== "commit"
  ) {
    return null
  }
  for (const marker of gitOperationMarkers) {
    if (await optionalPathExists(path.join(gitDirectory, marker))) return null
  }
  for (const directory of gitOperationDirectories) {
    if (await optionalPathExists(path.join(gitDirectory, directory))) return null
  }

  const objectsDirectory = path.join(commonDirectory, "objects")
  if (
    !(await regularPath(objectsDirectory, "directory")) ||
    (await treeContainsSymlink(gitDirectory)) ||
    (await treeContainsSymlink(objectsDirectory))
  ) {
    return null
  }
  const branchRef = path.join(
    commonDirectory,
    "refs",
    "heads",
    ...state.branch.split("/"),
  )
  if (
    !exactPathWithin(path.join(commonDirectory, "refs", "heads"), branchRef) ||
    !(await regularPath(branchRef, "file")) ||
    (await readSmallFile(branchRef))?.trim() !== record.head
  ) {
    return null
  }
  const branchLog = path.join(
    commonDirectory,
    "logs",
    "refs",
    "heads",
    ...state.branch.split("/"),
  )
  if (
    (await optionalPathExists(branchLog)) &&
    !(await regularPath(branchLog, "file"))
  ) {
    return null
  }

  return {
    gitDirectory,
    commonDirectory,
    writablePaths: [
      gitDirectory,
      objectsDirectory,
      branchRef,
      `${branchRef}.lock`,
      branchLog,
      `${branchLog}.lock`,
    ],
  }
}

function exactGitCommands({ cherryPickCommit, branch, baseBranch }) {
  const cherryPick = `git -c core.hooksPath=/dev/null -c commit.gpgSign=false -c rerere.enabled=false cherry-pick ${cherryPickCommit}`
  return {
    cherry_pick: [cherryPick],
    push: [`git push origin ${branch}`],
    ...(baseBranch
      ? {
          pull_request: [
            `gh pr create --base ${baseBranch} --head ${branch} --fill`,
          ],
        }
      : {}),
    validation: [
      "npm run lint",
      "npm test",
      "npm run test:cloudflare",
      "npm run build",
      "npx tsc -b",
      "git diff --check",
      "git status --short --branch",
      "git status --porcelain=v1",
      "git rev-parse HEAD",
      "git rev-parse HEAD^{tree}",
      "git log -1 --format=%H",
    ],
  }
}

function normalizedDisplayedCommand(value) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  const single = trimmed.match(/^\/bin\/zsh -lc '([^']+)'$/)
  if (single) return single[1]
  const double = trimmed.match(/^\/bin\/zsh -lc "([^"$`\\]+)"$/)
  if (double) return double[1]
  return trimmed
}

function exactFilesystemWriteRequest(permissions, writablePaths) {
  if (!permissions || typeof permissions !== "object") return false
  const keys = Object.keys(permissions).sort()
  if (keys.length !== 1 || keys[0] !== "fileSystem") return false
  const fileSystem = permissions.fileSystem
  if (!fileSystem || typeof fileSystem !== "object") return false
  const fileSystemKeys = Object.keys(fileSystem).sort()
  if (fileSystemKeys.length !== 1 || fileSystemKeys[0] !== "write") return false
  if (!Array.isArray(fileSystem.write)) return false
  const requested = [...fileSystem.write].sort()
  const expected = [...writablePaths].sort()
  return (
    requested.length === expected.length &&
    requested.every((entry, index) => entry === expected[index])
  )
}

function exactNetworkRequest(permissions) {
  return Boolean(
    permissions &&
      typeof permissions === "object" &&
      Object.keys(permissions).length === 1 &&
      permissions.network &&
      typeof permissions.network === "object" &&
      Object.keys(permissions.network).length === 1 &&
      permissions.network.enabled === true,
  )
}

export async function authorizedGitExecutionBoundary({
  state,
  instruction,
  task,
  workspacePath,
  workspaceRoot,
  checkoutPath,
  repository,
  baseRef,
}) {
  try {
    const authorization = authorizationRecord({ state, instruction, task })
    if (!authorization) return null
    if (repository !== "Sillyquack/koalafrog-hq") return null
    const metadata = await linkedWorktreeMetadata({
      state,
      workspacePath,
      workspaceRoot,
      checkoutPath,
      record: authorization.record,
      cherryPickCommit: authorization.cherryPickCommit,
    })
    if (!metadata) return null
    const baseMatch = String(baseRef ?? "").match(
      /^origin\/([A-Za-z0-9._/-]+)$/,
    )
    const baseBranch =
      baseMatch &&
      !baseMatch[1]
        .split("/")
        .some((segment) => segment === "." || segment === "..")
        ? baseMatch[1]
        : null
    return {
      schemaVersion: 1,
      instructionId: instruction.instructionId,
      issueNumber: state.task.originIssueNumber,
      originIssueUrl: state.task.originIssueUrl,
      threadId: state.threadId,
      workspacePath,
      branch: state.branch,
      head: authorization.record.head,
      cherryPickCommit: authorization.cherryPickCommit,
      gitDirectory: metadata.gitDirectory,
      commonDirectory: metadata.commonDirectory,
      writablePaths: metadata.writablePaths,
      repository,
      commands: exactGitCommands({
        cherryPickCommit: authorization.cherryPickCommit,
        branch: state.branch,
        baseBranch,
      }),
    }
  } catch {
    return null
  }
}

export function gitExecutionBoundaryPrompt(boundary) {
  if (!boundary) return ""
  return `\n\nOrchestrator-managed Git execution boundary (current instruction only):
- Keep ordinary commands in the default workspace-write sandbox.
- For the one authorized cherry-pick, run exactly: \`${boundary.commands.cherry_pick[0]}\`.
- Request \`sandbox_permissions: "with_additional_permissions"\` for that command with exactly \`additional_permissions.file_system.write\` set to this JSON array: ${JSON.stringify(boundary.writablePaths)}.
- Do not request any other filesystem paths or unsandboxed/full-access execution.
- The normal push and PR commands authorized by this instruction are exactly \`${boundary.commands.push[0]}\`${boundary.commands.pull_request ? ` and \`${boundary.commands.pull_request[0]}\`` : ""}; request only \`additional_permissions.network.enabled: true\` if either command requires network access.
- After the bounded grant, use only the exact Git commands above and these established validation/evidence commands: ${boundary.commands.validation.map((command) => `\`${command}\``).join(", ")}.
- Any different command or permission request will stop for owner review.`
}

export function matchGitExecutionBoundaryRequest({
  boundary,
  request,
  commandExecution,
}) {
  if (
    !boundary ||
    !new Set([
      "item/permissions/requestApproval",
      "item/commandExecution/requestApproval",
    ]).has(request?.method) ||
    request.threadId !== boundary.threadId ||
    request.itemId !== commandExecution?.id ||
    commandExecution?.type !== "commandExecution" ||
    commandExecution?.source !== "agent" ||
    commandExecution?.cwd !== boundary.workspacePath ||
    request.details?.cwd !== boundary.workspacePath
  ) {
    return null
  }
  const command = normalizedDisplayedCommand(commandExecution.command)
  const action = Object.entries(boundary.commands).find(([, commands]) =>
    commands.includes(command),
  )?.[0]
  if (!action) return null
  if (request.method === "item/commandExecution/requestApproval") {
    if (
      normalizedDisplayedCommand(request.details?.command) !== command ||
      request.details?.cwd !== boundary.workspacePath ||
      request.details?.reason != null ||
      request.details?.networkApprovalContext != null ||
      request.details?.proposedExecpolicyAmendment != null ||
      request.details?.proposedNetworkPolicyAmendments != null
    ) {
      return null
    }
    return { action, response: { decision: "accept" } }
  }
  const permissions = request.details?.permissions
  const matches =
    action === "cherry_pick"
      ? exactFilesystemWriteRequest(permissions, boundary.writablePaths)
      : new Set(["push", "pull_request"]).has(action) &&
        exactNetworkRequest(permissions)
  if (!matches) return null
  return {
    action,
    response: {
      permissions,
      scope: "turn",
      strictAutoReview: true,
    },
  }
}

export async function gitExecutionBoundaryIsCurrent(boundary, action) {
  try {
    if (
      !boundary ||
      !new Set([
        "cherry_pick",
        "push",
        "pull_request",
        "validation",
      ]).has(action) ||
      (await realpath(boundary.workspacePath)) !== boundary.workspacePath ||
      (await realpath(boundary.gitDirectory)) !== boundary.gitDirectory ||
      (await realpath(boundary.commonDirectory)) !== boundary.commonDirectory ||
      !(await regularPath(boundary.workspacePath, "directory")) ||
      !(await regularPath(boundary.gitDirectory, "directory")) ||
      !(await regularPath(boundary.commonDirectory, "directory")) ||
      (await treeContainsSymlink(boundary.gitDirectory)) ||
      (await treeContainsSymlink(path.join(boundary.commonDirectory, "objects")))
    ) {
      return false
    }
    const pointer = await readSmallFile(path.join(boundary.workspacePath, ".git"))
    const pointerMatch = pointer?.match(/^gitdir: ([^\r\n]+)\r?\n?$/)
    if (!pointerMatch) return false
    const pointerTarget = path.isAbsolute(pointerMatch[1])
      ? path.normalize(pointerMatch[1])
      : path.resolve(boundary.workspacePath, pointerMatch[1])
    if ((await realpath(pointerTarget)) !== boundary.gitDirectory) return false

    const [branch, head, status, branchHead] = await Promise.all([
      git(["branch", "--show-current"], boundary.workspacePath),
      git(["rev-parse", "HEAD"], boundary.workspacePath),
      git(["status", "--porcelain=v1", "-z"], boundary.workspacePath, {
        trim: false,
      }),
      git(
        ["rev-parse", `refs/heads/${boundary.branch}`],
        boundary.workspacePath,
      ),
    ])
    if (branch !== boundary.branch || status !== "" || branchHead !== head) {
      return false
    }
    for (const marker of gitOperationMarkers) {
      if (await optionalPathExists(path.join(boundary.gitDirectory, marker))) {
        return false
      }
    }
    for (const directory of gitOperationDirectories) {
      if (await optionalPathExists(path.join(boundary.gitDirectory, directory))) {
        return false
      }
    }
    if (action === "cherry_pick") return head === boundary.head

    const [parent, count, actualTree, reviewedTree] = await Promise.all([
      git(["rev-parse", "HEAD^"], boundary.workspacePath),
      git(["rev-list", "--count", `${boundary.head}..HEAD`], boundary.workspacePath),
      git(["rev-parse", "HEAD^{tree}"], boundary.workspacePath),
      git(
        ["rev-parse", `${boundary.cherryPickCommit}^{tree}`],
        boundary.workspacePath,
      ),
    ])
    return parent === boundary.head && count === "1" && actualTree === reviewedTree
  } catch {
    return false
  }
}

export function gitExecutionPathIsCovered(boundary, target) {
  const normalized = path.resolve(target)
  return Boolean(
    boundary?.writablePaths?.some((root) => {
      const relative = path.relative(root, normalized)
      return (
        relative === "" ||
        (!relative.startsWith("..") && !path.isAbsolute(relative))
      )
    }),
  )
}
