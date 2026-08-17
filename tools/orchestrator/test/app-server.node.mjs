import assert from "node:assert/strict"
import test from "node:test"
import {
  autoResponseForBoundedElicitation,
  classifyServerRequest,
} from "../src/app-server.mjs"

const approvedPrompt = `
Owner approval remains granted for the bounded repository write needed to finish this review: create the Git tree/commit for the existing Issue #54 review changes and push that commit to the existing branch.
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

test("nested elicitation messages remain visible to owner classification", () => {
  const request = {
    id: 8,
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
