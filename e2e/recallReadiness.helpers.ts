import{expect,type Page}from'@playwright/test'
import{createClient}from'@supabase/supabase-js'
import{execFileSync}from'node:child_process'
import{owner,signIn}from'./ingredientKnowledge.helpers'

export async function seedRecallProductionBatch(){
 const status=execFileSync('npx',['supabase','status','-o','env'],{encoding:'utf8'})
 const env=Object.fromEntries(status.split('\n').map(line=>line.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(match=>[match![1],match![2]]))
 const credentials=owner(),admin=createClient(env.API_URL,env.SERVICE_ROLE_KEY||env.SECRET_KEY,{auth:{persistSession:false}})
 const workspace=(await admin.from('workspaces').select('id').eq('owner_id',credentials.userId).single()).data!
 const suffix=crypto.randomUUID(),prefix=`rr-e2e-${suffix}`,owned={workspace_id:workspace.id,owner_id:credentials.userId},now='2026-07-29T10:00:00Z'
 for(const request of[
  admin.from('products').insert({...owned,id:`${prefix}-product`,name:'Recall E2E Product',category:'beard_oil',status:'Active',development_stage:'Production',description:'',scent_profile:'',created_at:now,updated_at:now}),
  admin.from('formulas').insert({...owned,id:`${prefix}-formula`,product_id:`${prefix}-product`,name:'Recall E2E Formula',description:'',created_at:now,updated_at:now}),
 ])expect((await request).error).toBeNull()
 expect((await admin.from('formula_versions').insert({...owned,id:`${prefix}-version`,formula_id:`${prefix}-formula`,version:'1.0',status:'Approved',description:'',target_characteristics:'',phase_definitions:[],manufacturing_process:[],created_at:now,updated_at:now})).error).toBeNull()
 expect((await admin.from('production_runs').insert({...owned,id:`${prefix}-run`,production_run_number:`RR-E2E-${suffix.slice(0,8)}`,product_id:`${prefix}-product`,formula_id:`${prefix}-formula`,formula_version_id:`${prefix}-version`,status:'Completed',planned_batch_size:100,planned_batch_unit:'g',actual_yield:100,actual_yield_unit:'g',created_at:now,updated_at:now,purpose:'Recall browser proof',notes:'',summary:''})).error).toBeNull()
 return`${prefix}-run`
}

export async function completeCoreRecallReadinessFlow(page:Page){
 const runId=await seedRecallProductionBatch()
 await signIn(page);await page.goto(`/recall-readiness?sourceType=production_batch&sourceId=${encodeURIComponent(runId)}`)
 await expect(page.getByRole('heading',{name:'Recall readiness'})).toBeVisible()
 await expect(page.getByText('Customer and distribution tracing are not implemented in the current platform.')).toBeVisible()
 await page.getByLabel('Case title').fill('Controlled E2E readiness concern')
 await page.getByLabel('Issue summary').fill('Document and freeze the internal impact of a controlled E2E concern.')
 await expect(page.getByLabel('Canonical identity or exact batch code')).toHaveValue(runId)
 await page.getByRole('button',{name:'Create case after validation'}).click()
 await expect(page.getByRole('heading',{name:'Assessment revision'})).toBeVisible()
 await page.getByLabel('Severity').selectOption('moderate')
 await page.getByLabel('Urgency').selectOption('prompt')
 await page.getByLabel('Exposure state').selectOption('unknown')
 await page.getByLabel('Health-hazard assessment').fill('No conclusion; controlled review is required.')
 await page.getByLabel('Compliance assessment').fill('Internal assessment only.')
 await page.getByLabel('Operator recommendation').fill('Continue the controlled investigation.')
 await page.getByLabel('I acknowledge customer and distribution tracing is unavailable').check()
 await page.getByLabel('Acknowledge unknown exposure where selected').check()
 await page.getByRole('button',{name:'Create immutable revision'}).click()
 await expect(page.getByRole('heading',{name:/Assessment revision 1/})).toBeVisible()
 await page.getByLabel('Evidence title').fill('E2E deviation record')
 await page.getByLabel('Description').fill('Controlled private evidence metadata.')
 await page.getByLabel('Private document or storage reference').fill('deviation:e2e')
 await page.getByRole('button',{name:'Register immutable evidence metadata'}).click()
 await expect(page.getByText('E2E deviation record')).toBeVisible()
 await page.getByRole('button',{name:'Generate and freeze scope'}).click()
 await expect(page.getByRole('heading',{name:'Frozen scope'})).toBeVisible()
 await expect(page.getByRole('heading',{name:'Decision readiness'})).toBeVisible()
 await expect(page.getByText('Not ready',{exact:true})).toBeVisible()
 await expect(page.getByText('Customer And Distribution Tracing Not Implemented')).toBeVisible()
 await expect(page.getByRole('button',{name:'Approve frozen readiness assessment'})).toBeDisabled()
 await page.reload()
 await expect(page.getByRole('heading',{name:'Frozen scope'})).toBeVisible()
 return runId
}
