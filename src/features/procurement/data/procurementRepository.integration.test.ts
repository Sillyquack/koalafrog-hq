import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { supabase } from '../../../platform/supabase/client'
import type { Database } from '../../../platform/supabase/generated/database.types'
import { compareQuotes, quoteArithmetic } from '../domain/procurement'
import { loadProcurement } from './procurementRepository'

const url = import.meta.env.VITE_SUPABASE_TEST_URL as string | undefined
const serviceKey = import.meta.env.VITE_SUPABASE_TEST_SERVICE_ROLE_KEY as string | undefined
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
    const supplier = await supabase!.from('suppliers').insert({ ...owned, legal_name: 'Hydration Supplier', supplier_type: 'raw_material', status: 'active' }).select('id').single()
    if (supplier.error) throw supplier.error
    const quote = await supabase!.from('supplier_quotes').insert({ ...owned, supplier_id: supplier.data.id, quote_date: '2026-07-16', currency: 'NOK', status: 'received' }).select('id').single()
    if (quote.error) throw quote.error
    const line = await supabase!.from('supplier_quote_lines').insert({ ...owned, quote_id: quote.data.id, description: 'Jojoba oil', quantity: 2, unit: 'kg', unit_price: 100 }).select('id,created_at').single()
    if (line.error) throw line.error
    const equipment = await supabase!.from('equipment_items').insert({ ...owned, name: 'Bench scale', equipment_type: 'scale', status: 'available' }).select('id').single()
    if (equipment.error) throw equipment.error

    const orderedLines = await supabase!.from('supplier_quote_lines').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false })
    expect(orderedLines.error).toBeNull()
    expect(orderedLines.data?.[0].id).toBe(line.data.id)

    const data = await loadProcurement(workspaceId)
    const librarySupplier = data.suppliers.find(item => item.id === supplier.data.id)
    expect(librarySupplier?.legal_name).toBe('Hydration Supplier')
    const detailQuotes = data.quotes.filter(item => item.supplier_id === supplier.data.id)
    expect(detailQuotes).toHaveLength(1)
    expect(quoteArithmetic(detailQuotes[0], data.quoteLines).knownTotal).toBe(200)
    expect(compareQuotes(detailQuotes, data.quoteLines, {}, 'NOK')[0].comparisonTotal).toBe(200)
    expect(data.equipment.find(item => item.id === equipment.data.id)?.name).toBe('Bench scale')
    expect(localStorage.getItem('koalafrog.formula-workspace.v9')).toBe('local-sentinel')
    const inventoryAfter = await supabase!.from('inventory_movements').select('*', { count: 'exact', head: true }).eq('owner_id', ownerId)
    expect(inventoryAfter.count).toBe(inventoryBefore.count)
  })
})
