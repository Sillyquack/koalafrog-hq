import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { AppServerClient } from "./app-server.mjs"
import {
  completeOwnerApprovedAction,
  consumeOwnerApprovalDecision,
  recordPendingApprovalRequest,
  registerOwnerApprovalDecisions,
  supersedePendingApprovalRequests,
} from "./approval-decisions.mjs"
import {
  findExistingResult,
  findExistingPickup,
  formatCompletionPacket,
  formatPickupPacket,
  listAgentControls,
  ownerGateReason,
  selectNextInstruction,
  shouldConsumeInstruction,
} from "./control-plane.mjs"
import { GithubControlPlane } from "./github-control-plane.mjs"
import {
  recordTaskOrigin,
  redactForLog,
  StateStore,
} from "./state-store.mjs"
import {
  canStartInstructionTurn,
  instructionTurnCount,
  normalizeTurnAccounting,
  recordInstructionTurnStarted,
} from "./turn-accounting.mjs"
import {
  assertAllowedChanges,
  commitWorkspaceChanges,
  ensureWorkspace,
  inspectWorkspace,
  validateWorkspace,
} from "./workspace.mjs"

const safetyInstructions = `You are running under the Koalafrog local orchestrator.
Work only in the provided isolated Git worktree. Do not deploy, apply production
migrations, modify production data, expose credentials, make purchases, create
external accounts, force-push, merge, or modify unrelated product-domain code.
If owner input or approval is required, request it explicitly and stop. The
orchestrator owns GitHub control-plane comments; do not post to GitHub yourself.`

function promptForInstruction(instruction, allowedPaths) {
  const scope = allowedPaths.length
    ? `\nFor this acceptance run, you may change only:\n${allowedPaths
        .map((file) => `- ${file}`)
        .join("\n")}`
    : ""
  return `${instruction.prompt}\n\n${safetyInstructions}${scope}\n\nRun git diff --check before finishing and summarize the change and validation.`
}

function compactOwnerQuestion(request) {
  if (!request) return null
  const lines = [
    String(request.reason ?? `Codex requested ${request.method}`),
    `Method: ${request.method ?? "unknown"}`,
  ]
  if (request.serverName) lines.push(`Server: ${request.serverName}`)
  if (request.toolName) lines.push(`Tool: ${request.toolName}`)
  if (request.arguments !== null && request.arguments !== undefined) {
    lines.push(`Arguments: ${JSON.stringify(request.arguments)}`)
  }
  if (request.details && Object.keys(request.details).length) {
    lines.push(`Request details: ${JSON.stringify(request.details)}`)
  }
  return String(redactForLog(lines.join("\n"))).slice(0, 8_000)
}

function compactOwnerRequest(request) {
  if (!request) return null
  return redactForLog({
    requestId: request.requestId ?? null,
    method: request.method ?? null,
    threadId: request.threadId ?? null,
    turnId: request.turnId ?? null,
    itemId: request.itemId ?? null,
    serverName: request.serverName ?? null,
    toolName: request.toolName ?? null,
    arguments: request.arguments ?? null,
    details: request.details ?? null,
    reason: String(request.reason ?? `Codex requested ${request.method}`).slice(
      0,
      2_000,
    ),
  })
}

function checks(tests) {
  return {
    typecheck: "not_run",
    lint: "not_run",
    tests,
    build: "not_run",
  }
}

export function beginInstruction(state, instruction, selectedAt = new Date()) {
  normalizeTurnAccounting(state)
  if (instruction.action === "start") {
    supersedePendingApprovalRequests({ state, now: selectedAt })
    state.pendingOwnerRequest = null
    state.threadId = null
    state.workspacePath = null
    state.branch = null
    state.retryCount = 0
  }
  const retainsPendingApproval = (state.pendingApprovalRequests ?? []).some(
    (pending) =>
      !pending.clearedAt &&
      pending.reason === state.pendingOwnerRequest?.reason,
  )
  if (!retainsPendingApproval) state.pendingOwnerRequest = null
  const priorTurnCount = instructionTurnCount(state, instruction.instructionId)
  state.activeInstruction = {
    ...instruction,
    phase: "selected",
    attempts: 0,
    turnCount: priorTurnCount,
    selectedAt: selectedAt.toISOString(),
  }
  state.retryInstructionIds = (state.retryInstructionIds ?? []).filter(
    (instructionId) => instructionId !== instruction.instructionId,
  )
  return state.activeInstruction
}

export function supersedeOwnerStoppedInstruction(
  state,
  latestInstruction,
  selectedAt = new Date(),
) {
  const active = state.activeInstruction
  if (
    !active ||
    !latestInstruction ||
    active.instructionId === latestInstruction.instructionId ||
    !state.pendingOwnerRequest ||
    active.phase !== "owner_stopped"
  ) {
    return null
  }

  normalizeTurnAccounting(state)
  state.runs ??= []
  const ownerRequest = state.pendingOwnerRequest
  if (
    !(state.runs ?? []).some(
      (run) =>
        run.instructionId === active.instructionId && run.status === "needs_owner",
    )
  ) {
    state.runs.push({
      instructionId: active.instructionId,
      status: "needs_owner",
      threadId: state.threadId,
      branch: state.branch,
      commits: [],
      turnCount: instructionTurnCount(state, active.instructionId),
      ownerRequest,
      completedAt: selectedAt.toISOString(),
    })
  }
  state.lastConsumedInstructionId = active.instructionId
  const supersededInstructionId = active.instructionId
  beginInstruction(state, latestInstruction, selectedAt)
  state.status = latestInstruction.taskState
  return {
    supersededInstructionId,
    instructionId: latestInstruction.instructionId,
    ownerRequest,
  }
}

export async function ensureTaskThread({
  appServer,
  state,
  workspacePath,
  model,
  save,
}) {
  const recoveringTurn = state.activeInstruction.phase === "turn_started"
  const common = {
    cwd: workspacePath,
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
    sandbox: "workspace-write",
    developerInstructions: safetyInstructions,
  }
  const response = state.threadId
    ? await appServer.resumeThread(state.threadId, common)
    : await appServer.startThread({
        ...common,
        ...(model ? { model } : {}),
        serviceName: "koalafrog_local_orchestrator",
        threadSource: "appServer",
      })
  state.threadId = response.thread.id
  if (!recoveringTurn) state.activeInstruction.phase = "thread_ready"
  await save(state)
  await appServer.waitForMcpReady(state.threadId)
  return response.thread
}

export class Orchestrator {
  constructor(config, dependencies = {}) {
    this.config = config
    this.store =
      dependencies.store ??
      new StateStore({
        stateDirectory: config.stateDirectory,
        repository: config.repository,
        issueNumber: config.issueNumber,
      })
    this.appServer =
      dependencies.appServer ??
      new AppServerClient({
        binary: config.codexBinary,
        cwd: config.checkoutPath,
        eventSink: (event) => this.store.appendEvent(event),
        stderrSink: (text) => this.store.appendStderr(text),
      })
    this.controlPlane = dependencies.controlPlane ?? null
    this.workspace = {
      assertAllowedChanges,
      commitWorkspaceChanges,
      ensureWorkspace,
      inspectWorkspace,
      validateWorkspace,
      ...dependencies.workspace,
    }
    this.controlThreadId = null
    this.started = false
  }

  async start() {
    if (this.started) return
    await this.appServer.start()
    if (!this.controlPlane) {
      const response = await this.appServer.startThread({
        cwd: this.config.checkoutPath,
        approvalPolicy: "never",
        sandbox: "read-only",
        ephemeral: true,
        serviceName: "koalafrog_control_plane",
        threadSource: "appServer",
      })
      this.controlThreadId = response.thread.id
      await this.appServer.waitForMcpReady(this.controlThreadId)
      this.controlPlane = new GithubControlPlane({
        appServer: this.appServer,
        threadId: this.controlThreadId,
        repository: this.config.repository,
        issueNumber: this.config.issueNumber,
      })
    }
    this.started = true
  }

  async #save(state) {
    await this.store.save(state)
  }

  async #completeInstruction(state, packet, comments) {
    state.activeInstruction.phase = "result_pending"
    state.activeInstruction.packet = packet
    await this.#save(state)

    const existingResult = findExistingResult(comments, packet.instructionId)
    const completionComment = formatCompletionPacket(packet)
    const correctionIds = new Set(state.resultCorrectionInstructionIds ?? [])
    if (!existingResult) {
      await this.controlPlane.postComment(completionComment)
    } else if (
      correctionIds.has(packet.instructionId) &&
      Number.isSafeInteger(existingResult.id)
    ) {
      await this.controlPlane.updateComment(existingResult.id, completionComment)
      correctionIds.delete(packet.instructionId)
      state.resultCorrectionInstructionIds = [...correctionIds]
    }

    state.lastConsumedInstructionId = packet.instructionId
    state.status = packet.status
    state.pendingOwnerRequest = packet.ownerRequest ??
      (packet.ownerQuestion ? { reason: packet.ownerQuestion } : null)
    state.runs.push({
      instructionId: packet.instructionId,
      status: packet.status,
      threadId: packet.codexThreadId,
      branch: packet.branch,
      commits: packet.commits,
      turnCount: instructionTurnCount(state, packet.instructionId),
      originIssueNumber: state.task.originIssueNumber,
      originIssueUrl: state.task.originIssueUrl,
      ownerRequest: packet.ownerRequest ?? null,
      completedAt: new Date().toISOString(),
    })
    state.activeInstruction = null
    state.retryCount = 0
    await this.#save(state)
  }

  async #postPickup(state, instruction, comments) {
    if (findExistingPickup(comments, instruction.instructionId)) return
    await this.controlPlane.postComment(
      formatPickupPacket({
        instructionId: instruction.instructionId,
        originIssueNumber: state.task.originIssueNumber,
        originIssueUrl: state.task.originIssueUrl,
        codexThreadId: state.threadId,
        branch: state.branch,
      }),
    )
    await this.store.appendEvent({
      type: "instruction_pickup_posted",
      instructionId: instruction.instructionId,
      originIssueNumber: state.task.originIssueNumber,
      originIssueUrl: state.task.originIssueUrl,
      threadId: state.threadId,
    })
  }

  async #packetFromWorkspace(state, instruction, turnResult) {
    let workspace = await this.workspace.inspectWorkspace(
      state.workspacePath,
      this.config.baseRef,
    )
    this.workspace.assertAllowedChanges(
      workspace.changedFiles,
      this.config.allowedPaths,
    )

    if (turnResult.status === "completed" && this.config.autoCommit) {
      await this.workspace.commitWorkspaceChanges(
        state.workspacePath,
        `chore(orchestrator): complete ${instruction.instructionId}`,
      )
      workspace = await this.workspace.inspectWorkspace(
        state.workspacePath,
        this.config.baseRef,
      )
    }

    const validation = await this.workspace.validateWorkspace(
      state.workspacePath,
      this.config.baseRef,
    )
    const ownerRequest = turnResult.pendingOwnerRequest
    const structuredOwnerRequest = compactOwnerRequest(ownerRequest)
    const completed = turnResult.status === "completed" && validation.pass
    const status = ownerRequest
      ? "needs_owner"
      : completed
        ? "needs_review"
        : "failed"
    return {
      instructionId: instruction.instructionId,
      originIssueNumber: state.task.originIssueNumber,
      originIssueUrl: state.task.originIssueUrl,
      codexThreadId: state.threadId,
      status,
      branch: workspace.branch || null,
      commits: workspace.commits,
      changedFiles: workspace.changedFiles,
      checks: checks(validation.pass ? "pass" : "fail"),
      ownerQuestion: compactOwnerQuestion(structuredOwnerRequest),
      ownerRequest: structuredOwnerRequest,
      detail: validation.pass
        ? ownerRequest
          ? "The Codex turn stopped for owner input after the MCP request was cancelled. The local worktree passed `git diff --check`; no deployment or production operation was performed."
          : "The local worktree passed `git diff --check`. Awaiting review; no deployment or production operation was performed."
        : `Local validation failed: ${validation.detail || turnResult.turn?.error?.message || "unknown error"}`,
    }
  }

  async #runWithRetries(state, instruction) {
    const maxTurns = Math.min(instruction.maxTurns, this.config.maxTurns)
    let result = null
    if ((state.activeInstruction.attempts ?? 0) > this.config.maxRetries) {
      return {
        status: "failed",
        turn: {
          status: "failed",
          error: { message: "Bounded retry limit reached" },
        },
        pendingOwnerRequest: null,
      }
    }
    for (
      let attempt = state.activeInstruction.attempts ?? 0;
      attempt <= this.config.maxRetries;
      attempt += 1
    ) {
      if (!canStartInstructionTurn(state, maxTurns)) {
        return {
          status: "failed",
          turn: {
            status: "failed",
            error: { message: `Hard max_turns reached (${maxTurns})` },
          },
          pendingOwnerRequest: null,
        }
      }

      const retryPrefix = attempt
        ? `Retry attempt ${attempt} for the same idempotent instruction. Inspect the existing worktree before changing anything.\n\n`
        : ""
      result = await this.appServer.runTurn({
        threadId: state.threadId,
        cwd: state.workspacePath,
        timeoutMs: this.config.turnTimeoutMs,
        prompt: `${retryPrefix}${promptForInstruction(instruction, this.config.allowedPaths)}`,
        onTurnStarted: async (turnId) => {
          const availableDecisionIds = (state.ownerApprovalDecisions ?? [])
            .filter(
              (decision) =>
                !decision.consumedAt &&
                Date.parse(decision.expiresAt) > Date.now(),
            )
            .map((decision) => decision.decisionId)
          recordInstructionTurnStarted(state, { turnId, attempt })
          state.retryCount = attempt
          if (state.activeInstruction.ownerRequest) {
            state.activeInstruction.phase = "owner_stopped"
            state.pendingOwnerRequest = state.activeInstruction.ownerRequest
            state.status = "needs_owner"
          } else {
            state.status = "running"
          }
          await this.#save(state)
          await this.store.appendEvent({
            type: "turn_started",
            instructionId: instruction.instructionId,
            threadId: state.threadId,
            turnId,
            attempt,
          })
          if (availableDecisionIds.length) {
            await this.store.appendEvent({
              type: "owner_approval_retry_turn_started",
              instructionId: instruction.instructionId,
              threadId: state.threadId,
              turnId,
              decisionIds: availableDecisionIds,
            })
          }
        },
        onOwnerStop: async (ownerRequest) => {
          recordPendingApprovalRequest({
            state,
            instructionId: instruction.instructionId,
            request: ownerRequest,
          })
          const structuredOwnerRequest = compactOwnerRequest(ownerRequest)
          state.activeInstruction.phase = "owner_stopped"
          state.activeInstruction.ownerRequest = structuredOwnerRequest
          state.pendingOwnerRequest = structuredOwnerRequest
          state.status = "needs_owner"
          await this.#save(state)
        },
        resolveApprovalRequest: async (ownerRequest) => {
          const consumed = consumeOwnerApprovalDecision({
            state,
            request: ownerRequest,
          })
          if (!consumed) return null
          await this.#save(state)
          await this.store.appendEvent({
            type: "owner_approval_decision_consumed",
            decisionId: consumed.decision.decisionId,
            scope: consumed.decision.scope,
            instructionId: instruction.instructionId,
            requestMethod: ownerRequest.method,
            requestReasonDigest: consumed.decision.consumedRequestDigest,
          })
          return {
            response: consumed.response,
            decisionId: consumed.decision.decisionId,
          }
        },
        onApprovedActionCompleted: async ({ decisionId, succeeded }) => {
          const completion = completeOwnerApprovedAction({
            state,
            decisionId,
            succeeded,
          })
          if (!completion) return
          if (
            completion.cleared &&
            state.pendingOwnerRequest?.reason === completion.pending?.reason
          ) {
            state.pendingOwnerRequest = null
          }
          await this.#save(state)
          await this.store.appendEvent({
            type: succeeded
              ? "owner_approved_action_completed"
              : "owner_approved_action_failed",
            decisionId,
            pendingRequestKey: completion.decision.pendingRequestKey,
            instructionId: instruction.instructionId,
          })
        },
      })
      if (result.status === "completed" || result.status === "needs_owner") {
        return result
      }
      if (attempt < this.config.maxRetries) {
        const backoff = Math.min(
          this.config.retryBaseMs * 2 ** attempt + Math.floor(Math.random() * 250),
          30_000,
        )
        await this.store.appendEvent({
          type: "retry_scheduled",
          instructionId: instruction.instructionId,
          attempt: attempt + 1,
          backoffMs: backoff,
        })
        await delay(backoff)
      }
    }
    return result
  }

  async runOnce({ task: providedTask = null, expectedInstructionId = null } = {}) {
    await this.start()
    const state = await this.store.load()
    const task = providedTask ?? (await this.controlPlane.fetchTask())
    const decisionIds = new Set(
      (state.ownerApprovalDecisions ?? []).map(
        (decision) => decision.decisionId,
      ),
    )
    const registeredDecisions = registerOwnerApprovalDecisions({
      state,
      controls: listAgentControls(task.issue, task.comments),
    })
    const newDecisions = registeredDecisions.filter(
      (decision) => !decisionIds.has(decision.decisionId),
    )
    if (newDecisions.length) {
      await this.#save(state)
      for (const registeredDecision of newDecisions) {
        await this.store.appendEvent({
          type: "owner_approval_decision_registered",
          decisionId: registeredDecision.decisionId,
          scope: registeredDecision.scope,
          pendingInstructionId: registeredDecision.pendingInstructionId,
          pendingRequestKey: registeredDecision.pendingRequestKey,
          expiresAt: registeredDecision.expiresAt,
        })
      }
    }
    const originIssueUrl =
      task.issue?.html_url ?? task.issue?.display_url ?? task.issue?.url ?? null
    if (originIssueUrl !== state.task.originIssueUrl) {
      recordTaskOrigin(state, {
        issueNumber: this.config.issueNumber,
        issueUrl: originIssueUrl,
      })
      await this.#save(state)
    }
    const pendingInstruction = selectNextInstruction(
      task.issue,
      task.comments,
      state,
    )

    const selectedInstruction = state.activeInstruction ?? pendingInstruction
    if (
      expectedInstructionId &&
      selectedInstruction?.instructionId !== expectedInstructionId
    ) {
      await this.store.appendEvent({
        type: "queue_claim_changed",
        expectedInstructionId,
        selectedInstructionId: selectedInstruction?.instructionId ?? null,
      })
      return {
        status: "queue_changed",
        instructionId: selectedInstruction?.instructionId ?? null,
      }
    }

    if (state.activeInstruction?.phase === "result_pending") {
      const pendingId = state.activeInstruction.instructionId
      const pendingPacket = state.activeInstruction.packet
      await this.#completeInstruction(
        state,
        pendingPacket,
        task.comments,
      )
      if (
        pendingPacket.status !== "needs_owner" ||
        !pendingInstruction ||
        pendingInstruction.instructionId === pendingId ||
        !shouldConsumeInstruction(state, pendingInstruction)
      ) {
        return {
          status: state.status,
          instructionId: pendingId,
          ownerRequest: state.pendingOwnerRequest,
        }
      }
      await this.store.appendEvent({
        type: "instruction_takeover_after_owner_stop",
        supersededInstructionId: pendingId,
        instructionId: pendingInstruction.instructionId,
      })
    }

    if (state.activeInstruction?.phase === "owner_stopped") {
      const stoppedInstruction = state.activeInstruction
      const stoppedId = stoppedInstruction.instructionId
      const ownerRequest =
        state.pendingOwnerRequest ?? stoppedInstruction.ownerRequest ?? null
      let packet
      try {
        packet = await this.#packetFromWorkspace(
          state,
          stoppedInstruction,
          {
            status: "needs_owner",
            turn: { id: stoppedInstruction.turnId, status: "interrupted" },
            pendingOwnerRequest: ownerRequest,
          },
        )
      } catch (error) {
        packet = {
          instructionId: stoppedId,
          originIssueNumber: state.task.originIssueNumber,
          originIssueUrl: state.task.originIssueUrl,
          codexThreadId: state.threadId,
          status: "needs_owner",
          branch: state.branch,
          commits: [],
          changedFiles: [],
          checks: checks("fail"),
          ownerQuestion: compactOwnerQuestion(ownerRequest),
          ownerRequest: compactOwnerRequest(ownerRequest),
          detail: `Recovered an owner stop, but local validation failed: ${error.message}`,
        }
      }
      await this.#completeInstruction(state, packet, task.comments)
      if (
        !pendingInstruction ||
        pendingInstruction.instructionId === stoppedId ||
        !shouldConsumeInstruction(state, pendingInstruction)
      ) {
        return {
          status: "needs_owner",
          instructionId: stoppedId,
          ownerRequest: state.pendingOwnerRequest,
        }
      }
      await this.store.appendEvent({
        type: "instruction_takeover_after_owner_stop",
        supersededInstructionId: stoppedId,
        instructionId: pendingInstruction.instructionId,
      })
    }

    const instruction = state.activeInstruction ?? pendingInstruction

    if (!instruction || !shouldConsumeInstruction(state, instruction)) {
      await this.store.appendEvent({
        type: "poll_idle",
        instructionId: instruction?.instructionId ?? null,
      })
      return { status: "idle", instructionId: instruction?.instructionId ?? null }
    }

    if (
      state.activeInstruction?.instructionId &&
      pendingInstruction?.instructionId &&
      state.activeInstruction.instructionId !== pendingInstruction.instructionId
    ) {
      await this.store.appendEvent({
        type: "instruction_deferred",
        activeInstructionId: state.activeInstruction.instructionId,
        deferredInstructionId: pendingInstruction.instructionId,
      })
    }

    if (!state.activeInstruction) {
      beginInstruction(state, instruction)
      await this.#save(state)
      await this.store.appendEvent({
        type: "instruction_selected",
        instructionId: instruction.instructionId,
        action: instruction.action,
      })
    }

    if (instruction.action === "stop") {
      state.lastConsumedInstructionId = instruction.instructionId
      state.status = instruction.taskState
      state.activeInstruction = null
      await this.#save(state)
      return { status: "stopped", instructionId: instruction.instructionId }
    }

    const gate = ownerGateReason(instruction)
    if (gate) {
      const packet = {
        instructionId: instruction.instructionId,
        originIssueNumber: state.task.originIssueNumber,
        originIssueUrl: state.task.originIssueUrl,
        codexThreadId: state.threadId,
        status: "needs_owner",
        branch: state.branch,
        commits: [],
        changedFiles: [],
        checks: checks("not_run"),
        ownerQuestion: gate,
        ownerRequest: compactOwnerRequest({
          method: "control-plane/ownerGate",
          reason: gate,
        }),
        detail: "No Codex turn was started because the owner gate stopped the instruction.",
      }
      await this.#completeInstruction(state, packet, task.comments)
      return {
        status: "needs_owner",
        instructionId: instruction.instructionId,
        ownerRequest: state.pendingOwnerRequest,
      }
    }

    const workspace = await this.workspace.ensureWorkspace({
      checkoutPath: this.config.checkoutPath,
      workspaceRoot: path.join(this.store.directory, "workspaces"),
      issueNumber: this.config.issueNumber,
      instructionId: instruction.instructionId,
      baseRef: this.config.baseRef,
      existingPath: state.workspacePath,
      existingBranch: state.branch,
      fetchRemote: this.config.fetchRemote,
    })
    state.workspacePath = workspace.path
    state.branch = workspace.branch
    await this.#save(state)

    await ensureTaskThread({
      appServer: this.appServer,
      state,
      workspacePath: state.workspacePath,
      model: this.config.model,
      save: (nextState) => this.#save(nextState),
    })
    await this.#postPickup(state, instruction, task.comments)

    if (state.activeInstruction.phase === "turn_started") {
      const recovered = await this.appServer.readThread(state.threadId)
      const priorTurn = recovered.thread?.turns?.find(
        (turn) => turn.id === state.activeInstruction.turnId,
      )
      if (priorTurn?.status === "completed") {
        const packet = await this.#packetFromWorkspace(state, instruction, {
          status: "completed",
          turn: priorTurn,
          pendingOwnerRequest: null,
        })
        await this.#completeInstruction(state, packet, task.comments)
        return { status: packet.status, instructionId: instruction.instructionId }
      }
      if (
        new Set(["inProgress", "in_progress", "running"]).has(
          priorTurn?.status,
        )
      ) {
        const lastPersistedAt = Date.parse(state.updatedAt ?? "")
        const recoveryAgeMs = Number.isFinite(lastPersistedAt)
          ? Date.now() - lastPersistedAt
          : Number.POSITIVE_INFINITY
        if (recoveryAgeMs < this.config.turnTimeoutMs) {
          await this.store.appendEvent({
            type: "turn_recovery_deferred",
            instructionId: instruction.instructionId,
            threadId: state.threadId,
            turnId: state.activeInstruction.turnId,
            recoveryAgeMs,
          })
          return {
            status: "claim_deferred",
            instructionId: instruction.instructionId,
          }
        }
        try {
          await this.appServer.interruptTurn?.(
            state.threadId,
            state.activeInstruction.turnId,
          )
          await this.store.appendEvent({
            type: "stale_turn_interrupt_requested",
            instructionId: instruction.instructionId,
            turnId: state.activeInstruction.turnId,
          })
        } catch (error) {
          await this.store.appendEvent({
            type: "stale_turn_interrupt_failed",
            instructionId: instruction.instructionId,
            turnId: state.activeInstruction.turnId,
            error: error.message,
          })
        }
        return {
          status: "claim_deferred",
          instructionId: instruction.instructionId,
        }
      }
      if (
        !priorTurn ||
        !new Set(["failed", "interrupted", "cancelled", "canceled"]).has(
          priorTurn.status,
        )
      ) {
        await this.store.appendEvent({
          type: "turn_recovery_unconfirmed",
          instructionId: instruction.instructionId,
          threadId: state.threadId,
          turnId: state.activeInstruction.turnId,
          status: priorTurn?.status ?? null,
        })
        return {
          status: "claim_deferred",
          instructionId: instruction.instructionId,
        }
      }
      state.activeInstruction.phase = "thread_ready"
      state.activeInstruction.attempts += 1
      await this.#save(state)
    }

    const turnResult = await this.#runWithRetries(state, instruction)
    let packet
    try {
      packet = await this.#packetFromWorkspace(state, instruction, turnResult)
    } catch (error) {
      const workspaceState = await this.workspace.inspectWorkspace(
        state.workspacePath,
        this.config.baseRef,
      )
      packet = {
        instructionId: instruction.instructionId,
        originIssueNumber: state.task.originIssueNumber,
        originIssueUrl: state.task.originIssueUrl,
        codexThreadId: state.threadId,
        status: "failed",
        branch: workspaceState.branch,
        commits: workspaceState.commits,
        changedFiles: workspaceState.changedFiles,
        checks: checks("fail"),
        ownerQuestion: null,
        ownerRequest: null,
        detail: error.message,
      }
    }
    await this.#completeInstruction(state, packet, task.comments)
    return {
      status: packet.status,
      instructionId: instruction.instructionId,
      ownerRequest: packet.ownerRequest ?? null,
    }
  }

  async watch({ signal } = {}) {
    await this.start()
    await this.store.appendEvent({
      type: "watch_started",
      pid: process.pid,
      repository: this.config.repository,
      issueNumber: this.config.issueNumber,
      pollMs: this.config.pollMs,
    })
    while (!signal?.aborted) {
      try {
        await this.runOnce()
      } catch (error) {
        await this.store.appendEvent({ type: "poll_failed", error: error.message })
      }
      try {
        await delay(this.config.pollMs, undefined, { signal })
      } catch (error) {
        if (error.name !== "AbortError") throw error
      }
    }
  }

  async stop() {
    await this.appServer.stop()
    this.started = false
  }
}
