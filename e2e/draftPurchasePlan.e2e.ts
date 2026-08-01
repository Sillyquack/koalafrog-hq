import { expect, test } from '@playwright/test'
import { signIn } from './ingredientKnowledge.helpers'
import { createLocalSupplier, fillMinimumDraftPlan, ownerClient } from './draftPurchasePlan.helpers'

test('owner reviews, creates, receives receipts, and reloads an internal Draft Purchase Plan',async({page})=>{
  const supplier=await createLocalSupplier(`Draft E2E Supplier ${Date.now()}`)
  await signIn(page)
  await page.goto('/procurement/draft-plans/new')
  await expect(page.getByRole('heading',{name:'Create Draft Purchase Plan'})).toBeVisible()
  await expect(page.getByText('Draft only — does not place an order.')).toBeVisible()
  const title=`Draft browser plan ${Date.now()}`
  await fillMinimumDraftPlan(page,supplier.supplierId,title)
  await page.getByRole('button',{name:'Review Draft Purchase Plan'}).click()
  await expect(page.getByRole('heading',{name:'Confirm this internal Draft snapshot'})).toBeVisible()
  await expect(page.getByText(/creates no order, cart, payment, receipt/i)).toBeVisible()
  await page.getByRole('button',{name:'Create Draft Purchase Plan'}).click()
  await expect(page.getByTestId('draft-plan-detail')).toBeVisible()
  await expect(page.getByTestId('draft-plan-receipt')).toBeVisible()
  await expect(page.getByText('Draft',{exact:true})).toBeVisible()
  await expect(page.getByText('Unplaced',{exact:true})).toBeVisible()
  await expect(page.getByText('Not authorised for ordering',{exact:true})).toBeVisible()
  await expect(page.getByText('Unknown',{exact:true}).first()).toBeVisible()
  await expect(page.getByRole('button',{name:'Copy plan ID'})).toBeVisible()
  await expect(page.getByRole('button',{name:'Download receipt bundle'})).toBeVisible()

  const planId=page.url().split('/').at(-1)!
  await page.reload()
  await expect(page.getByTestId('draft-plan-detail')).toBeVisible()
  await expect(page.getByRole('heading',{name:title})).toBeVisible()
  await expect(page.getByText('Not authorised for ordering',{exact:true})).toBeVisible()

  const {client,workspaceId}=await ownerClient()
  expect((await client.from('purchase_orders').select('id',{count:'exact',head:true}).eq('workspace_id',workspaceId).eq('source_purchase_plan_id',planId)).count).toBe(0)
  expect((await client.from('purchase_plans').select('status,placement_state,order_authorized').eq('id',planId).single()).data).toEqual({status:'draft',placement_state:'unplaced',order_authorized:false})
})

test('Packaging update waits for readback and retains the form on persistence failure',async({page})=>{
  const {client,workspaceId,ownerId}=await ownerClient()
  const id=`packaging-e2e-${Date.now()}`
  const inserted=await client.from('packaging_components').insert({
    workspace_id:workspaceId,owner_id:ownerId,id,name:'E2E bottle',category:'bottle',
    description:null,default_unit:'pcs',colour:null,material:null,capacity:30,capacity_unit:'ml',notes:null,
    status:'selected',ownership_state:'not_owned',stock_state:'none',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),
  })
  expect(inserted.error).toBeNull()
  await signIn(page)
  await page.goto(`/packaging/components/${id}`)
  await page.getByRole('button',{name:'Edit planning record'}).click()
  const form=page.locator('form.procurement-detail-form')
  await form.getByLabel('Sourcing notes').fill('Confirmed browser update')
  await form.getByRole('button',{name:'Save changes'}).click()
  await expect(page.getByTestId('operation-receipt')).toBeVisible()
  await expect(page.getByText('UPDATE confirmed')).toBeVisible()
  await expect(form).toHaveCount(0)
  await page.getByRole('button',{name:'Dismiss operation receipt'}).click()

  await page.getByRole('button',{name:'Edit planning record'}).click()
  const failedForm=page.locator('form.procurement-detail-form')
  await failedForm.getByLabel('Sourcing notes').fill('Retained failed browser value')
  await page.route('**/rest/v1/packaging_components*',route=>route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Forced local persistence failure'})}))
  await failedForm.getByRole('button',{name:'Save changes'}).click()
  await expect(failedForm).toBeVisible()
  await expect(failedForm.getByLabel('Sourcing notes')).toHaveValue('Retained failed browser value')
  await expect(failedForm.getByRole('alert')).toContainText('Forced local persistence failure')
  await expect(page.getByTestId('operation-receipt')).toHaveCount(0)
  expect((await client.from('packaging_components').select('ownership_state,stock_state,sourcing_notes').eq('id',id).single()).data).toEqual({ownership_state:'not_owned',stock_state:'none',sourcing_notes:'Confirmed browser update'})
})
