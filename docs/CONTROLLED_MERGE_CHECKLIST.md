# Controlled Merge Checklist

## Before push

- [ ] Working tree clean on `feature/finished-goods-batch-genealogy-v1`.
- [ ] Frozen RC tag still resolves to `bd5617c70dd8ca21611f63750f2293e40a83c8b4`.
- [ ] Target `main` and divergence rechecked without silently fetching.
- [ ] Secrets, generated drift, oversized accidental files, local paths, and untracked files absent.
- [ ] Full validation and controlled-merge tooling pass.
- [ ] Explicit authorization to push recorded.

## Before Pull Request creation

- [ ] Feature branch push completed under separate authorization.
- [ ] Base is still `main`; compare branch is exact.
- [ ] PR package and evidence manifest match the pushed head.
- [ ] Migration inventory and review hotspots attached.
- [ ] Reviewer responsibilities assigned and acknowledged.
- [ ] Deployment explicitly excluded.
- [ ] Explicit authorization to create the Pull Request recorded.

## Before merge

- [ ] Required database, security, architecture, frontend, testing, deployment, and owner approvals complete.
- [ ] No unresolved blocking review comment.
- [ ] Target HEAD still equals the simulated target or simulation and full validation were rerun.
- [ ] CI is green and contains no unapproved deployment automation.
- [ ] Migration and security reviews explicitly approve their hotspots.
- [ ] Normal non-squash merge with explicit merge commit confirmed.
- [ ] Separate merge authorization recorded.

## After merge

- [ ] Record actual merge commit and parents.
- [ ] Rerun full post-merge validation.
- [ ] Regenerate controlled integration evidence.
- [ ] Verify the frozen feature RC tag remains unchanged.
- [ ] Consider a separate merged-candidate tag only after approval.
- [ ] Do not deploy or apply remote migrations automatically.

## Remote command handoff

These commands are examples for a future authorized operator. They were not run.

| Class | Future command | Authorization |
|---|---|---|
| A — remote read-only | `git ls-remote --heads origin main feature/finished-goods-batch-genealogy-v1` | Remote read permission |
| B — push branch | `git push --set-upstream origin feature/finished-goods-batch-genealogy-v1` | Explicit push authorization |
| C — push frozen tag | `git push origin finished-goods-traceability-recall-v1-rc1` | Separate explicit tag authorization |
| D — create PR | `gh pr create --base main --head feature/finished-goods-batch-genealogy-v1 --title "feat: integrate finished goods traceability and recall readiness" --body-file docs/CONTROLLED_MERGE_PR_BODY.md` | Explicit PR authorization |
| E — merge PR | `gh pr merge --merge <PR-NUMBER>` | Separate merge authorization after approvals |
| F — hosted rehearsal | Follow `docs/HOSTED_MIGRATION_REHEARSAL_RUNBOOK.md` | Separate hosted-rehearsal authorization |
| G — production deployment | Use the approved deployment procedure and immutable candidate | Final production authorization |

Never place credentials in commands or evidence. If the remote target or PR number differs, stop and re-verify rather than substituting assumptions.

