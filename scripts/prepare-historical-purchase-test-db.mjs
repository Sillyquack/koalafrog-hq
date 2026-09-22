// Rebuild ONLY this named disposable database in the existing local Docker stack.
// No project link, remote URL, production credentials or application data is read.
import {execFileSync} from 'node:child_process'
import assert from 'node:assert/strict'
import {readdirSync,readFileSync} from 'node:fs'
const container='supabase_db_koalafrog-hq', database='koalafrog_issue98'
const run=(args,input)=>execFileSync('docker',['exec',...(input?['-i']:[]),container,...args],{input,encoding:'utf8',maxBuffer:30*1024*1024,stdio:['pipe','pipe','pipe']})
let bootstrap=run(['pg_dump','-U','postgres','-d','postgres','--schema-only','--schema=auth','--schema=storage','--schema=extensions','--no-owner','--no-privileges','--no-publications','--no-subscriptions'])
// Public application policies are reapplied from tracked migrations below.
bootstrap=bootstrap.split('\n').filter(line=>!line.startsWith('CREATE POLICY ')).join('\n')
run(['dropdb','-U','postgres','--if-exists',database])
run(['createdb','-U','postgres',database])
const psql=input=>run(['psql','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'],input)
psql(bootstrap)
psql('create extension if not exists pgcrypto with schema extensions; grant usage on schema auth,extensions to authenticated,anon,service_role;')
const files=readdirSync('supabase/migrations').filter(name=>name.endsWith('.sql')).sort()
const unchangedNames=['accept_supplier_product_ingredient_mapping','create_purchase_order_from_plan','create_draft_purchase_orders_from_plan','record_verified_purchase_order_placement','record_purchase_order_supplier_confirmation','decide_purchase_order_confirmation','create_purchase_order_shipment','record_purchase_order_shipment_status','create_purchase_order_receipt','record_purchase_order_receipt_line','complete_purchase_order_receiving','place_purchase_order_receipt_into_quarantine']
const fingerprint=()=>run(['psql','-U','postgres','-d',database,'-Atq','-c',`select jsonb_object_agg(p.proname,md5(pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in (${unchangedNames.map(name=>"'"+name+"'").join(',')})`]).trim()
let before
for(const file of files) {
 if(file.endsWith('_historical_external_purchase_reconciliation.sql')) {
  before=fingerprint()
  psql(`insert into auth.users(id,email) values('98000000-0000-4000-8000-000000000001','upgrade-fixture@example.invalid');
insert into public.workspaces(id,owner_id,lifecycle_state) values('98000000-0000-4000-8000-000000000002','98000000-0000-4000-8000-000000000001','active');
insert into public.suppliers(id,workspace_id,owner_id,legal_name,supplier_type,status) values('98000000-0000-4000-8000-000000000003','98000000-0000-4000-8000-000000000002','98000000-0000-4000-8000-000000000001','Upgrade fixture','raw_material','active');
insert into public.purchase_plans(id,workspace_id,owner_id,title) values('98000000-0000-4000-8000-000000000004','98000000-0000-4000-8000-000000000002','98000000-0000-4000-8000-000000000001','Existing plan');
insert into public.purchase_orders(id,workspace_id,owner_id,supplier_id,source_purchase_plan_id,source_purchase_plan_revision,status,cancellation_reason,order_reference,created_by)
select id,'98000000-0000-4000-8000-000000000002','98000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000003','98000000-0000-4000-8000-000000000004',1,'cancelled','Fixture cancellation','DUPLICATE-UPGRADE-REFERENCE','98000000-0000-4000-8000-000000000001'
from unnest(array['98000000-0000-4000-8000-000000000005'::uuid,'98000000-0000-4000-8000-000000000006'::uuid]) id;`)
  let failure
  try {psql(readFileSync(`supabase/migrations/${file}`,'utf8'))} catch(error) {failure=String(error.stderr)}
  assert.match(failure??'',/could not create unique index.*purchase_orders_supplier_reference/s,'Existing duplicate references must abort migration')
  const rollbackProof=run(['psql','-U','postgres','-d',database,'-Atq','-c',"select count(*) from information_schema.columns where table_schema='public' and table_name='purchase_orders' and column_name='record_origin'"]).trim()
  assert.equal(rollbackProof,'0','Failed migration rolls back all schema changes')
  psql("delete from public.purchase_orders where id='98000000-0000-4000-8000-000000000006';")
 }
 try {psql(readFileSync(`supabase/migrations/${file}`,'utf8'))} catch(error) {console.error(file,String(error.stderr));process.exit(1)}
}
const retained=run(['psql','-U','postgres','-d',database,'-Atq','-c',"select record_origin||':'||source_purchase_plan_id::text||':'||source_purchase_plan_revision::text from public.purchase_orders where id='98000000-0000-4000-8000-000000000005'"]).trim()
assert.equal(retained,'planned:98000000-0000-4000-8000-000000000004:1','Existing planned provenance survives upgrade')
assert.equal(fingerprint(),before,'Existing planned, mapping and receiving functions must remain byte-identical')
assert.equal(Object.keys(JSON.parse(before)).length,unchangedNames.length)
console.log(JSON.stringify({status:'PASS',database,migrations:files.length,unchangedFunctions:unchangedNames.length,productionWrites:0}))
