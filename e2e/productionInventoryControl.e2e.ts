import{expect,test}from'@playwright/test'
import{createClient}from'@supabase/supabase-js'
import{execFileSync}from'node:child_process'
import{owner,signIn}from'./ingredientKnowledge.helpers'

const createdPrefixes:string[]=[]
test.afterEach(()=>{
 for(const prefix of createdPrefixes.splice(0)){
  if(!/^pic-[0-9a-f-]+$/i.test(prefix))throw new Error('Unsafe Production Inventory Control fixture prefix.')
  const cleanup=`begin;set local session_replication_role=replica;
delete from public.finished_goods_lot_events where production_run_id like '${prefix}%';
delete from public.finished_goods_quarantines where packaging_run_id in(select id from public.packaging_runs where production_run_id like '${prefix}%');
delete from public.finished_goods_lots where production_run_id like '${prefix}%';
delete from public.packaged_output_reconciliations where packaging_run_id in(select id from public.packaging_runs where production_run_id like '${prefix}%');
delete from public.packaging_run_events where production_run_id like '${prefix}%';
delete from public.packaging_run_reconciliations where packaging_run_id in(select id from public.packaging_runs where production_run_id like '${prefix}%');
delete from public.packaging_run_inventory_uses where packaging_run_id in(select id from public.packaging_runs where production_run_id like '${prefix}%');
delete from public.packaging_run_reservations where packaging_run_id in(select id from public.packaging_runs where production_run_id like '${prefix}%');
delete from public.packaging_run_bulk_transfers where packaging_run_id in(select id from public.packaging_runs where production_run_id like '${prefix}%');
delete from public.packaging_run_bulk_allocations where packaging_run_id in(select id from public.packaging_runs where production_run_id like '${prefix}%');
delete from public.packaging_run_requirements where packaging_run_id in(select id from public.packaging_runs where production_run_id like '${prefix}%');
delete from public.packaging_runs where production_run_id like '${prefix}%';
delete from public.packaging_inventory_movements where packaging_inventory_lot_id like '${prefix}%';
delete from public.packaging_inventory_lots where id like '${prefix}%';
delete from public.packaging_specification_lines where id like '${prefix}%';
delete from public.packaging_specification_versions where id like '${prefix}%';
delete from public.packaging_specifications where id like '${prefix}%';
delete from public.packaging_components where id like '${prefix}%';
delete from public.production_output_events where production_run_id like '${prefix}%';
delete from public.production_output_reconciliations where production_output_id in(select id from public.production_outputs where production_run_id like '${prefix}%');
delete from public.production_output_components where production_output_id in(select id from public.production_outputs where production_run_id like '${prefix}%');
delete from public.production_output_measurements where production_output_id in(select id from public.production_outputs where production_run_id like '${prefix}%');
delete from public.production_outputs where production_run_id like '${prefix}%';
delete from public.batch_material_events where batch_id like '${prefix}%';
delete from public.batch_material_reconciliations where batch_id like '${prefix}%';
delete from public.batch_material_variances where batch_id like '${prefix}%';
delete from public.batch_material_returns where batch_id like '${prefix}%';
delete from public.batch_material_waste where batch_id like '${prefix}%';
delete from public.batch_material_consumptions where batch_id like '${prefix}%';
delete from public.batch_material_weighings where batch_id like '${prefix}%';
delete from public.inventory_reservations where batch_id like '${prefix}%';
delete from public.batch_material_lot_allocations where coalesce(lab_batch_id,production_run_id) like '${prefix}%';
delete from public.inventory_movements where inventory_lot_id like '${prefix}%';
delete from public.inventory_lots where id like '${prefix}%';
delete from public.lab_batch_lines where id like '${prefix}%';delete from public.lab_batches where id like '${prefix}%';
delete from public.production_run_lines where id like '${prefix}%';delete from public.production_runs where id like '${prefix}%';
delete from public.formula_lines where id like '${prefix}%';delete from public.formula_versions where id like '${prefix}%';
delete from public.formulas where id like '${prefix}%';delete from public.products where id like '${prefix}%';delete from public.ingredients where id like '${prefix}%';commit;`
  execFileSync('docker',['exec','supabase_db_koalafrog-hq','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',cleanup],{stdio:'ignore'})
 }
})

async function seed(){
 const status=execFileSync('npx',['supabase','status','-o','env'],{encoding:'utf8'})
 const env=Object.fromEntries(status.split('\n').map(line=>line.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(match=>[match![1],match![2]]))
 const credentials=owner(),admin=createClient(env.API_URL,env.SERVICE_ROLE_KEY||env.SECRET_KEY,{auth:{persistSession:false}})
 const client=createClient(env.API_URL,env.ANON_KEY||env.PUBLISHABLE_KEY,{auth:{persistSession:false}})
 expect((await client.auth.signInWithPassword({email:credentials.email,password:credentials.password})).error).toBeNull()
 const workspace=(await admin.from('workspaces').select('id').eq('owner_id',credentials.userId).single()).data!,suffix=crypto.randomUUID(),p=`pic-${credentials.runId}-${suffix}`,now='2026-07-28T10:00:00.000Z',owned={workspace_id:workspace.id,owner_id:credentials.userId}
 createdPrefixes.push(p)
 await client.from('ingredients').insert({...owned,id:`${p}-ingredient`,common_name:'Controlled E2E Oil',inci_name:'SIMMONDSIA CHINENSIS SEED OIL',category:'Oil',functions:['Emollient'],description:'',default_unit:'g',notes:'',status:'Active',created_at:now,updated_at:now})
 await client.from('products').insert({...owned,id:`${p}-product`,name:'Controlled E2E Product',category:'beard_oil',status:'Active',development_stage:'Formulation',description:'',scent_profile:'',created_at:now,updated_at:now})
 await client.from('formulas').insert({...owned,id:`${p}-formula`,product_id:`${p}-product`,name:'Controlled E2E Formula',description:'',created_at:now,updated_at:now})
 await client.from('formula_versions').insert({...owned,id:`${p}-version`,formula_id:`${p}-formula`,version:'1.0',status:'Approved',description:'',target_characteristics:'',phase_definitions:[],manufacturing_process:[],created_at:now,updated_at:now})
 await client.from('formula_lines').insert({...owned,id:`${p}-formula-line`,formula_version_id:`${p}-version`,ingredient_id:`${p}-ingredient`,percentage:100,phase:'A',sort_order:1,notes:'',formulation_role:'emollient'})
 await client.from('packaging_specifications').insert({...owned,id:`${p}-packaging-spec`,product_id:`${p}-product`,name:'E2E retail bottle',description:'10 g retail pack',created_at:now,updated_at:now})
 await client.from('packaging_specification_versions').insert({...owned,id:`${p}-packaging-version`,packaging_specification_id:`${p}-packaging-spec`,version:'1.0',status:'Approved',description:'Bottle and closure',notes:'',created_at:now,updated_at:now})
 for(const[index,component]of['bottle','closure'].entries()){
  await client.from('packaging_components').insert({...owned,id:`${p}-${component}-component`,name:`E2E ${component}`,category:component,description:'',default_unit:'pcs',colour:'',material:'',notes:'',status:'Active',created_at:now,updated_at:now})
  await client.from('packaging_specification_lines').insert({...owned,id:`${p}-${component}-line`,packaging_specification_version_id:`${p}-packaging-version`,packaging_component_id:`${p}-${component}-component`,quantity_per_unit:1,unit:'pcs',sort_order:index,purpose:component,notes:''})
  await client.from('packaging_inventory_lots').insert({...owned,id:`${p}-${component}-lot`,packaging_component_id:`${p}-${component}-component`,internal_lot_number:`PKG-${component}-${suffix.slice(0,8)}`,received_date:'2026-07-01',opening_quantity:30,unit:'pcs',location:'Packaging',status:'Active',notes:'',total_acquisition_cost:30,acquisition_cost_currency:'NOK',created_at:now,updated_at:now})
  await client.from('packaging_inventory_movements').insert({...owned,id:`${p}-${component}-receipt`,packaging_inventory_lot_id:`${p}-${component}-lot`,type:'Receipt',quantity:30,unit:'pcs',reason:'Packaging receipt',notes:'',occurred_at:now,created_at:now})
 }
 const insertedRun=await client.from('production_runs').insert({...owned,id:`${p}-run`,production_run_number:`PIC-E2E-${suffix.slice(0,8)}`,product_id:`${p}-product`,formula_id:`${p}-formula`,formula_version_id:`${p}-version`,status:'In Progress',planned_batch_size:100,planned_batch_unit:'g',actual_yield:100,actual_yield_unit:'g',created_at:now,updated_at:now,purpose:'Controlled browser proof',notes:'',summary:''})
 if(insertedRun.error)throw insertedRun.error
 await client.from('production_run_lines').insert({...owned,id:`${p}-line`,production_run_id:`${p}-run`,formula_line_id:`${p}-formula-line`,ingredient_id:`${p}-ingredient`,ingredient_name_snapshot:'Controlled E2E Oil',phase:'A',planned_percentage:100,planned_quantity:100,unit:'g',notes:'',status:'Pending',formula_id_snapshot:`${p}-formula`,formula_version_id_snapshot:`${p}-version`,inci_snapshot:'SIMMONDSIA CHINENSIS SEED OIL',functions_snapshot:['Emollient'],sort_order_snapshot:1,processing_instructions_snapshot:''})
 for(const[lotSuffix,expiry]of[['a','2026-10-01'],['b','2026-12-01']]){const lot=await admin.from('inventory_lots').insert({...owned,id:`${p}-lot-${lotSuffix}`,ingredient_id:`${p}-ingredient`,internal_lot_number:`PIC-${suffix.slice(0,8)}-${lotSuffix}`,received_date:'2026-07-01',opening_quantity:60,unit:'g',expiry_date:expiry,location:'Lab',status:'Active',released_at:now,notes:'',total_acquisition_cost:120,acquisition_cost_currency:'NOK',created_at:now,updated_at:now});if(lot.error)throw lot.error;const movement=await client.from('inventory_movements').insert({...owned,id:`${p}-receipt-${lotSuffix}`,inventory_lot_id:`${p}-lot-${lotSuffix}`,type:'Receipt',quantity:60,unit:'g',reason:'Released receipt',notes:'',occurred_at:now,created_at:now});if(movement.error)throw movement.error}
 return{runId:`${p}-run`,firstLotId:`${p}-lot-a`,secondLotId:`${p}-lot-b`}
}

async function seedLab(){
 const fixture=await seed(),credentials=owner(),prefix=fixture.runId.slice(0,-4)
 const status=execFileSync('npx',['supabase','status','-o','env'],{encoding:'utf8'})
 const env=Object.fromEntries(status.split('\n').map(line=>line.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(match=>[match![1],match![2]]))
 const client=createClient(env.API_URL,env.ANON_KEY||env.PUBLISHABLE_KEY,{auth:{persistSession:false}})
 expect((await client.auth.signInWithPassword({email:credentials.email,password:credentials.password})).error).toBeNull()
 const workspace=(await client.from('workspaces').select('id').eq('owner_id',credentials.userId).single()).data!,owned={workspace_id:workspace.id,owner_id:credentials.userId},now='2026-07-28T10:00:00.000Z'
 const labId=`${prefix}-lab`
 const batch=await client.from('lab_batches').insert({...owned,id:labId,batch_number:`PIC-LAB-${crypto.randomUUID().slice(0,8)}`,product_id:`${prefix}-product`,formula_id:`${prefix}-formula`,formula_version_id:`${prefix}-version`,status:'In Progress',planned_batch_size:100,planned_batch_unit:'g',actual_yield:100,created_at:now,updated_at:now,purpose:'Shared controlled browser proof',notes:'',summary:'',target_characteristics:''})
 if(batch.error)throw batch.error
 const line=await client.from('lab_batch_lines').insert({...owned,id:`${prefix}-lab-line`,lab_batch_id:labId,formula_line_id:`${prefix}-formula-line`,ingredient_id:`${prefix}-ingredient`,ingredient_name_snapshot:'Controlled E2E Oil',phase:'A',planned_percentage:100,planned_quantity:100,unit:'g',actual_quantity:null,notes:'',status:'Pending',formula_id_snapshot:`${prefix}-formula`,formula_version_id_snapshot:`${prefix}-version`,inci_snapshot:'SIMMONDSIA CHINENSIS SEED OIL',functions_snapshot:['Emollient'],sort_order_snapshot:1,processing_instructions_snapshot:''})
 if(line.error)throw line.error
 return{labId,lotId:fixture.firstLotId}
}

async function answer(page:import('@playwright/test').Page,values:string[],action:()=>Promise<void>){
 const handler=(dialog:import('@playwright/test').Dialog)=>dialog.accept(values.shift()??'')
 page.on('dialog',handler);try{await action()}finally{page.off('dialog',handler)}
}

test('Production controlled-material workspace completes a multi-lot controlled lifecycle',async({page})=>{
 const fixture=await seed();await signIn(page);await page.goto(`/production/${fixture.runId}`)
 await expect(page.getByText('Controlled material inventory')).toBeVisible()
 const form=page.locator('.lot-reservation-form')
 await expect(form.getByLabel('Eligible released lot').locator('option').filter({hasText:'Recommended by FEFO'})).toHaveCount(1)
 await form.getByLabel('Eligible released lot').selectOption(fixture.firstLotId)
 await form.getByLabel('Requested quantity').fill('60')
 await form.getByRole('button',{name:'Reserve lot'}).click()
 await expect(page.getByText(/60 g remaining/)).toBeVisible()
 await form.getByLabel('Eligible released lot').selectOption(fixture.secondLotId)
 await form.getByLabel('Requested quantity').fill('40')
 await form.getByRole('button',{name:'Reserve lot'}).click()
 await expect(page.locator('.reservation-actions')).toHaveCount(2)
 const firstReservation=page.locator('.reservation-actions').filter({hasText:'60 g remaining'})
 const secondReservation=page.locator('.reservation-actions').filter({hasText:'40 g remaining'})
 await answer(page,['60','1','Stainless vessel A','Stage first','plan:e2e'],()=>firstReservation.getByRole('button',{name:'Record planned weighing'}).click())
 await expect(page.getByText(/Sequence 1 · 60 g · Stainless vessel A/)).toBeVisible()
 await answer(page,['35','2','Stainless vessel B','Stage second','plan:e2e:2'],()=>secondReservation.getByRole('button',{name:'Record planned weighing'}).click())
 await expect(page.getByText(/Sequence 2 · 35 g · Stainless vessel B/)).toBeVisible()
 await answer(page,['60','actual:e2e','SCALE-01','Actual first'],()=>firstReservation.getByRole('button',{name:'Record weighing'}).click())
 await answer(page,['35','actual:e2e:2','SCALE-01','Actual second'],()=>secondReservation.getByRole('button',{name:'Record weighing'}).click())
 await answer(page,['59','1','Batch charge','actual:e2e'],()=>firstReservation.getByRole('button',{name:'Confirm consumption'}).click())
 await expect(page.locator('.material-totals dt:has-text("Consumed") + dd')).toHaveText('59 g')
 await answer(page,['35','Clean and uncontaminated','Unused staged material','return:e2e'],()=>page.getByRole('button',{name:'Return staged material'}).click())
 await expect(page.locator('.material-totals dt:has-text("Returned") + dd')).toHaveText('35 g')
 await answer(page,['5','Unused remainder'],()=>page.getByRole('button',{name:'Release unused'}).click())
 await answer(page,[''],()=>page.getByRole('button',{name:'Reconcile requirement'}).click())
 await expect(page.getByText('Ready for completion',{exact:true})).toBeVisible()
 await page.reload()
 await expect(page.getByText(/Sequence 1 · 60 g · Stainless vessel A/)).toBeVisible()
 await expect(page.getByText('Ready for completion',{exact:true})).toBeVisible()
 await page.getByText('Material provenance').click()
 await expect(page.getByText('Planned weighing',{exact:true})).toHaveCount(2)
 await expect(page.getByText(/productive consumption · present/)).toBeVisible()
 await answer(page,[''],()=>page.getByRole('button',{name:'Complete Production Run'}).click())
 await expect(page.getByText('Completed',{exact:true}).first()).toBeVisible()
 await expect(page.getByRole('button',{name:'Record planned weighing'})).toHaveCount(0)
 const createOutput=page.locator('.output-action-form').filter({hasText:'Create Production Output'})
 await createOutput.locator('summary').click()
 await createOutput.getByRole('button',{name:'Create controlled output'}).click()
 await expect(page.getByText(/OUT-01/)).toBeVisible()
 const measurement=page.locator('.output-action-form').filter({hasText:'Record actual measurement'})
 await measurement.locator('summary').click()
 await measurement.getByLabel('Net quantity').fill('100')
 await measurement.getByRole('button',{name:'Record versioned measurement'}).click()
 await expect(page.locator('.production-output-card dt:has-text("Actual measured") + dd')).toHaveText('100 g')
 for(const[type,quantity,reason,evidence]of[['retained_bulk','95','Available for packaging',''],['bulk_waste','3','Vessel residue',''],['unexplained_variance','2','Documented measurement variance','variance:e2e']]){
  const component=page.locator('.output-action-form').filter({hasText:'Record retained bulk'})
  if((await component.getAttribute('open'))===null)await component.locator('summary').click()
  await component.getByLabel('Component').selectOption(type)
  await component.getByLabel('Quantity').fill(quantity)
  await component.getByLabel('Reason').fill(reason)
  await component.getByLabel('Evidence').fill(evidence)
  await component.getByRole('button',{name:'Record immutable component'}).click()
 }
 const reconciliation=page.locator('.output-action-form').filter({hasText:'Reconcile equation'})
 await reconciliation.locator('summary').click()
 await reconciliation.getByLabel('Variance reason').fill('Two grams reviewed')
 await reconciliation.getByLabel('Evidence').fill('variance:e2e')
 await reconciliation.getByLabel('Approve documented unexplained variance').check()
 await reconciliation.getByRole('button',{name:'Run authoritative reconciliation'}).click()
 await expect(page.getByText('Ready to complete output stage')).toBeVisible()
 await page.getByRole('button',{name:'Complete Output Stage'}).click()
 await expect(page.getByText(/Ready for Packaging Planning/)).toBeVisible()
 await page.reload()
 await expect(page.getByText(/Ready for Packaging Planning/)).toBeVisible()
 const packaging=page.locator('.packaging-run-workspace')
 await expect(packaging.getByText('Available now')).toBeVisible()
 const createPackaging=packaging.locator('details').filter({hasText:'Create Packaging Run'}).first()
 await createPackaging.locator('summary').click()
 await createPackaging.getByLabel('Run label').fill('E2E controlled packaging')
 await createPackaging.getByLabel('Bulk quantity').fill('95')
 await createPackaging.getByLabel('Planned units').fill('10')
 await createPackaging.getByLabel('Nominal fill').fill('9.5')
 await createPackaging.getByRole('button',{name:'Create controlled Packaging Run'}).click()
 await expect(packaging.locator('.packaging-run-card .eyebrow')).toContainText('PKG-01')
 const allocate=packaging.locator('details').filter({hasText:'Allocate bulk'}).first()
 await allocate.locator('summary').click();await allocate.getByRole('button',{name:'Allocate bulk'}).click()
 const transfer=packaging.locator('details').filter({hasText:'Record bulk transfer'}).first()
 await transfer.locator('summary').click()
 await transfer.getByLabel('Actual transfer').fill('95')
 await transfer.getByLabel('Source vessel').fill('BULK-E2E')
 await transfer.getByLabel('Destination vessel').fill('FILL-E2E')
 await transfer.getByRole('button',{name:'Record bulk transfer'}).click()
 const requirementCount=await packaging.locator('.packaging-requirement').count()
 for(let index=0;index<requirementCount;index++){
  const requirement=packaging.locator('.packaging-requirement').nth(index)
  const reserve=requirement.locator('details').filter({hasText:'Reserve packaging'}).first()
  await reserve.locator('summary').click();await reserve.getByLabel('Quantity').fill('11')
  await reserve.getByRole('button',{name:'Reserve selected lot'}).click()
  const reservation=requirement.locator('details').filter({hasText:'Reservation'}).first()
  await reservation.locator(':scope > summary').click()
  const consume=reservation.locator('details').filter({hasText:'Consume packaging'}).first()
  await consume.locator('summary').click();await consume.getByLabel('Productive consumption').fill('10')
  await consume.getByRole('button',{name:'Consume packaging'}).click()
  const updatedReservation=requirement.locator('details').filter({hasText:'Reservation'}).first()
  if(index===0){
   const waste=updatedReservation.locator('details').filter({hasText:'Record waste or damage'}).first()
   await waste.locator('summary').click()
   await waste.getByLabel('Waste quantity').fill('1')
   await waste.getByLabel('Reason').fill('E2E filling damage')
   await waste.getByLabel('Evidence').fill('waste:e2e')
   await waste.getByRole('button',{name:'Record waste or damage'}).click()
  }else{
   const stagedReturn=updatedReservation.locator('details').filter({hasText:'Release or return unused packaging'}).first()
   await stagedReturn.locator('summary').click()
   await stagedReturn.getByLabel('Reason').fill('E2E unused staged closure')
   await stagedReturn.getByLabel('Staged-return evidence').fill('return:e2e')
   await stagedReturn.getByLabel('Physically staged? (yes/no)').fill('yes')
   await stagedReturn.getByRole('button',{name:'Release or return unused packaging'}).click()
  }
 }
 const packagingReconciliation=packaging.locator('details').filter({hasText:'Reconcile Packaging Run'}).first()
 await packagingReconciliation.locator('summary').click()
 await packagingReconciliation.getByLabel('Pending Finished Goods conversion').fill('95')
 await packagingReconciliation.getByRole('button',{name:'Reconcile Packaging Run'}).click()
 await expect(packaging.getByText('Ready to complete Packaging Run')).toBeVisible()
 await packaging.getByRole('button',{name:'Complete Packaging Run'}).click()
 await expect(packaging.locator('.completion-readiness strong')).toHaveText('Ready for Finished Goods Lot Creation')
 const finishedGoods=packaging.locator('.finished-goods-handoff')
 await expect(finishedGoods.getByText('Lot creation blocked')).toBeVisible()
 const packagedOutput=finishedGoods.locator('details').filter({hasText:'Record packaged-output reconciliation'}).first()
 await packagedOutput.locator('summary').click()
 await packagedOutput.getByLabel('Total').fill('10')
 await packagedOutput.getByLabel('Accepted').fill('10')
 await packagedOutput.getByLabel('Evidence').fill('packaged-count:e2e')
 await packagedOutput.getByRole('button',{name:'Record authoritative reconciliation'}).click()
 await expect(finishedGoods.getByText('Ready for quarantined lot creation')).toBeVisible()
 const createLot=async(quantity:string,code:string)=>{
  const form=finishedGoods.locator('details').filter({hasText:'Create Finished Goods Lot'}).first()
  if((await form.getAttribute('open'))===null)await form.locator('summary').click()
  await form.getByLabel('Lot quantity').fill(quantity)
  await form.getByLabel('Consumer batch code (optional)').fill(code)
  await form.getByLabel('This creates an immutable Finished Goods Lot in quarantine. It does not release inventory for sale.').check()
  await form.getByRole('button',{name:'Create quarantined Finished Goods Lot'}).click()
 }
 await createLot('6','KF-E2E-FG-01')
 await expect(finishedGoods.locator('.material-totals dt:has-text("Remaining accepted") + dd')).toHaveText('4 pcs')
 await page.reload()
 await expect(page.locator('.finished-goods-handoff')).toContainText('KF-E2E-FG-01')
 await createLot('4','KF-E2E-FG-02')
 await expect(page.locator('.finished-goods-handoff')).toContainText('Accepted output fully converted')
 const firstLotLink=page.locator('.finished-goods-lot-list').getByRole('link',{name:'Open genealogy'}).first()
 await firstLotLink.click()
 await expect(page.locator('.batch-source').getByText('Inspection required',{exact:true})).toBeVisible()
 await expect(page.getByText('No saleable inventory or quality release exists.')).toBeVisible()
 await expect(page.getByRole('heading',{name:'Backward genealogy'})).toBeVisible()
 await expect(page.getByRole('button',{name:/release/i})).toHaveCount(0)
 await page.goBack()
 await page.reload()
 await expect(page.locator('.packaging-run-workspace .completion-readiness strong')).toHaveText('Ready for Finished Goods Lot Creation')
 await expect(page.locator('.packaging-run-card')).toContainText('completed')
 await expect(page.locator('.finished-goods-lot-list')).toContainText('KF-E2E-FG-02')
 await expect(page.locator('body')).toHaveJSProperty('scrollWidth',await page.locator('body').evaluate(body=>body.clientWidth))
})

test('Lab uses the shared controlled-material reservation and planned-weighing contract',async({page})=>{
 const fixture=await seedLab();await signIn(page);await page.goto(`/lab/${fixture.labId}`)
 await expect(page.getByText('Controlled material inventory')).toBeVisible()
 const form=page.locator('.lot-reservation-form')
 await form.getByLabel('Eligible released lot').selectOption(fixture.lotId)
 await form.getByLabel('Requested quantity').fill('20')
 await form.getByRole('button',{name:'Reserve lot'}).click()
 await expect(page.getByText(/20 g remaining/)).toBeVisible()
 await answer(page,['20','1','Lab beaker A','Lab plan','lab-plan:e2e'],()=>page.getByRole('button',{name:'Record planned weighing'}).click())
 await expect(page.getByText(/Sequence 1 · 20 g · Lab beaker A/)).toBeVisible()
 await page.reload()
 await expect(page.getByText(/Sequence 1 · 20 g · Lab beaker A/)).toBeVisible()
 await expect(page.locator('body')).toHaveJSProperty('scrollWidth',await page.locator('body').evaluate(body=>body.clientWidth))
})
