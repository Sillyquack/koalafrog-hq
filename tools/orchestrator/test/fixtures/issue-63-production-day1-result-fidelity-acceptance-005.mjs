export const issue63AcceptanceFinalMessage = `needs_review

No source changes or external side effects were made. Production, Supabase, deployment, migration, receipt, purchase, merge, and push paths were untouched.

## Acceptance results

| Check | Outcome | Evidence |
|---|---|---|
| Typecheck | PASS | \`tsc -b --pretty false\`, exit \`0\`, no diagnostics |
| Lint | PASS | \`npm run lint\`, exit \`0\`, no findings |
| Tests | PASS | 145 files passed, 15 skipped; 1,049 tests passed, 66 skipped; Cloudflare readiness passed |
| Build | PASS | \`npm run build\`, exit \`0\`; 2,087 modules transformed |
| \`git diff --check\` | PASS | Exit \`0\`, no output |

Build completed with existing non-fatal warnings about an ineffective dynamic import and a main chunk exceeding 500 kB.

The skipped tests include local-Supabase integration coverage. Therefore the normal test command passes, but isolated execution of the proposed migration remains unverified and gated.

## Git state

- Branch: \`agent/issue-63-production-day1-stock-equipment-001\`
- HEAD: \`a74079be88ec4a8b36b850f95dca791ff42e4e80\`
- Previous implementation commit: \`a920e5811646e33081ad698609b0c13ce026c9af\`
- \`origin/main\`: \`c082dd375acd9d95c160d62a7673da4082b46bae\`
- Remote feature ref: \`ec719153c8e726831d7e2b748067383ea7f4e314\`
- Common base with remote feature: \`c082dd375acd9d95c160d62a7673da4082b46bae\`
- Worktree: clean
- Branch currently tracks \`origin/main\` and is ahead by two commits.

The prior divergence remains: neither local HEAD nor the remote feature commit is an ancestor of the other. No push, merge, rebase, or history rewrite was attempted.

No old validation or overlapping task command remained active after completion.

## Remaining gates

1. The branch divergence must be reconciled through the orchestrator without force-pushing or an unauthorized merge.
2. The Supabase migration still requires isolated rehearsal, migration-lineage reconciliation, and explicit owner approval before application or deployment.
3. The four Aromantic receipts still require new explicit write authorization and resolution of canonical Supplier/Supplier Product provenance, raw date meanings, inventory units, and acquisition-cost allocation. No production receipt currently exists from the prior verified readback.`

export const issue63AcceptanceTurnResult = {
  status: "completed",
  turn: {
    id: "01a025fb-9f16-7092-bfdb-1db28b10cb71",
    status: "completed",
    items: [],
  },
  agentMessage: issue63AcceptanceFinalMessage,
  commandExecutions: [
    {
      id: "issue-63-005-npm-test",
      type: "commandExecution",
      command: "/bin/zsh -lc 'npm test'",
      status: "completed",
      exitCode: 0,
    },
  ],
}
