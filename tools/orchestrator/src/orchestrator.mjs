import path from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { AppServerClient } from "./app-server.mjs"
import {
  findExistingResult,
  formatCompletionPacket,
  ownerGateReason,
  selectLatestInstruction,
  shouldConsumeInstruction,
} from "./control-plane.mjs"
import { GithubControlPlane } from "./github-control-plane.mjs"
import { redactForLog, StateStore } from "./state-store.mjs"
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
  return redactForLog(
    String(request.reason ?? `Codex requested ${request.method}`).slice(0, 500),
  )
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
  const priorTurnCount = instructionTurnCount(state, instruction.instructionId)
  state.activeInstruction = {
    ...instruction,
    phase: "selected",
    attempts: 0,
    turnCount: priorTurnCount,
    selectedAt: selectedAt.toISOString(),
  }
  return state.activeInstruction
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

    if (!findExistingResult(comments, packet.instructionId)) {
      await this.controlPlane.postComment(formatCompletionPacket(packet))
    }

    state.lastConsumedInstructionId = packet.instructionId
    state.status = packet.status
    state.pendingOwnerRequest = packet.ownerQuestion
      ? { reason: packet.ownerQuestion }
      : null
    state.runs.push({
      instructionId: packet.instructionId,
      status: packet.status,
      threadId: packet.codexThreadId,
      branch: packet.branch,
      commits: packet.commits,
      turnCount: instructionTurnCount(state, packet.instructionId),
      completedAt: new Date().toISOString(),
    })
    state.activeInstruction = null
    state.retryCount = 0
    await this.#save(state)
  }

  async #packetFromWorkspace(state, instruction, turnResult) {
    let workspace = await inspectWorkspace(
      state.workspacePath,
      this.config.baseRef,
    )
    assertAllowedChanges(workspace.changedFiles, this.config.allowedPaths)

    if (turnResult.status === "completed" && this.config.autoCommit) {
      await commitWorkspaceChanges(
        state.workspacePath,
        `chore(orchestrator): complete ${instruction.instructionId}`,
      )
      workspace = await inspectWorkspace(
        state.workspacePath,
        this.config.baseRef,
      )
    }

    const validation = await validateWorkspace(
      state.workspacePath,
      this.config.baseRef,
    )
    const ownerRequest = turnResult.pendingOwnerRequest
    const completed = turnResult.status === "completed" && validation.pass
    const status = ownerRequest
      ? "needs_owner"
      : completed
        ? "needs_review"
        : "failed"
    return {
      instructionId: instruction.instructionId,
      codexThreadId: state.threadId,
      status,
      branch: workspace.branch || null,
      commits: workspace.commits,
      changedFiles: workspace.changedFiles,
      checks: checks(validation.pass ? "pass" : "fail"),
      ownerQuestion: compactOwnerQuestion(ownerRequest),
      detail: validation.pass
        ? "The local worktree passed `git diff --check`. Awaiting review; no deployment or production operation was performed."
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
          recordInstructionTurnStarted(state, { turnId, attempt })
          state.retryCount = attempt
          state.status = "running"
          await this.#save(state)
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

  async runOnce() {
    await this.start()
    const state = await this.store.load()
    const task = await this.controlPlane.fetchTask()
    const latestInstruction = selectLatestInstruction(task.issue, task.comments)

    if (state.activeInstruction?.phase === "result_pending") {
      const pendingId = state.activeInstruction.instructionId
      await this.#completeInstruction(
        state,
        state.activeInstruction.packet,
        task.comments,
      )
      return { status: state.status, instructionId: pendingId }
    }

    const instruction = state.activeInstruction ?? latestInstruction

    if (!instruction || !shouldConsumeInstruction(state, instruction)) {
      await this.store.appendEvent({
        type: "poll_idle",
        instructionId: instruction?.instructionId ?? null,
      })
      return { status: "idle", instructionId: instruction?.instructionId ?? null }
    }

    if (
      state.activeInstruction?.instructionId &&
      latestInstruction?.instructionId &&
      state.activeInstruction.instructionId !== latestInstruction.instructionId
    ) {
      await this.store.appendEvent({
        type: "instruction_deferred",
        activeInstructionId: state.activeInstruction.instructionId,
        deferredInstructionId: latestInstruction.instructionId,
      })
    }

    if (!state.activeInstruction) {
      beginInstruction(state, instruction)
      await this.#save(state)
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
        codexThreadId: state.threadId,
        status: "needs_owner",
        branch: state.branch,
        commits: [],
        changedFiles: [],
        checks: checks("not_run"),
        ownerQuestion: gate,
        detail: "No Codex turn was started because the owner gate stopped the instruction.",
      }
      await this.#completeInstruction(state, packet, task.comments)
      return { status: "needs_owner", instructionId: instruction.instructionId }
    }

    const workspace = await ensureWorkspace({
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
      state.activeInstruction.phase = "thread_ready"
      state.activeInstruction.attempts += 1
      await this.#save(state)
    }

    const turnResult = await this.#runWithRetries(state, instruction)
    let packet
    try {
      packet = await this.#packetFromWorkspace(state, instruction, turnResult)
    } catch (error) {
      const workspaceState = await inspectWorkspace(
        state.workspacePath,
        this.config.baseRef,
      )
      packet = {
        instructionId: instruction.instructionId,
        codexThreadId: state.threadId,
        status: "failed",
        branch: workspaceState.branch,
        commits: workspaceState.commits,
        changedFiles: workspaceState.changedFiles,
        checks: checks("fail"),
        ownerQuestion: null,
        detail: error.message,
      }
    }
    await this.#completeInstruction(state, packet, task.comments)
    return { status: packet.status, instructionId: instruction.instructionId }
  }

  async watch({ signal } = {}) {
    await this.start()
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
