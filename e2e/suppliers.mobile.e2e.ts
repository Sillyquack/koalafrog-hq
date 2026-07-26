import { expect, test } from '@playwright/test'
import { signIn } from './ingredientKnowledge.helpers'

test('Suppliers list and selected profile remain usable at 390px', async ({ page }) => {
  await signIn(page)
  await page.goto('/suppliers')

  await expect(page.getByRole('heading', { name: 'Suppliers', exact: true })).toBeVisible()
  if (await page.locator('.supplier-picker').count() === 0) {
    await page.getByRole('button', { name: 'New supplier' }).click()
    await page.locator('form.supplier-create').getByLabel('Legal name').fill(`Mobile supplier ${Date.now()}`)
    await page.getByRole('button', { name: 'Create supplier' }).click()
  }
  await expect(page.locator('.supplier-picker')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Supplier intelligence' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Commercial Terms & Shipping' })).toBeVisible()
  await expect(page.locator('.supplier-commercial-workspace').getByLabel('Supplier')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Documentation' })).toBeVisible()
  await expect(page.locator('.supplier-documentation').getByLabel('Supplier')).toHaveCount(0)
  await expect(page.getByRole('heading',{name:'Reliability'})).toBeVisible()
  await expect(page.getByRole('heading',{name:'History',exact:true})).toBeVisible()
  await expect(page.locator('.supplier-history').getByLabel('Supplier')).toHaveCount(0)

  const workspaceWidth = await page.locator('.suppliers-workspace').evaluate((element) => element.scrollWidth)
  expect(workspaceWidth).toBeLessThanOrEqual(390)

  const supplierButtons = page.locator('.supplier-picker-list > button')
  if (await supplierButtons.count() > 1) {
    await supplierButtons.nth(1).click()
    await expect(supplierButtons.nth(1)).toHaveAttribute('aria-pressed', 'true')
  }

  await page.getByRole('button', { name: 'Edit supplier profile' }).click()
  await expect(page.getByRole('heading', { name: 'Edit supplier profile' })).toBeVisible()
  const editWidth = await page.locator('.supplier-intelligence').evaluate((element) => element.scrollWidth)
  expect(editWidth).toBeLessThanOrEqual(390)
  const commercialWidth = await page.locator('.supplier-commercial-workspace').evaluate((element) => element.scrollWidth)
  expect(commercialWidth).toBeLessThanOrEqual(390)
  const documentationWidth = await page.locator('.supplier-documentation').evaluate((element) => element.scrollWidth)
  expect(documentationWidth).toBeLessThanOrEqual(390)
  const historyWidth = await page.locator('.supplier-history-reliability').evaluate((element) => element.scrollWidth)
  expect(historyWidth).toBeLessThanOrEqual(390)
})
