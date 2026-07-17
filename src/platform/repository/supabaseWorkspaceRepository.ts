import type { FormulaState } from '../../types/domain'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '../supabase/generated/database.types'
import { supabase } from '../supabase/client'
import type { WorkspaceRepository } from './workspaceRepository'
import { changedCollections } from './workspaceRepository'
import type { WorkspaceCommit } from '../actions/workspaceActions'

export const relationalTableByCollection: Record<keyof FormulaState, string> = {
  products:'products',formulas:'formulas',formulaVersions:'formula_versions',formulaLines:'formula_lines',ingredients:'ingredients',supplierProducts:'supplier_products',inventoryLots:'inventory_lots',inventoryMovements:'inventory_movements',labBatches:'lab_batches',labBatchLines:'lab_batch_lines',labBatchAllocations:'lab_lot_allocations',processSteps:'lab_process_steps',labObservations:'lab_observations',testers:'testers',testTemplates:'test_templates',testSessions:'test_sessions',testResponses:'test_responses',productionRuns:'production_runs',productionRunLines:'production_run_lines',productionRunAllocations:'production_lot_allocations',productionProcessSteps:'production_process_steps',costLines:'cost_lines',packagingComponents:'packaging_components',packagingSupplierProducts:'packaging_supplier_products',packagingInventoryLots:'packaging_inventory_lots',packagingInventoryMovements:'packaging_inventory_movements',packagingSpecifications:'packaging_specifications',packagingSpecificationVersions:'packaging_specification_versions',packagingSpecificationLines:'packaging_specification_lines',packagingAllocations:'packaging_allocations',finishedGoodsBatches:'finished_goods_batches',finishedGoodsMovements:'finished_goods_movements',responsiblePersons:'responsible_persons',complianceDossiers:'compliance_dossiers',complianceDocuments:'compliance_documents',regulatorySources:'regulatory_sources',regulatoryReviews:'regulatory_reviews',pifSections:'pif_evidence_sections',cpsrRecords:'cpsr_records',labelArtworkVersions:'label_artwork_versions',labelReviewItems:'label_checklist_items',inciDrafts:'inci_declarations',claims:'claims',claimEvidence:'claim_evidence',cpnpRecords:'cpnp_records',readinessIssues:'readiness_issues',launchPlans:'launch_plans',launchMilestones:'launch_milestones',launchDecisions:'launch_decisions',safetyEffectRecords:'undesirable_effect_records',
}

const snake = (value: string) => value.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
const camel = (value: string) => value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())

export function toDatabaseValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toDatabaseValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [snake(key), toDatabaseValue(child)]))
}

export function toDomainValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toDomainValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['workspace_id','owner_id'].includes(key)).map(([key, child]) => [camel(key), toDomainValue(child)]))
}

export function normalizeProductRow(value: unknown) {
  const product = toDomainValue(value) as Record<string, unknown>
  const target = product.targetLaunchDate
  if (target == null || target === '') delete product.targetLaunchDate
  return product
}

export function relationalMigrationPayload(state: FormulaState) {
  return Object.fromEntries(Object.entries(state).map(([collection, records]) => [collection, toDatabaseValue(records)]))
}

const embeddedColumns: Partial<Record<keyof FormulaState, string[]>> = {
  testTemplates:['questions'],testResponses:['answers'],complianceDossiers:['composition_snapshot'],regulatoryReviews:['source_ids'],pifSections:['document_ids'],
}

export class SupabaseWorkspaceRepository implements WorkspaceRepository {
  readonly kind = 'supabase' as const
  async importV9(_ownerId: string, state: FormulaState, onStage?: (stage: string) => void) {
    if (!supabase) throw new Error('Supabase is not configured.')
    onStage?.('transactional relational import')
    const result = await supabase.rpc('import_v9_relational', { payload: relationalMigrationPayload(state) as Json })
    if (result.error) {
      await supabase.rpc('record_v9_migration_failure', { error_message: result.error.message })
      throw new Error(result.error.message)
    }
    return result.data as { migrationRunId:string;workspaceId: string; ownerId: string; counts: Record<string, number>; state: string }
  }

  async completeReconciliation(migrationRunId: string, report: Json) {
    if (!supabase) throw new Error('Supabase is not configured.')
    const result = await supabase.rpc('complete_v9_reconciliation', { run_id: migrationRunId, report })
    if (result.error) throw result.error
  }

  async commit(change: WorkspaceCommit) {
    if (!supabase) throw new Error('Supabase is not configured.')
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Authenticated owner required.')
    const workspace = await supabase.from('workspaces').select('id').eq('owner_id', user.id).single()
    if (workspace.error) throw workspace.error
    const client: SupabaseClient = supabase
    if (await this.commitAtomic(change, client)) return
    for (const collection of changedCollections(change)) {
      const table = relationalTableByCollection[collection]
      const previous = change.previous[collection] as Array<{id:string;updatedAt?:string}>
      const next = change.next[collection] as Array<{id:string;updatedAt?:string}>
      const nextIds = new Set(next.map(record => record.id))
      const removed = previous.filter(record => !nextIds.has(record.id)).map(record => record.id)
      if (removed.length) {
        const deleted = await client.from(table).delete().eq('workspace_id', workspace.data.id).in('id', removed)
        if (deleted.error) throw deleted.error
      }
      const previousById = new Map(previous.map(record => [record.id, record]))
      for (const record of next.filter(candidate => previousById.get(candidate.id) !== candidate)) {
        const row = toDatabaseValue(record) as Record<string, unknown>
        for (const key of embeddedColumns[collection] ?? []) delete row[key]
        Object.assign(row,{workspace_id:workspace.data.id,owner_id:user.id})
        const existing = previousById.get(record.id)
        if (!existing) {
          const inserted = await client.from(table).insert(row)
          if (inserted.error) throw inserted.error
        } else {
          let update = client.from(table).update(row).eq('workspace_id',workspace.data.id).eq('id',record.id)
          if (existing.updatedAt) update = update.eq('updated_at',existing.updatedAt)
          const updated = await update.select('id')
          if (updated.error) throw updated.error
          if (!updated.data?.length) throw new Error(`Conflict updating ${table}.${record.id}; refresh and retry.`)
        }
        await this.persistEmbedded(collection, record as Record<string, unknown>, workspace.data.id, user.id, client)
      }
    }
  }

  private async persistEmbedded(collection:keyof FormulaState,record:Record<string,unknown>,workspaceId:string,ownerId:string,client:SupabaseClient) {
    const replace = async (table:string,parentColumn:string,parentId:string,rows:Record<string,unknown>[]) => {
      const removed=await client.from(table).delete().eq('workspace_id',workspaceId).eq(parentColumn,parentId)
      if(removed.error)throw removed.error
      if(rows.length){const inserted=await client.from(table).insert(rows);if(inserted.error)throw inserted.error}
    }
    if(collection==='testTemplates') await replace('test_template_questions','test_template_id',String(record.id),((record.questions??[]) as Array<Record<string,unknown>>).map(question=>({workspace_id:workspaceId,owner_id:ownerId,test_template_id:record.id,...toDatabaseValue(question) as object})))
    if(collection==='testResponses') await replace('test_response_answers','test_response_id',String(record.id),((record.answers??[]) as Array<Record<string,unknown>>).map(answer=>({workspace_id:workspaceId,owner_id:ownerId,test_response_id:record.id,question_id:answer.questionId,value:answer.value})))
    if(collection==='complianceDossiers') await replace('compliance_composition_snapshots','compliance_dossier_id',String(record.id),((record.compositionSnapshot??[]) as Array<Record<string,unknown>>).map(snapshot=>({workspace_id:workspaceId,owner_id:ownerId,compliance_dossier_id:record.id,...toDatabaseValue(snapshot) as object})))
    if(collection==='regulatoryReviews') await replace('regulatory_review_sources','regulatory_review_id',String(record.id),((record.sourceIds??[]) as string[]).map(sourceId=>({workspace_id:workspaceId,owner_id:ownerId,regulatory_review_id:record.id,regulatory_source_id:sourceId})))
    if(collection==='pifSections') await replace('pif_section_documents','pif_section_id',String(record.id),((record.documentIds??[]) as string[]).map(documentId=>({workspace_id:workspaceId,owner_id:ownerId,pif_section_id:record.id,document_id:documentId})))
  }

  private async commitAtomic(change: WorkspaceCommit, client: SupabaseClient) {
    if(change.action==='markSupplierPreferred'){
      const selected=change.next.supplierProducts.find(item=>item.isPreferred&&!change.previous.supplierProducts.find(previous=>previous.id===item.id)?.isPreferred)
      if(!selected)return true
      const previous=change.previous.supplierProducts.find(item=>item.id===selected.id)!
      const result=await client.rpc('mark_supplier_product_preferred',{p_product_id:selected.id,p_expected_updated_at:previous.updatedAt,p_new_updated_at:selected.updatedAt})
      if(result.error)throw new Error(result.error.message)
      return true
    }
    if(change.action==='markPackagingSupplierPreferred'){
      const selected=change.next.packagingSupplierProducts.find(item=>item.isPreferred&&!change.previous.packagingSupplierProducts.find(previous=>previous.id===item.id)?.isPreferred)
      if(!selected)return true
      const previous=change.previous.packagingSupplierProducts.find(item=>item.id===selected.id)!
      const result=await client.rpc('mark_packaging_supplier_product_preferred',{p_product_id:selected.id,p_expected_updated_at:previous.updatedAt,p_new_updated_at:selected.updatedAt})
      if(result.error)throw new Error(result.error.message)
      return true
    }
    if (change.action === 'commitBatchConsumption') {
      const movements = change.next.inventoryMovements.filter(item => !change.previous.inventoryMovements.some(previous => previous.id === item.id) && item.referenceType === 'LabBatch')
      const commits = change.next.labBatchAllocations.filter(item => item.inventoryMovementId && !change.previous.labBatchAllocations.find(previous => previous.id === item.id)?.inventoryMovementId).map(allocation => { const movement=movements.find(item=>item.id===allocation.inventoryMovementId)!;return{allocation_id:allocation.id,movement_id:movement.id,notes:movement.notes,occurred_at:movement.occurredAt,created_at:movement.createdAt} })
      const batchId = movements[0]?.referenceId
      const result = await client.rpc('commit_lab_consumption',{batch_id:batchId,commits})
      if (result.error) throw result.error
      return true
    }
    if (change.action === 'commitProductionConsumption') {
      const movements = change.next.inventoryMovements.filter(item => !change.previous.inventoryMovements.some(previous => previous.id === item.id) && item.referenceType === 'ProductionRun')
      const commits = change.next.productionRunAllocations.filter(item => item.inventoryMovementId && !change.previous.productionRunAllocations.find(previous => previous.id === item.id)?.inventoryMovementId).map(allocation => { const movement=movements.find(item=>item.id===allocation.inventoryMovementId)!;return{allocation_id:allocation.id,movement_id:movement.id,notes:movement.notes,occurred_at:movement.occurredAt,created_at:movement.createdAt} })
      const result = await client.rpc('commit_production_consumption',{run_id:movements[0]?.referenceId,commits})
      if (result.error) throw result.error
      return true
    }
    if (change.action === 'commitPackagingConsumption') {
      const movements = change.next.packagingInventoryMovements.filter(item => !change.previous.packagingInventoryMovements.some(previous => previous.id === item.id) && item.referenceType === 'FinishedGoodsBatch')
      const commits = change.next.packagingAllocations.filter(item => item.packagingInventoryMovementId && !change.previous.packagingAllocations.find(previous => previous.id === item.id)?.packagingInventoryMovementId).map(allocation => { const movement=movements.find(item=>item.id===allocation.packagingInventoryMovementId)!;return{allocation_id:allocation.id,movement_id:movement.id,occurred_at:movement.occurredAt,created_at:movement.createdAt} })
      const receipt = change.next.finishedGoodsMovements.find(item => !change.previous.finishedGoodsMovements.some(previous => previous.id === item.id) && item.type === 'ProductionReceipt')
      const result = await client.rpc('commit_packaging_consumption',{target_finished_goods_batch_id:receipt?.finishedGoodsBatchId,commits,receipt:{id:receipt?.id,occurred_at:receipt?.occurredAt,created_at:receipt?.createdAt}})
      if (result.error) throw result.error
      return true
    }
    if (change.action === 'createFinishedGoodsBatch') {
      const batch = change.next.finishedGoodsBatches.find(item => !change.previous.finishedGoodsBatches.some(previous => previous.id === item.id))
      if (!batch) throw new Error('Finished Goods Batch mutation is missing its new record.')
      const receipt = change.next.finishedGoodsMovements.find(item => !change.previous.finishedGoodsMovements.some(previous => previous.id === item.id) && item.finishedGoodsBatchId === batch.id)
      const batchRow = toDatabaseValue(batch) as Record<string,unknown>
      const receiptRow = receipt ? toDatabaseValue(receipt) as Record<string,unknown> : null
      const result = await client.rpc('register_finished_goods_output',{batch:batchRow,receipt:receiptRow})
      if (result.error) throw result.error
      return true
    }
    return false
  }

  async load(ownerId?: string): Promise<FormulaState> {
    if (!supabase) throw new Error('Supabase is not configured.')
    if (!ownerId) {
      const auth = await supabase.auth.getUser()
      if (auth.error || !auth.data.user) throw new Error('Authenticated owner required.')
      ownerId = auth.data.user.id
    }
    const result: Partial<Record<keyof FormulaState, unknown[]>> = {}
    const client: SupabaseClient = supabase
    for (const [collection, table] of Object.entries(relationalTableByCollection) as Array<[keyof FormulaState, string]>) {
      const response = await client.from(table).select('*').eq('owner_id', ownerId)
      if (response.error) throw new Error(`${table}: ${response.error.message}`)
      result[collection] = collection === 'products'
        ? (response.data ?? []).map(normalizeProductRow)
        : toDomainValue(response.data) as unknown[]
    }
    await this.loadEmbeddedChildren(result, ownerId)
    return result as FormulaState
  }

  private async loadEmbeddedChildren(state: Partial<Record<keyof FormulaState, unknown[]>>, ownerId: string) {
    if (!supabase) return
    const [questions, answers, composition, reviewSources, pifDocuments] = await Promise.all([
      supabase.from('test_template_questions').select('*').eq('owner_id', ownerId),
      supabase.from('test_response_answers').select('*').eq('owner_id', ownerId),
      supabase.from('compliance_composition_snapshots').select('*').eq('owner_id', ownerId),
      supabase.from('regulatory_review_sources').select('*').eq('owner_id', ownerId),
      supabase.from('pif_section_documents').select('*').eq('owner_id', ownerId),
    ])
    for (const response of [questions, answers, composition, reviewSources, pifDocuments]) if (response.error) throw response.error
    const templates = state.testTemplates as Array<Record<string, unknown>>
    for (const template of templates) template.questions = (questions.data ?? []).filter(row => row.test_template_id === template.id).map(row => ({id:row.id,prompt:row.prompt,type:row.type,sortOrder:Number(row.sort_order),...(row.choices?{choices:row.choices}:{})}))
    const responses = state.testResponses as Array<Record<string, unknown>>
    for (const response of responses) response.answers = (answers.data ?? []).filter(row => row.test_response_id === response.id).map(row => ({ questionId: row.question_id, value: row.value }))
    const dossiers = state.complianceDossiers as Array<Record<string, unknown>>
    for (const dossier of dossiers) dossier.compositionSnapshot = (composition.data ?? []).filter(row => row.compliance_dossier_id === dossier.id).map(row => ({formulaLineId:row.formula_line_id,ingredientId:row.ingredient_id,ingredientNameSnapshot:row.ingredient_name_snapshot,inciNameSnapshot:row.inci_name_snapshot,concentration:Number(row.concentration)}))
    const reviews = state.regulatoryReviews as Array<Record<string, unknown>>
    for (const review of reviews) review.sourceIds = (reviewSources.data ?? []).filter(row => row.regulatory_review_id === review.id).map(row => row.regulatory_source_id)
    const sections = state.pifSections as Array<Record<string, unknown>>
    for (const section of sections) section.documentIds = (pifDocuments.data ?? []).filter(row => row.pif_section_id === section.id).map(row => row.document_id)
  }
}
