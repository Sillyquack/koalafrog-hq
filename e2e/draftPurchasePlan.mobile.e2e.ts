import { expect, test } from '@playwright/test'
import { signIn } from './ingredientKnowledge.helpers'
import { createLocalSupplier, fillMinimumDraftPlan } from './draftPurchasePlan.helpers'

test('Draft Purchase Plan builder and persisted detail fit a 390 by 844 viewport',async({page})=>{
  const supplier=await createLocalSupplier(`Draft Mobile Supplier ${Date.now()}`)
  await signIn(page)
  await page.goto('/procurement/draft-plans/new')
  const workspace=page.locator('.draft-plan-workspace')
  await expect(workspace).toBeVisible()
  expect(await workspace.evaluate(element=>element.scrollWidth)).toBeLessThanOrEqual(390)
  await fillMinimumDraftPlan(page,supplier.supplierId,`Mobile Draft plan ${Date.now()}`)
  await page.getByRole('button',{name:'Review Draft Purchase Plan'}).click()
  await expect(page.getByRole('button',{name:'Create Draft Purchase Plan'})).toBeVisible()
  await page.getByRole('button',{name:'Create Draft Purchase Plan'}).click()
  await expect(page.getByTestId('draft-plan-detail')).toBeVisible()
  expect(await page.getByTestId('draft-plan-detail').evaluate(element=>element.scrollWidth)).toBeLessThanOrEqual(390)
  await expect(page.getByText('Draft',{exact:true})).toBeVisible()
  await expect(page.getByText('Unplaced',{exact:true})).toBeVisible()
  await expect(page.getByText('Not authorised for ordering',{exact:true})).toBeVisible()
})
