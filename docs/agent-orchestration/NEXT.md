# Next

Watcher v2 promotion is complete. Production enrollment is not yet authorized.
The next sequence is:

1. land the Watcher v2 promotion documentation closeout;
2. review and create one fresh, bounded production-enrollment issue;
3. require one read-only, one-turn task;
4. permit no Git, application, Supabase, or production mutation;
5. review the exact production-extractable control and its unique instruction
   identity;
6. apply `koalafrog-orchestrator` only as the final owner authorization;
7. observe exactly one lifecycle and verify unrelated issues remain untouched;
8. revoke the label after completion;
9. only then consider a separate documentation-only mutation task; and
10. terminally close synthetic Issue #82 after the promotion/enrollment policy
    is canonical.

Do **not** use Issues #68 or #71 as the first production enrollment.

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
| #71 | Never enroll without reconciliation |
| #72 | Terminal / closeout candidate |
| #78 | Synthetic evidence only |
| #82 | Synthetic evidence only |

This table is an enrollment policy, not an instruction to mutate any issue.
Review-before-enrollment items still require the complete control-plane
checklist. Never-enroll items require an explicit reconciliation first.

## Issue #82 closeout plan

Keep Issue #82 open and unlabeled while this policy lands. It remains
`needs_review` with no active instruction. Later closeout is a separate bounded
operation:

1. confirm its exact supported schema, state revision, last-consumed
   instruction, and lack of active residue;
2. close the GitHub issue;
3. publish one exact revision-bound terminal-closeout control;
4. run `once --issue 82 --terminal-closeout`; and
5. verify durable `done`, `originIssueClosed=true`, and append-only terminal
   evidence.

## Residual risk priority

1. **Accidental label assignment:** primary governance risk; the label grants
   unattended consideration.
2. **Stale-control enrollment:** technically filtered at admission only when
   evidence fails validation; owner review remains mandatory.
3. **Unattended mutation authority:** technically denied unless explicitly
   granted, but every proposed grant needs separate review.
4. **Runtime/source drift:** fail-closed identity checks mitigate it; upgrades
   still require canonical rebuild and validation.
5. **GitHub outage/circuit breaker:** technically fail closed, with availability
   and operator monitoring tradeoffs.
6. **RunAtLoad versus KeepAlive misunderstanding:** operational documentation
   must remain explicit—login start is enabled, crash restart is not.
7. **Future macOS behavior changes:** requires periodic login/start/bootout
   verification.
