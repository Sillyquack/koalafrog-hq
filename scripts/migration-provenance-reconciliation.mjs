import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { basename, join } from "node:path"
import { execFileSync } from "node:child_process"

const root = process.cwd()
const migrationDirectory = join(root, "supabase", "migrations")
const outputPath = join(root, "docs", "generated", "migration-provenance-reconciliation.json")
const write = process.argv.includes("--write")

const hash = (algorithm, value) => createHash(algorithm).update(value).digest("hex")
const normalizeHostedStatement = (value) => value.endsWith("\n") ? value.slice(0, -1) : value
const migrationFiles = readdirSync(migrationDirectory).filter(name => /^\d{14}_.+\.sql$/.test(name)).sort()

const migrations = migrationFiles.map((filename, index) => {
  const sql = readFileSync(join(migrationDirectory, filename), "utf8")
  const [, version, name] = filename.match(/^(\d{14})_(.+)\.sql$/)
  const matches = pattern => [...sql.matchAll(pattern)].map(match => match[1]).filter((value, item, values) => values.indexOf(value) === item).sort()
  return {
    order: index + 1,
    version,
    name,
    filename,
    bytes: Buffer.byteLength(sql),
    sha256: hash("sha256", sql),
    exactMd5: hash("md5", sql),
    withoutFinalNewlineMd5: hash("md5", normalizeHostedStatement(sql)),
    effects: {
      tables: matches(/\b(?:create|alter|drop)\s+table(?:\s+if\s+(?:not\s+)?exists)?\s+(?:public\.)?([a-z0-9_"]+)/gi),
      functions: matches(/\bcreate\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_"]+)/gi),
      policies: matches(/\bcreate\s+policy\s+"?([^"\s]+)"?/gi),
      indexes: matches(/\bcreate\s+(?:unique\s+)?index(?:\s+if\s+not\s+exists)?\s+([a-z0-9_"]+)/gi),
      triggers: matches(/\bcreate\s+trigger\s+([a-z0-9_"]+)/gi),
      constraints: matches(/\b(?:add\s+constraint|constraint)\s+([a-z0-9_"]+)/gi),
      grants: (sql.match(/\bgrant\s+/gi) ?? []).length,
      revokes: (sql.match(/\brevoke\s+/gi) ?? []).length,
      inserts: (sql.match(/\binsert\s+into\s+/gi) ?? []).length,
      updates: (sql.match(/\bupdate\s+(?:public\.)?/gi) ?? []).length,
      deletes: (sql.match(/\bdelete\s+from\s+/gi) ?? []).length,
      drops: (sql.match(/\bdrop\s+/gi) ?? []).length,
    },
  }
})

const productionVersions = [
  "20260714210000", "20260715090000", "20260715120000", "20260715121000", "20260715130000", "20260715140000",
  "20260715193000", "20260715200000", "20260716090000", "20260716130000", "20260716180000", "20260716200000",
  "20260716210000", "20260716220000", "20260716230000", "20260717090000", "20260717110000", "20260717120000",
  "20260718090000", "20260718120000", "20260719090000", "20260720090000", "20260720120000", "20260720160000",
  "20260720170000", "20260720180000", "20260720190000", "20260720200000", "20260720210000", "20260720220000",
  "20260721140000", "20260721150000", "20260721210000", "20260722090000", "20260722100000", "20260722101000",
  "20260722110000", "20260722130000", "20260722190000", "20260723044918", "20260723060732", "20260723071830",
  "20260723073840", "20260723080007", "20260723095108", "20260723105527", "20260723125652", "20260723191905",
  "20260723213000", "20260724054059", "20260724064750", "20260724124819", "20260725093000", "20260725133000",
  "20260726122046", "20260726124135", "20260726185922", "20260727043935", "20260727055227", "20260727095115",
  "20260727095850", "20260727114702",
]

const productionOnly = [
  ["20260726122046", "beard_semantic_failure_invariant", "20260726121237_beard_semantic_failure_invariant.sql", "140c216a9751e559cc409dbcf60d6837", 15601, "91138b75c6c11f2a73b0d7b955d92a7d79acfd43"],
  ["20260726124135", "beard_support_lookup_backward_compatibility", "20260726124000_beard_support_lookup_backward_compatibility.sql", "cfd1f07c5869ba7ac10d31dd0ff22424", 1127, "91138b75c6c11f2a73b0d7b955d92a7d79acfd43"],
  ["20260726185922", "beard_guard_strategy_v6", "20260726185624_beard_guard_strategy_v6.sql", "e3f36515b152b40b43c9ab8f51ab06bc", 5130, "91138b75c6c11f2a73b0d7b955d92a7d79acfd43"],
  ["20260727043935", "beard_provider_429_classification", "20260727065000_beard_provider_429_classification.sql", "ed7be7e21f04d10df8a58f114e11a577", 1859, "91138b75c6c11f2a73b0d7b955d92a7d79acfd43"],
  ["20260727055227", "beard_responses_parser_v1", "20260727054718_beard_responses_parser_v1.sql", "0c21637267f1732b1b245792f5ff7695", 4246, "91138b75c6c11f2a73b0d7b955d92a7d79acfd43"],
  ["20260727095115", "beard_intelligence_v2", "20260727120000_beard_intelligence_v2.sql", "77fabf5a50cdb6cac28b6268ed57e9c6", 10135, "594452ebd04df37c7bdc90da2bb0752b8239f538"],
  ["20260727095850", "beard_support_lookup_v6_composition", "20260727121000_beard_support_lookup_v6_composition.sql", "c098ac92dbb797dfbb56a345a73899ea", 2555, "594452ebd04df37c7bdc90da2bb0752b8239f538"],
  ["20260727114702", "beard_legacy_null_target_review", "20260727130000_beard_legacy_null_target_review.sql", "634c25add2f25581bbe1f12e080aeadc", 5251, "b54fff20d07658185b8ccd8d9d47559036e2c73f"],
].map(([productionVersion, name, repositoryFile, hostedMd5, hostedBytes, provenanceCommit], index) => {
  const repository = migrations.find(item => item.filename === repositoryFile)
  return {
    productionOrder: 55 + index,
    productionVersion,
    name,
    repositoryFile,
    repositoryVersion: repository.version,
    hostedMd5,
    hostedBytes,
    repositoryExactMd5: repository.exactMd5,
    repositoryWithoutFinalNewlineMd5: repository.withoutFinalNewlineMd5,
    normalizedSqlProof: repository.exactMd5 === hostedMd5 || repository.withoutFinalNewlineMd5 === hostedMd5,
    classification: "EXACT_EQUIVALENT_DIFFERENT_VERSION",
    provenanceCommit,
    gitSearchResult: "The production version never existed as a Git filename in reachable commits, branches, tags, or reflogs.",
    executionProvenance: "Supabase hosted migration application: one stored statement, created_by populated, and an execution-time version. This is not the db-push signature of migrations 1–54.",
    replacementHistory: "No Git rename or consolidation. The same SQL is present under a repository-authored timestamp.",
    effects: repository.effects,
  }
})

const rehearsalReleaseVersions = [
  "20260729170313", "20260729170321", "20260729170327", "20260729170334", "20260729170340",
  "20260729170346", "20260729170448", "20260729170454", "20260729170502", "20260729170509",
  "20260729170514", "20260729170521", "20260729170538", "20260729170546", "20260729170552",
  "20260729170558", "20260729170605", "20260729170615", "20260729170624", "20260729170631",
  "20260729170639", "20260729170644", "20260729170651", "20260729170658", "20260729170704",
]
const rehearsalReleaseMd5 = [
  "dba4daae26e77c20ed4f85a0f4c80d86", "be4df7fc9c41348bd43e1c955e6ed0e4", "de563b71f76aabb3dd671fb3de22cf21",
  "84e62c36a3f566877dc4101e11f21953", "045dca72cfa3a535c7712c3983bf3396", "392f2717fb0c06a2b9ea5c22ff0a98c4",
  "a6f214ee673a5ac4bfd87005e77b90a6", "38b6fdde218d32048b29504d6e2fadf6", "4505086aa99d5b5293ae84910998dde0",
  "c470cf1b2d3b70aed85dad94570977cf", "816449a72788849daf2614578ca9c327", "7a243af25aeb806e158f3768c92d863e",
  "962d737d7617cbbdfd4b6bb685cf254b", "fb85fc2dc5fa9f45b11ef63705f5281d", "402587b451c0b2b3dec89c9912f7e01d",
  "068576a6662d6975454ecac9ab377306", "fcd7bb6fb61116b47e5aeb7b814150b1", "e2a3d2fcfb0c08a772a1a1ead6e8fb19",
  "e75c68e9a53ca440dccaaf56f08202a8", "c548beb01091f66e364e3bb9b031f614", "980acabfd44cddfe2e76080e9b4a8bb2",
  "3868376594149dfc38c20a42d63a18b1", "3320998e61d3d17a4e7a52bebf450412", "7fc12e896ea1220a318842b0ddd7df58",
  "5b89ceca3fddfd10e6a1fa1a3b246454",
]
const rehearsalReleaseNames = [
  "supplier_documentation", "supplier_history_reliability", "production_procurement_durable_workflow",
  "production_procurement_supplier_matching", "production_procurement_basket_scenarios", "procurement_semantic_separation_v1",
  "production_purchase_plan_approval_gate", "draft_purchase_order_handoff", "external_purchase_order_placement",
  "supplier_confirmation_and_shipments", "physical_receiving_inspection_quarantine",
  "controlled_quality_release_inventory_commitment", "procurement_release_candidate_hardening",
  "production_inventory_reservations", "production_inventory_consumption_reconciliation",
  "production_output_yield_reconciliation_v1", "production_inventory_control_contracts_v1",
  "packaging_run_planning_consumption_v1", "finished_goods_lot_creation_quarantine_v1",
  "finished_product_quality_release_v1", "active_finished_goods_inventory_controls_v1",
  "batch_genealogy_traceability_v1", "platform_authority_hardening_v1", "recall_readiness_v1",
  "rehearsal_definer_execute_hardening",
]
const repositoryRelease = rehearsalReleaseNames.map(name => migrations.find(item => item.name === name))
const rehearsalRelease = rehearsalReleaseVersions.map((version, index) => ({
  order: 63 + index,
  version,
  name: repositoryRelease[index].name,
  repositoryVersion: repositoryRelease[index].version,
  repositoryFile: repositoryRelease[index].filename,
  hostedMd5: rehearsalReleaseMd5[index],
  repositoryExactMd5: repositoryRelease[index].exactMd5,
  repositoryWithoutFinalNewlineMd5: repositoryRelease[index].withoutFinalNewlineMd5,
  normalizedSqlProof: [repositoryRelease[index].exactMd5, repositoryRelease[index].withoutFinalNewlineMd5].includes(rehearsalReleaseMd5[index]),
  relationship: "EXACT_EQUIVALENT_DIFFERENT_VERSION",
}))

const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim()
const releaseHead = "35527eccaf4b85ab290f7d83d1cfde1ee1c6152f"
execFileSync("git", ["merge-base", "--is-ancestor", releaseHead, "HEAD"], { cwd: root })
const manifest = {
  version: "1.0.0",
  generatedAt: "2026-07-30T00:00:00+02:00",
  disposition: "PASS",
  repository: {
    head: releaseHead,
    originMain: git("rev-parse", "origin/main"),
    branch: git("branch", "--show-current"),
    migrationCount: migrations.length,
    migrations,
  },
  production: {
    projectRef: "fetmeynkvylznapdikht",
    migrationCount: 62,
    orderedVersions: productionVersions,
    sharedPrefixCount: 54,
    authUsers: 1,
    authIdentities: 1,
    workspaces: 1,
    objectCounts: { tables: 120, columns: 1831, constraints: 856, indexes: 242, functions: 70, policies: 120, triggers: 16, types: 0, tableGrants: 2462, routineGrants: 196 },
    categoryFingerprints: { tables: "50a2b370bc66801d6efb289e0a681f3a", columns: "bdbfeda8e0e2e5823fc9dbbb46c987f5", constraints: "797cf4852f7ee4c2704c547fb2f6abdf", functions: "e8697dc0bae65003f1653ed53fd934f9", indexes: "a567471fbc2f2e481c22e9a812dda1ab", policies: "401c1303e378be4b7498d6b189fa09f1", triggers: "b3820060e31b0b88f70394c67267dca1", tableGrants: "1659ac05a7f5d547b9701ef63605d1f1", routineGrants: "d0446bc143f0ef82d1c50b78c1c2cd45" },
    productionOnly,
    modifiedObjectFingerprints: {
      "begin_beard_provider_attempt(uuid,uuid,text,text,text)": "9c08b7a6128e7c7b4aca586fa35ad0c4",
      "finish_beard_analysis_review(uuid,uuid,jsonb,jsonb,jsonb)": "5ed32adf7dd72de0600ab52081cb7cf2",
      "list_beard_analysis_history(uuid,integer,timestamp with time zone,uuid)": "47d536144ea5066838b6aa5514485167",
      "lookup_beard_analysis_support_diagnostic(uuid,text)": "20d78de33cfe2d752e32546d03640b9b",
      "persist_beard_analysis_result(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb)": "5c94fefb7993f8741733cb66a1035d83",
      "reopen_beard_analysis(uuid,uuid)": "361cfd59ccfba1d51267403ce795cb30",
      "intelligence_analyses.provider_extraction_diagnostic": "65ac1fce1f2499fe769867492dd53cd6",
      "intelligence_analyses.target_style": "65ac1fce1f2499fe769867492dd53cd6",
      "intelligence_analyses_target_style_shape": "9a4d267f463b17fd55ba01b1f68e3c74",
    },
  },
  rehearsal: {
    projectRef: "jaghoxoaqzpiowzyfcnf",
    migrationCount: 87,
    authUsers: 1,
    authIdentities: 1,
    workspaces: 1,
    first62ExactlyMatchProduction: true,
    release: rehearsalRelease,
    objectCounts: { tables: 198, columns: 3834, constraints: 1966, indexes: 637, functions: 206, policies: 186, triggers: 59, types: 0, tableGrants: 3594, routineGrants: 632 },
    categoryFingerprints: { tables: "18d2c6d823ff996e40c8ba8ee2b71fb9", columns: "810666816985723da336b582731049a3", constraints: "92ca2554c84e5f6dd3254696d10ebe6b", functions: "2455202e76d6575488ad861a5921b1d8", indexes: "be63a900e234f8a07cad9b3deadf9a28", policies: "1cd28317dbb2b4539b795fabcc407b32", triggers: "75daef819d7e8c0d78f236d3f4ab1e3c", tableGrants: "593c9523050c9b2c6b092d4686a3a581", routineGrants: "bcc7be6f6a58c6cb98ab2aa555ec378b" },
    localResetParity: {
      exactCategories: ["tables", "columns", "constraints", "functions", "indexes", "policies", "triggers"],
      hostedGrantMaterializationDiffersFromLocal: true,
      explanation: "Hosted projects materialize platform/default privileges differently from the local stack. Hosted production-to-rehearsal grant fingerprints, not local aggregate grant counts, are the deployment authority baseline.",
    },
  },
  schemaComparison: {
    productionOnlyObjects: [],
    harmlessDifferences: ["Hosted migration versions and repository filenames differ; normalized SQL content does not."],
    expectedMissingReleaseObjects: repositoryRelease.map(item => ({ migration: item.filename, effects: item.effects })),
    materialSemanticDifferences: ["Production lacks the cumulative DDL, DML, authority hardening, and RPC replacements in the 25 release migrations."],
    authoritySecurityDifferences: [
      "Rehearsal includes platform_authority_hardening_v1 and rehearsal_definer_execute_hardening; production does not.",
      "Hosted grant fingerprints differ materially between production and rehearsal because release migrations add/revoke privileges and hosted default privilege materialization applies to new objects. A fresh hosted clone must reproduce the rehearsal fingerprints.",
    ],
    dataDependentAssumptions: repositoryRelease.filter(item => item.effects.inserts || item.effects.updates || item.effects.deletes).map(item => item.filename),
  },
  strategies: {
    A: { decision: "REJECT", correctness: "Schema reconciliation can be correct, but timestamp history remains divergent", auditability: "Medium", productionCompatibility: "A normal db push remains blocked by the eight remote-only versions and earlier local-only versions", rehearsalCompatibility: "Requires a fresh clone", freshReset: "Preserves the current tree but not deployable history alignment", duplicateDdlRisk: "Low with guards", missingDdlRisk: "Low after schema reconciliation", falseHistoryRisk: "None", complexity: "High forever", rollback: "Physical backup plus append-only forward fix" },
    B: { decision: "RECOMMENDED", correctness: "High because all eight historical SQL bodies are proven exact and the rehearsal proves the supplier migrations are order-independent after them", auditability: "High: filenames reflect truthful production history and SQL bytes remain immutable", productionCompatibility: "Creates an exact 62-version prefix followed by the true 25-migration suffix", rehearsalCompatibility: "Same final semantics; a fresh clone must validate canonical timestamps and order", freshReset: "One execution of each SQL body in the proven rehearsal order", duplicateDdlRisk: "None after removing only the superseded timestamp aliases", missingDdlRisk: "Low and checksum-auditable", falseHistoryRisk: "None", complexity: "Moderate one-time canonicalization", rollback: "Git revert before deployment; physical backup plus forward fix after deployment" },
    C: { decision: "REJECT", correctness: "No-op files would falsely imply execution from repository files", auditability: "Low", productionCompatibility: "Superficially high", rehearsalCompatibility: "Poor", freshReset: "Pollutes canonical history", duplicateDdlRisk: "Low", missingDdlRisk: "High", falseHistoryRisk: "High", complexity: "Low", rollback: "Remove before publication only" },
    D: { decision: "REJECT_FOR_THIS_RELEASE", correctness: "Migration repair mutates history only and does not apply SQL", auditability: "Low for truthful provenance", productionCompatibility: "Technically possible but prohibited and unnecessary", rehearsalCompatibility: "Would require separate repairs", freshReset: "No benefit", duplicateDdlRisk: "Unchanged", missingDdlRisk: "Unchanged", falseHistoryRisk: "High", complexity: "High", rollback: "Further history mutation" },
    E: { decision: "FUTURE_OPTION", correctness: "High after this release is reconciled", auditability: "High with immutable legacy manifest", productionCompatibility: "Not an immediate advancement path", rehearsalCompatibility: "Requires new environments", freshReset: "Simpler future bootstrap", duplicateDdlRisk: "Low", missingDdlRisk: "Baseline verification required", falseHistoryRisk: "Low", complexity: "High initially", rollback: "Retain immutable legacy tree and backup" },
  },
  canonicalStrategy: {
    selected: "Strategy B",
    rationale: "Canonicalize filenames without changing SQL: restore the eight proven production versions as the first 62 entries, rename the two supplier migrations to new versions immediately after production's head, and retain the remaining 23 release migrations. This creates the truthful production prefix plus a strict 25-migration suffix without history repair, no-op markers, duplicate DDL, or missing DDL.",
    nextSteps: [
      "Create a focused reconciliation branch; do not edit SQL bodies.",
      "Rename the eight mapped beard migration files to their exact production versions.",
      "Rename supplier_documentation and supplier_history_reliability to ordered versions greater than 20260727114702 and before 20260727131021.",
      "Regenerate checksums and assert that all 10 renamed files retain byte-identical SQL.",
      "Reset locally and require the complete schema and authority fingerprints to remain unchanged.",
      "Create a current physical production backup and record its recovery identifier.",
      "Create a fresh auth-preserving production clone; the existing rehearsal remains the semantic target but is not the canonical history rehearsal.",
      "Run migration list and dry-run; require an exact 62-version shared prefix and strict 25-version suffix.",
      "Apply the canonical 25-file suffix to the fresh clone and compare its complete schema and authority fingerprints with the existing rehearsal.",
      "Only after exact parity, apply that same canonical suffix to production using db push.",
    ],
    stopConditions: [
      "Any normalized SQL mapping fails.",
      "Any production object fingerprint differs from this manifest.",
      "Any production-only object or data dependency is discovered.",
      "Any SQL body changes during filename canonicalization.",
      "The canonical tree is not an exact 62-version production prefix plus 25-version suffix.",
      "Any migration would duplicate non-idempotent DDL or rewrite immutable business history.",
      "Backup or auth-preserving clone readiness is unproven.",
      "Final schema, RLS, policy, grant, function, trigger, constraint, or index parity fails.",
    ],
    backupRequired: true,
    existingRehearsalValidAsSemanticTarget: true,
    newRehearsalCloneRequired: true,
    forwardFix: "Before deployment, revert the filename-only canonicalization commit. During deployment, stop on the first error and preserve partial history; restore only under the approved recovery decision, otherwise append a reviewed forward-fix migration.",
  },
  hostedWritesPerformed: false,
}

if (manifest.repository.head !== manifest.repository.originMain) throw new Error("main differs from origin/main")
if (migrations.length !== 87) throw new Error(`Expected 87 migrations, found ${migrations.length}`)
if (productionOnly.some(item => !item.normalizedSqlProof)) throw new Error("Production SQL provenance mismatch")
if (repositoryRelease.length !== 25 || repositoryRelease.some(item => !item)) throw new Error("Expected all 25 rehearsal release migrations in the repository")
if (rehearsalRelease.some(item => !item.normalizedSqlProof)) throw new Error("Rehearsal SQL provenance mismatch")

const rendered = `${JSON.stringify(manifest, null, 2)}\n`
if (write) {
  mkdirSync(join(root, "docs", "generated"), { recursive: true })
  writeFileSync(outputPath, rendered)
} else if (!existsSync(outputPath) || readFileSync(outputPath, "utf8") !== rendered) {
  throw new Error("Migration provenance evidence drift. Run npm run audit:migration-provenance:write.")
}

console.log(JSON.stringify({
  status: manifest.disposition,
  repositoryMigrations: migrations.length,
  productionMigrations: productionVersions.length,
  rehearsalMigrations: 62 + rehearsalRelease.length,
  productionOnlyMapped: productionOnly.length,
  strategy: manifest.canonicalStrategy.selected,
  hostedWritesPerformed: false,
}, null, 2))
