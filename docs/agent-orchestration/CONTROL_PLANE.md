# Control Plane Contract

GitHub Issues are the bootstrap durable control plane for local Codex orchestration.

## Machine-readable instruction block

The local orchestrator should consume only the latest fenced block with this shape from the task issue body/comments:

```yaml
agent_control:
  action: start | continue | stop
  task_state: ready | running | needs_review | needs_owner | done | failed
  instruction_id: <unique string>
  max_turns: <positive integer>
  owner_approval_required: false
  prompt: |
    <instruction sent to Codex>
```

The orchestrator must persist the last consumed `instruction_id` and never execute the same instruction twice.

## Completion packet

After a Codex turn, the orchestrator posts a compact structured result:

```yaml
agent_result:
  instruction_id: <source instruction id>
  codex_thread_id: <thread id>
  status: needs_review | needs_owner | failed
  branch: <branch or null>
  commits: []
  checks:
    typecheck: pass | fail | not_run
    lint: pass | fail | not_run
    tests: pass | fail | not_run
    build: pass | fail | not_run
  owner_question: <null or concise question>
```

Human-readable detail may follow the structured block.

## Guardrails

The bootstrap orchestrator does not merge, deploy, apply production migrations, modify production data, or resolve owner approvals itself.
