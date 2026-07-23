import{expect,test}from'@playwright/test'
import{signIn}from'./ingredientKnowledge.helpers'

test('Procurement dashboard remains usable at 390px',async({page})=>{
 await signIn(page)
 await page.goto('/procurement')
 await expect(page.getByRole('heading',{name:'Procurement'})).toBeVisible()
 await expect(page.getByRole('button',{name:'New request'})).toBeVisible()
 await expect(page.getByRole('button',{name:'Export JSON'})).toBeVisible()
 await expect(page.locator('.procurement-workspace')).toBeVisible()
 const width=await page.locator('.procurement-workspace').evaluate(element=>element.scrollWidth)
 expect(width).toBeLessThanOrEqual(390)
})
