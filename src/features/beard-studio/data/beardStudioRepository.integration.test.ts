import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../../platform/supabase/generated/database.types'
import { createLogFromSession, createStarterWorkspace, progressTrimSession, startTrim } from '../domain/beardStudio'
import { SupabaseBeardStudioGateway } from './beardStudioRepository'

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
    const repository=new SupabaseBeardStudioGateway(first.workspaceId,first.client)
    await repository.save(state)
    state=await repository.load()
    expect(state).toMatchObject({profiles:[{status:'Active'}],tools:[{primary:true,attachments:expect.any(Array)}],lengthMaps:[{zones:expect.any(Array)}],recipes:[{status:'Active',preferredProducts:[{productId,role:'beard oil'}]}]})
    state=startTrim(state,state.recipes[0].id)
    let session=state.sessions[0]
    session=progressTrimSession(session,state.recipes[0],'next')
    session=progressTrimSession(session,state.recipes[0],'pause')
    state={...state,sessions:[session]}
    await repository.save(state)
    state=await repository.load()
    expect(state.sessions[0]).toMatchObject({status:'paused',currentStepIndex:1})
    session=state.sessions[0]
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

    const secondProductId=`product-${crypto.randomUUID()}`
    expect((await second.client.from('products').insert({workspace_id:second.workspaceId,owner_id:second.ownerId,id:secondProductId,name:'Other workspace product',category:'Beard care',status:'Active',development_stage:'Testing',description:'Constraint probe',scent_profile:'Unknown',target_launch_date:null,created_at:timestamp,updated_at:timestamp})).error).toBeNull()
    let secondState=createStarterWorkspace()
    secondState=startTrim(secondState,secondState.recipes[0].id)
    const secondGateway=new SupabaseBeardStudioGateway(second.workspaceId,second.client)
    await secondGateway.save(secondState)
    secondState=await secondGateway.load()
    const crossAttachment=await first.client.from('beard_length_map_zones').update({attachment_id:secondState.tools[0].attachments[0].id}).eq('workspace_id',first.workspaceId).eq('id',hydrated.lengthMaps[0].zones[0].id)
    expect(crossAttachment.error?.code).toBe('23503')
    const crossRecipeProduct=await first.client.from('trim_recipe_product_links').insert({id:crypto.randomUUID(),workspace_id:first.workspaceId,owner_id:first.ownerId,recipe_id:hydrated.recipes[0].id,product_id:secondProductId,product_name_snapshot:'Other',product_category_snapshot:'Beard care',usage_role:'beard oil',display_order:99})
    expect(crossRecipeProduct.error?.code).toBe('23503')
    const crossLogProduct=await first.client.from('beard_log_product_links').insert({id:crypto.randomUUID(),workspace_id:first.workspaceId,owner_id:first.ownerId,beard_log_entry_id:hydrated.logs[0].id,product_id:secondProductId,product_name_snapshot:'Other',product_category_snapshot:'Beard care',usage_role:'beard oil',display_order:99})
    expect(crossLogProduct.error?.code).toBe('23503')
    const sourceLog=(await first.client.from('beard_log_entries').select('*').eq('id',hydrated.logs[0].id).single()).data!
    const crossSessionLog=await first.client.from('beard_log_entries').insert({...sourceLog,id:crypto.randomUUID(),session_id:secondState.sessions[0].id})
    expect(crossSessionLog.error?.code).toBe('23503')
    const nullOptional=await first.client.from('beard_length_map_zones').update({attachment_id:null}).eq('workspace_id',first.workspaceId).eq('id',hydrated.lengthMaps[0].zones[0].id)
    expect(nullOptional.error).toBeNull()
    const fresh=await repository.load(),stale=structuredClone(fresh)
    fresh.profiles[0].description='Fresh context'
    await repository.save(fresh)
    stale.profiles[0].description='Stale overwrite'
    await expect(repository.save(stale)).rejects.toThrow('changed in another session')

    expect((await second.client.from('beard_profiles').select('id').eq('workspace_id',first.workspaceId)).data).toEqual([])
    expect((await second.client.from('beard_log_entries').select('id').eq('workspace_id',first.workspaceId)).data).toEqual([])
  })

  it('atomically finishes and reopens v2 analysis snapshots with owner isolation and idempotency',async()=>{
    const first=await owner('v2-owner'),second=await owner('v2-other')
    const repository=new SupabaseBeardStudioGateway(first.workspaceId,first.client),state=createStarterWorkspace()
    await repository.save(state)
    const analysisId=crypto.randomUUID(),supportId=crypto.randomUUID(),createdAt='2026-07-27T09:00:00.000Z'
    const target={value:'structured_full_beard',label:'Structured full beard'}
    const inserted=await admin.from('intelligence_analyses').insert({
      id:analysisId,workspace_id:first.workspaceId,owner_user_id:first.ownerId,source_module:'beard-studio',analysis_type:'beard_photo_analysis',
      schema_version:2,contract_version:'beard-photo-result-contract-v2',prompt_version:'beard-photo-analysis-v6',semantic_rule_version:'beard-semantic-safety-v4',
      status:'completed',idempotency_key:crypto.randomUUID(),profile_id:state.profiles[0].id,context_manifest:{},correlation_id:supportId,
      result_payload:{photoQuality:{overall:'suitable'}},provider_name:'openai',model_name:'gpt-5',completed_at:createdAt,created_at:createdAt,
      target_style:target,analysis_version:'beard-intelligence-v2',
    } as never)
    expect(inserted.error).toBeNull()
    const decisions=['accepted_for_planning','dismissed','undecided'] as const
    const recommendationIds=decisions.map(()=>crypto.randomUUID())
    expect((await admin.from('intelligence_recommendations').insert(decisions.map((review_status,index)=>({
      id:recommendationIds[index],workspace_id:first.workspaceId,owner_user_id:first.ownerId,analysis_id:analysisId,title:`Recommendation ${index}`,
      reason:'Persisted reason',confidence:.8,priority:'medium',expected_benefit:'Persisted benefit',supporting_observation_ids:[],
      affected_zones:['sides'],tool_constraints:[],proposed_guard_strategy:null,review_status,provenance:'ai',
    })))).error).toBeNull()
    const summary={version:2,targetStyle:target,overallAssessment:'Persisted assessment',strengths:['Persisted strength'],highestImpactImprovements:[{recommendationId:recommendationIds[0],title:'Recommendation 0'}],sequence:['Recommendation 0'],estimatedTrimMinutes:20,difficulty:'Easy',confidence:'High',photoQualityCaveat:'Persisted caveat'}
    const plan={version:2,intelligenceVersion:'beard-intelligence-v2',targetStyle:target,generatedAt:createdAt,sourceFingerprint:'stable',steps:[{id:'step-one',order:1,title:'Shape the sides',region:'sides',tool:'Philips Beard Trimmer 7000 / BT7665/15',attachmentOrComb:'Integrated adjustable comb',guardSetting:'7 mm',technique:'Set the adjustable comb to 7 mm.',fallbackWording:null,direction:'with growth first',caution:'Inspect first.',expectedResult:'Cleaner sides.',recommendationIds:[recommendationIds[0]]}]}
    const rpc=first.client.rpc.bind(first.client) as unknown as (name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:{message:string}|null}>
    const finishArgs={candidate_workspace_id:first.workspaceId,candidate_analysis_id:analysisId,candidate_decisions:recommendationIds.map((recommendationId,index)=>({recommendationId,status:decisions[index]})),candidate_summary_snapshot:summary,candidate_trim_plan_snapshot:plan}
    expect((await rpc('finish_beard_analysis_review',finishArgs)).error).toBeNull()
    const firstRow=(await first.client.from('intelligence_analyses').select('summary_snapshot,trim_plan_snapshot,review_finished_at,created_at').eq('id',analysisId).single()).data as unknown as {summary_snapshot:unknown;trim_plan_snapshot:unknown;review_finished_at:string;created_at:string}
    expect((await rpc('finish_beard_analysis_review',finishArgs)).error).toBeNull()
    const secondRow=(await first.client.from('intelligence_analyses').select('summary_snapshot,trim_plan_snapshot,review_finished_at,created_at').eq('id',analysisId).single()).data as unknown as typeof firstRow
    expect(secondRow).toEqual(firstRow)
    const reopened=await rpc('reopen_beard_analysis',{candidate_workspace_id:first.workspaceId,candidate_analysis_id:analysisId})
    expect(reopened.error).toBeNull()
    expect(reopened.data).toMatchObject({analysisId,supportId,targetStyle:target,summarySnapshot:summary,trimPlanSnapshot:plan})
    for(let index=0;index<10;index++)expect((await rpc('reopen_beard_analysis',{candidate_workspace_id:first.workspaceId,candidate_analysis_id:analysisId})).data).toEqual(reopened.data)
    const changedDecisions=finishArgs.candidate_decisions.map(decision=>decision.recommendationId===recommendationIds[0]?{...decision,status:'dismissed'}:decision)
    const changedPlan={...plan,sourceFingerprint:'changed',steps:[]}
    expect((await rpc('finish_beard_analysis_review',{...finishArgs,candidate_decisions:changedDecisions,candidate_trim_plan_snapshot:changedPlan})).error).toBeNull()
    const changed=(await rpc('reopen_beard_analysis',{candidate_workspace_id:first.workspaceId,candidate_analysis_id:analysisId})).data
    expect(changed).toMatchObject({analysisId,supportId,trimPlanSnapshot:changedPlan,reviewFinishedAt:firstRow.review_finished_at,decisions:expect.arrayContaining([{recommendationId:recommendationIds[0],status:'dismissed'}])})
    const otherRpc=second.client.rpc.bind(second.client) as unknown as typeof rpc
    expect((await otherRpc('reopen_beard_analysis',{candidate_workspace_id:first.workspaceId,candidate_analysis_id:analysisId})).data).toBeNull()
    expect((await otherRpc('list_beard_analysis_history',{candidate_workspace_id:first.workspaceId,candidate_limit:20,candidate_before:null,candidate_before_id:null})).data).toEqual([])
  })
})
