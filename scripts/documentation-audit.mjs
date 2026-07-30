import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { dirname, extname, join, normalize, relative } from "node:path"

const root=process.cwd()
const walk=directory=>readdirSync(directory).sort().flatMap(name=>{
  const path=join(directory,name)
  return statSync(path).isDirectory()?walk(path):[path]
})
const files=walk(join(root,"docs")).filter(path=>extname(path)===".md")
const findings=[]
for(const file of files){
  const source=readFileSync(file,"utf8")
  const fences=(source.match(/```/g)??[]).length
  if(fences%2)findings.push({file:relative(root,file),rule:"balanced-code-fences"})
  source.split("\n").forEach((line,index)=>{
    if(/[ \t]+$/.test(line)&&!/ {2}$/.test(line))findings.push({file:relative(root,file),line:index+1,rule:"trailing-whitespace"})
  })
  for(const match of source.matchAll(/\[[^\]]+\]\((?!https?:|mailto:|#)([^)#]+)(?:#[^)]+)?\)/g)){
    const target=normalize(join(dirname(file),decodeURIComponent(match[1])))
    if(!existsSync(target))findings.push({file:relative(root,file),rule:"broken-relative-link",target:relative(root,target)})
  }
}
const releaseBaselinePath=join(root,"docs/RELEASE_1_0_BASELINE.md")
const releaseEvidencePath=join(root,"docs/generated/release-1-0-baseline.json")
if(!existsSync(releaseBaselinePath))findings.push({file:"docs/RELEASE_1_0_BASELINE.md",rule:"required-release-baseline"})
if(!existsSync(releaseEvidencePath))findings.push({file:"docs/generated/release-1-0-baseline.json",rule:"required-release-baseline-evidence"})
if(existsSync(releaseBaselinePath)&&existsSync(releaseEvidencePath)){
  const baseline=readFileSync(releaseBaselinePath,"utf8")
  const evidence=JSON.parse(readFileSync(releaseEvidencePath,"utf8"))
  const critical=[
    ["release-name",evidence.release.name],
    ["release-date",evidence.release.date],
    ["authoritative-commit",evidence.repository.authoritativeCommit],
    ["migration-count",String(evidence.database.migrationCount)],
    ["production-project-ref",evidence.environments.production.projectRef],
    ["rehearsal-project-ref",evidence.environments.rc2Rehearsal.projectRef],
    ["issue-25","GHSA-qwww-vcr4-c8h2"],
  ]
  for(const [field,value] of critical){
    if(!baseline.includes(value))findings.push({file:"docs/RELEASE_1_0_BASELINE.md",rule:"release-baseline-critical-field",field})
  }
}
const report={
  auditVersion:"1.0.0",
  generatedAt:"2026-07-29T12:00:00+02:00",
  markdownFiles:files.length,
  status:findings.length?"FAIL":"PASS",
  findings,
}
writeFileSync(join(root,"docs/generated/documentation-audit.json"),`${JSON.stringify(report,null,2)}\n`)
console.log(JSON.stringify({markdownFiles:files.length,status:report.status,findings:findings.length},null,2))
if(findings.length)process.exitCode=1
