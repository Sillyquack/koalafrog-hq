import assert from "node:assert/strict"
import test from "node:test"
import {
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
