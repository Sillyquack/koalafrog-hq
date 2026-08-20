import assert from "node:assert/strict"
import test from "node:test"
import {
  extractAgentControls,
  findExistingResult,
  formatCompletionPacket,
  isInstructionEligible,
  ownerGateReason,
  selectLatestInstruction,
  selectNextInstruction,
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

const precedingIssue53Failure =
  "Diagnose and fix the owner-gate parser/eligibility logic that incorrectly classified the sentence `Explicitly keep blocked: merge/default-branch changes, force-push, web-app deployment, Supabase migrations/schema/data mutations, secrets, purchases, unrelated product-domain changes.` as if those blocked actions had been requested."

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

test("selects the oldest pending instruction from durable history", () => {
  const issue = { body: startBlock }
  const comments = [
    { body: startBlock.replaceAll("proof-001", "follow-up-001") },
    { body: startBlock.replaceAll("proof-001", "latest-consumed-001") },
  ]
  const next = selectNextInstruction(issue, comments, {
    lastConsumedInstructionId: "latest-consumed-001",
    runs: [
      { instructionId: "proof-001" },
      { instructionId: "latest-consumed-001" },
    ],
  })
  assert.equal(next.instructionId, "follow-up-001")
})

test("task state eligibility is explicit for start and continue actions", () => {
  const instruction = extractAgentControls(startBlock)[0]
  assert.equal(isInstructionEligible(instruction), true)
  assert.equal(
    isInstructionEligible({
      ...instruction,
      action: "start",
      taskState: "needs_review",
    }),
    false,
  )
  assert.equal(
    isInstructionEligible({
      ...instruction,
      action: "continue",
      taskState: "needs_review",
    }),
    true,
  )
  assert.equal(
    isInstructionEligible({
      ...instruction,
      action: "continue",
      taskState: "needs_owner",
    }),
    true,
  )
})

test("existing result comments suppress replay after local state loss", () => {
  const completed = formatCompletionPacket({
    instructionId: "proof-001",
    codexThreadId: "thread-123",
    status: "needs_review",
    branch: "agent/proof",
    commits: [],
    changedFiles: [],
    checks: {
      typecheck: "not_run",
      lint: "not_run",
      tests: "pass",
      build: "not_run",
    },
    ownerQuestion: null,
  })
  assert.equal(
    selectNextInstruction({ body: startBlock }, [{ body: completed }], {
      runs: [],
    }),
    null,
  )
})

test("an explicitly audited instruction can be retried without a duplicate", () => {
  const completed = formatCompletionPacket({
    instructionId: "proof-001",
    codexThreadId: null,
    status: "needs_owner",
    branch: null,
    commits: [],
    changedFiles: [],
    checks: {
      typecheck: "not_run",
      lint: "not_run",
      tests: "not_run",
      build: "not_run",
    },
    ownerQuestion: "False pre-turn gate",
  })
  const next = selectNextInstruction(
    { body: startBlock },
    [{ body: completed }],
    {
      lastConsumedInstructionId: "proof-001",
      runs: [{ instructionId: "proof-001" }],
      retryInstructionIds: ["proof-001"],
    },
  )
  assert.equal(next.instructionId, "proof-001")
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
  assert.equal(
    ownerGateReason({
      ...control,
      prompt: "It does not authorize merge to main, deployment to production, force-push, secrets exposure, or purchases.",
    }),
    null,
  )
  assert.equal(
    ownerGateReason({
      ...control,
      prompt: "Merge to main is not authorized.",
    }),
    null,
  )
  assert.equal(
    ownerGateReason({
      ...control,
      prompt: "No merge to main is requested. No deployment to production is requested. No force-push is requested.",
    }),
    null,
  )
  assert.equal(
    ownerGateReason({
      ...control,
      prompt:
        "Draft a Purchase Plan with zero side effects on offers, purchase orders, payments, and inventory.",
    }),
    null,
  )
  assert.match(
    ownerGateReason({
      ...control,
      prompt: "Purchase 20 units and submit payment to the supplier.",
    }),
    /owner-gated action/,
  )
})

test("owner gate treats the exact preceding Issue #53 failure as diagnostic constraint context", () => {
  const control = extractAgentControls(startBlock)[0]
  assert.equal(
    ownerGateReason({ ...control, prompt: precedingIssue53Failure }),
    null,
  )
  assert.equal(
    ownerGateReason({
      ...control,
      prompt:
        "Explicitly keep blocked: merge/default-branch changes, force-push, web-app deployment, Supabase migrations/schema/data mutations, secrets, purchases, unrelated product-domain changes.",
    }),
    null,
  )
})

test("owner gate preserves affirmative and ambiguous protected-action failures", () => {
  const control = extractAgentControls(startBlock)[0]
  for (const prompt of [
    "Force-push the reviewed branch.",
    "Consider a force-push if it makes the branch easier to review.",
    "Keep force-push blocked, but deploy the web app to production.",
    "Keep the old path blocked and deploy the web app to production.",
    "This scope excludes payments; purchase the approved stock now.",
    "The production deployment is outside scope; merge this into the default branch.",
  ]) {
    assert.match(ownerGateReason({ ...control, prompt }), /owner-gated action/)
  }
})

test("owner gate recognizes explicit constraint and boundary language", () => {
  const control = extractAgentControls(startBlock)[0]
  for (const prompt of [
    "Keep force-push blocked for this task.",
    "Force-push remains blocked for this task.",
    "Do not force-push this branch.",
    "Exclude production deployments from scope.",
    "Production migrations remain blocked.",
    "Preserve the safety boundary against default-branch merges.",
    "Payments are outside the authorized scope.",
  ]) {
    assert.equal(ownerGateReason({ ...control, prompt }), null)
  }
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

test("needs_owner packet exposes structured MCP request details", () => {
  const body = formatCompletionPacket({
    instructionId: "beard-analysis-client-reachability-001",
    codexThreadId: "thread-56",
    status: "needs_owner",
    branch: "agent/issue-56",
    commits: [],
    changedFiles: [],
    checks: {
      typecheck: "not_run",
      lint: "not_run",
      tests: "pass",
      build: "not_run",
    },
    ownerQuestion: 'Allow Supabase to run tool "supabase.execute_sql"?',
    ownerRequest: {
      method: "mcpServer/elicitation/request",
      serverName: "Supabase",
      toolName: "supabase.execute_sql",
      arguments: { query: "select id from public.workspaces limit 1" },
      details: { mode: "form" },
    },
  })

  assert.match(body, /status: needs_owner/)
  assert.match(body, /owner_request:/)
  assert.match(body, /method: "mcpServer\/elicitation\/request"/)
  assert.match(body, /server: "Supabase"/)
  assert.match(body, /tool: "supabase.execute_sql"/)
  assert.match(body, /select id from public\.workspaces limit 1/)
})
