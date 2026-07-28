import{expect,test}from'@playwright/test'
import{createClient}from'@supabase/supabase-js'
import{execFileSync}from'node:child_process'
import{owner,signIn}from'./ingredientKnowledge.helpers'

async function localOwnerClient(){
 const status=execFileSync('npx',['supabase','status','-o','env'],{encoding:'utf8'})
 const values=Object.fromEntries(status.split('\n').map(line=>line.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(match=>[match![1],match![2]]))
 if(!values.API_URL||!values.ANON_KEY||!/^http:\/\/(127\.0\.0\.1|localhost):/.test(values.API_URL))throw new Error('Production readiness E2E requires local Supabase.')
 const client=createClient(values.API_URL,values.ANON_KEY,{auth:{persistSession:false}}),credentials=owner(),signedIn=await client.auth.signInWithPassword({email:credentials.email,password:credentials.password})
 if(signedIn.error)throw signedIn.error
 return client
}

async function seedTwoSupplierScenario(client:Awaited<ReturnType<typeof localOwnerClient>>){
 const credentials=owner(),workspace=(await client.from('workspaces').select('id').eq('owner_id',credentials.userId).single()).data!,workspaceId=workspace.id
 const prefix=`approval-${credentials.runId}`,owned={workspace_id:workspaceId,owner_id:credentials.userId},now='2026-07-28T06:00:00.000Z'
 const ingredientA=`${prefix}-oil`,ingredientB=`${prefix}-wax`,supplierA=crypto.randomUUID(),supplierB=crypto.randomUUID()
 expect((await client.from('ingredients').insert([
  {...owned,id:ingredientA,common_name:'Approval Oil',inci_name:'SIMMONDSIA CHINENSIS SEED OIL',category:'Oil',functions:['Emollient'],description:'',default_unit:'g',notes:'',status:'Active',created_at:now,updated_at:now},
  {...owned,id:ingredientB,common_name:'Approval Wax',inci_name:'CANDELILLA CERA',category:'Wax',functions:['Structurant'],description:'',default_unit:'g',notes:'',status:'Active',created_at:now,updated_at:now},
 ])).error).toBeNull()
 const categories=['beard_oil','beard_butter','beard_balm','deodorant']as const
 for(const[index,category]of categories.entries()){
  const ingredientId=index<2?ingredientA:ingredientB
  expect((await client.from('products').insert({...owned,id:`${prefix}-product-${category}`,name:`Approval ${category}`,category,status:'Active',development_stage:'Formulation',description:'',scent_profile:'',created_at:now,updated_at:now})).error).toBeNull()
  expect((await client.from('formulas').insert({...owned,id:`${prefix}-formula-${category}`,product_id:`${prefix}-product-${category}`,name:`Approval ${category} formula`,description:'',created_at:now,updated_at:now})).error).toBeNull()
  expect((await client.from('formula_versions').insert({...owned,id:`${prefix}-version-${category}`,formula_id:`${prefix}-formula-${category}`,version:'v1.0',status:'Approved',description:'',target_characteristics:'',phase_definitions:[{code:'A',name:'Main',order:1}],manufacturing_process:[],created_at:now,updated_at:now})).error).toBeNull()
  expect((await client.from('formula_lines').insert({...owned,id:`${prefix}-line-${category}`,formula_version_id:`${prefix}-version-${category}`,ingredient_id:ingredientId,percentage:100,phase:'A',sort_order:1,notes:'',formulation_role:category==='deodorant'?'deodorant_active':'emollient'})).error).toBeNull()
 }
 expect((await client.from('suppliers').insert([
  {...owned,id:supplierA,legal_name:'Approval Supplier Alpha',supplier_type:'raw_material',status:'active',internal_notes:'',is_preferred:true,website_url:'https://alpha.example.test'},
  {...owned,id:supplierB,legal_name:'Approval Supplier Beta',supplier_type:'raw_material',status:'active',internal_notes:'',is_preferred:false,website_url:'https://beta.example.test'},
 ])).error).toBeNull()
 expect((await client.from('supplier_products').insert([
  {...owned,id:`${prefix}-supplier-product-a`,ingredient_id:ingredientA,supplier_id:supplierA,supplier_name:'Approval Supplier Alpha',product_name:'Approval Oil 500 g',package_quantity:500,package_unit:'g',price:100,currency:'NOK',product_url:'https://alpha.example.test/oil',notes:'',is_preferred:true,grade:'Cosmetic',product_status:'verified_operational',availability_status:'in_stock',last_verified_date:'2026-07-28',verification:{sds:'reviewed'},created_at:now,updated_at:now},
  {...owned,id:`${prefix}-supplier-product-b`,ingredient_id:ingredientB,supplier_id:supplierB,supplier_name:'Approval Supplier Beta',product_name:'Approval Wax 250 g',package_quantity:250,package_unit:'g',price:80,currency:'NOK',product_url:'https://beta.example.test/wax',notes:'',is_preferred:true,grade:'Cosmetic',product_status:'verified_operational',availability_status:'in_stock',last_verified_date:'2026-07-28',verification:{sds:'reviewed'},created_at:now,updated_at:now},
 ])).error).toBeNull()
 expect((await client.from('procurement_supplier_shipping_rules').insert([
  {...owned,supplier_id:supplierA,destination_country_code:'NO',currency:'NOK',flat_rate:20,tax_handling:'included',duty_handling:'excluded',status:'active',verified_at:now,evidence_notes:''},
  {...owned,supplier_id:supplierB,destination_country_code:'NO',currency:'NOK',flat_rate:30,tax_handling:'included',duty_handling:'excluded',status:'active',verified_at:now,evidence_notes:''},
 ])).error).toBeNull()
 const created=await client.rpc('create_production_procurement_round',{candidate_workspace_id:workspaceId,candidate_title:'Approval E2E round',candidate_notes:'',candidate_base_currency:'NOK',idempotency_key:crypto.randomUUID()})
 expect(created.error).toBeNull()
 const roundId=created.data as string,selections=categories.map(category=>({category,productId:`${prefix}-product-${category}`,formulaVersionId:`${prefix}-version-${category}`,batchCount:1,batchSize:100,batchUnit:'g',overagePercent:0,expectedYield:null,deodorantStructure:category==='deodorant'?'anhydrous':null}))
 expect((await client.rpc('update_production_procurement_round_products',{target_round_id:roundId,expected_revision:1,round_title:'Approval E2E round',round_notes:'',product_selections:selections})).error).toBeNull()
 expect((await client.rpc('regenerate_production_procurement_requirements',{target_round_id:roundId,expected_revision:2})).error).toBeNull()
 const requirements=(await client.from('production_procurement_requirements').select('*').eq('round_id',roundId).order('ingredient_id')).data!
 let roundRevision=3
 for(const requirement of requirements){
  const supplierProductId=requirement.ingredient_id===ingredientA?`${prefix}-supplier-product-a`:`${prefix}-supplier-product-b`
  expect((await client.rpc('generate_production_requirement_candidates',{target_requirement_id:requirement.id,expected_round_revision:roundRevision})).error).toBeNull();roundRevision++
  expect((await client.rpc('accept_supplier_product_ingredient_mapping',{target_requirement_id:requirement.id,target_supplier_product_id:supplierProductId,expected_round_revision:roundRevision,acceptance_note:'Approval E2E'})).error).toBeNull();roundRevision++
  expect((await client.rpc('generate_production_requirement_candidates',{target_requirement_id:requirement.id,expected_round_revision:roundRevision})).error).toBeNull();roundRevision++
  const candidate=(await client.from('production_requirement_supplier_candidates').select('id').eq('requirement_id',requirement.id).eq('supplier_product_id',supplierProductId).single()).data!
  const match=(await client.from('production_requirement_supplier_matches').select('revision').eq('requirement_id',requirement.id).single()).data!
  expect((await client.rpc('select_production_requirement_supplier_product',{target_requirement_id:requirement.id,target_candidate_id:candidate.id,expected_round_revision:roundRevision,expected_match_revision:match.revision})).error).toBeNull();roundRevision++
 }
 expect((await client.rpc('generate_production_procurement_scenarios',{target_round_id:roundId,expected_round_revision:roundRevision})).error).toBeNull();roundRevision++
 const scenario=(await client.from('production_procurement_scenarios').select('*').eq('round_id',roundId).eq('strategy','balanced').neq('status','published').single()).data!
 expect(scenario).toMatchObject({supplier_count:2,line_count:2})
 expect((await client.rpc('publish_production_procurement_scenario',{target_scenario_id:scenario.id,expected_scenario_revision:scenario.revision,expected_round_revision:roundRevision})).error).toBeNull()
 return{workspaceId,roundId,scenarioId:scenario.id,roundRevision:roundRevision+1}
}

async function answerPrompts(page:import('@playwright/test').Page,answers:string[],action:()=>Promise<void>){
 const handler=async(dialog:import('@playwright/test').Dialog)=>void dialog.accept(answers.shift()??'')
 page.on('dialog',handler)
 try{await action()}finally{page.off('dialog',handler)}
}

test('owner persists, regenerates, reopens, and cancels a four-product production round without stock writes',async({page})=>{
 const admin=await localOwnerClient(),credentials=owner(),workspace=await admin.from('workspaces').select('id').eq('owner_id',credentials.userId).single()
 if(workspace.error)throw workspace.error
 const workspaceId=workspace.data.id,owned={workspace_id:workspaceId,owner_id:credentials.userId},now='2026-07-27T12:00:00.000Z'
 expect((await admin.from('ingredients').insert({...owned,id:'e2e-production-oil',common_name:'E2E Production Oil',inci_name:'SIMMONDSIA CHINENSIS SEED OIL',category:'Oil',functions:['Emollient'],description:'',default_unit:'g',notes:'',status:'Active',created_at:now,updated_at:now})).error).toBeNull()
 const categories=[['beard_oil','Beard Oil'],['beard_butter','Beard Butter'],['beard_balm','Beard Balm'],['deodorant','Deodorant']]as const
 for(const[category,label]of categories){
  expect((await admin.from('products').insert({...owned,id:`e2e-product-${category}`,name:label,category:label,status:'Active',development_stage:'Formulation',description:'',scent_profile:'',created_at:now,updated_at:now})).error).toBeNull()
  expect((await admin.from('formulas').insert({...owned,id:`e2e-formula-${category}`,product_id:`e2e-product-${category}`,name:`${label} E2E formula`,description:'',created_at:now,updated_at:now})).error).toBeNull()
  expect((await admin.from('formula_versions').insert({...owned,id:`e2e-version-${category}`,formula_id:`e2e-formula-${category}`,version:'v1.0',status:'Approved',description:'',target_characteristics:'',phase_definitions:[{code:'A',name:'Main',order:1}],manufacturing_process:[],created_at:now,updated_at:now})).error).toBeNull()
  expect((await admin.from('formula_lines').insert({...owned,id:`e2e-line-${category}`,formula_version_id:`e2e-version-${category}`,ingredient_id:'e2e-production-oil',percentage:100,phase:'A',sort_order:1,notes:'',formulation_role:category==='deodorant'?'deodorant_active':'emollient'})).error).toBeNull()
 }
 const movementsBefore=await admin.from('inventory_movements').select('*',{count:'exact',head:true}).eq('workspace_id',workspaceId)
 await signIn(page)
 await page.goto('/procurement/production-readiness')
 await page.getByRole('button',{name:'New round'}).click()
 await expect(page.getByText('4',{exact:true}).first()).toBeVisible()
 for(const[category,label]of categories){
  const card=page.locator('.readiness-product').filter({hasText:`${label} · mandatory`})
  await card.getByLabel('Product').selectOption(`e2e-product-${category}`)
  await card.getByLabel('Formula version').selectOption(`e2e-version-${category}`)
  if(category==='deodorant')await card.getByLabel('Deodorant structure').selectOption('anhydrous')
 }
 await page.getByRole('button',{name:'Save and regenerate'}).click()
 await expect(page.getByRole('status')).toContainText('Requirements regenerated transactionally')
 await expect(page.getByRole('heading',{name:'E2E Production Oil'})).toBeVisible()
 await expect(page.getByText('420 g',{exact:true}).first()).toBeVisible()
 const revisionBefore=Number(await page.locator('.readiness-summary article').filter({hasText:'Draft revision'}).locator('strong').textContent())
 const roundUrl=page.url()
 await page.reload()
 await expect(page).toHaveURL(roundUrl)
 await expect(page.getByRole('heading',{name:'E2E Production Oil'})).toBeVisible()
 const oilCard=page.locator('.readiness-product').filter({hasText:'Beard Oil · mandatory'})
 await oilCard.getByLabel('Batch count').fill('2')
 await page.getByRole('button',{name:'Save and regenerate'}).click()
 await expect(page.getByText('525 g',{exact:true}).first()).toBeVisible()
 const revisionAfter=Number(await page.locator('.readiness-summary article').filter({hasText:'Draft revision'}).locator('strong').textContent())
 expect(revisionAfter).toBeGreaterThan(revisionBefore)
 page.once('dialog',dialog=>dialog.accept())
 await page.getByRole('button',{name:'Cancel round'}).click()
 await expect(page.getByRole('status')).toContainText('Round cancelled')
 await expect(page.getByRole('button',{name:'Save and regenerate'})).toHaveCount(0)
 expect((await admin.from('inventory_movements').select('*',{count:'exact',head:true}).eq('workspace_id',workspaceId)).count).toBe(movementsBefore.count)
})

test('owner approves and verifies one two-supplier plan, then explicitly supersedes it without creating execution records',async({page})=>{
 const client=await localOwnerClient(),fixture=await seedTwoSupplierScenario(client)
 const ordersBefore=(await client.from('purchase_orders').select('*',{count:'exact',head:true}).eq('workspace_id',fixture.workspaceId)).count
 const movementsBefore=(await client.from('inventory_movements').select('*',{count:'exact',head:true}).eq('workspace_id',fixture.workspaceId)).count
 await signIn(page)
 await page.goto(`/procurement/production-readiness/${fixture.roundId}`)
 const published=page.locator('.scenario-card').filter({hasText:'Recommended balanced plan'}).filter({hasText:'published'})
 await expect(published).toContainText('2 / 2')
 await published.getByRole('button',{name:'Approve immutable plan'}).click()
 const planV1=page.locator('.purchase-plan-card').filter({hasText:'Plan v1'})
 await expect(planV1).toContainText('2 suppliers · 2 lines')
 await expect(planV1).toContainText('verification required')
 await expect(client.from('purchase_orders').select('id').eq('source_purchase_plan_id',(await client.from('purchase_plans').select('id').eq('source_scenario_id',fixture.scenarioId).single()).data!.id)).resolves.toMatchObject({data:[]})

 const priceCheck=planV1.locator('.scenario-line').filter({hasText:'package price'}).filter({hasText:'Expected: 100'}).first()
 await answerPrompts(page,['95','Lower checkout price','checkout evidence'],()=>priceCheck.getByRole('button',{name:'Record change'}).click())
 await expect(planV1).toContainText('changed acceptable')
 for(const field of ['stock availability','package identity']){
  const check=planV1.locator('.scenario-line').filter({hasText:field}).first()
  await answerPrompts(page,['checkout evidence'],()=>check.getByRole('button',{name:'Confirm'}).click())
 }
 await expect(planV1.getByRole('button',{name:'Mark checkout ready'})).toBeDisabled()
 const planId=(await client.from('purchase_plans').select('id').eq('source_scenario_id',fixture.scenarioId).single()).data!.id
 for(const check of (await client.from('purchase_plan_verifications').select('*').eq('purchase_plan_id',planId)).data!){
  if(check.resolution_state==='resolved')continue
  expect((await client.rpc('record_purchase_plan_verification',{target_verification_id:check.id,expected_revision:check.revision,candidate_state:'confirmed',candidate_verified_value:check.expected_value,candidate_unit_or_currency:check.expected_unit_or_currency??'',candidate_method:'manual_owner_check',candidate_evidence:'E2E checkout',candidate_note:'Confirmed'})).error).toBeNull()
 }
 await page.reload()
 await page.locator('.purchase-plan-card').filter({hasText:'Plan v1'}).getByRole('button',{name:'Mark checkout ready'}).click()
 await expect(page.locator('.purchase-plan-card').filter({hasText:'Plan v1'})).toContainText('checkout ready')
 await page.reload()
 await expect(page.locator('.purchase-plan-card').filter({hasText:'Plan v1'})).toContainText('changed acceptable')

 const currentRound=(await client.from('production_procurement_rounds').select('revision').eq('id',fixture.roundId).single()).data!
 expect((await client.rpc('generate_production_procurement_scenarios',{target_round_id:fixture.roundId,expected_round_revision:currentRound.revision})).error).toBeNull()
 const newRound=(await client.from('production_procurement_rounds').select('revision').eq('id',fixture.roundId).single()).data!
 const scenarioB=(await client.from('production_procurement_scenarios').select('*').eq('round_id',fixture.roundId).eq('strategy','balanced').neq('status','published').single()).data!
 expect((await client.rpc('publish_production_procurement_scenario',{target_scenario_id:scenarioB.id,expected_scenario_revision:scenarioB.revision,expected_round_revision:newRound.revision})).error).toBeNull()
 await page.reload()
 page.once('dialog',dialog=>void dialog.accept())
 await page.locator('.scenario-card').filter({hasText:'Recommended balanced plan'}).filter({hasText:'published'}).filter({has:page.getByRole('button',{name:'Approve immutable plan'})}).getByRole('button',{name:'Approve immutable plan'}).click()
 await expect(page.locator('.purchase-plan-card').filter({hasText:'Plan v1'})).toContainText('superseded')
 await expect(page.locator('.purchase-plan-card').filter({hasText:'Plan v2'})).toContainText('verification required')
 expect((await client.from('purchase_orders').select('*',{count:'exact',head:true}).eq('workspace_id',fixture.workspaceId)).count).toBe(ordersBefore)
 expect((await client.from('inventory_movements').select('*',{count:'exact',head:true}).eq('workspace_id',fixture.workspaceId)).count).toBe(movementsBefore)
})
