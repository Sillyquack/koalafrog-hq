import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { formulaSeed } from '../../data/formulaSeed'
import { compareReconciliation, reconciliationSnapshot, validateV9Workspace } from '../migration/v9Migration'
import { relationalMigrationPayload, relationalTableByCollection, SupabaseWorkspaceRepository, toDomainValue } from './supabaseWorkspaceRepository'
import { supabase } from '../supabase/client'
import type { FormulaState } from '../../types/domain'

const url = import.meta.env.VITE_SUPABASE_TEST_URL as string | undefined
const serviceKey = import.meta.env.VITE_SUPABASE_TEST_SERVICE_ROLE_KEY as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_TEST_ANON_KEY as string | undefined
const run = url && serviceKey ? describe : describe.skip

run('relational v9 migration against local Supabase', () => {
  let admin: ReturnType<typeof createClient>
  const createdUsers: string[] = []

  async function ownerClient(label: string) {
    const email = `koalafrog-${label}-${crypto.randomUUID()}@example.test`
    const password = `Local-${crypto.randomUUID()}-9a!`
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error) throw created.error
    createdUsers.push(created.data.user.id)
    const client = createClient(url!, anonKey!, { auth: { persistSession: false } })
    const signedIn = await client.auth.signInWithPassword({ email, password })
    if (signedIn.error) throw signedIn.error
    return { client, ownerId: created.data.user.id, email, password }
  }

  beforeAll(() => {
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    expect(validateV9Workspace(formulaSeed).blockingErrors).toBe(0)
    expect(Object.values(formulaSeed).reduce((sum, records) => sum + records.length, 0)).toBe(134)
  })
  afterAll(async () => { for (const id of createdUsers) await admin.auth.admin.deleteUser(id) })

  it('imports all collections, preserves IDs, rejects duplicates, and reconciles ledgers', async () => {
    const { client, ownerId } = await ownerClient('valid')
    const imported = await client.rpc('import_v9_relational', { payload: relationalMigrationPayload(formulaSeed) })
    expect(imported.error).toBeNull()
    const remoteState: Record<string, unknown[]> = {}
    for (const [collection, table] of Object.entries(relationalTableByCollection)) {
      const result = await client.from(table).select('*').eq('owner_id', ownerId)
      if (result.error) throw result.error
      remoteState[collection] = toDomainValue(result.data) as unknown[]
    }
    const remote = remoteState as unknown as FormulaState
    for (const collection of Object.keys(relationalTableByCollection) as Array<keyof FormulaState>) {
      expect(remote[collection].map(record => record.id).sort(), collection).toEqual(formulaSeed[collection].map(record => record.id).sort())
    }
    const reconciliation = compareReconciliation(reconciliationSnapshot(formulaSeed), reconciliationSnapshot(remote))
    expect(reconciliation.complete).toBe(true)
    const completed = await client.rpc('complete_v9_reconciliation', { run_id: (imported.data as {migrationRunId:string}).migrationRunId, report: reconciliation })
    expect(completed.error).toBeNull()
    const report = await client.from('migration_runs').select('state,reconciliation').eq('owner_id', ownerId).single()
    expect(report.data?.state).toBe('Completed')
    const duplicate = await client.rpc('import_v9_relational', { payload: relationalMigrationPayload(formulaSeed) })
    expect(duplicate.error?.message).toContain('not empty')
    const products = await client.from('products').select('id').eq('owner_id', ownerId)
    expect(products.data).toHaveLength(formulaSeed.products.length)
  })

  it('rolls back the complete import when a foreign key is invalid', async () => {
    const { client, ownerId } = await ownerClient('invalid')
    const invalid = structuredClone(formulaSeed)
    invalid.formulaLines[0].ingredientId = 'missing-ingredient'
    const imported = await client.rpc('import_v9_relational', { payload: relationalMigrationPayload(invalid) })
    expect(imported.error).not.toBeNull()
    const failure = await client.rpc('record_v9_migration_failure', { error_message: imported.error!.message })
    expect(failure.error).toBeNull()
    const products = await client.from('products').select('id').eq('owner_id', ownerId)
    expect(products.data).toHaveLength(0)
    const report = await client.from('migration_runs').select('state,errors').eq('owner_id', ownerId).single()
    expect(report.data?.state).toBe('Failed')
  })

  it('commits audit-critical operations atomically and rejects duplicates or excess', async () => {
    const { client, ownerId } = await ownerClient('rpc')
    const imported = await client.rpc('import_v9_relational', { payload: relationalMigrationPayload(formulaSeed) })
    expect(imported.error).toBeNull()
    const workspace = await client.from('workspaces').select('id').eq('owner_id',ownerId).single()
    const wid = workspace.data!.id
    const insert = async (table:string,row:Record<string,unknown>) => { const result=await client.from(table).insert({workspace_id:wid,owner_id:ownerId,...row});if(result.error)throw result.error }

    await insert('lab_batches',{id:'lb-rpc',batch_number:'KF-LAB-RPC',product_id:'p1',formula_id:'f-bo-original',formula_version_id:'fv-bo-01',status:'In Progress',planned_batch_size:10,planned_batch_unit:'g',created_at:'2026-07-15',updated_at:'2026-07-15',purpose:'RPC test',notes:'',summary:'',target_characteristics:''})
    await insert('lab_batch_lines',{id:'lbl-rpc',lab_batch_id:'lb-rpc',formula_line_id:'fl-fv-bo-01-1',ingredient_id:'i1',ingredient_name_snapshot:'Jojoba Oil',phase:'A',planned_percentage:100,planned_quantity:1,actual_quantity:1,unit:'g',variance:0,notes:'',status:'Weighed'})
    await insert('lab_lot_allocations',{id:'la-rpc',lab_batch_line_id:'lbl-rpc',inventory_lot_id:'lot1',quantity:1,unit:'g'})
    const labCommit={allocation_id:'la-rpc',movement_id:'lm-rpc',notes:'',occurred_at:'2026-07-15',created_at:'2026-07-15'}
    expect((await client.rpc('commit_lab_consumption',{batch_id:'lb-rpc',commits:[{...labCommit,allocation_id:'missing'}]})).error).not.toBeNull()
    expect((await client.from('inventory_movements').select('id').eq('id','lm-rpc')).data).toHaveLength(0)
    expect((await client.from('lab_lot_allocations').select('inventory_movement_id').eq('id','la-rpc').single()).data?.inventory_movement_id).toBeNull()
    expect((await client.rpc('commit_lab_consumption',{batch_id:'lb-rpc',commits:[labCommit]})).error).toBeNull()
    expect((await client.rpc('commit_lab_consumption',{batch_id:'lb-rpc',commits:[labCommit]})).error?.message).toContain('already committed')
    expect((await client.from('inventory_movements').select('id').eq('id','lm-rpc')).data).toHaveLength(1)

    await insert('production_runs',{id:'pr-rpc',production_run_number:'KF-PR-RPC',product_id:'p1',formula_id:'f-bo-original',formula_version_id:'fv-bo-01',status:'In Progress',planned_batch_size:10,planned_batch_unit:'g',planned_units:5,actual_units_produced:5,created_at:'2026-07-15',updated_at:'2026-07-15',purpose:'RPC test',notes:'',summary:''})
    await insert('production_run_lines',{id:'prl-rpc',production_run_id:'pr-rpc',formula_line_id:'fl-fv-bo-01-1',ingredient_id:'i1',ingredient_name_snapshot:'Jojoba Oil',phase:'A',planned_percentage:100,planned_quantity:1,actual_quantity:1,unit:'g',variance:0,notes:'',status:'Weighed'})
    await insert('production_lot_allocations',{id:'pra-rpc',production_run_line_id:'prl-rpc',inventory_lot_id:'lot1',quantity:1,unit:'g'})
    expect((await client.rpc('commit_production_consumption',{run_id:'pr-rpc',commits:[{allocation_id:'pra-rpc',movement_id:'pim-rpc',notes:'',occurred_at:'2026-07-15',created_at:'2026-07-15'}]})).error).toBeNull()
    expect((await client.rpc('commit_production_consumption',{run_id:'pr-rpc',commits:[{allocation_id:'pra-rpc',movement_id:'pim-rpc-duplicate',notes:'',occurred_at:'2026-07-15',created_at:'2026-07-15'}]})).error?.message).toContain('already committed')
    expect((await client.from('inventory_movements').select('id').eq('id','pim-rpc-duplicate')).data).toHaveLength(0)
    const productionAllocation=await client.from('production_lot_allocations').select('inventory_movement_id,unit_cost_snapshot').eq('id','pra-rpc').single()
    expect(productionAllocation.data?.inventory_movement_id).toBe('pim-rpc')
    expect(productionAllocation.data?.unit_cost_snapshot).not.toBeNull()

    const fgBatch={id:'fg-rpc',finished_goods_batch_number:'KF-FG-RPC',production_run_id:'pr-rpc',product_id:'p1',formula_version_id:'fv-bo-01',status:'Active',production_date:'2026-07-15',initial_quantity:2,unit:'pcs',notes:'',created_at:'2026-07-15',updated_at:'2026-07-15'}
    const fgReceipt={id:'fgm-rpc',finished_goods_batch_id:'fg-rpc',type:'ProductionReceipt',quantity:2,unit:'pcs',reason:'RPC output',reference_type:'ProductionRun',reference_id:'pr-rpc',notes:'',occurred_at:'2026-07-15',created_at:'2026-07-15'}
    expect((await client.rpc('register_finished_goods_output',{batch:fgBatch,receipt:fgReceipt})).error).toBeNull()
    const before=(await client.from('finished_goods_batches').select('id').eq('production_run_id','pr-rpc')).data!.length
    const excess=await client.rpc('register_finished_goods_output',{batch:{...fgBatch,id:'fg-excess',finished_goods_batch_number:'KF-FG-EXCESS',initial_quantity:4},receipt:{...fgReceipt,id:'fgm-excess',finished_goods_batch_id:'fg-excess',quantity:4}})
    expect(excess.error?.message).toContain('exceeds')
    expect((await client.from('finished_goods_batches').select('id').eq('production_run_id','pr-rpc')).data).toHaveLength(before)
    expect((await client.from('finished_goods_movements').select('id').eq('id','fgm-excess')).data).toHaveLength(0)

    await insert('production_runs',{id:'pr-pkg-rpc',production_run_number:'KF-PR-PKG-RPC',product_id:'p1',formula_id:'f-bo-original',formula_version_id:'fv-bo-01',status:'Completed',planned_batch_size:10,planned_batch_unit:'g',planned_units:2,actual_units_produced:2,created_at:'2026-07-15',updated_at:'2026-07-15',purpose:'Packaging RPC test',notes:'',summary:''})
    const packagedBatch={...fgBatch,id:'fg-pkg-rpc',finished_goods_batch_number:'KF-FG-PKG-RPC',production_run_id:'pr-pkg-rpc',packaging_specification_version_id:'pkgv-10',status:'Quarantined',initial_quantity:2}
    expect((await client.rpc('register_finished_goods_output',{batch:packagedBatch,receipt:null})).error).toBeNull()
    await insert('packaging_inventory_lots',{id:'pl-label-rpc',packaging_component_id:'pc-label',internal_lot_number:'KF-PKG-LABEL-RPC',received_date:'2026-07-15',opening_quantity:10,unit:'pcs',location:'Test',status:'Active',notes:'',created_at:'2026-07-15',updated_at:'2026-07-15'})
    await insert('packaging_inventory_movements',{id:'pm-label-rpc',packaging_inventory_lot_id:'pl-label-rpc',type:'Receipt',quantity:10,unit:'pcs',reason:'Test receipt',notes:'',occurred_at:'2026-07-15',created_at:'2026-07-15'})
    await insert('packaging_allocations',{id:'pa-bottle-rpc',finished_goods_batch_id:'fg-pkg-rpc',packaging_specification_line_id:'pkgl-bottle',packaging_inventory_lot_id:'pl-bottle',quantity:2,unit:'pcs'})
    await insert('packaging_allocations',{id:'pa-dropper-rpc',finished_goods_batch_id:'fg-pkg-rpc',packaging_specification_line_id:'pkgl-dropper',packaging_inventory_lot_id:'pl-dropper',quantity:2,unit:'pcs'})
    await insert('packaging_allocations',{id:'pa-label-rpc',finished_goods_batch_id:'fg-pkg-rpc',packaging_specification_line_id:'pkgl-label',packaging_inventory_lot_id:'pl-label-rpc',quantity:2,unit:'pcs'})
    const packagingCommits=['bottle','dropper','label'].map(name=>({allocation_id:`pa-${name}-rpc`,movement_id:`pm-${name}-consume-rpc`,occurred_at:'2026-07-15',created_at:'2026-07-15'}))
    const packagingReceipt={id:'fgm-pkg-rpc',occurred_at:'2026-07-15',created_at:'2026-07-15'}
    expect((await client.from('packaging_allocations').update({quantity:20}).eq('id','pa-label-rpc')).error).toBeNull()
    expect((await client.rpc('commit_packaging_consumption',{target_finished_goods_batch_id:'fg-pkg-rpc',commits:packagingCommits,receipt:packagingReceipt})).error).not.toBeNull()
    expect((await client.from('packaging_inventory_movements').select('id').like('id','%-consume-rpc')).data).toHaveLength(0)
    expect((await client.from('finished_goods_movements').select('id').eq('id','fgm-pkg-rpc')).data).toHaveLength(0)
    expect((await client.from('packaging_allocations').update({quantity:2}).eq('id','pa-label-rpc')).error).toBeNull()
    expect((await client.rpc('commit_packaging_consumption',{target_finished_goods_batch_id:'fg-pkg-rpc',commits:packagingCommits,receipt:packagingReceipt})).error).toBeNull()
    expect((await client.rpc('commit_packaging_consumption',{target_finished_goods_batch_id:'fg-pkg-rpc',commits:packagingCommits,receipt:packagingReceipt})).error?.message).toContain('already committed')
    expect((await client.from('packaging_inventory_movements').select('id').like('id','%-consume-rpc')).data).toHaveLength(3)
  })

  it('persists normalized children, refreshes them, and rejects a stale mutable write', async () => {
    const { client, ownerId, email, password } = await ownerClient('repository')
    expect((await client.rpc('import_v9_relational', { payload: relationalMigrationPayload(formulaSeed) })).error).toBeNull()
    expect((await supabase!.auth.signInWithPassword({email,password})).error).toBeNull()
    const repository=new SupabaseWorkspaceRepository()
    const before=await repository.load(ownerId)
    const template={id:'tt-rpc',name:'RPC template',description:'Normalized',questions:[{id:'q-rpc',prompt:'Rating',type:'Numeric Rating' as const,sortOrder:1}],createdAt:'2026-07-15',updatedAt:'2026-07-15'}
    const withTemplate={...before,testTemplates:[...before.testTemplates,template]}
    await repository.commit({action:'createTestTemplate',previous:before,next:withTemplate})
    const response={id:'tr-rpc',testSessionId:'ts1',testerId:'tester1',answers:[{questionId:'q-rpc',value:5}],overallNotes:'Persisted',submittedAt:'2026-07-15'}
    const withResponse={...withTemplate,testResponses:[...withTemplate.testResponses,response]}
    await repository.commit({action:'addTestResponse',previous:withTemplate,next:withResponse})
    const refreshed=await repository.load(ownerId)
    expect(refreshed.testTemplates.find(item=>item.id==='tt-rpc')?.questions).toEqual(template.questions)
    expect(refreshed.testResponses.find(item=>item.id==='tr-rpc')?.answers).toEqual(response.answers)

    const stale=refreshed.ingredients.find(item=>item.id==='i1')!
    expect((await client.from('ingredients').update({notes:'Other tab',updated_at:'2026-07-15T12:00:00Z'}).eq('id',stale.id)).error).toBeNull()
    const intended={...refreshed,ingredients:refreshed.ingredients.map(item=>item.id===stale.id?{...item,notes:'Stale edit',updatedAt:'2026-07-15T13:00:00Z'}:item)}
    await expect(repository.commit({action:'updateIngredient',previous:refreshed,next:intended})).rejects.toThrow('refresh and retry')
    expect((await client.from('ingredients').select('notes').eq('id',stale.id).single()).data?.notes).toBe('Other tab')
    await supabase!.auth.signOut()
  })
})
