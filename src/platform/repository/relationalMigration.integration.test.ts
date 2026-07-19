import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { formulaSeed } from '../../data/formulaSeed'
import { compareReconciliation, reconciliationSnapshot, validateV9Workspace } from '../migration/v9Migration'
import { relationalMigrationPayload, relationalTableByCollection, SupabaseWorkspaceRepository, toDomainValue } from './supabaseWorkspaceRepository'
import { supabase } from '../supabase/client'
import type { FormulaState, SupplierProductVerification } from '../../types/domain'
import { executeWorkspaceAction } from '../actions/workspaceActionExecutor'
import type { WorkspaceActionName, WorkspaceStateMutation } from '../actions/workspaceActions'
import { lotBalance } from '../../features/inventory/domain/inventoryLogic'
import { packagingLotBalance } from '../../features/packaging/domain/packagingLogic'
import { finishedGoodsBalance } from '../../features/finished-goods/domain/finishedGoodsLogic'
import { actualMaterialCost, additionalCostTotal, productionCost } from '../../features/costing/domain/costingLogic'
import { LocalWorkspaceRepository } from './localWorkspaceRepository'
import type { WorkspaceRepository } from './workspaceRepository'

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

  async function applicationAction(repository:WorkspaceRepository,current:FormulaState,action:WorkspaceActionName,mutation:WorkspaceStateMutation) {
    let committed=current
    await executeWorkspaceAction(repository,current,action,mutation,{committed:next=>{committed=next},failed:()=>{},pending:()=>{}})
    return committed
  }

  beforeAll(() => {
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    expect(validateV9Workspace(formulaSeed).blockingErrors).toBe(0)
    expect(Object.values(formulaSeed).reduce((sum, records) => sum + records.length, 0)).toBe(134)
  })
  afterAll(async () => { for (const id of createdUsers) await admin.auth.admin.deleteUser(id) })

  it('replays milligram conversion support without permitting mass-volume conversion',async()=>{const{client}=await ownerClient('milligram');const gram=await client.rpc('kf_convert_quantity',{q:1000,from_unit:'mg',to_unit:'g'}),kg=await client.rpc('kf_convert_quantity',{q:1_000_000,from_unit:'mg',to_unit:'kg'}),volume=await client.rpc('kf_convert_quantity',{q:1,from_unit:'mg',to_unit:'ml'});expect(gram.error).toBeNull();expect(Number(gram.data)).toBe(1);expect(Number(kg.data)).toBe(1);expect(volume.data).toBeNull()})

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
    expect((await client.from('workspaces').select('lifecycle_state').eq('owner_id',ownerId).single()).data?.lifecycle_state).toBe('active')
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
    expect((await client.from('workspaces').select('lifecycle_state').eq('owner_id',ownerId).single()).data?.lifecycle_state).toBe('failed')
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
    const movementsBeforeRole=refreshed.inventoryMovements.length
    const roleLineId=refreshed.formulaLines[0].id
    await applicationAction(repository,refreshed,'updateLine',current=>({...current,formulaLines:current.formulaLines.map(line=>line.id===roleLineId?{...line,formulationRole:'Primary lightweight carrier'}:line)}))
    const withRole=await repository.load(ownerId)
    expect(withRole.formulaLines.find(line=>line.id===roleLineId)?.formulationRole).toBe('Primary lightweight carrier')
    expect(withRole.inventoryMovements).toHaveLength(movementsBeforeRole)

    const stale=withRole.ingredients.find(item=>item.id==='i1')!
    expect((await client.from('ingredients').update({notes:'Other tab',updated_at:'2026-07-15T12:00:00Z'}).eq('id',stale.id)).error).toBeNull()
    const intended={...withRole,ingredients:withRole.ingredients.map(item=>item.id===stale.id?{...item,notes:'Stale edit',updatedAt:'2026-07-15T13:00:00Z'}:item)}
    await expect(repository.commit({action:'updateIngredient',previous:withRole,next:intended})).rejects.toThrow('refresh and retry')
    expect((await client.from('ingredients').select('notes').eq('id',stale.id).single()).data?.notes).toBe('Other tab')
    await supabase!.auth.signOut()
  })

  it('persists representative application actions across every domain and survives fresh hydration without a local dual write', async () => {
    const { ownerId, email, password } = await ownerClient('matrix')
    const localKey='koalafrog.formula-workspace.v9'
    const localValues=new Map<string,string>()
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>localValues.get(key)??null,setItem:(key:string,value:string)=>localValues.set(key,value),removeItem:(key:string)=>localValues.delete(key),clear:()=>localValues.clear(),key:(index:number)=>[...localValues.keys()][index]??null,get length(){return localValues.size}}})
    localStorage.setItem(localKey,'local-sentinel')
    expect((await supabase!.auth.signInWithPassword({email,password})).error).toBeNull()
    const repository=new SupabaseWorkspaceRepository()
    expect((await repository.importV9(ownerId,formulaSeed)).state).toContain('Imported')
    let state=await new SupabaseWorkspaceRepository().load(ownerId)
    const reload=async()=>{state=await new SupabaseWorkspaceRepository().load(ownerId);return state}
    const act=async(action:WorkspaceActionName,mutation:WorkspaceStateMutation)=>{await applicationAction(repository,state,action,mutation);return reload()}
    const now='2026-07-15T12:00:00.000Z'

    await act('createProduct',current=>({...current,products:[...current.products,{id:'p-matrix',name:'Matrix Balm',category:'Balm',status:'Active',developmentStage:'Research',description:'Created through application action',scentProfile:'Unscented',targetLaunchDate:'2027-01-15',createdAt:now,updatedAt:now}]}))
    await act('updateProduct',current=>({...current,products:current.products.map(item=>item.id==='p-matrix'?{...item,description:'Persisted product metadata',developmentStage:'Formulation',updatedAt:'2026-07-15T12:01:00.000Z'}:item)}))
    expect(state.products.filter(item=>item.id==='p-matrix')).toHaveLength(1)
    expect(state.products.find(item=>item.id==='p-matrix')?.description).toBe('Persisted product metadata')

    await act('createIngredient',current=>({...current,ingredients:[...current.ingredients,{id:'i-matrix',commonName:'Matrix Oil',inciName:'SIMMONDSIA CHINENSIS SEED OIL',category:'Emollient',functions:['Emollient','Skin conditioning'],description:'Verification ingredient',defaultUnit:'g',reorderThreshold:25,notes:'Created',status:'Active',createdAt:now,updatedAt:now}]}))
    await act('updateIngredient',current=>({...current,ingredients:current.ingredients.map(item=>item.id==='i-matrix'?{...item,notes:'Hydrated metadata',updatedAt:'2026-07-15T12:02:00.000Z'}:item)}))
    expect(state.ingredients.find(item=>item.id==='i-matrix')?.functions).toEqual(['Emollient','Skin conditioning'])

    await act('createFormula',current=>({...current,formulas:[...current.formulas,{id:'f-matrix',productId:'p-matrix',name:'Matrix Formula',description:'Verification',createdAt:now,updatedAt:now}],formulaVersions:[...current.formulaVersions,{id:'fv-matrix',formulaId:'f-matrix',version:'v0.1',status:'Draft',description:'Draft',targetCharacteristics:'Stable',developmentNotes:'Independent draft',createdAt:now,updatedAt:now}],formulaLines:[...current.formulaLines,{id:'fl-matrix-1',formulaVersionId:'fv-matrix',ingredientId:'i-matrix',percentage:60,phase:'A',sortOrder:1,notes:'First'},{id:'fl-matrix-2',formulaVersionId:'fv-matrix',ingredientId:'i1',percentage:40,phase:'B',sortOrder:2,notes:'Second'}]}))
    await act('duplicateAsDraft',current=>({...current,formulaVersions:[...current.formulaVersions,{id:'fv-matrix-copy',formulaId:'f-bo-original',version:'v0.3',status:'Draft',description:'Derived verification draft',targetCharacteristics:'',createdAt:now,updatedAt:now,derivedFromVersionId:'fv-bo-02'}],formulaLines:[...current.formulaLines,...current.formulaLines.filter(line=>line.formulaVersionId==='fv-bo-02').map((line,index)=>({...line,id:`fl-matrix-copy-${index}`,formulaVersionId:'fv-matrix-copy'}))]}))
    expect(state.formulaLines.filter(line=>line.formulaVersionId==='fv-matrix').map(line=>line.sortOrder).sort()).toEqual([1,2])
    expect(state.formulaVersions.find(item=>item.id==='fv-bo-02')?.status).toBe('Approved')

    await act('receiveStock',current=>({...current,inventoryLots:[...current.inventoryLots,{id:'lot-matrix',ingredientId:'i-matrix',internalLotNumber:'KF-RM-MATRIX',receivedDate:'2026-07-15',openingQuantity:100,unit:'g',location:'Test',status:'Active',notes:'',totalAcquisitionCost:20,acquisitionCostCurrency:'NOK',createdAt:now,updatedAt:now}],inventoryMovements:[...current.inventoryMovements,{id:'im-matrix-receipt',inventoryLotId:'lot-matrix',type:'Receipt',quantity:100,unit:'g',reason:'Verification receipt',notes:'',occurredAt:now,createdAt:now}]}))
    await act('addMovement',current=>({...current,inventoryMovements:[...current.inventoryMovements,{id:'im-matrix-sample',inventoryLotId:'lot-matrix',type:'Sample',quantity:5,unit:'g',reason:'Verification sample',notes:'',occurredAt:now,createdAt:now}]}))
    expect(lotBalance(state.inventoryLots.find(item=>item.id==='lot-matrix')!,state.inventoryMovements)).toBe(95)

    await act('createLabBatch',current=>({...current,labBatches:[...current.labBatches,{id:'lb-matrix',batchNumber:'KF-LAB-MATRIX',productId:'p-matrix',formulaId:'f-matrix',formulaVersionId:'fv-matrix',status:'In Progress',plannedBatchSize:10,plannedBatchUnit:'g',createdAt:now,updatedAt:now,purpose:'Verification',notes:'',summary:'',targetCharacteristics:'Stable'}],labBatchLines:[...current.labBatchLines,{id:'lbl-matrix',labBatchId:'lb-matrix',formulaLineId:'fl-matrix-1',ingredientId:'i-matrix',ingredientNameSnapshot:'Matrix Oil',phase:'A',plannedPercentage:60,plannedQuantity:6,actualQuantity:6,unit:'g',variance:0,notes:'',status:'Weighed'}],labBatchAllocations:[...current.labBatchAllocations,{id:'la-matrix',labBatchLineId:'lbl-matrix',inventoryLotId:'lot-matrix',quantity:6,unit:'g'}]}))
    await act('commitBatchConsumption',current=>({...current,inventoryMovements:[...current.inventoryMovements,{id:'im-matrix-lab',inventoryLotId:'lot-matrix',type:'Consumption',quantity:6,unit:'g',reason:'Lab verification',referenceType:'LabBatch',referenceId:'lb-matrix',notes:'',occurredAt:now,createdAt:now}],labBatchAllocations:current.labBatchAllocations.map(item=>item.id==='la-matrix'?{...item,inventoryMovementId:'im-matrix-lab'}:item)}))
    expect(state.labBatchAllocations.find(item=>item.id==='la-matrix')?.inventoryMovementId).toBe('im-matrix-lab')

    await act('createTestTemplate',current=>({...current,testTemplates:[...current.testTemplates,{id:'tt-matrix',name:'Matrix template',description:'Normalized questions',questions:[{id:'q-matrix-1',prompt:'Rating',type:'Numeric Rating',sortOrder:1},{id:'q-matrix-2',prompt:'Approved?',type:'Yes / No',sortOrder:2},{id:'q-matrix-3',prompt:'Notes',type:'Free Text',sortOrder:3}],createdAt:now,updatedAt:now}]}))
    await act('createTestSession',current=>({...current,testSessions:[...current.testSessions,{id:'ts-matrix',labBatchId:'lb-matrix',testTemplateId:'tt-matrix',name:'Matrix session',status:'Active',createdAt:now,notes:''}]}))
    await act('addTestResponse',current=>({...current,testResponses:[...current.testResponses,{id:'tr-matrix',testSessionId:'ts-matrix',testerId:'tester1',answers:[{questionId:'q-matrix-1',value:4},{questionId:'q-matrix-2',value:true},{questionId:'q-matrix-3',value:'Clean finish'}],overallNotes:'Immutable',submittedAt:now}]}))
    expect(state.testResponses.find(item=>item.id==='tr-matrix')?.answers).toEqual([{questionId:'q-matrix-1',value:4},{questionId:'q-matrix-2',value:true},{questionId:'q-matrix-3',value:'Clean finish'}])

    await act('createProductionRun',current=>({...current,productionRuns:[...current.productionRuns,{id:'pr-matrix',productionRunNumber:'KF-PR-MATRIX',productId:'p1',formulaId:'f-bo-original',formulaVersionId:'fv-bo-02',status:'In Progress',plannedBatchSize:10,plannedBatchUnit:'g',plannedUnits:4,actualUnitsProduced:4,createdAt:now,updatedAt:now,purpose:'Verification',notes:'',summary:''}],productionRunLines:[...current.productionRunLines,{id:'prl-matrix',productionRunId:'pr-matrix',formulaLineId:'fl-fv-bo-02-1',ingredientId:'i1',ingredientNameSnapshot:'Jojoba Oil',phase:'A',plannedPercentage:100,plannedQuantity:1,actualQuantity:1,unit:'g',variance:0,notes:'',status:'Weighed'}],productionRunAllocations:[...current.productionRunAllocations,{id:'pra-matrix',productionRunLineId:'prl-matrix',inventoryLotId:'lot1',quantity:1,unit:'g'}]}))
    await act('commitProductionConsumption',current=>({...current,inventoryMovements:[...current.inventoryMovements,{id:'im-matrix-production',inventoryLotId:'lot1',type:'Consumption',quantity:1,unit:'g',reason:'Production verification',referenceType:'ProductionRun',referenceId:'pr-matrix',notes:'',occurredAt:now,createdAt:now}],productionRunAllocations:current.productionRunAllocations.map(item=>item.id==='pra-matrix'?{...item,inventoryMovementId:'im-matrix-production',unitCostSnapshot:.2,costCurrencySnapshot:'NOK'}:item)}))
    expect(state.productionRunAllocations.find(item=>item.id==='pra-matrix')?.unitCostSnapshot).not.toBeNull()

    await act('addCostLine',current=>({...current,costLines:[...current.costLines,{id:'cl-matrix-plan',scope:'Product',referenceId:'p-matrix',category:'Other',description:'Planning verification',amount:12,currency:'NOK',quantity:1,notes:'',createdAt:now,updatedAt:now},{id:'cl-matrix-actual',scope:'ProductionRun',referenceId:'pr-matrix',category:'Labour',description:'Actual labour',amount:30,currency:'NOK',quantity:2,notes:'',createdAt:now,updatedAt:now}]}))
    const material=actualMaterialCost(state.productionRunLines.filter(line=>line.productionRunId==='pr-matrix'),state.productionRunAllocations)
    expect(productionCost(material.total,additionalCostTotal(state.costLines.filter(line=>line.scope==='ProductionRun'&&line.referenceId==='pr-matrix')),4).total).toBeCloseTo(material.total+60)

    await act('updatePackagingComponent',current=>({...current,packagingComponents:current.packagingComponents.map(item=>item.id==='pc-bottle'?{...item,notes:'Matrix persisted packaging',updatedAt:now}:item)}))
    await act('updatePackagingLine',current=>({...current,packagingSpecificationLines:current.packagingSpecificationLines.map(item=>item.id==='pkgl-label'?{...item,purpose:'Matrix persisted line'}:item)}))
    expect(state.packagingSpecificationLines.find(item=>item.id==='pkgl-label')?.purpose).toBe('Matrix persisted line')
    await act('receivePackagingStock',current=>({...current,packagingInventoryLots:[...current.packagingInventoryLots,{id:'pl-matrix-label',packagingComponentId:'pc-label',internalLotNumber:'KF-PKG-MATRIX-LABEL',receivedDate:'2026-07-15',openingQuantity:20,unit:'pcs',location:'Test',status:'Active',notes:'',totalAcquisitionCost:20,acquisitionCostCurrency:'NOK',createdAt:now,updatedAt:now}],packagingInventoryMovements:[...current.packagingInventoryMovements,{id:'pm-matrix-label-receipt',packagingInventoryLotId:'pl-matrix-label',type:'Receipt',quantity:20,unit:'pcs',reason:'Packaging verification receipt',notes:'',occurredAt:now,createdAt:now}]}))

    await act('createProductionRun',current=>({...current,productionRuns:[...current.productionRuns,{id:'pr-matrix-pack',productionRunNumber:'KF-PR-MATRIX-PACK',productId:'p1',formulaId:'f-bo-original',formulaVersionId:'fv-bo-02',status:'Completed',plannedBatchSize:2,plannedBatchUnit:'g',plannedUnits:2,actualUnitsProduced:2,createdAt:now,updatedAt:now,purpose:'Packaging verification',notes:'',summary:''}]}))
    await act('createFinishedGoodsBatch',current=>({...current,finishedGoodsBatches:[...current.finishedGoodsBatches,{id:'fg-matrix-pack',finishedGoodsBatchNumber:'KF-FG-MATRIX-PACK',productionRunId:'pr-matrix-pack',productId:'p1',formulaVersionId:'fv-bo-02',packagingSpecificationVersionId:'pkgv-10',status:'Quarantined',productionDate:'2026-07-15',initialQuantity:2,unit:'pcs',notes:'Packaging verification',createdAt:now,updatedAt:now}]}))
    await act('addPackagingAllocation',current=>({...current,packagingAllocations:[...current.packagingAllocations,...current.packagingSpecificationLines.filter(line=>line.packagingSpecificationVersionId==='pkgv-10').map((line,index)=>({id:`pa-matrix-${index}`,finishedGoodsBatchId:'fg-matrix-pack',packagingSpecificationLineId:line.id,packagingInventoryLotId:current.packagingInventoryLots.find(lot=>lot.packagingComponentId===line.packagingComponentId)!.id,quantity:line.quantityPerUnit*2,unit:line.unit}))]}))
    await act('commitPackagingConsumption',current=>{const allocations=current.packagingAllocations.filter(item=>item.finishedGoodsBatchId==='fg-matrix-pack');const movements=allocations.map((allocation,index)=>({id:`pm-matrix-${index}`,packagingInventoryLotId:allocation.packagingInventoryLotId!,type:'Consumption' as const,quantity:allocation.quantity,unit:allocation.unit,reason:'Packaging verification',referenceType:'FinishedGoodsBatch',referenceId:'fg-matrix-pack',notes:'',occurredAt:now,createdAt:now}));return{...current,packagingInventoryMovements:[...current.packagingInventoryMovements,...movements],packagingAllocations:current.packagingAllocations.map(allocation=>{const index=allocations.findIndex(item=>item.id===allocation.id);return index<0?allocation:{...allocation,packagingInventoryMovementId:`pm-matrix-${index}`,unitCostSnapshot:1,costCurrencySnapshot:'NOK'}}),finishedGoodsMovements:[...current.finishedGoodsMovements,{id:'fgm-matrix-pack-receipt',finishedGoodsBatchId:'fg-matrix-pack',type:'ProductionReceipt',quantity:2,unit:'pcs',reason:'Packaging committed',referenceType:'ProductionRun',referenceId:'pr-matrix-pack',notes:'',occurredAt:now,createdAt:now}],finishedGoodsBatches:current.finishedGoodsBatches.map(batch=>batch.id==='fg-matrix-pack'?{...batch,status:'Active',updatedAt:now}:batch)}})
    const bottleLot=state.packagingInventoryLots.find(item=>item.id==='pl-bottle')!
    expect(packagingLotBalance(bottleLot,state.packagingInventoryMovements)).toBeLessThan(bottleLot.openingQuantity)

    await act('createFinishedGoodsBatch',current=>({...current,finishedGoodsBatches:[...current.finishedGoodsBatches,{id:'fg-matrix',finishedGoodsBatchNumber:'KF-FG-MATRIX',productionRunId:'pr-matrix',productId:'p1',formulaVersionId:'fv-bo-02',status:'Active',productionDate:'2026-07-15',initialQuantity:4,unit:'pcs',notes:'Verification output',createdAt:now,updatedAt:now}],finishedGoodsMovements:[...current.finishedGoodsMovements,{id:'fgm-matrix-receipt',finishedGoodsBatchId:'fg-matrix',type:'ProductionReceipt',quantity:4,unit:'pcs',reason:'Verification output',referenceType:'ProductionRun',referenceId:'pr-matrix',notes:'',occurredAt:now,createdAt:now}]}))
    await act('addFinishedGoodsMovement',current=>({...current,finishedGoodsMovements:[...current.finishedGoodsMovements,{id:'fgm-matrix-sample',finishedGoodsBatchId:'fg-matrix',type:'Sample',quantity:1,unit:'pcs',reason:'Verification sample',notes:'',occurredAt:now,createdAt:now}]}))
    expect(finishedGoodsBalance(state.finishedGoodsBatches.find(item=>item.id==='fg-matrix')!,state.finishedGoodsMovements)).toBe(3)

    const snapshot=[{formulaLineId:'fl-fv-bo-02-1',ingredientId:'i1',ingredientNameSnapshot:'Jojoba Oil',inciNameSnapshot:'SIMMONDSIA CHINENSIS SEED OIL',concentration:75}]
    await act('createComplianceDossier',current=>({...current,complianceDossiers:[...current.complianceDossiers,{id:'cd-matrix',productId:'p1',formulaVersionId:'fv-bo-02',packagingSpecificationVersionId:'pkgv-10',labelArtworkVersionId:'lav1',responsiblePersonId:'rp-demo',targetMarket:'Norway',targetLanguage:'Norwegian',status:'Draft',internalOwner:'Owner',notes:'Matrix compliance',compositionSnapshot:snapshot,createdAt:now,updatedAt:now}]}))
    await act('updateRegulatoryReview',current=>({...current,regulatoryReviews:current.regulatoryReviews.map(item=>item.id==='rr1'?{...item,sourceIds:[],notes:'Matrix source removal',updatedAt:now}:item)}))
    await act('updateRegulatoryReview',current=>({...current,regulatoryReviews:current.regulatoryReviews.map(item=>item.id==='rr1'?{...item,sourceIds:['rs1'],notes:'Matrix source add',updatedAt:'2026-07-15T12:02:30.000Z'}:item)}))
    const documentId=state.complianceDocuments[0].id
    await act('updatePifSection',current=>({...current,pifSections:current.pifSections.map(item=>item.id==='pif0'?{...item,documentIds:[documentId],notes:'Matrix document'}:item)}))
    expect(state.complianceDossiers.find(item=>item.id==='cd-matrix')?.compositionSnapshot).toEqual(snapshot)
    expect(state.regulatoryReviews.find(item=>item.id==='rr1')?.sourceIds).toEqual(['rs1'])
    expect(state.pifSections.find(item=>item.id==='pif0')?.documentIds).toEqual([documentId])
    await act('updateRegulatoryReview',current=>({...current,regulatoryReviews:current.regulatoryReviews.map(item=>item.id==='rr1'?{...item,sourceIds:[],updatedAt:'2026-07-15T12:03:00.000Z'}:item)}))
    await act('updatePifSection',current=>({...current,pifSections:current.pifSections.map(item=>item.id==='pif0'?{...item,documentIds:[]}:item)}))
    expect(state.regulatoryReviews.find(item=>item.id==='rr1')?.sourceIds).toEqual([])
    expect(state.pifSections.find(item=>item.id==='pif0')?.documentIds).toEqual([])

    await act('updateLaunchPlan',current=>({...current,launchPlans:current.launchPlans.map(item=>item.id==='lp1'?{...item,notes:'Matrix launch plan',updatedAt:now}:item)}))
    await act('recordLaunchDecision',current=>({...current,launchDecisions:[...current.launchDecisions,{id:'ld-matrix',launchPlanId:'lp1',decision:'Deferred',decidedAt:now,decidedBy:'Owner',complianceDossierId:'cd1',unresolvedBlockingIssues:['Evidence gap'],acknowledgedRisks:'Recorded',notes:'Matrix decision'}]}))
    expect(state.launchDecisions.find(item=>item.id==='ld-matrix')?.unresolvedBlockingIssues).toEqual(['Evidence gap'])

    expect(localStorage.getItem(localKey)).toBe('local-sentinel')
    const workspace=await supabase!.from('workspaces').select('id').eq('owner_id',ownerId).single()
    const joinCounts=await Promise.all([
      supabase!.from('compliance_composition_snapshots').select('*',{count:'exact',head:true}).eq('workspace_id',workspace.data!.id).eq('compliance_dossier_id','cd-matrix'),
      supabase!.from('regulatory_review_sources').select('*',{count:'exact',head:true}).eq('workspace_id',workspace.data!.id).eq('regulatory_review_id','rr1'),
      supabase!.from('pif_section_documents').select('*',{count:'exact',head:true}).eq('workspace_id',workspace.data!.id).eq('pif_section_id','pif0'),
    ])
    expect(joinCounts.map(result=>result.count)).toEqual([1,0,0])
    const relationalProductsBefore=await supabase!.from('products').select('*',{count:'exact',head:true}).eq('owner_id',ownerId)
    let localState=formulaSeed
    const localRepository=new LocalWorkspaceRepository({load:()=>localState,save:next=>{localState=next}})
    await applicationAction(localRepository,localState,'updateProduct',current=>({...current,products:current.products.map(item=>item.id==='p1'?{...item,description:'Local-only verification'}:item)}))
    expect(localState.products.find(item=>item.id==='p1')?.description).toBe('Local-only verification')
    expect((await supabase!.from('products').select('*',{count:'exact',head:true}).eq('owner_id',ownerId)).count).toBe(relationalProductsBefore.count)
    await supabase!.auth.signOut()
  },30_000)

  it('preserves the complete Reference Ingredient to received-lot workflow across refresh',async()=>{
    const{client,ownerId,email,password}=await ownerClient('ingredient-workflow')
    const imported=await client.rpc('import_v9_relational',{payload:relationalMigrationPayload(structuredClone(formulaSeed))})
    expect(imported.error).toBeNull()
    const reconciliation=reconciliationSnapshot(formulaSeed)
    expect((await client.rpc('complete_v9_reconciliation',{run_id:(imported.data as {migrationRunId:string}).migrationRunId,report:compareReconciliation(reconciliation,reconciliation)})).error).toBeNull()
    const workspace=await client.from('workspaces').select('id').eq('owner_id',ownerId).single()
    const supplier=await client.from('suppliers').insert({workspace_id:workspace.data!.id,owner_id:ownerId,legal_name:'Workflow Supplier AS',supplier_type:'raw_material',status:'research',internal_notes:'',is_preferred:false}).select('id').single()
    expect(supplier.error).toBeNull()
    expect((await supabase!.auth.signInWithPassword({email,password})).error).toBeNull()
    const repository=new SupabaseWorkspaceRepository()
    let state=await repository.load(ownerId)
    const act=async(action:WorkspaceActionName,mutation:WorkspaceStateMutation)=>{state=await applicationAction(repository,state,action,mutation)}
    const now='2026-07-17T12:00:00.000Z',verification={inci:'reviewed',supplierSpecification:'reviewed',sds:'reviewed',coa:'needs_review',allergenInformation:'not_applicable',shelfLife:'reviewed',origin:'reviewed',extractionMethod:'reviewed',processingMethod:'reviewed',ifra:'not_applicable',cosing:'reviewed'} satisfies SupplierProductVerification
    await act('adoptReferenceIngredient',current=>({...current,ingredients:[...current.ingredients,{id:'i-workflow',commonName:'Workflow Powder',inciName:'Workflow Powder INCI',category:'Active',functions:[],cosingFunctions:['ABSORBENT'],cosingVerificationStatus:'needs_review',referenceEntryId:'workflow-reference',adoptedReferenceVersion:2,adoptedReferenceSnapshot:{id:'workflow-reference'},referenceAdoptionKey:crypto.randomUUID(),description:'Reference research profile',defaultUnit:'mg',notes:'',status:'Research',createdAt:now,updatedAt:now}]}))
    const product=(id:string,size:number,preferred=false)=>({id,ingredientId:'i-workflow',supplierId:supplier.data!.id,supplierName:'Workflow Supplier AS',productName:`Workflow Powder ${size} g`,packageQuantity:size,packageUnit:'g' as const,price:size,currency:'NOK',notes:'Legacy/general note preserved',operationalNotes:'Order in dry season',verificationNotes:'CoA pending',isPreferred:preferred,grade:'Cosmetic Grade',supplierGrade:`WP-${size}`,declaredInci:'Supplier Workflow INCI',categorySnapshot:'Active',defaultInventoryUnit:'mg' as const,cosingFunctionsSnapshot:['ABSORBENT'],researchProfileSnapshot:'Reference research profile',referenceEntryId:'workflow-reference',origin:'Norway',processingMethod:'Milled',productStatus:'reviewing' as const,verification,createdAt:now,updatedAt:now})
    const movementsBefore=state.inventoryMovements.length
    await act('saveSupplierProduct',current=>({...current,supplierProducts:[...current.supplierProducts,product('sp-workflow-100',100)]}))
    await act('saveSupplierProduct',current=>({...current,supplierProducts:[...current.supplierProducts,product('sp-workflow-500',500)]}))
    expect(state.inventoryMovements).toHaveLength(movementsBefore)
    await act('markSupplierPreferred',current=>({...current,supplierProducts:current.supplierProducts.map(item=>item.ingredientId==='i-workflow'?{...item,isPreferred:item.id==='sp-workflow-100',updatedAt:now}:item)}))
    await act('markSupplierPreferred',current=>({...current,supplierProducts:current.supplierProducts.map(item=>item.ingredientId==='i-workflow'?{...item,isPreferred:item.id==='sp-workflow-500',updatedAt:'2026-07-17T12:01:00.000Z'}:item)}))
    expect(state.supplierProducts.filter(item=>item.ingredientId==='i-workflow'&&item.isPreferred).map(item=>item.id)).toEqual(['sp-workflow-500'])
    await act('receiveStock',current=>({...current,inventoryLots:[...current.inventoryLots,{id:'lot-workflow',ingredientId:'i-workflow',supplierProductId:'sp-workflow-500',internalLotNumber:'KF-ING-260717-001',supplierLotNumber:'SUP-LOT-1',receivedDate:'2026-07-17',openingQuantity:500000,unit:'mg',location:'Raw Materials',status:'Active',notes:'Physical batch',createdAt:now,updatedAt:now}],inventoryMovements:[...current.inventoryMovements,{id:'movement-workflow-receipt',inventoryLotId:'lot-workflow',type:'Receipt',quantity:500000,unit:'mg',reason:'Stock received',notes:'',occurredAt:now,createdAt:now}]}))
    const hydrated=await new SupabaseWorkspaceRepository().load(ownerId),hydratedProduct=hydrated.supplierProducts.find(item=>item.id==='sp-workflow-500')
    expect(hydrated.ingredients.find(item=>item.id==='i-workflow')).toMatchObject({status:'Research',referenceEntryId:'workflow-reference'})
    expect(hydratedProduct).toMatchObject({supplierId:supplier.data!.id,grade:'Cosmetic Grade',supplierGrade:'WP-500',processingMethod:'Milled',operationalNotes:'Order in dry season',verificationNotes:'CoA pending',notes:'Legacy/general note preserved',isPreferred:true})
    expect(hydratedProduct?.verification).toEqual(verification)
    expect(hydrated.inventoryLots.find(item=>item.id==='lot-workflow')).toMatchObject({supplierProductId:'sp-workflow-500',openingQuantity:500000,unit:'mg'})
    expect(hydrated.inventoryMovements.filter(item=>item.inventoryLotId==='lot-workflow')).toEqual([expect.objectContaining({id:'movement-workflow-receipt',type:'Receipt',quantity:500000,unit:'mg'})])
    await supabase!.auth.signOut()
  },30_000)

  it('persists a Product Studio concept and creates a Draft procurement plan without stock writes',async()=>{
    const{client,ownerId,email,password}=await ownerClient('product-studio')
    const conceptId=`studio-${crypto.randomUUID()}`
    const imported=await client.rpc('import_v9_relational',{payload:relationalMigrationPayload(structuredClone(formulaSeed))})
    expect(imported.error).toBeNull()
    const snapshot=reconciliationSnapshot(formulaSeed)
    expect((await client.rpc('complete_v9_reconciliation',{run_id:(imported.data as {migrationRunId:string}).migrationRunId,report:compareReconciliation(snapshot,snapshot)})).error).toBeNull()
    expect((await supabase!.auth.signInWithPassword({email,password})).error).toBeNull()
    const repository=new SupabaseWorkspaceRepository(),state=await repository.load(ownerId),beforeMovements=state.inventoryMovements.length,now='2026-07-18T09:00:00.000Z'
    const beforeLots=state.inventoryLots.length
    const beforeStockPolicies=(await client.from('stock_policies').select('*',{count:'exact',head:true}).eq('owner_id',ownerId)).count
    const saved=await applicationAction(repository,state,'saveProductStudioConcept',current=>({...current,productStudioConcepts:[...current.productStudioConcepts,{id:conceptId,name:'Hosted Beard Oil',productType:'beard_oil',intentMode:'design',desiredProperties:['Lightweight'],selectedIngredients:[{ingredientId:'i1',role:'liquid_base',essential:true}],scentDirections:['Scent-free'],candidateSubstitutes:{},notes:'Persistent concept',analysis:{profile:'predicted'},createdAt:now,updatedAt:now}]}))
    expect(saved.inventoryMovements).toHaveLength(beforeMovements)
    const hydrated=await new SupabaseWorkspaceRepository().load(ownerId)
    expect(hydrated.productStudioConcepts.find(item=>item.id===conceptId)).toMatchObject({id:conceptId,selectedIngredients:[{ingredientId:'i1',role:'liquid_base',essential:true}],analysis:{profile:'predicted'}})
    const productId=`studio-product-${crypto.randomUUID()}`,formulaId=`studio-formula-${crypto.randomUUID()}`,versionId=`studio-version-${crypto.randomUUID()}`,lineId=`studio-line-${crypto.randomUUID()}`
    const handedOff:FormulaState={...hydrated,products:[...hydrated.products,{id:productId,name:'Hosted Beard Oil',category:'Beard Care',status:'Active',developmentStage:'Formulation',description:'Studio handoff',currentDevelopmentFormulaVersionId:versionId,scentProfile:'Product Studio concept',createdAt:now,updatedAt:now}],formulas:[...hydrated.formulas,{id:formulaId,productId,name:'Hosted Beard Oil — Studio Draft',description:'Studio handoff',createdAt:now,updatedAt:now}],formulaVersions:[...hydrated.formulaVersions,{id:versionId,formulaId,version:'v0.1',status:'Draft',description:'Studio starting point',targetCharacteristics:'Physical testing required',createdAt:now,updatedAt:now}],formulaLines:[...hydrated.formulaLines,{id:lineId,formulaVersionId:versionId,ingredientId:'i1',percentage:100,phase:'Main blend',sortOrder:1,notes:'Structured composition',formulationRole:'liquid_base'}],productStudioConcepts:hydrated.productStudioConcepts.map(item=>item.id===conceptId?{...item,generatedProductId:productId,generatedFormulaId:formulaId,generatedFormulaVersionId:versionId,updatedAt:now}:item)}
    await repository.commit({action:'createFormulaFromStudio',previous:hydrated,next:handedOff})
    await repository.commit({action:'createFormulaFromStudio',previous:hydrated,next:handedOff})
    const formulaHydrated=await new SupabaseWorkspaceRepository().load(ownerId)
    expect(formulaHydrated.formulas.find(item=>item.id===formulaId)).toMatchObject({id:formulaId,productId})
    expect(formulaHydrated.formulaVersions.find(item=>item.id===versionId)).toMatchObject({id:versionId,formulaId,status:'Draft'})
    expect(formulaHydrated.formulaLines.filter(item=>item.formulaVersionId===versionId)).toEqual([expect.objectContaining({id:lineId,ingredientId:'i1',percentage:100})])
    expect(formulaHydrated.productStudioConcepts.find(item=>item.id===conceptId)).toMatchObject({generatedProductId:productId,generatedFormulaId:formulaId,generatedFormulaVersionId:versionId})
    expect((await client.from('formulas').select('*',{count:'exact',head:true}).eq('owner_id',ownerId).eq('id',formulaId)).count).toBe(1)
    const failedConceptId=`failed-${crypto.randomUUID()}`,failedProductId=`failed-product-${crypto.randomUUID()}`,failedFormulaId=`failed-formula-${crypto.randomUUID()}`,failedVersionId=`failed-version-${crypto.randomUUID()}`
    const beforeFailure=await new SupabaseWorkspaceRepository().load(ownerId)
    await repository.commit({action:'saveProductStudioConcept',previous:beforeFailure,next:{...beforeFailure,productStudioConcepts:[...beforeFailure.productStudioConcepts,{id:failedConceptId,name:'Failed handoff',productType:'beard_oil',intentMode:'design',desiredProperties:[],selectedIngredients:[],scentDirections:[],candidateSubstitutes:{},notes:'Must remain intact',analysis:{},createdAt:now,updatedAt:now}]}})
    const failed=await client.rpc('create_product_studio_formula_handoff',{concept_id:failedConceptId,product:{id:failedProductId,name:'Failed',category:'Beard Care',status:'Active',development_stage:'Formulation',description:'',scent_profile:'',created_at:now,updated_at:now},formula:{id:failedFormulaId,product_id:failedProductId,name:'Failed',description:'',created_at:now,updated_at:now},formula_version:{id:failedVersionId,formula_id:failedFormulaId,version:'v0.1',status:'Draft',description:'',target_characteristics:'',created_at:now,updated_at:now},formula_lines:[{id:`failed-line-${crypto.randomUUID()}`,formula_version_id:failedVersionId,ingredient_id:'missing-ingredient',percentage:100,phase:'Main blend',sort_order:1,notes:'',formulation_role:'liquid_base'}]})
    expect(failed.error).not.toBeNull()
    expect((await client.from('products').select('*',{count:'exact',head:true}).eq('owner_id',ownerId).eq('id',failedProductId)).count).toBe(0)
    expect((await client.from('formulas').select('*',{count:'exact',head:true}).eq('owner_id',ownerId).eq('id',failedFormulaId)).count).toBe(0)
    expect((await client.from('formula_versions').select('*',{count:'exact',head:true}).eq('owner_id',ownerId).eq('id',failedVersionId)).count).toBe(0)
    expect((await client.from('product_studio_concepts').select('generated_formula_id').eq('owner_id',ownerId).eq('id',failedConceptId).single()).data?.generated_formula_id).toBeNull()
    const lines=[{inventoryDomain:'raw_material',supplierProductId:'sp1',description:'Jojoba top-up',quantity:100,unit:'g',reason:'Below target',basis:{ruleId:'studio.inventory'},displayOrder:0}]
    const plan=await client.rpc('create_product_studio_purchase_plan',{concept_id:conceptId,lines})
    expect(plan.error).toBeNull()
    expect((await client.from('purchase_plans').select('status,source_type,source_id').eq('owner_id',ownerId).eq('source_type','product_studio_concept').eq('source_id',conceptId)).data).toEqual([{status:'draft',source_type:'product_studio_concept',source_id:conceptId}])
    expect((await client.from('purchase_plan_lines').select('description,inventory_domain,supplier_product_id,planned_quantity,unit,requirement_reason,requirement_basis,display_order').eq('purchase_plan_id',plan.data!).single()).data).toEqual({description:'Jojoba top-up',inventory_domain:'raw_material',supplier_product_id:'sp1',planned_quantity:100,unit:'g',requirement_reason:'Below target',requirement_basis:{ruleId:'studio.inventory'},display_order:0})
    expect((await client.from('product_studio_concepts').select('procurement_plan_id').eq('owner_id',ownerId).eq('id',conceptId).single()).data?.procurement_plan_id).toBe(plan.data)
    const repeated=await client.rpc('create_product_studio_purchase_plan',{concept_id:conceptId,lines})
    expect(repeated.error).toBeNull()
    expect(repeated.data).toBe(plan.data)
    expect((await client.from('purchase_plans').select('*',{count:'exact',head:true}).eq('owner_id',ownerId).eq('source_type','product_studio_concept').eq('source_id',conceptId)).count).toBe(1)
    const after=await new SupabaseWorkspaceRepository().load(ownerId)
    expect(after.inventoryLots).toHaveLength(beforeLots)
    expect(after.inventoryMovements).toHaveLength(beforeMovements)
    expect((await client.from('inventory_movements').select('*',{count:'exact',head:true}).eq('owner_id',ownerId).in('type',['Receipt','Consumption'])).count).toBe(state.inventoryMovements.filter(item=>item.type==='Receipt'||item.type==='Consumption').length)
    expect((await client.from('stock_policies').select('*',{count:'exact',head:true}).eq('owner_id',ownerId)).count).toBe(beforeStockPolicies)
    await supabase!.auth.signOut()
  },30_000)

  it('round-trips Beard Butter phase and Lab process metadata without planning inventory writes',async()=>{
    const{client,ownerId,email,password}=await ownerClient('beard-butter')
    const imported=await client.rpc('import_v9_relational',{payload:relationalMigrationPayload(structuredClone(formulaSeed))})
    expect(imported.error).toBeNull()
    const snapshot=reconciliationSnapshot(formulaSeed)
    expect((await client.rpc('complete_v9_reconciliation',{run_id:(imported.data as {migrationRunId:string}).migrationRunId,report:compareReconciliation(snapshot,snapshot)})).error).toBeNull()
    expect((await supabase!.auth.signInWithPassword({email,password})).error).toBeNull()
    const repository=new SupabaseWorkspaceRepository(),state=await repository.load(ownerId),beforeLots=state.inventoryLots.length,beforeMovements=state.inventoryMovements.length,now='2026-07-18T12:00:00.000Z'
    const phaseDefinitions=[{code:'A',name:'Heat phase',order:1,minimumTemperature:65,maximumTemperature:75,instructions:'Melt until homogeneous.'},{code:'C',name:'Sensitive additions',order:2,maximumTemperature:40,instructions:'Add below 40 C.'}]
    const manufacturingProcess=[{order:1,title:'Melt',instruction:'Melt Phase A.',phaseCode:'A',minimumTemperature:65,maximumTemperature:75,critical:true},{order:2,title:'Cool-down',instruction:'Add Phase C.',phaseCode:'C',maximumTemperature:40,critical:true}]
    const concept={id:`butter-${crypto.randomUUID()}`,name:'Integration Beard Butter',productType:'beard_butter' as const,intentMode:'design' as const,desiredProperties:['Firm butter'],selectedIngredients:[{ingredientId:'i1',role:'liquid oil',essential:true}],scentDirections:['Subtle'],candidateSubstitutes:{},notes:'Draft only',analysis:{targets:{firmness:'Medium'},variants:[]},createdAt:now,updatedAt:now}
    const version=state.formulaVersions.find(item=>item.id==='fv-bb-01')!
    const batch=state.labBatches[0],stepId=`butter-step-${crypto.randomUUID()}`
    const next={...state,productStudioConcepts:[...state.productStudioConcepts,concept],formulaVersions:state.formulaVersions.map(item=>item.id===version.id?{...item,phaseDefinitions,manufacturingProcess,updatedAt:now}:item),formulaLines:state.formulaLines.map(item=>item.formulaVersionId===version.id&&item.percentage===1?{...item,percentage:4}:item),labBatches:state.labBatches.map(item=>item.id===batch.id?{...item,fillCount:4,packagingUsed:'Wide-mouth jar',deviations:'None',finalTextureObservations:'Smooth initial set'}:item),processSteps:[...state.processSteps,{id:stepId,labBatchId:batch.id,stepNumber:99,title:'Controlled cool-down',instruction:'Cool while stirring.',phaseCode:'C',maximumTemperature:40,actualTemperature:38,durationMinutes:10,mixingMethod:'Stirring',mixingIntensity:'Gentle',completionCriteria:'Uniform texture',critical:true,operatorNote:'No visible separation',status:'Pending' as const,notes:''}]}
    await repository.commit({action:'saveProductStudioConcept',previous:state,next})
    const hydrated=await new SupabaseWorkspaceRepository().load(ownerId)
    expect(hydrated.productStudioConcepts.find(item=>item.id===concept.id)?.productType).toBe('beard_butter')
    expect(hydrated.formulaVersions.find(item=>item.id===version.id)).toMatchObject({phaseDefinitions,manufacturingProcess})
    expect(hydrated.processSteps.find(item=>item.id===stepId)).toMatchObject({phaseCode:'C',maximumTemperature:40,actualTemperature:38,critical:true,operatorNote:'No visible separation'})
    expect(hydrated.labBatches.find(item=>item.id===batch.id)).toMatchObject({fillCount:4,packagingUsed:'Wide-mouth jar',finalTextureObservations:'Smooth initial set'})
    expect(hydrated.inventoryLots).toHaveLength(beforeLots)
    expect(hydrated.inventoryMovements).toHaveLength(beforeMovements)
    const variantId=crypto.randomUUID(),experiment=await client.rpc('create_development_experiment',{plan:{title:'Beard Butter metadata preservation',experimentType:'process_adjustment',objective:'Verify controlled handoff metadata',hypothesis:'Phase metadata survives',productId:state.formulas.find(item=>item.id===version.formulaId)!.productId,baseFormulaVersionId:version.id,idempotencyKey:crypto.randomUUID(),variants:[{id:variantId,name:'Control',purpose:'Metadata handoff',isControl:true,displayOrder:0,changes:[]}],observationPrompts:[]}})
    expect(experiment.error).toBeNull()
    expect((await client.rpc('transition_development_experiment',{target_id:experiment.data!,target_status:'ready_for_review',expected_revision:1,note:null})).error).toBeNull()
    expect((await client.rpc('transition_development_experiment',{target_id:experiment.data!,target_status:'approved',expected_revision:2,note:null})).error).toBeNull()
    const branchKey=crypto.randomUUID(),branch=await client.rpc('create_formula_branch_from_experiment',{target_experiment:experiment.data!,target_variant:variantId,idempotency:branchKey})
    expect(branch.error).toBeNull()
    expect((await client.rpc('create_formula_branch_from_experiment',{target_experiment:experiment.data!,target_variant:variantId,idempotency:branchKey})).data).toBe(branch.data)
    expect((await client.from('formula_versions').select('phase_definitions,manufacturing_process').eq('id',branch.data!).single()).data).toMatchObject({phase_definitions:expect.any(Array),manufacturing_process:expect.any(Array)})
    const labKey=crypto.randomUUID(),lab=await client.rpc('create_lab_batch_from_experiment',{target_experiment:experiment.data!,target_variant:variantId,formula_version:branch.data!,batch_size:100,batch_unit:'g',idempotency:labKey})
    expect(lab.error).toBeNull()
    expect((await client.rpc('create_lab_batch_from_experiment',{target_experiment:experiment.data!,target_variant:variantId,formula_version:branch.data!,batch_size:100,batch_unit:'g',idempotency:labKey})).data).toBe(lab.data)
    const handedOffSteps=await client.from('lab_process_steps').select('phase_code,critical').eq('lab_batch_id',lab.data!).order('step_number')
    expect(handedOffSteps.error).toBeNull()
    expect(handedOffSteps.data).toHaveLength(manufacturingProcess.length)
    expect(handedOffSteps.data?.[0]).toMatchObject({phase_code:'A',critical:true})
    expect((await client.from('inventory_movements').select('*',{count:'exact',head:true}).eq('owner_id',ownerId)).count).toBe(beforeMovements)
    const other=await ownerClient('beard-butter-isolation')
    expect((await other.client.from('product_studio_concepts').select('id').eq('id',concept.id)).data).toHaveLength(0)
    await supabase!.auth.signOut()
  },30_000)
})
