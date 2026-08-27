import assert from "node:assert/strict"
import test from "node:test"
import {
  AppServerClient,
  appServerTurnFailureFromMessage,
  autoResponseForBoundedCommandApproval,
  autoResponseForBoundedElicitation,
  classifyServerRequest,
} from "../src/app-server.mjs"

function deferredBarrier() {
  let resolve
  const promise = new Promise((resolve_) => {
    resolve = resolve_
  })
  return { promise, resolve }
}

async function runBlockedTerminalOrderingRace(iteration) {
  const suffix = String(iteration)
  const threadId = `thread-terminal-order-${suffix}`
  const turnId = `turn-terminal-order-${suffix}`
  const failureSinkEntered = deferredBarrier()
  const releaseFailureSink = deferredBarrier()
  const events = []
  const persisted = []
  const dispatches = []
  const client = new AppServerClient({
    cwd: "/tmp",
    eventSink: async (event) => {
      events.push(event)
      if (event.type === "turn_failed") {
        failureSinkEntered.resolve()
        await releaseFailureSink.promise
      }
    },
  })
  client.request = async (method) => {
    assert.equal(method, "turn/start")
    dispatches.push(
      client.dispatchProtocolMessage({
        method: "error",
        params: {
          threadId,
          turnId,
          willRetry: false,
          error: { codexErrorInfo: "cyberPolicy" },
        },
      }),
      client.dispatchProtocolMessage({
        method: "turn/completed",
        params: {
          threadId,
          turn: { id: turnId, status: "failed", items: [] },
        },
      }),
    )
    return { turn: { id: turnId } }
  }

  let settled = false
  const terminal = client
    .runTurn({
      threadId,
      prompt: "Read-only review.",
      cwd: "/tmp",
      timeoutMs: 2_000,
      onTurnFailed: async (failure) => persisted.push(failure),
    })
    .then((result) => {
      settled = true
      return result
    })

  await failureSinkEntered.promise
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(settled, false, "completion overtook durable failure persistence")
  releaseFailureSink.resolve()
  const result = await terminal
  await Promise.all(dispatches)

  assert.equal(result.status, "failed")
  assert.equal(result.turn.id, turnId)
  assert.equal(result.appServerFailure.threadId, threadId)
  assert.equal(result.appServerFailure.turnId, turnId)
  assert.equal(result.appServerFailure.codexErrorInfo, "cyberPolicy")
  assert.equal(result.appServerFailure.willRetry, false)
  assert.equal(result.retryable, false)
  assert.equal(persisted.length, 1)
  assert.equal(events.filter((event) => event.type === "turn_failed").length, 1)
}

async function runBlockedCompletionFirstOrderingRace(iteration) {
  const suffix = String(iteration)
  const threadId = `thread-completion-first-${suffix}`
  const turnId = `turn-completion-first-${suffix}`
  const failureSinkEntered = deferredBarrier()
  const releaseFailureSink = deferredBarrier()
  const events = []
  const persisted = []
  const dispatches = []
  const client = new AppServerClient({
    cwd: "/tmp",
    eventSink: async (event) => {
      events.push(event)
      if (event.type === "turn_failed") {
        failureSinkEntered.resolve()
        await releaseFailureSink.promise
      }
    },
  })
  client.request = async (method) => {
    assert.equal(method, "turn/start")
    dispatches.push(
      client.dispatchProtocolMessage({
        method: "turn/completed",
        params: {
          threadId,
          turn: { id: turnId, status: "failed", items: [] },
        },
      }),
    )
    await new Promise((resolve) => setTimeout(resolve, 5))
    dispatches.push(
      client.dispatchProtocolMessage({
        method: "error",
        params: {
          threadId,
          turnId,
          willRetry: false,
          error: { codexErrorInfo: "cyberPolicy" },
        },
      }),
    )
    return { turn: { id: turnId } }
  }

  let settled = false
  const terminal = client
    .runTurn({
      threadId,
      prompt: "Read-only completion-first review.",
      cwd: "/tmp",
      timeoutMs: 2_000,
      onTurnFailed: async (failure) => persisted.push(failure),
    })
    .then((result) => {
      settled = true
      return result
    })

  await failureSinkEntered.promise
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(settled, false, "provisional completion settled before failure")
  releaseFailureSink.resolve()
  const result = await terminal
  await Promise.all(dispatches)

  assert.equal(result.status, "failed")
  assert.equal(result.turn.id, turnId)
  assert.equal(result.appServerFailure.threadId, threadId)
  assert.equal(result.appServerFailure.turnId, turnId)
  assert.equal(result.appServerFailure.codexErrorInfo, "cyberPolicy")
  assert.equal(result.appServerFailure.willRetry, false)
  assert.equal(result.retryable, false)
  assert.equal(persisted.length, 1)
  assert.equal(events.filter((event) => event.type === "turn_failed").length, 1)
}

test("a terminal AppServer error is redacted and never enters EventEmitter's error channel", async () => {
  const events = []
  const persisted = []
  const client = new AppServerClient({
    cwd: "/tmp",
    eventSink: async (event) => events.push(event),
  })
  client.request = async (method) => {
    assert.equal(method, "turn/start")
    queueMicrotask(() =>
      client.dispatchProtocolMessage({
        method: "error",
        params: {
          threadId: "thread-cyber-policy",
          turnId: "turn-cyber-policy",
          willRetry: false,
          error: {
            codexErrorInfo: "cyberPolicy",
            message: "Bearer secret-value must never persist",
            sensitivePayload: { token: "ghp_not-for-logs" },
          },
        },
      }),
    )
    return { turn: { id: "turn-cyber-policy" } }
  }

  const result = await client.runTurn({
    threadId: "thread-cyber-policy",
    prompt: "Read-only review.",
    cwd: "/tmp",
    timeoutMs: 1_000,
    onTurnFailed: async (failure) => persisted.push(failure),
  })

  assert.equal(result.status, "failed")
  assert.equal(result.turn.id, "turn-cyber-policy")
  assert.equal(result.retryable, false)
  assert.equal(persisted.length, 1)
  assert.deepEqual(events, [
    {
      type: "turn_failed",
      eventId:
        "turn_failed:thread-cyber-policy:turn-cyber-policy",
      errorClass: "AppServerTurnError",
      code: "APP_SERVER_TURN_ERROR",
      category: "cyberPolicy",
      codexErrorInfo: "cyberPolicy",
      willRetry: false,
      threadId: "thread-cyber-policy",
      turnId: "turn-cyber-policy",
    },
  ])
  assert.doesNotMatch(JSON.stringify({ events, result }), /secret-value|ghp_/)
  await client.dispatchProtocolMessage({
    method: "error",
    params: {
      threadId: "thread-cyber-policy",
      turnId: "turn-cyber-policy",
      willRetry: false,
      error: { codexErrorInfo: "cyberPolicy" },
    },
  })
  assert.equal(events.length, 1)
  await assert.rejects(
    client.dispatchProtocolMessage({
      method: "error",
      params: {
        threadId: "thread-cyber-policy",
        turnId: "turn-cyber-policy",
        willRetry: true,
        error: { codexErrorInfo: "cyberPolicy" },
      },
    }),
    (error) => error.code === "APP_SERVER_TURN_FAILURE_CONFLICT",
  )
})

test("terminal AppServer failure persistence cannot be overtaken by failed completion", async () => {
  await runBlockedTerminalOrderingRace("single")
})

test("terminal AppServer ordering never returns a bare failed result across 100 races", async () => {
  for (let iteration = 0; iteration < 100; iteration += 1) {
    await runBlockedTerminalOrderingRace(iteration)
  }
})

test("completion-first authoritative failures dominate across 100 blocked races", async () => {
  for (let iteration = 0; iteration < 100; iteration += 1) {
    await runBlockedCompletionFirstOrderingRace(iteration)
  }
})

test("turn-start durability blocks later terminal protocol dispatch", async () => {
  const startPersistenceEntered = deferredBarrier()
  const releaseStartPersistence = deferredBarrier()
  let failurePersisted = false
  const dispatches = []
  const client = new AppServerClient({
    cwd: "/tmp",
    eventSink: async (event) => {
      if (event.type === "turn_failed") failurePersisted = true
    },
  })
  client.process = {
    stdin: {
      writable: true,
      write(line) {
        const request = JSON.parse(line)
        dispatches.push(
          client.dispatchProtocolMessage({
            id: request.id,
            result: { turn: { id: "turn-start-barrier" } },
          }),
          client.dispatchProtocolMessage({
            method: "error",
            params: {
              threadId: "thread-start-barrier",
              turnId: "turn-start-barrier",
              willRetry: false,
              error: { codexErrorInfo: "cyberPolicy" },
            },
          }),
          client.dispatchProtocolMessage({
            method: "turn/completed",
            params: {
              threadId: "thread-start-barrier",
              turn: {
                id: "turn-start-barrier",
                status: "failed",
                items: [],
              },
            },
          }),
        )
      },
    },
  }

  const terminal = client.runTurn({
    threadId: "thread-start-barrier",
    prompt: "Persist the turn before its failure.",
    cwd: "/tmp",
    timeoutMs: 2_000,
    onTurnStarted: async () => {
      startPersistenceEntered.resolve()
      await releaseStartPersistence.promise
    },
  })

  await startPersistenceEntered.promise
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(failurePersisted, false)
  releaseStartPersistence.resolve()
  const result = await terminal
  await Promise.all(dispatches)
  assert.equal(failurePersisted, true)
  assert.equal(result.appServerFailure.willRetry, false)
  assert.equal(result.retryable, false)
})

test("a failed completion without provider retry metadata fails closed", async () => {
  const events = []
  const client = new AppServerClient({
    cwd: "/tmp",
    eventSink: async (event) => events.push(event),
  })
  client.request = async () => {
    void client.dispatchProtocolMessage({
      method: "turn/completed",
      params: {
        threadId: "thread-ambiguous-failure",
        turn: {
          id: "turn-ambiguous-failure",
          status: "failed",
          items: [],
        },
      },
    })
    return { turn: { id: "turn-ambiguous-failure" } }
  }

  const result = await client.runTurn({
    threadId: "thread-ambiguous-failure",
    prompt: "Fail closed.",
    cwd: "/tmp",
    timeoutMs: 1_000,
  })

  assert.equal(result.appServerFailure.codexErrorInfo, "unknown")
  assert.equal(result.appServerFailure.willRetry, false)
  assert.equal(result.retryable, false)
  assert.equal(events.filter((event) => event.type === "turn_failed").length, 1)
  await assert.rejects(
    client.dispatchProtocolMessage({
      method: "turn/completed",
      params: { turn: { id: "turn-invalid", status: "failed" } },
    }),
    (error) => error.code === "APP_SERVER_FAILED_COMPLETION_IDENTITY_INVALID",
  )
})

test("approval evidence suppresses an upstream retry before async decision handling settles", async () => {
  const client = new AppServerClient({ cwd: "/tmp", eventSink: async () => {} })
  client.respond = () => {}
  client.request = async () => {
    setTimeout(() => {
      void client.dispatchProtocolMessage({
        id: 701,
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "thread-approval-failure",
          turnId: "turn-approval-failure",
          itemId: "command-approval-failure",
          reason: "Exact pending action",
        },
      })
      void client.dispatchProtocolMessage({
        method: "error",
        params: {
          threadId: "thread-approval-failure",
          turnId: "turn-approval-failure",
          willRetry: true,
          error: { codexErrorInfo: "transient" },
        },
      })
    }, 0)
    return { turn: { id: "turn-approval-failure" } }
  }

  const result = await client.runTurn({
    threadId: "thread-approval-failure",
    prompt: "Continue only with owner approval.",
    cwd: "/tmp",
    timeoutMs: 1_000,
    resolveApprovalRequest: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
      return { decision: "accept" }
    },
  })

  assert.equal(result.appServerFailure.willRetry, true)
  assert.equal(result.retryable, false)
})

test("protocol method names cannot address reserved EventEmitter channels", async () => {
  const notifications = []
  const protocolEvents = []
  const client = new AppServerClient({
    cwd: "/tmp",
    eventSink: async (event) => protocolEvents.push(event),
  })
  client.on("notification", (message) => notifications.push(message.method))
  let errorEvents = 0
  client.on("error", () => {
    errorEvents += 1
  })

  for (const method of ["error", "newListener", "removeListener"]) {
    await client.dispatchProtocolMessage({ method, params: { arbitrary: true } })
  }

  assert.deepEqual(notifications, ["error", "newListener", "removeListener"])
  assert.equal(errorEvents, 0)
  assert.equal(protocolEvents.length, 3)
  assert.deepEqual(
    protocolEvents.map((event) => event.message.method),
    ["error", "newListener", "removeListener"],
  )
})

test("turn failure normalization requires stable active-turn identity", () => {
  assert.equal(
    appServerTurnFailureFromMessage({
      method: "error",
      params: {
        threadId: "thread\nforged",
        turnId: "turn-1",
        error: { codexErrorInfo: "cyberPolicy" },
      },
    }),
    null,
  )
})

test("upstream retry disposition cannot replay a turn with command evidence", async () => {
  const client = new AppServerClient({ cwd: "/tmp", eventSink: async () => {} })
  client.request = async () => {
    setTimeout(async () => {
      client.emit("item/started", {
        threadId: "thread-command-failure",
        turnId: "turn-command-failure",
        item: {
          id: "command-1",
          type: "commandExecution",
          status: "inProgress",
        },
      })
      client.emit("item/completed", {
        threadId: "thread-command-failure",
        turnId: "turn-command-failure",
        item: {
          id: "command-1",
          type: "commandExecution",
          status: "completed",
          exitCode: 0,
        },
      })
      await client.dispatchProtocolMessage({
        method: "error",
        params: {
          threadId: "thread-command-failure",
          turnId: "turn-command-failure",
          willRetry: true,
          error: { codexErrorInfo: "transient" },
        },
      })
    }, 0)
    return { turn: { id: "turn-command-failure" } }
  }

  const result = await client.runTurn({
    threadId: "thread-command-failure",
    prompt: "Run once.",
    cwd: "/tmp",
    timeoutMs: 1_000,
  })
  assert.equal(result.appServerFailure.willRetry, true)
  assert.equal(result.retryable, false)
  assert.equal(result.commandExecutions.length, 1)
})

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

test("a bounded turn exposes its exact command context without changing ordinary turn policy", async () => {
  const bounded = new AppServerClient({ cwd: "/tmp/workspace" })
  const requests = []
  const responses = []
  bounded.respond = (requestId, result) => {
    responses.push({ requestId, result })
    setTimeout(() => {
      bounded.emit("item/completed", {
        threadId: "thread-bounded",
        turnId: "turn-bounded",
        item: {
          id: "exec-bounded",
          type: "commandExecution",
          status: "completed",
          exitCode: 0,
        },
      })
      bounded.emit("turn/completed", {
        threadId: "thread-bounded",
        turn: { id: "turn-bounded", status: "completed", items: [] },
      })
    }, 0)
  }
  bounded.request = async (method, params) => {
    assert.equal(method, "turn/start")
    requests.push(params)
    setTimeout(() => {
      bounded.emit("item/started", {
        threadId: "thread-bounded",
        turnId: "turn-bounded",
        item: {
          id: "exec-bounded",
          type: "commandExecution",
          source: "agent",
          status: "inProgress",
          cwd: "/tmp/workspace",
          command: "git cherry-pick abcdef",
        },
      })
      bounded.emit("server_request", {
        id: 92,
        method: "item/permissions/requestApproval",
        params: {
          threadId: "thread-bounded",
          turnId: "turn-bounded",
          itemId: "exec-bounded",
          cwd: "/tmp/workspace",
          permissions: { fileSystem: { write: ["/tmp/gitdir"] } },
        },
      })
    }, 0)
    return { turn: { id: "turn-bounded" } }
  }

  const result = await bounded.runTurn({
    threadId: "thread-bounded",
    prompt: "Run the exact bounded command.",
    cwd: "/tmp/workspace",
    timeoutMs: 1_000,
    approvalPolicy: "on-request",
    resolveApprovalRequest: async (request_, { commandExecution }) => {
      assert.equal(request_.method, "item/permissions/requestApproval")
      assert.equal(commandExecution.command, "git cherry-pick abcdef")
      assert.equal(commandExecution.cwd, "/tmp/workspace")
      return {
        response: {
          permissions: request_.details.permissions,
          scope: "turn",
        },
      }
    },
  })
  assert.equal(result.status, "completed")
  assert.equal(requests[0].approvalPolicy, "on-request")
  assert.deepEqual(responses, [
    {
      requestId: 92,
      result: {
        permissions: { fileSystem: { write: ["/tmp/gitdir"] } },
        scope: "turn",
      },
    },
  ])

  const ordinary = new AppServerClient({ cwd: "/tmp/workspace" })
  let ordinaryParams = null
  ordinary.request = async (_method, params) => {
    ordinaryParams = params
    setTimeout(
      () =>
        ordinary.emit("turn/completed", {
          threadId: "thread-ordinary",
          turn: { id: "turn-ordinary", status: "completed", items: [] },
        }),
      0,
    )
    return { turn: { id: "turn-ordinary" } }
  }
  await ordinary.runTurn({
    threadId: "thread-ordinary",
    prompt: "Run an ordinary task.",
    cwd: "/tmp/workspace",
    timeoutMs: 1_000,
  })
  assert.equal(Object.hasOwn(ordinaryParams, "approvalPolicy"), false)
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

test("completed turns return the final agent message and compact command evidence", async () => {
  const client = new AppServerClient({ cwd: "/tmp" })
  client.request = async (method) => {
    if (method !== "turn/start") throw new Error(`Unexpected request: ${method}`)
    setTimeout(() => {
      client.emit("item/completed", {
        threadId: "thread-result",
        turnId: "turn-result",
        item: {
          id: "command-result",
          type: "commandExecution",
          command: "npm run lint",
          status: "completed",
          exitCode: 0,
          aggregatedOutput: "output intentionally not persisted",
        },
      })
      client.emit("item/completed", {
        threadId: "thread-result",
        turnId: "turn-result",
        item: {
          id: "message-result",
          type: "agentMessage",
          text: "ESLint: passed",
        },
      })
      client.emit("turn/completed", {
        threadId: "thread-result",
        turn: { id: "turn-result", status: "completed", items: [] },
      })
    }, 0)
    return { turn: { id: "turn-result" } }
  }

  const result = await client.runTurn({
    threadId: "thread-result",
    prompt: "Return the completed result.",
    cwd: "/tmp",
    timeoutMs: 1_000,
  })

  assert.equal(result.agentMessage, "ESLint: passed")
  assert.deepEqual(result.commandExecutions, [
    {
      id: "command-result",
      command: "npm run lint",
      status: "completed",
      exitCode: 0,
    },
  ])
  assert.equal("aggregatedOutput" in result.commandExecutions[0], false)
})
