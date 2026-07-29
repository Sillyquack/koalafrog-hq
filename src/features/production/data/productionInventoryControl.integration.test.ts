import {createClient,type SupabaseClient} from'@supabase/supabase-js'
import{afterAll,beforeAll,describe,expect,it}from'vitest'

const url=import.meta.env.VITE_SUPABASE_TEST_URL as string|undefined
const serviceKey=import.meta.env.VITE_SUPABASE_TEST_SERVICE_ROLE_KEY as string|undefined
const anonKey=import.meta.env.VITE_SUPABASE_TEST_ANON_KEY as string|undefined
const run=url&&serviceKey&&anonKey?describe:describe.skip

run('Production Inventory Control against local Supabase',()=>{
 let admin:SupabaseClient
 const users:string[]=[]
 beforeAll(()=>{admin=createClient(url!,serviceKey!,{auth:{persistSession:false}})})
 afterAll(async()=>{for(const id of users)await admin.auth.admin.deleteUser(id)})
 const owner=async(label:string)=>{const email=`inventory-control-${label}-${crypto.randomUUID()}@example.test`,password=`Local-${crypto.randomUUID()}-9a!`,created=await admin.auth.admin.createUser({email,password,email_confirm:true});if(created.error)throw created.error;users.push(created.data.user.id);const client=createClient(url!,anonKey!,{auth:{persistSession:false}}) as SupabaseClient;const signed=await client.auth.signInWithPassword({email,password});if(signed.error)throw signed.error;const workspace=await client.rpc('create_clean_workspace');if(workspace.error)throw workspace.error;return{client,ownerId:created.data.user.id,workspaceId:String(workspace.data)}}
 const fixture=async(label:string)=>{
  const a=await owner(label),now='2026-07-28T10:00:00.000Z',owned={workspace_id:a.workspaceId,owner_id:a.ownerId}
  expect((await a.client.from('ingredients').insert({...owned,id:`ingredient-${label}`,common_name:'Stable Oil',inci_name:'SIMMONDSIA CHINENSIS SEED OIL',category:'Oil',functions:['Emollient'],description:'',default_unit:'g',notes:'',status:'Active',created_at:now,updated_at:now})).error).toBeNull()
  expect((await a.client.from('products').insert({...owned,id:`product-${label}`,name:'Stable Product',category:'beard_oil',status:'Active',development_stage:'Formulation',description:'',scent_profile:'',created_at:now,updated_at:now})).error).toBeNull()
  expect((await a.client.from('formulas').insert({...owned,id:`formula-${label}`,product_id:`product-${label}`,name:'Stable Formula',description:'',created_at:now,updated_at:now})).error).toBeNull()
  expect((await a.client.from('formula_versions').insert({...owned,id:`version-${label}`,formula_id:`formula-${label}`,version:'1.0',status:'Approved',description:'',target_characteristics:'',phase_definitions:[],manufacturing_process:[],created_at:now,updated_at:now})).error).toBeNull()
  expect((await a.client.from('formula_lines').insert({...owned,id:`formula-line-${label}`,formula_version_id:`version-${label}`,ingredient_id:`ingredient-${label}`,percentage:100,phase:'A',sort_order:1,notes:'Add slowly',formulation_role:'emollient'})).error).toBeNull()
  expect((await a.client.from('production_runs').insert({...owned,id:`run-${label}`,production_run_number:`PR-${label}`,product_id:`product-${label}`,formula_id:`formula-${label}`,formula_version_id:`version-${label}`,status:'In Progress',planned_batch_size:100,planned_batch_unit:'g',actual_yield:99,actual_yield_unit:'g',created_at:now,updated_at:now,purpose:'Test',notes:'',summary:''})).error).toBeNull()
  expect((await a.client.from('production_run_lines').insert({...owned,id:`run-line-${label}`,production_run_id:`run-${label}`,formula_line_id:`formula-line-${label}`,ingredient_id:`ingredient-${label}`,ingredient_name_snapshot:'Stable Oil',phase:'A',planned_percentage:100,planned_quantity:100,actual_quantity:100,unit:'g',notes:'',status:'Weighed',formula_id_snapshot:`formula-${label}`,formula_version_id_snapshot:`version-${label}`,inci_snapshot:'SIMMONDSIA CHINENSIS SEED OIL',functions_snapshot:['Emollient'],sort_order_snapshot:1,processing_instructions_snapshot:'Add slowly'})).error).toBeNull()
  for(const [suffix,quantity,expiry]of[['a',60,'2026-10-01'],['b',60,'2026-12-01']]as const){expect((await admin.from('inventory_lots').insert({...owned,id:`lot-${label}-${suffix}`,ingredient_id:`ingredient-${label}`,internal_lot_number:`LOT-${label}-${suffix}`,received_date:'2026-07-01',opening_quantity:quantity,unit:'g',expiry_date:expiry,location:'Lab',status:'Active',released_at:now,notes:'',total_acquisition_cost:quantity*2,acquisition_cost_currency:'NOK',cost_notes:'Final receipt cost',created_at:now,updated_at:now})).error).toBeNull();expect((await admin.from('inventory_movements').insert({...owned,id:`receipt-${label}-${suffix}`,inventory_lot_id:`lot-${label}-${suffix}`,type:'Receipt',quantity,unit:'g',reason:'Released receipt',notes:'',occurred_at:now,created_at:now})).error).toBeNull()}
  return{...a,label}
 }
 it('reserves with FEFO, prevents oversubscription, weighs, consumes, wastes, releases, and reconciles exactly',async()=>{
  const a=await fixture('flow')
  const eligible=await a.client.rpc('eligible_batch_material_lots',{target_batch_kind:'production',target_batch_id:'run-flow',target_requirement_id:'run-line-flow'})
  expect(eligible.error).toBeNull();expect(eligible.data?.map((x:{inventory_lot_id:string})=>x.inventory_lot_id)).toEqual(['lot-flow-a','lot-flow-b'])
  const key=crypto.randomUUID(),args={target_batch_kind:'production',target_batch_id:'run-flow',target_requirement_id:'run-line-flow',target_inventory_lot_id:'lot-flow-a',reservation_quantity:60,reservation_unit:'g',allocation_method:'fefo',expected_batch_revision:1,candidate_idempotency_key:key}
  const reserved=await a.client.rpc('reserve_batch_material_inventory',args);expect(reserved.error).toBeNull()
  const retry=await a.client.rpc('reserve_batch_material_inventory',args);expect(retry.data).toMatchObject({reservationId:reserved.data.reservationId,retry:true})
  expect((await a.client.rpc('reserve_batch_material_inventory',{...args,reservation_quantity:59})).error?.message).toContain('IDEMPOTENCY_CONFLICT')
  const second=await a.client.rpc('reserve_batch_material_inventory',{...args,target_inventory_lot_id:'lot-flow-b',reservation_quantity:40,expected_batch_revision:2,candidate_idempotency_key:crypto.randomUUID()});expect(second.error).toBeNull()
  expect((await a.client.rpc('eligible_batch_material_lots',{target_batch_kind:'production',target_batch_id:'run-flow',target_requirement_id:'run-line-flow'})).data?.map((x:{available_balance:number|string})=>Number(x.available_balance))).toEqual([20])
  const readinessBefore=await a.client.rpc('get_batch_material_completion_readiness_v1',{target_batch_kind:'production',target_batch_id:'run-flow'})
  expect(readinessBefore.error).toBeNull();expect(readinessBefore.data).toMatchObject({readyForCompletion:false,missingPlannedWeighings:1,missingActualWeighings:1})
  const plannedKey=crypto.randomUUID(),plannedArgs={target_reservation_id:reserved.data.reservationId,expected_reservation_revision:1,record_type:'planned',weighing_quantity:60,weighing_unit:'g',planned_sequence:1,planned_container:'Stainless vessel A',equipment_reference:'scale-1',evidence_reference:'plan-card-1',operator_note:'Stage first',candidate_idempotency_key:plannedKey}
  const planned=await a.client.rpc('record_batch_material_weighing_v2',plannedArgs);expect(planned.error).toBeNull()
  expect((await a.client.rpc('record_batch_material_weighing_v2',plannedArgs)).data).toMatchObject({weighingId:planned.data.weighingId,retry:true})
  expect((await a.client.rpc('record_batch_material_weighing_v2',{...plannedArgs,planned_sequence:2})).error?.message).toContain('IDEMPOTENCY_CONFLICT')
  expect((await a.client.from('batch_material_weighings').select('planned_sequence,planned_container').eq('id',planned.data.weighingId).single()).data).toEqual({planned_sequence:1,planned_container:'Stainless vessel A'})
  const weighing=await a.client.rpc('record_batch_material_weighing',{target_reservation_id:reserved.data.reservationId,expected_reservation_revision:1,record_type:'actual',weighing_quantity:60,weighing_unit:'g',equipment_reference:'scale-1',evidence_reference:'weight-photo-1',operator_note:'Observed',candidate_idempotency_key:crypto.randomUUID()});expect(weighing.error).toBeNull()
  const consumed=await a.client.rpc('consume_reserved_batch_material',{target_reservation_id:reserved.data.reservationId,expected_reservation_revision:1,target_weighing_id:weighing.data.weighingId,productive_quantity:59,waste_quantity:1,consumption_unit:'g',waste_category:'container_residue',reason:'Batch charge',evidence_reference:'weight-photo-1',candidate_idempotency_key:crypto.randomUUID()});expect(consumed.error).toBeNull()
  const returned=await a.client.rpc('record_batch_material_return',{target_reservation_id:reserved.data.reservationId,expected_reservation_revision:2,target_weighing_id:weighing.data.weighingId,original_consumption_id:consumed.data.consumptionId,return_quantity:1,return_unit:'g',return_kind:'physical_return_after_consumption',condition_assessment:'Clean, continuously controlled staging vessel',reason:'Unused charged material recovered before mixing',evidence_reference:'return-photo-1',candidate_idempotency_key:crypto.randomUUID()});expect(returned.error).toBeNull()
  expect((await a.client.from('inventory_movements').select('type,quantity').eq('inventory_lot_id','lot-flow-a').order('type')).data).toEqual([{type:'Adjustment',quantity:1},{type:'Consumption',quantity:59},{type:'Receipt',quantity:60},{type:'Waste',quantity:1}])
  const release=await a.client.rpc('release_batch_material_reservation',{target_reservation_id:second.data.reservationId,expected_reservation_revision:1,release_quantity:40,release_reason:'Unused after split weighing',candidate_idempotency_key:crypto.randomUUID()});expect(release.error).toBeNull()
  const secondWeigh=await a.client.rpc('record_batch_material_weighing',{target_reservation_id:second.data.reservationId,expected_reservation_revision:2,record_type:'actual',weighing_quantity:1,weighing_unit:'g',equipment_reference:'scale-1',evidence_reference:'none',operator_note:'',candidate_idempotency_key:crypto.randomUUID()});expect(secondWeigh.error).not.toBeNull()
  const reconciled=await a.client.rpc('reconcile_batch_material_requirement',{target_batch_kind:'production',target_batch_id:'run-flow',target_requirement_id:'run-line-flow',variance_reason:'',variance_evidence:'',variance_approval_state:'documented',candidate_idempotency_key:crypto.randomUUID()})
  expect(reconciled.error).toBeNull();expect(reconciled.data).toMatchObject({state:'reconciled',unexplainedVariance:0})
  const readinessAfter=await a.client.rpc('get_batch_material_completion_readiness_v1',{target_batch_kind:'production',target_batch_id:'run-flow'})
  expect(readinessAfter.error).toBeNull();expect(readinessAfter.data).toMatchObject({readyForCompletion:true,activeReservations:0,reconciledRequirements:1})
  const provenance=await a.client.rpc('get_batch_material_provenance_v1',{target_batch_kind:'production',target_batch_id:'run-flow',target_requirement_id:'run-line-flow'})
  expect(provenance.error).toBeNull();expect(provenance.data.nodes.map((node:{nodeType:string})=>node.nodeType)).toEqual(expect.arrayContaining(['formula_version','batch_material_requirement','lot_allocation','inventory_reservation','planned_weighing','actual_weighing','productive_consumption','inventory_movement','inventory_lot']))
  expect((await a.client.from('ingredients').update({common_name:'Renamed current Oil'}).eq('id','ingredient-flow')).error).toBeNull()
  const historical=await a.client.rpc('get_batch_material_provenance_v1',{target_batch_kind:'production',target_batch_id:'run-flow',target_requirement_id:'run-line-flow'})
  expect(historical.error).toBeNull();expect(historical.data.nodes.find((node:{nodeType:string})=>node.nodeType==='batch_material_requirement')).toMatchObject({historicalLabel:'Stable Oil',currentMasterDiffers:true})
  expect((await a.client.from('production_runs').update({status:'Completed'}).eq('id','run-flow')).error).toBeNull()
  expect((await a.client.from('batch_material_consumptions').select('total_cost_snapshot,cost_currency_snapshot,quality_release_review_id').single()).data).toMatchObject({total_cost_snapshot:118,cost_currency_snapshot:'NOK',quality_release_review_id:null})
  expect((await a.client.from('batch_material_events').insert({workspace_id:a.workspaceId,owner_id:a.ownerId,batch_kind:'production',batch_id:'run-flow',formula_version_id:'version-flow',event_type:'batch_material_consumed',actor_id:a.ownerId,event_key:'forged'})).error).not.toBeNull()
 })
 it('gives one deterministic winner for the last available quantity',async()=>{
  const a=await fixture('race'),first=crypto.randomUUID(),second=crypto.randomUUID(),base={target_batch_kind:'production',target_batch_id:'run-race',target_requirement_id:'run-line-race',target_inventory_lot_id:'lot-race-a',reservation_quantity:60,reservation_unit:'g',allocation_method:'manual',expected_batch_revision:1}
  const results=await Promise.all([a.client.rpc('reserve_batch_material_inventory',{...base,candidate_idempotency_key:first}),a.client.rpc('reserve_batch_material_inventory',{...base,candidate_idempotency_key:second})])
  expect(results.filter(result=>!result.error)).toHaveLength(1);expect(results.filter(result=>result.error)[0].error?.message).toMatch(/STALE_BATCH_REVISION|INSUFFICIENT_AVAILABLE_INVENTORY/)
  expect((await a.client.from('inventory_reservations').select('id').eq('batch_id','run-race')).data).toHaveLength(1)
 })
 it('denies anonymous, cross-owner, and direct lifecycle writes',async()=>{
  const a=await fixture('security'),b=await owner('security-other'),anonymous=createClient(url!,anonKey!,{auth:{persistSession:false}})
  const args={target_batch_kind:'production',target_batch_id:'run-security',target_requirement_id:'run-line-security',target_inventory_lot_id:'lot-security-a',reservation_quantity:1,reservation_unit:'g',allocation_method:'manual',expected_batch_revision:1,candidate_idempotency_key:crypto.randomUUID()}
  expect((await anonymous.rpc('reserve_batch_material_inventory',args)).error).not.toBeNull()
  expect((await b.client.rpc('reserve_batch_material_inventory',args)).error).not.toBeNull()
  expect((await anonymous.rpc('get_batch_material_completion_readiness_v1',{target_batch_kind:'production',target_batch_id:'run-security'})).error).not.toBeNull()
  expect((await anonymous.rpc('get_batch_material_provenance_v1',{target_batch_kind:'production',target_batch_id:'run-security',target_requirement_id:'run-line-security'})).error).not.toBeNull()
  expect((await b.client.rpc('get_batch_material_completion_readiness_v1',{target_batch_kind:'production',target_batch_id:'run-security'})).error).not.toBeNull()
  expect((await b.client.rpc('get_batch_material_provenance_v1',{target_batch_kind:'production',target_batch_id:'run-security',target_requirement_id:'run-line-security'})).error).not.toBeNull()
  expect((await a.client.from('inventory_reservations').insert({workspace_id:a.workspaceId,owner_id:a.ownerId,allocation_id:crypto.randomUUID(),inventory_lot_id:'lot-security-a',batch_kind:'production',batch_id:'run-security',requirement_id:'run-line-security',reserved_quantity:1,unit:'g',normalized_quantity:1,remaining_quantity:1,reserved_by:a.ownerId,idempotency_key:crypto.randomUUID(),payload_fingerprint:'forged'})).error).not.toBeNull()
  expect((await a.client.from('batch_material_consumptions').insert({})).error).not.toBeNull()
  expect((await a.client.from('inventory_lots').insert({...({workspace_id:a.workspaceId,owner_id:a.ownerId}),id:'forged-released-lot',ingredient_id:'ingredient-security',internal_lot_number:'FORGED-RELEASED',received_date:'2026-07-28',opening_quantity:1,unit:'g',location:'Lab',status:'Active',released_at:'2026-07-28T10:00:00Z',notes:'',created_at:'2026-07-28T10:00:00Z',updated_at:'2026-07-28T10:00:00Z'})).error?.message).toContain('CONTROLLED_INVENTORY_LOT_FIELDS_REQUIRE_RPC')
 })
})
