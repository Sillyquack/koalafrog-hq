# Agent Task Template

Use this content in a GitHub issue to trigger the bootstrap orchestrator once it is running.

```yaml
agent_control:
  action: start
  task_state: ready
  instruction_id: bootstrap-proof-001
  max_turns: 4
  owner_approval_required: false
  prompt: |
    Read docs/agent-orchestration/PROOF_OF_LIFE.md.
    On an isolated branch/worktree, change only the Result section to record a successful proof-of-life timestamp and a one-line note that this edit was produced through Codex App Server orchestration.
    Run the smallest appropriate validation for a docs-only change.
    Commit the change, do not merge it, and report branch, commit and validation result.
```
