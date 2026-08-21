import assert from "node:assert/strict"
import test from "node:test"
import {
  checksFromResultArtifact,
  resultArtifactFromTurnResult,
} from "../src/result-artifact.mjs"
import { issue63CloseoutFinalMessage } from "./fixtures/issue-63-production-day1-review-closeout-004.mjs"

test("Issue #63/004 final message produces faithful checks and findings", () => {
  const artifact = resultArtifactFromTurnResult(
    {
      status: "completed",
      turn: { id: "turn-63-004", status: "completed", items: [] },
      agentMessage: issue63CloseoutFinalMessage,
    },
    "2026-08-21T17:58:00.000Z",
  )

  assert.deepEqual(checksFromResultArtifact(artifact), {
    typecheck: "pass",
    lint: "pass",
    tests: "pass",
    cloudflareReadiness: "pass",
    build: "pass",
    diffCheck: "pass",
  })
  assert.equal(artifact.turnId, "turn-63-004")
  assert.equal(artifact.source, "completed_turn_final_message")
  assert.match(artifact.finalMessage, /1,049 passed, 66 skipped/)
  assert.doesNotMatch(artifact.finalMessage, /ghp_123456789/)
  assert.match(artifact.finalMessage, /Diagnostic token: \[redacted\]/)
  assert.ok(artifact.findings.blockers.some((line) => /unapplied/.test(line)))
  assert.ok(
    artifact.findings.ownerGates.some((line) => /explicit approval/.test(line)),
  )
  assert.ok(
    artifact.findings.productionReadback.some((line) => /all four Aromantic/.test(line)),
  )
  assert.ok(
    artifact.findings.safetyFindings.some((line) => /overlapping command/.test(line)),
  )
  assert.ok(
    artifact.findings.branchPushState.some((line) => /pushed normally/.test(line)),
  )
})

test("a completed turn without evidence is unknown rather than not_run", () => {
  const artifact = resultArtifactFromTurnResult({
    status: "completed",
    turn: { id: "turn-unverified", status: "completed", items: [] },
    agentMessage: "Implementation complete.",
  })

  assert.deepEqual(checksFromResultArtifact(artifact), {
    typecheck: "unknown",
    lint: "unknown",
    tests: "unknown",
    cloudflareReadiness: "unknown",
    build: "unknown",
    diffCheck: "unknown",
  })
  assert.equal(
    Object.values(checksFromResultArtifact(artifact)).includes("not_run"),
    false,
  )
})

test("terminal command evidence can prove a check when the final message is absent", () => {
  const artifact = resultArtifactFromTurnResult({
    status: "completed",
    turn: { id: "turn-command", status: "completed", items: [] },
    commandExecutions: [
      {
        id: "command-lint",
        type: "commandExecution",
        command: "npm run lint",
        status: "completed",
        exitCode: 0,
      },
    ],
  })

  assert.equal(artifact.checks.lint.status, "pass")
  assert.equal(artifact.checks.typecheck.status, "unknown")
  assert.equal(artifact.source, "completed_turn_execution_evidence")
})
