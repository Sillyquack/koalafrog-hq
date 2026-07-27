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
