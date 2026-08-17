# Owner Approval Boundary

The orchestrator must stop and request owner approval before any of the following:

- production deploy
- production database migration
- irreversible or destructive production-data change
- credentials/secrets creation, rotation, disclosure or movement
- purchase/payment or paid service activation
- external account creation
- force-push/history rewrite
- merge to the default branch
- install, bootstrap or enable the persistent LaunchAgent on the owner's Mac
- action with material external/legal/financial consequence

Repo-local implementation, branch/worktree creation, commits on isolated branches, tests, typecheck, lint, builds, documentation and local-only migrations may proceed without owner approval unless a task explicitly narrows permissions.
