import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../../platform/supabase/generated/database.types'
import { createLogFromSession, createStarterWorkspace, progressTrimSession, startTrim } from '../domain/beardStudio'
import { SupabaseBeardStudioRepository } from './beardStudioRepository'

const url=import.meta.env.VITE_SUPABASE_TEST_URL as string|undefined
const serviceKey=import.meta.env.VITE_SUPABASE_TEST_SERVICE_ROLE_KEY as string|undefined
const anonKey=import.meta.env.VITE_SUPABASE_TEST_ANON_KEY as string|undefined
const run=url&&serviceKey&&anonKey?describe:describe.skip

run('Beard Studio against local Supabase',()=>{
  const userIds:string[]=[]
  let admin:ReturnType<typeof createClient<Database>>
  const owner=async(label:string)=>{
    const email=`beard-studio-${label}-${crypto.randomUUID()}@example.test`,password=`Local-${crypto.randomUUID()}-9a!`
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true})
    if(created.error)throw created.error
    userIds.push(created.data.user.id)
    const client=createClient<Database>(url!,anonKey!,{auth:{persistSession:false}})
    const signedIn=await client.auth.signInWithPassword({email,password})
    if(signedIn.error)throw signedIn.error
    const workspace=await client.rpc('create_clean_workspace')
    if(workspace.error)throw workspace.error
    return{client,ownerId:created.data.user.id,workspaceId:String(workspace.data)}
  }
  beforeAll(()=>{admin=createClient<Database>(url!,serviceKey!,{auth:{persistSession:false}})})
  afterAll(async()=>{for(const id of userIds)await admin.auth.admin.deleteUser(id)})

  it('persists the complete workflow atomically and isolates immutable Product snapshots',async()=>{
    const first=await owner('owner'),second=await owner('other')
    const productId=`product-${crypto.randomUUID()}`,timestamp=new Date().toISOString()
    const inserted=await first.client.from('products').insert({workspace_id:first.workspaceId,owner_id:first.ownerId,id:productId,name:'Workshop Beard Oil',category:'Beard care',status:'Active',development_stage:'Testing',description:'Owner product',scent_profile:'Forest',target_launch_date:'',created_at:timestamp,updated_at:timestamp})
    expect(inserted.error).toBeNull()
    let state=createStarterWorkspace()
    state.recipes[0].preferredProducts=[{productId,nameSnapshot:'Workshop Beard Oil',categorySnapshot:'Beard care',role:'beard oil'}]
    const repository=new SupabaseBeardStudioRepository(first.workspaceId,first.client)
    await repository.save(state)
    state=await repository.load()
    expect(state).toMatchObject({profiles:[{status:'Active'}],tools:[{primary:true,attachments:expect.any(Array)}],lengthMaps:[{zones:expect.any(Array)}],recipes:[{status:'Active',preferredProducts:[{productId,role:'beard oil'}]}]})
    state=startTrim(state,state.recipes[0].id)
    let session=state.sessions[0]
    session=progressTrimSession(session,state.recipes[0],'next')
    session=progressTrimSession(session,state.recipes[0],'pause')
    state={...state,sessions:[session]}
    await repository.save(state)
    expect((await repository.load()).sessions[0]).toMatchObject({status:'paused',currentStepIndex:1})
    session=progressTrimSession(session,state.recipes[0],'resume')
    while(session.status==='in_progress')session=progressTrimSession(session,state.recipes[0],'next')
    state={...state,sessions:[session]}
    state=createLogFromSession(state,session.id,{overallRating:5,fadeRating:4,lineSharpnessRating:5,symmetryRating:4,comfortRating:5},'Hosted result')
    await repository.save(state)
    const renamed=await first.client.from('products').update({name:'Renamed Beard Oil',status:'Archived',updated_at:new Date().toISOString()}).eq('workspace_id',first.workspaceId).eq('id',productId)
    expect(renamed.error).toBeNull()
    const hydrated=await repository.load()
    expect(hydrated.sessions[0].status).toBe('completed')
    expect(hydrated.logs[0].snapshot.products[0]).toMatchObject({productId,nameSnapshot:'Workshop Beard Oil',categorySnapshot:'Beard care',role:'beard oil'})

    const invalidTool=await first.client.from('grooming_tools').update({tool_type:'invalid' as never}).eq('id',hydrated.tools[0].id)
    expect(invalidTool.error?.code).toBe('23514')
    const invalidZone=await first.client.from('beard_length_map_zones').update({zone_name:'invalid' as never}).eq('id',hydrated.lengthMaps[0].zones[0].id)
    expect(invalidZone.error?.code).toBe('23514')
    const invalidTechnique=await first.client.from('trim_recipe_steps').update({technique:'invalid' as never}).eq('id',hydrated.recipes[0].steps[0].id)
    expect(invalidTechnique.error?.code).toBe('23514')
    const recipeLink=await first.client.from('trim_recipe_product_links').select('id').eq('recipe_id',hydrated.recipes[0].id).single()
    expect(recipeLink.error).toBeNull()
    const invalidRecipeRole=await first.client.from('trim_recipe_product_links').update({usage_role:'invalid' as never}).eq('id',recipeLink.data!.id)
    expect(invalidRecipeRole.error?.code).toBe('23514')
    const invalidLogRole=await first.client.from('beard_log_product_links').insert({
      id:crypto.randomUUID(),
      workspace_id:first.workspaceId,
      owner_id:first.ownerId,
      beard_log_entry_id:hydrated.logs[0].id,
      product_id:null,
      product_name_snapshot:'Invalid role probe',
      product_category_snapshot:'',
      usage_role:'invalid' as never,
      display_order:99,
    })
    expect(invalidLogRole.error?.code).toBe('23514')

    expect((await second.client.from('beard_profiles').select('id').eq('workspace_id',first.workspaceId)).data).toEqual([])
    expect((await second.client.from('beard_log_entries').select('id').eq('workspace_id',first.workspaceId)).data).toEqual([])
  })
})
