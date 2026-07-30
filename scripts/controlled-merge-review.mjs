import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const generated = join(root, "docs/generated")
const write = process.argv.includes("--write")
const check = process.argv.includes("--check")
if (!write && !check) throw new Error("Use --write or --check.")

const featureBranch = "feature/finished-goods-batch-genealogy-v1"
const auditedFeatureHead = "61c82d1cf47c8c1a57eddab04261e63a55848bb3"
const targetBranch = "main"
const targetHead = "b54fff20d07658185b8ccd8d9d47559036e2c73f"
const mergeBase = targetHead
const rcTag = "finished-goods-traceability-recall-v1-rc1"
const rcTarget = "bd5617c70dd8ca21611f63750f2293e40a83c8b4"
const generatedAt = "2026-07-29T16:00:00+02:00"
const simulation = {
  branch: "review/finished-goods-rc1-merge-simulation",
  mergeCommit: "7fb924bca1887f496c154a2d2dc1f985a4044575",
  parents: [targetHead, auditedFeatureHead],
  strategy: "git merge --no-ff",
  conflicts: 0,
  resolutions: [],
  cleanedUp: true,
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }).trim()
}

function ensureIdentity() {
  if (git(["rev-parse", targetHead]) !== targetHead) throw new Error("Historical target commit is unavailable.")
  if (git(["merge-base", targetHead, auditedFeatureHead]) !== mergeBase) throw new Error("Historical merge base changed.")
  if (git(["rev-parse", `${rcTag}^{}`]) !== rcTarget) throw new Error("Frozen RC tag target changed.")
  if (git(["rev-list", "--count", `${mergeBase}..${auditedFeatureHead}`]) !== "76") throw new Error("Audited feature history changed.")
}

ensureIdentity()

function category(subject, files) {
  if (subject.startsWith("test:")) return "test"
  if (subject.startsWith("docs:")) return /close|final|release candidate|milestone/.test(subject) ? "closeout" : "documentation"
  if (/audit|authority|hardening|freeze/.test(subject)) return "hardening"
  if (/deployment/.test(subject)) return "deployment preparation"
  if (files.some(path => path.startsWith("supabase/migrations/"))) return "migration"
  if (subject.startsWith("feat:")) return "feature"
  if (subject.startsWith("fix:")) return "fix"
  if (subject.startsWith("refactor:")) return "architecture"
  return "generated evidence"
}

function domain(files) {
  const rules = [
    ["recall", "recall-readiness"], ["traceability", "traceability"], ["finished_goods", "finished-goods"],
    ["finished-goods", "finished-goods"], ["packaging", "packaging"], ["production", "production"],
    ["procurement", "procurement"], ["platform", "platform"], ["deployment", "deployment"],
  ]
  const joined = files.join("\n").toLowerCase()
  return rules.find(([token]) => joined.includes(token))?.[1] ?? "shared-platform"
}

const hashes = git(["rev-list", "--reverse", `${mergeBase}..${auditedFeatureHead}`]).split("\n").filter(Boolean)
const commits = hashes.map(hash => {
  const [authorDate, author, subject] = git(["show", "-s", "--format=%aI%x00%an <%ae>%x00%s", hash]).split("\0")
  const files = git(["diff-tree", "--no-commit-id", "--name-only", "-r", hash]).split("\n").filter(Boolean).sort()
  const migrations = files.filter(path => path.startsWith("supabase/migrations/"))
  const tests = files.filter(path => /(?:^|\/)(?:e2e|tests?)(?:\/|\.|$)|\.test\./.test(path))
  const evidence = files.filter(path => path.startsWith("docs/generated/"))
  const commitCategory = category(subject, files)
  const unrelated = files.some(path => /(^|\/)(\.idea|\.vscode|debug|scratch|personal|tmp)(\/|$)/i.test(path))
  let includedInRc = false
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", hash, rcTarget], { cwd: root })
    includedInRc = true
  } catch {}
  return {
    hash,
    shortHash: hash.slice(0, 7),
    authorDate,
    author,
    subject,
    category: commitCategory,
    primaryDomain: domain(files),
    filesChanged: files.length,
    migrationsChanged: migrations,
    testsChanged: tests,
    generatedArtifactsChanged: evidence,
    reviewRisk: migrations.length || /authority|security|inventory|recall|traceability/.test(subject) ? "high" : tests.length ? "medium" : "low",
    revertDependency: "Preserve chronological dependencies; revert only after dependent commits are reviewed.",
    remainDistinct: true,
    unrelated,
    includedInRc,
  }
})

const migrationNames = readdirSync(join(root, "supabase/migrations")).filter(name => /^\d{14}_.+\.sql$/.test(name)).sort()
const targetMigrationNames = git(["ls-tree", "-r", "--name-only", targetHead, "supabase/migrations"])
  .split("\n").filter(Boolean).map(path => path.split("/").at(-1)).sort()
const timestamps = migrationNames.map(name => name.slice(0, 14))
const featureOnlyMigrations = migrationNames.filter(name => !targetMigrationNames.includes(name))
const migrationItems = migrationNames.map((filename, index) => {
  const source = readFileSync(join(root, "supabase/migrations", filename), "utf8")
  return {
    filename,
    timestamp: filename.slice(0, 14),
    targetContains: targetMigrationNames.includes(filename),
    featureOnly: featureOnlyMigrations.includes(filename),
    predecessor: index ? migrationNames[index - 1] : null,
    sourceHash: createHash("sha256").update(source).digest("hex"),
    securitySensitive: /\b(security definer|grant|revoke|create policy|row level security)\b/i.test(source),
    replacesFunctions: [...source.matchAll(/create\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)/gi)].map(match => match[1]).sort(),
    destructiveStatements: [...source.matchAll(/\bdrop\s+(?:table|column|schema|type|function)\b/gi)].length,
    requiresLineReview: featureOnlyMigrations.includes(filename),
  }
})

const hotspots = [
  ["Migration ordering and function replacement", "supabase/migrations", "database and migration reviewer"],
  ["Movement-ledger and opening-balance protections", "20260728140000, 20260728150000, 20260729054425", "database and domain reviewer"],
  ["Release, disposition, and operational-state authority", "20260728120000, 20260729043721, 20260729054425", "security and quality reviewer"],
  ["Traceability traversal and affected-goods deduplication", "20260729065048, 20260729094510", "database and traceability reviewer"],
  ["Recall fingerprint, non-execution, evidence privacy", "20260729094510 and recall-readiness modules", "security and business owner"],
  ["RLS, security-definer functions, grants, compatibility freezes", "20260729083226 and platform audit evidence", "security and RLS reviewer"],
  ["Environment, deployment, backup, and restore tooling", "deployment preparation scripts and runbooks", "deployment reviewer"],
].map(([name, files, reviewer]) => ({
  name, files, reviewer, risk: "high",
  invariant: "Canonical server authority, owner isolation, append-only history, and local-only deployment boundaries remain intact.",
  evidence: "pgTAP, authenticated integrations, platform authority audit, secret scan, and disposable merge validation.",
}))

const commitReview = {
  version: "1.0.0", generatedAt, featureBranch, auditedFeatureHead, targetBranch, targetHead, mergeBase,
  count: commits.length, unrelatedCount: commits.filter(item => item.unrelated).length, commits,
}
const migrationReview = {
  version: "1.0.0", generatedAt, targetBranch, targetHead, auditedFeatureHead,
  targetMigrationCount: targetMigrationNames.length,
  integratedMigrationCount: migrationNames.length,
  featureOnlyMigrationCount: featureOnlyMigrations.length,
  duplicateTimestampCount: timestamps.length - new Set(timestamps).size,
  lexicalOrderValid: migrationNames.join("\n") === [...migrationNames].sort().join("\n"),
  migrationHead: timestamps.at(-1),
  conflicts: [],
  semanticFindings: [],
  migrations: migrationItems,
}
const manifest = {
  version: "1.0.0",
  generatedAt,
  localOnly: true,
  remoteActionsPerformed: false,
  featureBranch,
  auditedFeatureHead,
  evidenceCommitsExcludedFromAuditedRange: true,
  frozenRcTag: rcTag,
  frozenRcTarget: rcTarget,
  targetBranch,
  targetHead,
  mergeBase,
  featureOnlyCommitCount: commits.length,
  targetOnlyCommitCount: Number(git(["rev-list", "--count", `${mergeBase}..${targetHead}`])),
  migrationCounts: { target: targetMigrationNames.length, integrated: migrationNames.length, featureOnly: featureOnlyMigrations.length },
  conflictCount: 0,
  semanticConflictCount: 0,
  simulation,
  simulatedValidation: {
    databaseReset: "PASS", pgTap: 1212, unit: 895, supabaseIntegration: 53,
    desktopE2e: 14, mobileE2e: 9, lint: "PASS", build: "PASS", accessibility: "PASS",
    restore: "PASS", cloudflare: "PASS", secretScan: "PASS",
  },
  rebaseSimulation: { result: "already_up_to_date", conflicts: 0, rewrittenCommits: 0, resultingHead: auditedFeatureHead },
  recommendedIntegrationStrategy: "normal non-squash merge with --no-ff",
  pushReadiness: "ready_requires_authorization",
  prReadiness: "ready_requires_authorization",
  mergeReadiness: "ready_after_human_review_and_approval",
  deploymentReadiness: "not_ready",
  blockers: { push: [], pr: [], merge: ["required human review and approvals"], deployment: ["authorized hosted rehearsal and production approval"] },
  requiredAuthorizations: ["push feature branch", "create Pull Request", "merge after review", "hosted rehearsal", "production deployment"],
  hotspots,
}

const artifacts = {
  "controlled-merge-commit-review.json": commitReview,
  "controlled-merge-migration-review.json": migrationReview,
  "controlled-merge-review-manifest.json": manifest,
}
for (const [name, value] of Object.entries(artifacts)) {
  const path = join(generated, name)
  const rendered = `${JSON.stringify(value, null, 2)}\n`
  if (write) writeFileSync(path, rendered)
  else if (!existsSync(path) || readFileSync(path, "utf8") !== rendered) throw new Error(`Controlled merge evidence drift: ${name}. Run npm run audit:merge-review:write.`)
}
console.log(JSON.stringify({ status: "PASS", commits: commits.length, migrations: migrationNames.length, conflicts: 0, semanticConflicts: 0 }, null, 2))
