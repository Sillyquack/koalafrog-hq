import { execFileSync, spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'

const databaseContainer = 'supabase_db_koalafrog-hq'
const preAuthoringVersion = '20260729160000'
const ownerId = '10000000-0000-4000-8000-000000000098'
const workspaceId = '20000000-0000-4000-8000-000000000098'
const supplierId = '30000000-0000-4000-8000-000000000098'

function resetToPreAuthoring() {
  execFileSync(
    'npx',
    ['supabase', 'db', 'reset', '--local', '--version', preAuthoringVersion, '--no-seed'],
    { stdio: 'inherit' },
  )
}

function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', databaseContainer, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql],
    { encoding: 'utf8' },
  ).trim()
}

function seedFoundation() {
  psql(`
    insert into auth.users(id,email,created_at,updated_at)
    values ('${ownerId}','price-state-upgrade@example.invalid',now(),now());

    insert into public.workspaces(id,owner_id,name,lifecycle_state)
    values ('${workspaceId}','${ownerId}','Price-state upgrade fixture','active');

    insert into public.ingredients(
      workspace_id,owner_id,id,common_name,inci_name,category,functions,
      description,default_unit,notes,status,created_at,updated_at
    ) values (
      '${workspaceId}','${ownerId}','legacy-ingredient','Legacy Ingredient',
      'Legacy Ingredient','Carrier',array['Emollient'],'Synthetic upgrade fixture',
      'g','','Research',now()::text,now()::text
    );

    insert into public.suppliers(
      id,workspace_id,owner_id,legal_name,trading_name,supplier_type,status,
      internal_notes,is_preferred
    ) values (
      '${supplierId}','${workspaceId}','${ownerId}','Representative Supplier',
      'Representative Supplier','raw_material','research','',false
    );
  `)
}

function seedValidLegacyProduct() {
  psql(`
    insert into public.supplier_products(
      workspace_id,owner_id,id,ingredient_id,supplier_id,supplier_name,
      product_name,package_quantity,package_unit,price,currency,notes,
      is_preferred,created_at,updated_at,product_status,availability_status,
      discontinued
    ) values (
      '${workspaceId}','${ownerId}','legacy-priced-research','legacy-ingredient',
      '${supplierId}','Representative Supplier','Legacy priced research candidate',
      50,'ml',12.50,'GBP','Preserve every stored fact',false,now()::text,
      now()::text,'research',null,false
    );
  `)
}

function applyPendingMigrations() {
  execFileSync('npx', ['supabase', 'migration', 'up', '--local'], { stdio: 'inherit' })
}

resetToPreAuthoring()
seedFoundation()
seedValidLegacyProduct()
applyPendingMigrations()

const preserved = JSON.parse(psql(`
  select json_build_object(
    'price',price,
    'currency',currency,
    'packageQuantity',package_quantity,
    'packageUnit',package_unit,
    'priceState',price_state,
    'productStatus',product_status,
    'lifecycleStatus',lifecycle_status,
    'availabilityStatus',availability_status,
    'preferred',is_preferred
  )
  from public.supplier_products
  where workspace_id='${workspaceId}' and id='legacy-priced-research';
`))

assert.deepEqual(preserved, {
  price: 12.50,
  currency: 'GBP',
  packageQuantity: 50,
  packageUnit: 'ml',
  priceState: 'recorded',
  productStatus: 'research',
  lifecycleStatus: 'evaluated',
  availabilityStatus: null,
  preferred: false,
})

psql(`
  insert into public.supplier_products(
    workspace_id,owner_id,id,ingredient_id,supplier_id,supplier_name,
    product_name,package_quantity,package_unit,price,currency,notes,
    is_preferred,created_at,updated_at,product_status,availability_status,
    discontinued,lifecycle_status,price_state
  ) values (
    '${workspaceId}','${ownerId}','incomplete-candidate','legacy-ingredient',
    '${supplierId}','Representative Supplier','Incomplete candidate',
    null,null,null,null,'',false,now()::text,now()::text,'research',null,false,
    'candidate','unknown'
  );
`)

assert.equal(
  psql(`
    select price_state||'|'||lifecycle_status||'|'||
      coalesce(availability_status,'NULL')||'|'||
      (select count(*) from public.inventory_lots
       where workspace_id='${workspaceId}' and supplier_product_id='incomplete-candidate')
    from public.supplier_products
    where workspace_id='${workspaceId}' and id='incomplete-candidate';
  `),
  'unknown|candidate|NULL|0',
)

const invalidState = spawnSync(
  'docker',
  [
    'exec', databaseContainer, 'psql', '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-c', `
      set session_replication_role=replica;
      insert into public.supplier_products(
        workspace_id,owner_id,id,ingredient_id,supplier_id,supplier_name,
        product_name,package_quantity,package_unit,price,currency,notes,
        is_preferred,created_at,updated_at,product_status,discontinued,
        lifecycle_status,price_state
      ) values (
        '${workspaceId}','${ownerId}','invalid-price-state','legacy-ingredient',
        '${supplierId}','Representative Supplier','Invalid price state',
        null,null,1,'GBP','',false,now()::text,now()::text,'research',false,
        'candidate','unknown'
      );
    `,
  ],
  { encoding: 'utf8' },
)
assert.notEqual(invalidState.status, 0)
assert.match(`${invalidState.stdout}${invalidState.stderr}`, /supplier_products_price_state_consistency/)

resetToPreAuthoring()
seedFoundation()
psql(`
  alter table public.supplier_products
    alter column price drop not null,
    alter column currency drop not null;

  insert into public.supplier_products(
    workspace_id,owner_id,id,ingredient_id,supplier_id,supplier_name,
    product_name,package_quantity,package_unit,price,currency,notes,
    is_preferred,created_at,updated_at,product_status,discontinued
  ) values (
    '${workspaceId}','${ownerId}','contradictory-currency-only','legacy-ingredient',
    '${supplierId}','Representative Supplier','Contradictory legacy fixture',
    50,'ml',null,'GBP','',false,now()::text,now()::text,'research',false
  );
`)

const contradictoryUpgrade = spawnSync(
  'npx',
  ['supabase', 'migration', 'up', '--local'],
  { encoding: 'utf8' },
)
assert.notEqual(contradictoryUpgrade.status, 0)
assert.match(
  `${contradictoryUpgrade.stdout}${contradictoryUpgrade.stderr}`,
  /contain price without currency or currency without price/,
)

console.log('Supplier Product price-state pre-authoring upgrade compatibility checks passed.')
