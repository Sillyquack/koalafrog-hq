import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

execFileSync("node", ["scripts/controlled-merge-review.mjs", "--check"], { stdio: "inherit" })
const read = name => JSON.parse(readFileSync(`docs/generated/${name}`, "utf8"))
const commits = read("controlled-merge-commit-review.json")
const migrations = read("controlled-merge-migration-review.json")
const manifest = read("controlled-merge-review-manifest.json")

assert.equal(commits.targetBranch, "main")
assert.equal(commits.mergeBase, commits.targetHead)
assert.equal(commits.count, 76)
assert.equal(commits.unrelatedCount, 0)
assert.ok(commits.commits.every(item => item.category && item.primaryDomain && item.remainDistinct))
assert.equal(migrations.duplicateTimestampCount, 0)
assert.equal(migrations.lexicalOrderValid, true)
assert.equal(migrations.conflicts.length, 0)
assert.equal(manifest.frozenRcTarget, "bd5617c70dd8ca21611f63750f2293e40a83c8b4")
assert.equal(manifest.simulation.cleanedUp, true)
assert.equal(manifest.rebaseSimulation.rewrittenCommits, 0)
assert.equal(manifest.remoteActionsPerformed, false)
assert.equal(manifest.deploymentReadiness, "not_ready")
assert.equal(manifest.targetOnlyCommitCount, 0)
assert.match(manifest.recommendedIntegrationStrategy, /non-squash/)

const source = readFileSync("scripts/controlled-merge-review.mjs", "utf8")
assert.doesNotMatch(source, /\b(?:push|pull request create|db push|functions deploy|secrets set)\b.*execFileSync/i)
console.log("Controlled merge review tooling tests passed.")
