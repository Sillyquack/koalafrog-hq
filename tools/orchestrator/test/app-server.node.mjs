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

function resolveEvent(eventOrProvider) {
  return typeof eventOrProvider === "function"
    ? eventOrProvider()
    : eventOrProvider
}

async function persistTestEvent(eventOrProvider, events = null) {
  const event = structuredClone(resolveEvent(eventOrProvider))
  if (Array.isArray(events)) events.push(event)
  return { event }
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
    eventSink: (eventOrProvider) => persistTestEvent(eventOrProvider, events),
    turnFailureSink: async (eventId, failureOrProvider, { finalize }) => {
      if (!finalize) return { finalized: false, generation: 1, event: null }
      failureSinkEntered.resolve()
      await releaseFailureSink.promise
      const failure = resolveEvent(failureOrProvider)
      return persistTestEvent(
        {
          type: "turn_failed",
          ...failure,
          terminalGeneration: 2,
          terminalTransactionId: `${eventId}:terminalization:2`,
        },
        events,
      )
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
  assert.equal(result.appServerFailure.terminalGeneration, 2)
  assert.equal(
    result.appServerFailure.terminalTransactionId,
    `turn_failed:${threadId}:${turnId}:terminalization:2`,
  )
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
    eventSink: (eventOrProvider) => persistTestEvent(eventOrProvider, events),
    turnFailureSink: async (eventId, failureOrProvider, { finalize }) => {
      if (!finalize) return { finalized: false, generation: 1, event: null }
      failureSinkEntered.resolve()
      await releaseFailureSink.promise
      const failure = resolveEvent(failureOrProvider)
      return persistTestEvent(
        {
          type: "turn_failed",
          ...failure,
          terminalGeneration: 2,
          terminalTransactionId: `${eventId}:terminalization:2`,
        },
        events,
      )
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
    await failureSinkEntered.promise
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
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(settled, false, "provisional completion settled before failure")
    releaseFailureSink.resolve()
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
  const result = await terminal
  await Promise.all(dispatches)

  assert.equal(result.status, "failed")
  assert.equal(result.turn.id, turnId)
  assert.equal(result.appServerFailure.threadId, threadId)
  assert.equal(result.appServerFailure.turnId, turnId)
  assert.equal(result.appServerFailure.codexErrorInfo, "cyberPolicy")
  assert.equal(result.appServerFailure.willRetry, false)
  assert.equal(result.appServerFailure.terminalGeneration, 2)
  assert.equal(
    result.appServerFailure.terminalTransactionId,
    `turn_failed:${threadId}:${turnId}:terminalization:2`,
  )
  assert.equal(result.retryable, false)
  assert.equal(persisted.length, 1)
  assert.equal(events.filter((event) => event.type === "turn_failed").length, 1)
}

test("a terminal AppServer error is redacted and never enters EventEmitter's error channel", async () => {
  const events = []
  const persisted = []
  const client = new AppServerClient({
    cwd: "/tmp",
    eventSink: (event) => persistTestEvent(event, events),
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
      const persisted = await persistTestEvent(event)
      if (persisted.event.type === "turn_failed") failurePersisted = true
      return persisted
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
    eventSink: (event) => persistTestEvent(event, events),
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
  const client = new AppServerClient({ cwd: "/tmp", eventSink: persistTestEvent })
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
    eventSink: (event) => persistTestEvent(event, protocolEvents),
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

test("authoritative command lifecycle notifications persist before turn listeners consume them", async () => {
  let releasePersistence
  let announcePersistence
  const persistenceEntered = new Promise((resolve) => {
    announcePersistence = resolve
  })
  const persistenceGate = new Promise((resolve) => {
    releasePersistence = resolve
  })
  const events = []
  const client = new AppServerClient({
    cwd: "/tmp",
    eventSink: async (event) => {
      events.push(event)
      announcePersistence()
      await persistenceGate
    },
  })
  let listenerCalls = 0
  client.on("item/completed", () => {
    listenerCalls += 1
  })

  const dispatch = client.dispatchProtocolMessage({
    method: "item/completed",
    params: {
      threadId: "thread-durable-command",
      turnId: "turn-durable-command",
      item: {
        id: "exec-durable-command",
        type: "commandExecution",
        status: "completed",
        exitCode: 7,
      },
    },
  })
  await persistenceEntered
  assert.equal(listenerCalls, 0)
  assert.equal(events[0].message.exitCode, 7)
  releasePersistence()
  await dispatch
  assert.equal(listenerCalls, 1)
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
  const client = new AppServerClient({ cwd: "/tmp", eventSink: persistTestEvent })
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

for (const terminalStatus of ["completed", "failed"]) {
  test(`timeout drain persists authoritative ${terminalStatus} command terminality`, async () => {
    const client = new AppServerClient({
      cwd: "/tmp",
      turnTerminationTimeoutMs: 100,
      commandStartGuardMs: 10,
    })
    const persistedTimeouts = []
    const persistedTerminals = []
    let interrupts = 0
    client.request = async (method) => {
      if (method === "turn/start") {
        setTimeout(
          () =>
            client.emit("item/started", {
              threadId: "thread-timeout-terminal",
              turnId: "turn-timeout-terminal",
              item: {
                id: "exec-timeout-terminal",
                type: "commandExecution",
                command: "node --test",
                status: "inProgress",
              },
            }),
          0,
        )
        return { turn: { id: "turn-timeout-terminal" } }
      }
      if (method === "turn/interrupt") {
        interrupts += 1
        setTimeout(
          () =>
            client.emit("turn/completed", {
              threadId: "thread-timeout-terminal",
              turn: {
                id: "turn-timeout-terminal",
                status: "interrupted",
                items: [],
              },
            }),
          1,
        )
        setTimeout(
          () =>
            client.emit("item/completed", {
              threadId: "thread-timeout-terminal",
              turnId: "turn-timeout-terminal",
              item: {
                id: "exec-timeout-terminal",
                type: "commandExecution",
                command: "node --test",
                status: terminalStatus,
                exitCode: terminalStatus === "completed" ? 0 : 1,
              },
            }),
          15,
        )
        return {}
      }
      throw new Error(`Unexpected request: ${method}`)
    }

    const result = await client.runTurn({
      threadId: "thread-timeout-terminal",
      prompt: "Run a bounded command.",
      cwd: "/tmp",
      timeoutMs: 30,
      onTurnTimedOut: async (observation) => persistedTimeouts.push(observation),
      onCommandTerminal: async (observation) =>
        persistedTerminals.push(observation),
    })

    assert.equal(interrupts, 1)
    assert.equal(result.status, "needs_review")
    assert.equal(result.retryable, false)
    assert.equal(result.turn.id, "turn-timeout-terminal")
    assert.deepEqual(result.timeoutCancellation.itemIds, [
      "exec-timeout-terminal",
    ])
    assert.deepEqual(result.timeoutCancellation.terminalItemIds, [
      "exec-timeout-terminal",
    ])
    assert.deepEqual(result.timeoutCancellation.pendingItemIds, [])
    assert.equal(result.commandExecutions[0].status, terminalStatus)
    assert.equal(persistedTimeouts.length, 1)
    assert.equal(persistedTerminals.length, 1)
  })
}

test("command completion and timeout ordering converges across 100 repetitions each", async () => {
  for (const ordering of ["completion-first", "timeout-first"]) {
    for (let iteration = 0; iteration < 100; iteration += 1) {
      const suffix = `${ordering}-${iteration}`
      const threadId = `thread-timeout-order-${suffix}`
      const turnId = `turn-timeout-order-${suffix}`
      const itemId = `exec-timeout-order-${suffix}`
      const client = new AppServerClient({
        cwd: "/tmp",
        turnTerminationTimeoutMs: 50,
        commandStartGuardMs: 5,
      })
      let terminalWrites = 0
      let interrupts = 0
      client.request = async (method) => {
        if (method === "turn/start") {
          client.emit("item/started", {
            threadId,
            turnId,
            item: {
              id: itemId,
              type: "commandExecution",
              status: "inProgress",
            },
          })
          if (ordering === "completion-first") {
            client.emit("item/completed", {
              threadId,
              turnId,
              item: {
                id: itemId,
                type: "commandExecution",
                status: "completed",
                exitCode: 0,
              },
            })
          }
          return { turn: { id: turnId } }
        }
        if (method === "turn/interrupt") {
          interrupts += 1
          client.emit("turn/completed", {
            threadId,
            turn: { id: turnId, status: "interrupted", items: [] },
          })
          if (ordering === "timeout-first") {
            setTimeout(
              () =>
                client.emit("item/completed", {
                  threadId,
                  turnId,
                  item: {
                    id: itemId,
                    type: "commandExecution",
                    status: "failed",
                    exitCode: 1,
                  },
                }),
              0,
            )
          }
          return {}
        }
        throw new Error(`Unexpected request: ${method}`)
      }

      const result = await client.runTurn({
        threadId,
        prompt: "Converge command completion with timeout.",
        cwd: "/tmp",
        timeoutMs: 30,
        onTurnTimedOut: async () => {},
        onCommandTerminal: async () => {
          terminalWrites += 1
        },
      })

      assert.equal(interrupts, 1)
      assert.equal(result.status, "needs_review")
      assert.equal(result.retryable, false)
      assert.equal(result.commandExecutions.length, 1)
      assert.equal(result.commandExecutions[0].id, itemId)
      assert.deepEqual(result.timeoutCancellation.pendingItemIds, [])
      assert.equal(terminalWrites, ordering === "timeout-first" ? 1 : 0)
    }
  }
})

test("timeout drain persists terminality-pending without fabricating command completion", async () => {
  const client = new AppServerClient({
    cwd: "/tmp",
    turnTerminationTimeoutMs: 25,
    commandStartGuardMs: 5,
  })
  const pending = []
  client.request = async (method) => {
    if (method === "turn/start") {
      setTimeout(
        () =>
          client.emit("item/started", {
            threadId: "thread-timeout-pending",
            turnId: "turn-timeout-pending",
            item: {
              id: "exec-timeout-pending",
              type: "commandExecution",
              status: "inProgress",
            },
          }),
        0,
      )
      return { turn: { id: "turn-timeout-pending" } }
    }
    if (method === "turn/interrupt") {
      setTimeout(
        () =>
          client.emit("turn/completed", {
            threadId: "thread-timeout-pending",
            turn: {
              id: "turn-timeout-pending",
              status: "interrupted",
              items: [],
            },
          }),
        0,
      )
      return {}
    }
    throw new Error(`Unexpected request: ${method}`)
  }

  await assert.rejects(
    client.runTurn({
      threadId: "thread-timeout-pending",
      prompt: "Keep unknown terminality fail closed.",
      cwd: "/tmp",
      timeoutMs: 10,
      onTurnTimedOut: async () => {},
      onCommandTerminalityPending: async (observation) => pending.push(observation),
    }),
    (error) => {
      assert.equal(error.code, "COMMAND_TERMINALITY_PENDING")
      assert.equal(error.turnId, "turn-timeout-pending")
      assert.deepEqual(error.itemIds, ["exec-timeout-pending"])
      return true
    },
  )
  assert.equal(pending.length, 1)
  assert.deepEqual(pending[0].pendingItemIds, ["exec-timeout-pending"])
  assert.deepEqual(pending[0].terminalItemIds, [])
})

test("a hung interrupt request cannot consume the command terminal drain", async () => {
  const client = new AppServerClient({
    cwd: "/tmp",
    turnTerminationTimeoutMs: 25,
    commandStartGuardMs: 5,
  })
  const pending = []
  client.request = async (method) => {
    if (method === "turn/start") {
      client.emit("item/started", {
        threadId: "thread-hung-interrupt",
        turnId: "turn-hung-interrupt",
        item: {
          id: "exec-hung-interrupt",
          type: "commandExecution",
          status: "inProgress",
        },
      })
      return { turn: { id: "turn-hung-interrupt" } }
    }
    if (method === "turn/interrupt") return new Promise(() => {})
    throw new Error(`Unexpected request: ${method}`)
  }

  await assert.rejects(
    client.runTurn({
      threadId: "thread-hung-interrupt",
      prompt: "Keep the terminal channel bounded and fail closed.",
      cwd: "/tmp",
      timeoutMs: 10,
      onTurnTimedOut: async () => {},
      onCommandTerminalityPending: async (observation) => pending.push(observation),
    }),
    (error) => error.code === "COMMAND_TERMINALITY_PENDING",
  )
  assert.equal(pending.length, 1)
  assert.deepEqual(pending[0].pendingItemIds, ["exec-hung-interrupt"])
})

test("duplicate command terminal evidence is idempotent and conflict fails closed", async () => {
  const duplicateClient = new AppServerClient({
    cwd: "/tmp",
    turnTerminationTimeoutMs: 100,
    commandStartGuardMs: 5,
  })
  let terminalWrites = 0
  duplicateClient.request = async (method) => {
    if (method === "turn/start") {
      setTimeout(
        () =>
          duplicateClient.emit("item/started", {
            threadId: "thread-duplicate-terminal",
            turnId: "turn-duplicate-terminal",
            item: {
              id: "exec-duplicate-terminal",
              type: "commandExecution",
              status: "inProgress",
            },
          }),
        0,
      )
      return { turn: { id: "turn-duplicate-terminal" } }
    }
    if (method === "turn/interrupt") {
      const terminal = {
        threadId: "thread-duplicate-terminal",
        turnId: "turn-duplicate-terminal",
        item: {
          id: "exec-duplicate-terminal",
          type: "commandExecution",
          status: "failed",
          exitCode: 1,
        },
      }
      setTimeout(() => {
        duplicateClient.emit("item/completed", structuredClone(terminal))
        duplicateClient.emit("item/completed", structuredClone(terminal))
        duplicateClient.emit("turn/completed", {
          threadId: "thread-duplicate-terminal",
          turn: {
            id: "turn-duplicate-terminal",
            status: "interrupted",
            items: [],
          },
        })
      }, 5)
      return {}
    }
    throw new Error(`Unexpected request: ${method}`)
  }
  const duplicateResult = await duplicateClient.runTurn({
    threadId: "thread-duplicate-terminal",
    prompt: "Deduplicate terminal evidence.",
    cwd: "/tmp",
    timeoutMs: 10,
    onTurnTimedOut: async () => {},
    onCommandTerminal: async () => {
      terminalWrites += 1
    },
  })
  assert.equal(duplicateResult.status, "needs_review")
  assert.equal(terminalWrites, 1)
  assert.equal(duplicateResult.commandExecutions.length, 1)

  const conflictClient = new AppServerClient({ cwd: "/tmp" })
  conflictClient.request = async () => {
    setTimeout(() => {
      conflictClient.emit("item/started", {
        threadId: "thread-conflict-terminal",
        turnId: "turn-conflict-terminal",
        item: {
          id: "exec-conflict-terminal",
          type: "commandExecution",
          status: "inProgress",
        },
      })
      conflictClient.emit("item/completed", {
        threadId: "thread-conflict-terminal",
        turnId: "turn-conflict-terminal",
        item: {
          id: "exec-conflict-terminal",
          type: "commandExecution",
          status: "failed",
          exitCode: 1,
        },
      })
      conflictClient.emit("item/completed", {
        threadId: "thread-conflict-terminal",
        turnId: "turn-conflict-terminal",
        item: {
          id: "exec-conflict-terminal",
          type: "commandExecution",
          status: "completed",
          exitCode: 0,
        },
      })
    }, 0)
    return { turn: { id: "turn-conflict-terminal" } }
  }
  await assert.rejects(
    conflictClient.runTurn({
      threadId: "thread-conflict-terminal",
      prompt: "Reject conflicting terminal evidence.",
      cwd: "/tmp",
      timeoutMs: 1_000,
    }),
    (error) => error.code === "APP_SERVER_COMMAND_TERMINAL_CONFLICT",
  )
})

test("command admission guard interrupts a late start while an earlier short command remains normal", async () => {
  const late = new AppServerClient({
    cwd: "/tmp",
    turnTerminationTimeoutMs: 100,
    commandStartGuardMs: 200,
  })
  const timeoutObservations = []
  let lateInterrupts = 0
  let lateCommandStarts = 0
  let lateCommandTimer = null
  late.request = async (method) => {
    if (method === "turn/start") {
      lateCommandTimer = setTimeout(
        () => {
          lateCommandStarts += 1
          late.emit("item/started", {
            threadId: "thread-late-command",
            turnId: "turn-late-command",
            item: {
              id: "exec-late-command",
              type: "commandExecution",
              status: "inProgress",
            },
          })
        },
        850,
      )
      return { turn: { id: "turn-late-command" } }
    }
    if (method === "turn/interrupt") {
      lateInterrupts += 1
      clearTimeout(lateCommandTimer)
      setTimeout(() => {
        late.emit("turn/completed", {
          threadId: "thread-late-command",
          turn: { id: "turn-late-command", status: "interrupted", items: [] },
        })
      }, 5)
      return {}
    }
    throw new Error(`Unexpected request: ${method}`)
  }
  const lateResult = await late.runTurn({
    threadId: "thread-late-command",
    prompt: "Do not start too late.",
    cwd: "/tmp",
    timeoutMs: 1_000,
    onTurnTimedOut: async (observation) =>
      timeoutObservations.push(observation),
    onCommandTerminal: async () => {},
  })
  assert.equal(lateInterrupts, 1)
  assert.equal(lateCommandStarts, 0)
  assert.equal(
    timeoutObservations[0].cancellationReason,
    "command_start_budget_exhausted",
  )
  assert.equal(lateResult.status, "needs_review")

  const ordinary = new AppServerClient({
    cwd: "/tmp",
    commandStartGuardMs: 40,
  })
  let ordinaryInterrupts = 0
  ordinary.request = async (method) => {
    if (method === "turn/interrupt") {
      ordinaryInterrupts += 1
      return {}
    }
    setTimeout(() => {
      ordinary.emit("item/started", {
        threadId: "thread-short-command",
        turnId: "turn-short-command",
        item: {
          id: "exec-short-command",
          type: "commandExecution",
          status: "inProgress",
        },
      })
      ordinary.emit("item/completed", {
        threadId: "thread-short-command",
        turnId: "turn-short-command",
        item: {
          id: "exec-short-command",
          type: "commandExecution",
          status: "completed",
          exitCode: 0,
        },
      })
      ordinary.emit("turn/completed", {
        threadId: "thread-short-command",
        turn: { id: "turn-short-command", status: "completed", items: [] },
      })
    }, 120)
    return { turn: { id: "turn-short-command" } }
  }
  const ordinaryResult = await ordinary.runTurn({
    threadId: "thread-short-command",
    prompt: "Complete before admission closes.",
    cwd: "/tmp",
    timeoutMs: 200,
  })
  assert.equal(ordinaryResult.status, "completed")
  assert.equal(ordinaryInterrupts, 0)
})

test("default admission reserve includes one terminal drain plus finalization margin", () => {
  const client = new AppServerClient({
    cwd: "/tmp",
    turnTerminationTimeoutMs: 25,
  })
  assert.equal(client.commandStartGuardMs, 50)
  assert.ok(client.commandStartGuardMs > client.turnTerminationTimeoutMs)
})

test("a command starting after the timeout snapshot is durably observed before terminal evidence", async () => {
  const client = new AppServerClient({
    cwd: "/tmp",
    turnTerminationTimeoutMs: 100,
    commandStartGuardMs: 20,
  })
  const lifecycle = []
  client.request = async (method) => {
    if (method === "turn/start") {
      return { turn: { id: "turn-073-late-command" } }
    }
    if (method === "turn/interrupt") {
      setTimeout(() => {
        client.emit("item/started", {
          threadId: "thread-073-late-command",
          turnId: "turn-073-late-command",
          item: {
            id: "exec-073-late-command",
            type: "commandExecution",
            status: "inProgress",
          },
        })
      }, 2)
      setTimeout(() => {
        client.emit("item/completed", {
          threadId: "thread-073-late-command",
          turnId: "turn-073-late-command",
          item: {
            id: "exec-073-late-command",
            type: "commandExecution",
            status: "completed",
            exitCode: 0,
          },
        })
      }, 5)
      setTimeout(() => {
        client.emit("turn/completed", {
          threadId: "thread-073-late-command",
          turn: {
            id: "turn-073-late-command",
            status: "interrupted",
            items: [],
          },
        })
      }, 8)
      return {}
    }
    throw new Error(`Unexpected request: ${method}`)
  }

  const result = await client.runTurn({
    threadId: "thread-073-late-command",
    prompt: "Reproduce the live 073 late command lineage.",
    cwd: "/tmp",
    timeoutMs: 50,
    onTurnTimedOut: async ({ activeCommandExecutions }) => {
      lifecycle.push(`timeout:${activeCommandExecutions.length}`)
    },
    onCommandObservedDuringCancellation: async ({ item }) => {
      lifecycle.push(`observed:${item.id}`)
    },
    onCommandTerminal: async ({ item }) => {
      lifecycle.push(`terminal:${item.id}`)
    },
  })

  assert.equal(result.status, "needs_review")
  assert.deepEqual(lifecycle, [
    "timeout:0",
    "observed:exec-073-late-command",
    "terminal:exec-073-late-command",
  ])
  assert.equal(result.commandExecutions.length, 1)
  assert.equal(result.commandExecutions[0].status, "completed")
})

test("an approval resolved after command admission closes cannot start work", async () => {
  const client = new AppServerClient({
    cwd: "/tmp",
    turnTerminationTimeoutMs: 10,
    commandStartGuardMs: 30,
  })
  const responses = []
  client.respond = (requestId, result) => responses.push({ requestId, result })
  client.request = async (method) => {
    if (method === "turn/start") {
      setTimeout(() => {
        client.emit("server_request", {
          id: 73,
          method: "item/commandExecution/requestApproval",
          params: {
            threadId: "thread-073-stale-approval",
            turnId: "turn-073-stale-approval",
            itemId: "exec-073-stale-approval",
            reason: "Owner-approved bounded command",
          },
        })
      }, 5)
      return { turn: { id: "turn-073-stale-approval" } }
    }
    if (method === "turn/interrupt") {
      setTimeout(() => {
        client.emit("turn/completed", {
          threadId: "thread-073-stale-approval",
          turn: {
            id: "turn-073-stale-approval",
            status: "interrupted",
            items: [],
          },
        })
      }, 2)
      return {}
    }
    throw new Error(`Unexpected request: ${method}`)
  }

  const result = await client.runTurn({
    threadId: "thread-073-stale-approval",
    prompt: "Do not publish stale command approval.",
    cwd: "/tmp",
    timeoutMs: 60,
    onTurnTimedOut: async () => {},
    resolveApprovalRequest: async () => {
      await new Promise((resolve) => setTimeout(resolve, 45))
      return { decision: "accept" }
    },
  })
  await new Promise((resolve) => setTimeout(resolve, 30))

  assert.equal(result.status, "needs_review")
  assert.deepEqual(responses, [{ requestId: 73, result: { decision: "cancel" } }])
})
