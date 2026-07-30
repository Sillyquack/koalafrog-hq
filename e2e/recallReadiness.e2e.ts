import{expect,test}from'@playwright/test'
import{completeCoreRecallReadinessFlow}from'./recallReadiness.helpers'

test('owner creates, reconstructs, and safely blocks an incomplete Recall Readiness assessment',async({page})=>{
 await completeCoreRecallReadinessFlow(page)
 await expect(page.getByText(/creates no recall, block, shipment, notification, return, or destruction/i)).toBeVisible()
})
