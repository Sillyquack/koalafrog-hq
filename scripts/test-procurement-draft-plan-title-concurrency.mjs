import assert from 'node:assert/strict'
import {execFileSync,spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'

const databaseContainer='supabase_db_koalafrog-hq'
const ownerId=randomUUID()
const workspaceId=randomUUID()
const supplierId=randomUUID()
const firstKey=randomUUID()
const secondKey=randomUUID()
const titleToken=randomUUID()
const firstTitle=`Concurrent Draft ${titleToken}`
const secondTitle=`\t  cOnCuRrEnT dRaFt ${titleToken} \n`
const checkedAt='2026-08-01T10:30:00.000Z'

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

function plan(title){
  return{
    title,
    purpose:'True local database concurrency test.',
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
    evidence:{scope:'local concurrency test'},
  }
}

const baskets=[{
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
  evidence:{scope:'local concurrency basket'},
  lines:[{
    sourceDomain:'equipment',
    sourceKind:'manual',
    sourceRecordId:null,
    productTitle:'Concurrent manual line',
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
  }],
}]

function rpcStatement(key,candidatePlan){
  return `select public.create_draft_purchase_plan_v1(
    '${workspaceId}'::uuid,
    '${key}'::uuid,
    ${sqlJson(candidatePlan)},
    ${sqlJson(baskets)}
  )->>'operation';`
}

function startSession(applicationName,sql,{keepStdinOpen=false}={}){
  const child=spawn('docker',[
    'exec','-i','-e',`PGAPPNAME=${applicationName}`,databaseContainer,
    'psql','-U','postgres','-d','postgres','-Atq','-v','ON_ERROR_STOP=1',
  ],{stdio:['pipe','pipe','pipe'],timeout:20000})
  let stdout=''
  let stderr=''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data',chunk=>{stdout+=chunk})
  child.stderr.on('data',chunk=>{stderr+=chunk})
  const completed=new Promise(resolve=>{
    child.on('close',(code,signal)=>resolve({code,signal,stdout,stderr}))
  })
  if(keepStdinOpen)child.stdin.write(sql)
  else child.stdin.end(sql)
  return{
    completed,
    readStdout:()=>stdout,
    sendSql:statement=>child.stdin.write(statement),
    closeStdin:()=>child.stdin.end(),
  }
}

async function waitForOutput(session,needle,timeoutMs){
  const started=Date.now()
  while(Date.now()-started<timeoutMs){
    if(session.readStdout().includes(needle))return
    await new Promise(resolve=>setTimeout(resolve,50))
  }
  throw new Error(`Timed out waiting for ${needle}. Output: ${session.readStdout()}`)
}

async function observeLockWait(applicationName,blockingApplicationName,timeoutMs){
  const started=Date.now()
  while(Date.now()-started<timeoutMs){
    const waiting=Number(psql(`select count(*)
      from pg_stat_activity waiting
      where waiting.application_name='${applicationName}'
        and waiting.wait_event_type='Lock'
        and exists(
          select 1 from pg_stat_activity blocker
          where blocker.pid=any(pg_blocking_pids(waiting.pid))
            and blocker.application_name='${blockingApplicationName}'
        );`))
    if(waiting>0)return true
    await new Promise(resolve=>setTimeout(resolve,75))
  }
  return false
}

psql(`
  insert into auth.users(id,email,created_at,updated_at)
  values('${ownerId}','draft-concurrency-${ownerId}@example.invalid',now(),now());
  insert into public.workspaces(id,owner_id,name,lifecycle_state)
  values('${workspaceId}','${ownerId}','Draft title concurrency fixture','active');
  insert into public.suppliers(
    id,workspace_id,owner_id,legal_name,supplier_type,status,internal_notes,is_preferred
  ) values(
    '${supplierId}','${workspaceId}','${ownerId}','Concurrency Supplier','equipment','active','',false
  );
`)

try{
  const first=startSession('kf_draft_title_concurrency_a',`
    begin;
    set local role authenticated;
    set local "request.jwt.claim.sub"='${ownerId}';
    ${rpcStatement(firstKey,plan(firstTitle))}
    select 'KF_FIRST_RPC_INSERTED';
  `,{keepStdinOpen:true})
  await waitForOutput(first,'KF_FIRST_RPC_INSERTED',10000)

  const second=startSession('kf_draft_title_concurrency_b',`
    begin;
    set local role authenticated;
    set local "request.jwt.claim.sub"='${ownerId}';
    ${rpcStatement(secondKey,plan(secondTitle))}
    commit;
  `)

  assert.equal(
    await observeLockWait('kf_draft_title_concurrency_b','kf_draft_title_concurrency_a',2500),
    true,
    'the losing request waits on the real unique-index transaction',
  )
  first.sendSql('commit;\n')
  first.closeStdin()
  const[firstResult,secondResult]=await Promise.all([first.completed,second.completed])
  assert.equal(firstResult.code,0,firstResult.stderr)
  assert.match(firstResult.stdout,/created/)
  assert.notEqual(secondResult.code,0,'the duplicate normalized title must fail')
  assert.match(secondResult.stderr,/DRAFT_PURCHASE_PLAN_IDENTITY_CONFLICT/)

  const persisted=JSON.parse(psql(`select json_build_object(
    'plans',(select count(*) from public.purchase_plans where workspace_id='${workspaceId}'::uuid),
    'baskets',(select count(*) from public.purchase_plan_baskets where workspace_id='${workspaceId}'::uuid),
    'lines',(select count(*) from public.purchase_plan_lines where workspace_id='${workspaceId}'::uuid),
    'title',(select title from public.purchase_plans where workspace_id='${workspaceId}'::uuid)
  );`))
  assert.deepEqual(persisted,{plans:1,baskets:1,lines:1,title:firstTitle})
  console.log('Procurement Draft Plan normalized-title concurrency passed (6 assertions; observed real lock wait).')
}finally{
  psql(`
    delete from public.purchase_plan_lines where workspace_id='${workspaceId}'::uuid;
    delete from public.purchase_plan_baskets where workspace_id='${workspaceId}'::uuid;
    delete from public.purchase_plan_audit_events where workspace_id='${workspaceId}'::uuid;
    delete from public.purchase_plan_verifications where workspace_id='${workspaceId}'::uuid;
    delete from public.purchase_plans where workspace_id='${workspaceId}'::uuid;
    delete from auth.users where id='${ownerId}'::uuid;
  `)
}
