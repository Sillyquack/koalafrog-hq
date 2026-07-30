import {execFileSync} from "node:child_process"
import {existsSync,readFileSync,writeFileSync} from "node:fs"
import {basename,join} from "node:path"

const root=process.cwd()
const mode=process.argv[2]
if(!["--write","--check"].includes(mode)){
  console.error("Usage: node scripts/release-1-0-baseline.mjs --write|--check")
  process.exit(2)
}

const baselinePath=join(root,"docs/RELEASE_1_0_BASELINE.md")
const evidencePath=join(root,"docs/generated/release-1-0-baseline.json")
const authoritativeCommit="638c0ea3ff67bc086776085d5605a59bd74cde5f"
const requiredEvidence=[
  "docs/MIGRATION_PROVENANCE_RECONCILIATION.md",
  "docs/generated/migration-provenance-reconciliation.json",
  "docs/generated/production-migration-62-to-87-report.md",
  "docs/generated/production-migration-62-to-87-evidence.json",
  "docs/generated/rc2-rehearsal-report.md",
  "docs/generated/rc2-rehearsal-evidence.json",
  "docs/generated/rc2-parity-evidence.json",
  "docs/generated/rc2-deployment-evidence.json",
  "docs/generated/controlled-merge-review-manifest.json",
  "docs/generated/finished-goods-traceability-recall-rc.json",
  "docs/generated/platform-authority-inventory.json",
  "docs/generated/privilege-audit.json",
  "docs/generated/local-restore-readiness.json",
  "docs/generated/documentation-audit.json"
]

const readJson=path=>JSON.parse(readFileSync(join(root,path),"utf8"))
const git=(...args)=>execFileSync("git",args,{cwd:root,encoding:"utf8"}).trim()
const migrations=execFileSync("find",["supabase/migrations","-maxdepth","1","-type","f","-name","*.sql"],{cwd:root,encoding:"utf8"}).trim().split("\n").filter(Boolean)
const findings=[]
const check=(condition,message)=>{if(!condition)findings.push(message)}

check(git("merge-base","--is-ancestor",authoritativeCommit,"HEAD")==="",`Authoritative commit ${authoritativeCommit} is not an ancestor of HEAD.`)
check(migrations.length===87,`Expected 87 migrations; found ${migrations.length}.`)
for(const path of requiredEvidence)check(existsSync(join(root,path)),`Missing required evidence: ${path}.`)
check(existsSync(baselinePath),"Missing docs/RELEASE_1_0_BASELINE.md.")

const production=readJson("docs/generated/production-migration-62-to-87-evidence.json")
const rehearsal=readJson("docs/generated/rc2-rehearsal-evidence.json")
const parity=readJson("docs/generated/rc2-parity-evidence.json")
const rc=readJson("docs/generated/finished-goods-traceability-recall-rc.json")
const expected={
  schemaVersion:1,
  generatedAt:"2026-07-30T12:30:00+02:00",
  release:{
    name:"Koalafrog HQ Release 1.0 Foundation",
    date:"2026-07-30",
    applicationVersion:"0.13.0",
    status:"ACCEPTED_FOR_VERIFIED_SCOPE"
  },
  repository:{
    name:"Sillyquack/koalafrog-hq",
    productionBranch:"main",
    authoritativeCommit,
    evidenceBranch:"docs/release-1-0-baseline"
  },
  database:{
    migrationCount:87,
    immutableProductionPrefix:62,
    strictReleaseSuffix:25,
    status:production.disposition,
    schemaCounts:{...production.schemaCounts,rlsTables:parity.counts.rlsTables,tableGrants:parity.counts.tableGrants,routineGrants:parity.counts.routineGrants}
  },
  environments:{
    production:{projectRef:production.production.projectRef,status:production.production.status,region:production.production.region},
    rc2Rehearsal:{projectRef:rehearsal.rehearsalProjectRef,status:"ACTIVE_HEALTHY",retainedAtBaseline:true},
    cloudflareProduction:{project:"koalafrog-hq",branch:"main",url:"https://koalafrog-hq.pages.dev"},
    cloudflarePreview:{binding:"isolated preview variables; last validated against RC2"},
    localSupabase:{status:"PASS"},
    githubMain:{commit:authoritativeCommit}
  },
  recovery:{
    backupType:"physical",
    sourceBackupTimestamp:rehearsal.backup.timestamp,
    restoreToNewProject:"PASS",
    authDatabaseRecordsPreserved:true,
    policy:"forward-fix for applied production migrations; restore only by explicit recovery decision"
  },
  tests:{
    pgTap:{status:"PASS",count:rc.testCounts.pgTap},
    supabaseIntegration:{status:"PASS",count:rc.testCounts.supabaseIntegration},
    unitComponent:{status:"PASS",passed:rc.testCounts.unitPassed,skipped:rc.testCounts.unitSkipped},
    desktopE2e:{status:"PASS",count:rc.e2eCounts.desktopPassed},
    mobileE2e:{status:"PASS",count:rc.e2eCounts.mobilePassed},
    lint:"PASS",
    build:"PASS",
    accessibility:"PASS_WITH_RECORDED_LIMITATIONS",
    documentation:"PASS",
    secrets:"PASS",
    authority:"PASS",
    privileges:"PASS",
    migrations:"PASS",
    deploymentPreparation:"PASS",
    mergeReview:"PASS",
    restoreVerification:"PASS",
    productionSmoke:{status:"PASS",routes:16,writePerformed:false}
  },
  security:{
    authOwnership:"private workspace owner",
    rlsParity:"PASS",
    twoOwnerIsolation:"PASS",
    rpcIsolation:"PASS",
    securityDefinerHardening:"PASS",
    grantsAndRevokes:"PASS",
    productionAuthPreserved:"PASS",
    secretScan:"PASS",
    acceptedAdvisorWarnings:true
  },
  knownIssues:[
    {issue:25,status:"OPEN",advisory:"GHSA-qwww-vcr4-c8h2",severity:"high",acceptance:"documented constrained risk; automated release monitoring active"},
    {id:"large-main-chunk",status:"ACCEPTED",impact:"performance optimization opportunity"},
    {id:"platform-page-dynamic-import",status:"ACCEPTED",impact:"code-splitting optimization opportunity"}
  ],
  evidenceFiles:requiredEvidence,
  openIssues:[25],
  acceptance:{
    status:"ACCEPTED_FOR_VERIFIED_SCOPE",
    technicalFoundationOnly:true,
    legalOrRegulatoryApproval:false,
    allFutureWorkflowsComplete:false
  }
}

const baseline=existsSync(baselinePath)?readFileSync(baselinePath,"utf8"):""
const critical=[
  expected.release.name,
  expected.release.date,
  expected.release.applicationVersion,
  expected.repository.name,
  expected.repository.authoritativeCommit,
  String(expected.database.migrationCount),
  expected.environments.production.projectRef,
  expected.environments.rc2Rehearsal.projectRef,
  expected.recovery.sourceBackupTimestamp,
  "GHSA-qwww-vcr4-c8h2",
  "Issue #25",
  "ACCEPTED FOR THE VERIFIED SCOPE"
]
for(const value of critical)check(baseline.includes(value),`Markdown baseline is missing critical value: ${value}.`)
check(readFileSync(join(root,"docs/generated/production-migration-62-to-87-report.md"),"utf8").includes("Disposition: **PASS**"),"Production migration report does not record PASS.")
check(readFileSync(join(root,"docs/generated/rc2-rehearsal-report.md"),"utf8").includes("Disposition: **PASS**"),"RC2 rehearsal report does not record PASS.")

const secretPatterns=[
  /(?:postgres(?:ql)?:\/\/)[^\s)]+/i,
  /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/,
  /\bsb_secret_[a-zA-Z0-9_-]+/,
  /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*\S+/i
]
for(const [label,source] of [["Markdown",baseline],["generated JSON",JSON.stringify(expected)]]){
  for(const pattern of secretPatterns)check(!pattern.test(source),`${label} appears to contain a secret matching ${pattern}.`)
}

if(mode==="--write"&&findings.length===0)writeFileSync(evidencePath,`${JSON.stringify(expected,null,2)}\n`)
if(mode==="--check"){
  check(existsSync(evidencePath),"Missing generated release baseline JSON.")
  if(existsSync(evidencePath)){
    const actual=readJson("docs/generated/release-1-0-baseline.json")
    check(JSON.stringify(actual)===JSON.stringify(expected),"Generated JSON does not match the authoritative baseline model; run audit:release-1-0:write.")
  }
}

const result={status:findings.length?"FAIL":"PASS",mode:mode.slice(2),authoritativeCommit,migrationCount:migrations.length,evidenceFiles:requiredEvidence.length,findings}
console.log(JSON.stringify(result,null,2))
if(findings.length)process.exitCode=1
