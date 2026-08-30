# Agent Task Template

Use this content in the **body of a new open GitHub issue** to make it eligible
for the repository-wide orchestrator. Do not reuse an `instruction_id`; it is a
repository-wide idempotency key. Pull requests and ordinary issue prose are not
tasks.

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
