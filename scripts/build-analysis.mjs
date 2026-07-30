import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { gzipSync } from "node:zlib"
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

const root=process.cwd()
execFileSync("npm",["run","build"],{cwd:root,stdio:"inherit"})
const assets=join(root,"dist","assets")
const chunks=readdirSync(assets).filter(name=>/\.(js|css)$/.test(name)).sort().map(name=>{
  const content=readFileSync(join(assets,name))
  return{
    file:relative(root,join(assets,name)),
    type:name.endsWith(".js")?"javascript":"css",
    bytes:content.byteLength,
    gzipBytes:gzipSync(content).byteLength,
    sha256:createHash("sha256").update(content).digest("hex"),
  }
})
const javascript=chunks.filter(chunk=>chunk.type==="javascript")
const report={
  auditVersion:"1.0.0",
  generatedAt:"2026-07-29T12:00:00+02:00",
  baseline:{largestJavaScriptBytes:1590270,largestJavaScriptGzipBytes:407400},
  summary:{
    chunkCount:chunks.length,
    javascriptChunkCount:javascript.length,
    totalJavaScriptBytes:javascript.reduce((sum,chunk)=>sum+chunk.bytes,0),
    largestJavaScriptBytes:Math.max(...javascript.map(chunk=>chunk.bytes)),
    largestJavaScriptGzipBytes:Math.max(...javascript.map(chunk=>chunk.gzipBytes)),
  },
  chunks,
}
writeFileSync(join(root,"docs/generated/bundle-analysis.json"),`${JSON.stringify(report,null,2)}\n`)
if(!javascript.length)throw new Error("Build analysis found no JavaScript output.")
console.log(JSON.stringify(report.summary,null,2))
