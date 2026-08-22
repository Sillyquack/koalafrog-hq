import assert from "node:assert/strict"
import test from "node:test"
import { normalizeTaskThreadParams } from "../src/runtime-policy.mjs"

test("workspace-local task turns do not enter recursive app-server approval loops", () => {
  const normalized = normalizeTaskThreadParams({
    cwd: "/tmp/workspace",
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
    sandbox: "workspace-write",
  })
  assert.equal(normalized.approvalPolicy, "never")
  assert.equal(normalized.sandbox, "workspace-write")
})

test("read-only and unrelated policies are not rewritten", () => {
  const readOnly = {
    approvalPolicy: "never",
    sandbox: "read-only",
  }
  assert.equal(normalizeTaskThreadParams(readOnly), readOnly)

  const untrusted = {
    approvalPolicy: "untrusted",
    sandbox: "workspace-write",
  }
  assert.equal(normalizeTaskThreadParams(untrusted), untrusted)
})
