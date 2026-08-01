/* eslint-disable @typescript-eslint/no-explicit-any -- local migration additions precede generated type refresh */
import{createClient}from'@supabase/supabase-js'
import{afterAll,beforeAll,describe,expect,it}from'vitest'
import{supabase}from'../../../platform/supabase/client'
import type{Database}from'../../../platform/supabase/generated/database.types'
import type{SupplierCreateInput,SupplierOfferCreateInput}from'../domain/procurement'
import{createOffer,createRecommendation,createRequest,createRequestedItem,createSupplier,importOffers,loadProcurement}from'./procurementRepository'

const url=import.meta.env.VITE_SUPABASE_TEST_URL as string|undefined
const serviceKey=import.meta.env.VITE_SUPABASE_TEST_SERVICE_ROLE_KEY as string|undefined
const anonKey=import.meta.env.VITE_SUPABASE_TEST_ANON_KEY as string|undefined
const run=url&&serviceKey&&anonKey&&supabase?describe:describe.skip

run('Procurement commercial provenance authoring against local Supabase',()=>{
 const createdUsers:string[]=[]
 let admin:ReturnType<typeof createClient<Database>>
 let ownerEmail='',ownerPassword='',ownerId='',workspaceId='',supplierId='',itemId='',rawSourceId='',packagingSourceId=''
 const now='2026-08-01T08:00:00.000Z'
 const supplierInput:SupplierCreateInput={legal_name:'Avery Norway',trading_name:null,supplier_type:'printing',status:'research',website_url:'https://www.avery.no',country_code:'NO',default_currency:'NOK',verification_state:'unknown',internal_notes:'',is_preferred:false}

 beforeAll(async()=>{
  admin=createClient<Database>(url!,serviceKey!,{auth:{persistSession:false}})
  ownerEmail=`commercial-provenance-${crypto.randomUUID()}@example.test`
  ownerPassword=`Local-${crypto.randomUUID()}-9a!`
  const created=await admin.auth.admin.createUser({email:ownerEmail,password:ownerPassword,email_confirm:true})
  if(created.error)throw created.error
  ownerId=created.data.user.id;createdUsers.push(ownerId)
  const signedIn=await supabase!.auth.signInWithPassword({email:ownerEmail,password:ownerPassword})
  if(signedIn.error)throw signedIn.error
  const workspace=await supabase!.rpc('create_clean_workspace')
  if(workspace.error)throw workspace.error
  workspaceId=workspace.data
 })

 afterAll(async()=>{
  await supabase!.auth.signOut()
  for(const id of createdUsers)await admin.auth.admin.deleteUser(id)
 })

 it('creates the complete printing Supplier once, confirms readback, and classifies duplicate identity',async()=>{
  const result=await createSupplier(workspaceId,supplierInput)
  expect(result.state).toBe('confirmed')
  if(result.state!=='confirmed')throw new Error('Expected confirmed Supplier creation.')
  supplierId=result.supplier.id
  expect(result.receipt).toMatchObject({entityType:'supplier',recordId:supplierId,workspaceId,operation:'created',naturalIdentity:{legal_name:'Avery Norway',supplier_type:'printing',country_code:'NO'}})
  expect(result.supplier).toMatchObject({...supplierInput,revision:1})
  const persisted=await supabase!.from('suppliers').select('legal_name,trading_name,supplier_type,status,website_url,country_code,default_currency,verification_state,internal_notes,is_preferred,revision').eq('id',supplierId).single()
  expect(persisted.error).toBeNull()
  expect(persisted.data).toEqual({...supplierInput,revision:1})
  expect((await supabase!.from('suppliers').select('id',{count:'exact',head:true}).eq('id',supplierId)).count).toBe(1)

  const exact=await createSupplier(workspaceId,supplierInput)
  expect(exact).toMatchObject({state:'rejected_duplicate',existingId:supplierId})
  const conflict=await createSupplier(workspaceId,{...supplierInput,website_url:'https://commercial-conflict.example.test'})
  expect(conflict).toMatchObject({state:'ambiguous_conflict',candidateIds:[supplierId]})
  expect((await supabase!.from('suppliers').select('id',{count:'exact',head:true}).eq('workspace_id',workspaceId).eq('legal_name','Avery Norway')).count).toBe(1)
  await expect(createSupplier(workspaceId,{...supplierInput,website_url:'avery.no'})).rejects.toThrow(/absolute http or https/i)
 })

 it('creates raw and packaging linked Offers, a manual Offer, Recommendation, and source-aware CSV imports with no operational side effects',async()=>{
  const owned={workspace_id:workspaceId,owner_id:ownerId}
  const suffix=crypto.randomUUID()
  const ingredientId=`ingredient-${suffix}`,packagingComponentId=`packaging-${suffix}`
  rawSourceId=`raw-source-${suffix}`;packagingSourceId=`pack-source-${suffix}`
  const ingredient=await supabase!.from('ingredients').insert({...owned,id:ingredientId,common_name:'Commercial Jojoba',inci_name:'SIMMONDSIA CHINENSIS SEED OIL',category:'Carrier oil',functions:['Emollient'],description:'Commercial provenance fixture',default_unit:'g',notes:'',status:'Active',created_at:now,updated_at:now})
  if(ingredient.error)throw ingredient.error
  const raw=await supabase!.from('supplier_products').insert({...owned,id:rawSourceId,ingredient_id:ingredientId,supplier_id:supplierId,supplier_name:'Avery Norway',product_name:'Jojoba Oil 1 kg',supplier_sku:'RAW-1KG',package_quantity:1,package_unit:'kg',price:245,currency:'NOK',product_url:'https://example.test/raw',notes:'',is_preferred:false,lifecycle_status:'available',price_state:'recorded',product_status:'verified_operational',discontinued:false,created_at:now,updated_at:now})
  if(raw.error)throw raw.error
  const component=await supabase!.from('packaging_components').insert({...owned,id:packagingComponentId,name:'Printed label roll',category:'label',description:null,default_unit:'pcs',notes:null,status:'selected',ownership_state:'not_owned',stock_state:'none',created_at:now,updated_at:now})
  if(component.error)throw component.error
  const packaging=await supabase!.from('packaging_supplier_products').insert({...owned,id:packagingSourceId,packaging_component_id:packagingComponentId,supplier_id:supplierId,supplier_name:'Avery Norway',product_name:'Waterproof label roll',supplier_sku:'LBL-100',package_quantity:100,package_unit:'pcs',price:299,currency:'NOK',product_url:'https://example.test/labels',notes:'',is_preferred:false,lifecycle_status:'available',price_state:'recorded',discontinued:false,created_at:now,updated_at:now})
  if(packaging.error)throw packaging.error

  const requestReceipt=await createRequest(workspaceId,{title:'Commercial provenance request',status:'researching',category:'raw_material',priority:'normal',needed_by:null,notes:''})
  const itemReceipt=await createRequestedItem(workspaceId,{procurement_request_id:requestReceipt.recordId,name:'Commercial evidence item',category:'raw_material',requirement_type:'raw_material',reason:null,status:'researching',requested_quantity:1,unit:'kg',package_preference:null,target_supplier_id:supplierId,target_supplier_product_domain:'raw_material',target_supplier_product_id:rawSourceId,decision_notes:null,sourcing_notes:null,intended_product_ids:[],intended_formula_ids:[],required_specifications:[],acceptable_substitutes:[],priority:'normal',needed_by:null,notes:'',display_order:0})
  itemId=itemReceipt.recordId
  const countsBefore=await Promise.all([
   supabase!.from('inventory_lots').select('id',{count:'exact',head:true}).eq('owner_id',ownerId),
   supabase!.from('inventory_movements').select('id',{count:'exact',head:true}).eq('owner_id',ownerId),
   supabase!.from('packaging_inventory_lots').select('id',{count:'exact',head:true}).eq('owner_id',ownerId),
   supabase!.from('packaging_inventory_movements').select('id',{count:'exact',head:true}).eq('owner_id',ownerId),
   supabase!.from('purchase_orders').select('id',{count:'exact',head:true}).eq('owner_id',ownerId),
   supabase!.from('purchase_order_receipts').select('id',{count:'exact',head:true}).eq('owner_id',ownerId),
  ])
  for(const result of countsBefore)expect(result.error).toBeNull()
  const base:Omit<SupplierOfferCreateInput,'source_supplier_product_domain'|'source_supplier_product_id'>={requested_item_id:itemId,supplier_id:supplierId,product_title:'Jojoba Oil current snapshot',product_url:'https://example.test/raw',country_code:'NO',package_quantity:1,package_unit:'kg',item_price:250,currency:'NOK',moq:1,shipping_cost:null,tax_duty_estimate:null,delivery_estimate_days:5,stock_status:'in_stock',coa_availability:'available',sds_availability:'available',technical_document_availability:'partial',certification_claims:[],first_order_discount:null,notes:'Dated research observation',date_checked:'2026-08-01',confidence:'high'}
  const rawResult=await createOffer(workspaceId,{...base,source_supplier_product_domain:'raw_material',source_supplier_product_id:rawSourceId})
  expect(rawResult.receipt).toMatchObject({recordId:rawResult.offer.id,parent:{entityType:'procurement_requested_item',recordId:itemId},supplierId,sourceSupplierProductDomain:'raw_material',sourceSupplierProductId:rawSourceId})
  expect(rawResult.offer).toMatchObject({source_supplier_product_domain:'raw_material',source_supplier_product_id:rawSourceId,supplier_id:supplierId,item_price:250})

  const packagingResult=await createOffer(workspaceId,{...base,product_title:'Waterproof label observation',product_url:'https://example.test/labels',package_quantity:100,package_unit:'pcs',item_price:305,source_supplier_product_domain:'packaging',source_supplier_product_id:packagingSourceId})
  expect(packagingResult.offer).toMatchObject({source_supplier_product_domain:'packaging',source_supplier_product_id:packagingSourceId,supplier_id:supplierId})
  const manualResult=await createOffer(workspaceId,{...base,product_title:'Manual market observation',source_supplier_product_domain:null,source_supplier_product_id:null})
  expect(manualResult.receipt).toMatchObject({sourceSupplierProductDomain:null,sourceSupplierProductId:null})

  const recommendation=await createRecommendation(workspaceId,{procurement_request_id:requestReceipt.recordId,requested_item_id:itemId,supplier_offer_id:rawResult.offer.id,summary:'Use linked source evidence',rationale:'Canonical identity and dated snapshot agree.',recommended_purchase_quantity:1,status:'recommended'})
  expect(recommendation.supplier_offer_id).toBe(rawResult.offer.id)

  const imported=await importOffers(workspaceId,[
   {...base,product_title:'CSV linked observation',source_supplier_product_domain:'raw_material',source_supplier_product_id:rawSourceId},
   {...base,product_title:'Legacy CSV manual observation',source_supplier_product_domain:null,source_supplier_product_id:null},
  ])
  expect(imported).toHaveLength(2)
  expect(imported.find(item=>item.product_title==='CSV linked observation')).toMatchObject({source_supplier_product_domain:'raw_material',source_supplier_product_id:rawSourceId})
  expect(imported.find(item=>item.product_title==='Legacy CSV manual observation')).toMatchObject({source_supplier_product_domain:null,source_supplier_product_id:null})

  const hydrated=await loadProcurement(workspaceId)
  expect(hydrated.supplierProductSources.map(source=>`${source.domain}:${source.id}`)).toEqual(expect.arrayContaining([`raw_material:${rawSourceId}`,`packaging:${packagingSourceId}`]))
  expect(hydrated.offers.find(item=>item.id===rawResult.offer.id)).toMatchObject({source_supplier_product_domain:'raw_material',source_supplier_product_id:rawSourceId})
  expect(hydrated.recommendations.find(item=>item.id===recommendation.id)?.supplier_offer_id).toBe(rawResult.offer.id)

  await supabase!.auth.signOut()
  expect((await supabase!.auth.signInWithPassword({email:ownerEmail,password:ownerPassword})).error).toBeNull()
  const reloaded=await loadProcurement(workspaceId)
  expect(reloaded.offers.find(item=>item.id===packagingResult.offer.id)?.source_supplier_product_id).toBe(packagingSourceId)

  const countsAfter=await Promise.all([
   supabase!.from('inventory_lots').select('id',{count:'exact',head:true}).eq('owner_id',ownerId),
   supabase!.from('inventory_movements').select('id',{count:'exact',head:true}).eq('owner_id',ownerId),
   supabase!.from('packaging_inventory_lots').select('id',{count:'exact',head:true}).eq('owner_id',ownerId),
   supabase!.from('packaging_inventory_movements').select('id',{count:'exact',head:true}).eq('owner_id',ownerId),
   supabase!.from('purchase_orders').select('id',{count:'exact',head:true}).eq('owner_id',ownerId),
   supabase!.from('purchase_order_receipts').select('id',{count:'exact',head:true}).eq('owner_id',ownerId),
  ])
  for(const result of countsAfter)expect(result.error).toBeNull()
  expect(countsAfter.map(result=>result.count)).toEqual(countsBefore.map(result=>result.count))
 })

 it('denies one-sided, wrong-domain, Supplier-mismatched, stale, unusable, and cross-workspace sources',async()=>{
  const base:SupplierOfferCreateInput={requested_item_id:itemId,supplier_id:supplierId,source_supplier_product_domain:'raw_material',source_supplier_product_id:rawSourceId,product_title:'Negative source case',product_url:'https://example.test/negative',country_code:'NO',package_quantity:1,package_unit:'kg',item_price:250,currency:'NOK',moq:null,shipping_cost:null,tax_duty_estimate:null,delivery_estimate_days:null,stock_status:'unknown',coa_availability:'unknown',sds_availability:'unknown',technical_document_availability:'unknown',certification_claims:[],first_order_discount:null,notes:'',date_checked:'2026-08-01',confidence:'unknown'}
  await expect(createOffer(workspaceId,{...base,source_supplier_product_id:null} as unknown as SupplierOfferCreateInput)).rejects.toThrow(/recorded together/i)
  await expect(createOffer(workspaceId,{...base,source_supplier_product_domain:'packaging'})).rejects.toThrow(/stale or unavailable/i)

  const secondSupplier=await createSupplier(workspaceId,{legal_name:'Distinct Supplier AS',trading_name:null,supplier_type:'raw_material',status:'research',website_url:null,country_code:'NO',default_currency:'NOK',verification_state:'unknown',internal_notes:'',is_preferred:false})
  if(secondSupplier.state!=='confirmed')throw new Error('Expected second Supplier creation.')
  await expect(createOffer(workspaceId,{...base,supplier_id:secondSupplier.supplier.id})).rejects.toThrow(/different Supplier/i)

  const staleId=`stale-${crypto.randomUUID()}`
  const owned={workspace_id:workspaceId,owner_id:ownerId}
  const raw=await supabase!.from('supplier_products').select('ingredient_id').eq('id',rawSourceId).single()
  if(raw.error)throw raw.error
  const stale=await supabase!.from('supplier_products').insert({...owned,id:staleId,ingredient_id:raw.data.ingredient_id,supplier_id:supplierId,supplier_name:'Avery Norway',product_name:'Deleted source',package_quantity:1,package_unit:'kg',price:100,currency:'NOK',notes:'',is_preferred:false,lifecycle_status:'candidate',price_state:'recorded',product_status:'research',discontinued:false,created_at:now,updated_at:now})
  if(stale.error)throw stale.error
  expect((await supabase!.from('supplier_products').delete().eq('id',staleId)).error).toBeNull()
  await expect(createOffer(workspaceId,{...base,source_supplier_product_id:staleId})).rejects.toThrow(/stale or unavailable/i)

  const unusableId=`unusable-${crypto.randomUUID()}`
  const unusable=await supabase!.from('supplier_products').insert({...owned,id:unusableId,ingredient_id:raw.data.ingredient_id,supplier_id:supplierId,supplier_name:'Avery Norway',product_name:'Rejected source',package_quantity:1,package_unit:'kg',price:null,currency:null,notes:'',is_preferred:false,lifecycle_status:'rejected',price_state:'unknown',product_status:'inactive',discontinued:false,created_at:now,updated_at:now})
  if(unusable.error)throw unusable.error
  await expect(createOffer(workspaceId,{...base,source_supplier_product_id:unusableId})).rejects.toThrow(/discontinued, rejected, inactive/i)

  const oneSided=await (supabase as any).from('procurement_supplier_offers').insert({...owned,...base,source_supplier_product_domain:'raw_material',source_supplier_product_id:null})
  expect(oneSided.error?.message).toMatch(/source_pair|check constraint/i)
  const reassignment=await supabase!.from('supplier_products').update({supplier_id:secondSupplier.supplier.id}).eq('id',rawSourceId)
  expect(reassignment.error).not.toBeNull()
  const deletion=await supabase!.from('supplier_products').delete().eq('id',rawSourceId)
  expect(deletion.error).not.toBeNull()

  const otherEmail=`commercial-other-${crypto.randomUUID()}@example.test`,otherPassword=`Local-${crypto.randomUUID()}-9a!`
  const created=await admin.auth.admin.createUser({email:otherEmail,password:otherPassword,email_confirm:true})
  if(created.error)throw created.error
  createdUsers.push(created.data.user.id)
  const other=createClient<Database>(url!,anonKey!,{auth:{persistSession:false}})
  expect((await other.auth.signInWithPassword({email:otherEmail,password:otherPassword})).error).toBeNull()
  const otherWorkspace=await other.rpc('create_clean_workspace')
  if(otherWorkspace.error)throw otherWorkspace.error
  const otherSupplier=await other.from('suppliers').insert({workspace_id:otherWorkspace.data,owner_id:created.data.user.id,legal_name:'Foreign Supplier',supplier_type:'raw_material',status:'research'}).select('id').single()
  if(otherSupplier.error)throw otherSupplier.error
  const otherIngredientId=`foreign-ingredient-${crypto.randomUUID()}`,otherSourceId=`foreign-source-${crypto.randomUUID()}`
  expect((await other.from('ingredients').insert({workspace_id:otherWorkspace.data,owner_id:created.data.user.id,id:otherIngredientId,common_name:'Foreign oil',inci_name:'FOREIGN OIL',category:'Oil',functions:[],description:'',default_unit:'g',notes:'',status:'Research',created_at:now,updated_at:now})).error).toBeNull()
  expect((await other.from('supplier_products').insert({workspace_id:otherWorkspace.data,owner_id:created.data.user.id,id:otherSourceId,ingredient_id:otherIngredientId,supplier_id:otherSupplier.data.id,supplier_name:'Foreign Supplier',product_name:'Foreign oil',package_quantity:1,package_unit:'kg',price:10,currency:'NOK',notes:'',is_preferred:false,lifecycle_status:'candidate',price_state:'recorded',product_status:'research',discontinued:false,created_at:now,updated_at:now})).error).toBeNull()
  await expect(createOffer(workspaceId,{...base,source_supplier_product_id:otherSourceId})).rejects.toThrow(/stale or unavailable/i)
  await expect(createSupplier(otherWorkspace.data,supplierInput)).rejects.toThrow(/active owner workspace/i)
 })
})
