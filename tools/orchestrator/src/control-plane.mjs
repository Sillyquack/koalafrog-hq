import { createHash } from "node:crypto"
import path from "node:path"
import { quarantineAllowsControl } from "./watcher-v2.mjs"

const actions = new Set(["start", "continue", "stop"])
const taskStates = new Set([
  "ready",
  "running",
  "needs_review",
  "needs_owner",
  "done",
  "failed",
])
const instructionIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

function scalar(value) {
  const trimmed = value.trim()
  if (trimmed === "true") return true
  if (trimmed === "false") return false
  if (trimmed === "null") return null
  if (/^\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10)
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

export function parseAgentControlBlock(block) {
  const lines = block.replaceAll("\r\n", "\n").split("\n")
  const root = lines.findIndex((line) => /^agent_control:\s*$/.test(line.trim()))
  if (root === -1) return null

  const value = {}
  for (let index = root + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === "") continue
    if (!/^\s+/.test(line)) break

    const field = line.match(/^\s{2}([a-z_]+):\s*(.*)$/)
    if (!field) continue
    const [, key, rawValue] = field

    if (key === "supersedes") {
      if (Object.hasOwn(value, key) || rawValue.trim() !== "") {
        throw new Error("agent_control.supersedes must be one canonical list")
      }
      const supersedes = []
      while (index + 1 < lines.length) {
        const item = lines[index + 1].match(/^\s{4}-\s+(.*)$/)
        if (!item) break
        const instructionId = scalar(item[1])
        if (
          typeof instructionId !== "string" ||
          !instructionIdPattern.test(instructionId)
        ) {
          throw new Error(
            "agent_control.supersedes must contain safe instruction IDs",
          )
        }
        supersedes.push(instructionId)
        index += 1
      }
      if (
        supersedes.length === 0 ||
        new Set(supersedes).size !== supersedes.length
      ) {
        throw new Error(
          "agent_control.supersedes must contain unique instruction IDs",
        )
      }
      value.supersedes = supersedes
      continue
    }

    if (key === "closeout") {
      if (Object.hasOwn(value, key) || rawValue.trim() !== "") {
        throw new Error("agent_control.closeout must be one canonical mapping")
      }
      const closeout = {}
      while (index + 1 < lines.length) {
        const item = lines[index + 1].match(/^\s{4}([a-z_]+):\s*(.*)$/)
        if (!item) break
        const [, closeoutKey, closeoutValue] = item
        if (Object.hasOwn(closeout, closeoutKey)) {
          throw new Error(`Duplicate agent_control.closeout.${closeoutKey}`)
        }
        closeout[closeoutKey] = scalar(closeoutValue)
        index += 1
      }
      value.closeout = closeout
      continue
    }

    if (key === "quarantine_reopen") {
      if (Object.hasOwn(value, key) || rawValue.trim() !== "") {
        throw new Error(
          "agent_control.quarantine_reopen must be one canonical mapping",
        )
      }
      const quarantineReopen = {}
      while (index + 1 < lines.length) {
        const item = lines[index + 1].match(/^\s{4}([a-z_]+):\s*(.*)$/)
        if (!item) break
        const [, reopenKey, reopenValue] = item
        if (Object.hasOwn(quarantineReopen, reopenKey)) {
          throw new Error(
            `Duplicate agent_control.quarantine_reopen.${reopenKey}`,
          )
        }
        quarantineReopen[reopenKey] = scalar(reopenValue)
        index += 1
      }
      value.quarantine_reopen = quarantineReopen
      continue
    }

    if (key === "commit_authorization") {
      if (Object.hasOwn(value, key) || rawValue.trim() !== "") {
        throw new Error(
          "agent_control.commit_authorization must be one canonical mapping",
        )
      }
      const commitAuthorization = {}
      while (index + 1 < lines.length) {
        const mappingItem = lines[index + 1].match(
          /^\s{4}([a-z_]+):\s*(.*)$/,
        )
        if (!mappingItem) break
        const [, authorizationKey, authorizationValue] = mappingItem
        if (Object.hasOwn(commitAuthorization, authorizationKey)) {
          throw new Error(
            `Duplicate agent_control.commit_authorization.${authorizationKey}`,
          )
        }
        if (authorizationKey === "allowed_paths") {
          if (authorizationValue.trim() !== "") {
            throw new Error(
              "agent_control.commit_authorization.allowed_paths must be one canonical list",
            )
          }
          const allowedPaths = []
          while (index + 2 < lines.length) {
            const pathItem = lines[index + 2].match(/^\s{6}-\s+(.*)$/)
            if (!pathItem) break
            allowedPaths.push(scalar(pathItem[1]))
            index += 1
          }
          commitAuthorization.allowed_paths = allowedPaths
        } else {
          commitAuthorization[authorizationKey] = scalar(authorizationValue)
        }
        index += 1
      }
      value.commit_authorization = commitAuthorization
      continue
    }

    if (key === "prompt" && rawValue.trim() === "|") {
      const prompt = []
      index += 1
      while (index < lines.length) {
        const promptLine = lines[index]
        if (promptLine.trim() !== "" && !/^\s{4}/.test(promptLine)) {
          index -= 1
          break
        }
        prompt.push(promptLine.replace(/^\s{4}/, ""))
        index += 1
      }
      value.prompt = prompt.join("\n").trimEnd()
      continue
    }

    if (
      key === "expected_state_revision" &&
      Object.hasOwn(value, key)
    ) {
      throw new Error("Duplicate agent_control.expected_state_revision")
    }

    value[key] = scalar(rawValue)
  }

  if (!actions.has(value.action)) {
    throw new Error(`Invalid agent_control.action: ${String(value.action)}`)
  }
  if (!taskStates.has(value.task_state)) {
    throw new Error(
      `Invalid agent_control.task_state: ${String(value.task_state)}`,
    )
  }
  if (
    typeof value.instruction_id !== "string" ||
    !instructionIdPattern.test(value.instruction_id)
  ) {
    throw new Error("agent_control.instruction_id must be a safe unique string")
  }
  if (!Number.isSafeInteger(value.max_turns) || value.max_turns < 1) {
    throw new Error("agent_control.max_turns must be a positive integer")
  }
  if (typeof value.owner_approval_required !== "boolean") {
    throw new Error("agent_control.owner_approval_required must be boolean")
  }
  if (typeof value.prompt !== "string" || value.prompt.trim() === "") {
    throw new Error("agent_control.prompt must be a non-empty block scalar")
  }
  const hasSupersedes = Object.hasOwn(value, "supersedes")
  const hasTerminalState = Object.hasOwn(value, "terminal_state")
  const hasCloseout = Object.hasOwn(value, "closeout")
  const hasQuarantineReopen = Object.hasOwn(value, "quarantine_reopen")
  const hasCommitAuthorization = Object.hasOwn(value, "commit_authorization")
  const hasExpectedRevision = Object.hasOwn(
    value,
    "expected_state_revision",
  )
  const isTerminalCloseout = hasTerminalState || hasCloseout
  if (hasSupersedes && !hasExpectedRevision) {
    throw new Error(
      "agent_control supersession requires supersedes and expected_state_revision",
    )
  }
  if (hasExpectedRevision && !hasSupersedes && !isTerminalCloseout) {
    throw new Error(
      "agent_control.expected_state_revision requires supersession or terminal closeout",
    )
  }
  if (
    hasExpectedRevision &&
    (!Number.isSafeInteger(value.expected_state_revision) ||
      value.expected_state_revision < 0)
  ) {
    throw new Error(
      "agent_control.expected_state_revision must be a non-negative integer",
    )
  }
  if (hasSupersedes && value.supersedes.includes(value.instruction_id)) {
    throw new Error("agent_control cannot supersede itself")
  }
  if (isTerminalCloseout) {
    const expectedCloseoutKeys = [
      "expected_last_consumed_instruction_id",
      "require_no_active_claims",
      "require_origin_issue_closed",
      "retire_all_unconsumed_controls",
      "supersede_pending_approvals",
    ]
    if (
      !hasTerminalState ||
      !hasCloseout ||
      !hasExpectedRevision ||
      hasSupersedes ||
      value.action !== "stop" ||
      value.task_state !== "needs_review" ||
      value.terminal_state !== "done" ||
      value.max_turns !== 1 ||
      value.owner_approval_required !== false ||
      JSON.stringify(Object.keys(value.closeout).sort()) !==
        JSON.stringify(expectedCloseoutKeys) ||
      typeof value.closeout.expected_last_consumed_instruction_id !==
        "string" ||
      !instructionIdPattern.test(
        value.closeout.expected_last_consumed_instruction_id,
      ) ||
      value.closeout.retire_all_unconsumed_controls !== true ||
      value.closeout.supersede_pending_approvals !== true ||
      value.closeout.require_no_active_claims !== true ||
      value.closeout.require_origin_issue_closed !== true
    ) {
      throw new Error("agent_control terminal closeout is malformed")
    }
    if (
      value.closeout.expected_last_consumed_instruction_id ===
      value.instruction_id
    ) {
      throw new Error(
        "agent_control terminal closeout cannot expect itself as last consumed",
      )
    }
  }
  if (hasQuarantineReopen) {
    const expectedKeys = [
      "clear_quarantine",
      "expected_state_revision",
      "intended_action",
      "normalized_error_digest",
      "quarantine_id",
    ]
    const reopen = value.quarantine_reopen
    if (
      hasSupersedes ||
      isTerminalCloseout ||
      JSON.stringify(Object.keys(reopen).sort()) !==
        JSON.stringify(expectedKeys) ||
      typeof reopen.quarantine_id !== "string" ||
      !/^instruction-quarantine:[a-f0-9]{64}$/.test(reopen.quarantine_id) ||
      !/^[a-f0-9]{64}$/.test(reopen.normalized_error_digest ?? "") ||
      !Number.isSafeInteger(reopen.expected_state_revision) ||
      reopen.expected_state_revision < 0 ||
      reopen.intended_action !== value.action ||
      reopen.clear_quarantine !== true
    ) {
      throw new Error("agent_control quarantine reopen is malformed")
    }
  }
  if (hasCommitAuthorization) {
    const expectedKeys = [
      "allowed_paths",
      "branch",
      "commit_message_digest",
      "expected_head",
      "instruction_id",
      "issue_number",
      "maximum_commit_count",
      "push_authorized",
      "repository",
      "worktree_path",
    ]
    const authorization = value.commit_authorization
    const allowedPaths = authorization.allowed_paths
    if (
      isTerminalCloseout ||
      JSON.stringify(Object.keys(authorization).sort()) !==
        JSON.stringify(expectedKeys) ||
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
        authorization.repository ?? "",
      ) ||
      !Number.isSafeInteger(authorization.issue_number) ||
      authorization.issue_number < 1 ||
      authorization.instruction_id !== value.instruction_id ||
      typeof authorization.worktree_path !== "string" ||
      !path.isAbsolute(authorization.worktree_path) ||
      typeof authorization.branch !== "string" ||
      !authorization.branch ||
      !/^[a-f0-9]{40}$/.test(authorization.expected_head ?? "") ||
      !Array.isArray(allowedPaths) ||
      allowedPaths.length === 0 ||
      new Set(allowedPaths).size !== allowedPaths.length ||
      allowedPaths.some(
        (allowed) =>
          typeof allowed !== "string" ||
          !allowed ||
          path.isAbsolute(allowed) ||
          allowed.split(/[\\/]/).includes("..") ||
          allowed === ".git" ||
          allowed.startsWith(".git/"),
      ) ||
      authorization.maximum_commit_count !== 1 ||
      !/^[a-f0-9]{64}$/.test(authorization.commit_message_digest ?? "") ||
      authorization.push_authorized !== false
    ) {
      throw new Error("agent_control commit authorization is malformed")
    }
  }

  const control = {
    action: value.action,
    taskState: value.task_state,
    instructionId: value.instruction_id,
    maxTurns: value.max_turns,
    ownerApprovalRequired: value.owner_approval_required,
    prompt: value.prompt,
  }
  if (hasSupersedes) {
    control.supersedes = Object.freeze([...value.supersedes])
    control.expectedStateRevision = value.expected_state_revision
  }
  if (isTerminalCloseout) {
    control.terminalState = value.terminal_state
    control.expectedStateRevision = value.expected_state_revision
    control.closeout = Object.freeze({
      expectedLastConsumedInstructionId:
        value.closeout.expected_last_consumed_instruction_id,
      retireAllUnconsumedControls:
        value.closeout.retire_all_unconsumed_controls,
      supersedePendingApprovals:
        value.closeout.supersede_pending_approvals,
      requireNoActiveClaims: value.closeout.require_no_active_claims,
      requireOriginIssueClosed:
        value.closeout.require_origin_issue_closed,
    })
  }
  if (hasQuarantineReopen) {
    control.quarantineReopen = Object.freeze({
      quarantineId: value.quarantine_reopen.quarantine_id,
      normalizedErrorDigest:
        value.quarantine_reopen.normalized_error_digest,
      expectedStateRevision:
        value.quarantine_reopen.expected_state_revision,
      intendedAction: value.quarantine_reopen.intended_action,
      clearQuarantine: value.quarantine_reopen.clear_quarantine,
    })
  }
  if (hasCommitAuthorization) {
    control.commitAuthorization = Object.freeze({
      repository: value.commit_authorization.repository,
      issueNumber: value.commit_authorization.issue_number,
      instructionId: value.commit_authorization.instruction_id,
      worktreePath: value.commit_authorization.worktree_path,
      branch: value.commit_authorization.branch,
      expectedHead: value.commit_authorization.expected_head,
      allowedPaths: Object.freeze([
        ...value.commit_authorization.allowed_paths,
      ]),
      maximumCommitCount:
        value.commit_authorization.maximum_commit_count,
      commitMessageDigest:
        value.commit_authorization.commit_message_digest,
      pushAuthorized: value.commit_authorization.push_authorized,
    })
  }
  return Object.freeze(control)
}

export function extractAgentControls(markdown) {
  if (typeof markdown !== "string") return []
  const controls = []
  const fences = /```(?:yaml|yml)\s*\n([\s\S]*?)```/gi
  for (const match of markdown.matchAll(fences)) {
    if (!/^\s*agent_control:\s*$/m.test(match[1])) continue
    const control = parseAgentControlBlock(match[1])
    if (control) controls.push(control)
  }
  return controls
}

export function extractValidAgentControls(markdown) {
  if (typeof markdown !== "string") return []
  const controls = []
  const fences = /```(?:yaml|yml)\s*\n([\s\S]*?)```/gi
  for (const match of markdown.matchAll(fences)) {
    if (!/^\s*agent_control:\s*$/m.test(match[1])) continue
    try {
      const control = parseAgentControlBlock(match[1])
      if (control) controls.push(control)
    } catch (error) {
      if (
        /^\s{2}(?:supersedes|expected_state_revision|terminal_state|closeout):/m.test(
          match[1],
        )
      ) {
        throw error
      }
      // A malformed explicit block is ineligible, not an inferred task.
    }
  }
  return controls
}

const ownerGateAcknowledgementIdPattern =
  /^owner-gate-acknowledgement:[0-9a-f]{64}$/
const checkpointIdPattern = /^git-reconciliation-checkpoint:[0-9a-f]{64}$/
const generationIdPattern =
  /^git-reconciliation-checkpoint-generation:[0-9a-f]{64}$/
const digestPattern = /^[0-9a-f]{64}$/
const fullShaPattern = /^[0-9a-f]{40}$/
const safeIdentityPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/
const branchPattern = /^agent\/issue-[0-9]+-[A-Za-z0-9._/-]+$/

export function controlPlaneBindingDigest(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex")
}

export function ownerGateAcknowledgementId(binding) {
  return `owner-gate-acknowledgement:${controlPlaneBindingDigest(
    JSON.stringify([
      1,
      binding.instructionId,
      binding.proposalInstructionId,
      binding.originIssueNumber,
      binding.originIssueUrlDigest,
      binding.codexThreadId,
      binding.workspacePathDigest,
      binding.checkpointId,
      binding.generationId,
      binding.reconciliationId,
      binding.branch,
      binding.head,
      binding.tree,
      binding.controlPromptDigest,
      binding.gateReasonDigest,
      binding.pendingReasonDigest,
      binding.priorGateAuditDigest,
    ]),
  )}`
}

export function parseOwnerGateAcknowledgementBlock(block) {
  const lines = block.replaceAll("\r\n", "\n").split("\n")
  const root = lines.findIndex((line) =>
    /^owner_gate_acknowledgement:\s*$/.test(line.trim()),
  )
  if (root === -1) return null

  const value = {}
  for (let index = root + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === "") continue
    if (!/^\s+/.test(line)) break
    const field = line.match(/^\s{2}([a-z_]+):\s*(.*)$/)
    if (!field) continue
    const [, key, rawValue] = field
    if (Object.hasOwn(value, key)) {
      throw new Error(`Duplicate owner_gate_acknowledgement.${key}`)
    }
    value[key] = scalar(rawValue)
  }

  const expectedKeys = [
    "acknowledgement_id",
    "branch",
    "checkpoint_id",
    "codex_thread_id",
    "control_prompt_digest",
    "gate_reason_digest",
    "generation_id",
    "head",
    "instruction_id",
    "origin_issue_number",
    "origin_issue_url_digest",
    "pending_reason_digest",
    "prior_gate_audit_digest",
    "proposal_instruction_id",
    "reconciliation_id",
    "tree",
    "workspace_path_digest",
  ]
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify(expectedKeys.slice().sort())
  ) {
    throw new Error("owner_gate_acknowledgement fields are not canonical")
  }

  const acknowledgement = {
    acknowledgementId: value.acknowledgement_id,
    instructionId: value.instruction_id,
    proposalInstructionId: value.proposal_instruction_id,
    originIssueNumber: value.origin_issue_number,
    originIssueUrlDigest: value.origin_issue_url_digest,
    codexThreadId: value.codex_thread_id,
    workspacePathDigest: value.workspace_path_digest,
    checkpointId: value.checkpoint_id,
    generationId: value.generation_id,
    reconciliationId: value.reconciliation_id,
    branch: value.branch,
    head: value.head,
    tree: value.tree,
    controlPromptDigest: value.control_prompt_digest,
    gateReasonDigest: value.gate_reason_digest,
    pendingReasonDigest: value.pending_reason_digest,
    priorGateAuditDigest: value.prior_gate_audit_digest,
  }
  const valid =
    ownerGateAcknowledgementIdPattern.test(acknowledgement.acknowledgementId) &&
    safeIdentityPattern.test(acknowledgement.instructionId) &&
    safeIdentityPattern.test(acknowledgement.proposalInstructionId) &&
    Number.isSafeInteger(acknowledgement.originIssueNumber) &&
    acknowledgement.originIssueNumber > 0 &&
    digestPattern.test(acknowledgement.originIssueUrlDigest) &&
    safeIdentityPattern.test(acknowledgement.codexThreadId) &&
    digestPattern.test(acknowledgement.workspacePathDigest) &&
    checkpointIdPattern.test(acknowledgement.checkpointId) &&
    generationIdPattern.test(acknowledgement.generationId) &&
    safeIdentityPattern.test(acknowledgement.reconciliationId) &&
    branchPattern.test(acknowledgement.branch) &&
    fullShaPattern.test(acknowledgement.head) &&
    fullShaPattern.test(acknowledgement.tree) &&
    digestPattern.test(acknowledgement.controlPromptDigest) &&
    digestPattern.test(acknowledgement.gateReasonDigest) &&
    digestPattern.test(acknowledgement.pendingReasonDigest) &&
    digestPattern.test(acknowledgement.priorGateAuditDigest) &&
    ownerGateAcknowledgementId(acknowledgement) ===
      acknowledgement.acknowledgementId
  if (!valid) {
    throw new Error("owner_gate_acknowledgement binding is malformed")
  }
  return Object.freeze(acknowledgement)
}

export function extractValidOwnerGateAcknowledgements(markdown) {
  if (typeof markdown !== "string") return []
  const acknowledgements = []
  const fences = /```(?:yaml|yml)\s*\n([\s\S]*?)```/gi
  for (const match of markdown.matchAll(fences)) {
    if (!/^\s*owner_gate_acknowledgement:\s*$/m.test(match[1])) continue
    try {
      const acknowledgement = parseOwnerGateAcknowledgementBlock(match[1])
      if (acknowledgement) acknowledgements.push(acknowledgement)
    } catch {
      // A malformed explicit acknowledgement is ineligible and fails closed.
    }
  }
  return acknowledgements
}

export function listOwnerGateAcknowledgements(issue, comments = []) {
  const sources = [
    { body: issue?.body ?? "" },
    ...comments.map((comment) => ({
      body: comment.body ?? comment.comment ?? "",
    })),
  ]
  const acknowledgements = []
  for (const source of sources) {
    const pairedControls = extractValidAgentControls(source.body)
    for (const acknowledgement of extractValidOwnerGateAcknowledgements(
      source.body,
    )) {
      acknowledgements.push(
        Object.freeze({
          ...acknowledgement,
          pairedControls: pairedControls.filter(
            (control) =>
              control.instructionId === acknowledgement.instructionId,
          ),
        }),
      )
    }
  }
  return acknowledgements
}

export function listAgentControls(issue, comments = []) {
  const sources = [
    { body: issue?.body ?? "" },
    ...comments.map((comment) => ({
      body: comment.body ?? comment.comment ?? "",
    })),
  ]

  const controls = []
  for (const source of sources) {
    controls.push(...extractValidAgentControls(source.body))
  }
  return controls
}

function agentControlBinding(control) {
  const legacy = [
    1,
    control.action,
    control.taskState,
    control.instructionId,
    control.maxTurns,
    control.ownerApprovalRequired,
    control.prompt,
    control.supersedes ?? null,
    control.expectedStateRevision ?? null,
  ]
  if (!control.terminalState && !control.closeout) return legacy
  return [
    2,
    ...legacy.slice(1),
    control.terminalState,
    control.closeout,
  ]
}

export function agentControlBindingDigest(control) {
  return controlPlaneBindingDigest(JSON.stringify(agentControlBinding(control)))
}

export function consumedInstructionIds(state, comments, controls) {
  const retryable = new Set(state.retryInstructionIds ?? [])
  const consumed = new Set(
    (state.runs ?? []).map((run) => run.instructionId).filter(Boolean),
  )
  if (state.lastConsumedInstructionId) {
    consumed.add(state.lastConsumedInstructionId)
  }
  for (const control of controls) {
    if (
      !retryable.has(control.instructionId) &&
      findExistingResult(comments, control.instructionId)
    ) {
      consumed.add(control.instructionId)
    }
  }
  for (const instructionId of retryable) consumed.delete(instructionId)
  return consumed
}

function instructionSupersessionIdentity(binding) {
  return `instruction-supersession:${controlPlaneBindingDigest(
    JSON.stringify([
      1,
      binding.issueNumber,
      binding.originIssueUrl,
      binding.supersedingInstructionId,
      binding.supersededInstructionIds,
      binding.expectedStateRevision,
      binding.committedStateRevision,
      binding.taskStatus,
      binding.supersedingControlIndex,
      binding.supersedingControlDigest,
      binding.targetControls,
      binding.reason,
    ]),
  )}`
}

function validateInstructionSupersessionRecord(record, state, controls) {
  if (
    record?.schemaVersion !== 1 ||
    typeof record.supersessionId !== "string" ||
    record.issueNumber !== state.task?.originIssueNumber ||
    record.originIssueUrl !== (state.task?.originIssueUrl ?? null) ||
    (record.originIssueUrl !== null &&
      typeof record.originIssueUrl !== "string") ||
    typeof record.supersedingInstructionId !== "string" ||
    !instructionIdPattern.test(record.supersedingInstructionId) ||
    !Array.isArray(record.supersededInstructionIds) ||
    record.supersededInstructionIds.length === 0 ||
    new Set(record.supersededInstructionIds).size !==
      record.supersededInstructionIds.length ||
    record.supersededInstructionIds.some(
      (instructionId) => !instructionIdPattern.test(instructionId),
    ) ||
    !Number.isSafeInteger(record.expectedStateRevision) ||
    record.expectedStateRevision < 0 ||
    record.committedStateRevision !== record.expectedStateRevision + 1 ||
    !taskStates.has(record.taskStatus) ||
    !Number.isSafeInteger(record.supersedingControlIndex) ||
    record.supersedingControlIndex < 0 ||
    typeof record.supersedingControlDigest !== "string" ||
    !/^[0-9a-f]{64}$/.test(record.supersedingControlDigest) ||
    !Array.isArray(record.targetControls) ||
    record.targetControls.length !== record.supersededInstructionIds.length ||
    record.reason !== "declared_by_agent_control" ||
    typeof record.recordedAt !== "string" ||
    !Number.isFinite(Date.parse(record.recordedAt)) ||
    state.stateRevision < record.committedStateRevision
  ) {
    throw new Error("Durable instruction supersession record is malformed")
  }
  const supersedingMatches = controls
    .map((control, controlIndex) => ({ control, controlIndex }))
    .filter(
      ({ control }) =>
        control.instructionId === record.supersedingInstructionId,
    )
  if (
    supersedingMatches.length !== 1 ||
    supersedingMatches[0].controlIndex !== record.supersedingControlIndex ||
    agentControlBindingDigest(supersedingMatches[0].control) !==
      record.supersedingControlDigest ||
    JSON.stringify(supersedingMatches[0].control.supersedes) !==
      JSON.stringify(record.supersededInstructionIds) ||
    supersedingMatches[0].control.expectedStateRevision !==
      record.expectedStateRevision
  ) {
    throw new Error("Durable instruction supersession control binding drifted")
  }
  for (let index = 0; index < record.targetControls.length; index += 1) {
    const target = record.targetControls[index]
    const targetId = record.supersededInstructionIds[index]
    const matches = controls
      .map((control, controlIndex) => ({ control, controlIndex }))
      .filter(({ control }) => control.instructionId === targetId)
    if (
      matches.length !== 1 ||
      target?.instructionId !== targetId ||
      matches[0].controlIndex !== target.controlIndex ||
      target.controlIndex >= record.supersedingControlIndex ||
      target.action !== matches[0].control.action ||
      target.taskState !== matches[0].control.taskState ||
      target.controlDigest !== agentControlBindingDigest(matches[0].control) ||
      target.priorEligible !==
        isInstructionEligible(matches[0].control, record.taskStatus)
    ) {
      throw new Error("Durable instruction supersession target binding drifted")
    }
  }
  if (instructionSupersessionIdentity(record) !== record.supersessionId) {
    throw new Error("Durable instruction supersession identity is invalid")
  }
  return record
}

export function durableSupersededInstructionIds(state, controls) {
  const records = state.instructionSupersessions ?? []
  if (!Array.isArray(records)) {
    throw new Error("Durable instruction supersession ledger is malformed")
  }
  const superseded = new Set()
  const superseding = new Set()
  for (const record of records) {
    validateInstructionSupersessionRecord(record, state, controls)
    if (superseding.has(record.supersedingInstructionId)) {
      throw new Error("Durable instruction supersession is duplicated")
    }
    superseding.add(record.supersedingInstructionId)
    for (const instructionId of record.supersededInstructionIds) {
      if (superseded.has(instructionId)) {
        throw new Error("Durable instruction was superseded more than once")
      }
      superseded.add(instructionId)
    }
  }
  return superseded
}

function assertSupersessionControlHistory(state, controls, consumed) {
  const durableControllers = new Set(
    (state.instructionSupersessions ?? []).map(
      (record) => record.supersedingInstructionId,
    ),
  )
  for (const control of controls) {
    if (
      control.supersedes &&
      consumed.has(control.instructionId) &&
      !durableControllers.has(control.instructionId)
    ) {
      throw new Error(
        "Superseding instruction history is missing its durable retirement",
      )
    }
  }
}

export function selectInstructionSupersessionCandidate(
  issue,
  comments = [],
  state = {},
) {
  if ((state.terminalCloseouts ?? []).length > 0) return null
  const controls = listAgentControls(issue, comments)
  const superseded = durableSupersededInstructionIds(state, controls)
  const consumed = consumedInstructionIds(state, comments, controls)
  assertSupersessionControlHistory(state, controls, consumed)
  return (
    controls.find(
      (control) =>
        Array.isArray(control.supersedes) &&
        !consumed.has(control.instructionId) &&
        !superseded.has(control.instructionId) &&
        isInstructionEligible(control, state.status),
    ) ?? null
  )
}

export function requireInstructionSupersessionReconciliation({
  issue,
  comments = [],
  state,
  reconciledInstructionId = null,
}) {
  if (state?.activeInstruction) return null
  const supersession = selectInstructionSupersessionCandidate(
    issue,
    comments,
    state,
  )
  if (!supersession) return null
  const isDurable = (state.instructionSupersessions ?? []).some(
    (record) =>
      record.supersedingInstructionId === supersession.instructionId,
  )
  if (
    !isDurable ||
    reconciledInstructionId !== supersession.instructionId
  ) {
    const error = new Error(
      "Instruction supersession requires repository issue-claim reconciliation",
    )
    error.code = "INSTRUCTION_SUPERSESSION_RECONCILIATION_REQUIRED"
    throw error
  }
  return supersession
}

function rejectedSupersession(code, details = {}) {
  return { accepted: false, rejection: { code, ...details } }
}

export function instructionSupersessionDecision({
  issue,
  comments = [],
  state,
  supersedingInstruction,
  claimRecords = {},
}) {
  if (!supersedingInstruction?.supersedes) {
    return rejectedSupersession("supersession_missing")
  }
  const controls = listAgentControls(issue, comments)
  const superseded = durableSupersededInstructionIds(state, controls)
  const candidate = selectInstructionSupersessionCandidate(
    issue,
    comments,
    state,
  )
  if (
    !candidate ||
    candidate.instructionId !== supersedingInstruction.instructionId ||
    agentControlBindingDigest(candidate) !==
      agentControlBindingDigest(supersedingInstruction)
  ) {
    return rejectedSupersession("superseding_control_changed")
  }
  if (state.activeInstruction) {
    return rejectedSupersession("active_instruction")
  }
  for (const instructionId of [
    supersedingInstruction.instructionId,
    ...supersedingInstruction.supersedes,
  ]) {
    if (!Object.hasOwn(claimRecords, instructionId)) {
      return rejectedSupersession("claim_inspection_missing", {
        instructionId,
      })
    }
  }

  const existing = (state.instructionSupersessions ?? []).filter(
    (record) =>
      record.supersedingInstructionId === supersedingInstruction.instructionId,
  )
  if (existing.length > 1) {
    return rejectedSupersession("supersession_record_ambiguous")
  }

  const supersedingMatches = controls
    .map((control, controlIndex) => ({ control, controlIndex }))
    .filter(
      ({ control }) =>
        control.instructionId === supersedingInstruction.instructionId,
    )
  if (supersedingMatches.length !== 1) {
    return rejectedSupersession("superseding_control_count")
  }
  const supersedingControlIndex = supersedingMatches[0].controlIndex
  const consumed = consumedInstructionIds(state, comments, controls)
  if (existing.length === 0) {
    if (
      (state.runs ?? []).some(
        (run) =>
          run.instructionId === supersedingInstruction.instructionId,
      ) ||
      state.lastConsumedInstructionId === supersedingInstruction.instructionId ||
      (state.retryInstructionIds ?? []).includes(
        supersedingInstruction.instructionId,
      ) ||
      findExistingPickup(comments, supersedingInstruction.instructionId) ||
      findExistingResult(comments, supersedingInstruction.instructionId)
    ) {
      return rejectedSupersession("superseding_control_history")
    }
    const controllingClaim =
      claimRecords[supersedingInstruction.instructionId] ?? null
    if (controllingClaim) {
      return rejectedSupersession("superseding_control_claimed", {
        claimStatus: controllingClaim.status,
      })
    }
  }
  const targetControls = []
  for (const instructionId of supersedingInstruction.supersedes) {
    const matches = controls
      .map((control, controlIndex) => ({ control, controlIndex }))
      .filter(({ control }) => control.instructionId === instructionId)
    if (matches.length === 0) {
      return rejectedSupersession("target_missing", { instructionId })
    }
    if (matches.length !== 1) {
      return rejectedSupersession("target_ambiguous", { instructionId })
    }
    const target = matches[0]
    if (target.controlIndex >= supersedingControlIndex) {
      return rejectedSupersession("target_not_older", { instructionId })
    }
    if (superseded.has(instructionId)) {
      if (!existing[0]?.supersededInstructionIds.includes(instructionId)) {
        return rejectedSupersession("target_already_superseded", {
          instructionId,
        })
      }
    }
    if ((state.runs ?? []).some((run) => run.instructionId === instructionId)) {
      return rejectedSupersession("target_run_history", { instructionId })
    }
    if (state.lastConsumedInstructionId === instructionId) {
      return rejectedSupersession("target_consumed", { instructionId })
    }
    if ((state.retryInstructionIds ?? []).includes(instructionId)) {
      return rejectedSupersession("target_retry_history", { instructionId })
    }
    if ((state.resultCorrectionInstructionIds ?? []).includes(instructionId)) {
      return rejectedSupersession("target_result_correction", {
        instructionId,
      })
    }
    if (findExistingPickup(comments, instructionId)) {
      return rejectedSupersession("target_pickup", { instructionId })
    }
    if (findExistingResult(comments, instructionId)) {
      return rejectedSupersession("target_result", { instructionId })
    }
    const claim = claimRecords[instructionId] ?? null
    if (claim) {
      if (claim.originIssueNumber !== state.task.originIssueNumber) {
        return rejectedSupersession("target_claim_origin", { instructionId })
      }
      return rejectedSupersession("target_claimed", {
        instructionId,
        claimStatus: claim.status,
      })
    }
    targetControls.push({
      instructionId,
      controlIndex: target.controlIndex,
      action: target.control.action,
      taskState: target.control.taskState,
      controlDigest: agentControlBindingDigest(target.control),
      priorEligible: isInstructionEligible(target.control, state.status),
    })
  }

  if (existing.length === 1) {
    const record = existing[0]
    if (
      record.supersessionId !== instructionSupersessionIdentity(record) ||
      record.supersedingControlDigest !==
        agentControlBindingDigest(supersedingInstruction) ||
      JSON.stringify(record.supersededInstructionIds) !==
        JSON.stringify(supersedingInstruction.supersedes)
    ) {
      return rejectedSupersession("supersession_record_conflict")
    }
    return { accepted: true, value: { alreadyApplied: true, record } }
  }

  if (supersedingInstruction.expectedStateRevision !== state.stateRevision) {
    return rejectedSupersession("state_revision_mismatch", {
      expectedStateRevision: supersedingInstruction.expectedStateRevision,
      actualStateRevision: state.stateRevision,
    })
  }

  const targets = new Set(supersedingInstruction.supersedes)
  for (let index = 0; index < supersedingControlIndex; index += 1) {
    const control = controls[index]
    if (
      !targets.has(control.instructionId) &&
      !superseded.has(control.instructionId) &&
      !consumed.has(control.instructionId) &&
      isInstructionEligible(control, state.status)
    ) {
      return rejectedSupersession("superseding_control_not_next", {
        instructionId: control.instructionId,
      })
    }
  }

  const issueNumber =
    issue?.number ?? issue?.issue_number ?? state.task?.originIssueNumber
  if (
    issueNumber !== state.task?.originIssueNumber ||
    state.task?.issueNumber !== state.task?.originIssueNumber
  ) {
    return rejectedSupersession("issue_origin_mismatch")
  }
  return {
    accepted: true,
    value: {
      alreadyApplied: false,
      issueNumber,
      originIssueUrl:
        issue?.html_url ?? issue?.display_url ?? issue?.url ??
        state.task.originIssueUrl ?? null,
      supersedingInstructionId: supersedingInstruction.instructionId,
      supersededInstructionIds: [...supersedingInstruction.supersedes],
      expectedStateRevision: state.stateRevision,
      committedStateRevision: state.stateRevision + 1,
      taskStatus: state.status,
      supersedingControlIndex,
      supersedingControlDigest: agentControlBindingDigest(
        supersedingInstruction,
      ),
      targetControls,
      reason: "declared_by_agent_control",
    },
  }
}

export function recordInstructionSupersession(
  state,
  decision,
  { now = new Date() } = {},
) {
  if (
    decision?.alreadyApplied ||
    state.activeInstruction ||
    state.status !== decision?.taskStatus ||
    state.stateRevision !== decision?.expectedStateRevision ||
    !Array.isArray(state.instructionSupersessions)
  ) {
    throw new Error("Instruction supersession state binding changed")
  }
  const recordedAt = now.toISOString()
  const record = {
    schemaVersion: 1,
    ...decision,
    recordedAt,
  }
  record.supersessionId = instructionSupersessionIdentity(record)
  if (
    state.instructionSupersessions.some(
      (candidate) =>
        candidate.supersedingInstructionId ===
          record.supersedingInstructionId ||
        candidate.supersededInstructionIds.some((instructionId) =>
          record.supersededInstructionIds.includes(instructionId),
        ),
    )
  ) {
    throw new Error("Instruction supersession conflicts with durable history")
  }
  state.instructionSupersessions.push(record)
  return record
}

export function instructionSupersessionAuditEvents(record) {
  return record.targetControls.map((target, targetIndex) => ({
    eventId: `instruction_superseded:${record.supersessionId.slice(
      "instruction-supersession:".length,
    )}:${targetIndex + 1}`,
    type: "instruction_superseded",
    issueNumber: record.issueNumber,
    originIssueUrl: record.originIssueUrl,
    supersessionId: record.supersessionId,
    supersededInstructionId: target.instructionId,
    supersedingInstructionId: record.supersedingInstructionId,
    priorTaskState: target.taskState,
    priorEligibility: target.priorEligible,
    reason: record.reason,
    expectedStateRevision: record.expectedStateRevision,
    committedStateRevision: record.committedStateRevision,
    targetControlIndex: target.controlIndex,
    supersedingControlIndex: record.supersedingControlIndex,
    targetControlDigest: target.controlDigest,
    supersedingControlDigest: record.supersedingControlDigest,
    recordedAt: record.recordedAt,
    executionOccurred: false,
  }))
}

export function selectLatestInstruction(issue, comments = []) {
  return listAgentControls(issue, comments).at(-1) ?? null
}

export function selectNextInstruction(issue, comments = [], state = {}) {
  const controls = listAgentControls(issue, comments)
  const consumed = consumedInstructionIds(state, comments, controls)
  const superseded = durableSupersededInstructionIds(state, controls)
  assertSupersessionControlHistory(state, controls, consumed)

  if (
    state.status === "done" ||
    (state.terminalCloseouts ?? []).length > 0
  ) {
    return null
  }

  return (
    controls
      .slice()
      .find(
        (control) =>
          !consumed.has(control.instructionId) &&
          !superseded.has(control.instructionId) &&
          quarantineAllowsControl(state, control) &&
          isInstructionEligible(control, state.status),
      ) ?? null
  )
}

const eligibleStatesByAction = {
  start: new Set(["ready", "failed"]),
  continue: new Set(["ready", "failed", "needs_review", "needs_owner"]),
  stop: taskStates,
}

export function isInstructionEligible(instruction, currentTaskState) {
  if (currentTaskState === "done") return false
  return Boolean(
    instruction &&
      eligibleStatesByAction[instruction.action]?.has(instruction.taskState) &&
      (currentTaskState === undefined ||
        instruction.taskState === currentTaskState),
  )
}

export function shouldConsumeInstruction(state, instruction) {
  if (!instruction) return false
  if ((state.retryInstructionIds ?? []).includes(instruction.instructionId)) {
    return true
  }
  if (state.activeInstruction?.instructionId === instruction.instructionId) {
    return true
  }
  return state.lastConsumedInstructionId !== instruction.instructionId
}

const resultCheckFields = new Map([
  ["typecheck", "typecheck"],
  ["lint", "lint"],
  ["tests", "tests"],
  ["cloudflare_readiness", "cloudflareReadiness"],
  ["build", "build"],
  ["diff_check", "diffCheck"],
])
const resultTopLevelFields = new Set([
  "instruction_id",
  "origin_issue_number",
  "origin_issue_url",
  "codex_thread_id",
  "status",
  "branch",
  "commits",
  "checks",
  "owner_question",
  "owner_request",
  "blockers",
  "owner_gates",
  "production_readback",
  "safety_findings",
  "branch_push_state",
  "result_artifact",
])
const resultOwnerRequestFields = new Map([
  ["method", "method"],
  ["server", "serverName"],
  ["tool", "toolName"],
  ["arguments", "arguments"],
  ["details", "details"],
])

function resultScalar(rawValue) {
  const trimmed = rawValue.trim()
  if (trimmed.startsWith('"')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      throw new Error("agent_result contains an invalid quoted scalar")
    }
  }
  return scalar(trimmed)
}

function resultJson(rawValue, field, expectedType) {
  let parsed
  try {
    parsed = JSON.parse(rawValue)
  } catch {
    throw new Error(`agent_result.${field} must contain canonical JSON`)
  }
  if (expectedType === "array" && !Array.isArray(parsed)) {
    throw new Error(`agent_result.${field} must be an array`)
  }
  if (
    expectedType === "object_or_null" &&
    parsed !== null &&
    (typeof parsed !== "object" || Array.isArray(parsed))
  ) {
    throw new Error(`agent_result.${field} must be an object or null`)
  }
  return parsed
}

function resultNestedJson(value) {
  if (value === null) return null
  if (typeof value !== "string") {
    throw new Error("agent_result owner request JSON must be a string or null")
  }
  return resultJson(value, "owner_request", "object_or_null")
}

function resultInstructionPattern(instructionId, flags = "") {
  const escaped = instructionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(
    `agent_result:\\s*[\\s\\S]*?instruction_id:\\s*["']?${escaped}["']?(?:\\s|$)`,
    flags,
  )
}

export function parseAgentResultBlock(block) {
  const lines = block.replaceAll("\r\n", "\n").split("\n")
  const root = lines.findIndex((line) => /^agent_result:\s*$/.test(line.trim()))
  if (root === -1) return null
  const raw = {}
  for (let index = root + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === "") continue
    const field = line.match(/^\s{2}([a-z_]+):\s*(.*)$/)
    if (!field) {
      throw new Error("agent_result contains non-canonical indentation")
    }
    const [, key, rawValue] = field
    if (!resultTopLevelFields.has(key) || Object.hasOwn(raw, key)) {
      throw new Error("agent_result fields are not canonical")
    }

    if (key === "commits" && rawValue === "") {
      const commits = []
      while (index + 1 < lines.length) {
        const item = lines[index + 1].match(/^\s{4}-\s+(.*)$/)
        if (!item) break
        commits.push(resultScalar(item[1]))
        index += 1
      }
      raw.commits = commits
      continue
    }
    if (key === "checks") {
      if (rawValue !== "") {
        throw new Error("agent_result.checks must be a mapping")
      }
      const checks = {}
      while (index + 1 < lines.length) {
        const item = lines[index + 1].match(/^\s{4}([a-z_]+):\s*(.*)$/)
        if (!item) break
        const [, checkKey, checkValue] = item
        const normalized = resultCheckFields.get(checkKey)
        if (!normalized || Object.hasOwn(checks, normalized)) {
          throw new Error("agent_result.checks fields are not canonical")
        }
        checks[normalized] = resultScalar(checkValue)
        index += 1
      }
      raw.checks = checks
      continue
    }
    if (key === "owner_request" && rawValue === "") {
      const request = {}
      while (index + 1 < lines.length) {
        const item = lines[index + 1].match(/^\s{4}([a-z_]+):\s*(.*)$/)
        if (!item) break
        const [, requestKey, requestValue] = item
        const normalized = resultOwnerRequestFields.get(requestKey)
        if (!normalized || Object.hasOwn(request, normalized)) {
          throw new Error("agent_result.owner_request fields are not canonical")
        }
        request[normalized] = resultScalar(requestValue)
        index += 1
      }
      request.arguments = resultNestedJson(request.arguments)
      request.details = resultNestedJson(request.details)
      raw.owner_request = request
      continue
    }
    if (rawValue === "") {
      throw new Error(`agent_result.${key} must not be empty`)
    }
    raw[key] = resultScalar(rawValue)
  }

  if (
    raw.commits === "[]" ||
    (typeof raw.commits === "string" && raw.commits.trim() === "[]")
  ) {
    raw.commits = []
  }
  for (const field of [
    "blockers",
    "owner_gates",
    "production_readback",
    "safety_findings",
    "branch_push_state",
  ]) {
    if (typeof raw[field] === "string") {
      raw[field] = resultJson(raw[field], field, "array")
    }
  }
  if (typeof raw.result_artifact === "string") {
    raw.result_artifact = resultJson(
      raw.result_artifact,
      "result_artifact",
      "object_or_null",
    )
  }
  if (raw.owner_request === "null") raw.owner_request = null

  if (
    JSON.stringify(Object.keys(raw).sort()) !==
    JSON.stringify([...resultTopLevelFields].sort())
  ) {
    throw new Error("agent_result fields are not canonical")
  }
  if (
    !Array.isArray(raw.commits) ||
    raw.commits.some((commit) => typeof commit !== "string") ||
    JSON.stringify(Object.keys(raw.checks ?? {}).sort()) !==
      JSON.stringify([...resultCheckFields.values()].sort()) ||
    Object.values(raw.checks).some(
      (value) => typeof value !== "string" || value.length === 0,
    ) ||
    (raw.owner_request !== null &&
      JSON.stringify(Object.keys(raw.owner_request).sort()) !==
        JSON.stringify([...resultOwnerRequestFields.values()].sort())) ||
    !Array.isArray(raw.blockers) ||
    !Array.isArray(raw.owner_gates) ||
    !Array.isArray(raw.production_readback) ||
    !Array.isArray(raw.safety_findings) ||
    !Array.isArray(raw.branch_push_state)
  ) {
    throw new Error("agent_result structure is malformed")
  }
  if (
    typeof raw.instruction_id !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(raw.instruction_id) ||
    !Number.isSafeInteger(raw.origin_issue_number) ||
    raw.origin_issue_number < 1 ||
    typeof raw.origin_issue_url !== "string" ||
    !raw.origin_issue_url ||
    typeof raw.codex_thread_id !== "string" ||
    !raw.codex_thread_id ||
    !taskStates.has(raw.status) ||
    typeof raw.branch !== "string" ||
    !raw.branch
  ) {
    throw new Error("agent_result identity binding is malformed")
  }

  return Object.freeze({
    instructionId: raw.instruction_id,
    originIssueNumber: raw.origin_issue_number,
    originIssueUrl: raw.origin_issue_url,
    codexThreadId: raw.codex_thread_id,
    status: raw.status,
    branch: raw.branch,
    commits: raw.commits,
    checks: raw.checks,
    ownerQuestion: raw.owner_question,
    ownerRequest: raw.owner_request,
    blockers: raw.blockers,
    ownerGates: raw.owner_gates,
    productionReadback: raw.production_readback,
    safetyFindings: raw.safety_findings,
    branchPushState: raw.branch_push_state,
    resultArtifact: raw.result_artifact,
  })
}

function agentResultBinding(packet) {
  return {
    instructionId: packet.instructionId,
    originIssueNumber: packet.originIssueNumber,
    originIssueUrl: packet.originIssueUrl,
    codexThreadId: packet.codexThreadId,
    status: packet.status,
    branch: packet.branch,
    commits: packet.commits,
    checks: packet.checks,
    ownerRequest: packet.ownerRequest,
    blockers: packet.blockers,
    ownerGates: packet.ownerGates,
    productionReadback: packet.productionReadback,
    safetyFindings: packet.safetyFindings,
    branchPushState: packet.branchPushState,
    resultArtifact: packet.resultArtifact,
  }
}

export function agentResultBindingDigest(packet) {
  return controlPlaneBindingDigest(JSON.stringify(agentResultBinding(packet)))
}

export function agentResultPublicationDecision({
  comments,
  instructionId,
  expectedPacket = null,
}) {
  const publications = []
  let textualCount = 0
  for (const comment of comments ?? []) {
    const body = comment?.body ?? comment?.comment ?? ""
    textualCount += [...body.matchAll(resultInstructionPattern(instructionId, "g"))].length
    const fences = /```(?:yaml|yml)\s*\n([\s\S]*?)```/gi
    for (const match of body.matchAll(fences)) {
      if (!/^\s*agent_result:\s*$/m.test(match[1])) continue
      let packet
      try {
        packet = parseAgentResultBlock(match[1])
      } catch {
        continue
      }
      if (packet?.instructionId !== instructionId) continue
      publications.push({
        commentId: comment.id,
        bodyDigest: controlPlaneBindingDigest(body),
        packetDigest: agentResultBindingDigest(packet),
        packet,
      })
    }
  }
  if (textualCount === 0) {
    return { accepted: false, rejection: { code: "result_publication_missing" } }
  }
  if (textualCount !== publications.length) {
    return {
      accepted: false,
      rejection: {
        code: "result_publication_malformed",
        textualCount,
        validCount: publications.length,
      },
    }
  }
  if (publications.length !== 1) {
    return {
      accepted: false,
      rejection: {
        code: "result_publication_ambiguous",
        publicationCount: publications.length,
      },
    }
  }
  const publication = publications[0]
  if (
    !Number.isSafeInteger(publication.commentId) ||
    publication.commentId < 1
  ) {
    return {
      accepted: false,
      rejection: { code: "result_publication_comment_id" },
    }
  }
  if (
    expectedPacket &&
    JSON.stringify(agentResultBinding(publication.packet)) !==
      JSON.stringify(agentResultBinding(expectedPacket))
  ) {
    return {
      accepted: false,
      rejection: { code: "result_publication_binding" },
    }
  }
  return { accepted: true, value: publication }
}

export function findExistingResult(comments, instructionId) {
  const pattern = resultInstructionPattern(instructionId)
  return comments.find((comment) =>
    pattern.test(comment.body ?? comment.comment ?? ""),
  )
}

export function findExistingPickup(comments, instructionId) {
  const escaped = instructionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(
    `agent_pickup:\\s*[\\s\\S]*?instruction_id:\\s*["']?${escaped}["']?(?:\\s|$)`,
  )
  return comments.find((comment) =>
    pattern.test(comment.body ?? comment.comment ?? ""),
  )
}

export function formatPickupPacket(packet) {
  return `\`\`\`yaml
agent_pickup:
  instruction_id: ${yamlScalar(packet.instructionId)}
  origin_issue_number: ${packet.originIssueNumber}
  origin_issue_url: ${yamlScalar(packet.originIssueUrl)}
  codex_thread_id: ${yamlScalar(packet.codexThreadId)}
  status: running
  branch: ${yamlScalar(packet.branch)}
\`\`\`

The persistent orchestrator claimed this explicit instruction and started or resumed its isolated task context.`
}

const gatedPatterns = [
  /\bdeploy(?:ment)?\b.*\bproduction\b/i,
  /\bapply\b.*\bproduction\b.*\bmigration/i,
  /\b(?:modify|delete|truncate|overwrite)\b.*\bproduction\b.*\bdata\b/i,
  /\b(?:expose|print|log|commit)\b.*\b(?:secret|credential|token|password)\b/i,
  /\bmerge\b.*\b(?:main|master|default branch)\b/i,
  /\bforce[- ]?push\b/i,
  /^\s*(?:-\s*)?(?:purchase|pay|buy)\b/i,
  /\b(?:make|execute|submit|send|authorize|initiate|complete)\b.*\b(?:purchase|payment)\b/i,
  /\b(?:create|open|register)\b.*\bexternal account\b/i,
]

const constraintIntentPattern =
  /(?:^|\b)(?:no\b|do not|don't|does not|doesn't|never|must not|without|not authorized?|not permitted|not allowed|keep(?:s|ing)? blocked|remain(?:s|ing)? blocked|explicitly block(?:ed|s|ing)?|prohibit(?:ed|s|ing)?|exclude(?:d|s|ing)?(?:\s+from\s+scope)?|outside (?:the )?(?:authorized )?scope|preserve(?:s|d|ing)? (?:the )?(?:safety |authorization )?boundary)\b/i

const protectedTermPattern =
  /\b(?:deploy(?:ment)?|production|migration|data|secret|credential|token|password|merge|main|master|default branch|force[- ]?push|purchase|payment|external account)\b/i

const postposedConstraintPattern =
  /\b(?:is|are|remain(?:s|ing)?|must remain)\s+(?:blocked|prohibited|excluded|not authorized|not permitted|not allowed|outside (?:the )?(?:authorized )?scope)\b/i

const keepObjectBlockedPattern =
  /\bkeep(?:s|ing)?\s+([^,;.!?]{1,80}?)\s+blocked\b/i

function maskQuotedConstraintExamples(value) {
  return value.replace(/(`+)([\s\S]*?)\1/g, (match, _ticks, contents) =>
    constraintIntentPattern.test(contents) ? " ".repeat(match.length) : match,
  )
}

function intentSegments(clause) {
  return maskQuotedConstraintExamples(clause)
    .split(/\s*(?:;|\bbut\b|\bhowever\b|\bexcept\b|\binstead\b|\bthen\b)\s*/i)
    .map((segment) => segment.trim())
    .filter(Boolean)
}

function isConstrainedProtectedMention(segment) {
  const constraint = segment.match(constraintIntentPattern)
  const protectedTerm = segment.match(protectedTermPattern)
  const keepObjectBlocked = segment.match(keepObjectBlockedPattern)
  const keepStart = keepObjectBlocked?.index ?? -1
  const keepEnd = keepObjectBlocked
    ? keepStart + keepObjectBlocked[0].length
    : -1
  return Boolean(
    protectedTerm &&
      ((constraint &&
        ((constraint.index ?? 0) <= (protectedTerm.index ?? 0) ||
          postposedConstraintPattern.test(segment))) ||
        (keepObjectBlocked &&
          (protectedTerm.index ?? 0) >= keepStart &&
          (protectedTerm.index ?? 0) < keepEnd)),
  )
}

export function ownerGateReason(instruction) {
  if (instruction.ownerApprovalRequired) {
    return "The control-plane instruction explicitly requires owner approval."
  }

  const clauses = instruction.prompt.split(/(?<=[.!?])\s+|\n+/)
  for (const clause of clauses) {
    for (const segment of intentSegments(clause)) {
      if (
        /\bzero side effects?\b/i.test(segment) ||
        isConstrainedProtectedMention(segment)
      ) {
        continue
      }
      if (gatedPatterns.some((pattern) => pattern.test(segment))) {
        return `The instruction requests an owner-gated action: ${clause.trim()}`
      }
    }
  }
  return null
}

function yamlScalar(value) {
  if (value === null || value === undefined || value === "") return "null"
  return JSON.stringify(String(value))
}

export function formatCompletionPacket(packet) {
  const commits = packet.commits?.length
    ? `  commits:\n${packet.commits
        .map((commit) => `    - ${yamlScalar(commit)}`)
        .join("\n")}`
    : "  commits: []"
  const files = packet.changedFiles?.length
    ? `\nChanged files:\n${packet.changedFiles.map((file) => `- \`${file}\``).join("\n")}`
    : "\nChanged files: none"
  const detail = packet.detail ? `\n\n${packet.detail}` : ""
  const resultArtifact = packet.resultArtifact
    ? JSON.stringify(packet.resultArtifact)
    : "null"
  const blockers = JSON.stringify(packet.blockers ?? [])
  const ownerGates = JSON.stringify(packet.ownerGates ?? [])
  const productionReadback = JSON.stringify(packet.productionReadback ?? [])
  const safetyFindings = JSON.stringify(packet.safetyFindings ?? [])
  const branchPushState = JSON.stringify(packet.branchPushState ?? [])
  const check = (name) => packet.checks?.[name] ?? "unknown"
  const ownerRequest = packet.ownerRequest
    ? `  owner_request:
    method: ${yamlScalar(packet.ownerRequest.method)}
    server: ${yamlScalar(packet.ownerRequest.serverName)}
    tool: ${yamlScalar(packet.ownerRequest.toolName)}
    arguments: ${yamlScalar(packet.ownerRequest.arguments === null ? null : JSON.stringify(packet.ownerRequest.arguments))}
    details: ${yamlScalar(packet.ownerRequest.details === null ? null : JSON.stringify(packet.ownerRequest.details))}`
    : "  owner_request: null"

  return `\`\`\`yaml
agent_result:
  instruction_id: ${yamlScalar(packet.instructionId)}
  origin_issue_number: ${packet.originIssueNumber ?? "null"}
  origin_issue_url: ${yamlScalar(packet.originIssueUrl)}
  codex_thread_id: ${yamlScalar(packet.codexThreadId)}
  status: ${packet.status}
  branch: ${yamlScalar(packet.branch)}
${commits}
  checks:
    typecheck: ${check("typecheck")}
    lint: ${check("lint")}
    tests: ${check("tests")}
    cloudflare_readiness: ${check("cloudflareReadiness")}
    build: ${check("build")}
    diff_check: ${check("diffCheck")}
  owner_question: ${yamlScalar(packet.ownerQuestion)}
${ownerRequest}
  blockers: ${blockers}
  owner_gates: ${ownerGates}
  production_readback: ${productionReadback}
  safety_findings: ${safetyFindings}
  branch_push_state: ${branchPushState}
  result_artifact: ${resultArtifact}
\`\`\`${files}${detail}`
}
