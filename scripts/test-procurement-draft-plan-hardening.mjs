import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {randomUUID} from 'node:crypto'

const databaseContainer='supabase_db_koalafrog-hq'
const ownerId='10000000-0000-4000-8000-000000000098'
const workspaceId='20000000-0000-4000-8000-000000000098'
const supplierOneId='30000000-0000-4000-8000-000000000098'
const supplierTwoId='30000000-0000-4000-8000-000000000099'
const otherOwnerId='10000000-0000-4000-8000-000000000099'
const otherWorkspaceId='20000000-0000-4000-8000-000000000099'
const checkedAt='2026-08-01T10:00:00.000Z'
let assertionCount=0

function psql(sql){
  return execFileSync(
    'docker',
    ['exec',databaseContainer,'psql','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1','-c',sql],
    {encoding:'utf8',maxBuffer:10*1024*1024,stdio:['ignore','pipe','pipe']},
  ).trim()
}

function sqlJson(value){
  return `'${JSON.stringify(value).replaceAll("'","''")}'::jsonb`
}

function authenticatedSql(sql,actorId=ownerId){
  return `begin;
set local role authenticated;
set local "request.jwt.claim.sub"='${actorId}';
${sql}
commit;`
}

function rpcSql({key=randomUUID(),plan,baskets,actorId=ownerId,targetWorkspaceId=workspaceId}){
  return authenticatedSql(`select public.create_draft_purchase_plan_v1(
    '${targetWorkspaceId}'::uuid,
    '${key}'::uuid,
    ${typeof plan==='string'?plan:sqlJson(plan)},
    ${typeof baskets==='string'?baskets:sqlJson(baskets)}
  );`,actorId)
}

function expectError(sql,expected,label){
  let output=''
  try{
    psql(sql)
    assert.fail(`${label}: SQL unexpectedly succeeded`)
  }catch(error){
    output=`${error.stdout??''}\n${error.stderr??''}`
  }
  assert.match(output,new RegExp(expected),label)
  assertionCount+=1
}

function expectEqual(actual,expected,label){
  assert.deepEqual(actual,expected,label)
  assertionCount+=1
}

function validPlan(title='Focused defensive plan'){
  return{
    title,
    purpose:'Local defensive migration validation.',
    targetDate:null,
    baseCurrency:'NOK',
    notes:'No external side effect.',
    targetBudget:100,
    absoluteStop:120,
    credibleRangeMinimum:null,
    credibleRangeMaximum:null,
    worstCredibleRangeMinimum:null,
    worstCredibleRangeMaximum:null,
    knownMerchandiseTotal:10,
    knownMinimum:10,
    estimatedLandedTotal:null,
    checkedAt,
    evidence:{scope:'local defensive test'},
  }
}

function validLine(title='Manual test line'){
  return{
    sourceDomain:'equipment',
    sourceKind:'manual',
    sourceRecordId:null,
    productTitle:title,
    sku:null,
    packageQuantity:1,
    packageUnit:'pcs',
    purchaseQuantity:1,
    unitPrice:10,
    lineTotal:10,
    currency:'NOK',
    sourceUrl:null,
    checkedAt,
    evidence:{selected:true},
  }
}

function validBasket(supplierId=supplierOneId){
  return{
    supplierId,
    currency:'NOK',
    listSubtotal:10,
    verifiedDiscount:0,
    postDiscountSubtotal:10,
    shipping:null,
    vatAdjustment:null,
    importVat:null,
    duty:null,
    dangerousGoodsFee:null,
    brokerageHandling:null,
    paymentFx:null,
    knownMinimum:10,
    checkedAt,
    warnings:[],
    evidence:{scope:'local basket'},
    lines:[validLine()],
  }
}

function aggregateCounts(){
  return JSON.parse(psql(`select json_build_object(
    'plans',(select count(*) from public.purchase_plans where workspace_id='${workspaceId}'::uuid),
    'baskets',(select count(*) from public.purchase_plan_baskets where workspace_id='${workspaceId}'::uuid),
    'lines',(select count(*) from public.purchase_plan_lines where workspace_id='${workspaceId}'::uuid)
  );`))
}

function expectRejectedWithoutAggregate(plan,baskets,error,label){
  expectError(rpcSql({plan,baskets}),error,label)
  expectEqual(aggregateCounts(),{plans:0,baskets:0,lines:0},`${label}: aggregate remains empty`)
}

function cleanup(){
  psql(`
    drop trigger if exists kf_test_draft_insert_sentinel on public.purchase_plans;
    drop function if exists public.kf_test_draft_insert_sentinel();
    delete from public.purchase_plan_lines where workspace_id in ('${workspaceId}'::uuid,'${otherWorkspaceId}'::uuid);
    delete from public.purchase_plan_baskets where workspace_id in ('${workspaceId}'::uuid,'${otherWorkspaceId}'::uuid);
    delete from public.purchase_plan_audit_events where workspace_id in ('${workspaceId}'::uuid,'${otherWorkspaceId}'::uuid);
    delete from public.purchase_plan_verifications where workspace_id in ('${workspaceId}'::uuid,'${otherWorkspaceId}'::uuid);
    delete from public.purchase_plans where workspace_id in ('${workspaceId}'::uuid,'${otherWorkspaceId}'::uuid);
    delete from auth.users where id in ('${ownerId}'::uuid,'${otherOwnerId}'::uuid);
  `)
}

cleanup()
psql(`
  insert into auth.users(id,email,created_at,updated_at) values
    ('${ownerId}','draft-hardening-owner@example.invalid',now(),now()),
    ('${otherOwnerId}','draft-hardening-other@example.invalid',now(),now());
  insert into public.workspaces(id,owner_id,name,lifecycle_state) values
    ('${workspaceId}','${ownerId}','Draft hardening owner','active'),
    ('${otherWorkspaceId}','${otherOwnerId}','Draft hardening other','active');
  insert into public.suppliers(id,workspace_id,owner_id,legal_name,supplier_type,status,internal_notes,is_preferred) values
    ('${supplierOneId}','${workspaceId}','${ownerId}','Defensive Supplier One','equipment','active','',false),
    ('${supplierTwoId}','${workspaceId}','${ownerId}','Defensive Supplier Two','equipment','active','',false);
`)

try{
  const plan=validPlan()
  const baskets=[validBasket()]
  expectRejectedWithoutAggregate('null::jsonb',baskets,'DRAFT_PLAN_INVALID','SQL NULL plan')
  expectRejectedWithoutAggregate("'null'::jsonb",baskets,'DRAFT_PLAN_INVALID','JSON null plan')
  expectRejectedWithoutAggregate("'[]'::jsonb",baskets,'DRAFT_PLAN_INVALID','wrong-type plan')
  expectRejectedWithoutAggregate(plan,'null::jsonb','DRAFT_BASKETS_REQUIRED','SQL NULL baskets')
  expectRejectedWithoutAggregate(plan,"'null'::jsonb",'DRAFT_BASKETS_REQUIRED','JSON null baskets')
  expectRejectedWithoutAggregate(plan,"'{}'::jsonb",'DRAFT_BASKETS_REQUIRED','wrong-type baskets')
  expectRejectedWithoutAggregate(plan,"'[]'::jsonb",'DRAFT_BASKETS_REQUIRED','empty baskets')

  const missingLines=validBasket()
  delete missingLines.lines
  expectRejectedWithoutAggregate(plan,[missingLines],'DRAFT_BASKET_LINES_REQUIRED','missing basket lines')
  expectRejectedWithoutAggregate(plan,[{...validBasket(),lines:null}],'DRAFT_BASKET_LINES_REQUIRED','JSON null basket lines')
  expectRejectedWithoutAggregate(plan,[{...validBasket(),lines:{}}],'DRAFT_BASKET_LINES_REQUIRED','object basket lines')
  expectRejectedWithoutAggregate(plan,[{...validBasket(),lines:[]}],'DRAFT_BASKET_LINES_REQUIRED','empty basket lines')
  expectRejectedWithoutAggregate(plan,[null],'DRAFT_BASKET_INVALID','JSON null basket')
  expectRejectedWithoutAggregate(plan,[{...validBasket(),lines:[null]}],'DRAFT_LINE_INVALID','JSON null line')
  expectRejectedWithoutAggregate(plan,[{...validBasket(),lines:[{...validLine(),purchaseQuantity:'1'}]}],'DRAFT_NUMERIC_INVALID:purchaseQuantity','wrong-type line numeric')

  psql(`
    create function public.kf_test_draft_insert_sentinel() returns trigger
    language plpgsql set search_path='' as $$
    begin raise exception 'DRAFT_PLAN_INSERT_SENTINEL'; end
    $$;
    create trigger kf_test_draft_insert_sentinel
      before insert on public.purchase_plans
      for each row execute function public.kf_test_draft_insert_sentinel();
  `)
  const laterBasket=[validBasket(),{...validBasket(supplierTwoId),currency:'NO'}]
  expectRejectedWithoutAggregate(validPlan('Malformed later basket'),laterBasket,'DRAFT_BASKET_CURRENCY_INVALID','malformed later basket before insert')
  const laterLineBasket=validBasket()
  laterLineBasket.listSubtotal=20
  laterLineBasket.postDiscountSubtotal=20
  laterLineBasket.knownMinimum=20
  laterLineBasket.lines=[validLine('Valid first line'),{...validLine('Malformed second line'),purchaseQuantity:-1}]
  expectRejectedWithoutAggregate(validPlan('Malformed later line'),[laterLineBasket],'DRAFT_LINE_QUANTITY_INVALID','malformed later line before insert')
  const negativeConfirmedBasket={
    ...validBasket(),
    shipping:0,
    vatAdjustment:-20,
    importVat:0,
    duty:0,
    dangerousGoodsFee:0,
    brokerageHandling:0,
    paymentFx:0,
  }
  expectRejectedWithoutAggregate(
    validPlan('Negative computed basket total'),
    [negativeConfirmedBasket],
    'DRAFT_BASKET_TOTAL_INVALID',
    'negative computed basket total before insert',
  )
  expectRejectedWithoutAggregate(
    validPlan('Canonical duplicate basket'),
    [validBasket(),validBasket(supplierOneId.replaceAll('-',''))],
    'DRAFT_BASKET_IDENTITY_CONFLICT',
    'alternate UUID spelling duplicate basket before insert',
  )
  const incompleteLandedBasket={
    ...validBasket(),
    verifiedDiscount:null,
    postDiscountSubtotal:null,
    shipping:0,
    vatAdjustment:0,
    importVat:0,
    duty:0,
    dangerousGoodsFee:0,
    brokerageHandling:0,
    paymentFx:0,
  }
  expectRejectedWithoutAggregate(
    {...validPlan('Incomplete costs with landed total'),estimatedLandedTotal:10},
    [incompleteLandedBasket],
    'DRAFT_PLAN_LANDED_TOTAL_REQUIRES_COMPLETE_COSTS',
    'unknown post-discount subtotal blocks landed total before insert',
  )
  psql(`drop trigger kf_test_draft_insert_sentinel on public.purchase_plans; drop function public.kf_test_draft_insert_sentinel();`)

  const constraintPlanId='40000000-0000-4000-8000-000000000098'
  psql(`insert into public.purchase_plans(
    id,workspace_id,owner_id,title,status,purpose,source_type,creation_key
  ) values(
    '${constraintPlanId}','${workspaceId}','${ownerId}','Paired constraint fixture',
    'verification_required','Constraint validation','constraint_test','50000000-0000-4000-8000-000000000098'
  );`)
  const oneSidedPairs=[
    ['target_budget=100,absolute_stop=null','purchase_plans_budget_gate_check','budget without stop'],
    ['target_budget=null,absolute_stop=120','purchase_plans_budget_gate_check','stop without budget'],
    ['credible_range_minimum=50,credible_range_maximum=null','purchase_plans_credible_range_check','credible minimum only'],
    ['credible_range_minimum=null,credible_range_maximum=75','purchase_plans_credible_range_check','credible maximum only'],
    ['worst_credible_range_minimum=80,worst_credible_range_maximum=null','purchase_plans_worst_credible_range_check','worst minimum only'],
    ['worst_credible_range_minimum=null,worst_credible_range_maximum=100','purchase_plans_worst_credible_range_check','worst maximum only'],
  ]
  for(const [assignment,constraint,label] of oneSidedPairs){
    expectError(
      `update public.purchase_plans set ${assignment} where id='${constraintPlanId}'::uuid;`,
      constraint,
      label,
    )
  }
  psql(`update public.purchase_plans set
    target_budget=100,absolute_stop=120,
    credible_range_minimum=50,credible_range_maximum=75,
    worst_credible_range_minimum=80,worst_credible_range_maximum=100
    where id='${constraintPlanId}'::uuid;`)
  expectEqual(
    JSON.parse(psql(`select json_build_object(
      'budget',array[target_budget,absolute_stop],
      'credible',array[credible_range_minimum,credible_range_maximum],
      'worst',array[worst_credible_range_minimum,worst_credible_range_maximum]
    ) from public.purchase_plans where id='${constraintPlanId}'::uuid;`)),
    {budget:[100,120],credible:[50,75],worst:[80,100]},
    'valid paired values persist',
  )
  psql(`delete from public.purchase_plans where id='${constraintPlanId}'::uuid;`)

  const normalizedCurrencyBasket={...validBasket(supplierTwoId),currency:' NOK '}
  const normalizedCurrencyPlan=JSON.parse(psql(rpcSql({
    plan:validPlan('Normalized basket currencies'),
    baskets:[validBasket(),normalizedCurrencyBasket],
  })))
  expectEqual(
    psql(`select mixed_currency::text from public.purchase_plans where id='${normalizedCurrencyPlan.plan.recordId}'::uuid;`),
    'false',
    'mixed-currency flag uses stored currency normalization',
  )
  psql(`
    delete from public.purchase_plan_lines where purchase_plan_id='${normalizedCurrencyPlan.plan.recordId}'::uuid;
    delete from public.purchase_plan_baskets where purchase_plan_id='${normalizedCurrencyPlan.plan.recordId}'::uuid;
    delete from public.purchase_plans where id='${normalizedCurrencyPlan.plan.recordId}'::uuid;
  `)

  const idempotencyKey=randomUUID()
  const createOutput=JSON.parse(psql(rpcSql({key:idempotencyKey,plan:validPlan('Valid Unknown-cost Draft'),baskets})))
  expectEqual(createOutput.operation,'created','authenticated aggregate RPC creates the Draft')
  expectEqual(
    JSON.parse(psql(`select json_build_object(
      'shipping',shipping,'vatAdjustment',vat_adjustment,'importVat',import_vat,'duty',customs,'handling',handling,
      'dangerousGoods',dangerous_goods_fee,'paymentFx',payment_fx
    ) from public.purchase_plan_baskets where purchase_plan_id='${createOutput.plan.recordId}'::uuid;`)),
    {shipping:null,vatAdjustment:null,importVat:null,duty:null,handling:null,dangerousGoods:null,paymentFx:null},
    'independent Unknown basket costs remain SQL NULL',
  )
  const reused=JSON.parse(psql(rpcSql({key:idempotencyKey,plan:validPlan('Valid Unknown-cost Draft'),baskets})))
  expectEqual(reused.operation,'reused','same key and payload reuses the aggregate')
  expectEqual(aggregateCounts(),{plans:1,baskets:1,lines:1},'idempotent replay creates no duplicates')
  expectError(
    rpcSql({key:idempotencyKey,plan:{...validPlan('Valid Unknown-cost Draft'),purpose:'Changed payload'},baskets}),
    'IDEMPOTENCY_CONFLICT',
    'same key with a changed payload conflicts',
  )
  expectEqual(aggregateCounts(),{plans:1,baskets:1,lines:1},'changed-payload conflict preserves aggregate counts')
  expectError(
    rpcSql({plan:validPlan('Cross-workspace denial'),baskets,targetWorkspaceId:otherWorkspaceId}),
    'WORKSPACE_UNAVAILABLE',
    'cross-workspace RPC is denied',
  )

  for(const table of ['purchase_plans','purchase_plan_baskets','purchase_plan_lines']){
    for(const [verb,statement] of [
      ['insert',`insert into public.${table} default values;`],
      ['update',`update public.${table} set owner_id=owner_id where false;`],
      ['delete',`delete from public.${table} where false;`],
      ['truncate',`truncate table public.${table};`],
    ]){
      expectError(authenticatedSql(statement),'permission denied',`authenticated direct ${verb} denied on ${table}`)
    }
  }
  expectError(
    authenticatedSql(`select public.kf_draft_optional_numeric_v1('{}'::jsonb,'field');`),
    'permission denied for function kf_draft_optional_numeric_v1',
    'authenticated cannot execute numeric helper',
  )
  expectError(
    authenticatedSql(`select public.kf_draft_plan_receipt_bundle_v1('${createOutput.plan.recordId}'::uuid,'created');`),
    'permission denied for function kf_draft_plan_receipt_bundle_v1',
    'authenticated cannot execute receipt helper',
  )

  const sideEffects=JSON.parse(psql(`select json_build_object(
    'purchaseOrders',(select count(*) from public.purchase_orders where workspace_id='${workspaceId}'::uuid),
    'recommendations',(select count(*) from public.procurement_recommendations where workspace_id='${workspaceId}'::uuid),
    'verifications',(select count(*) from public.purchase_plan_verifications where workspace_id='${workspaceId}'::uuid),
    'inventoryLots',(select count(*) from public.inventory_lots where workspace_id='${workspaceId}'::uuid),
    'inventoryMovements',(select count(*) from public.inventory_movements where workspace_id='${workspaceId}'::uuid),
    'packagingLots',(select count(*) from public.packaging_inventory_lots where workspace_id='${workspaceId}'::uuid),
    'packagingMovements',(select count(*) from public.packaging_inventory_movements where workspace_id='${workspaceId}'::uuid)
  );`))
  expectEqual(sideEffects,{
    purchaseOrders:0,recommendations:0,verifications:0,inventoryLots:0,
    inventoryMovements:0,packagingLots:0,packagingMovements:0,
  },'Draft authoring creates zero execution or inventory side effects')

  console.log(`Procurement Draft Plan hardening checks passed (${assertionCount} assertions).`)
}finally{
  cleanup()
}
