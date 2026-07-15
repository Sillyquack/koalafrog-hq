import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n').filter(Boolean)
const checks=[
  ['Supabase secret key',/sb_secret_[A-Za-z0-9_-]{12,}/g],
  ['service-role JWT',/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g],
  ['hard-coded password assignment',/\bpassword\s*=\s*["'][^"']{8,}["']/g],
]
const findings=[]
for(const file of files){
  if(file==='package-lock.json'||file.startsWith('dist/'))continue
  let source
  try{source=readFileSync(file,'utf8')}catch{continue}
  for(const [label,pattern] of checks){
    pattern.lastIndex=0
    if(pattern.test(source))findings.push(`${file}: ${label}`)
  }
}
if(findings.length){
  console.error(`Potential committed secrets found:\n${findings.join('\n')}`)
  process.exit(1)
}
console.log(`Secret scan passed (${files.length} repository files checked).`)
