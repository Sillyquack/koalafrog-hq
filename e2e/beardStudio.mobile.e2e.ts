import{expect,test}from'@playwright/test'
import{signIn}from'./ingredientKnowledge.helpers'

test('Beard Studio remains usable without horizontal overflow at 390px',async({page})=>{
 await signIn(page)
 await page.goto('/product-studio')
 await page.getByRole('link',{name:/Open Beard Studio/}).click()
 await page.getByRole('button',{name:'Create editable starter setup'}).click()
 await page.getByRole('link',{name:'Profile',exact:true}).click()
 await page.getByRole('button',{name:'Edit'}).click()
 await page.getByLabel('Target look').fill('Mobile persisted target')
 await page.getByRole('button',{name:'Save profile'}).click()
 await expect(page.getByRole('button',{name:'Save profile'})).toBeHidden()
 await page.reload()
 await page.getByRole('button',{name:'Edit'}).click()
 await expect(page.getByLabel('Target look')).toHaveValue('Mobile persisted target')
 const width=await page.locator('.beard-studio').evaluate(element=>element.scrollWidth)
 expect(width).toBeLessThanOrEqual(390)
})
