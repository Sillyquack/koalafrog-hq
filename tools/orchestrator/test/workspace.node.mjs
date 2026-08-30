import assert from "node:assert/strict"
import test from "node:test"
import { assertAllowedChanges, parseStatusFiles } from "../src/workspace.mjs"

test("porcelain parsing preserves the first character of an unstaged path", () => {
  const files = parseStatusFiles(
    " M docs/agent-orchestration/PROOF_OF_LIFE.md\0?? another-file.md\0",
  )
  assert.deepEqual(files, [
    "docs/agent-orchestration/PROOF_OF_LIFE.md",
    "another-file.md",
  ])
  assert.doesNotThrow(() =>
    assertAllowedChanges(files.slice(0, 1), [
      "docs/agent-orchestration/PROOF_OF_LIFE.md",
    ]),
  )
})
