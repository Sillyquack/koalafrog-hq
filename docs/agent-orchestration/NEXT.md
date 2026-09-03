# Next

Watcher v2 production execution is validated and Issue #86 is terminally
closed. The next operating phase is **normal controlled production use**. No
new synthetic enrollment task is required.

For each future task:

1. use a fresh current control with a repository-wide unique instruction ID;
2. verify canonical source/runtime/profile bindings and resolve all durable
   state, queue, retry, approval, and publication residue;
3. keep mutation authority absent unless a separately reviewed control grants
   one exact bounded mutation;
4. apply `koalafrog-orchestrator` last, as execution authorization rather than
   issue taxonomy;
5. observe the authorized lifecycle and unrelated-issue isolation;
6. revoke the label when authorization ends; and
7. use controlled bootout for active work or `install-disabled` when persistent
   login startup itself must be disabled.

Do not reuse Issue #86 as a synthetic enrollment task. Closed and durable
`done` evidence is terminal. Any future production task requires a fresh issue
or a valid fresh control on an appropriate non-terminal issue.

## Legacy issue classification

| Issue | Canonical classification |
| --- | --- |
| #53 | Terminal / closeout candidate |
| #56 | Review before enrollment |
| #60 | Review before enrollment |
| #62 | Review before enrollment |
| #63 | Never enroll without reconciliation |
| #64 | Review before enrollment |
| #65 | Terminal / closeout candidate |
| #66 | Terminal / closeout candidate |
| #67 | Terminal / closeout candidate |
| #68 | Never enroll without reconciliation |
| #70 | Historical terminal-closeout / audit evidence |
| #71 | Never enroll without reconciliation |
| #72 | Terminal / closeout candidate |
| #78 | Synthetic evidence only |
| #82 | Synthetic promotion evidence |
| #86 | Production-validation evidence — terminally closed |

This table is an enrollment policy, not an instruction to mutate any issue.
Review-before-enrollment items still require the complete control-plane
checklist. Never-enroll items require explicit reconciliation first.

## Synthetic Issue #82

Issue #82 remains synthetic promotion evidence and must not be used as normal
production work. Its terminal closeout, if still desired, is separate bounded
housekeeping: verify its exact supported state, close the GitHub issue, publish
one revision-bound terminal-closeout control, run
`once --issue 82 --terminal-closeout`, and verify append-only `done` evidence.
It is not a prerequisite for normal controlled production use.

## Residual risk priority

1. **Accidental label assignment:** the primary governance risk because the
   label grants unattended consideration on the next poll.
2. **Stale controls:** current admission fails closed on invalid evidence, but
   owner review must still establish that the intended control is current.
3. **Explicit mutation-authority misuse:** service-wide mutation remains
   disabled; every proposed bounded grant requires separate review.
4. **Source/runtime drift:** identity checks fail closed, while every upgrade
   still requires a canonical rebuild, promotion, and readback.
5. **GitHub availability:** discovery and admission fail closed, trading
   availability for safety.
6. **RunAtLoad versus KeepAlive misunderstanding:** login start is enabled;
   crash or controlled-bootout restart in the same session is not.
7. **Future task-state schema upgrades:** historical compatibility must remain
   explicit, bounded, and independently reviewed rather than inferred.
