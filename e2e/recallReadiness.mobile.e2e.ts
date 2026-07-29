import{expect,test}from'@playwright/test'
import{completeCoreRecallReadinessFlow}from'./recallReadiness.helpers'

test('Recall Readiness core flow remains usable at 390 by 844',async({page})=>{
 await completeCoreRecallReadinessFlow(page)
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth)
 expect(overflow).toBe(false)
 await expect(page.getByRole('region',{name:'Distribution limitation'}).getByText('Customer and distribution tracing are not implemented in the current platform.')).toBeVisible()
})
