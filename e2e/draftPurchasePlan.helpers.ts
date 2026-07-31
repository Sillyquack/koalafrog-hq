import { expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { owner } from './ingredientKnowledge.helpers'

export async function ownerClient(){
  const credentials=owner()
  const client=createClient(credentials.url,credentials.publishableKey,{auth:{persistSession:false}})
  const signedIn=await client.auth.signInWithPassword({email:credentials.email,password:credentials.password})
  expect(signedIn.error).toBeNull()
  const workspace=await client.from('workspaces').select('id').eq('owner_id',credentials.userId).eq('lifecycle_state','active').single()
  expect(workspace.error).toBeNull()
  return{client,workspaceId:workspace.data!.id,ownerId:credentials.userId}
}

export async function createLocalSupplier(label:string){
  const context=await ownerClient()
  const supplier=await context.client.from('suppliers').insert({
    workspace_id:context.workspaceId,
    owner_id:context.ownerId,
    legal_name:label,
    trading_name:label,
    supplier_type:'general',
    status:'active',
    default_currency:'NOK',
    internal_notes:'Local browser rehearsal only',
  }).select('id').single()
  expect(supplier.error).toBeNull()
  return{...context,supplierId:supplier.data!.id}
}

export async function fillMinimumDraftPlan(page:Page,supplierId:string,title:string){
  await page.getByLabel('Plan name').fill(title)
  await page.getByLabel('Purpose').fill('Browser proof of an internal unplaced Draft snapshot.')
  await page.getByLabel('Target ceiling').fill('3500')
  await page.getByLabel('Absolute stop').fill('4000')
  const basket=page.getByRole('group',{name:'Supplier basket 1'})
  await basket.getByLabel('Workspace Supplier').selectOption(supplierId)
  const line=basket.getByRole('group',{name:'Commercial line snapshot'})
  await line.getByLabel('Source kind').selectOption('manual')
  await line.getByLabel('Source domain').selectOption('equipment')
  await line.getByLabel('Exact product title').fill('Exact local browser fixture')
  await line.getByLabel('SKU').fill('LOCAL-E2E-1')
  await line.getByLabel('Package quantity').fill('1')
  await line.getByLabel('Package unit').fill('pcs')
  await line.getByLabel('Purchase quantity').fill('2')
}
