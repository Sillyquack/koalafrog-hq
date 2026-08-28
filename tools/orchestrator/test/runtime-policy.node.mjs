import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { normalizeTaskThreadParams } from "../src/runtime-policy.mjs"

test("runtime documentation fixes the supported local-process trust boundary", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8")
  assert.match(readme, /personal, single-owner service/)
  assert.match(readme, /cooperating current, stale, and\s+restarted orchestrator processes/)
  assert.match(readme, /Arbitrary unrelated applications.*same logged-in macOS\s+user are outside this isolation boundary/s)
  assert.match(readme, /must not be used to weaken descriptor pinning/)
})

test("workspace-local task turns do not enter recursive app-server approval loops", () => {
  const normalized = normalizeTaskThreadParams({
    cwd: "/tmp/workspace",
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
    sandbox: "workspace-write",
    config: { "features.exec_permission_approvals": true },
  })
  assert.equal(normalized.approvalPolicy, "never")
  assert.equal(normalized.sandbox, "workspace-write")
  assert.deepEqual(normalized.config, {
    "features.exec_permission_approvals": true,
  })
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
