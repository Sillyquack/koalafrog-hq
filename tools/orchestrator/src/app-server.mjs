import { spawn } from "node:child_process"
import { EventEmitter } from "node:events"
import readline from "node:readline"

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

export function classifyServerRequest(message) {
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
  if (!message?.id || !message.method) return null

  const reason =
    message.params?.reason ??
    message.params?.message ??
    message.params?.request?.message ??
    message.params?.questions?.map((question) => question.question).join("; ") ??
    `${ownerMethods.has(message.method) ? "Codex requires owner input" : "The orchestrator cannot safely answer the server request"} for ${message.method}.`
  return {
    requestId: message.id,
    method: message.method,
    threadId: message.params?.threadId ?? null,
    turnId: message.params?.turnId ?? null,
    itemId: message.params?.itemId ?? null,
    reason,
  }
}

const boundedGitHubApprovalMessages = [
  /^Allow GitHub to create a Git tree\?$/i,
  /^Allow GitHub to create a commit\?$/i,
  /^Allow GitHub to (?:create|update) a Git (?:reference|ref)\?$/i,
  /^Allow GitHub to update (?:a|the) Git (?:reference|ref)\?$/i,
  /^Allow GitHub to update .*branch.*\?$/i,
  /^Allow GitHub to push .*branch.*\?$/i,
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

export class AppServerClient extends EventEmitter {
  constructor({
    binary = "codex",
    cwd,
    requestTimeoutMs = 30_000,
    eventSink = () => {},
    stderrSink = () => {},
  }) {
    super()
    this.binary = binary
    this.cwd = cwd
    this.requestTimeoutMs = requestTimeoutMs
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
    onTurnStarted = () => {},
  }) {
    let turnId = null
    let pendingOwnerRequest = null
    let agentMessage = ""
    let settled = false
    const terminal = deferred()

    const complete = (result) => {
      if (settled) return
      settled = true
      cleanup()
      terminal.resolve(result)
    }
    const onItemCompleted = (params) => {
      if (params?.threadId !== threadId || params?.turnId !== turnId) return
      if (params.item?.type === "agentMessage") agentMessage = params.item.text ?? ""
    }
    const onTurnCompleted = (params) => {
      if (params?.threadId !== threadId || params?.turn?.id !== turnId) return
      complete({
        status: pendingOwnerRequest ? "needs_owner" : params.turn.status,
        turn: params.turn,
        pendingOwnerRequest,
        agentMessage,
      })
    }
    const onServerRequest = (message) => {
      const autoResponse = autoResponseForBoundedElicitation(message, prompt)
      if (autoResponse) {
        try {
          this.respond(message.id, autoResponse)
          Promise.resolve(
            this.eventSink({
              type: "server_request_auto_resolved",
              message: compactProtocolMessage(message),
            }),
          ).catch(() => {})
        } catch (error) {
          pendingOwnerRequest = {
            ...classifyServerRequest(message),
            reason: `Failed to resolve approved server request: ${error.message}`,
          }
        }
        return
      }

      const ownerRequest = classifyServerRequest(message)
      if (!ownerRequest || ownerRequest.threadId !== threadId) return
      if (turnId && ownerRequest.turnId && ownerRequest.turnId !== turnId) return
      pendingOwnerRequest = ownerRequest
      if (turnId) {
        void this.request("turn/interrupt", { threadId, turnId }).catch(() => {})
      }
      setTimeout(
        () =>
          complete({
            status: "needs_owner",
            turn: { id: turnId, status: "interrupted", items: [] },
            pendingOwnerRequest,
            agentMessage,
          }),
        5_000,
      )
    }
    const timeout = setTimeout(() => {
      if (turnId) {
        void this.request("turn/interrupt", { threadId, turnId }).catch(() => {})
      }
      complete({
        status: "failed",
        turn: {
          id: turnId,
          status: "failed",
          items: [],
          error: { message: `Turn timed out after ${timeoutMs}ms` },
        },
        pendingOwnerRequest: null,
        agentMessage,
      })
    }, timeoutMs)
    const cleanup = () => {
      clearTimeout(timeout)
      this.off("item/completed", onItemCompleted)
      this.off("turn/completed", onTurnCompleted)
      this.off("server_request", onServerRequest)
    }

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
        },
        60_000,
      )
      turnId = response.turn.id
      await onTurnStarted(turnId)
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
