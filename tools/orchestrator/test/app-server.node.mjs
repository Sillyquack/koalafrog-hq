import assert from "node:assert/strict"
import test from "node:test"
import {
  AppServerClient,
  autoResponseForBoundedCommandApproval,
  autoResponseForBoundedElicitation,
  classifyServerRequest,
  inspectTurnCommandQuiescence,
} from "../src/app-server.mjs"

const approvedPrompt = `
Owner approval remains granted for the bounded repository write needed to finish this review: create the Git tree/commit for the existing Issue #54 review changes and push that commit to the existing branch.
`

const approvedOrchestratorPrompt = `
Owner approval is explicitly granted to use the audited Issue #53 orchestrator implementation stack as the implementation basis on the existing isolated fix branch.
`

function elicitation(message) {
  return {
    id: 7,
    method: "mcpServer/elicitation/request",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      message,
    },
  }
}

function commandApproval(reason) {
  return {
    id: 8,
    method: "item/commandExecution/requestApproval",
    params: {
      threadId: "thread-1",
      turnId: "turn-1",
      itemId: "exec-1",
      reason,
    },
  }
}

test("bounded GitHub tree approval is auto-accepted only with explicit owner approval", () => {
  assert.deepEqual(
    autoResponseForBoundedElicitation(
      elicitation("Allow GitHub to create a Git tree?"),
      approvedPrompt,
    ),
    { action: "accept", content: {} },
  )
  assert.equal(
    autoResponseForBoundedElicitation(
      elicitation("Allow GitHub to create a Git tree?"),
      "Continue the review.",
    ),
    null,
  )
})

test("bounded approval does not cover unrelated or dangerous GitHub actions", () => {
  assert.equal(
    autoResponseForBoundedElicitation(
      elicitation("Allow GitHub to merge pull request #99?"),
      approvedPrompt,
    ),
    null,
  )
  assert.equal(
    autoResponseForBoundedElicitation(
      elicitation("Allow GitHub to delete the default branch?"),
      approvedPrompt,
    ),
    null,
  )
  assert.equal(
    autoResponseForBoundedElicitation(
      elicitation('Allow Supabase to run tool "supabase.execute_sql"?'),
      approvedPrompt,
    ),
    null,
  )
})

test("bounded audited orchestrator command is accepted only after matching owner approval", () => {
  assert.deepEqual(
    autoResponseForBoundedCommandApproval(
      commandApproval(
        "Apply the explicitly owner-approved audited Issue #53 orchestrator implementation stack to this isolated fix branch?",
      ),
      approvedOrchestratorPrompt,
    ),
    { decision: "accept" },
  )
  assert.equal(
    autoResponseForBoundedCommandApproval(
      commandApproval(
        "Apply the explicitly owner-approved audited Issue #53 orchestrator implementation stack to this isolated fix branch?",
      ),
      "Continue the fix.",
    ),
    null,
  )
})

test("bounded command approval does not authorize unrelated escalations", () => {
  for (const reason of [
    "Allow local Supabase type generation to read the Docker socket so I can verify and refresh the checked-in database contracts?",
    "Allow deployment to production?",
    "Allow reading a secret token?",
    "Allow force-pushing main?",
  ]) {
    assert.equal(
      autoResponseForBoundedCommandApproval(
        commandApproval(reason),
        approvedOrchestratorPrompt,
      ),
      null,
    )
  }
})

test("a matched durable decision responds through requestApproval exactly once", async () => {
  const client = new AppServerClient({ cwd: "/tmp" })
  const responses = []
  const ownerStops = []
  let decisionCalls = 0
  client.respond = (requestId, result) => {
    responses.push({ requestId, result })
    setTimeout(
      () =>
        client.emit("turn/completed", {
          threadId: "thread-approved",
          turn: { id: "turn-approved", status: "completed", items: [] },
        }),
      0,
    )
  }
  client.request = async (method) => {
    if (method !== "turn/start") throw new Error(`Unexpected request: ${method}`)
    setTimeout(() => {
      const request_ = {
        id: 88,
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "thread-approved",
          turnId: "turn-approved",
          itemId: "exec-approved",
          reason: "Exact pending action",
        },
      }
      client.emit("server_request", request_)
      client.emit("server_request", request_)
    }, 0)
    return { turn: { id: "turn-approved" } }
  }

  const result = await client.runTurn({
    threadId: "thread-approved",
    prompt: "Continue only after the durable decision matches.",
    cwd: "/tmp",
    timeoutMs: 1_000,
    onOwnerStop: async (request_) => ownerStops.push(request_),
    resolveApprovalRequest: async (request_) => {
      decisionCalls += 1
      assert.equal(request_.reason, "Exact pending action")
      return { decision: "accept" }
    },
  })

  assert.equal(result.status, "completed")
  assert.equal(decisionCalls, 1)
  assert.deepEqual(responses, [
    { requestId: 88, result: { decision: "accept" } },
  ])
  assert.deepEqual(ownerStops, [])
})

test("an unmatched command approval is persisted before cancel resolves its turn", async () => {
  const client = new AppServerClient({ cwd: "/tmp" })
  const order = []
  const persisted = []
  client.respond = (requestId, result) => {
    order.push(`respond:${requestId}:${result.decision}`)
    setTimeout(
      () =>
        client.emit("turn/completed", {
          threadId: "thread-owner-stop",
          turn: { id: "turn-owner-stop", status: "interrupted", items: [] },
        }),
      0,
    )
  }
  client.request = async (method) => {
    if (method !== "turn/start") {
      throw new Error(`Unexpected request after command cancel: ${method}`)
    }
    setTimeout(
      () =>
        client.emit("server_request", {
          id: 91,
          method: "item/commandExecution/requestApproval",
          params: {
            threadId: "thread-owner-stop",
            turnId: "turn-owner-stop",
            itemId: "exec-owner-stop",
            reason: "Exact pending owner action",
          },
        }),
      0,
    )
    return { turn: { id: "turn-owner-stop" } }
  }

  const result = await client.runTurn({
    threadId: "thread-owner-stop",
    prompt: "Stop for an unmatched owner action.",
    cwd: "/tmp",
    timeoutMs: 1_000,
    onOwnerStop: async (request_) => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      persisted.push(request_)
      order.push("persisted")
    },
  })

  assert.equal(result.status, "needs_owner")
  assert.deepEqual(order, ["persisted", "respond:91:cancel"])
  assert.deepEqual(
    {
      requestId: persisted[0].requestId,
      method: persisted[0].method,
      threadId: persisted[0].threadId,
      turnId: persisted[0].turnId,
      itemId: persisted[0].itemId,
      reason: persisted[0].reason,
    },
    {
      requestId: 91,
      method: "item/commandExecution/requestApproval",
      threadId: "thread-owner-stop",
      turnId: "turn-owner-stop",
      itemId: "exec-owner-stop",
      reason: "Exact pending owner action",
    },
  )
})

test("nested elicitation messages remain visible to owner classification", () => {
  const request = {
    id: 9,
    method: "mcpServer/elicitation/request",
    params: {
      threadId: "thread-1",
      request: { message: "Allow GitHub to create a Git tree?" },
    },
  }
  assert.equal(
    classifyServerRequest(request).reason,
    "Allow GitHub to create a Git tree?",
  )
})

test("MCP elicitation captures redacted tool details from the active MCP item", () => {
  const request = classifyServerRequest(
    {
      id: 0,
      method: "mcpServer/elicitation/request",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        serverName: "Supabase",
        mode: "form",
        message: 'Allow Supabase to run tool "supabase.execute_sql"?',
        requestedSchema: { type: "object" },
      },
    },
    {
      id: "mcp-1",
      type: "mcpToolCall",
      server: "supabase",
      tool: "execute_sql",
      arguments: {
        query: "select id from public.workspaces limit 1",
        password: "do-not-expose",
      },
    },
  )

  assert.equal(request.requestId, 0)
  assert.equal(request.method, "mcpServer/elicitation/request")
  assert.equal(request.serverName, "Supabase")
  assert.equal(request.toolName, "supabase.execute_sql")
  assert.equal(request.arguments.query, "select id from public.workspaces limit 1")
  assert.equal(request.arguments.password, "[redacted]")
  assert.deepEqual(request.details.requestedSchema, { type: "object" })
})

test("issue #56 waiting MCP approval is cancelled and returned as needs_owner", async () => {
  const client = new AppServerClient({ cwd: "/tmp" })
  const responses = []
  const ownerStops = []
  let startedTurns = 0

  client.respond = (requestId, result) => responses.push({ requestId, result })
  client.request = async (method) => {
    if (method === "turn/start") {
      client.emit("item/started", {
        threadId: "thread-56",
        turnId: "turn-56",
        item: {
          id: "mcp-56",
          type: "mcpToolCall",
          server: "supabase",
          tool: "execute_sql",
          status: "inProgress",
          arguments: {
            query: "select id from public.workspaces limit 1",
            authorization: "Bearer visible-token",
          },
        },
      })
      client.emit("server_request", {
        id: 56,
        method: "mcpServer/elicitation/request",
        params: {
          threadId: "thread-56",
          turnId: "turn-56",
          serverName: "Supabase",
          mode: "form",
          message: 'Allow Supabase to run tool "supabase.execute_sql"?',
          requestedSchema: { type: "object" },
        },
      })
      client.emit("thread/status/changed", {
        threadId: "thread-56",
        status: { type: "active", activeFlags: ["waitingOnApproval"] },
      })
      return { turn: { id: "turn-56" } }
    }
    if (method === "turn/interrupt") {
      setTimeout(
        () =>
          client.emit("turn/completed", {
            threadId: "thread-56",
            turn: { id: "turn-56", status: "interrupted", items: [] },
          }),
        0,
      )
      return {}
    }
    throw new Error(`Unexpected request: ${method}`)
  }

  const result = await client.runTurn({
    threadId: "thread-56",
    prompt: "Diagnose issue #56 without production writes.",
    cwd: "/tmp",
    timeoutMs: 1_000,
    onTurnStarted: async () => {
      startedTurns += 1
    },
    onOwnerStop: async (request) => {
      ownerStops.push(request)
    },
  })

  assert.equal(startedTurns, 1)
  assert.equal(result.status, "needs_owner")
  assert.deepEqual(responses, [
    { requestId: 56, result: { action: "cancel", content: null } },
  ])
  assert.equal(ownerStops.length, 1)
  assert.equal(result.pendingOwnerRequest.method, "mcpServer/elicitation/request")
  assert.equal(result.pendingOwnerRequest.toolName, "supabase.execute_sql")
  assert.equal(
    result.pendingOwnerRequest.arguments.query,
    "select id from public.workspaces limit 1",
  )
  assert.equal(result.pendingOwnerRequest.arguments.authorization, "[redacted]")
})

test("an interrupted turn waits for its running command before a retry turn starts", async () => {
  const lifecycle = []
  const protocolEvents = []
  const client = new AppServerClient({
    cwd: "/tmp",
    commandQuiescenceTimeoutMs: 500,
    eventSink: (event) => protocolEvents.push(event),
  })
  let starts = 0
  client.request = async (method) => {
    assert.equal(method, "turn/start")
    starts += 1
    const turnId = starts === 1 ? "turn-interrupted" : "turn-retry"
    lifecycle.push(`start:${turnId}`)
    if (starts === 1) {
      setTimeout(() => {
        client.emit("item/started", {
          threadId: "thread-63",
          turnId,
          item: {
            id: "exec-still-running",
            type: "commandExecution",
            status: "inProgress",
          },
        })
        lifecycle.push("command:started")
      }, 0)
      setTimeout(() => {
        client.emit("turn/completed", {
          threadId: "thread-63",
          turn: { id: turnId, status: "interrupted", items: [] },
        })
        lifecycle.push("turn:interrupted")
      }, 5)
      setTimeout(() => {
        client.emit("item/commandExecution/terminalInteraction", {
          threadId: "thread-63",
          turnId,
          itemId: "exec-still-running",
        })
        lifecycle.push("command:terminal-interaction")
      }, 15)
      setTimeout(() => {
        client.emit("item/completed", {
          threadId: "thread-63",
          turnId,
          item: {
            id: "exec-still-running",
            type: "commandExecution",
            status: "completed",
          },
        })
        lifecycle.push("command:completed")
      }, 40)
    } else {
      setTimeout(
        () =>
          client.emit("turn/completed", {
            threadId: "thread-63",
            turn: { id: turnId, status: "completed", items: [] },
          }),
        0,
      )
    }
    return { turn: { id: turnId } }
  }

  const interrupted = await client.runTurn({
    threadId: "thread-63",
    prompt: "First attempt",
    cwd: "/tmp",
    timeoutMs: 1_000,
  })
  const retry = await client.runTurn({
    threadId: "thread-63",
    prompt: "Retry only after quiescence",
    cwd: "/tmp",
    timeoutMs: 1_000,
  })

  assert.equal(interrupted.status, "interrupted")
  assert.equal(interrupted.commandQuiescence.proven, true)
  assert.equal(retry.status, "completed")
  assert.ok(
    lifecycle.indexOf("command:completed") <
      lifecycle.indexOf("start:turn-retry"),
  )
  assert.ok(
    protocolEvents.some((event) => event.type === "command_quiescence_wait_started"),
  )
  assert.ok(
    protocolEvents.some((event) => event.type === "command_quiescence_proven"),
  )
})

test("an interrupted turn fails closed when command quiescence cannot be proven", async () => {
  const events = []
  const client = new AppServerClient({
    cwd: "/tmp",
    commandQuiescenceTimeoutMs: 20,
    eventSink: (event) => events.push(event),
  })
  client.request = async (method) => {
    assert.equal(method, "turn/start")
    setTimeout(() => {
      client.emit("item/started", {
        threadId: "thread-blocked",
        turnId: "turn-blocked",
        item: {
          id: "exec-never-terminal",
          type: "commandExecution",
          status: "inProgress",
        },
      })
      client.emit("turn/completed", {
        threadId: "thread-blocked",
        turn: { id: "turn-blocked", status: "interrupted", items: [] },
      })
    }, 0)
    return { turn: { id: "turn-blocked" } }
  }

  const result = await client.runTurn({
    threadId: "thread-blocked",
    prompt: "Do not overlap a retry.",
    cwd: "/tmp",
    timeoutMs: 1_000,
  })

  assert.equal(result.status, "failed")
  assert.equal(result.retrySafe, false)
  assert.deepEqual(result.commandQuiescence.outstandingCommandIds, [
    "exec-never-terminal",
  ])
  assert.match(result.turn.error.message, /retry suppressed/)
  assert.ok(events.some((event) => event.type === "command_quiescence_failed"))
})

test("a timed-out turn cannot retry without terminal turn acknowledgement", async () => {
  const client = new AppServerClient({
    cwd: "/tmp",
    commandQuiescenceTimeoutMs: 20,
  })
  let interrupts = 0
  client.request = async (method) => {
    if (method === "turn/start") return { turn: { id: "turn-no-ack" } }
    if (method === "turn/interrupt") {
      interrupts += 1
      return {}
    }
    throw new Error(`Unexpected request: ${method}`)
  }

  const result = await client.runTurn({
    threadId: "thread-no-ack",
    prompt: "Fail closed if interruption is not acknowledged.",
    cwd: "/tmp",
    timeoutMs: 5,
  })

  assert.equal(interrupts, 1)
  assert.equal(result.status, "failed")
  assert.equal(result.retrySafe, false)
  assert.equal(result.commandQuiescence.turnTerminalAcknowledged, false)
  assert.match(result.turn.error.message, /no terminal turn acknowledgement/)
})

test("restart snapshots distinguish terminal and still-running commands", () => {
  assert.deepEqual(
    inspectTurnCommandQuiescence({
      id: "turn-terminal",
      status: "interrupted",
      items: [
        { id: "exec-complete", type: "commandExecution", status: "completed" },
      ],
    }).proven,
    true,
  )
  assert.deepEqual(
    inspectTurnCommandQuiescence({
      id: "turn-running",
      status: "interrupted",
      items: [
        { id: "exec-running", type: "commandExecution", status: "inProgress" },
      ],
    }).outstandingCommandIds,
    ["exec-running"],
  )
  assert.equal(
    inspectTurnCommandQuiescence({
      id: "turn-ambiguous",
      status: "interrupted",
    }).proven,
    false,
  )
})
