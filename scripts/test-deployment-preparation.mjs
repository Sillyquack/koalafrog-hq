import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

execFileSync("node", ["scripts/deployment-preparation-audit.mjs", "--check"], { stdio: "inherit" })

const read = name => JSON.parse(readFileSync(`docs/generated/${name}`, "utf8"))
const environment = read("deployment-environment-inventory.json")
const migrations = read("hosted-migration-rehearsal-manifest.json")
const commands = read("deployment-command-inventory.json")
const readiness = read("deployment-local-readiness.json")

assert.equal(environment.summary.unknown, 0)
assert.equal(environment.summary.unsafeClientSecrets, 0)
assert.ok(environment.variables.every(item => item.classification && item.owner && item.validationRule))
assert.equal(new Set(migrations.migrations.map(item => item.timestamp)).size, migrations.migrations.length)
assert.ok(migrations.migrations.every(item => item.hostedApplicationStatus === "pending_rehearsal"))
assert.ok(migrations.migrations.every(item => item.authorizationRequired))
assert.ok(commands.commands.filter(item => item.environment !== "local").every(item => item.requiredApproval === "explicit phase approval"))
assert.ok(commands.commands.some(item => item.classification === "prohibited_or_unsafe"))
assert.equal(readiness.remoteActionsPerformed, false)
assert.equal(readiness.deploymentReady, false)
assert.equal(readiness.rcCommit, "bd5617c70dd8ca21611f63750f2293e40a83c8b4")

const source = readFileSync("scripts/deploy-preflight.mjs", "utf8")
assert.doesNotMatch(source, /db push|functions deploy|secrets set|git push/)
console.log("Deployment preparation tooling tests passed.")
