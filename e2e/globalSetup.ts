import{execFileSync}from'node:child_process'
import{mkdirSync,writeFileSync}from'node:fs'
import{resolve}from'node:path'

export const runtimePath=resolve('test-results/e2e-owner.json')
export default function globalSetup(){
 const output=execFileSync('node',['scripts/browser-test-owner.mjs'],{encoding:'utf8'})
 const line=output.trim().split('\n').at(-1)
 if(!line)throw new Error('Ephemeral owner helper returned no credentials.')
 const owner=JSON.parse(line)as{userId:string;email:string;password:string;url:string;publishableKey:string}
 if(!/^http:\/\/(127\.0\.0\.1|localhost):/.test(owner.url))throw new Error('E2E refuses non-local Supabase.')
 mkdirSync(resolve('test-results'),{recursive:true})
 writeFileSync(runtimePath,JSON.stringify({...owner,runId:crypto.randomUUID()}),{mode:0o600})
}
