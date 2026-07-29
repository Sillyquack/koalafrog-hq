import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { writeFileSync } from "node:fs"

const container = "supabase_db_koalafrog-hq"
const database = `koalafrog_restore_verify_${process.pid}`
if (!/^koalafrog_restore_verify_\d+$/.test(database)) throw new Error("Unsafe disposable database name.")

const docker = (args, options = {}) => execFileSync("docker", ["exec", ...args], {
  encoding: "utf8", maxBuffer: 150 * 1024 * 1024, ...options,
})
const query = (databaseName, sql) => docker([
  container, "psql", "-U", "postgres", "-d", databaseName, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql,
]).trim()
const countsSql = `
select json_build_object(
  'tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p')),
  'functions',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'),
  'policies',(select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
  'triggers',(select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal),
  'indexes',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='i')
)`

let created = false
try {
  const rawDump = docker([
    container, "pg_dump", "-U", "postgres", "-d", "postgres",
    "--schema-only", "--no-owner", "--no-privileges",
  ])
  const dump = rawDump.replace(/^.*log_min_messages.*\n/gm, "")
  query("postgres", `create database ${database}`)
  created = true
  execFileSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1"], {
    input: dump, encoding: "utf8", maxBuffer: 150 * 1024 * 1024,
  })
  const source = JSON.parse(query("postgres", countsSql))
  const restored = JSON.parse(query(database, countsSql))
  if (JSON.stringify(source) !== JSON.stringify(restored)) {
    throw new Error(`Restore count mismatch: ${JSON.stringify({ source, restored })}`)
  }
  const report = {
    version: "1.0.0",
    generatedAt: "2026-07-29T14:00:00+02:00",
    environment: "local_disposable_database",
    sourceDatabase: "local Supabase postgres",
    dumpPersisted: false,
    schemaSha256: createHash("sha256").update(dump).digest("hex"),
    source,
    restored,
    status: "PASS",
    hostedRecoveryProven: false,
  }
  writeFileSync("docs/generated/local-restore-readiness.json", `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
} finally {
  if (created) query("postgres", `drop database if exists ${database} with (force)`)
}
