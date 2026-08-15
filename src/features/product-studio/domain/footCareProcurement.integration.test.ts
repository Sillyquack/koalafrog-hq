import{createClient}from'@supabase/supabase-js'
import{afterAll,beforeAll,describe,expect,it}from'vitest'
import{FOOT_CARE_REGISTRY_VERSION,footCareProjectTemplates}from'./footCareBenchmarks'
import{buildFootCareProcurementGroups}from'./footCareProcurement'
import{createFootCareConceptInput}from'./footCareProjects'

const url=import.meta.env.VITE_SUPABASE_TEST_URL as string|undefined
const serviceKey=import.meta.env.VITE_SUPABASE_TEST_SERVICE_ROLE_KEY as string|undefined
const anonKey=import.meta.env.VITE_SUPABASE_TEST_ANON_KEY as string|undefined
const run=url&&serviceKey&&anonKey?describe:describe.skip

run('Foot Care Procurement handoff against local Supabase',()=>{
  const createdUsers:string[]=[]
  let admin:ReturnType<typeof createClient>

  beforeAll(()=>{admin=createClient(url!,serviceKey!,{auth:{persistSession:false}})})
  afterAll(async()=>{for(const id of createdUsers)await admin.auth.admin.deleteUser(id)})

  async function owner(label:string){
    const email=`foot-care-${label}-${crypto.randomUUID()}@example.test`,password=`Local-${crypto.randomUUID()}-9a!`
    const created=await admin.auth.admin.createUser({email,password,email_confirm:true})
    if(created.error)throw created.error
    createdUsers.push(created.data.user.id)
    const client=createClient(url!,anonKey!,{auth:{persistSession:false}})
    const signedIn=await client.auth.signInWithPassword({email,password})
    if(signedIn.error)throw signedIn.error
    const workspace=await client.rpc('create_clean_workspace')
    if(workspace.error)throw workspace.error
    return{client,ownerId:created.data.user.id,workspaceId:String(workspace.data)}
  }

  it('creates requests/items once, repairs by reuse, preserves provenance and produces no downstream side effects',async()=>{
    const primary=await owner('primary'),other=await owner('other'),conceptId=`foot-care-${crypto.randomUUID()}`,concept=createFootCareConceptInput('daily_dry_foot_care')
    const inserted=await primary.client.from('product_studio_concepts').insert({id:conceptId,workspace_id:primary.workspaceId,owner_id:primary.ownerId,name:concept.name,product_type:concept.productType,intent_mode:concept.intentMode,desired_properties:concept.desiredProperties,selected_ingredients:concept.selectedIngredients,scent_directions:concept.scentDirections,candidate_substitutes:concept.candidateSubstitutes,notes:concept.notes,analysis:concept.analysis})
    expect(inserted.error).toBeNull()
    const groups=buildFootCareProcurementGroups('daily_dry_foot_care'),args={candidate_workspace_id:primary.workspaceId,candidate_concept_id:conceptId,candidate_registry_version:FOOT_CARE_REGISTRY_VERSION,candidate_groups:groups}
    const first=await primary.client.rpc('create_foot_care_procurement_handoff',args)
    expect(first.error).toBeNull()
    expect(first.data).toMatchObject({schemaVersion:1,conceptId,researchStarted:false,candidateAccepted:false,orderCreated:false,groups:[{operation:'created',createdItemCount:groups[0].targets.length}]})
    const repeated=await primary.client.rpc('create_foot_care_procurement_handoff',args)
    expect(repeated.error).toBeNull()
    expect(repeated.data).toMatchObject({groups:[{requestId:first.data.groups[0].requestId,operation:'reused',createdItemCount:0,itemIds:first.data.groups[0].itemIds}]})
    const requests=await primary.client.from('procurement_requests').select('id,source_type,source_id,source_group,source_registry_version').eq('source_id',conceptId)
    expect(requests.data).toHaveLength(groups.length)
    expect(requests.data?.[0]).toMatchObject({source_type:'product_studio_concept',source_id:conceptId,source_registry_version:FOOT_CARE_REGISTRY_VERSION})
    const items=await primary.client.from('procurement_requested_items').select('source_target_id,source_benchmark_ids,source_benchmark_ingredient_incis,source_functions,preferred_supplier_hint').eq('procurement_request_id',first.data.groups[0].requestId)
    expect(items.data).toHaveLength(groups[0].targets.length)
    expect(items.data).toContainEqual(expect.objectContaining({source_target_id:'aloe-vera-powder',source_benchmark_ids:['gehwol-fusskraft-blue-no-2026-08'],source_benchmark_ingredient_incis:['Aloe Barbadensis Leaf Juice Powder'],source_functions:['skin conditioning'],preferred_supplier_hint:'Mystic Moments'}))
    for(const table of ['procurement_research_jobs','procurement_offer_candidates','procurement_supplier_offers','purchase_orders']){
      expect((await primary.client.from(table).select('*',{count:'exact',head:true})).count,table).toBe(0)
    }
    const crossOwner=await other.client.rpc('create_foot_care_procurement_handoff',{...args,candidate_workspace_id:primary.workspaceId})
    expect(crossOwner.error?.message).toContain('FOOT_CARE_CONCEPT_UNAVAILABLE')
  })

  it('rejects oversized groups and blocked ordinary sourcing targets atomically',async()=>{
    const{client,ownerId,workspaceId}=await owner('guards'),conceptId=`foot-care-${crypto.randomUUID()}`,concept=createFootCareConceptInput('foot_shoe_deodorizer')
    expect((await client.from('product_studio_concepts').insert({id:conceptId,workspace_id:workspaceId,owner_id:ownerId,name:concept.name,product_type:concept.productType,intent_mode:concept.intentMode,desired_properties:concept.desiredProperties,selected_ingredients:concept.selectedIngredients,scent_directions:concept.scentDirections,candidate_substitutes:concept.candidateSubstitutes,notes:concept.notes,analysis:concept.analysis})).error).toBeNull()
    const allTargets=footCareProjectTemplates.flatMap(project=>buildFootCareProcurementGroups(project.kind).flatMap(group=>group.targets))
    const base={candidate_workspace_id:workspaceId,candidate_concept_id:conceptId,candidate_registry_version:FOOT_CARE_REGISTRY_VERSION}
    expect((await client.rpc('create_foot_care_procurement_handoff',{...base,candidate_groups:[{id:'oversized',label:'Oversized',targets:allTargets.slice(0,11)}]})).error?.message).toContain('FOOT_CARE_HANDOFF_GROUP_INVALID')
    const blocked={...allTargets[0],id:'octenidine-hcl',name:'Octenidine HCl'}
    expect((await client.rpc('create_foot_care_procurement_handoff',{...base,candidate_groups:[{id:'blocked',label:'Blocked',targets:[blocked]}]})).error?.message).toContain('FOOT_CARE_HANDOFF_TARGET_BLOCKED_OR_INVALID')
    expect((await client.from('procurement_requests').select('*',{count:'exact',head:true}).eq('source_id',conceptId)).count).toBe(0)
  })
})
