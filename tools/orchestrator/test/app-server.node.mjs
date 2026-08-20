import assert from "node:assert/strict"
import test from "node:test"
import {
  AppServerClient,
  autoResponseForBoundedCommandApproval,
  autoResponseForBoundedElicitation,
  classifyServerRequest,
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
    setTimeout(
      () =>
        client.emit("server_request", {
          id: 88,
          method: "item/commandExecution/requestApproval",
          params: {
            threadId: "thread-approved",
            turnId: "turn-approved",
            itemId: "exec-approved",
            reason: "Exact pending action",
          },
        }),
      0,
    )
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
