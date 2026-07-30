import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { basename, extname, join, relative } from "node:path"

const root = process.cwd()
const generated = join(root, "docs/generated")
const write = process.argv.includes("--write")
const check = process.argv.includes("--check")
if (!write && !check) throw new Error("Use --write or --check.")

const rcCommit = "bd5617c70dd8ca21611f63750f2293e40a83c8b4"
const rcTag = "finished-goods-traceability-recall-v1-rc1"
const fixedTimestamp = "2026-07-29T14:00:00+02:00"

function walk(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory).sort().flatMap(name => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

const sourceFiles = [
  ...walk(join(root, "src")),
  ...walk(join(root, "scripts")),
  ...walk(join(root, "supabase/functions")),
].filter(path => [".ts", ".tsx", ".js", ".mjs"].includes(extname(path)))

const usage = new Map()
for (const path of sourceFiles) {
  const source = readFileSync(path, "utf8")
  const variables = [
    ...source.matchAll(/(?:import\.meta\.env|process\.env)\.([A-Z][A-Z0-9_]*)/g),
    ...source.matchAll(/Deno\.env\.get\(["']([A-Z][A-Z0-9_]*)["']\)/g),
  ].map(match => match[1])
  for (const name of variables) {
    if (!usage.has(name)) usage.set(name, new Set())
    usage.get(name).add(relative(root, path))
  }
}

const registry = {
  DEV: ["generated", false, "build_time", false, "Vite boolean", "false", "Vite supplied", "application"],
  VITE_SUPABASE_URL: ["public_client_configuration", true, "build_time", true, "HTTPS Supabase URL", "https://your-project.supabase.co", "fail controlled Supabase startup", "application operator"],
  VITE_SUPABASE_PUBLISHABLE_KEY: ["public_client_configuration", true, "build_time", true, "Supabase publishable key", "your-browser-safe-publishable-key", "fail controlled Supabase startup", "application operator"],
  VITE_SUPABASE_ANON_KEY: ["deprecated", false, "build_time", true, "legacy anon JWT", "legacy-browser-key", "fallback only", "application operator"],
  VITE_WORKSPACE_REPOSITORY: ["production_required", true, "build_time", true, "local|supabase", "local", "defaults local; production must set supabase", "release owner"],
  VITE_SUPABASE_TEST_URL: ["test_only", true, "test_runtime", false, "localhost Supabase URL", "http://127.0.0.1:54321", "integration suite skips outside harness", "test harness"],
  VITE_SUPABASE_TEST_ANON_KEY: ["test_only", true, "test_runtime", false, "local anon key", "local-generated-key", "integration suite skips outside harness", "test harness"],
  VITE_SUPABASE_TEST_SERVICE_ROLE_KEY: ["local_development_only", true, "test_runtime", false, "local service-role JWT", "local-generated-secret", "integration suite skips outside harness", "test harness"],
  SUPABASE_URL: ["generated", true, "edge_runtime", false, "Supabase-provided project URL", "platform-injected", "Edge Function fails closed", "Supabase platform"],
  SUPABASE_ANON_KEY: ["generated", true, "edge_runtime", false, "Supabase-provided anon key", "platform-injected", "Edge Function fails closed", "Supabase platform"],
  SUPABASE_SERVICE_ROLE_KEY: ["private_server_secret", true, "edge_runtime", false, "Supabase service-role key", "platform-injected-secret", "Edge Function fails closed", "database operator"],
  OPENAI_API_KEY: ["private_server_secret", false, "edge_runtime", false, "provider API key", "server-secret", "provider feature unavailable", "service operator"],
  OPENAI_WEBHOOK_SECRET: ["private_server_secret", false, "edge_runtime", false, "webhook signing secret", "server-secret", "webhook rejects", "service operator"],
  PROCUREMENT_RECONCILER_SECRET: ["private_server_secret", false, "edge_runtime", false, "scheduler bearer secret", "server-secret", "reconciler rejects", "service operator"],
  PROCUREMENT_LIVE_RESEARCH_ENABLED: ["optional_feature", false, "edge_runtime", false, "true|false", "false", "live research disabled", "business owner"],
  PROCUREMENT_LIVE_DAILY_LIMIT: ["optional_feature", false, "edge_runtime", false, "positive integer", "5", "conservative default", "business owner"],
  OPENAI_PROCUREMENT_MODEL: ["optional_feature", false, "edge_runtime", false, "provider model ID", "gpt-5.6", "repository default", "service operator"],
  OPENAI_MODEL: ["optional_feature", false, "edge_runtime", false, "provider model ID", "configured-model", "feature default", "service operator"],
  OPENAI_BEARD_VISION_MODEL: ["optional_feature", false, "edge_runtime", false, "provider model ID", "configured-vision-model", "feature default", "service operator"],
  OPENAI_BEARD_VISION_TIMEOUT_MS: ["optional_feature", false, "edge_runtime", false, "positive milliseconds", "120000", "bounded default", "service operator"],
  OPENAI_PRICING_SNAPSHOT_VERSION: ["optional_feature", false, "edge_runtime", false, "version label", "YYYY-MM", "cost remains snapshot-labelled", "service operator"],
  RC_CLOSEOUT_COMMIT: ["local_development_only", false, "tool_runtime", false, "40-character Git SHA", rcCommit, "preserves existing manifest value", "release owner"],
}

const unknown = [...usage.keys()].filter(name => !registry[name]).sort()
if (unknown.length) throw new Error(`Unclassified environment variables: ${unknown.join(", ")}`)

const template = readFileSync(join(root, ".env.example"), "utf8")
const environment = Object.entries(registry).map(([name, [classification, required, timing, browserPublic, expectedFormat, safeExample, missingBehavior, owner]]) => ({
  name,
  discoveredIn: [...(usage.get(name) ?? [])].sort(),
  required,
  timing,
  classification,
  public: browserPublic,
  secret: classification === "private_server_secret" || name.includes("SERVICE_ROLE"),
  local: ["local_development_only", "test_only"].includes(classification) || name.startsWith("VITE_"),
  test: classification === "test_only" || name === "VITE_SUPABASE_TEST_SERVICE_ROLE_KEY",
  preview: name.startsWith("VITE_"),
  production: ["production_required", "public_client_configuration", "private_server_secret", "generated", "optional_feature"].includes(classification),
  expectedFormat,
  safeExample,
  validationRule: browserPublic && /(SECRET|SERVICE_ROLE)/.test(name) ? "forbidden" : required ? "must be present in applicable environment" : "validate when enabled",
  defaultBehavior: safeExample,
  missingVariableBehavior: missingBehavior,
  rotationConsiderations: classification === "private_server_secret" ? "rotate through hosted secret manager; never expose in Vite" : "rebuild if build-time value changes",
  owner,
  deploymentGate: required || classification === "private_server_secret",
  documentedInTemplate: new RegExp(`^#?\\s*${name}=`, "m").test(template),
  documentationReference: ".env.example and DEPLOYMENT_HARDENING_LOCAL_PREPARATION.md",
}))

const unsafeClientSecrets = environment.filter(item => item.name.startsWith("VITE_") && item.secret && !item.test)
if (unsafeClientSecrets.length) throw new Error(`Secret-like Vite variables: ${unsafeClientSecrets.map(item => item.name).join(", ")}`)

const migrationsDir = join(root, "supabase/migrations")
const migrationFiles = readdirSync(migrationsDir).filter(name => /^\d{14}_.+\.sql$/.test(name)).sort()
const timestamps = migrationFiles.map(name => name.slice(0, 14))
if (new Set(timestamps).size !== timestamps.length) throw new Error("Duplicate migration timestamps detected.")
if (migrationFiles.join("\n") !== [...migrationFiles].sort().join("\n")) throw new Error("Migration ordering is unstable.")

function introducingCommitFor(path) {
  try {
    return execFileSync("git", ["log", "--full-history", "--all", "--format=%H", "--", path], { encoding: "utf8" }).trim().split("\n").filter(Boolean).at(-1) ?? null
  } catch { return null }
}

const migrations = migrationFiles.map((filename, index) => {
  const path = `supabase/migrations/${filename}`
  const sql = readFileSync(join(root, path), "utf8")
  const sourceHash = createHash("sha256").update(sql).digest("hex")
  const introducingCommit = introducingCommitFor(path)
  if (check) {
    if (!introducingCommit) throw new Error(`Migration provenance unavailable from Git history: ${filename}`)
    const committedSql = execFileSync("git", ["show", `HEAD:${path}`], { encoding: "utf8" })
    const committedHash = createHash("sha256").update(committedSql).digest("hex")
    if (committedHash !== sourceHash) throw new Error(`Migration differs from the current HEAD snapshot: ${filename}`)
    execFileSync("git", ["cat-file", "-e", `${introducingCommit}:${path}`])
  }
  const drops = [...sql.matchAll(/\bdrop\s+(?:table|column|schema|type|function)\b/gi)].length
  const typeChanges = [...sql.matchAll(/\balter\s+column\b[\s\S]{0,120}\btype\b/gi)].length
  const dataChanges = [...sql.matchAll(/\b(?:update|delete\s+from|insert\s+into)\s+public\./gi)].length
  const nonConcurrentIndexes = [...sql.matchAll(/\bcreate\s+(?:unique\s+)?index\s+(?!concurrently)/gi)].length
  const authority = /\b(?:grant|revoke|create policy|enable row level security)\b/i.test(sql)
  const compatibilityFreeze = /legacy|workspace_records|register_finished_goods_output|commit_packaging_consumption/i.test(sql) && /\brevoke\b/i.test(sql)
  const classification = drops || typeChanges ? "destructive_requires_review"
    : compatibilityFreeze ? "compatibility_freeze"
    : authority ? "authority_change"
    : dataChanges ? "data_backfill"
    : nonConcurrentIndexes ? "potentially_locking"
    : "additive_safe"
  return {
    orderedIndex: index + 1,
    filename,
    timestamp: filename.slice(0, 14),
    milestone: filename.replace(/^\d{14}_/, "").replace(/\.sql$/, "").replaceAll("_", " "),
    purpose: filename.replace(/^\d{14}_/, "").replace(/\.sql$/, "").replaceAll("_", " "),
    dependencies: index ? [migrationFiles[index - 1]] : [],
    requiredExtensions: [...sql.matchAll(/create extension(?: if not exists)?\s+"?([a-z0-9_-]+)"?/gi)].map(match => match[1]).sort(),
    expectedObjectChanges: {
      tables: [...sql.matchAll(/create table(?: if not exists)?\s+(?:public\.)?([a-z0-9_]+)/gi)].map(match => match[1]).sort(),
      functions: [...sql.matchAll(/create(?: or replace)? function\s+(?:public\.)?([a-z0-9_]+)/gi)].map(match => match[1]).sort(),
      policies: [...sql.matchAll(/create policy\s+([a-z0-9_]+)/gi)].map(match => match[1]).sort(),
      indexes: nonConcurrentIndexes,
    },
    expectedDataChanges: dataChanges,
    lockRisk: nonConcurrentIndexes || typeChanges ? "requires_rehearsal_measurement" : "low",
    tableRewriteRisk: typeChanges ? "possible" : "not_detected",
    destructiveBehavior: drops ? `${drops} DROP statement(s) require statement-level review` : "none detected",
    longTransactionRisk: dataChanges > 5 ? "requires_rehearsal_measurement" : "low_or_unknown",
    durationClass: dataChanges || nonConcurrentIndexes ? "measure_in_rehearsal" : "short_expected",
    classification,
    rollbackClassification: drops || dataChanges ? "backup_and_forward_fix_decision_required" : "code_rollback_or_forward_fix",
    forwardFixStrategy: "append a reviewed migration; never rewrite immutable business history",
    verificationQuery: "compare migration head, authority inventory, object counts, grants, RLS, and focused domain contracts",
    stopCondition: drops || typeChanges ? "unapproved destructive behavior or unexpected rewrite/lock" : "migration error, drift, timeout, or object mismatch",
    hostedApplicationStatus: "pending_rehearsal",
    authorizationRequired: true,
    sourceHash,
  }
})

const commands = [
  ["npm run audit:environment", "safe_local_read_only", "Classify environment and migration evidence"],
  ["npm run deploy:preflight", "safe_local_read_only", "Run local deployment preparation gates"],
  ["npx supabase db reset --local", "safe_local_mutation", "Recreate disposable local database"],
  ["npm run restore:local:verify", "safe_local_mutation", "Verify local schema recovery in a disposable database"],
  ["supabase migration list --linked", "remote_read_only", "Inspect hosted migration state"],
  ["supabase db dump --linked", "remote_read_only_sensitive_output", "Capture authorized hosted logical backup"],
  ["supabase db push --linked", "remote_mutation_requires_authorization", "Apply reviewed hosted migrations"],
  ["supabase functions deploy", "remote_mutation_requires_authorization", "Deploy Edge Functions"],
  ["supabase secrets set", "production_mutation_requires_final_approval", "Set hosted Edge Function secrets"],
  ["git push", "remote_mutation_requires_authorization", "Publish reviewed branch"],
  ["git push --tags", "remote_mutation_requires_authorization", "Publish approved tags"],
  ["destructive SQL against live production", "prohibited_or_unsafe", "Never use as rehearsal rollback"],
].map(([command, classification, purpose]) => ({
  command, classification, purpose,
  environment: classification.startsWith("safe_local") ? "local" : "hosted_or_production",
  mutationRisk: classification.includes("mutation") || classification === "prohibited_or_unsafe",
  requiredRole: classification.startsWith("safe_local") ? "developer" : "authorized operator",
  requiredApproval: classification.startsWith("safe_local") ? "none beyond task scope" : "explicit phase approval",
  expectedOutput: "recorded command result and evidence artifact",
  stopCondition: "unexpected target, credentials, mutation, error, drift, or evidence mismatch",
  evidenceCaptured: true,
}))

const artifacts = {
  "deployment-environment-inventory.json": {
    version: "1.0.0", generatedAt: fixedTimestamp, rcTag, rcCommit,
    status: "PASS", variables: environment,
    summary: { total: environment.length, secrets: environment.filter(item => item.secret).length, unknown: 0, unsafeClientSecrets: 0 },
  },
  "hosted-migration-rehearsal-manifest.json": {
    version: "1.1.0", generatedAt: fixedTimestamp, rcTag, rcCommit,
    localMigrationHead: migrations.at(-1)?.timestamp, hostedStateVerified: false,
    count: migrations.length,
    provenance: {
      invariant: "Committed evidence never stores the hash of the commit containing that evidence.",
      stableIdentityFields: ["orderedIndex", "timestamp", "filename", "sourceHash"],
      introducingCommitResolution: "Derived at audit runtime with Git history; never persisted in this manifest.",
      headVerification: "Each migration SHA-256 is compared with the same path at current HEAD during audit check.",
      cleanTreeGate: "deploy:preflight requires a clean working tree before running this audit.",
    },
    migrations,
  },
  "deployment-command-inventory.json": {
    version: "1.0.0", generatedAt: fixedTimestamp, rcTag, rcCommit,
    noRemoteCommandExecuted: true, commands,
  },
  "deployment-local-readiness.json": {
    version: "1.0.0", generatedAt: fixedTimestamp, rcTag, rcCommit,
    environmentAudit: "PASS", migrationAudit: "PASS", secretClassification: "PASS",
    localPreparationReady: true, hostedRehearsalReady: false, deploymentReady: false,
    hostedRehearsalBlockers: ["explicit authorization", "approved isolated target", "backup destination and restore owner", "hosted credentials supplied out-of-band"],
    deploymentBlockers: ["successful hosted rehearsal", "hosted security and two-owner proof", "rollback proof", "production approval"],
    remoteActionsPerformed: false,
  },
}

for (const [name, value] of Object.entries(artifacts)) {
  const path = join(generated, name)
  const rendered = `${JSON.stringify(value, null, 2)}\n`
  if (write) writeFileSync(path, rendered)
  else if (!existsSync(path) || readFileSync(path, "utf8") !== rendered) throw new Error(`Deployment audit drift: ${name}. Run npm run audit:environment:write.`)
}

console.log(JSON.stringify({
  status: "PASS", variables: environment.length, migrations: migrations.length,
  commands: commands.length, rcTag, rcCommit,
}, null, 2))
