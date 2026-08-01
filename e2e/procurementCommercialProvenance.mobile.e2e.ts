import{expect,test}from'@playwright/test'
import{signIn}from'./ingredientKnowledge.helpers'
import{seedCommercialProvenanceFixture}from'./procurementCommercialProvenance.helpers'

test('linked Offer receipt and source identity remain usable at 390px',async({page})=>{
 const fixture=await seedCommercialProvenanceFixture('Mobile')
 await signIn(page)
 await page.goto(`/procurement/${fixture.requestId}`)
 await page.getByRole('button',{name:'Add offer'}).click()
 const supplier=page.getByRole('combobox',{name:'Supplier',exact:true}),source=page.getByRole('combobox',{name:/^Supplier Product source, optional/})
 await supplier.selectOption(fixture.supplierId)
 await source.selectOption(`raw_material:${fixture.sourceId}`)
 await expect(page.getByRole('region',{name:'Selected Supplier Product identity'})).toContainText(fixture.sourceId)
 await source.focus()
 await expect(source).toBeFocused()
 await page.keyboard.press('Tab')
 await expect(page.getByLabel('Product title')).toBeFocused()
 await page.getByRole('button',{name:'Confirm and save Offer'}).click()

 await expect(page.getByTestId('operation-receipt').filter({hasText:'procurement supplier offer'})).toContainText(fixture.sourceId)
 await expect(page.getByTestId('offer-source-identity').filter({hasText:fixture.sourceId})).toContainText(fixture.productName)
 await page.reload()
 await expect(page.getByTestId('offer-source-identity').filter({hasText:fixture.sourceId})).toBeVisible()

 const detailWidth=await page.locator('.procurement-request-detail').evaluate(element=>element.scrollWidth)
 expect(detailWidth).toBeLessThanOrEqual(390)
})
