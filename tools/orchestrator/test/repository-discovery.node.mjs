import assert from "node:assert/strict"
import test from "node:test"
import {
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
    [54, 53],
  )
})
