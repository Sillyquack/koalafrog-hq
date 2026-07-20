import{expect,test}from'@playwright/test'
import{signIn}from'./ingredientKnowledge.helpers'

test('Product Studio opens canonical Beard Studio and persists with dirty navigation protection',async({page})=>{
 await signIn(page)
 await page.goto('/product-studio')
 await page.getByRole('link',{name:/Open Beard Studio/}).click()
 await expect(page).toHaveURL(/grooming\/beard-studio/)
 await page.getByRole('button',{name:'Create editable starter setup'}).click()
 await expect(page.getByRole('heading',{name:'Bobby Beard Profile'})).toBeVisible()
 await page.getByRole('link',{name:'Profile',exact:true}).click()
 await page.getByRole('button',{name:'Edit'}).click()
 await page.getByLabel('Target look').fill('Canonical persisted target')
 await page.getByRole('link',{name:'Product Studio',exact:true}).click()
 await expect(page.getByRole('dialog')).toContainText('Unsaved Beard Studio work')
 await page.getByRole('button',{name:/Stay and continue/}).click()
 await page.getByRole('button',{name:'Save profile'}).click()
 await expect(page.getByRole('button',{name:'Save profile'})).toBeHidden()
 await page.reload()
 await page.getByRole('button',{name:'Edit'}).click()
 await expect(page.getByLabel('Target look')).toHaveValue('Canonical persisted target')
 expect(await page.evaluate(()=>localStorage.getItem('koalafrog-hq:beard-studio:v1'))).toBeNull()
})
