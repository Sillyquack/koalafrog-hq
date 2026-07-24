import{expect,test}from'@playwright/test'
import{createClient}from'@supabase/supabase-js'
import{execFileSync}from'node:child_process'
import{owner,signIn}from'./ingredientKnowledge.helpers'

function localAdmin(){
 const status=execFileSync('npx',['supabase','status','-o','env'],{encoding:'utf8'})
 const values=Object.fromEntries(status.split('\n').map(line=>line.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map(match=>[match![1],match![2]]))
 const url=values.API_URL,serviceKey=values.SERVICE_ROLE_KEY
 if(!url||!serviceKey||!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url))throw new Error('Durable E2E refuses non-local Supabase.')
 return createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
}

test('owner creates a procurement request and requested item without placing an order',async({page})=>{
 await signIn(page)
 await page.goto('/procurement')
 await expect(page.getByRole('heading',{name:'Procurement'})).toBeVisible()
 await expect(page.getByText(/never places orders or makes payments/i)).toBeVisible()
 const title=`E2E pilot materials ${Date.now()}`
 await page.getByRole('button',{name:'New request'}).click()
 const requestForm=page.locator('form.procurement-request-form')
 await requestForm.getByLabel('Request title').fill(title)
 await requestForm.getByLabel('Category').fill('raw_material')
 await requestForm.getByLabel('Priority').selectOption('high')
 await page.getByRole('button',{name:'Save request'}).click()
 await page.getByRole('link',{name:new RegExp(title)}).click()
 await expect(page.getByRole('heading',{name:title})).toBeVisible()
 await page.getByRole('button',{name:'Add requested item'}).click()
 const itemForm=page.locator('form.procurement-detail-form')
 await itemForm.getByLabel('Name').fill('Jojoba oil')
 await itemForm.getByLabel('Category').fill('carrier_oil')
 await itemForm.getByLabel('Quantity').fill('2500')
 await itemForm.getByLabel('Unit').fill('ml')
 await itemForm.getByLabel('Required specifications').fill('Cosmetic grade\nCOA preferred')
 await page.getByRole('button',{name:'Save item'}).click()
 await expect(page.getByRole('heading',{name:'Jojoba oil'})).toBeVisible()
 await expect(page.getByText('No offers recorded. Unknown values are expected during early research.')).toBeVisible()
 await expect(page.getByText('No recommendation yet')).toBeVisible()
 await expect(page.getByText('ordered',{exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:/Move to ordered/})).toHaveCount(0)
 await page.getByRole('button',{name:'Start research'}).click()
 await expect(page.getByText(/2 results · 2 awaiting review/)).toBeVisible()
 const candidates=page.locator('.candidate-inbox article')
 await expect(candidates).toHaveCount(2)
 await candidates.locator('button:not([disabled])').filter({hasText:'Accept'}).click()
 await expect(candidates).toHaveCount(1)
 await candidates.first().getByRole('button',{name:'Reject'}).click()
 await expect(page.getByText(/all reviewable candidates are processed|No candidates awaiting review/)).toBeVisible()
 await expect(page.getByText(/Nordic Lab Materials/)).toBeVisible()

 await page.route('**/functions/v1/procurement-live-research',async route=>{
  expect(route.request().headers().authorization).toMatch(/^Bearer [^\s]+$/)
  await route.fulfill({status:202,contentType:'application/json',body:JSON.stringify({accepted:true,status:'running'})})
 })
 await page.getByLabel('Provider').selectOption('live')
 await page.getByLabel('I understand live research sends this request to an approved external provider. Results may be incomplete and require review.').check()
 await page.getByRole('button',{name:'Start research'}).click()
 await expect(page.locator('.research-job').getByText('Live web research')).toBeVisible()
 await expect(page.locator('.research-job').getByText('running',{exact:true})).toBeVisible()
 await expect(page.getByText(/resp_|provider operation/i)).toHaveCount(0)
})

test('lost acknowledgement and early webhook reconcile into one review candidate',async({page})=>{
 const admin=localAdmin()
 await signIn(page)
 await page.goto('/procurement')
 const title=`Durable E2E ${Date.now()}`
 await page.getByRole('button',{name:'New request'}).click()
 const requestForm=page.locator('form.procurement-request-form')
 await requestForm.getByLabel('Request title').fill(title)
 await requestForm.getByLabel('Category').fill('raw_material')
 await page.getByRole('button',{name:'Save request'}).click()
 await page.getByRole('link',{name:new RegExp(title)}).click()
 await page.getByRole('button',{name:'Add requested item'}).click()
 const itemForm=page.locator('form.procurement-detail-form')
 await itemForm.getByLabel('Name').fill('Durable jojoba')
 await itemForm.getByLabel('Category').fill('carrier_oil')
 await itemForm.getByLabel('Quantity').fill('1000')
 await itemForm.getByLabel('Unit').fill('ml')
 await page.getByRole('button',{name:'Save item'}).click()

 let attemptId='',jobId='',workspaceId='',itemId=''
 const providerOperationId=`resp_e2e_${Date.now()}`,eventId=`evt_e2e_${Date.now()}`
 await page.route('**/functions/v1/procurement-live-research',async route=>{
  const body=route.request().postDataJSON()as{workspaceId:string;jobId:string;items:Array<{id:string}>}
  workspaceId=body.workspaceId;jobId=body.jobId;itemId=body.items[0].id
  const intent=await admin.rpc('begin_procurement_background_submission',{
   candidate_workspace_id:workspaceId,candidate_job_id:jobId,
   candidate_owner_id:owner().userId,
   maximum_daily_invocations:100,
  })
  expect(intent.error).toBeNull()
  attemptId=intent.data![0].attempt_id
  expect((await admin.rpc('start_procurement_background_submission',{candidate_attempt_id:attemptId})).data).toBe(true)
  expect((await admin.rpc('store_procurement_background_webhook',{
   candidate_event_id:eventId,candidate_provider_operation_id:providerOperationId,
   candidate_event_type:'response.completed',
  })).data).toBe('stored')
  expect((await admin.rpc('attach_procurement_background_operation',{
   candidate_attempt_id:attemptId,
   candidate_owner_id:owner().userId,
   candidate_provider_operation_id:providerOperationId,candidate_provider_status:'in_progress',
  })).data).toBe('attached')
  await route.abort('connectionreset')
 })
 await page.getByLabel('Provider').selectOption('live')
 await page.getByLabel('I understand live research sends this request to an approved external provider. Results may be incomplete and require review.').check()
 await page.getByRole('button',{name:'Start research'}).click()
 await expect(page.locator('.research-job').getByText('running',{exact:true})).toBeVisible()
 await expect(page.locator('.research-job').getByText('Submitted',{exact:true})).toBeVisible()

 const workerId=crypto.randomUUID()
 expect((await admin.rpc('claim_procurement_background_operation',{
  candidate_attempt_id:attemptId,candidate_worker_id:workerId,
  candidate_stage:'e2e_terminal',lease_seconds:30,
 })).data).toBe(true)
 const candidate={
  requested_item_id:itemId,supplier_name:'Durable Test Supplier',
  product_title:'Jojoba Oil 1 L',source_url:'https://example.test/jojoba',
  package_quantity:1,package_unit:'l',item_price:25,currency:'USD',moq:1,
  shipping_cost:null,delivery_estimate_days:7,stock_status:'unknown',
  coa_availability:'unknown',sds_availability:'unknown',
  technical_document_availability:'unknown',first_order_discount:null,
  source_date:'2026-07-23',evidence_snippets:['Local deterministic E2E evidence.'],
  source_notes:'Stubbed provider result.',confidence:'medium',freshness:'fresh',
  field_states:{sourceUrl:'verified'},field_evidence:{sourceUrl:[]},
  is_marketplace_listing:false,unresolved_fields:['shippingCost'],
 }
 expect((await admin.rpc('finalize_procurement_background_operation',{
  candidate_attempt_id:attemptId,candidate_worker_id:workerId,
  candidate_event_id:eventId,candidate_provider_status:'completed',
  candidate_candidates:[candidate],candidate_partial:false,
  candidate_error_code:null,candidate_error_details:null,candidate_terminal_source:'webhook',
 })).data).toBe('finalized')
 expect((await admin.rpc('store_procurement_background_webhook',{
  candidate_event_id:eventId,candidate_provider_operation_id:providerOperationId,
  candidate_event_type:'response.completed',
 })).data).toBe('duplicate')

 await page.reload()
 await expect(page.getByText('Durable Test Supplier')).toBeVisible()
 await expect(page.locator('.candidate-inbox article')).toHaveCount(1)
 await expect(page.getByText(/resp_e2e_|evt_e2e_/)).toHaveCount(0)
 await expect(page.getByText('No offers recorded. Unknown values are expected during early research.')).toBeVisible()
})
