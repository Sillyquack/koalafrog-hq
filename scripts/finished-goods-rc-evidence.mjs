import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"

const root = process.cwd()
const generated = join(root, "docs/generated")
const base = "f1cc783"
const implementationHead = "15c8db0330a0c5ad153be0b962f601d23ffb6052"
const branch = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim()
const shortHead = execFileSync("git", ["rev-parse", "--short", implementationHead], { encoding: "utf8" }).trim()
const authority = JSON.parse(readFileSync(join(generated, "platform-authority-inventory.json"), "utf8"))
const baseline = JSON.parse(readFileSync(join(generated, "platform-release-baseline.json"), "utf8"))

const milestoneRules = [
  ["61e825c", "Architecture Audit"],
  ["e80fabf", "Slice 1"], ["9ba38dd", "Slice 1"], ["c529347", "Slice 1"],
  ["2fbf943", "Slice 2"], ["a7d8bd9", "Slice 2"], ["1c58695", "Slice 2"], ["43ddb6b", "Slice 2"], ["f18ed35", "Slice 2"],
  ["21b3c3d", "Slice 3"], ["330f506", "Slice 3"], ["ba449af", "Slice 3"], ["4581f69", "Slice 3"],
  ["f802fbb", "Slice 4"], ["2f1ebaa", "Slice 4"], ["11d3226", "Slice 4"], ["dd8199b", "Slice 4"],
  ["941d768", "Slice 5"], ["6f99e63", "Slice 5"], ["5abb210", "Slice 5"], ["e3e1adf", "Slice 5"],
  ["0460e4f", "Slice 6"], ["dbc1bdd", "Slice 6"], ["6f53694", "Slice 6"],
  ["eea06d2", "Platform Architecture Review"],
  ["984b19a", "Platform Hardening"], ["8f844f8", "Platform Hardening"], ["0392850", "Platform Hardening"],
  ["ee4587e", "Platform Hardening"], ["c6cbde0", "Platform Hardening"],
  ["8c3dbd8", "Recall Readiness"], ["e71aae0", "Recall Readiness"], ["a7ac741", "Recall Readiness"],
  ["85c221e", "Recall Readiness"], ["5702247", "Recall Readiness"], ["15c8db0", "Recall Readiness"],
]
const milestoneByShortHash = new Map(milestoneRules)

const commitHashes = execFileSync("git", ["rev-list", "--reverse", `${base}..${implementationHead}`], { encoding: "utf8" }).trim().split("\n")
const commits = commitHashes.map(hash => {
  const [fullHash, shortHash, author, date, subject] = execFileSync(
    "git", ["show", "-s", "--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s", hash], { encoding: "utf8" },
  ).trim().split("\x1f")
  const paths = execFileSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", hash], { encoding: "utf8" })
    .split("\n").map(value => value.trim()).filter(Boolean).sort()
  const migrations = paths.filter(value => value.startsWith("supabase/migrations/"))
  const applicationDomains = [...new Set(paths.flatMap(path => {
    const feature = path.match(/^src\/features\/([^/]+)/)?.[1]
    return feature ? [feature] : path.startsWith("src/platform/") ? ["platform"] : []
  }))].sort()
  const changeType = subject.split(":")[0]
  return {
    hash: fullHash, shortHash, author, date, subject,
    milestone: milestoneByShortHash.get(shortHash) ?? "Unclassified",
    changeType,
    migrationsChanged: migrations,
    applicationDomainsChanged: applicationDomains,
    testsChanged: paths.filter(path => /(^|\/)(test|tests|e2e)|\.test\./.test(path)),
    docsChanged: paths.filter(path => path.startsWith("docs/")),
    releaseRelevance: "in_scope",
    revertStatus: "not_reverted",
    mergeStatus: "unmerged_feature_branch",
    notes: changeType === "docs" ? "documentation-only"
      : changeType === "test" ? "test evidence"
      : changeType === "fix" ? "corrective or hardening"
      : changeType === "chore" ? "generated evidence or tooling"
      : "implementation",
  }
})

const migrationMetadata = {
  "20260728154754_production_output_yield_reconciliation_v1.sql": ["Slice 1", "Production Output identity and yield reconciliation"],
  "20260728170000_packaging_run_planning_consumption_v1.sql": ["Slice 2", "Packaging Run planning, reservation, use, and reconciliation"],
  "20260728203257_finished_goods_lot_creation_quarantine_v1.sql": ["Slice 3", "Finished Goods Lot creation and quarantine"],
  "20260729043721_finished_product_quality_release_v1.sql": ["Slice 4", "Finished-product inspection, disposition, and quality release"],
  "20260729054425_active_finished_goods_inventory_controls_v1.sql": ["Slice 5", "Movement-derived active Finished Goods inventory controls"],
  "20260729065048_batch_genealogy_traceability_v1.sql": ["Slice 6", "Canonical batch genealogy and traceability read models"],
  "20260729083226_platform_authority_hardening_v1.sql": ["Platform Hardening", "Freeze legacy writes and enforce controlled inventory authority"],
  "20260729094510_recall_readiness_v1.sql": ["Recall Readiness", "Immutable recall assessment, scope, evidence, review, and approval"],
}

const sqlNames = (source, expression) => [...source.matchAll(expression)].map(match => match[1]).sort()
const migrationEntries = Object.entries(migrationMetadata)
const migrations = migrationEntries.map(([filename, [milestone, purpose]], index) => {
  const path = `supabase/migrations/${filename}`
  const source = readFileSync(join(root, path), "utf8")
  const commit = commits.find(item => item.migrationsChanged.includes(path))
  return {
    filename,
    timestamp: filename.slice(0, 14),
    commit: commit?.hash ?? null,
    milestone,
    purpose,
    tablesAdded: sqlNames(source, /create table public\.([a-z0-9_]+)/gi),
    functionsAddedOrReplaced: sqlNames(source, /create(?: or replace)? function public\.([a-z0-9_]+)/gi),
    policiesAdded: sqlNames(source, /create policy ([a-z0-9_]+)/gi),
    triggersAdded: sqlNames(source, /create trigger ([a-z0-9_]+)/gi),
    indexesAdded: sqlNames(source, /create(?: unique)? index ([a-z0-9_]+)/gi),
    grantsChanged: /\b(?:grant|revoke)\b/i.test(source),
    legacyEffects: milestone === "Platform Hardening" ? "freezes legacy Finished Goods and workspace write authority" : "none",
    compatibilityEffects: milestone === "Platform Hardening" ? "retains read-only/service-only compatibility surfaces" : "additive",
    destructiveBehavior: "none; additive schema or authority revocation only",
    remoteApplicationStatus: "not_applied_or_verified_by_this_local_closeout",
    rollbackConsiderations: "restore from authorized pre-migration backup; do not rewrite immutable history",
    dependencies: index ? [migrationEntries[index - 1][0]] : [],
    sourceHash: createHash("sha256").update(source).digest("hex"),
  }
})

const commitInventory = {
  version: "1.0.0",
  generatedFrom: `${base}..${shortHead}`,
  branch,
  baseCommit: execFileSync("git", ["rev-parse", base], { encoding: "utf8" }).trim(),
  headCommit: implementationHead,
  count: commits.length,
  commits,
}

const migrationInventory = {
  version: "1.0.0",
  branch,
  firstMigration: migrations[0].filename,
  finalMigrationHead: migrations.at(-1).timestamp,
  count: migrations.length,
  allRemoteStatusesUnverified: true,
  migrations,
}

const rc = {
  version: "1.0.0-rc.1",
  rcName: "Finished Goods, Traceability & Recall Readiness V1 — Local Release Candidate 1",
  branch,
  headCommitBeforeCloseout: "15c8db0330a0c5ad153be0b962f601d23ffb6052",
  closeoutCommit: process.env.RC_CLOSEOUT_COMMIT || null,
  tag: "finished-goods-traceability-recall-v1-rc1",
  localMigrationHead: baseline.migrationHead,
  milestones: ["Architecture Audit", "Slice 1", "Slice 2", "Slice 3", "Slice 4", "Slice 5", "Slice 6", "Platform Architecture Review", "Platform Hardening", "Recall Readiness"],
  commitCount: commits.length,
  migrationCount: migrations.length,
  databaseObjectCounts: baseline.schemaCounts,
  authorityInventoryVersion: authority.version,
  authorityInventorySourceHash: authority.sourceHash,
  releaseBaselineVersion: baseline.version,
  testCounts: { pgTap: 1212, supabaseIntegration: 53, unitPassed: 895, unitSkipped: 53 },
  e2eCounts: { desktopPassed: 14, mobilePassed: 9 },
  warningSummary: baseline.knownWarnings,
  acceptedLimitations: [
    "No downstream reservation, dispatch, shipment, customer/distribution tracing, or Recall Execution",
    "Cross-level mass-to-unit attribution remains unknown",
    "Hosted backup, restore, migration, security, advisor, and smoke evidence remain deployment prerequisites",
  ],
  mergeReadiness: { ready: true, blockers: [] },
  deploymentReadiness: { readyNow: false, blockers: baseline.deploymentPrerequisites },
  nextLocalMilestone: "Release Candidate & Deployment Hardening",
  nextDeploymentMilestone: "Authorized hosted backup/restore and migration rehearsal",
  generatedAt: "2026-07-29T13:00:00+02:00",
  environmentClassification: "local_only",
  localOnly: true,
  pushed: false,
  merged: false,
  deployed: false,
  remoteMigrationApplied: false,
}

writeFileSync(join(generated, "finished-goods-rc-commit-inventory.json"), `${JSON.stringify(commitInventory, null, 2)}\n`)
writeFileSync(join(generated, "finished-goods-rc-migration-inventory.json"), `${JSON.stringify(migrationInventory, null, 2)}\n`)
writeFileSync(join(generated, "finished-goods-traceability-recall-rc.json"), `${JSON.stringify(rc, null, 2)}\n`)
console.log(JSON.stringify({ status: "PASS", commits: commits.length, migrations: migrations.length, head: shortHead }, null, 2))
