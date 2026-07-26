import { expect, test } from '@playwright/test'
import { signIn } from './ingredientKnowledge.helpers'

test('Suppliers owns the single supplier selection and profile edit flow', async ({ page }) => {
  await signIn(page)
  await page.goto('/suppliers')

  await expect(page.getByRole('heading', { name: 'Suppliers', exact: true })).toBeVisible()
  await expect(page.getByText(/canonical home for supplier identity/i)).toBeVisible()

  const supplierName = `Shell supplier ${Date.now()}`
  await page.getByRole('button', { name: 'New supplier' }).click()
  const createForm = page.locator('form.supplier-create')
  await createForm.getByLabel('Legal name').fill(supplierName)
  await createForm.getByLabel('Type').selectOption('raw_material')
  await createForm.getByRole('button', { name: 'Create supplier' }).click()

  await expect(page.getByRole('button', { name: new RegExp(supplierName) })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('heading', { name: 'Supplier intelligence' })).toBeVisible()
  await expect(page.locator('.supplier-intelligence').getByText(supplierName, { exact: true })).toBeVisible()
  await expect(page.locator('.supplier-intelligence').getByText('Country unknown', { exact: false })).toBeVisible()
  await expect(page.locator('.supplier-intelligence').getByText('Unknown', { exact: true }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Edit supplier profile' }).click()
  await expect(page.getByRole('heading', { name: 'Edit supplier profile' })).toBeVisible()
  await expect(page.locator('.supplier-intelligence').getByText(supplierName, { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('.supplier-intelligence').getByText(supplierName, { exact: true })).toBeVisible()

  await page.goto('/procurement')
  await expect(page.getByRole('heading', { name: 'Procurement' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Supplier intelligence' })).toHaveCount(0)
  await expect(page.locator('.purchasing-intelligence')).toBeVisible()
})
