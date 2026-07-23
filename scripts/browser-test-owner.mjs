import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

const status=execFileSync('npx',['supabase','status','-o','env'],{encoding:'utf8'})
const values=Object.fromEntries(status.split('\n').map(line=>line.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(match=>[match[1],match[2]]))
const url=values.API_URL??'http://127.0.0.1:54321',anon=values.ANON_KEY??values.PUBLISHABLE_KEY,service=values.SERVICE_ROLE_KEY??values.SECRET_KEY
if(!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url))throw new Error('Browser test owners may only be managed in local Supabase.')
if(!anon||!service)throw new Error('Local Supabase keys are unavailable. Run `npx supabase start` first.')
const admin=createClient(url,service,{auth:{persistSession:false}})
if(process.argv[2]==='orphans'){
  const users=await admin.auth.admin.listUsers({page:1,perPage:1000})
  if(users.error)throw users.error
  const orphanIds=users.data.users.filter(user=>user.email?.startsWith('koalafrog-browser-')).map(user=>user.id)
  console.log(JSON.stringify({count:orphanIds.length,userIds:orphanIds}))
}else if(process.argv[2]==='delete'){
  const id=process.argv[3]
  if(!id)throw new Error('Usage: node scripts/browser-test-owner.mjs delete <user-id>')
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw new Error('Browser test owner ID must be a UUID.')
  const cleanup=`begin;
delete from public.procurement_recommendations where owner_id='${id}'::uuid;
delete from public.procurement_offer_candidates where owner_id='${id}'::uuid;
delete from public.procurement_research_jobs where owner_id='${id}'::uuid;
delete from public.procurement_supplier_offers where owner_id='${id}'::uuid;
delete from auth.users where id='${id}'::uuid;
commit;`
  execFileSync('docker',['exec','supabase_db_koalafrog-hq','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',cleanup],{stdio:'inherit'})
  console.log(JSON.stringify({deleted:id}))
}else{
  const email=`koalafrog-browser-${crypto.randomUUID()}@example.test`,password=`Local-${crypto.randomUUID()}-9a!`
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true})
  if(created.error)throw created.error
  const owner=createClient(url,anon,{auth:{persistSession:false}})
  const signedIn=await owner.auth.signInWithPassword({email,password})
  if(signedIn.error)throw signedIn.error
  const workspace=await owner.rpc('create_clean_workspace')
  if(workspace.error){await admin.auth.admin.deleteUser(created.data.user.id);throw workspace.error}
  console.log(JSON.stringify({userId:created.data.user.id,email,password,url,publishableKey:anon}))
}
