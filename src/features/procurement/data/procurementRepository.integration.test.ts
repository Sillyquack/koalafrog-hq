/* eslint-disable @typescript-eslint/no-explicit-any -- local migration tables precede generated type refresh */
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { supabase } from '../../../platform/supabase/client'
import type { Database } from '../../../platform/supabase/generated/database.types'
import { executeWorkspaceAction } from '../../../platform/actions/workspaceActionExecutor'
import { SupabaseWorkspaceRepository } from '../../../platform/repository/supabaseWorkspaceRepository'
import { compareQuotes, quoteArithmetic } from '../domain/procurement'
import { createContact, createPurchaseOrderFromPlan, createQuote, createSupplierDocument, createSupplierEvent, linkSupplierProduct, loadProcurement, recordPurchaseOrderPlacement, updateRecord } from './procurementRepository'

const url = import.meta.env.VITE_SUPABASE_TEST_URL as string | undefined
const serviceKey = import.meta.env.VITE_SUPABASE_TEST_SERVICE_ROLE_KEY as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_TEST_ANON_KEY as string | undefined
const run = url && serviceKey && supabase ? describe : describe.skip

run('Procurement production hydration against local Supabase', () => {
  const createdUsers: string[] = []
  let admin: ReturnType<typeof createClient<Database>>

  beforeAll(() => { admin = createClient<Database>(url!, serviceKey!, { auth: { persistSession: false } }) })
  afterAll(async () => {
    await supabase!.auth.signOut()
    for (const id of createdUsers) await admin.auth.admin.deleteUser(id)
  })

  it('hydrates empty and populated Supplier and Equipment views without fallback or ledger writes', async () => {
    const email = `koalafrog-procurement-${crypto.randomUUID()}@example.test`
    const password = `Local-${crypto.randomUUID()}-9a!`
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error) throw created.error
    const ownerId = created.data.user.id
    createdUsers.push(ownerId)
    expect((await supabase!.auth.signInWithPassword({ email, password })).error).toBeNull()
    const workspace = await supabase!.rpc('create_clean_workspace')
    if (workspace.error) throw workspace.error
    const workspaceId = workspace.data

    const localValues = new Map([['koalafrog.formula-workspace.v9', 'local-sentinel']])
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key:string) => localValues.get(key) ?? null, setItem: (key:string,value:string) => localValues.set(key,value), removeItem: (key:string) => localValues.delete(key) } })
    const inventoryBefore = await supabase!.from('inventory_movements').select('*', { count: 'exact', head: true }).eq('owner_id', ownerId)

    expect(await loadProcurement(workspaceId)).toMatchObject({ suppliers: [], quoteLines: [], equipment: [] })

    const owned = { workspace_id: workspaceId, owner_id: ownerId }
    const supplier = await supabase!.from('suppliers').insert({ ...owned, legal_name: 'Hydration Supplier', supplier_type: 'raw_material', status: 'active' }).select('id,revision').single()
    if (supplier.error) throw supplier.error
    const quote = await supabase!.from('supplier_quotes').insert({ ...owned, supplier_id: supplier.data.id, quote_date: '2026-07-16', currency: 'NOK', status: 'received' }).select('id').single()
    if (quote.error) throw quote.error
    const line = await supabase!.from('supplier_quote_lines').insert({ ...owned, quote_id: quote.data.id, description: 'Jojoba oil', quantity: 2, unit: 'kg', unit_price: 100 }).select('id,created_at').single()
    if (line.error) throw line.error
    const equipment = await supabase!.from('equipment_items').insert({ ...owned, name: 'Bench scale', equipment_type: 'scale', status: 'available' }).select('id').single()
    if (equipment.error) throw equipment.error
    const now = '2026-07-16T12:00:00.000Z'
    expect((await supabase!.from('ingredients').insert({ ...owned, id:'ingredient-procurement', common_name:'Jojoba', inci_name:'SIMMONDSIA CHINENSIS SEED OIL', category:'Oil', functions:['Emollient'], cosing_functions:['SKIN CONDITIONING'],cosing_verification_status:'verified_from_cosing',cosing_verified_at:'2026-07-16',cosing_source_reference:'Exact active INCI entry',description:'Light, fast-absorbing oil', default_unit:'g', notes:'Technical note', status:'Active', created_at:now, updated_at:now })).error).toBeNull()
    expect((await supabase!.from('supplier_products').insert({ ...owned, id:'supplier-product-procurement', ingredient_id:'ingredient-procurement', supplier_name:'Hydration Supplies', product_name:'Jojoba Oil', package_quantity:1, package_unit:'kg', price:245, currency:'NOK', notes:'Historical offer', is_preferred:true, created_at:now, updated_at:now })).error).toBeNull()
    expect((await supabase!.from('supplier_products').insert({ ...owned, id:'supplier-product-preferred', ingredient_id:'ingredient-procurement', supplier_name:'Hydration Supplies', product_name:'Jojoba Oil 1 L', package_quantity:1, package_unit:'L', price:77.46, currency:'GBP', notes:'Preferred candidate', is_preferred:false, created_at:now, updated_at:now })).error).toBeNull()
    expect((await supabase!.from('inventory_lots').insert({ ...owned, id:'lot-procurement', ingredient_id:'ingredient-procurement', supplier_product_id:'supplier-product-procurement', internal_lot_number:'KF-PROC-LOT', received_date:'2026-07-16', opening_quantity:1000, unit:'g', location:'Lab', status:'Active', notes:'Historical lot', created_at:now, updated_at:now })).error).toBeNull()

    await updateRecord('suppliers',supplier.data.id,supplier.data.revision,{trading_name:'Hydration Trading',default_currency:'NOK'})
    await expect(updateRecord('suppliers',supplier.data.id,supplier.data.revision,{trading_name:'Stale edit'})).rejects.toThrow('changed')
    await createContact(workspaceId,{supplier_id:supplier.data.id,name:'Procurement Contact',email:'contact@example.test',notes:'',is_primary:true})
    await createQuote(workspaceId,{supplier_id:supplier.data.id,quote_reference:'Q-WORKFLOW',quote_date:'2026-07-16',currency:'NOK',status:'draft',internal_notes:''})
    const supplierDocument=await createSupplierDocument(workspaceId,{supplier_id:supplier.data.id,document_type:'coa',capability_state:'available_on_request',verification_state:'unverified',checked_date:'2026-07-16',notes:'Ask with each lot.',scope_type:'supplier_wide'})
    await updateRecord('supplier_document_records',supplierDocument.id,supplierDocument.revision,{verification_state:'pending_review'})
    await expect(updateRecord('supplier_document_records',supplierDocument.id,supplierDocument.revision,{verification_state:'verified'})).rejects.toThrow('changed')
    const supplierEvent=await createSupplierEvent(workspaceId,{supplier_id:supplier.data.id,event_type:'communication',occurred_at:'2026-07-16T12:00:00Z',title:'Requested dispatch update',description:'Email sent.',expected_at:null})
    await updateRecord('supplier_events',supplierEvent.id,supplierEvent.revision,{description:'Reply received.'})
    await expect(updateRecord('supplier_events',supplierEvent.id,supplierEvent.revision,{description:'Stale rewrite'})).rejects.toThrow('changed')
    const purchasePlan=await admin.from('purchase_plans').insert({...owned,supplier_id:supplier.data.id,title:'History purchase',status:'approved',purpose:'Integration evidence',currency:'NOK'}).select('id,revision').single()
    if(purchasePlan.error)throw purchasePlan.error
    const purchasePlanLine=await admin.from('purchase_plan_lines').insert({...owned,purchase_plan_id:purchasePlan.data.id,inventory_domain:'raw_material',supplier_product_id:'supplier-product-procurement',description:'Jojoba Oil snapshot',planned_quantity:1000,unit:'g',pack_count:1,pack_size:1000,estimated_unit_price:245,estimated_line_total:245,currency:'NOK'}).select('id').single()
    if(purchasePlanLine.error)throw purchasePlanLine.error
    const orderId=await createPurchaseOrderFromPlan(purchasePlan.data.id)
    await recordPurchaseOrderPlacement(orderId,1,'ORDER-TEST-1')
    expect((await supabase!.from('purchase_plans').select('status').eq('id',purchasePlan.data.id).single()).data?.status).toBe('approved')
    expect((await (supabase as any).from('purchase_order_lines').select('product_name_snapshot,ordered_quantity,legacy_received_quantity').eq('purchase_order_id',orderId).single()).data).toEqual({product_name_snapshot:'Jojoba Oil snapshot',ordered_quantity:1000,legacy_received_quantity:null})
    await linkSupplierProduct('supplier_products','supplier-product-procurement',supplier.data.id,now)

    const workspaceRepository=new SupabaseWorkspaceRepository(),beforePreference=await workspaceRepository.load(ownerId)
    let committedPreference=beforePreference
    await executeWorkspaceAction(workspaceRepository,beforePreference,'markSupplierPreferred',current=>({...current,supplierProducts:current.supplierProducts.map(item=>item.ingredientId==='ingredient-procurement'?{...item,isPreferred:item.id==='supplier-product-preferred',updatedAt:new Date().toISOString()}:item)}),{pending:()=>{},failed:()=>{},committed:next=>{committedPreference=next}})
    expect(committedPreference.supplierProducts.find(item=>item.id==='supplier-product-preferred')?.isPreferred).toBe(true)
    const preferenceRows=await supabase!.from('supplier_products').select('id,is_preferred,price,currency').eq('ingredient_id','ingredient-procurement').order('id')
    expect(preferenceRows.data).toEqual([{id:'supplier-product-preferred',is_preferred:true,price:77.46,currency:'GBP'},{id:'supplier-product-procurement',is_preferred:false,price:245,currency:'NOK'}])
    expect((await supabase!.rpc('mark_supplier_product_preferred',{p_product_id:'supplier-product-preferred',p_expected_updated_at:now})).error).toBeNull()

    const otherEmail=`koalafrog-other-${crypto.randomUUID()}@example.test`,otherPassword=`Local-${crypto.randomUUID()}-9a!`,otherCreated=await admin.auth.admin.createUser({email:otherEmail,password:otherPassword,email_confirm:true})
    if(otherCreated.error)throw otherCreated.error
    createdUsers.push(otherCreated.data.user.id)
    const otherClient=createClient(url!,anonKey!,{auth:{persistSession:false}})
    expect((await otherClient.auth.signInWithPassword({email:otherEmail,password:otherPassword})).error).toBeNull()
    expect((await otherClient.from('supplier_document_records').select('id').eq('supplier_id',supplier.data.id)).data).toEqual([])
    expect((await otherClient.from('supplier_events').select('id').eq('supplier_id',supplier.data.id)).data).toEqual([])
    expect((await otherClient.rpc('mark_supplier_product_preferred',{p_product_id:'supplier-product-procurement',p_expected_updated_at:now})).error?.message).toContain('unavailable')

    const orderedLines = await supabase!.from('supplier_quote_lines').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false })
    expect(orderedLines.error).toBeNull()
    expect(orderedLines.data?.[0].id).toBe(line.data.id)

    const data = await loadProcurement(workspaceId)
    const librarySupplier = data.suppliers.find(item => item.id === supplier.data.id)
    expect(librarySupplier?.legal_name).toBe('Hydration Supplier')
    const detailQuotes = data.quotes.filter(item => item.supplier_id === supplier.data.id)
    expect(detailQuotes).toHaveLength(2)
    const pricedQuote=detailQuotes.find(item=>item.id===quote.data.id)!
    expect(quoteArithmetic(pricedQuote, data.quoteLines).knownTotal).toBe(200)
    expect(compareQuotes([pricedQuote], data.quoteLines, {}, 'NOK')[0].comparisonTotal).toBe(200)
    expect(data.equipment.find(item => item.id === equipment.data.id)?.name).toBe('Bench scale')
    expect(data.suppliers.find(item=>item.id===supplier.data.id)?.trading_name).toBe('Hydration Trading')
    expect(data.contacts.find(item=>item.supplier_id===supplier.data.id)?.name).toBe('Procurement Contact')
    expect(data.quotes.find(item=>item.quote_reference==='Q-WORKFLOW')?.status).toBe('draft')
    expect(data.supplierDocuments.find(item=>item.id===supplierDocument.id)).toMatchObject({supplier_id:supplier.data.id,capability_state:'available_on_request',verification_state:'pending_review',evidence_url:null})
    expect(data.supplierEvents.find(item=>item.id===supplierEvent.id)).toMatchObject({supplier_id:supplier.data.id,event_type:'communication',description:'Reply received.'})
    expect(data.supplierEvents.some(item=>item.event_type==='quote_received'&&item.supplier_quote_id===quote.data.id)).toBe(true)
    expect(data.supplierEvents.some(item=>item.event_type==='purchase_placed'&&item.purchase_plan_id===purchasePlan.data.id&&item.purchase_order_id===orderId)).toBe(true)
    expect(data.purchaseOrders.find(item=>item.id===orderId)).toMatchObject({source_purchase_plan_id:purchasePlan.data.id,status:'placed',order_reference:'ORDER-TEST-1'})
    const linkedProduct=await supabase!.from('supplier_products').select('supplier_id,price,notes').eq('id','supplier-product-procurement').single()
    expect(linkedProduct.data).toMatchObject({supplier_id:supplier.data.id,price:245,notes:'Historical offer'})
    expect((await supabase!.from('inventory_lots').select('supplier_product_id,internal_lot_number').eq('id','lot-procurement').single()).data).toEqual({supplier_product_id:'supplier-product-procurement',internal_lot_number:'KF-PROC-LOT'})
    await supabase!.auth.signOut()
    expect((await supabase!.auth.signInWithPassword({email,password})).error).toBeNull()
    const afterLogin=await loadProcurement(workspaceId)
    expect(afterLogin.suppliers.find(item=>item.id===supplier.data.id)?.trading_name).toBe('Hydration Trading')
    expect(afterLogin.contacts.find(item=>item.supplier_id===supplier.data.id)?.name).toBe('Procurement Contact')
    const hydratedWorkspace=await workspaceRepository.load(ownerId)
    expect(hydratedWorkspace.ingredients.find(item=>item.id==='ingredient-procurement')).toMatchObject({functions:['Emollient'],cosingFunctions:['SKIN CONDITIONING'],cosingVerificationStatus:'verified_from_cosing',cosingVerifiedAt:'2026-07-16',cosingSourceReference:'Exact active INCI entry',description:'Light, fast-absorbing oil'})
    expect(hydratedWorkspace.supplierProducts.find(item=>item.id==='supplier-product-preferred')?.isPreferred).toBe(true)
    expect(hydratedWorkspace.supplierProducts.find(item=>item.id==='supplier-product-procurement')?.isPreferred).toBe(false)
    expect(localStorage.getItem('koalafrog.formula-workspace.v9')).toBe('local-sentinel')
    const inventoryAfter = await supabase!.from('inventory_movements').select('*', { count: 'exact', head: true }).eq('owner_id', ownerId)
    expect(inventoryAfter.count).toBe(inventoryBefore.count)
  })
})
