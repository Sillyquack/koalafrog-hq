import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'

const root=new URL('../',import.meta.url)
const read=path=>readFile(new URL(path,root),'utf8')
const redirects=await read('public/_redirects')
assert.match(redirects,/^\/\* \/index\.html 200\s*$/,'Cloudflare SPA fallback is missing')

const html=await read('index.html')
assert.match(html,/name="viewport"/)
assert.match(html,/rel="manifest" href="\/manifest\.webmanifest"/)
assert.match(html,/apple-mobile-web-app-title/)

const manifest=JSON.parse(await read('public/manifest.webmanifest'))
assert.equal(manifest.start_url,'/')
assert.equal(manifest.scope,'/')
for(const icon of manifest.icons){
 await read(`public${icon.src}`)
}

async function sourceFiles(directory){
 const entries=await readdir(directory,{withFileTypes:true})
 const nested=await Promise.all(entries.map(entry=>entry.isDirectory()?sourceFiles(join(directory,entry.name)):[join(directory,entry.name)]))
 return nested.flat()
}
const sourceRoot=fileURLToPath(new URL('src/',root))
const frontend=(await sourceFiles(sourceRoot)).filter(path=>/\.(?:ts|tsx|js|jsx)$/.test(path)&&!/(?:\.test|\.spec|\.integration\.test)\.(?:ts|tsx|js|jsx)$/.test(path))
const source=(await Promise.all(frontend.map(path=>readFile(path,'utf8')))).join('\n')
assert.doesNotMatch(source,/VITE_[A-Z0-9_]*(?:SERVICE_ROLE|SECRET_KEY)/i,'Frontend source references a privileged Vite credential')
assert.doesNotMatch(source,/https:\/\/[^'"\s]+\.pages\.dev/i,'Frontend source hard-codes a Pages hostname')

console.log('Cloudflare Pages readiness checks passed.')
