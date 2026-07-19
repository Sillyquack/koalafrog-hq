import{expect,type Page}from'@playwright/test'
import{readFileSync}from'node:fs'
import{runtimePath}from'./globalSetup'

export type Owner={userId:string;email:string;password:string;url:string;publishableKey:string;runId:string}
export const owner=()=>JSON.parse(readFileSync(runtimePath,'utf8'))as Owner

export async function signIn(page:Page){
 const credentials=owner()
 await page.goto('/')
 await page.getByLabel('Email').fill(credentials.email)
 await page.getByLabel('Password').fill(credentials.password)
 await page.getByRole('button',{name:'Sign in'}).click()
 await expect(page.getByRole('region',{name:'Quick actions'})).toBeVisible({timeout:15_000})
}
export async function createIngredient(page:Page,name:string,inci='CERA ALBA'){
 await page.goto('/ingredients')
 await page.getByRole('button',{name:'Add ingredient'}).click()
 await page.getByLabel('Common name').fill(name)
 await page.getByLabel('Exact INCI name').fill(inci)
 await page.getByRole('textbox',{name:'Category',exact:true}).fill('E2E material')
 await page.getByRole('button',{name:'Save ingredient'}).click()
 const link=page.getByRole('link',{name:new RegExp(name)})
 await expect(link).toBeVisible()
 const href=await link.getAttribute('href')
 if(!href)throw new Error('Created Ingredient link has no destination.')
 return href.split('/').at(-1)!
}
export async function openKnowledge(page:Page,id:string){
 await page.goto(`/ingredients/${id}`)
 await page.getByRole('link',{name:'Open workspace'}).click()
 await expect(page.getByText('No unsaved changes.')).toBeVisible()
}
export async function addEvidence(page:Page,title:string){
 await page.getByRole('button',{name:'Evidence'}).click()
 await page.getByRole('button',{name:'Add evidence'}).click()
 await page.locator('#evidence-0-source').selectOption('supplier_document')
 await page.locator('#evidence-0-title').fill(title)
 await page.locator('#evidence-0-author').fill('E2E Supplier Laboratory')
 await page.locator('#evidence-0-date').fill('2026-07-19')
 await page.locator('#evidence-0-confidence').selectOption('supported')
 await page.locator('#evidence-0-notes').fill('Deterministic browser evidence note.')
}
export async function addRole(page:Page,evidenceTitle:string){
 await page.getByRole('button',{name:'Functions'}).click()
 await page.getByRole('button',{name:'Add role'}).click()
 await page.locator('#role-0-role').selectOption('structuring_wax')
 await page.locator('#role-0-level').selectOption('primary')
 await page.locator('#role-0-context').fill('Anhydrous solid stick')
 await page.locator('#role-0-confidence').selectOption('supported')
 await page.locator('#role-0-notes').fill('E2E functional context.')
 await page.getByLabel(new RegExp(evidenceTitle)).check()
}
export async function addCompatibility(page:Page,targetId:string,evidenceTitle:string){
 await page.getByRole('button',{name:'Compatibility'}).click()
 await page.getByRole('button',{name:'Add relationship'}).click()
 await page.locator('#compatibility-0-target').selectOption(targetId)
 await page.locator('#compatibility-0-context').fill('E2E directional wax blend')
 await page.locator('#compatibility-0-rating').selectOption('good')
 await page.locator('#compatibility-0-confidence').selectOption('observed')
 await page.locator('#compatibility-0-notes').fill('E2E compatibility note.')
 await page.getByLabel(new RegExp(evidenceTitle)).check()
}
