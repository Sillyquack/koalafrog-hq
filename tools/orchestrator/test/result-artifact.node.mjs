import assert from "node:assert/strict"
import test from "node:test"
import {
  checksFromResultArtifact,
  resultArtifactFromTurnResult,
} from "../src/result-artifact.mjs"
import { issue63AcceptanceTurnResult } from "./fixtures/issue-63-production-day1-result-fidelity-acceptance-005.mjs"
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

test("Issue #63/005 keeps canonical tests pass while preserving its later caveat", () => {
  const artifact = resultArtifactFromTurnResult(
    issue63AcceptanceTurnResult,
    "2026-08-21T20:25:29.556Z",
  )

  assert.equal(artifact.checks.tests.status, "pass")
  assert.deepEqual(
    artifact.checks.tests.evidence.map(({ source, status }) => ({
      source,
      status,
    })),
    [
      { source: "command_execution", status: "pass" },
      { source: "final_message", status: "pass" },
      { source: "final_message", status: "unknown" },
    ],
  )
  assert.ok(
    artifact.checks.tests.evidence.some(({ summary }) =>
      /local-Supabase integration coverage/.test(summary),
    ),
  )
  assert.match(
    artifact.finalMessage,
    /isolated execution of the proposed migration remains unverified and gated/,
  )
  assert.ok(
    artifact.findings.ownerGates.some((line) =>
      /migration still requires isolated rehearsal/.test(line),
    ),
  )
})

test("insufficient test evidence remains unknown", () => {
  const artifact = resultArtifactFromTurnResult({
    status: "completed",
    turn: { id: "turn-tests-unknown", status: "completed", items: [] },
    agentMessage:
      "Tests include skipped local-Supabase integration coverage; isolated migration execution remains unverified.",
  })

  assert.equal(artifact.checks.tests.status, "unknown")
  assert.deepEqual(
    artifact.checks.tests.evidence.map(({ source, status }) => ({
      source,
      status,
    })),
    [{ source: "final_message", status: "unknown" }],
  )
})

test("a nonzero canonical test command is definitive failure", () => {
  const artifact = resultArtifactFromTurnResult({
    status: "completed",
    turn: { id: "turn-tests-nonzero", status: "completed", items: [] },
    agentMessage: "Implementation complete.",
    commandExecutions: [
      {
        id: "command-tests-nonzero",
        type: "commandExecution",
        command: "npm test",
        status: "completed",
        exitCode: 1,
      },
    ],
  })

  assert.equal(artifact.checks.tests.status, "fail")
  assert.deepEqual(
    artifact.checks.tests.evidence.map(({ source, status }) => ({
      source,
      status,
    })),
    [{ source: "command_execution", status: "fail" }],
  )
})

test("optimistic prose cannot hide a failed canonical test command", () => {
  const artifact = resultArtifactFromTurnResult({
    status: "completed",
    turn: { id: "turn-tests-failed", status: "completed", items: [] },
    agentMessage: "| Tests | PASS | A prose summary without execution proof |",
    commandExecutions: [
      {
        id: "command-tests-failed",
        type: "commandExecution",
        command: "npm test",
        status: "failed",
        exitCode: 1,
      },
    ],
  })

  assert.equal(artifact.checks.tests.status, "fail")
  assert.deepEqual(
    artifact.checks.tests.evidence.map(({ source, status }) => ({
      source,
      status,
    })),
    [
      { source: "command_execution", status: "fail" },
      { source: "final_message", status: "pass" },
    ],
  )
})
