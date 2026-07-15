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

export function relationalMigrationPayload(state: FormulaState) {
  return Object.fromEntries(Object.entries(state).map(([collection, records]) => [collection, toDatabaseValue(records)]))
}

const embeddedColumns: Partial<Record<keyof FormulaState, string[]>> = {
  testTemplates:['questions'],testResponses:['answers'],complianceDossiers:['composition_snapshot'],regulatoryReviews:['source_ids'],pifSections:['document_ids'],
}

const requiresAtomicRpc = new Set([
  'commitBatchConsumption','commitProductionConsumption','commitPackagingConsumption','createFinishedGoodsBatch',
])

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
    return result.data as { workspaceId: string; ownerId: string; counts: Record<string, number>; state: string }
  }

  async completeReconciliation(migrationRunId: string, report: Json) {
    if (!supabase) throw new Error('Supabase is not configured.')
    const result = await supabase.rpc('complete_v9_reconciliation', { run_id: migrationRunId, report })
    if (result.error) throw result.error
  }

  async commit(change: WorkspaceCommit) {
    if (!supabase) throw new Error('Supabase is not configured.')
    if (requiresAtomicRpc.has(change.action)) throw new Error(`${change.action} requires its dedicated transactional RPC before Supabase runtime selection.`)
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Authenticated owner required.')
    const workspace = await supabase.from('workspaces').select('id').eq('owner_id', user.id).single()
    if (workspace.error) throw workspace.error
    const client: SupabaseClient = supabase
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
      }
    }
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
      result[collection] = toDomainValue(response.data) as unknown[]
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
    for (const template of templates) template.questions = (questions.data ?? []).filter(row => row.test_template_id === template.id).map(row => toDomainValue(row))
    const responses = state.testResponses as Array<Record<string, unknown>>
    for (const response of responses) response.answers = (answers.data ?? []).filter(row => row.test_response_id === response.id).map(row => ({ questionId: row.question_id, value: row.value }))
    const dossiers = state.complianceDossiers as Array<Record<string, unknown>>
    for (const dossier of dossiers) dossier.compositionSnapshot = (composition.data ?? []).filter(row => row.compliance_dossier_id === dossier.id).map(row => toDomainValue(row))
    const reviews = state.regulatoryReviews as Array<Record<string, unknown>>
    for (const review of reviews) review.sourceIds = (reviewSources.data ?? []).filter(row => row.regulatory_review_id === review.id).map(row => row.regulatory_source_id)
    const sections = state.pifSections as Array<Record<string, unknown>>
    for (const section of sections) section.documentIds = (pifDocuments.data ?? []).filter(row => row.pif_section_id === section.id).map(row => row.document_id)
  }
}
