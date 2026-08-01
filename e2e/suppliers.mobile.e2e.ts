import { expect, test } from '@playwright/test'
import { signIn } from './ingredientKnowledge.helpers'

test('Suppliers list and selected profile remain usable at 390px', async ({ page }) => {
  await signIn(page)
  await page.goto('/suppliers')

  await expect(page.getByRole('heading', { name: 'Suppliers', exact: true })).toBeVisible()
  const supplierName = `Mobile printing supplier ${Date.now()}`
  await page.getByRole('button', { name: 'New supplier' }).click()
  const createForm = page.locator('form.supplier-create')
  await expect(createForm).toBeVisible()
  expect(await createForm.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
  const legalName = createForm.getByLabel('Legal name')
  await expect(legalName).toBeFocused()
  await legalName.fill(supplierName)
  await page.keyboard.press('Tab')
  await expect(createForm.getByLabel('Trading name')).toBeFocused()
  await createForm.getByLabel('Supplier type').selectOption('printing')
  await createForm.getByLabel('Website').fill('https://www.avery.no')
  await createForm.getByLabel('Country').fill('NO')
  await createForm.getByLabel('Default currency').fill('NOK')
  await expect(createForm.getByRole('heading', { name: 'Review before creating' })).toBeVisible()
  await createForm.getByRole('button', { name: 'Create supplier' }).click()

  const receipt = page.getByTestId('operation-receipt')
  await expect(receipt.getByText(/CREATE confirmed for supplier/i)).toBeVisible()
  expect(await receipt.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
  const supplierId = await receipt.locator('dd').first().innerText()
  expect(new URL(page.url()).searchParams.get('supplier')).toBe(supplierId)
  await page.reload()
  await expect(page.getByRole('button', { name: new RegExp(supplierName) })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.supplier-intelligence').getByText(/NO · printing · NOK/)).toBeVisible()

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
