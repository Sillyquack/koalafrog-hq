export const issue68OriginUrl =
  "https://github.com/Sillyquack/koalafrog-hq/issues/68"
export const issue68ThreadId = "01a02d4d-issue-68-result-fidelity"
export const issue68WorkspacePath =
  "/workspaces/issue-68-orchestrator-agent-result-fidelity-001"
export const issue68ExpectedBranch =
  "agent/issue-68-orchestrator-agent-result-fidelity-001"
export const issue68ReconciledBranch =
  "agent/issue-68-branch-reconciliation-clean"
export const issue68ReconciledHead =
  "fdd1d6c3931ad2d1eb69d32a6a435adde63572b5"
export const issue68PriorInstructionId =
  "orchestrator-authorized-branch-transition-recovery-003"
export const issue68ContinuationInstructionId =
  "orchestrator-bootstrap-branch-recovery-004"

export const issue68PriorControl = `\`\`\`yaml
agent_control:
  action: continue
  task_state: needs_review
  instruction_id: orchestrator-authorized-branch-transition-recovery-003
  max_turns: 8
  owner_approval_required: false
  prompt: |
    Resume the existing Issue #68 thread/worktree. The owner has now explicitly authorized a create/switch to a new integration branch starting exactly from fdd1d6c3931ad2d1eb69d32a6a435adde63572b5. Use integration branch agent/issue-68-branch-reconciliation-clean and make no other Git mutation.
\`\`\``

export const issue68ContinuationControl = `\`\`\`yaml
agent_control:
  action: continue
  task_state: needs_review
  instruction_id: orchestrator-bootstrap-branch-recovery-004
  max_turns: 8
  owner_approval_required: false
  prompt: |
    Resume the existing Issue #68 thread/worktree after the reviewed branch transition and finish the bounded review package without changing branch provenance.
\`\`\``

export const issue68PriorRun = {
  instructionId: issue68PriorInstructionId,
  status: "needs_review",
  threadId: issue68ThreadId,
  branch: issue68ReconciledBranch,
  commits: [issue68ReconciledHead],
  turnCount: 1,
  originIssueNumber: 68,
  originIssueUrl: issue68OriginUrl,
  checks: {
    typecheck: "unknown",
    lint: "unknown",
    tests: "pass",
    cloudflareReadiness: "unknown",
    build: "unknown",
    diffCheck: "pass",
  },
  resultArtifact: {
    version: 1,
    source: "completed_turn_final_message",
    finalMessage: `needs_review

- Reviewed branch: \`agent/issue-68-branch-reconciliation-clean\`
- Exact reviewed HEAD: \`fdd1d6c3931ad2d1eb69d32a6a435adde63572b5\``,
  },
  completedAt: "2026-08-22T09:19:34.000Z",
}

export function issue68ReconciliationTask(comments = []) {
  return {
    issue: {
      number: 68,
      state: "open",
      html_url: issue68OriginUrl,
      updated_at: "2026-08-22T09:30:00.000Z",
      body: issue68PriorControl,
    },
    comments: [{ body: issue68ContinuationControl }, ...comments],
  }
}

export function prepareIssue68ReconciliationState(state, instruction) {
  state.status = "needs_review"
  state.task.originIssueUrl = issue68OriginUrl
  state.lastConsumedInstructionId = issue68PriorInstructionId
  state.activeInstruction = {
    ...instruction,
    phase: "selected",
    attempts: 0,
    turnCount: 0,
    selectedAt: "2026-08-22T09:30:00.000Z",
  }
  state.threadId = issue68ThreadId
  state.workspacePath = issue68WorkspacePath
  state.branch = issue68ExpectedBranch
  state.runs = [structuredClone(issue68PriorRun)]
  return state
}
