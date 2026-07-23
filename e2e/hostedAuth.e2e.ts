import{expect,test}from'@playwright/test'
import{signIn}from'./ingredientKnowledge.helpers'

test('hosted workspace requires and restores a real Supabase Auth session',async({page})=>{
 await page.goto('/procurement')
 await expect(page.getByText('Private owner access')).toBeVisible()
 await expect(page.getByText('Owner workspace')).toHaveCount(0)
 await expect(page.getByRole('button',{name:'Start research'})).toHaveCount(0)

 await signIn(page)
 await page.goto('/procurement')
 await expect(page.getByRole('heading',{name:'Procurement'})).toBeVisible()
 await expect(page.getByText('Owner workspace')).toBeVisible()

 await page.reload()
 await expect(page.getByRole('heading',{name:'Procurement'})).toBeVisible()
 await expect(page.getByText('Owner workspace')).toBeVisible()

 await page.getByLabel(/owner account menu/).click()
 await page.getByRole('button',{name:'Secure logout'}).click()
 await expect(page.getByText('Private owner access')).toBeVisible()
 await expect(page.getByText('Owner workspace')).toHaveCount(0)
})
