export const issue63OriginUrl =
  "https://github.com/Sillyquack/koalafrog-hq/issues/63"
export const issue63ThreadId = "01a0243c-dcdf-7121-a02d-0aaba354c2dd"
export const issue63WorkspacePath =
  "/workspaces/issue-63-production-day1-stock-equipment-001"
export const issue63ExpectedBranch =
  "agent/issue-63-production-day1-stock-equipment-001"
export const issue63ReconciledBranch =
  "agent/issue-63-production-day1-integration-001"
export const issue63ReconciledHead =
  "ec719153c8e726831d7e2b748067383ea7f4e314"
export const issue63PriorInstructionId =
  "production-day1-git-reconciliation-008"
export const issue63InterveningInstructionId =
  "production-day1-git-reconciliation-metadata-009"
export const issue63ContinuationInstructionId =
  "production-day1-git-reconciliation-resume-010"
export const issue63ExecutionInstructionId =
  "production-day1-git-reconciliation-execution-011"
export const issue63DurableOwnerGateReason =
  "The instruction requests an owner-gated action: Supabase migration approval, deployment, production writes, Aromantic Supplier/Supplier Product provenance, and Aromantic receipt creation all remain explicitly outside scope and separately gated."
export const issue63CleanWorkspaceEvidence =
  "No conflict occurred, no `CHERRY_PICK_HEAD` remains, and the worktree is clean."
export const issue63GitMetadataGate =
  "Remaining gate: rerun with write access to this linked worktree’s Git metadata, then perform the exact authorized cherry-pick and full validation before any normal push or PR creation. Supabase migration approval and all Aromantic provenance/receipt authorization remain separate, unresolved owner gates."
export const issue63NoProductionMutations =
  "Production, migration, deployment, receipt, and Aromantic mutations: **none**"

export const issue63PriorControl = `\`\`\`yaml
agent_control:
  action: continue
  task_state: needs_review
  instruction_id: production-day1-git-reconciliation-008
  max_turns: 8
  owner_approval_required: false
  prompt: |
    Resume the existing Issue #63 Codex thread/worktree. The owner has now explicitly approved the recommended low-risk Git reconciliation path from production-day1-owner-review-packet-007.

    Authorization is narrowly limited to Git reconciliation as follows:
    - create/switch to a new integration branch starting exactly from remote feature commit ec719153c8e726831d7e2b748067383ea7f4e314;
    - cherry-pick only commit a74079be88ec4a8b36b850f95dca791ff42e4e80 onto that branch;
    - do not replay/cherry-pick a920e5811646e33081ad698609b0c13ce026c9af because prior evidence shows it is patch-equivalent to the remote foundation;
    - run complete review validation on the reconciled branch: canonical typecheck, lint, tests, Cloudflare/readiness checks if part of the established suite, production build, and git diff --check;
    - if and only if the cherry-pick is clean and validation is green, push the new integration branch normally without force-push and open a PR for review against the appropriate reviewed base/default branch. Do not merge the PR.

    Fail closed on any conflict, unexpected lineage/tree mismatch, test/check regression, or ambiguity.
\`\`\``

export const issue63InterveningControl = `\`\`\`yaml
agent_control:
  action: continue
  task_state: needs_review
  instruction_id: production-day1-git-reconciliation-metadata-009
  max_turns: 4
  owner_approval_required: false
  prompt: |
    Deploy the reviewed Supabase migration to production only after a separate owner approval.

    Supabase migration approval, deployment, production writes, Aromantic Supplier/Supplier Product provenance, and Aromantic receipt creation all remain explicitly outside scope and separately gated.
\`\`\``

export const issue63ContinuationControl = `\`\`\`yaml
agent_control:
  action: continue
  task_state: needs_owner
  instruction_id: production-day1-git-reconciliation-resume-010
  max_turns: 8
  owner_approval_required: false
  prompt: |
    Resume the existing Issue #63 Codex thread/worktree. The owner explicitly approves the previously recommended Git reconciliation operation and the exact linked-worktree Git metadata writes required to perform it.

    Execute only this approved Git path:
    1. create/switch to a new integration branch starting exactly from ec719153c8e726831d7e2b748067383ea7f4e314;
    2. cherry-pick only a74079be88ec4a8b36b850f95dca791ff42e4e80;
    3. run the established complete validation suite, including typecheck, lint, tests, readiness checks where applicable, production build, and git diff --check;
    4. if the cherry-pick is clean and every required check is green, push the new integration branch normally and open a PR for review;
    5. stop at review and return needs_review with branch name, base SHA, resulting HEAD SHA, cherry-pick result, complete durable check evidence, push status, PR number/URL, and any remaining gate.

    If the cherry-pick conflicts or lineage/tree verification does not match the reviewed plan, stop and return needs_review with the exact blocker.
\`\`\``

export const issue63ExecutionControl = issue63ContinuationControl
  .replace("task_state: needs_owner", "task_state: needs_review")
  .replace(issue63ContinuationInstructionId, issue63ExecutionInstructionId)

export const issue63PriorRun = {
  instructionId: issue63PriorInstructionId,
  status: "needs_review",
  threadId: issue63ThreadId,
  workspacePath: null,
  branch: issue63ReconciledBranch,
  commits: [issue63ReconciledHead],
  changedFiles: null,
  turnCount: 1,
  originIssueNumber: 63,
  originIssueUrl: issue63OriginUrl,
  ownerRequest: null,
  checks: {
    typecheck: "unknown",
    lint: "unknown",
    tests: "unknown",
    cloudflareReadiness: "unknown",
    build: "unknown",
    diffCheck: "pass",
  },
  blockers: [issue63CleanWorkspaceEvidence, issue63GitMetadataGate],
  ownerGates: [issue63GitMetadataGate],
  productionReadback: [
    issue63NoProductionMutations,
    issue63GitMetadataGate,
  ],
  safetyFindings: [],
  branchPushState: [
    "Git reconciliation stopped safely before applying any commit.",
    `Integration branch: \`${issue63ReconciledBranch}\``,
    "Push: **NOT ATTEMPTED**",
    issue63GitMetadataGate,
  ],
  resultArtifact: {
    version: 1,
    source: "completed_turn_final_message",
    capturedAt: "2026-08-22T04:56:32.019Z",
    turnId: "01a027d2-1e8e-73f2-af3b-e52be6b2524f",
    turnStatus: "completed",
    finalMessage: `needs_review

Git reconciliation stopped safely before applying any commit.

- Integration branch: \`agent/issue-63-production-day1-integration-001\`
- Authorized base/current HEAD: \`ec719153c8e726831d7e2b748067383ea7f4e314\`
- Base tree: \`2330f747713ce620c7927c2c505c622b40e18386\`
- Cherry-pick: **FAILED before application** because the sandbox denied creation of the linked worktree’s \`index.lock\`.
- No conflict occurred, no \`CHERRY_PICK_HEAD\` remains, and the worktree is clean.
- Commits above base: \`0\`
- \`git diff --check\`: **PASS**
- Typecheck/lint/tests/readiness/build: **NOT RUN** because the required cherry-pick did not complete.
- Push: **NOT ATTEMPTED**
- PR: **NOT CREATED**
- Production, migration, deployment, receipt, and Aromantic mutations: **none**

Lineage verification succeeded before the failure: \`ec719153…\` has the same tree as \`a74079be…^\`, confirming that \`a920e581…\` must not be replayed. The expected tree after cherry-picking \`a74079be…\` would be \`60c53e071144b4803e6f77dd07c73085050e4c75\`.

${issue63GitMetadataGate}`,
    checks: {
      typecheck: {
        status: "unknown",
        evidence: [
          {
            source: "final_message",
            status: "unknown",
            summary:
              "Typecheck/lint/tests/readiness/build: **NOT RUN** because the required cherry-pick did not complete.",
          },
        ],
      },
      lint: {
        status: "unknown",
        evidence: [
          {
            source: "final_message",
            status: "unknown",
            summary:
              "Typecheck/lint/tests/readiness/build: **NOT RUN** because the required cherry-pick did not complete.",
          },
        ],
      },
      tests: {
        status: "unknown",
        evidence: [
          {
            source: "final_message",
            status: "unknown",
            summary:
              "Typecheck/lint/tests/readiness/build: **NOT RUN** because the required cherry-pick did not complete.",
          },
        ],
      },
      cloudflareReadiness: {
        status: "unknown",
        evidence: [],
      },
      build: {
        status: "unknown",
        evidence: [
          {
            source: "final_message",
            status: "unknown",
            summary:
              "Typecheck/lint/tests/readiness/build: **NOT RUN** because the required cherry-pick did not complete.",
          },
        ],
      },
      diffCheck: {
        status: "fail",
        evidence: [
          {
            source: "command_execution",
            status: "fail",
            summary:
              "/bin/zsh -lc 'git diff --check\\ngit status --porcelain=v1\\ngit rev-list --count ec719153c8e726831d7e2b748067383ea7f4e314..HEAD\\ngit rev-parse HEAD''^{tree}\\ngit ls-remote --heads origin refs/heads/agent/issue-63-production-day1-integration-001' (failed, exit 128)",
          },
          {
            source: "final_message",
            status: "pass",
            summary: "`git diff --check`: **PASS**",
          },
        ],
      },
    },
    findings: {
      blockers: [issue63CleanWorkspaceEvidence, issue63GitMetadataGate],
      ownerGates: [issue63GitMetadataGate],
      productionReadback: [
        issue63NoProductionMutations,
        issue63GitMetadataGate,
      ],
      safetyFindings: [],
      branchPushState: [
        "Git reconciliation stopped safely before applying any commit.",
        `Integration branch: \`${issue63ReconciledBranch}\``,
        "Push: **NOT ATTEMPTED**",
        issue63GitMetadataGate,
      ],
    },
  },
  completedAt: "2026-08-22T04:56:33.827Z",
}

export const issue63InterveningRun = {
  instructionId: issue63InterveningInstructionId,
  status: "needs_owner",
  threadId: issue63ThreadId,
  workspacePath: null,
  branch: issue63ExpectedBranch,
  commits: [],
  changedFiles: null,
  turnCount: 0,
  originIssueNumber: 63,
  originIssueUrl: issue63OriginUrl,
  ownerRequest: {
    method: "control-plane/ownerGate",
    reason: issue63DurableOwnerGateReason,
  },
  checks: {
    typecheck: "not_run",
    lint: "not_run",
    tests: "not_run",
    cloudflareReadiness: "not_run",
    build: "not_run",
    diffCheck: "not_run",
  },
  blockers: [],
  ownerGates: [issue63DurableOwnerGateReason],
  productionReadback: [],
  safetyFindings: [],
  branchPushState: [],
  resultArtifact: null,
  completedAt: "2026-08-22T05:04:00.000Z",
}

export const issue63FailedExecutionRun = {
  ...structuredClone(issue63PriorRun),
  instructionId: issue63ContinuationInstructionId,
  workspacePath: issue63WorkspacePath,
  changedFiles: Array.from(
    { length: 30 },
    (_, index) => `reviewed/path-${String(index + 1).padStart(2, "0")}.ts`,
  ),
  resultArtifact: {
    ...structuredClone(issue63PriorRun.resultArtifact),
    turnId: "01a03190-f7a4-7df2-9101-55c01425776d",
    finalMessage: `needs_review — reconciliation blocked before cherry-pick.

- Branch: \`${issue63ReconciledBranch}\`
- Current HEAD: \`${issue63ReconciledHead}\`
- Cherry-pick: **FAILED before application**
- Exact blocker: sandbox denied creation of the linked worktree \`.git/worktrees/.../index.lock\`
- Worktree: clean; no \`CHERRY_PICK_HEAD\`; zero commits above base
- \`git diff --check\`: **PASS**
- Typecheck/lint/tests/readiness/build: **NOT RUN**, because the required cherry-pick never began
- Push: **NOT ATTEMPTED**
- PR: **NOT CREATED**

The remaining gate is an orchestrator execution profile that actually permits writes to this linked worktree’s external Git metadata. Owner intent is already explicit; no additional product authorization is needed. No deployment, migration, production write, receipt, or other external mutation occurred.`,
  },
  completedAt: "2026-08-22T23:10:00.000Z",
}

export function issue63ReconciliationTask(comments = []) {
  return {
    issue: {
      number: 63,
      state: "open",
      html_url: issue63OriginUrl,
      updated_at: "2026-08-22T05:10:00.000Z",
      body: issue63PriorControl,
    },
    comments: [
      { body: issue63InterveningControl },
      { body: issue63ContinuationControl },
      ...comments,
    ],
  }
}

export function issue63ExecutionTask(comments = []) {
  const task = issue63ReconciliationTask()
  task.issue.updated_at = "2026-08-22T23:15:00.000Z"
  task.comments.push({ body: issue63ExecutionControl }, ...comments)
  return task
}

export function prepareIssue63ReconciliationState(state, instruction) {
  state.status = "needs_owner"
  state.task.originIssueUrl = issue63OriginUrl
  state.lastConsumedInstructionId = issue63InterveningInstructionId
  state.activeInstruction = {
    ...instruction,
    phase: "selected",
    attempts: 0,
    turnCount: 0,
    selectedAt: "2026-08-22T05:10:00.000Z",
  }
  state.threadId = issue63ThreadId
  state.workspacePath = issue63WorkspacePath
  state.branch = issue63ExpectedBranch
  state.runs = [
    structuredClone(issue63PriorRun),
    structuredClone(issue63InterveningRun),
  ]
  return state
}

export function prepareIssue63ExecutionState(state, instruction) {
  state.status = "needs_review"
  state.task.originIssueUrl = issue63OriginUrl
  state.lastConsumedInstructionId = issue63ContinuationInstructionId
  state.activeInstruction = {
    ...instruction,
    phase: "selected",
    attempts: 0,
    turnCount: 0,
    selectedAt: "2026-08-22T23:15:00.000Z",
  }
  state.threadId = issue63ThreadId
  state.workspacePath = issue63WorkspacePath
  state.branch = issue63ReconciledBranch
  state.runs = [
    structuredClone(issue63PriorRun),
    structuredClone(issue63InterveningRun),
    structuredClone(issue63FailedExecutionRun),
  ]
  state.workspaceBranchReconciliations = [
    {
      reconciliationId: [
        "authorized-workspace-branch",
        issue63PriorInstructionId,
        issue63ContinuationInstructionId,
        issue63ReconciledHead,
      ].join(":"),
      precedingInstructionId: issue63PriorInstructionId,
      interveningInstructionIds: [issue63InterveningInstructionId],
      continuationInstructionId: issue63ContinuationInstructionId,
      originIssueNumber: 63,
      originIssueUrl: issue63OriginUrl,
      threadId: issue63ThreadId,
      workspacePath: issue63WorkspacePath,
      fromBranch: issue63ExpectedBranch,
      toBranch: issue63ReconciledBranch,
      head: issue63ReconciledHead,
      reconciledAt: "2026-08-22T05:10:00.000Z",
    },
  ]
  return state
}
