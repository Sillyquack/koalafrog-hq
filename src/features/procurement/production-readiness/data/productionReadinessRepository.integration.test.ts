import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const url=import.meta.env.VITE_SUPABASE_TEST_URL as string|undefined
const serviceKey=import.meta.env.VITE_SUPABASE_TEST_SERVICE_ROLE_KEY as string|undefined
const anonKey=import.meta.env.VITE_SUPABASE_TEST_ANON_KEY as string|undefined
const run=url&&serviceKey&&anonKey?describe:describe.skip

run('durable Production Procurement Readiness against local Supabase',()=>{
  let admin:SupabaseClient
  const users:string[]=[]
  beforeAll(()=>{admin=createClient(url!,serviceKey!,{auth:{persistSession:false}})})
  afterAll(async()=>{for(const id of users)await admin.auth.admin.deleteUser(id)})
  const owner=async(label:string)=>{const email=`production-readiness-${label}-${crypto.randomUUID()}@example.test`,password=`Local-${crypto.randomUUID()}-9a!`,created=await admin.auth.admin.createUser({email,password,email_confirm:true});if(created.error)throw created.error;users.push(created.data.user.id);const client=createClient(url!,anonKey!,{auth:{persistSession:false}}) as SupabaseClient;const signIn=await client.auth.signInWithPassword({email,password});if(signIn.error)throw signIn.error;const workspace=await client.rpc('create_clean_workspace');if(workspace.error)throw workspace.error;return{client,ownerId:created.data.user.id,workspaceId:workspace.data as string}}

  it('persists four exact formula bases, deterministically regenerates gaps, rejects stale/cross-owner writes, and never mutates operational records',async()=>{
    const a=await owner('owner-a'),b=await owner('owner-b'),now='2026-07-27T12:00:00.000Z',owned={workspace_id:a.workspaceId,owner_id:a.ownerId}
    const categories=['beard_oil','beard_butter','beard_balm','deodorant'] as const
    expect((await a.client.from('ingredients').insert({...owned,id:'shared-oil',common_name:'Shared Oil',inci_name:'SIMMONDSIA CHINENSIS SEED OIL',category:'Oil',functions:['Emollient'],description:'',default_unit:'g',notes:'',status:'Active',created_at:now,updated_at:now})).error).toBeNull()
    for(const category of categories){
      expect((await a.client.from('products').insert({...owned,id:`product-${category}`,name:category==='deodorant'?'Deodorant':category.replace('_',' '),category,status:'Active',development_stage:'Formulation',description:'',scent_profile:'',created_at:now,updated_at:now})).error).toBeNull()
      expect((await a.client.from('formulas').insert({...owned,id:`formula-${category}`,product_id:`product-${category}`,name:`${category} formula`,description:'',created_at:now,updated_at:now})).error).toBeNull()
      expect((await a.client.from('formula_versions').insert({...owned,id:`version-${category}`,formula_id:`formula-${category}`,version:'v1.0',status:'Approved',description:'',target_characteristics:'',phase_definitions:[{code:'A',name:'Main',order:1}],manufacturing_process:[],created_at:now,updated_at:now})).error).toBeNull()
      expect((await a.client.from('formula_lines').insert({...owned,id:`line-${category}`,formula_version_id:`version-${category}`,ingredient_id:'shared-oil',percentage:100,phase:'A',sort_order:1,notes:'',formulation_role:category==='deodorant'?'deodorant_active':'emollient'})).error).toBeNull()
    }
    expect((await a.client.from('inventory_lots').insert({...owned,id:'lot-active',ingredient_id:'shared-oil',internal_lot_number:'ACTIVE',received_date:'2026-07-01',opening_quantity:100,unit:'g',location:'Lab',status:'Active',notes:'',created_at:now,updated_at:now})).error).toBeNull()
    expect((await a.client.from('inventory_lots').insert({...owned,id:'lot-quarantine',ingredient_id:'shared-oil',internal_lot_number:'QUARANTINE',received_date:'2026-07-01',opening_quantity:50,unit:'g',location:'Lab',status:'Quarantined',notes:'',created_at:now,updated_at:now})).error).toBeNull()
    expect((await a.client.from('inventory_movements').insert([{...owned,id:'receipt-active',inventory_lot_id:'lot-active',type:'Receipt',quantity:100,unit:'g',reason:'Test',notes:'',occurred_at:now,created_at:now},{...owned,id:'receipt-quarantine',inventory_lot_id:'lot-quarantine',type:'Receipt',quantity:50,unit:'g',reason:'Test',notes:'',occurred_at:now,created_at:now}])).error).toBeNull()
    const operationalBefore=await Promise.all(['inventory_lots','inventory_movements','purchase_plans','procurement_supplier_offers'].map(table=>a.client.from(table).select('*',{count:'exact',head:true})))
    const created=await a.client.rpc('create_production_procurement_round',{candidate_workspace_id:a.workspaceId,candidate_title:'First production',candidate_notes:'',candidate_base_currency:'NOK',idempotency_key:'11111111-1111-4111-8111-111111111111'})
    expect(created.error).toBeNull()
    const repeated=await a.client.rpc('create_production_procurement_round',{candidate_workspace_id:a.workspaceId,candidate_title:'First production',candidate_notes:'',candidate_base_currency:'NOK',idempotency_key:'11111111-1111-4111-8111-111111111111'})
    expect(repeated.data).toBe(created.data)
    const roundId=created.data as string
    expect((await a.client.from('production_procurement_round_products').select('category').eq('round_id',roundId)).data?.map((row:{category:string})=>row.category).sort()).toEqual([...categories].sort())
    const selections=categories.map(category=>({category,productId:`product-${category}`,formulaVersionId:`version-${category}`,batchCount:1,batchSize:100,batchUnit:'g',overagePercent:5,expectedYield:null,deodorantStructure:category==='deodorant'?'anhydrous':null}))
    const saved=await a.client.rpc('update_production_procurement_round_products',{target_round_id:roundId,expected_revision:1,round_title:'First production',round_notes:'Durable',product_selections:selections})
    expect(saved.error).toBeNull();expect(saved.data).toBe(2)
    expect((await a.client.rpc('update_production_procurement_round_products',{target_round_id:roundId,expected_revision:1,round_title:'Stale',round_notes:'',product_selections:selections})).error?.message).toContain('STALE_ROUND_REVISION')
    expect((await b.client.rpc('regenerate_production_procurement_requirements',{target_round_id:roundId,expected_revision:2})).error?.message).toContain('ROUND_UNAVAILABLE')
    const generated=await a.client.rpc('regenerate_production_procurement_requirements',{target_round_id:roundId,expected_revision:2})
    expect(generated.error).toBeNull();expect(generated.data).toBe(3)
    const requirements=await a.client.from('production_procurement_requirements').select('*').eq('round_id',roundId)
    expect(requirements.data).toHaveLength(1);expect(Number(requirements.data?.[0].total_planned_quantity)).toBe(420)
    const sources=await a.client.from('production_procurement_requirement_sources').select('round_product_id,product_id,formula_version_id,formula_line_id,contribution_quantity').eq('requirement_id',requirements.data?.[0].id)
    expect(sources.data).toHaveLength(4);expect(sources.data?.map((row:{product_id:string})=>row.product_id).sort()).toEqual(categories.map(category=>`product-${category}`).sort())
    const gap=await a.client.from('production_procurement_inventory_gaps').select('*').eq('requirement_id',requirements.data?.[0].id).single()
    expect(gap.data&&{onHand:Number(gap.data.on_hand_quantity),quarantined:Number(gap.data.quarantined_quantity),usable:Number(gap.data.net_usable_quantity),purchasingGap:Number(gap.data.purchasing_gap),incoming:gap.data.incoming_unreceived_quantity}).toEqual({onHand:150,quarantined:50,usable:100,purchasingGap:320,incoming:null})
    const regenerated=await a.client.rpc('regenerate_production_procurement_requirements',{target_round_id:roundId,expected_revision:3})
    expect(regenerated.error).toBeNull();expect((await a.client.from('production_procurement_requirements').select('id').eq('round_id',roundId)).data).toHaveLength(1);expect((await a.client.from('production_procurement_requirement_sources').select('id').eq('round_product_id',sources.data?.[0].round_product_id)).error).toBeNull()
    const operationalAfter=await Promise.all(['inventory_lots','inventory_movements','purchase_plans','procurement_supplier_offers'].map(table=>a.client.from(table).select('*',{count:'exact',head:true})))
    expect(operationalAfter.map(result=>result.count)).toEqual(operationalBefore.map(result=>result.count))
    const supplier=await a.client.from('suppliers').insert({...owned,legal_name:'Exact Supplier',supplier_type:'raw_material',status:'active',internal_notes:'',is_preferred:true}).select('id').single()
    expect(supplier.error).toBeNull()
    expect((await a.client.from('supplier_products').insert({...owned,id:'supplier-product-exact',ingredient_id:'shared-oil',supplier_id:supplier.data!.id,supplier_name:'Exact Supplier',product_name:'Shared Oil Cosmetic',package_quantity:1,package_unit:'kg',price:100,currency:'NOK',product_url:'https://example.test/shared-oil',notes:'',is_preferred:true,grade:'Cosmetic',product_status:'verified_operational',availability_status:'in_stock',last_verified_date:'2026-07-27',verification:{inci:'reviewed',supplierSpecification:'reviewed',sds:'reviewed',coa:'unknown',allergenInformation:'unknown',shelfLife:'unknown',origin:'unknown',extractionMethod:'unknown',processingMethod:'unknown',ifra:'not_applicable',cosing:'reviewed'},created_at:now,updated_at:now})).error).toBeNull()
    const requirementId=(await a.client.from('production_procurement_requirements').select('id').eq('round_id',roundId).single()).data!.id
    const generatedCandidates=await a.client.rpc('generate_production_requirement_candidates',{target_requirement_id:requirementId,expected_round_revision:4})
    expect(generatedCandidates.error).toBeNull();expect(generatedCandidates.data).toBe(5)
    const initialCandidate=await a.client.from('production_requirement_supplier_candidates').select('*').eq('requirement_id',requirementId).eq('supplier_product_id','supplier-product-exact').single()
    expect(initialCandidate.data).toMatchObject({classification:'needs_review',mapping_id:null,status:'available'})
    expect((await b.client.rpc('accept_supplier_product_ingredient_mapping',{target_requirement_id:requirementId,target_supplier_product_id:'supplier-product-exact',expected_round_revision:5,acceptance_note:''})).error?.message).toContain('REQUIREMENT_UNAVAILABLE')
    const mapping=await a.client.rpc('accept_supplier_product_ingredient_mapping',{target_requirement_id:requirementId,target_supplier_product_id:'supplier-product-exact',expected_round_revision:5,acceptance_note:'Owner reviewed identity'})
    expect(mapping.error).toBeNull()
    const repeatedMapping=await a.client.rpc('accept_supplier_product_ingredient_mapping',{target_requirement_id:requirementId,target_supplier_product_id:'supplier-product-exact',expected_round_revision:6,acceptance_note:'Owner reviewed identity'})
    expect(repeatedMapping.error).toBeNull();expect(repeatedMapping.data).toBe(mapping.data)
    expect((await a.client.from('supplier_product_ingredient_mappings').select('id').eq('supplier_product_id','supplier-product-exact')).data).toHaveLength(1)
    expect((await a.client.rpc('generate_production_requirement_candidates',{target_requirement_id:requirementId,expected_round_revision:6})).error).toBeNull()
    const candidate=await a.client.from('production_requirement_supplier_candidates').select('*').eq('requirement_id',requirementId).eq('supplier_product_id','supplier-product-exact').single()
    const match=await a.client.from('production_requirement_supplier_matches').select('*').eq('requirement_id',requirementId).single()
    expect(candidate.data?.mapping_id).toBe(mapping.data);expect(match.data?.revision).toBe(2)
    expect((await a.client.rpc('select_production_requirement_supplier_product',{target_requirement_id:requirementId,target_candidate_id:candidate.data!.id,expected_round_revision:7,expected_match_revision:1})).error?.message).toContain('STALE_MATCH_REVISION')
    const selected=await a.client.rpc('select_production_requirement_supplier_product',{target_requirement_id:requirementId,target_candidate_id:candidate.data!.id,expected_round_revision:7,expected_match_revision:2})
    expect(selected.error).toBeNull();expect(selected.data).toBe(8)
    const persisted=await a.client.from('production_requirement_supplier_matches').select('*').eq('requirement_id',requirementId).single()
    expect(persisted.data).toMatchObject({selected_supplier_product_id:'supplier-product-exact',estimated_package_count:1})
    expect(Number(persisted.data?.expected_surplus)).toBe(680)
    const cleared=await a.client.rpc('clear_production_requirement_match',{target_requirement_id:requirementId,expected_round_revision:8,expected_match_revision:3,unresolved_note:'Needs research'})
    expect(cleared.error).toBeNull();expect(cleared.data).toBe(9)
    const rejected=await a.client.rpc('reject_production_requirement_candidate',{target_candidate_id:candidate.data!.id,expected_round_revision:9,rejection_note:'Owner rejected for this round'})
    expect(rejected.error).toBeNull();expect(rejected.data).toBe(10)
    expect((await a.client.from('production_requirement_supplier_candidates').select('status,rejection_reason').eq('id',candidate.data!.id).single()).data).toMatchObject({status:'rejected',rejection_reason:'Owner rejected for this round'})
    const operationalFinal=await Promise.all(['inventory_lots','inventory_movements','purchase_plans','procurement_supplier_offers','procurement_supplier_discounts'].map(table=>a.client.from(table).select('*',{count:'exact',head:true})))
    expect(operationalFinal.slice(0,4).map(result=>result.count)).toEqual(operationalAfter.map(result=>result.count))
    expect((await a.client.from('production_requirement_supplier_candidates').update({score:100}).eq('id',candidate.data!.id)).error).not.toBeNull()
    const cancelled=await a.client.rpc('cancel_production_procurement_round',{target_round_id:roundId,expected_revision:10})
    expect(cancelled.error).toBeNull();expect(cancelled.data).toBe(11)
    expect((await a.client.rpc('regenerate_production_procurement_requirements',{target_round_id:roundId,expected_revision:11})).error?.message).toContain('ROUND_CANCELLED')
    expect((await a.client.from('production_procurement_rounds').update({title:'Unsafe direct write'}).eq('id',roundId)).error).not.toBeNull()
    expect((await b.client.from('production_procurement_rounds').select('id').eq('id',roundId)).data).toEqual([])
    expect((await createClient(url!,anonKey!,{auth:{persistSession:false}}).rpc('create_production_procurement_round',{candidate_workspace_id:a.workspaceId,candidate_title:'Anonymous'})).error).not.toBeNull()
  },20000)
})
