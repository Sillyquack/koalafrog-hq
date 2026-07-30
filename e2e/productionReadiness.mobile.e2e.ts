import{expect,test}from'@playwright/test'
import{signIn}from'./ingredientKnowledge.helpers'

test('production readiness round list and mandatory scope remain usable at 390 px',async({page})=>{
 await signIn(page)
 await page.goto('/procurement/production-readiness')
 await expect(page.getByRole('heading',{name:'Production readiness rounds'})).toBeVisible()
 await page.getByRole('button',{name:'New round'}).click()
 await expect(page.locator('.readiness-product')).toHaveCount(4)
 await expect(page.getByText('Deodorant · mandatory')).toBeVisible()
 await expect(page.getByRole('button',{name:'Save and regenerate'})).toBeVisible()
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth)
 expect(overflow).toBe(false)
})
