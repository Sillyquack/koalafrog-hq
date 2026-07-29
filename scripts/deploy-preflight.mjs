import { execFileSync } from "node:child_process"

const expectedTag = "finished-goods-traceability-recall-v1-rc1"
const expectedCommit = "bd5617c70dd8ca21611f63750f2293e40a83c8b4"
const tagCommit = execFileSync("git", ["rev-parse", `${expectedTag}^{commit}`], { encoding: "utf8" }).trim()
if (tagCommit !== expectedCommit) throw new Error(`RC tag drift: expected ${expectedCommit}, received ${tagCommit}`)
if (execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()) throw new Error("Deployment preflight requires a clean working tree.")

const checks = [
  ["node", ["scripts/deployment-preparation-audit.mjs", "--check"]],
  ["node", ["scripts/test-deployment-preparation.mjs"]],
  ["node", ["scripts/check-secrets.mjs"]],
  ["node", ["scripts/test-cloudflare-readiness.mjs"]],
  ["node", ["scripts/documentation-audit.mjs"]],
  ["node", ["scripts/platform-audit.mjs", "--check"]],
  ["npm", ["run", "build"]],
]
for (const [command, args] of checks) execFileSync(command, args, { stdio: "inherit" })
console.log(JSON.stringify({ status: "PASS", localOnly: true, rcTag: expectedTag, rcCommit: expectedCommit, remoteActionsPerformed: false }, null, 2))
