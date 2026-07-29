# Deployment command catalogue

The deterministic catalogue is [deployment-command-inventory.json](generated/deployment-command-inventory.json).

| Class | Examples | Rule |
|---|---|---|
| Safe local read-only | environment/migration audits, tests, build | permitted within local task |
| Safe local mutation | local reset, disposable restore verification | explicit local target only |
| Remote read-only | linked migration/config/advisor inspection | requires target authorization because output may be sensitive |
| Remote mutation | migration push, function deploy, Git push/tag push | **REQUIRES EXPLICIT AUTHORIZATION** |
| Production mutation | secret/config/migration/deployment changes | **REQUIRES FINAL APPROVAL** |
| Prohibited | destructive live SQL, history rewrite, guessed targets | never execute |

Every command must identify environment, mutation risk, role, approval, expected output, stop condition, and evidence. Remote commands are intentionally absent from `deploy:preflight`; it cannot link, push, deploy, set secrets, or contact a hosted project.
