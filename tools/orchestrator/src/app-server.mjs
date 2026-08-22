import { spawn } from "node:child_process"
import { EventEmitter } from "node:events"
import readline from "node:readline"
import {
  compactCommandExecution,
  finalAgentMessageFromTurn,
} from "./result-artifact.mjs"
import { redactForLog } from "./state-store.mjs"

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function compactProtocolMessage(message) {
  const params = message.params ?? {}
  const compact = {
    method: message.method,
    ...(message.id === undefined ? {} : { id: message.id }),
    threadId: params.threadId ?? null,
    turnId: params.turnId ?? params.turn?.id ?? null,
    itemId: params.itemId ?? params.item?.id ?? null,
  }
  if (params.status !== undefined) compact.status = params.status
  if (params.turn?.status !== undefined) compact.status = params.turn.status
  if (params.item?.type !== undefined) compact.itemType = params.item.type
  if (params.item?.status !== undefined) compact.itemStatus = params.item.status
  if (params.name !== undefined) compact.name = params.name
  if (params.reason !== undefined) compact.reason = String(params.reason).slice(0, 500)
  if (params.message !== undefined) compact.summary = String(params.message).slice(0, 500)
  if (params.request?.message !== undefined) {
    compact.summary = String(params.request.message).slice(0, 500)
  }
  if (Array.isArray(params.data)) compact.itemCount = params.data.length
  if (typeof params.diff === "string") compact.diffBytes = Buffer.byteLength(params.diff)
  if (typeof params.delta === "string") compact.deltaBytes = Buffer.byteLength(params.delta)
  return compact
}

function requestSummary(params = {}) {
  return (
    params.reason ??
    params.message ??
    params.request?.message ??
    params.questions?.map((question) => question.question).join("; ") ??
    null
  )
}

function toolNameFromSummary(summary) {
  return String(summary ?? "").match(/\btool\s+["'`]([^"'`]+)["'`]/i)?.[1] ?? null
}

function matchingMcpToolCall(message, toolCalls) {
  const calls = [...toolCalls.values()]
  if (!calls.length) return null

  const itemId = message.params?.itemId
  if (itemId && toolCalls.has(itemId)) return toolCalls.get(itemId)

  const summary = String(requestSummary(message.params) ?? "").toLowerCase()
  const toolMatches = calls.filter((item) =>
    [item.tool, `${item.server}.${item.tool}`]
      .filter(Boolean)
      .some((name) => summary.includes(String(name).toLowerCase())),
  )
  if (toolMatches.length === 1) return toolMatches[0]

  const serverName = String(message.params?.serverName ?? "").toLowerCase()
  const serverMatches = calls.filter(
    (item) => serverName && String(item.server).toLowerCase() === serverName,
  )
  if (serverMatches.length === 1) return serverMatches[0]
  return calls.length === 1 ? calls[0] : null
}

export function classifyServerRequest(message, mcpToolCall = null) {
  const ownerMethods = new Set([
    "item/commandExecution/requestApproval",
    "item/fileChange/requestApproval",
    "item/tool/requestUserInput",
    "tool/requestUserInput",
    "item/permissions/requestApproval",
    "mcpServer/elicitation/request",
    "applyPatchApproval",
    "execCommandApproval",
  ])
  if (message?.id === undefined || !message.method) return null

  const params = message.params ?? {}
  const summary = requestSummary(params)
  const reason =
    summary ??
    `${ownerMethods.has(message.method) ? "Codex requires owner input" : "The orchestrator cannot safely answer the server request"} for ${message.method}.`
  const {
    threadId: _threadId,
    turnId: _turnId,
    itemId: _itemId,
    ...requestDetails
  } = params
  const serverName = params.serverName ?? mcpToolCall?.server ?? null
  const toolName =
    params.toolName ??
    params.tool ??
    params.request?.toolName ??
    params.request?.tool ??
    toolNameFromSummary(summary) ??
    mcpToolCall?.tool ??
    null
  const toolArguments =
    params.arguments ??
    params.toolArguments ??
    params.request?.arguments ??
    params.request?.params?.arguments ??
    mcpToolCall?.arguments ??
    null
  return {
    requestId: message.id,
    method: message.method,
    threadId: params.threadId ?? null,
    turnId: params.turnId ?? null,
    itemId: params.itemId ?? mcpToolCall?.id ?? null,
    serverName,
    toolName,
    arguments: redactForLog(toolArguments),
    details: redactForLog({
      ...requestDetails,
      ...(mcpToolCall?.appContext
        ? { appContext: mcpToolCall.appContext }
        : {}),
    }),
    reason: redactForLog(String(reason)),
  }
}

function ownerStopResponse(message) {
  if (
    new Set([
      "item/commandExecution/requestApproval",
      "item/fileChange/requestApproval",
    ]).has(message?.method)
  ) {
    return { decision: "cancel" }
  }
  if (message?.method === "mcpServer/elicitation/request") {
    return { action: "cancel", content: null }
  }
  return null
}

function approvedItemSucceeded(item) {
  const exitCode = item?.exitCode ?? item?.exit_code ?? null
  return (
    item?.status === "completed" &&
    (exitCode === null || exitCode === 0)
  )
}

const terminalCommandStatuses = new Set([
  "completed",
  "failed",
  "interrupted",
  "cancelled",
  "canceled",
  "declined",
])

function commandExecutionIsTerminal(item) {
  return (
    item?.type === "commandExecution" &&
    terminalCommandStatuses.has(item.status)
  )
}

const boundedGitHubApprovalMessages = [
  /^Allow GitHub to create a Git tree\?$/i,
  /^Allow GitHub to create a commit\?$/i,
  /^Allow GitHub to (?:create|update) a Git (?:reference|ref)\?$/i,
  /^Allow GitHub to update (?:a|the) Git (?:reference|ref)\?$/i,
  /^Allow GitHub to update .*branch.*\?$/i,
  /^Allow GitHub to push .*branch.*\?$/i,
]

const boundedOrchestratorCommandApprovalMessages = [
  /^Allow (?:me to )?(?:apply|carry|copy) the (?:explicitly owner-approved )?(?:already-)?audited (?:Issue #53 )?(?:local )?orchestrator (?:implementation )?(?:commit )?stack (?:to|onto) this isolated (?:fix|diagnostic) branch(?: so I can .*?)?\?$/i,
  /^Allow the explicitly authorized audited orchestrator commits to be copied onto this isolated diagnostic branch for the repository-discovery fix\?$/i,
  /^Owner-approved: copy only the audited local orchestrator commits onto this isolated diagnostic branch\.?$/i,
  /^Apply the explicitly owner-approved audited Issue #53 orchestrator implementation stack to this isolated fix branch\?$/i,
]

export function autoResponseForBoundedElicitation(message, prompt = "") {
  if (message?.method !== "mcpServer/elicitation/request") return null

  const normalizedPrompt = String(prompt)
  const hasExplicitOwnerApproval =
    /Owner approval(?:\s+remains)?\s+(?:is\s+)?(?:explicitly\s+)?granted/i.test(
      normalizedPrompt,
    ) &&
    /create the Git tree\/commit/i.test(normalizedPrompt) &&
    /push(?: that commit| the existing review branch| the existing branch)?/i.test(
      normalizedPrompt,
    )

  if (!hasExplicitOwnerApproval) return null

  const summary = String(
    message.params?.message ?? message.params?.request?.message ?? "",
  ).trim()
  if (!boundedGitHubApprovalMessages.some((pattern) => pattern.test(summary))) {
    return null
  }

  return { action: "accept", content: {} }
}

export function autoResponseForBoundedCommandApproval(message, prompt = "") {
  if (message?.method !== "item/commandExecution/requestApproval") return null

  const normalizedPrompt = String(prompt)
  const hasExplicitOwnerApproval =
    /Owner approval(?:\s+is)?\s+(?:explicitly\s+)?granted/i.test(
      normalizedPrompt,
    ) &&
    /audited Issue #53 orchestrator implementation stack/i.test(normalizedPrompt) &&
    /isolated (?:fix )?branch/i.test(normalizedPrompt)

  if (!hasExplicitOwnerApproval) return null

  const reason = String(message.params?.reason ?? "").trim()
  if (
    !boundedOrchestratorCommandApprovalMessages.some((pattern) =>
      pattern.test(reason),
    )
  ) {
    return null
  }

  return { decision: "accept" }
}

export class AppServerClient extends EventEmitter {
  constructor({
    binary = "codex",
    cwd,
    requestTimeoutMs = 30_000,
    turnTerminationTimeoutMs = 60_000,
    eventSink = () => {},
    stderrSink = () => {},
  }) {
    super()
    if (
      !Number.isSafeInteger(turnTerminationTimeoutMs) ||
      turnTerminationTimeoutMs < 1
    ) {
      throw new Error("turnTerminationTimeoutMs must be a positive integer")
    }
    this.binary = binary
    this.cwd = cwd
    this.requestTimeoutMs = requestTimeoutMs
    this.turnTerminationTimeoutMs = turnTerminationTimeoutMs
    this.eventSink = eventSink
    this.stderrSink = stderrSink
    this.nextRequestId = 1
    this.pending = new Map()
    this.mcpStatuses = new Map()
    this.process = null
  }

  async start() {
    if (this.process) return
    this.process = spawn(this.binary, ["app-server", "--stdio"], {
      cwd: this.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    })

    const stdout = readline.createInterface({ input: this.process.stdout })
    stdout.on("line", (line) => this.#handleLine(line))
    this.process.stderr.on("data", (chunk) => {
      Promise.resolve(this.stderrSink(chunk.toString())).catch(() => {})
    })
    this.process.once("error", (error) => this.#failPending(error))
    this.process.once("exit", (code, signal) => {
      const error = new Error(
        `Codex App Server exited (code=${String(code)}, signal=${String(signal)})`,
      )
      this.#failPending(error)
      this.emit("exit", error)
      this.process = null
    })

    await this.request("initialize", {
      clientInfo: {
        name: "koalafrog_local_orchestrator",
        title: "Koalafrog Local Orchestrator",
        version: "0.1.0",
      },
      capabilities: null,
    })
    this.notify("initialized")
  }

  #handleLine(line) {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      Promise.resolve(
        this.eventSink({
          type: "protocol_parse_error",
          bytes: Buffer.byteLength(line),
        }),
      ).catch(() => {})
      return
    }

    if (message.id !== undefined && !message.method) {
      const pending = this.pending.get(message.id)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pending.delete(message.id)
      if (message.error) {
        pending.reject(
          new Error(
            `App Server ${pending.method} failed: ${message.error.message ?? JSON.stringify(message.error)}`,
          ),
        )
      } else {
        pending.resolve(message.result)
      }
      return
    }

    if (message.method === "mcpServer/startupStatus/updated") {
      const key = `${message.params?.threadId}:${message.params?.name}`
      this.mcpStatuses.set(key, message.params?.status)
    }

    const kind = message.id === undefined ? "notification" : "server_request"
    Promise.resolve(
      this.eventSink({ type: kind, message: compactProtocolMessage(message) }),
    ).catch(() => {})
    this.emit(kind, message)
    this.emit(message.method, message.params, message)
  }

  #failPending(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }

  request(method, params = {}, timeoutMs = this.requestTimeoutMs) {
    if (!this.process?.stdin?.writable) {
      return Promise.reject(new Error("Codex App Server is not running"))
    }
    const id = this.nextRequestId
    this.nextRequestId += 1
    const pending = deferred()
    pending.method = method
    pending.timer = setTimeout(() => {
      this.pending.delete(id)
      pending.reject(new Error(`App Server request timed out: ${method}`))
    }, timeoutMs)
    this.pending.set(id, pending)
    this.process.stdin.write(`${JSON.stringify({ method, id, params })}\n`)
    return pending.promise
  }

  respond(requestId, result) {
    if (!this.process?.stdin?.writable) {
      throw new Error("Codex App Server is not running")
    }
    this.process.stdin.write(`${JSON.stringify({ id: requestId, result })}\n`)
  }

  notify(method, params) {
    if (!this.process?.stdin?.writable) {
      throw new Error("Codex App Server is not running")
    }
    const message = params === undefined ? { method } : { method, params }
    this.process.stdin.write(`${JSON.stringify(message)}\n`)
  }

  async startThread(params) {
    return this.request("thread/start", params, 60_000)
  }

  async resumeThread(threadId, params = {}) {
    return this.request(
      "thread/resume",
      { threadId, ...params },
      60_000,
    )
  }

  async readThread(threadId) {
    return this.request("thread/read", { threadId, includeTurns: true })
  }

  async interruptTurn(threadId, turnId) {
    return this.request("turn/interrupt", { threadId, turnId }, 60_000)
  }

  async waitForMcpReady(threadId, server = "codex_apps", timeoutMs = 45_000) {
    const key = `${threadId}:${server}`
    if (this.mcpStatuses.get(key) === "ready") return

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error(`MCP server did not become ready: ${server}`))
      }, timeoutMs)
      const listener = (params) => {
        if (params?.threadId !== threadId || params?.name !== server) return
        if (params.status === "ready") {
          cleanup()
          resolve()
        } else if (params.status === "failed") {
          cleanup()
          reject(new Error(`MCP server failed: ${server}`))
        }
      }
      const cleanup = () => {
        clearTimeout(timer)
        this.off("mcpServer/startupStatus/updated", listener)
      }
      this.on("mcpServer/startupStatus/updated", listener)
    })
  }

  async callMcpTool({ threadId, server, tool, arguments: toolArguments }) {
    return this.request(
      "mcpServer/tool/call",
      { threadId, server, tool, arguments: toolArguments },
      120_000,
    )
  }

  async runTurn({
    threadId,
    prompt,
    cwd,
    timeoutMs,
    approvalPolicy = null,
    onTurnStarted = () => {},
    onOwnerStop = () => {},
    resolveApprovalRequest = () => null,
    onApprovedActionCompleted = () => {},
  }) {
    let turnId = null
    let pendingOwnerRequest = null
    let ownerStopPersistence = Promise.resolve()
    let approvedActionPersistence = Promise.resolve()
    let ownerStopTimer = null
    let turnTerminationTimer = null
    let agentMessage = ""
    let settled = false
    let turnTimedOut = false
    let timeoutInterruption = null
    let interruptedTurnCompletion = null
    const activeCommandExecutions = new Set()
    const commandExecutionItems = new Map()
    const completedCommandExecutions = []
    const mcpToolCalls = new Map()
    const approvedItems = new Map()
    const terminal = deferred()
    const handledServerRequestIds = new Set()

    const complete = (result) => {
      if (settled) return
      settled = true
      cleanup()
      Promise.all([ownerStopPersistence, approvedActionPersistence]).then(
        () => terminal.resolve(result),
        (error) => terminal.reject(error),
      )
    }
    const fail = (error) => {
      if (settled) return
      settled = true
      cleanup()
      Promise.all([ownerStopPersistence, approvedActionPersistence]).then(
        () => terminal.reject(error),
        (persistenceError) => terminal.reject(persistenceError),
      )
    }
    const interruptTimedOutTurn = () => {
      if (!turnId || timeoutInterruption || settled) return
      turnTerminationTimer = setTimeout(
        () =>
          fail(
            new Error(
              `Timed-out turn ${turnId} did not prove terminal command completion after interruption`,
            ),
          ),
        this.turnTerminationTimeoutMs,
      )
      timeoutInterruption = this.interruptTurn(threadId, turnId).catch((error) => {
        fail(
          new Error(
            `Failed to interrupt timed-out turn ${turnId}: ${error.message}`,
          ),
        )
      })
    }
    const scheduleOwnerStopFallback = () => {
      clearTimeout(ownerStopTimer)
      ownerStopTimer = setTimeout(
        () =>
          complete({
            status: "needs_owner",
            turn: { id: turnId, status: "interrupted", items: [] },
            pendingOwnerRequest,
            agentMessage,
            commandExecutions: completedCommandExecutions,
          }),
        5_000,
      )
    }
    const onItemStarted = (params) => {
      if (params?.threadId !== threadId) return
      if (turnId && params?.turnId !== turnId) return
      if (params.item?.type === "commandExecution" && params.item.id) {
        activeCommandExecutions.add(params.item.id)
        commandExecutionItems.set(params.item.id, params.item)
      }
      if (params.item?.type === "mcpToolCall") {
        mcpToolCalls.set(params.item.id, params.item)
      }
    }
    const finishTurn = (turn) => {
      const completedTurn = turnTimedOut
        ? {
            ...turn,
            status: "failed",
            error: { message: `Turn timed out after ${timeoutMs}ms` },
          }
        : turn
      complete({
        status: pendingOwnerRequest ? "needs_owner" : completedTurn.status,
        turn: completedTurn,
        pendingOwnerRequest,
        agentMessage: agentMessage || finalAgentMessageFromTurn(completedTurn),
        commandExecutions: completedCommandExecutions,
      })
    }
    const onItemCompleted = (params) => {
      if (params?.threadId !== threadId) return
      if (turnId && params?.turnId !== turnId) return
      if (params.item?.type === "agentMessage") agentMessage = params.item.text ?? ""
      if (commandExecutionIsTerminal(params.item) && params.item.id) {
        activeCommandExecutions.delete(params.item.id)
        commandExecutionItems.delete(params.item.id)
        completedCommandExecutions.push(compactCommandExecution(params.item))
      }
      if (params.item?.type === "mcpToolCall") mcpToolCalls.delete(params.item.id)
      const approved = approvedItems.get(params.item?.id)
      if (approved) {
        approvedItems.delete(params.item.id)
        approvedActionPersistence = approvedActionPersistence.then(() =>
          onApprovedActionCompleted({
            ...approved,
            item: params.item,
            succeeded: approvedItemSucceeded(params.item),
          }),
        )
      }
      if (interruptedTurnCompletion && activeCommandExecutions.size === 0) {
        finishTurn(interruptedTurnCompletion)
      }
    }
    const onTurnCompleted = (params) => {
      if (params?.threadId !== threadId || params?.turn?.id !== turnId) return
      if (turnTimedOut && activeCommandExecutions.size > 0) {
        interruptedTurnCompletion = params.turn
        return
      }
      finishTurn(params.turn)
    }
    const stopForOwner = async (message, ownerRequest) => {
      pendingOwnerRequest = ownerRequest
      ownerStopPersistence = ownerStopPersistence.then(() =>
        onOwnerStop(pendingOwnerRequest),
      )
      await ownerStopPersistence
      const response = ownerStopResponse(message)
      let requestResolved = false
      if (response) {
        try {
          this.respond(message.id, response)
          requestResolved = true
          Promise.resolve(
            this.eventSink({
              type: "server_request_owner_stopped",
              message: compactProtocolMessage(message),
            }),
          ).catch(() => {})
        } catch (error) {
          pendingOwnerRequest = {
            ...ownerRequest,
            reason: `Failed to cancel owner-gated server request: ${error.message}`,
          }
          ownerStopPersistence = ownerStopPersistence.then(() =>
            onOwnerStop(pendingOwnerRequest),
          )
          await ownerStopPersistence
        }
      }
      const responseInterruptsTurn =
        requestResolved &&
        message.method === "item/commandExecution/requestApproval"
      if (!responseInterruptsTurn && turnId) {
        void this.request("turn/interrupt", { threadId, turnId }).catch(() => {})
      }
      scheduleOwnerStopFallback()
    }
    const handleServerRequest = async (message) => {
      const ownerRequest = classifyServerRequest(
        message,
        message.method === "mcpServer/elicitation/request"
          ? matchingMcpToolCall(message, mcpToolCalls)
          : null,
      )
      if (!ownerRequest || ownerRequest.threadId !== threadId) return
      if (turnId && ownerRequest.turnId && ownerRequest.turnId !== turnId) return
      if (!turnId && ownerRequest.turnId) turnId = ownerRequest.turnId
      let matchedResponse = null
      try {
        matchedResponse = ownerRequest
          ? await resolveApprovalRequest(ownerRequest, {
              commandExecution: ownerRequest.itemId
                ? commandExecutionItems.get(ownerRequest.itemId) ?? null
                : null,
            })
          : null
      } catch (error) {
        await stopForOwner(message, {
          ...ownerRequest,
          reason: `Failed to consume a matched owner decision: ${error.message}`,
        })
        return
      }
      const matchedResolution = matchedResponse?.response
        ? matchedResponse
        : matchedResponse
          ? { response: matchedResponse, decisionId: null }
          : null
      const autoResponse =
        matchedResolution?.response ??
        autoResponseForBoundedElicitation(message, prompt) ??
        autoResponseForBoundedCommandApproval(message, prompt)
      if (autoResponse) {
        try {
          this.respond(message.id, autoResponse)
          if (matchedResolution?.decisionId && ownerRequest.itemId) {
            approvedItems.set(ownerRequest.itemId, {
              decisionId: matchedResolution.decisionId,
              ownerRequest,
            })
          }
          Promise.resolve(
            this.eventSink({
              type: "server_request_auto_resolved",
              message: compactProtocolMessage(message),
            }),
          ).catch(() => {})
        } catch (error) {
          await stopForOwner(message, {
            ...classifyServerRequest(message),
            reason: `Failed to resolve approved server request: ${error.message}`,
          })
        }
        return
      }

      await stopForOwner(message, ownerRequest)
    }
    const onServerRequest = (message) => {
      const requestKey = `${message?.method ?? "unknown"}:${String(message?.id)}`
      if (handledServerRequestIds.has(requestKey)) {
        Promise.resolve(
          this.eventSink({
            type: "duplicate_server_request_ignored",
            message: compactProtocolMessage(message),
          }),
        ).catch(() => {})
        return
      }
      handledServerRequestIds.add(requestKey)
      void handleServerRequest(message)
    }
    const timeout = setTimeout(() => {
      turnTimedOut = true
      interruptTimedOutTurn()
    }, timeoutMs)
    const cleanup = () => {
      clearTimeout(timeout)
      clearTimeout(ownerStopTimer)
      clearTimeout(turnTerminationTimer)
      this.off("item/started", onItemStarted)
      this.off("item/completed", onItemCompleted)
      this.off("turn/completed", onTurnCompleted)
      this.off("server_request", onServerRequest)
    }

    this.on("item/started", onItemStarted)
    this.on("item/completed", onItemCompleted)
    this.on("turn/completed", onTurnCompleted)
    this.on("server_request", onServerRequest)

    try {
      const response = await this.request(
        "turn/start",
        {
          threadId,
          cwd,
          input: [{ type: "text", text: prompt, text_elements: [] }],
          ...(approvalPolicy ? { approvalPolicy } : {}),
        },
        60_000,
      )
      turnId = response.turn.id
      await onTurnStarted(turnId)
      if (turnTimedOut) interruptTimedOutTurn()
    } catch (error) {
      cleanup()
      throw error
    }

    return terminal.promise
  }

  async stop() {
    if (!this.process) return
    const child = this.process
    child.kill("SIGTERM")
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) =>
        setTimeout(() => {
          if (child.exitCode === null) child.kill("SIGKILL")
          resolve()
        }, 5_000),
      ),
    ])
  }
}
