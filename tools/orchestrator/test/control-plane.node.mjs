import assert from "node:assert/strict"
import test from "node:test"
import {
  extractAgentControls,
  findExistingResult,
  formatCompletionPacket,
  ownerGateReason,
  selectLatestInstruction,
  shouldConsumeInstruction,
} from "../src/control-plane.mjs"

const startBlock = `\`\`\`yaml
agent_control:
  action: start
  task_state: ready
  instruction_id: proof-001
  max_turns: 3
  owner_approval_required: false
  prompt: |
    Edit only the proof result.
    Do not deploy to production.
\`\`\``

test("parses the strict control block and its multiline prompt", () => {
  const [control] = extractAgentControls(startBlock)
  assert.deepEqual(control, {
    action: "start",
    taskState: "ready",
    instructionId: "proof-001",
    maxTurns: 3,
    ownerApprovalRequired: false,
    prompt: "Edit only the proof result.\nDo not deploy to production.",
  })
  assert.equal(ownerGateReason(control), null)
})

test("selects only the latest control instruction across comments", () => {
  const latest = selectLatestInstruction(
    { body: startBlock, created_at: "2026-08-16T08:00:00Z" },
    [
      {
        body: startBlock.replaceAll("proof-001", "proof-002"),
        created_at: null,
      },
    ],
  )
  assert.equal(latest.instructionId, "proof-002")
})

test("instruction consumption is idempotent but resumes an active instruction", () => {
  const instruction = extractAgentControls(startBlock)[0]
  assert.equal(
    shouldConsumeInstruction(
      { lastConsumedInstructionId: "proof-001", activeInstruction: null },
      instruction,
    ),
    false,
  )
  assert.equal(
    shouldConsumeInstruction(
      {
        lastConsumedInstructionId: null,
        activeInstruction: { instructionId: "proof-001" },
      },
      instruction,
    ),
    true,
  )
})

test("owner gate stops affirmative production actions but ignores prohibitions", () => {
  const control = extractAgentControls(startBlock)[0]
  assert.equal(ownerGateReason(control), null)
  assert.match(
    ownerGateReason({
      ...control,
      prompt: "Deploy this branch to production.",
    }),
    /owner-gated action/,
  )
})

test("completion packet is machine-readable and discoverable idempotently", () => {
  const body = formatCompletionPacket({
    instructionId: "proof-001",
    codexThreadId: "thread-123",
    status: "needs_review",
    branch: "agent/issue-53-proof-001",
    commits: ["abc123"],
    changedFiles: ["docs/agent-orchestration/PROOF_OF_LIFE.md"],
    checks: {
      typecheck: "not_run",
      lint: "not_run",
      tests: "pass",
      build: "not_run",
    },
    ownerQuestion: null,
  })
  assert.match(body, /agent_result:/)
  assert.match(body, /status: needs_review/)
  assert.ok(findExistingResult([{ body }], "proof-001"))
})

test("empty commits use the exact inline array shape", () => {
  const body = formatCompletionPacket({
    instructionId: "proof-empty",
    codexThreadId: null,
    status: "failed",
    branch: null,
    commits: [],
    changedFiles: [],
    checks: {
      typecheck: "not_run",
      lint: "not_run",
      tests: "not_run",
      build: "not_run",
    },
    ownerQuestion: null,
  })
  assert.match(body, /^  commits: \[\]$/m)
})
