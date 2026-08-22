# Koalafrog Agent Orchestration Bridge

Status: repository-wide persistent runtime implemented; activation remains an
explicit bounded owner operation

## Goal

Create a local, always-on orchestration bridge on Robert's Mac so work can proceed as:

`Bobby/ChatGPT -> durable task -> orchestrator -> Codex App Server -> repo/tests -> review result -> next Codex turn -> ... -> done or owner approval required`

The bridge must remove the need for Bobby to manually copy/paste between ChatGPT and Codex while keeping irreversible or externally consequential actions owner-gated.

## Architecture direction

Use OpenAI Codex App Server as the agent-control boundary. Follow the Symphony pattern: durable work items, isolated agent state, streamed runtime events, bounded retries/turns, explicit human approval states, and preserved workspaces.

Do not automate the Codex desktop GUI with mouse/keyboard as the primary mechanism.

### Core components

1. **Task control plane**
   - Start with GitHub Issues for durable tasks because the Koalafrog repo already lives in GitHub and ChatGPT has direct GitHub access.
   - Task states should be represented explicitly and machine-readably.
   - Suggested states: `ready`, `running`, `needs_review`, `needs_owner`, `done`, `failed`.
   - Consume only valid fenced `agent_control` blocks from open issues; never
     infer a task from prose or accidentally consume a pull request.
   - Claim each repository-wide instruction ID idempotently and route pickup
     and result packets back to its originating issue.

2. **Local orchestrator service**
   - Runs continuously on the Mac.
   - Watches eligible GitHub issues in `Sillyquack/koalafrog-hq`.
   - Creates/reuses a workspace for each task.
   - Launches `codex app-server` in that workspace.
   - Starts/resumes a Codex thread and sends the task brief.
   - Streams and records structured runtime events.
   - Can send follow-up turns based on review instructions attached to the task.
   - Uses bounded retries and bounded turn count.

3. **Codex App Server adapter**
   - Implement the documented initialization handshake.
   - Support thread start/resume, turn start, turn completion/failure, input-required, and approval-required events.
   - Treat stderr separately from protocol stdout.
   - Persist Codex thread ID against the durable task so work can resume after process/service restart.

4. **Review loop**
   - Codex completion is not equivalent to task completion.
   - The orchestrator must persist a completion packet: branch, commits, changed files, tests, build results, unresolved risks and explicit approval requests.
   - ChatGPT can review the GitHub-visible work and attach a machine-readable next instruction to the issue.
   - The orchestrator picks that instruction up and sends another turn into the same Codex thread.

5. **Owner approval gate**
   - Stop and mark `needs_owner` for production deploys, production migrations, irreversible production-data changes, credentials/secrets, purchases/payments, new external accounts, destructive Git operations, or other real-world commitments.
   - Safe repo-local implementation, tests, typecheck, lint, build, docs, local migrations and branch/commit work may proceed without owner interaction.

## Safety defaults

- Never deploy to production automatically.
- Never apply production DB migrations automatically.
- Never expose service-role credentials or tokens to frontend code or task logs.
- Never delete production data.
- Never force-push or rewrite shared branch history.
- Never merge to the default branch unless an explicit owner policy later authorizes it.
- Preserve existing untracked local files unless the task explicitly owns them.
- Log every automated turn, decision, retry and approval request.

## Bootstrap acceptance criteria

The first implementation is complete when all of the following work on Robert's Mac:

1. A GitHub issue labeled/configured as an agent task is detected automatically.
2. The service creates a workspace and starts `codex app-server` without GUI automation.
3. A Codex thread is started, and its ID is persisted against the task.
4. Codex receives the issue brief and performs a harmless test task in an isolated branch/worktree.
5. Turn events are persisted and surfaced back to the GitHub issue in a compact run summary.
6. When Codex finishes, the task enters `needs_review` rather than being blindly declared done.
7. A new machine-readable review instruction added to the issue is detected and sent as the next turn into the same Codex thread.
8. `turn_input_required` or approval-required conditions move the task to `needs_owner` and do not guess an answer.
9. Restarting the orchestrator does not lose task state, workspace or thread linkage.
10. A hard `max_turns`, turn timeout and retry/backoff policy exists.

## Bootstrap implementation guidance

Prefer TypeScript/Node unless the existing repository/runtime strongly suggests otherwise. Keep the orchestrator isolated from the product frontend and Supabase production runtime. A repo-local tool under `tools/orchestrator/` or a sibling local service is preferable.

Store durable local runtime state outside normal application source where appropriate; do not commit secrets or machine-specific credentials. GitHub auth should use an existing secure local mechanism where possible. Codex authentication should reuse the authenticated local Codex host rather than copying tokens into the repository.

Generate/inspect the installed Codex App Server schema instead of hardcoding protocol enums when possible.

## First proof-of-life task

Use a deliberately harmless task such as adding/updating one orchestrator-owned documentation file on an isolated branch, running a trivial validation, and posting the resulting branch/commit/test summary back to the control-plane issue. Do not use the Material Intelligence Phase A implementation as the first live autonomous run; prove the loop first, then hand Phase A to it.

## Next phase

Once proof-of-life is stable, use the Material Intelligence Phase A architecture gate as the first substantial autonomous task. The orchestrator should be generic enough to support BAR 2026 and other repos later without embedding Koalafrog domain logic into the orchestration engine.
