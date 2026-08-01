import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'

const databaseContainer='supabase_db_koalafrog-hq'
const previousVersion='20260731205657'
const targetVersion='20260801085016'
const ownerId='10000000-0000-4000-8000-000000000099'
const workspaceId='20000000-0000-4000-8000-000000000099'
const supplierId='30000000-0000-4000-8000-000000000099'
const requestId='40000000-0000-4000-8000-000000000099'
const requestedItemId='50000000-0000-4000-8000-000000000099'
const manualOfferId='60000000-0000-4000-8000-000000000099'
const rawOfferId='60000000-0000-4000-8000-000000000100'
const packagingOfferId='60000000-0000-4000-8000-000000000101'
const ingredientId='commercial-provenance-upgrade-ingredient'
const rawSourceId='commercial-provenance-upgrade-raw-source'
const packagingComponentId='commercial-provenance-upgrade-component'
const packagingSourceId='commercial-provenance-upgrade-packaging-source'

function supabase(...args){
  execFileSync('npx',['supabase',...args],{stdio:'inherit'})
}

function psql(sql){
  return execFileSync(
    'docker',
    ['exec',databaseContainer,'psql','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1','-c',sql],
    {encoding:'utf8'},
  ).trim()
}

let upgradeCompleted=false

try{
  supabase('db','reset','--local','--version',previousVersion,'--no-seed')
  assert.equal(psql('select count(*) from supabase_migrations.schema_migrations;'),'91')
  assert.equal(psql('select max(version) from supabase_migrations.schema_migrations;'),previousVersion)

  psql(`
    insert into auth.users(id,email,created_at,updated_at)
    values('${ownerId}','commercial-provenance-upgrade@example.invalid',now(),now());

    insert into public.workspaces(id,owner_id,name,lifecycle_state)
    values('${workspaceId}','${ownerId}','Commercial provenance upgrade fixture','active');

    insert into public.suppliers(
      id,workspace_id,owner_id,legal_name,trading_name,supplier_type,status,
      website_url,country_code,default_currency,verification_state,internal_notes,is_preferred
    ) values(
      '${supplierId}','${workspaceId}','${ownerId}','Preserved Source Supplier',null,
      'mixed','research','https://supplier.example.invalid','NO','NOK','unknown','',false
    );

    insert into public.ingredients(
      workspace_id,owner_id,id,common_name,inci_name,category,functions,
      description,default_unit,notes,status,created_at,updated_at
    ) values(
      '${workspaceId}','${ownerId}','${ingredientId}','Upgrade Ingredient',
      'Upgrade Ingredient','Carrier',array['Emollient'],'Synthetic upgrade fixture',
      'g','','Research',now()::text,now()::text
    );

    insert into public.packaging_components(
      workspace_id,owner_id,id,name,category,description,default_unit,colour,
      material,notes,status,created_at,updated_at
    ) values(
      '${workspaceId}','${ownerId}','${packagingComponentId}','Upgrade Bottle',
      'Bottle','Synthetic upgrade fixture','pcs','Amber','Glass','',
      'planned',now()::text,now()::text
    );

    insert into public.supplier_products(
      workspace_id,owner_id,id,ingredient_id,supplier_id,supplier_name,
      product_name,supplier_sku,package_quantity,package_unit,price,currency,
      product_url,notes,is_preferred,created_at,updated_at,product_status,
      availability_status,discontinued,lifecycle_status,price_state
    ) values(
      '${workspaceId}','${ownerId}','${rawSourceId}','${ingredientId}','${supplierId}',
      'Preserved Source Supplier','Preserved Raw Source','RAW-UPGRADE-1',100,'g',
      125,'NOK','https://supplier.example.invalid/raw','',false,now()::text,
      now()::text,'research','in_stock',false,'available','recorded'
    );

    insert into public.packaging_supplier_products(
      workspace_id,owner_id,id,packaging_component_id,supplier_id,supplier_name,
      product_name,supplier_sku,package_quantity,package_unit,price,currency,
      product_url,notes,is_preferred,created_at,updated_at,availability_status,
      discontinued,lifecycle_status,price_state
    ) values(
      '${workspaceId}','${ownerId}','${packagingSourceId}','${packagingComponentId}',
      '${supplierId}','Preserved Source Supplier','Preserved Packaging Source',
      'PACK-UPGRADE-1',24,'pcs',240,'NOK','https://supplier.example.invalid/packaging',
      '',false,now()::text,now()::text,'in_stock',false,'available','recorded'
    );

    insert into public.procurement_requests(id,workspace_id,owner_id,title)
    values('${requestId}','${workspaceId}','${ownerId}','Preserved Offer request');

    insert into public.procurement_requested_items(
      id,workspace_id,owner_id,procurement_request_id,name,category,
      requested_quantity,unit
    ) values(
      '${requestedItemId}','${workspaceId}','${ownerId}','${requestId}',
      'Preserved sourced item','raw_material',1,'kg'
    );

    insert into public.procurement_supplier_offers(
      id,workspace_id,owner_id,requested_item_id,supplier_id,
      source_supplier_product_domain,source_supplier_product_id,
      product_title,product_url,package_quantity,package_unit,item_price,currency,
      notes,date_checked
    ) values
    (
      '${manualOfferId}','${workspaceId}','${ownerId}','${requestedItemId}','${supplierId}',
      null,null,'Preserved Manual Offer','https://supplier.example.invalid/manual',
      1,'kg',300,'NOK','Manual evidence remains manual','2026-07-31'
    ),
    (
      '${rawOfferId}','${workspaceId}','${ownerId}','${requestedItemId}','${supplierId}',
      'raw_material','${rawSourceId}','Preserved Raw Linked Offer',
      'https://supplier.example.invalid/raw',100,'g',125,'NOK',
      'Raw source identity must survive','2026-07-31'
    ),
    (
      '${packagingOfferId}','${workspaceId}','${ownerId}','${requestedItemId}','${supplierId}',
      'packaging','${packagingSourceId}','Preserved Packaging Linked Offer',
      'https://supplier.example.invalid/packaging',24,'pcs',240,'NOK',
      'Packaging source identity must survive','2026-07-31'
    );
  `)

  assert.equal(
    psql(`select count(*) from public.procurement_supplier_offers where id in ('${manualOfferId}','${rawOfferId}','${packagingOfferId}');`),
    '3',
  )
  assert.equal(psql(`select count(*) from public.inventory_lots where workspace_id='${workspaceId}';`),'0')
  assert.equal(psql(`select count(*) from public.packaging_inventory_lots where workspace_id='${workspaceId}';`),'0')

  supabase('migration','up','--local')
  assert.equal(psql('select count(*) from supabase_migrations.schema_migrations;'),'92')
  assert.equal(psql('select max(version) from supabase_migrations.schema_migrations;'),targetVersion)

  const manualOffer=JSON.parse(psql(`
    select json_build_object(
      'title',product_title,'url',product_url,'quantity',package_quantity,
      'unit',package_unit,'price',item_price,'currency',currency,'notes',notes,
      'checked',date_checked,'domain',source_supplier_product_domain,
      'sourceId',source_supplier_product_id,'rawId',source_raw_material_product_id,
      'packagingId',source_packaging_product_id
    )
    from public.procurement_supplier_offers where id='${manualOfferId}';
  `))
  assert.deepEqual(manualOffer,{
    title:'Preserved Manual Offer',
    url:'https://supplier.example.invalid/manual',
    quantity:1,
    unit:'kg',
    price:300,
    currency:'NOK',
    notes:'Manual evidence remains manual',
    checked:'2026-07-31',
    domain:null,
    sourceId:null,
    rawId:null,
    packagingId:null,
  })

  const rawOffer=JSON.parse(psql(`
    select json_build_object(
      'domain',source_supplier_product_domain,'sourceId',source_supplier_product_id,
      'rawId',source_raw_material_product_id,'packagingId',source_packaging_product_id,
      'supplierId',supplier_id
    )
    from public.procurement_supplier_offers where id='${rawOfferId}';
  `))
  assert.deepEqual(rawOffer,{
    domain:'raw_material',
    sourceId:rawSourceId,
    rawId:rawSourceId,
    packagingId:null,
    supplierId,
  })

  const packagingOffer=JSON.parse(psql(`
    select json_build_object(
      'domain',source_supplier_product_domain,'sourceId',source_supplier_product_id,
      'rawId',source_raw_material_product_id,'packagingId',source_packaging_product_id,
      'supplierId',supplier_id
    )
    from public.procurement_supplier_offers where id='${packagingOfferId}';
  `))
  assert.deepEqual(packagingOffer,{
    domain:'packaging',
    sourceId:packagingSourceId,
    rawId:null,
    packagingId:packagingSourceId,
    supplierId,
  })

  assert.equal(
    psql(`select count(*) from public.supplier_products where workspace_id='${workspaceId}' and id='${rawSourceId}' and supplier_id='${supplierId}';`),
    '1',
  )
  assert.equal(
    psql(`select count(*) from public.packaging_supplier_products where workspace_id='${workspaceId}' and id='${packagingSourceId}' and supplier_id='${supplierId}';`),
    '1',
  )
  assert.equal(
    psql("select has_function_privilege('authenticated','public.validate_procurement_offer_source_usability_v1()','EXECUTE');"),
    'f',
  )
  assert.equal(psql(`select count(*) from public.inventory_lots where workspace_id='${workspaceId}';`),'0')
  assert.equal(psql(`select count(*) from public.packaging_inventory_lots where workspace_id='${workspaceId}';`),'0')

  upgradeCompleted=true
}finally{
  supabase('db','reset','--local','--no-seed')
  if(upgradeCompleted){
    assert.equal(psql('select count(*) from supabase_migrations.schema_migrations;'),'92')
    assert.equal(psql('select max(version) from supabase_migrations.schema_migrations;'),targetVersion)
  }
}

console.log('Procurement Commercial Provenance exact 91 → 92 upgrade, preserved manual/linked Offers, and fresh 92-migration reset checks passed.')
