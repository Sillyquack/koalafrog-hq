import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

const databaseContainer='supabase_db_koalafrog-hq'
const previousVersion='20260731044225'
const targetVersion='20260731205657'
const ownerId='10000000-0000-4000-8000-000000000097'
const workspaceId='20000000-0000-4000-8000-000000000097'
const supplierId='30000000-0000-4000-8000-000000000097'
const planId='40000000-0000-4000-8000-000000000097'
const basketId='50000000-0000-4000-8000-000000000097'
const lineId='60000000-0000-4000-8000-000000000097'

function supabase(...args){
  execFileSync('npx',['supabase',...args],{stdio:'inherit'})
}

function psql(sql){
  return execFileSync('docker',['exec',databaseContainer,'psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1','-c',sql],{encoding:'utf8'}).trim()
}

supabase('db','reset','--local','--version',previousVersion,'--no-seed')
assert.equal(psql('select count(*) from supabase_migrations.schema_migrations;'),'90')
assert.equal(psql('select max(version) from supabase_migrations.schema_migrations;'),previousVersion)
psql(`
  insert into auth.users(id,email,created_at,updated_at)
  values('${ownerId}','draft-plan-upgrade@example.invalid',now(),now());
  insert into public.workspaces(id,owner_id,name,lifecycle_state)
  values('${workspaceId}','${ownerId}','Draft plan upgrade fixture','active');
  insert into public.suppliers(id,workspace_id,owner_id,legal_name,supplier_type,status,internal_notes,is_preferred)
  values('${supplierId}','${workspaceId}','${ownerId}','Preserved Supplier','raw_material','active','',false);
  insert into public.purchase_plans(
    id,workspace_id,owner_id,title,status,purpose,currency,source_type,internal_notes,
    estimated_merchandise_total,estimated_landed_total,creation_key,plan_version,
    strategy,base_currency,mixed_currency,supplier_count,line_count,known_minimum,
    unknown_component_count,warning_count,blocker_count,snapshot_version,source_snapshot
  ) values(
    '${planId}','${workspaceId}','${ownerId}','Preserved scenario plan','verification_required',
    'Pre-migration scenario-derived fixture','NOK','production_procurement_scenario','Preserve',
    100,null,'70000000-0000-4000-8000-000000000097',1,'balanced','NOK',false,1,1,100,
    1,0,0,'production-procurement-plan-v1','{"scenario":"preserved"}'::jsonb
  );
  insert into public.purchase_plan_baskets(
    id,workspace_id,owner_id,purchase_plan_id,supplier_id,supplier_name_snapshot,currency,
    merchandise_subtotal,eligible_subtotal,confirmed_discount,estimated_discount,
    post_discount_subtotal,shipping,shipping_state,vat_state,import_vat_state,customs_state,
    handling_state,known_minimum,free_shipping_state,first_order_discount_state,
    commercial_warnings,freshness_states,commercial_assumption_snapshot,source_calculation_version
  ) values(
    '${basketId}','${workspaceId}','${ownerId}','${planId}','${supplierId}','Preserved Supplier','NOK',
    100,100,0,0,100,null,'unknown','unknown','unknown','unknown','unknown',100,
    '{}'::jsonb,'{}'::jsonb,array['Shipping Unknown'],'{}'::jsonb,
    '{"scenario":"preserved"}'::jsonb,'production-procurement-v2'
  );
  insert into public.purchase_plan_lines(
    id,workspace_id,owner_id,purchase_plan_id,inventory_domain,description,planned_quantity,
    unit,pack_count,pack_size,estimated_unit_price,estimated_line_total,currency,display_order,
    purchase_plan_basket_id,supplier_product_name_snapshot,documentation_state,source_snapshot
  ) values(
    '${lineId}','${workspaceId}','${ownerId}','${planId}','raw_material','Preserved line',1,
    'pcs',1,1,100,100,'NOK',0,'${basketId}','Preserved product','{}'::jsonb,
    '{"scenario":"preserved"}'::jsonb
  );
  insert into public.purchase_plan_verifications(
    workspace_id,owner_id,purchase_plan_id,plan_version,purchase_plan_basket_id,
    supplier_id,category,field,expected_value,severity,requirement_reason
  ) values(
    '${workspaceId}','${ownerId}','${planId}',1,'${basketId}','${supplierId}',
    'shipping','shipping','null'::jsonb,'required','Preserved Unknown shipping verification'
  );
`)

supabase('migration','up','--local')
assert.equal(psql('select count(*) from supabase_migrations.schema_migrations;'),'91')
assert.equal(psql('select max(version) from supabase_migrations.schema_migrations;'),targetVersion)

const plan=JSON.parse(psql(`
  select json_build_object(
    'status',status,'sourceType',source_type,'placement',placement_state,
    'orderAuthorized',order_authorized,'targetBudget',target_budget,
    'absoluteStop',absolute_stop,'fingerprint',draft_payload_fingerprint
  ) from public.purchase_plans where id='${planId}';
`))
assert.deepEqual(plan,{status:'verification_required',sourceType:'production_procurement_scenario',placement:'unplaced',orderAuthorized:false,targetBudget:null,absoluteStop:null,fingerprint:null})

const basket=JSON.parse(psql(`
  select json_build_object(
    'merchandise',merchandise_subtotal,'shipping',shipping,'knownMinimum',known_minimum,
    'vatAdjustment',vat_adjustment,'dangerousGoods',dangerous_goods_fee,
    'paymentFx',payment_fx,'checkedAt',commercial_checked_at
  ) from public.purchase_plan_baskets where id='${basketId}';
`))
assert.deepEqual(basket,{merchandise:100,shipping:null,knownMinimum:100,vatAdjustment:null,dangerousGoods:null,paymentFx:null,checkedAt:null})

const line=JSON.parse(psql(`
  select json_build_object(
    'id',id,'basketId',purchase_plan_basket_id,'sourceKind',source_kind,
    'sourceRecordId',source_record_id,'sku',supplier_sku_snapshot,
    'checkedAt',commercial_checked_at,'evidence',commercial_evidence_snapshot
  ) from public.purchase_plan_lines where id='${lineId}';
`))
assert.deepEqual(line,{id:lineId,basketId:basketId,sourceKind:null,sourceRecordId:null,sku:null,checkedAt:null,evidence:{}})
assert.equal(psql(`select count(*) from public.purchase_plan_verifications where purchase_plan_id='${planId}';`),'1')
assert.equal(psql(`select has_table_privilege('authenticated','public.purchase_plan_lines','INSERT');`),'f')

supabase('db','reset','--local','--no-seed')
assert.equal(psql('select count(*) from supabase_migrations.schema_migrations;'),'91')
assert.equal(psql('select max(version) from supabase_migrations.schema_migrations;'),targetVersion)
console.log('Procurement Draft Plan authoring exact 90 → 91 upgrade and fresh 91-migration reset checks passed.')
