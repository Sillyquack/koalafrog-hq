import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { extname, join, relative } from "node:path"
import {
  applicationLegacyAllowlist,
  auditVersion,
  canonicalPolicies,
  criticalControlledTables,
  generatedAt,
  intentionallyUnindexedForeignKeys,
  legacyDatabaseObjects,
} from "./platform-audit-config.mjs"

const root = process.cwd()
const generatedDir = join(root, "docs/generated")
const write = process.argv.includes("--write")
const check = process.argv.includes("--check")
if (!write && !check) throw new Error("Use --write or --check.")

const sql = String.raw`
with relation_objects as (
  select n.nspname schema_name,
    case c.relkind when 'r' then 'table' when 'p' then 'table' when 'v' then 'view' when 'm' then 'materialized_view' end object_type,
    c.relname object_name,c.oid,c.relrowsecurity rls_enabled,
    coalesce(c.reltuples,0)::bigint estimated_rows,
    coalesce(array_to_json(c.relacl),'[]'::json) grants
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in('r','p','v','m')
), functions as (
  select n.nspname schema_name,'function' object_type,p.proname object_name,p.oid,false rls_enabled,0::bigint estimated_rows,
    coalesce(array_to_json(p.proacl),'[]'::json) grants,
    pg_get_function_identity_arguments(p.oid) signature,
    p.provolatile volatility,p.prosecdef security_definer,
    coalesce((select option_value from pg_options_to_table(p.proconfig) where option_name='search_path'),'') search_path,
    pg_get_userbyid(p.proowner) owner_name,
    pg_get_function_result(p.oid) return_type,
    pg_get_functiondef(p.oid) definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'
)
select json_build_object(
  'relations',coalesce((select json_agg(json_build_object(
    'schema',schema_name,'objectType',object_type,'name',object_name,'rlsEnabled',rls_enabled,
    'estimatedRows',estimated_rows,'grants',grants,
    'indexes',coalesce((select json_agg(json_build_object('name',ic.relname,'columns',
      (select json_agg(a.attname order by k.ordinality) from unnest(i.indkey) with ordinality k(attnum,ordinality)
       join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum where k.attnum>0),
      'unique',i.indisunique,'valid',i.indisvalid) order by ic.relname)
      from pg_index i join pg_class ic on ic.oid=i.indexrelid where i.indrelid=r.oid),'[]'::json),
    'policies',coalesce((select json_agg(json_build_object('name',pol.polname,'command',pol.polcmd,
      'roles',(select json_agg(rolname order by rolname) from pg_roles where oid=any(pol.polroles)),
      'using',pg_get_expr(pol.polqual,pol.polrelid),'withCheck',pg_get_expr(pol.polwithcheck,pol.polrelid)) order by pol.polname)
      from pg_policy pol where pol.polrelid=r.oid),'[]'::json),
    'foreignKeys',coalesce((select json_agg(json_build_object('name',con.conname,
      'columns',(select json_agg(a.attname order by k.ordinality) from unnest(con.conkey) with ordinality k(attnum,ordinality)
        join pg_attribute a on a.attrelid=con.conrelid and a.attnum=k.attnum),
      'references',con.confrelid::regclass::text) order by con.conname)
      from pg_constraint con where con.conrelid=r.oid and con.contype='f'),'[]'::json),
    'checks',coalesce((select json_agg(json_build_object('name',con.conname,'definition',pg_get_constraintdef(con.oid)) order by con.conname)
      from pg_constraint con where con.conrelid=r.oid and con.contype='c'),'[]'::json),
    'generatedColumns',coalesce((select json_agg(a.attname order by a.attname) from pg_attribute a where a.attrelid=r.oid and a.attgenerated<>''),'[]'::json)
  ) order by schema_name,object_type,object_name) from relation_objects r),'[]'::json),
  'functions',coalesce((select json_agg(json_build_object(
    'schema',schema_name,'objectType',object_type,'name',object_name,'signature',signature,'volatility',volatility,
    'securityDefiner',security_definer,'searchPath',search_path,'owner',owner_name,'returnType',return_type,
    'grants',grants,'definition',definition) order by schema_name,object_name,signature) from functions),'[]'::json),
  'triggers',coalesce((select json_agg(json_build_object('schema',n.nspname,'table',c.relname,'name',t.tgname,
    'function',t.tgfoid::regprocedure::text,'definition',pg_get_triggerdef(t.oid)) order by n.nspname,c.relname,t.tgname)
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and not t.tgisinternal),'[]'::json)
)`

function queryCatalogue() {
  const output = execFileSync("docker", [
    "exec", "supabase_db_koalafrog-hq", "psql", "-U", "postgres", "-d", "postgres",
    "-At", "-v", "ON_ERROR_STOP=1", "-c", sql,
  ], { encoding: "utf8", maxBuffer: 100 * 1024 * 1024 })
  return JSON.parse(output)
}

function walk(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory).sort().flatMap(name => {
    const path = join(directory, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

function domainFor(name) {
  const rules = [
    ["finished_goods", "finished-goods"], ["packaging", "packaging"], ["production", "production"],
    ["inventory", "inventory"], ["procurement", "procurement"], ["purchase", "procurement"],
    ["supplier", "suppliers"], ["formula", "formulas"], ["ingredient", "ingredients"],
    ["compliance", "compliance"], ["launch", "launch"], ["beard", "beard-studio"],
    ["traceability", "traceability"], ["lab_", "lab"], ["test_", "testing"],
  ]
  return rules.find(([token]) => name.includes(token))?.[1] ?? "platform"
}

function classifyRelation(item) {
  const explicit = legacyDatabaseObjects.get(`${item.objectType}:${item.schema}.${item.name}`)
  if (explicit) return explicit
  if (item.objectType !== "table") return { classification: "canonical_read_model", domain: domainFor(item.name) }
  if (/(_events|_event|audit|history)$/.test(item.name)) return { classification: "audit_only", domain: domainFor(item.name) }
  if (/(_movements|_consumptions|_weighings|_inspections|_reviews|_snapshots|_measurements|_reconciliations)$/.test(item.name))
    return { classification: "immutable_history", domain: domainFor(item.name) }
  if (/(operations|idempotency|jobs|attempts|diagnostics|migration_runs|document_objects)/.test(item.name))
    return { classification: "operational_support", domain: domainFor(item.name) }
  if (/(placeholder|reservation|dispatch)/.test(item.name) && !/(inventory_reservations|packaging_run_inventory_reservations)/.test(item.name))
    return { classification: "placeholder_not_implemented", domain: domainFor(item.name) }
  return { classification: "canonical_write_authority", domain: domainFor(item.name) }
}

function classifyFunction(item) {
  const key = `function:${item.schema}.${item.name}(${item.signature})`
  const explicit = legacyDatabaseObjects.get(key)
  if (explicit) return explicit
  if (/^(get_|list_|search_|evaluate_|check_|is_|has_|kf_.*(balance|snapshot|readiness|available|eligible|trace|genealogy))/.test(item.name))
    return { classification: "canonical_read_model", domain: domainFor(item.name) }
  if (/(_pre_|_v[1-9]$|compat|legacy)/.test(item.name))
    return { classification: "compatibility_read_only", domain: domainFor(item.name) }
  return { classification: "canonical_write_authority", domain: domainFor(item.name) }
}

function relationAuthority(item) {
  const metadata = classifyRelation(item)
  const authenticated = item.grants.filter(grant => String(grant).startsWith("authenticated="))
  const writeGrant = authenticated.some(grant => /[awd]/.test(String(grant).split("=")[1]?.split("/")[0] ?? ""))
  return {
    schema: item.schema,
    objectType: item.objectType,
    name: item.name,
    classification: metadata.classification,
    domainOwner: metadata.domain,
    writeAuthority: metadata.classification === "canonical_write_authority" ? "versioned RPC or documented relational command" : "none",
    readAuthority: item.objectType === "table" ? "owner/workspace scoped relation" : "security-invoker projection",
    mutationPath: writeGrant ? "authenticated direct grant (audited)" : "RPC/service/migration only",
    browserWritable: writeGrant,
    rlsEnabled: item.rlsEnabled,
    expectedGrants: item.grants,
    historicalOrCurrent: ["immutable_history", "audit_only", "legacy_frozen"].includes(metadata.classification) ? "historical" : "current",
    replacement: metadata.replacement ?? null,
    deprecationState: metadata.classification,
    evidenceSource: "local PostgreSQL catalogue",
    notes: metadata.notes ?? "",
  }
}

function functionAuthority(item) {
  const metadata = classifyFunction(item)
  const browserCallable = item.grants.some(grant => /^(authenticated|anon)=.*X/.test(String(grant)))
  const read = metadata.classification === "canonical_read_model" || /^(get_|list_|search_|evaluate_|check_|is_|has_)/.test(item.name)
  return {
    schema: item.schema,
    objectType: "function",
    name: item.name,
    signature: item.signature,
    classification: metadata.classification,
    domainOwner: metadata.domain,
    writeAuthority: read ? "none" : `${item.schema}.${item.name}`,
    readAuthority: read ? `${item.schema}.${item.name}` : "result only",
    mutationPath: read ? "none" : "authenticated RPC or internal helper",
    browserWritable: browserCallable && !read,
    rlsEnabled: null,
    expectedGrants: item.grants,
    historicalOrCurrent: metadata.classification.includes("compatibility") || metadata.classification.includes("deprecated") ? "historical" : "current",
    replacement: metadata.replacement ?? null,
    deprecationState: metadata.classification,
    evidenceSource: "local PostgreSQL catalogue and migration source",
    notes: metadata.notes ?? "",
  }
}

function supportingIndexStatus(relation, foreignKey) {
  const columns = foreignKey.columns
  const covered = relation.indexes.some(index => columns.every((column, i) => index.columns?.[i] === column))
  if (covered) return "covered"
  if (intentionallyUnindexedForeignKeys.some(entry => entry.constraint === foreignKey.name)) return "intentionally_unindexed"
  const partial = relation.indexes.some(index => index.columns?.[0] === columns[0])
  return partial ? "partially_covered" : "missing"
}

function moduleDomain(path) {
  const feature = path.match(/src\/features\/([^/]+)/)?.[1]
  if (feature) return feature
  if (path.includes("/platform/")) return "platform"
  if (path.includes("/components/")) return "shared-ui"
  if (path.includes("/types/")) return "shared-domain"
  return "application"
}

function applicationInventory() {
  const files = walk(join(root, "src")).filter(path => [".ts", ".tsx"].includes(extname(path)))
  return files.map(path => {
    const modulePath = relative(root, path)
    const source = readFileSync(path, "utf8")
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(match => match[1]).sort()
    const legacyMatches = ["finished_goods_batches", "finished_goods_movements", "packaging_allocations", "workspace_records",
      "register_finished_goods_output", "commit_packaging_consumption"].filter(token => source.includes(token))
    const kind = /Repository\.ts$|repository\.ts$/.test(path) ? "repository"
      : /Context|Provider/.test(path) ? "provider"
      : /Page\.tsx$/.test(path) ? "route_module"
      : /domain|types/.test(path) ? "domain_module" : "module"
    return {
      modulePath,
      objectType: kind,
      classification: modulePath.includes("/generated/") ? "generated_or_framework"
        : legacyMatches.length ? "compatibility_read_only" : "canonical_read_model",
      domainOwner: moduleDomain(modulePath),
      responsibility: kind.replaceAll("_", " "),
      canonicalRepository: imports.find(value => /Repository/.test(value)) ?? null,
      serverAuthoritativePoliciesConsumed: imports.filter(value => /repository|Repository/.test(value)),
      crossDomainDependencies: imports.filter(value => value.includes("../") && !value.includes(moduleDomain(modulePath))),
      legacyDependency: legacyMatches,
      sizeMetrics: { lines: source.split("\n").length, bytes: Buffer.byteLength(source) },
      riskNotes: source.split("\n").length > 500 ? ["oversized_module"] : [],
    }
  }).sort((a, b) => a.modulePath.localeCompare(b.modulePath))
}

function browserMutationInventory(modules) {
  return modules.filter(module => module.objectType === "repository").flatMap(module => {
    const source = readFileSync(join(root, module.modulePath), "utf8")
    const rpcCalls = [...source.matchAll(/\.rpc\(\s*["']([^"']+)["']/g)].map(match => match[1])
    const directWrites = [...source.matchAll(/\.from\(\s*["']([^"']+)["']\s*\)\.(insert|update|delete|upsert)/g)]
      .map(match => ({ table: match[1], operation: match[2] }))
    return [{
      modulePath: module.modulePath,
      domainOwner: module.domainOwner,
      rpcTargets: [...new Set(rpcCalls)].sort(),
      directTableWrites: directWrites,
      controlledBoundaryViolation: directWrites.some(item => criticalControlledTables.has(item.table)),
      idempotency: source.includes("idempotency") ? "present" : "not_detected",
      revision: source.includes("revision") ? "present" : "not_detected",
      serverDerivedActor: !source.includes("owner_id:"),
    }]
  })
}

function eventTypes() {
  const migrations = walk(join(root, "supabase/migrations")).filter(path => path.endsWith(".sql"))
  const types = new Map()
  for (const path of migrations) {
    const source = readFileSync(path, "utf8")
    for (const match of source.matchAll(/(?:event_type|type|event_name)\s*[,=]\s*'([a-z][a-z0-9_.-]+)'/gi)) {
      const type = match[1]
      if (!types.has(type)) types.set(type, new Set())
      types.get(type).add(relative(root, path))
    }
  }
  return [...types].map(([type, sources]) => ({
    type,
    domainOwner: domainFor(type),
    sources: [...sources].sort(),
    classification: "audit_only",
    documented: true,
  })).sort((a, b) => a.type.localeCompare(b.type))
}

function legacyDependencyFindings(modules) {
  const allowed = new Map(applicationLegacyAllowlist.map(entry => [entry.path, entry]))
  return modules.filter(module => module.legacyDependency.length).map(module => ({
    modulePath: module.modulePath,
    references: module.legacyDependency,
    status: allowed.has(module.modulePath) ? "allowed_compatibility" : "forbidden_active_dependency",
    allowance: allowed.get(module.modulePath) ?? null,
  }))
}

function privilegeFindings(catalogue) {
  const findings = []
  for (const fn of catalogue.functions) {
    const publicExecute = fn.grants.some(grant => String(grant).startsWith("=X"))
    const anonExecute = fn.grants.some(grant => String(grant).startsWith("anon=") && String(grant).includes("X"))
    if (publicExecute) findings.push({ severity: "critical", type: "public_execute", object: `public.${fn.name}(${fn.signature})` })
    if (anonExecute) findings.push({ severity: "critical", type: "anon_execute", object: `public.${fn.name}(${fn.signature})` })
    if (fn.securityDefiner && fn.searchPath === "") findings.push({ severity: "critical", type: "mutable_search_path", object: `public.${fn.name}(${fn.signature})` })
  }
  for (const relation of catalogue.relations) {
    if (relation.objectType === "table" && !relation.rlsEnabled)
      findings.push({ severity: "critical", type: "rls_disabled", object: `public.${relation.name}` })
    const write = relation.grants.some(grant => String(grant).startsWith("authenticated=") && /[awd]/.test(String(grant).split("=")[1]?.split("/")[0] ?? ""))
    if (criticalControlledTables.has(relation.name) && write)
      findings.push({ severity: "critical", type: "controlled_direct_write", object: `public.${relation.name}` })
  }
  return findings.sort((a, b) => a.object.localeCompare(b.object) || a.type.localeCompare(b.type))
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]))
  return value
}
const stringify = value => `${JSON.stringify(stable(value), null, 2)}\n`

function buildArtifacts() {
  const catalogue = queryCatalogue()
  const modules = applicationInventory()
  const databaseAuthorities = [
    ...catalogue.relations.map(relationAuthority),
    ...catalogue.functions.map(functionAuthority),
    ...catalogue.triggers.map(trigger => ({
      schema: trigger.schema, objectType: "trigger", name: `${trigger.table}.${trigger.name}`,
      classification: "operational_support", domainOwner: domainFor(trigger.table), writeAuthority: trigger.function,
      readAuthority: "none", mutationPath: "database trigger", browserWritable: false, rlsEnabled: null,
      expectedGrants: [], historicalOrCurrent: "current", replacement: null, deprecationState: "operational_support",
      evidenceSource: "local PostgreSQL catalogue", notes: trigger.definition,
    })),
    ...catalogue.relations.flatMap(relation => relation.policies.map(policy => ({
      schema: relation.schema, objectType: "rls_policy", name: `${relation.name}.${policy.name}`,
      classification: "operational_support", domainOwner: domainFor(relation.name), writeAuthority: "database policy",
      readAuthority: "database policy", mutationPath: "RLS", browserWritable: false, rlsEnabled: true,
      expectedGrants: policy.roles, historicalOrCurrent: "current", replacement: null, deprecationState: "operational_support",
      evidenceSource: "local PostgreSQL catalogue", notes: `${policy.command}: ${policy.using ?? ""} ${policy.withCheck ?? ""}`.trim(),
    }))),
  ].sort((a, b) => `${a.objectType}:${a.schema}.${a.name}`.localeCompare(`${b.objectType}:${b.schema}.${b.name}`))
  const fkAudit = catalogue.relations.flatMap(relation => relation.foreignKeys.map(foreignKey => ({
    schema: relation.schema,
    table: relation.name,
    constraint: foreignKey.name,
    columns: foreignKey.columns,
    references: foreignKey.references,
    estimatedRows: relation.estimatedRows,
    status: supportingIndexStatus(relation, foreignKey),
    recommendation: supportingIndexStatus(relation, foreignKey) === "missing" ? `Review index (${foreignKey.columns.join(", ")}) using query and growth evidence.` : null,
  }))).sort((a, b) => `${a.table}:${a.constraint}`.localeCompare(`${b.table}:${b.constraint}`))
  const mutations = browserMutationInventory(modules)
  const legacy = legacyDependencyFindings(modules)
  const privileges = privilegeFindings(catalogue)
  const events = eventTypes()
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()
  const counts = {
    tables: catalogue.relations.filter(item => item.objectType === "table").length,
    views: catalogue.relations.filter(item => item.objectType === "view").length,
    materializedViews: catalogue.relations.filter(item => item.objectType === "materialized_view").length,
    functions: catalogue.functions.length,
    triggers: catalogue.triggers.length,
    policies: catalogue.relations.reduce((sum, item) => sum + item.policies.length, 0),
    indexes: catalogue.relations.reduce((sum, item) => sum + item.indexes.length, 0),
    foreignKeys: fkAudit.length,
    repositories: modules.filter(item => item.objectType === "repository").length,
    routes: (readFileSync(join(root, "src/app/App.tsx"), "utf8").match(/<Route\b/g) ?? []).length,
    providers: modules.filter(item => item.objectType === "provider").length,
  }
  const sourceHash = createHash("sha256").update(stringify({ databaseAuthorities, modules, fkAudit, mutations, events })).digest("hex")
  return new Map([
    ["platform-authority-inventory.json", {
      version: auditVersion, generatedAt, sourceCommit: commit, sourceHash, databaseObjects: databaseAuthorities, applicationObjects: modules,
    }],
    ["database-object-inventory.json", { version: auditVersion, generatedAt, counts, relations: catalogue.relations.map(({ indexes, policies, foreignKeys, checks, generatedColumns, ...relation }) => ({ ...relation, indexes, policies, foreignKeys, checks, generatedColumns })), triggers: catalogue.triggers }],
    ["function-rpc-inventory.json", { version: auditVersion, generatedAt, functions: catalogue.functions.map(({ definition, ...fn }) => ({ ...fn, sourceLength: definition.split("\n").length, approximateComplexity: (definition.match(/\b(if|loop|select|insert|update|delete)\b/gi) ?? []).length })) }],
    ["foreign-key-index-audit.json", { version: auditVersion, generatedAt, summary: Object.fromEntries(["covered", "partially_covered", "missing", "intentionally_unindexed"].map(status => [status, fkAudit.filter(item => item.status === status).length])), findings: fkAudit }],
    ["privilege-audit.json", { version: auditVersion, generatedAt, criticalFindingCount: privileges.length, findings: privileges }],
    ["module-ownership-inventory.json", { version: auditVersion, generatedAt, modules }],
    ["browser-mutation-inventory.json", { version: auditVersion, generatedAt, repositories: mutations }],
    ["legacy-dependency-audit.json", { version: auditVersion, generatedAt, findings: legacy }],
    ["event-type-inventory.json", { version: auditVersion, generatedAt, eventTypes: events }],
    ["canonical-policy-ownership.json", { version: auditVersion, generatedAt, policies: canonicalPolicies.map(([policy, serverAuthority, domainOwner, version]) => ({ policy, serverAuthority, domainOwner, version, browserAuthoritative: false })) }],
    ["platform-release-baseline.json", {
      version: auditVersion, milestone: "Platform Hardening & Legacy Authority Classification V1", generatedAt,
      branch: execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim(), sourceCommit: commit,
      environmentClassification: "local_only", locallyValidated: true, remotelyDeployed: false, hostedMigrationApplied: false,
      deploymentApprovalGranted: false, authorityInventoryVersion: auditVersion,
      migrationHead: readdirSync(join(root, "supabase/migrations")).sort().at(-1)?.split("_")[0], schemaCounts: counts,
      knownWarnings: ["Largest measured JavaScript chunk remains above 500 kB after route splitting", "PlatformPage dynamic import is ineffective because WorkspaceRuntime imports it eagerly", "two established database lint warnings", "Supabase CLI update notice", "NO_COLOR is ignored when Playwright forces colour"],
      acceptedDebt: ["Product-wide trace aggregation threshold", "legacy compatibility retained read-only", "event envelope remains domain-specific"],
      deploymentPrerequisites: ["hosted migration approval", "post-migration hosted advisor review", "hosted backup and restore rehearsal", "two-owner hosted proof", "production smoke approval"],
    }],
  ])
}

const artifacts = buildArtifacts()
const critical = []
for (const finding of artifacts.get("privilege-audit.json").findings) critical.push(finding)
for (const finding of artifacts.get("legacy-dependency-audit.json").findings.filter(item => item.status === "forbidden_active_dependency")) critical.push(finding)
for (const repository of artifacts.get("browser-mutation-inventory.json").repositories.filter(item => item.controlledBoundaryViolation)) critical.push(repository)

if (write) {
  mkdirSync(generatedDir, { recursive: true })
  for (const [name, value] of artifacts) writeFileSync(join(generatedDir, name), stringify(value))
}
if (check) {
  for (const [name, value] of artifacts) {
    const path = join(generatedDir, name)
    if (!existsSync(path) || readFileSync(path, "utf8") !== stringify(value)) throw new Error(`Generated audit drift: ${name}. Run npm run audit:write.`)
  }
}
if (critical.length) {
  console.error(JSON.stringify({ status: "FAIL", critical }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ status: "PASS", artifacts: artifacts.size, counts: artifacts.get("database-object-inventory.json").counts }, null, 2))
