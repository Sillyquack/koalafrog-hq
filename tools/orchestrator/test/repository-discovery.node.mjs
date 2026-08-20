import assert from "node:assert/strict"
import test from "node:test"
import {
  discoverIssueCandidates,
  discoverIssueNumbers,
  extractIssueNumber,
} from "../src/repository-discovery.mjs"

test("extractIssueNumber accepts connector issue shapes and URLs", () => {
  assert.equal(extractIssueNumber({ issue_number: 54 }), 54)
  assert.equal(extractIssueNumber({ number: 53 }), 53)
  assert.equal(
    extractIssueNumber({ url: "https://github.com/Sillyquack/koalafrog-hq/issues/55" }),
    55,
  )
})

test("discoverIssueNumbers handles nested connector results and deduplicates", () => {
  assert.deepEqual(
    discoverIssueNumbers({
      result: {
        results: [
          { issue_number: 54 },
          { number: 53 },
          { url: "https://github.com/Sillyquack/koalafrog-hq/issues/54" },
        ],
      },
    }),
    [53, 54],
  )
})

const validControl = `\`\`\`yaml
agent_control:
  action: start
  task_state: ready
  instruction_id: eligible-001
  max_turns: 2
  owner_approval_required: false
  prompt: |
    Make a bounded repository-only change.
\`\`\``

test("discovery excludes pull requests and malformed or prose-only controls", () => {
  const candidates = discoverIssueCandidates({
    items: [
      {
        number: 65,
        body: validControl,
        html_url: "https://github.com/Sillyquack/koalafrog-hq/pull/65",
        pull_request: { url: "https://api.github.com/pulls/65" },
      },
      {
        number: 64,
        body: "agent_control: please run this ordinary prose",
        html_url: "https://github.com/Sillyquack/koalafrog-hq/issues/64",
      },
      {
        number: 63,
        created_at: "2026-08-20T16:28:59Z",
        body: validControl,
        html_url: "https://github.com/Sillyquack/koalafrog-hq/issues/63",
      },
      {
        number: 62,
        body: validControl.replace("max_turns: 2", "max_turns: nope"),
        html_url: "https://github.com/Sillyquack/koalafrog-hq/issues/62",
      },
    ],
  })

  assert.deepEqual(candidates.map(({ issueNumber }) => issueNumber), [63])
})
