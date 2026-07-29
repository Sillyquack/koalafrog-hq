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
    expect((await admin.from('inventory_movements').insert([{...owned,id:'receipt-active',inventory_lot_id:'lot-active',type:'Receipt',quantity:100,unit:'g',reason:'Test',notes:'',occurred_at:now,created_at:now},{...owned,id:'receipt-quarantine',inventory_lot_id:'lot-quarantine',type:'Receipt',quantity:50,unit:'g',reason:'Test',notes:'',occurred_at:now,created_at:now}])).error).toBeNull()
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
    expect((await a.client.from('supplier_products').insert({...owned,id:'supplier-product-selected',ingredient_id:'shared-oil',supplier_id:supplier.data!.id,supplier_name:'Exact Supplier',product_name:'Shared Oil Alternative',package_quantity:1,package_unit:'kg',price:110,currency:'NOK',product_url:'https://example.test/shared-oil-alt',notes:'',is_preferred:false,grade:'Cosmetic',product_status:'verified_operational',availability_status:'in_stock',last_verified_date:'2026-07-27',verification:{inci:'reviewed',supplierSpecification:'reviewed',sds:'reviewed',coa:'reviewed',allergenInformation:'unknown',shelfLife:'unknown',origin:'unknown',extractionMethod:'unknown',processingMethod:'unknown',ifra:'not_applicable',cosing:'reviewed'},created_at:now,updated_at:now})).error).toBeNull()
    expect((await a.client.rpc('generate_production_requirement_candidates',{target_requirement_id:requirementId,expected_round_revision:10})).error).toBeNull()
    expect((await a.client.rpc('accept_supplier_product_ingredient_mapping',{target_requirement_id:requirementId,target_supplier_product_id:'supplier-product-selected',expected_round_revision:11,acceptance_note:'Scenario selection'})).error).toBeNull()
    expect((await a.client.rpc('generate_production_requirement_candidates',{target_requirement_id:requirementId,expected_round_revision:12})).error).toBeNull()
    const selectedCandidate=await a.client.from('production_requirement_supplier_candidates').select('id').eq('requirement_id',requirementId).eq('supplier_product_id','supplier-product-selected').single()
    const currentMatch=await a.client.from('production_requirement_supplier_matches').select('revision').eq('requirement_id',requirementId).single()
    expect((await a.client.rpc('select_production_requirement_supplier_product',{target_requirement_id:requirementId,target_candidate_id:selectedCandidate.data!.id,expected_round_revision:13,expected_match_revision:currentMatch.data!.revision})).error).toBeNull()
    expect((await a.client.from('procurement_supplier_discounts').insert({...owned,supplier_id:supplier.data!.id,name:'Verified first order',discount_type:'percentage',percentage:10,first_purchase_only:true,status:'available',eligibility_state:'confirmed',verified_at:'2026-07-27T12:00:00Z',evidence_notes:''})).error).toBeNull()
    expect((await a.client.from('procurement_supplier_shipping_rules').insert({...owned,supplier_id:supplier.data!.id,destination_country_code:'NO',currency:'NOK',flat_rate:50,free_shipping_threshold:200,threshold_basis:'post_discount',tax_handling:'included',duty_handling:'excluded',status:'active',verified_at:'2026-07-27T12:00:00Z',evidence_notes:''})).error).toBeNull()
    expect((await b.client.rpc('generate_production_procurement_scenarios',{target_round_id:roundId,expected_round_revision:14})).error?.message).toContain('ROUND_UNAVAILABLE')
    const scenariosGenerated=await a.client.rpc('generate_production_procurement_scenarios',{target_round_id:roundId,expected_round_revision:14})
    expect(scenariosGenerated.error).toBeNull();expect(scenariosGenerated.data).toBe(15)
    const scenarios=await a.client.from('production_procurement_scenarios').select('*').eq('round_id',roundId)
    expect(scenarios.data).toHaveLength(6);expect(new Set(scenarios.data?.map((row:{strategy:string})=>row.strategy)).size).toBe(6)
    expect((await a.client.from('production_procurement_scenario_baskets').select('*').in('scenario_id',scenarios.data!.map((row:{id:string})=>row.id))).data).toHaveLength(6)
    const scenarioLines=await a.client.from('production_procurement_scenario_lines').select('*').in('scenario_id',scenarios.data!.map((row:{id:string})=>row.id))
    expect(scenarioLines.data).toHaveLength(6);expect(scenarioLines.data?.[0]).toMatchObject({package_count:1,surplus:680,currency:'NOK'})
    const repeatedScenarios=await a.client.rpc('generate_production_procurement_scenarios',{target_round_id:roundId,expected_round_revision:15})
    expect(repeatedScenarios.error).toBeNull();expect(repeatedScenarios.data).toBe(15);expect((await a.client.from('production_procurement_scenarios').select('id').eq('round_id',roundId)).data).toHaveLength(6)
    const balanced=scenarios.data!.find((row:{strategy:string})=>row.strategy==='balanced')
    const publishedScenario=await a.client.rpc('publish_production_procurement_scenario',{target_scenario_id:balanced.id,expected_scenario_revision:1,expected_round_revision:15})
    expect(publishedScenario.error).toBeNull();expect(publishedScenario.data).toBe(16)
    expect((await a.client.from('production_procurement_scenarios').update({ranking_score:0}).eq('id',balanced.id)).error).not.toBeNull()
    const publishedBalanced=await a.client.from('production_procurement_scenarios').select('revision').eq('id',balanced.id).single()
    const approvalKey='22222222-2222-4222-8222-222222222222'
    expect((await b.client.rpc('approve_production_procurement_scenario',{target_scenario_id:balanced.id,expected_scenario_revision:publishedBalanced.data!.revision,candidate_approval_key:approvalKey})).error?.message).toContain('SCENARIO_UNAVAILABLE')
    const approved=await a.client.rpc('approve_production_procurement_scenario',{target_scenario_id:balanced.id,expected_scenario_revision:publishedBalanced.data!.revision,candidate_approval_key:approvalKey})
    expect(approved.error).toBeNull()
    const repeatedApproval=await a.client.rpc('approve_production_procurement_scenario',{target_scenario_id:balanced.id,expected_scenario_revision:0,candidate_approval_key:approvalKey})
    expect(repeatedApproval.error).toBeNull();expect(repeatedApproval.data).toBe(approved.data)
    const planId=approved.data as string
    const plan=await a.client.from('purchase_plans').select('*').eq('id',planId).single()
    expect(plan.data).toMatchObject({supplier_id:null,status:'verification_required',plan_version:1,source_scenario_id:balanced.id,supplier_count:1,line_count:1})
    const planSnapshot=plan.data!.source_snapshot
    const baskets=await a.client.from('purchase_plan_baskets').select('*').eq('purchase_plan_id',planId)
    const lines=await a.client.from('purchase_plan_lines').select('*').eq('purchase_plan_id',planId)
    expect(baskets.data).toHaveLength(1);expect(lines.data).toHaveLength(1)
    expect(lines.data?.[0]).toMatchObject({canonical_ingredient_id:'shared-oil',supplier_product_id:'supplier-product-selected',pack_count:1})
    expect((await a.client.from('purchase_plan_baskets').update({supplier_name_snapshot:'Unsafe'}).eq('purchase_plan_id',planId)).error).not.toBeNull()
    expect((await a.client.from('purchase_plan_lines').update({pack_count:99}).eq('purchase_plan_id',planId)).error).not.toBeNull()
    const beforeCheckout=await Promise.all(['purchase_orders','inventory_lots','inventory_movements','supplier_events'].map(table=>a.client.from(table).select('*',{count:'exact',head:true})))
    expect((await a.client.rpc('mark_purchase_plan_checkout_ready',{target_plan_id:planId,expected_verification_revision:1})).error?.message).toContain('VERIFICATION_GATE_UNRESOLVED')
    let verifications=(await a.client.from('purchase_plan_verifications').select('*').eq('purchase_plan_id',planId)).data!
    expect(verifications.length).toBeGreaterThanOrEqual(7)
    for(const verification of verifications){
      const recorded=await a.client.rpc('record_purchase_plan_verification',{target_verification_id:verification.id,expected_revision:verification.revision,candidate_state:'confirmed',candidate_verified_value:verification.expected_value,candidate_unit_or_currency:verification.expected_unit_or_currency??'',candidate_method:'manual_owner_check',candidate_evidence:'integration-checkout',candidate_note:'Confirmed in integration test'})
      expect(recorded.error).toBeNull()
    }
    verifications=(await a.client.from('purchase_plan_verifications').select('*').eq('purchase_plan_id',planId)).data!
    expect(verifications.every((row:{verification_state:string})=>row.verification_state==='confirmed')).toBe(true)
    const verifiedPlan=await a.client.from('purchase_plans').select('*').eq('id',planId).single()
    const checkoutReady=await a.client.rpc('mark_purchase_plan_checkout_ready',{target_plan_id:planId,expected_verification_revision:verifiedPlan.data!.verification_revision})
    expect(checkoutReady.error).toBeNull()
    const checkoutPlan=await a.client.from('purchase_plans').select('*').eq('id',planId).single()
    expect(checkoutPlan.data).toMatchObject({status:'checkout_ready',source_snapshot:planSnapshot})
    expect((await a.client.from('purchase_plan_verifications').update({note:'Unsafe'}).eq('purchase_plan_id',planId)).error).not.toBeNull()
    const afterCheckout=await Promise.all(['purchase_orders','inventory_lots','inventory_movements','supplier_events'].map(table=>a.client.from(table).select('*',{count:'exact',head:true})))
    expect(afterCheckout.map(result=>result.count)).toEqual(beforeCheckout.map(result=>result.count))
    expect((await a.client.from('procurement_supplier_discounts').select('status,used_at').eq('supplier_id',supplier.data!.id).single()).data).toMatchObject({status:'available',used_at:null})
    expect((await a.client.rpc('generate_production_procurement_scenarios',{target_round_id:roundId,expected_round_revision:16})).error).toBeNull()
    const historical=await a.client.from('production_procurement_scenarios').select('id,status,source_fingerprint').eq('round_id',roundId)
    expect(historical.data).toHaveLength(7);expect(historical.data?.find((row:{id:string})=>row.id===balanced.id)?.status).toBe('published')
    const operationalAfterScenarios=await Promise.all(['inventory_lots','inventory_movements','procurement_supplier_offers'].map(table=>a.client.from(table).select('*',{count:'exact',head:true})))
    expect(operationalAfterScenarios.map(result=>result.count)).toEqual([operationalAfter[0].count,operationalAfter[1].count,operationalAfter[3].count])
    expect((await a.client.from('purchase_plans').select('id').eq('production_procurement_round_id',roundId)).data).toHaveLength(1)
    const usedDiscount=await a.client.from('procurement_supplier_discounts').select('status,used_at').eq('supplier_id',supplier.data!.id).single()
    expect(usedDiscount.data).toMatchObject({status:'available',used_at:null})
    const cancelled=await a.client.rpc('cancel_production_procurement_round',{target_round_id:roundId,expected_revision:17})
    expect(cancelled.error).toBeNull();expect(cancelled.data).toBe(18)
    expect((await a.client.rpc('regenerate_production_procurement_requirements',{target_round_id:roundId,expected_revision:18})).error?.message).toContain('ROUND_CANCELLED')
    expect((await a.client.from('production_procurement_rounds').update({title:'Unsafe direct write'}).eq('id',roundId)).error).not.toBeNull()
    expect((await b.client.from('production_procurement_rounds').select('id').eq('id',roundId)).data).toEqual([])
    expect((await createClient(url!,anonKey!,{auth:{persistSession:false}}).rpc('create_production_procurement_round',{candidate_workspace_id:a.workspaceId,candidate_title:'Anonymous'})).error).not.toBeNull()
  },20000)

  it('approves one genuine two-supplier plan, enforces the verification gate, supersedes versions, and preserves cancellation boundaries',async()=>{
    const a=await owner('multi-supplier'),other=await owner('multi-supplier-other'),now='2026-07-28T06:00:00.000Z'
    const owned={workspace_id:a.workspaceId,owner_id:a.ownerId}
    const supplierA=crypto.randomUUID(),supplierB=crypto.randomUUID()
    expect((await a.client.from('ingredients').insert([
      {...owned,id:'multi-ingredient-a',common_name:'Multi Oil',inci_name:'SIMMONDSIA CHINENSIS SEED OIL',category:'Oil',functions:['Emollient'],description:'',default_unit:'g',notes:'',status:'Active',created_at:now,updated_at:now},
      {...owned,id:'multi-ingredient-b',common_name:'Multi Wax',inci_name:'CANDELILLA CERA',category:'Wax',functions:['Structurant'],description:'',default_unit:'g',notes:'',status:'Active',created_at:now,updated_at:now},
    ])).error).toBeNull()
    const categories=['beard_oil','beard_butter','beard_balm','deodorant'] as const
    for(const [index,category] of categories.entries()){
      const ingredientId=index<2?'multi-ingredient-a':'multi-ingredient-b'
      expect((await a.client.from('products').insert({...owned,id:`multi-product-${category}`,name:category.replaceAll('_',' '),category,status:'Active',development_stage:'Formulation',description:'',scent_profile:'',created_at:now,updated_at:now})).error).toBeNull()
      expect((await a.client.from('formulas').insert({...owned,id:`multi-formula-${category}`,product_id:`multi-product-${category}`,name:`${category} formula`,description:'',created_at:now,updated_at:now})).error).toBeNull()
      expect((await a.client.from('formula_versions').insert({...owned,id:`multi-version-${category}`,formula_id:`multi-formula-${category}`,version:'v1.0',status:'Approved',description:'',target_characteristics:'',phase_definitions:[{code:'A',name:'Main',order:1}],manufacturing_process:[],created_at:now,updated_at:now})).error).toBeNull()
      expect((await a.client.from('formula_lines').insert({...owned,id:`multi-line-${category}`,formula_version_id:`multi-version-${category}`,ingredient_id:ingredientId,percentage:100,phase:'A',sort_order:1,notes:'',formulation_role:category==='deodorant'?'deodorant_active':'emollient'})).error).toBeNull()
    }
    expect((await a.client.from('suppliers').insert([
      {...owned,id:supplierA,legal_name:'Supplier Alpha',supplier_type:'raw_material',status:'active',internal_notes:'',is_preferred:true,website_url:'https://alpha.example.test'},
      {...owned,id:supplierB,legal_name:'Supplier Beta',supplier_type:'raw_material',status:'active',internal_notes:'',is_preferred:false,website_url:'https://beta.example.test'},
    ])).error).toBeNull()
    expect((await a.client.from('supplier_products').insert([
      {...owned,id:'multi-product-a',ingredient_id:'multi-ingredient-a',supplier_id:supplierA,supplier_name:'Supplier Alpha',product_name:'Multi Oil 500 g',package_quantity:500,package_unit:'g',price:100,currency:'NOK',product_url:'https://alpha.example.test/oil',notes:'',is_preferred:true,grade:'Cosmetic',product_status:'verified_operational',availability_status:'in_stock',last_verified_date:'2026-07-28',verification:{sds:'reviewed'},created_at:now,updated_at:now},
      {...owned,id:'multi-product-b',ingredient_id:'multi-ingredient-b',supplier_id:supplierB,supplier_name:'Supplier Beta',product_name:'Multi Wax 250 g',package_quantity:250,package_unit:'g',price:80,currency:'NOK',product_url:'https://beta.example.test/wax',notes:'',is_preferred:true,grade:'Cosmetic',product_status:'verified_operational',availability_status:'in_stock',last_verified_date:'2026-07-28',verification:{sds:'reviewed'},created_at:now,updated_at:now},
    ])).error).toBeNull()
    expect((await a.client.from('procurement_supplier_shipping_rules').insert([
      {...owned,supplier_id:supplierA,destination_country_code:'NO',currency:'NOK',flat_rate:20,tax_handling:'included',duty_handling:'excluded',status:'active',verified_at:now,evidence_notes:''},
      {...owned,supplier_id:supplierB,destination_country_code:'NO',currency:'NOK',flat_rate:30,tax_handling:'included',duty_handling:'excluded',status:'active',verified_at:now,evidence_notes:''},
    ])).error).toBeNull()
    const created=await a.client.rpc('create_production_procurement_round',{candidate_workspace_id:a.workspaceId,candidate_title:'Two supplier production',candidate_notes:'',candidate_base_currency:'NOK',idempotency_key:crypto.randomUUID()})
    expect(created.error).toBeNull()
    const roundId=created.data as string
    const selections=categories.map(category=>({category,productId:`multi-product-${category}`,formulaVersionId:`multi-version-${category}`,batchCount:1,batchSize:100,batchUnit:'g',overagePercent:0,expectedYield:null,deodorantStructure:category==='deodorant'?'anhydrous':null}))
    expect((await a.client.rpc('update_production_procurement_round_products',{target_round_id:roundId,expected_revision:1,round_title:'Two supplier production',round_notes:'',product_selections:selections})).error).toBeNull()
    expect((await a.client.rpc('regenerate_production_procurement_requirements',{target_round_id:roundId,expected_revision:2})).error).toBeNull()
    const requirements=(await a.client.from('production_procurement_requirements').select('*').eq('round_id',roundId).order('ingredient_id')).data!
    expect(requirements).toHaveLength(2)
    let roundRevision=3
    for(const requirement of requirements){
      const supplierProductId=requirement.ingredient_id==='multi-ingredient-a'?'multi-product-a':'multi-product-b'
      expect((await a.client.rpc('generate_production_requirement_candidates',{target_requirement_id:requirement.id,expected_round_revision:roundRevision})).error).toBeNull();roundRevision++
      expect((await a.client.rpc('accept_supplier_product_ingredient_mapping',{target_requirement_id:requirement.id,target_supplier_product_id:supplierProductId,expected_round_revision:roundRevision,acceptance_note:'Two-supplier fixture'})).error).toBeNull();roundRevision++
      expect((await a.client.rpc('generate_production_requirement_candidates',{target_requirement_id:requirement.id,expected_round_revision:roundRevision})).error).toBeNull();roundRevision++
      const candidate=(await a.client.from('production_requirement_supplier_candidates').select('id').eq('requirement_id',requirement.id).eq('supplier_product_id',supplierProductId).single()).data!
      const match=(await a.client.from('production_requirement_supplier_matches').select('revision').eq('requirement_id',requirement.id).single()).data!
      expect((await a.client.rpc('select_production_requirement_supplier_product',{target_requirement_id:requirement.id,target_candidate_id:candidate.id,expected_round_revision:roundRevision,expected_match_revision:match.revision})).error).toBeNull();roundRevision++
    }
    expect((await a.client.rpc('generate_production_procurement_scenarios',{target_round_id:roundId,expected_round_revision:roundRevision})).error).toBeNull();roundRevision++
    const scenarioARecord=(await a.client.from('production_procurement_scenarios').select('*').eq('round_id',roundId).eq('strategy','balanced').neq('status','published').single()).data!
    expect(scenarioARecord).toMatchObject({supplier_count:2,line_count:2})
    expect((await a.client.rpc('publish_production_procurement_scenario',{target_scenario_id:scenarioARecord.id,expected_scenario_revision:scenarioARecord.revision,expected_round_revision:roundRevision})).error).toBeNull();roundRevision++
    const scenarioA=scenarioARecord.id
    expect((await other.client.rpc('approve_production_procurement_scenario',{target_scenario_id:scenarioA,expected_scenario_revision:2,candidate_approval_key:crypto.randomUUID()})).error?.message).toContain('SCENARIO_UNAVAILABLE')
    const approvedA=await a.client.rpc('approve_production_procurement_scenario',{target_scenario_id:scenarioA,expected_scenario_revision:2,candidate_approval_key:'33333333-3333-4333-8333-333333333333'})
    expect(approvedA.error).toBeNull()
    const planAId=approvedA.data as string
    const planA=await a.client.from('purchase_plans').select('*').eq('id',planAId).single()
    expect(planA.data).toMatchObject({supplier_id:null,source_scenario_id:scenarioA,plan_version:1,supplier_count:2,line_count:2,status:'verification_required'})
    expect((await a.client.from('purchase_plan_baskets').select('supplier_id').eq('purchase_plan_id',planAId)).data?.map((row:{supplier_id:string})=>row.supplier_id).sort()).toEqual([supplierA,supplierB].sort())
    expect((await a.client.from('purchase_plan_lines').select('source_scenario_line_id').eq('purchase_plan_id',planAId)).data).toHaveLength(2)
    expect((await a.client.from('purchase_orders').select('id').eq('source_purchase_plan_id',planAId)).data).toEqual([])

    const expectedSnapshot=structuredClone(planA.data!.source_snapshot)
    const checks=(await a.client.from('purchase_plan_verifications').select('*').eq('purchase_plan_id',planAId)).data!
    const priceCheck=checks.find((row:{field:string})=>row.field==='package_price')!
    const stalePrice=await a.client.rpc('record_purchase_plan_verification',{target_verification_id:priceCheck.id,expected_revision:0,candidate_state:'changed',candidate_verified_value:95,candidate_unit_or_currency:'NOK',candidate_method:'manual_owner_check',candidate_evidence:'checkout',candidate_note:'Lower price'})
    expect(stalePrice.error?.message).toContain('STALE_VERIFICATION_REVISION')
    expect((await a.client.rpc('record_purchase_plan_verification',{target_verification_id:priceCheck.id,expected_revision:priceCheck.revision,candidate_state:'changed',candidate_verified_value:95,candidate_unit_or_currency:'NOK',candidate_method:'manual_owner_check',candidate_evidence:'checkout',candidate_note:'Lower price'})).error).toBeNull()
    expect((await a.client.from('purchase_plan_verifications').select('expected_value,verified_value,verification_state').eq('id',priceCheck.id).single()).data).toMatchObject({expected_value:100,verified_value:95,verification_state:'changed_acceptable'})
    const identityCheck=checks.find((row:{field:string})=>row.field==='package_identity')!
    expect((await a.client.rpc('record_purchase_plan_verification',{target_verification_id:identityCheck.id,expected_revision:identityCheck.revision,candidate_state:'changed',candidate_verified_value:{size:1000,unit:'g',count:1},candidate_unit_or_currency:'g',candidate_method:'manual_owner_check',candidate_evidence:'checkout',candidate_note:'Changed pack'})).error).toBeNull()
    expect((await a.client.from('purchase_plan_verifications').select('verification_state').eq('id',identityCheck.id).single()).data?.verification_state).toBe('changed_requires_new_plan')
    let currentPlanA=await a.client.from('purchase_plans').select('*').eq('id',planAId).single()
    expect((await a.client.rpc('mark_purchase_plan_checkout_ready',{target_plan_id:planAId,expected_verification_revision:currentPlanA.data!.verification_revision})).error?.message).toContain('VERIFICATION_GATE_UNRESOLVED')
    expect((await a.client.rpc('waive_purchase_plan_verification',{target_verification_id:identityCheck.id,expected_revision:identityCheck.revision+1,waiver_reason:'Cannot waive this required identity check'})).error?.message).toContain('HARD_BLOCKER_NOT_WAIVABLE')
    for(const check of (await a.client.from('purchase_plan_verifications').select('*').eq('purchase_plan_id',planAId)).data!){
      if(check.id===priceCheck.id)continue
      expect((await a.client.rpc('record_purchase_plan_verification',{target_verification_id:check.id,expected_revision:check.revision,candidate_state:'confirmed',candidate_verified_value:check.expected_value,candidate_unit_or_currency:check.expected_unit_or_currency??'',candidate_method:'manual_owner_check',candidate_evidence:'checkout',candidate_note:'Confirmed'})).error).toBeNull()
    }
    const basketAId=(await a.client.from('purchase_plan_baskets').select('id').eq('purchase_plan_id',planAId).limit(1).single()).data!.id
    const advisoryId=crypto.randomUUID()
    await admin.from('purchase_plan_verifications').insert({...owned,id:advisoryId,purchase_plan_id:planAId,plan_version:1,purchase_plan_basket_id:basketAId,supplier_id:supplierA,category:'supplier',field:'optional_service_level',expected_value:'standard',severity:'advisory',requirement_reason:'Optional service-level note'}).throwOnError()
    expect((await a.client.rpc('waive_purchase_plan_verification',{target_verification_id:advisoryId,expected_revision:1,waiver_reason:'no'})).error?.message).toContain('WAIVER_REASON_REQUIRED')
    expect((await a.client.rpc('waive_purchase_plan_verification',{target_verification_id:advisoryId,expected_revision:1,waiver_reason:'Owner accepts standard delivery'})).error).toBeNull()
    currentPlanA=await a.client.from('purchase_plans').select('*').eq('id',planAId).single()
    expect((await a.client.rpc('mark_purchase_plan_checkout_ready',{target_plan_id:planAId,expected_verification_revision:currentPlanA.data!.verification_revision})).error).toBeNull()
    expect((await a.client.from('purchase_plans').select('source_snapshot,status').eq('id',planAId).single()).data).toMatchObject({source_snapshot:expectedSnapshot,status:'checkout_ready'})
    currentPlanA=await a.client.from('purchase_plans').select('*').eq('id',planAId).single()
    const handoffKey=crypto.randomUUID()
    const handoff=await a.client.rpc('create_draft_purchase_orders_from_plan',{target_plan_id:planAId,expected_plan_revision:currentPlanA.data!.revision,candidate_handoff_key:handoffKey})
    expect(handoff.error).toBeNull();expect(handoff.data).toHaveLength(2)
    const orders=(await a.client.from('purchase_orders').select('*').eq('source_purchase_plan_id',planAId).order('supplier_id')).data!
    expect(orders).toHaveLength(2)
    expect(orders.every((order:{status:string;external_order_date:string|null;handoff_policy_version:string})=>order.status==='draft'&&order.external_order_date===null&&order.handoff_policy_version==='1.0.0')).toBe(true)
    const orderLines=(await a.client.from('purchase_order_lines').select('*').in('purchase_order_id',orders.map((order:{id:string})=>order.id))).data!
    expect(orderLines).toHaveLength(2)
    expect(orderLines.find((line:{verified_unit_price:number|null})=>line.verified_unit_price!=null)).toMatchObject({expected_unit_price:100,verified_unit_price:95,effective_unit_price:95,effective_value_source:'checkout_verification'})
    for(const order of orders)expect(new Set(orderLines.filter((line:{purchase_order_id:string})=>line.purchase_order_id===order.id).map((line:{source_purchase_plan_basket_id:string})=>line.source_purchase_plan_basket_id))).toEqual(new Set([order.source_purchase_plan_basket_id]))
    expect((await a.client.rpc('create_draft_purchase_orders_from_plan',{target_plan_id:planAId,expected_plan_revision:currentPlanA.data!.revision,candidate_handoff_key:handoffKey})).data).toEqual(handoff.data)
    expect((await a.client.from('purchase_orders').select('id',{count:'exact',head:true}).eq('source_purchase_plan_id',planAId)).count).toBe(2)
    expect((await a.client.rpc('cancel_draft_purchase_order',{target_order_id:orders[0].id,expected_revision:1,candidate_reason:'Supplier checkout deferred'})).error).toBeNull()
    expect((await a.client.from('purchase_orders').select('status,cancellation_reason').eq('id',orders[0].id).single()).data).toMatchObject({status:'cancelled',cancellation_reason:'Supplier checkout deferred'})
    expect((await a.client.from('purchase_order_lines').select('id').eq('purchase_order_id',orders[0].id)).data).toHaveLength(1)
    expect((await a.client.rpc('cancel_draft_purchase_order',{target_order_id:orders[1].id,expected_revision:1,candidate_reason:''})).error?.message).toContain('CANCELLATION_REASON_REQUIRED')
    expect((await a.client.from('supplier_events').select('id').in('purchase_order_id',orders.map((order:{id:string})=>order.id))).data).toEqual([])
    const placedOrder=orders[1],placedLine=orderLines.find((line:{purchase_order_id:string})=>line.purchase_order_id===placedOrder.id)!
    const planBeforePlacement=(await a.client.from('purchase_plans').select('*').eq('id',planAId).single()).data!
    const movementCount=(await a.client.from('inventory_movements').select('id',{count:'exact',head:true}).eq('owner_id',a.ownerId)).count
    const inventoryLotCount=(await a.client.from('inventory_lots').select('id',{count:'exact',head:true}).eq('owner_id',a.ownerId)).count
    const placementKey=crypto.randomUUID(),placementPayload={supplierOrderReference:'SUPPLIER-PLACED-1',placedAt:new Date().toISOString(),actualCurrency:placedOrder.currency,actualMerchandiseSubtotal:placedOrder.merchandise_subtotal,actualDiscount:placedOrder.discount,actualShipping:placedOrder.shipping,actualVat:0,actualImportVat:0,actualDuty:0,actualCustoms:0,actualHandling:0,actualGrandTotal:placedOrder.total,firstOrderDiscountApplied:false,discountCodeUsed:'',freeShippingAchieved:false,checkoutTaxState:'confirmed',importCostState:'unknown',evidenceType:'manual_reference',evidenceReference:'confirmation-email:SUPPLIER-PLACED-1',evidenceNote:'Owner checked supplier confirmation',sourceUrl:'https://supplier.example/order/1',note:'Placed manually',acknowledgeMaterialDifferences:false,confirmExternallyPlaced:true,lines:[{purchaseOrderLineId:placedLine.id,actualPackageCount:placedLine.ordered_package_count,actualUnitPrice:placedLine.effective_unit_price,actualLineSubtotal:placedLine.line_subtotal,productIdentity:'matches',packageIdentity:'matches',stockState:'confirmed'}]}
    expect((await a.client.rpc('record_verified_purchase_order_placement',{target_order_id:placedOrder.id,expected_revision:1,candidate_placement_key:placementKey,placement_payload:placementPayload})).error).toBeNull()
    const placed=(await a.client.from('purchase_orders').select('*').eq('id',placedOrder.id).single()).data!
    expect(placed).toMatchObject({status:'placed',order_reference:'SUPPLIER-PLACED-1',actual_currency:placedOrder.currency,actual_grand_total:placedOrder.total,placement_policy_version:'1.0.0'})
    expect((await a.client.from('purchase_order_lines').select('expected_unit_price,verified_unit_price,effective_unit_price,actual_unit_price,placement_actual_snapshot').eq('id',placedLine.id).single()).data).toMatchObject({expected_unit_price:placedLine.expected_unit_price,verified_unit_price:placedLine.verified_unit_price,effective_unit_price:placedLine.effective_unit_price,actual_unit_price:placedLine.effective_unit_price,placement_actual_snapshot:placementPayload.lines[0]})
    expect((await a.client.from('purchase_orders').select('status').eq('id',orders[0].id).single()).data?.status).toBe('cancelled')
    expect((await a.client.from('supplier_events').select('event_type').eq('purchase_order_id',placedOrder.id)).data).toEqual([{event_type:'purchase_placed'}])
    expect((await a.client.rpc('record_verified_purchase_order_placement',{target_order_id:placedOrder.id,expected_revision:1,candidate_placement_key:placementKey,placement_payload:placementPayload})).data).toBe(2)
    expect((await a.client.from('supplier_events').select('id').eq('purchase_order_id',placedOrder.id)).data).toHaveLength(1)
    expect((await a.client.rpc('record_verified_purchase_order_placement',{target_order_id:placedOrder.id,expected_revision:1,candidate_placement_key:placementKey,placement_payload:{...placementPayload,actualGrandTotal:Number(placementPayload.actualGrandTotal)+1}})).error?.message).toContain('PLACEMENT_RETRY_CONFLICT')
    expect((await a.client.rpc('cancel_draft_purchase_order',{target_order_id:placedOrder.id,expected_revision:2,candidate_reason:'Cannot cancel placed'})).error?.message).toContain('PURCHASE_ORDER_NOT_DRAFT_CANCELLABLE')
    expect((await a.client.from('purchase_plans').select('*').eq('id',planAId).single()).data).toEqual(planBeforePlacement)
    expect((await a.client.from('inventory_movements').select('id',{count:'exact',head:true}).eq('owner_id',a.ownerId)).count).toBe(movementCount)

    const confirmationKey=crypto.randomUUID(),confirmedQuantity=Number(placedLine.ordered_quantity),confirmedPackageCount=Number(placedLine.ordered_package_count),confirmationPayload={supplierConfirmationReference:'CONFIRM-1',supplierConfirmationDate:new Date().toISOString(),responseChannel:'email',supplierRepresentative:'Supplier desk',confirmationType:'order_acknowledgement',supplierMessageSummary:'Order accepted',supplierNotes:'Split dispatch expected',estimatedDispatchDate:'2026-08-01',estimatedDeliveryDate:'2026-08-05',confirmedCurrency:placed.actual_currency,confirmedMerchandiseSubtotal:placed.actual_merchandise_subtotal,confirmedDiscount:placed.actual_discount,confirmedShipping:placed.actual_shipping,confirmedTax:placed.actual_vat,confirmedGrandTotal:placed.actual_grand_total,unresolvedPostShipmentCosts:false,paymentAcknowledgementState:'acknowledged',evidenceType:'email_reference',evidenceReference:'email:CONFIRM-1',sourceUrl:'https://supplier.example/confirm/1',lines:[{purchaseOrderLineId:placedLine.id,confirmedProductIdentity:placedLine.product_name_snapshot,confirmedSku:placedLine.supplier_sku_snapshot??'',confirmedVariant:placedLine.variant_snapshot??'',confirmedPackageSize:Number(placedLine.package_size),confirmedPackageUnit:placedLine.package_unit,confirmedPackageCount,confirmedQuantity,confirmedUnitPrice:Number(placedLine.effective_unit_price),confirmedLineSubtotal:Number(placedLine.line_subtotal),availabilityState:'confirmed',expectedDispatchDate:'2026-08-01',expectedRestockDate:'',supplierLineNote:'Available'}]}
    expect((await other.client.rpc('record_purchase_order_supplier_confirmation',{target_order_id:placedOrder.id,expected_order_revision:2,candidate_idempotency_key:crypto.randomUUID(),confirmation_payload:confirmationPayload})).error?.message).toContain('PURCHASE_ORDER_UNAVAILABLE')
    expect((await a.client.from('purchase_order_confirmations').insert({workspace_id:a.workspaceId,owner_id:a.ownerId,purchase_order_id:placedOrder.id,supplier_id:placedOrder.supplier_id,confirmation_version:1,source_placement_revision:1,supplier_confirmation_reference:'FORGED',supplier_confirmation_date:new Date().toISOString(),confirmed_currency:'NOK',confirmed_grand_total:1,evidence_type:'forged',evidence_reference:'forged',classification:'exact',idempotency_key:crypto.randomUUID(),payload_fingerprint:'forged',recorded_by:a.ownerId})).error).not.toBeNull()
    expect((await a.client.from('purchase_order_shipments').insert({workspace_id:a.workspaceId,owner_id:a.ownerId,purchase_order_id:placedOrder.id,supplier_id:placedOrder.supplier_id,confirmation_id:crypto.randomUUID(),shipment_sequence:1,supplier_shipment_reference:'FORGED',evidence_type:'forged',evidence_reference:'forged',idempotency_key:crypto.randomUUID(),payload_fingerprint:'forged',recorded_by:a.ownerId})).error).not.toBeNull()
    const confirmation=await a.client.rpc('record_purchase_order_supplier_confirmation',{target_order_id:placedOrder.id,expected_order_revision:2,candidate_idempotency_key:confirmationKey,confirmation_payload:confirmationPayload})
    expect(confirmation.error).toBeNull()
    expect((await a.client.rpc('record_purchase_order_supplier_confirmation',{target_order_id:placedOrder.id,expected_order_revision:2,candidate_idempotency_key:confirmationKey,confirmation_payload:confirmationPayload})).data).toBe(confirmation.data)
    expect((await a.client.rpc('record_purchase_order_supplier_confirmation',{target_order_id:placedOrder.id,expected_order_revision:2,candidate_idempotency_key:confirmationKey,confirmation_payload:{...confirmationPayload,supplierNotes:'conflict'}})).error?.message).toContain('CONFIRMATION_RETRY_CONFLICT')
    const confirmationRow=(await a.client.from('purchase_order_confirmations').select('*').eq('id',confirmation.data).single()).data!
    expect(confirmationRow).toMatchObject({confirmation_version:1,classification:'exact',acceptance_status:'pending_decision',evidence_reference:'email:CONFIRM-1'})
    expect((await a.client.from('purchase_order_confirmation_lines').select('ordered_package_count,confirmed_package_count,mismatch_classification,availability_state').eq('confirmation_id',confirmation.data).single()).data).toMatchObject({ordered_package_count:confirmedPackageCount,confirmed_package_count:confirmedPackageCount,mismatch_classification:'exact',availability_state:'confirmed'})
    expect((await a.client.rpc('decide_purchase_order_confirmation',{target_confirmation_id:confirmation.data,expected_revision:1,candidate_decision:'accepted_exact',candidate_reason:'',line_decisions:[]})).error).toBeNull()

    const confirmedLine=(await a.client.from('purchase_order_confirmation_lines').select('*').eq('confirmation_id',confirmation.data).single()).data!,firstQuantity=confirmedQuantity/2
    const shipmentPayload=(reference:string,quantity:number)=>({carrier:'PostNord',serviceLevel:'Standard',trackingNumber:`TRACK-${reference}`,trackingUrl:`https://tracking.example/${reference}`,supplierShipmentReference:reference,estimatedDeliveryDate:'2026-08-05',originCountry:'SE',destinationCountry:'NO',shippingNotes:'Split shipment',shipmentCost:null,shipmentCurrency:placed.actual_currency,packageCount:1,grossWeight:null,weightUnit:'kg',dangerousGoodsState:'not_dangerous',customsDocumentationState:'pending',customsReference:'',importTrackingState:'pending',evidenceType:'dispatch_notice',evidenceReference:`dispatch:${reference}`,sourceUrl:'',lines:[{confirmationLineId:confirmedLine.id,shippedPackageCount:confirmedPackageCount/2,shippedQuantity:quantity,supplierLineReference:reference,note:''}]})
    const shipmentKey1=crypto.randomUUID(),shipment1=await a.client.rpc('create_purchase_order_shipment',{target_order_id:placedOrder.id,target_confirmation_id:confirmation.data,expected_order_revision:3,candidate_idempotency_key:shipmentKey1,shipment_payload:shipmentPayload('SHIP-1',firstQuantity)})
    expect(shipment1.error).toBeNull()
    expect((await a.client.rpc('create_purchase_order_shipment',{target_order_id:placedOrder.id,target_confirmation_id:confirmation.data,expected_order_revision:3,candidate_idempotency_key:shipmentKey1,shipment_payload:shipmentPayload('SHIP-1',firstQuantity)})).data).toBe(shipment1.data)
    expect((await a.client.rpc('create_purchase_order_shipment',{target_order_id:placedOrder.id,target_confirmation_id:confirmation.data,expected_order_revision:4,candidate_idempotency_key:crypto.randomUUID(),shipment_payload:shipmentPayload('OVER-SHIP',confirmedQuantity)})).error?.message).toContain('SHIPMENT_QUANTITY_EXCEEDS_CONFIRMED')
    const statusKey=crypto.randomUUID()
    expect((await a.client.rpc('record_purchase_order_shipment_status',{target_shipment_id:shipment1.data,expected_revision:1,candidate_status:'dispatched',status_payload:{dispatchDate:new Date().toISOString(),carrier:'PostNord',trackingNumber:'TRACK-SHIP-1',evidenceType:'dispatch_notice',evidenceReference:'dispatch:SHIP-1'},candidate_idempotency_key:statusKey})).error).toBeNull()
    expect((await a.client.rpc('record_purchase_order_shipment_status',{target_shipment_id:shipment1.data,expected_revision:1,candidate_status:'dispatched',status_payload:{dispatchDate:new Date().toISOString()},candidate_idempotency_key:statusKey})).data).toBe(2)

    const correctedKey=crypto.randomUUID(),correctedPayload={...confirmationPayload,supplierConfirmationReference:'CONFIRM-2',evidenceReference:'email:CONFIRM-2',supplierNotes:'Backorder released'}
    const corrected=await a.client.rpc('record_purchase_order_supplier_confirmation',{target_order_id:placedOrder.id,expected_order_revision:4,candidate_idempotency_key:correctedKey,confirmation_payload:correctedPayload})
    expect(corrected.error).toBeNull()
    expect((await a.client.from('purchase_order_confirmations').select('confirmation_version,lifecycle_status').eq('purchase_order_id',placedOrder.id).order('confirmation_version')).data).toEqual([{confirmation_version:1,lifecycle_status:'superseded'},{confirmation_version:2,lifecycle_status:'recorded'}])
    expect((await a.client.rpc('decide_purchase_order_confirmation',{target_confirmation_id:corrected.data,expected_revision:1,candidate_decision:'accepted_exact',candidate_reason:'',line_decisions:[]})).error).toBeNull()
    const correctedLine=(await a.client.from('purchase_order_confirmation_lines').select('*').eq('confirmation_id',corrected.data).single()).data!
    const shipment2Payload={...shipmentPayload('SHIP-2',confirmedQuantity-firstQuantity),lines:[{confirmationLineId:correctedLine.id,shippedPackageCount:confirmedPackageCount/2,shippedQuantity:confirmedQuantity-firstQuantity,supplierLineReference:'SHIP-2',note:'Backorder remainder'}]}
    const shipment2=await a.client.rpc('create_purchase_order_shipment',{target_order_id:placedOrder.id,target_confirmation_id:corrected.data,expected_order_revision:5,candidate_idempotency_key:crypto.randomUUID(),shipment_payload:shipment2Payload})
    expect(shipment2.error).toBeNull()
    expect((await a.client.from('purchase_order_shipment_lines').select('shipped_quantity').eq('purchase_order_id',placedOrder.id)).data?.reduce((sum,row)=>sum+Number(row.shipped_quantity),0)).toBe(confirmedQuantity)
    expect((await a.client.rpc('record_purchase_order_shipment_status',{target_shipment_id:shipment2.data,expected_revision:1,candidate_status:'delivery_reported',status_payload:{reportedAt:new Date().toISOString(),evidenceType:'carrier_report',evidenceReference:'carrier:delivered'},candidate_idempotency_key:crypto.randomUUID()})).error).toBeNull()
    expect((await a.client.from('purchase_order_shipments').select('status,delivery_reported_at').eq('id',shipment2.data).single()).data?.status).toBe('delivery_reported')
    const receiptKey=crypto.randomUUID(),receiptPayload={shipmentIds:[shipment2.data],receiptNumber:'RCV-TEST-1',physicalReceiptDate:new Date().toISOString(),receivingLocation:'Receiving quarantine area',packageCountExpected:1,packageCountReceived:1,outerPackagingCondition:'intact',tamperState:'none_observed',waterDamageState:'none_observed',visibleContaminationState:'none_observed',temperatureConcernState:'none_observed',evidenceType:'manual_reference',evidenceReference:'photo:receipt-1',photographReference:'photo:receipt-1',deliveryNoteReference:'delivery-note:1',packingSlipReference:'packing-slip:1',sourceUrl:'',receivingNotes:'Package physically counted.'}
    expect((await other.client.rpc('create_purchase_order_receipt',{target_order_id:placedOrder.id,expected_order_revision:6,candidate_idempotency_key:crypto.randomUUID(),receipt_payload:receiptPayload})).error?.message).toContain('PURCHASE_ORDER_UNAVAILABLE')
    expect((await a.client.from('purchase_order_receipts').insert({workspace_id:a.workspaceId,owner_id:a.ownerId,purchase_order_id:placedOrder.id,supplier_id:placedOrder.supplier_id,receipt_sequence:1,receipt_number:'FORGED',physical_receipt_date:new Date().toISOString(),physically_received_by:a.ownerId,receiving_location:'X',package_count_received:1,outer_packaging_condition:'intact',tamper_state:'none_observed',water_damage_state:'none_observed',visible_contamination_state:'none_observed',temperature_concern_state:'none_observed',evidence_type:'x',evidence_reference:'x',idempotency_key:crypto.randomUUID(),payload_fingerprint:'x',recorded_by:a.ownerId})).error).not.toBeNull()
    const receipt=await a.client.rpc('create_purchase_order_receipt',{target_order_id:placedOrder.id,expected_order_revision:6,candidate_idempotency_key:receiptKey,receipt_payload:receiptPayload})
    expect(receipt.error).toBeNull()
    expect((await a.client.rpc('create_purchase_order_receipt',{target_order_id:placedOrder.id,expected_order_revision:6,candidate_idempotency_key:receiptKey,receipt_payload:receiptPayload})).data).toBe(receipt.data)
    expect((await a.client.rpc('create_purchase_order_receipt',{target_order_id:placedOrder.id,expected_order_revision:6,candidate_idempotency_key:receiptKey,receipt_payload:{...receiptPayload,packageCountReceived:2}})).error?.message).toContain('RECEIPT_RETRY_CONFLICT')
    const shipment2Line=(await a.client.from('purchase_order_shipment_lines').select('*').eq('shipment_id',shipment2.data).single()).data!
    const receivedQuantity=Number(shipment2Line.shipped_quantity)
    const receiptLinePayload={purchaseOrderLineId:placedLine.id,shipmentLineId:shipment2Line.id,receivedProductName:placedLine.product_name_snapshot,receivedSupplierProductIdentity:placedLine.product_name_snapshot,receivedSku:placedLine.supplier_sku_snapshot??'',receivedVariant:placedLine.variant_snapshot??'',receivedPackageCount:Number(shipment2Line.shipped_package_count),receivedPackageSize:Number(placedLine.package_size),receivedPackageUnit:placedLine.package_unit,receivedTotalQuantity:receivedQuantity,damagedQuantity:0,heldQuantity:0,rejectedQuantity:0,unopenedPackageCount:Number(shipment2Line.shipped_package_count),openedPackageCount:0,supplierLotNumber:'SUP-LOT-001',supplierBatchNumber:'BATCH-001',manufacturerLotNumber:'MFG-001',manufacturingDate:'2026-07-01',expiryDate:'2028-07-01',bestBeforeDate:'',retestDate:'',lotMarkingLocation:'Container label',lotEvidenceReference:'photo:lot-1',identityChecks:{productNameMatches:true,packageSizeMatches:true,unitMatches:true,labelMatches:true},conditionChecks:{containerIntact:true,sealIntact:true,leakage:false,contaminationConcern:false},documentationChecks:{coaPresent:true,sdsPresent:true,documentationComplete:true},documentationReferences:{coa:'coa:lot-1',sds:'sds:product'},materialProfile:'carrier_oil',identityStatus:'matches',conditionStatus:'acceptable',physicalLineNote:'Exact and intact',acknowledgeOverDelivery:false}
    const receiptLine=await a.client.rpc('record_purchase_order_receipt_line',{target_receipt_id:receipt.data,expected_receipt_revision:1,candidate_idempotency_key:crypto.randomUUID(),line_payload:receiptLinePayload})
    expect(receiptLine.error).toBeNull()
    expect((await a.client.from('purchase_order_receipt_lines').select('ordered_quantity,confirmed_quantity,shipped_quantity,received_total_quantity,supplier_lot_number,expiry_date').eq('id',receiptLine.data).single()).data).toMatchObject({ordered_quantity:confirmedQuantity,confirmed_quantity:confirmedQuantity,shipped_quantity:receivedQuantity,received_total_quantity:receivedQuantity,supplier_lot_number:'SUP-LOT-001',expiry_date:'2028-07-01'})
    expect((await a.client.rpc('record_purchase_order_receipt_inspection',{target_receipt_id:receipt.data,expected_receipt_revision:2,candidate_idempotency_key:crypto.randomUUID(),inspection_payload:{receiptLineId:receiptLine.data,inspectionType:'identity_and_label',result:'passed_receiving_checks',checklistSnapshot:{identityMatches:true,packageIntegrity:true,sealIntegrity:true,lotTraceable:true,documentationComplete:true},measuredValues:{},notes:'Exact receiving check',evidence:{reference:'photo:lot-1'}}})).error).toBeNull()
    const completedReceiving=await a.client.rpc('complete_purchase_order_receiving',{target_receipt_id:receipt.data,expected_receipt_revision:3,candidate_idempotency_key:crypto.randomUUID()})
    expect(completedReceiving.error).toBeNull()
    expect(completedReceiving.data).toBe('quarantine_ready')
    const quarantine=await a.client.rpc('place_purchase_order_receipt_into_quarantine',{target_receipt_id:receipt.data,expected_receipt_revision:4,candidate_idempotency_key:crypto.randomUUID(),quarantine_payload:{lines:[{receiptLineId:receiptLine.data,quarantineQuantity:receivedQuantity,containerCount:Number(shipment2Line.shipped_package_count),quarantineLocation:'Receiving quarantine area',quarantineReason:'Receiving checks passed; quality release pending.',storageRequirementSnapshot:{},hazardSnapshot:{}}]}})
    expect(quarantine.error).toBeNull()
    expect((await a.client.from('inventory_quarantine_intakes').select('quarantine_quantity,quarantine_status,supplier_lot_number').eq('receipt_id',receipt.data).single()).data).toMatchObject({quarantine_quantity:receivedQuantity,quarantine_status:'quarantined',supplier_lot_number:'SUP-LOT-001'})
    expect((await a.client.from('inventory_lots').select('id',{count:'exact',head:true}).eq('owner_id',a.ownerId)).count).toBe(inventoryLotCount)
    expect((await a.client.from('supplier_events').select('source_key').eq('purchase_order_id',placedOrder.id)).data?.map(row=>row.source_key).length).toBe(new Set((await a.client.from('supplier_events').select('source_key').eq('purchase_order_id',placedOrder.id)).data?.map(row=>row.source_key)).size)
    expect((await a.client.from('purchase_plans').select('*').eq('id',planAId).single()).data).toEqual(planBeforePlacement)
    expect((await a.client.from('inventory_movements').select('id',{count:'exact',head:true}).eq('owner_id',a.ownerId)).count).toBe(movementCount)
    const quarantineIntake=(await a.client.from('inventory_quarantine_intakes').select('*').eq('receipt_id',receipt.data).single()).data!
    const releaseKey=crypto.randomUUID(),releaseQuantity=receivedQuantity/2
    const releasePayload={decision:'release',quantity:releaseQuantity,policyVersion:'quality-release-v1',checklistSnapshot:{identityReviewed:true,documentationReviewed:true,inspectionReviewed:true,discrepanciesReviewed:true,expiryReviewed:true},evidence:{type:'manual_reference',reference:'quality:release-1'},decisionReason:'Receiving evidence and latest passing inspection reviewed.',internalLotNumber:'KF-REL-TEST-001',inventoryLocation:'Raw material stockroom',releaseDate:'2026-07-28',acknowledgeHoldResolution:false,totalAcquisitionCost:null,acquisitionCostCurrency:null,acquisitionCostSource:'unknown',acquisitionCostEvidence:{}}
    expect((await other.client.rpc('review_quarantined_inventory',{target_quarantine_intake_id:quarantineIntake.id,expected_intake_revision:1,candidate_idempotency_key:crypto.randomUUID(),review_payload:releasePayload})).error?.message).toContain('QUARANTINE_INTAKE_UNAVAILABLE')
    const released=await a.client.rpc('review_quarantined_inventory',{target_quarantine_intake_id:quarantineIntake.id,expected_intake_revision:1,candidate_idempotency_key:releaseKey,review_payload:releasePayload})
    expect(released.error).toBeNull()
    expect(released.data).toMatchObject({inventoryKind:'raw_material'})
    const repeatedRelease=await a.client.rpc('review_quarantined_inventory',{target_quarantine_intake_id:quarantineIntake.id,expected_intake_revision:1,candidate_idempotency_key:releaseKey,review_payload:releasePayload})
    expect(repeatedRelease.data).toEqual(released.data)
    expect((await a.client.rpc('review_quarantined_inventory',{target_quarantine_intake_id:quarantineIntake.id,expected_intake_revision:2,candidate_idempotency_key:releaseKey,review_payload:{...releasePayload,quantity:releaseQuantity+1}})).error?.message).toContain('QUALITY_REVIEW_RETRY_CONFLICT')
    expect((await a.client.from('inventory_lots').select('status,opening_quantity,total_acquisition_cost,quarantine_intake_id,quality_release_review_id').eq('id',released.data.inventoryLotId).single()).data).toMatchObject({status:'Active',opening_quantity:releaseQuantity,total_acquisition_cost:null,quarantine_intake_id:quarantineIntake.id,quality_release_review_id:released.data.reviewId})
    expect((await a.client.from('inventory_movements').select('type,quantity,reference_type,reference_id').eq('inventory_lot_id',released.data.inventoryLotId)).data).toEqual([{type:'Receipt',quantity:releaseQuantity,reference_type:'InventoryQualityReleaseReview',reference_id:released.data.reviewId}])
    expect((await a.client.from('inventory_quarantine_intakes').select('quarantine_status,released_quantity,rejected_quantity,revision').eq('id',quarantineIntake.id).single()).data).toMatchObject({quarantine_status:'partially_released',released_quantity:releaseQuantity,rejected_quantity:0,revision:2})
    const rejectPayload={decision:'reject',quantity:receivedQuantity-releaseQuantity,policyVersion:'quality-release-v1',checklistSnapshot:{ownerReviewed:true},evidence:{type:'manual_reference',reference:'quality:reject-remainder'},decisionReason:'Remainder rejected after partial release.'}
    expect((await a.client.rpc('review_quarantined_inventory',{target_quarantine_intake_id:quarantineIntake.id,expected_intake_revision:2,candidate_idempotency_key:crypto.randomUUID(),review_payload:rejectPayload})).error).toBeNull()
    expect((await a.client.from('inventory_quarantine_intakes').select('quarantine_status,released_quantity,rejected_quantity').eq('id',quarantineIntake.id).single()).data).toMatchObject({quarantine_status:'rejected',released_quantity:releaseQuantity,rejected_quantity:receivedQuantity-releaseQuantity})
    expect((await a.client.from('inventory_quality_release_reviews').select('decision,inventory_lot_id').eq('quarantine_intake_id',quarantineIntake.id).order('review_version')).data).toEqual([{decision:'release',inventory_lot_id:released.data.inventoryLotId},{decision:'reject',inventory_lot_id:null}])

    expect((await a.client.rpc('generate_production_procurement_scenarios',{target_round_id:roundId,expected_round_revision:roundRevision})).error).toBeNull();roundRevision++
    const scenarioBRecord=(await a.client.from('production_procurement_scenarios').select('*').eq('round_id',roundId).eq('strategy','balanced').neq('status','published').single()).data!
    expect((await a.client.rpc('publish_production_procurement_scenario',{target_scenario_id:scenarioBRecord.id,expected_scenario_revision:scenarioBRecord.revision,expected_round_revision:roundRevision})).error).toBeNull()
    const scenarioB=scenarioBRecord.id
    expect((await a.client.rpc('approve_production_procurement_scenario',{target_scenario_id:scenarioB,expected_scenario_revision:2,candidate_approval_key:crypto.randomUUID()})).error?.message).toContain('ACTIVE_PLAN_REQUIRES_EXPLICIT_SUPERSESSION')
    const approvedB=await a.client.rpc('approve_production_procurement_scenario',{target_scenario_id:scenarioB,expected_scenario_revision:2,candidate_approval_key:'44444444-4444-4444-8444-444444444444',target_replaces_plan_id:planAId})
    expect(approvedB.error).toBeNull()
    const planBId=approvedB.data as string
    expect((await a.client.from('purchase_plans').select('status,plan_version,superseded_by,source_scenario_id').eq('id',planAId).single()).data).toMatchObject({status:'superseded',plan_version:1,superseded_by:planBId,source_scenario_id:scenarioA})
    expect((await a.client.from('purchase_plans').select('status,plan_version,source_scenario_id').eq('id',planBId).single()).data).toMatchObject({status:'verification_required',plan_version:2,source_scenario_id:scenarioB})
    expect((await a.client.from('purchase_plan_verifications').select('id').eq('purchase_plan_id',planAId)).data!.length).toBeGreaterThan(0)
    expect((await a.client.rpc('mark_purchase_plan_checkout_ready',{target_plan_id:planAId,expected_verification_revision:currentPlanA.data!.verification_revision})).error?.message).toContain('PLAN_NOT_READY_ELIGIBLE')

    const planB=await a.client.from('purchase_plans').select('*').eq('id',planBId).single()
    expect((await a.client.rpc('cancel_internal_purchase_plan',{target_plan_id:planBId,expected_revision:0,candidate_cancellation_reason:'Stale cancellation revision'})).error?.message).toContain('STALE_PURCHASE_PLAN_REVISION')
    expect((await a.client.rpc('cancel_internal_purchase_plan',{target_plan_id:planBId,expected_revision:planB.data!.revision,candidate_cancellation_reason:'no'})).error?.message).toContain('CANCELLATION_REASON_REQUIRED')
    const orderId=crypto.randomUUID()
    await admin.from('purchase_orders').insert({...owned,id:orderId,supplier_id:supplierA,source_purchase_plan_id:planBId,source_purchase_plan_revision:planB.data!.revision,status:'draft',created_by:a.ownerId}).throwOnError()
    expect((await a.client.rpc('cancel_internal_purchase_plan',{target_plan_id:planBId,expected_revision:planB.data!.revision,candidate_cancellation_reason:'Plan no longer required'})).error?.message).toContain('PLAN_HAS_PURCHASE_ORDER')
    await admin.from('purchase_orders').delete().eq('id',orderId).throwOnError()
    expect((await a.client.rpc('cancel_internal_purchase_plan',{target_plan_id:planBId,expected_revision:planB.data!.revision,candidate_cancellation_reason:'Plan no longer required'})).error).toBeNull()
    const cancelledPlan=await a.client.from('purchase_plans').select('*').eq('id',planBId).single()
    expect(cancelledPlan.data).toMatchObject({status:'cancelled',plan_version:2,source_scenario_id:scenarioB})
    const cancelledCheck=(await a.client.from('purchase_plan_verifications').select('*').eq('purchase_plan_id',planBId).limit(1).single()).data!
    expect((await a.client.rpc('record_purchase_plan_verification',{target_verification_id:cancelledCheck.id,expected_revision:cancelledCheck.revision,candidate_state:'confirmed',candidate_verified_value:cancelledCheck.expected_value,candidate_unit_or_currency:'',candidate_method:'manual_owner_check',candidate_evidence:'',candidate_note:''})).error?.message).toContain('PLAN_NOT_MUTABLE')
    expect((await a.client.rpc('mark_purchase_plan_checkout_ready',{target_plan_id:planBId,expected_verification_revision:cancelledPlan.data!.verification_revision})).error?.message).toContain('PLAN_NOT_READY_ELIGIBLE')
    expect((await a.client.from('purchase_plan_baskets').select('id').eq('purchase_plan_id',planBId)).data).toHaveLength(2)
    expect((await a.client.from('purchase_plan_audit_events').select('event_type').eq('purchase_plan_id',planBId)).data?.some((row:{event_type:string})=>row.event_type==='plan_cancelled')).toBe(true)
    expect((await a.client.from('purchase_orders').select('id').eq('source_purchase_plan_id',planBId)).data).toEqual([])
  },20000)
})
