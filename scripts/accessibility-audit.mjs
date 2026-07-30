import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const root=process.cwd()
const checks=[
  ["dashboard","src/features/dashboard/DashboardPage.tsx"],
  ["production","src/features/production/ProductionPage.tsx"],
  ["finished-goods","src/features/finished-goods-control/FinishedGoodsLotPage.tsx"],
  ["traceability","src/features/traceability/TraceabilityPage.tsx"],
  ["recall-readiness","src/features/recall-readiness/RecallReadinessPage.tsx"],
  ["compliance","src/features/compliance/CompliancePage.tsx"],
]
const findings=[]
for(const [route,file] of checks){
  const source=readFileSync(join(root,file),"utf8")
  if(!/(<PageHeader|<h1[\s>])/.test(source))findings.push({route,file,rule:"page-heading"})
}
const fallback=readFileSync(join(root,"src/components/ui/RouteLoadingFallback.tsx"),"utf8")
if(!/role="status"/.test(fallback)||!/aria-live="polite"/.test(fallback)){
  findings.push({route:"all-lazy-routes",file:"src/components/ui/RouteLoadingFallback.tsx",rule:"announced-loading-state"})
}
const report={
  auditVersion:"1.0.0",
  generatedAt:"2026-07-29T12:00:00+02:00",
  scope:checks.map(([route])=>route),
  status:findings.length?"FAIL":"PASS",
  findings,
  limitations:["Static gate only; keyboard, focus order, contrast, and screen-reader behaviour still require browser verification."],
}
writeFileSync(join(root,"docs/generated/accessibility-audit.json"),`${JSON.stringify(report,null,2)}\n`)
console.log(JSON.stringify(report,null,2))
if(findings.length)process.exitCode=1
