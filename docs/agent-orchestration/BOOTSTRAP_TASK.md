# Bootstrap Task: Build the Local Codex Orchestrator

Implement the local orchestration bridge described in `docs/agent-orchestration/README.md` and `docs/agent-orchestration/CONTROL_PLANE.md`.

## Constraints

- Do not implement or modify Koalafrog product-domain features as part of this task.
- Do not deploy anything.
- Do not apply production database migrations.
- Do not modify production data.
- Do not expose secrets in code, logs, GitHub issues, or commits.
- Use Codex App Server as the agent boundary; do not automate the Codex desktop GUI as the primary path.
- Preserve existing local untracked files.

## Required first steps

1. Inspect current repository/runtime tooling and choose the smallest maintainable local implementation shape.
2. Inspect the installed Codex App Server schema/CLI rather than guessing protocol enums.
3. Create an isolated branch/worktree for the implementation.
4. Produce a short execution plan before implementation.

## Required deliverables

- local orchestrator implementation
- durable task/thread state
- GitHub issue polling/control-plane adapter
- Codex App Server client
- approval/input-required stop handling
- bounded turns, timeout and retry/backoff
- structured run summaries back to GitHub
- service start/stop instructions for macOS
- tests for idempotent instruction consumption and restart/resume behavior
- proof-of-life test using an orchestrator-owned harmless documentation change

## Completion gate

Do not call the bridge complete until a real end-to-end proof demonstrates:

GitHub task -> local orchestrator -> Codex App Server -> isolated repo change/check -> structured GitHub result -> review instruction -> second turn on same Codex thread.
