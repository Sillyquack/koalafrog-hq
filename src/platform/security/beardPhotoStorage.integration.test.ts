import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { formulaSeed } from '../../data/formulaSeed'
import { compareReconciliation, reconciliationSnapshot } from '../migration/v9Migration'
import { relationalMigrationPayload } from '../repository/supabaseWorkspaceRepository'

const url = import.meta.env.VITE_SUPABASE_TEST_URL as string | undefined
const serviceKey = import.meta.env.VITE_SUPABASE_TEST_SERVICE_ROLE_KEY as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_TEST_ANON_KEY as string | undefined
const run = url && serviceKey && anonKey ? describe : describe.skip

run('beard photo temporary storage isolation', () => {
  let admin: SupabaseClient
  let owner: SupabaseClient
  let otherOwner: SupabaseClient
  let anonymous: SupabaseClient
  let ownerId = ''
  let workspaceId = ''
  const createdUsers: string[] = []

  const createOwner = async (label: string) => {
    const email = `beard-photo-${label}-${crypto.randomUUID()}@example.test`
    const password = `Local-${crypto.randomUUID()}-9a!`
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error) throw created.error
    createdUsers.push(created.data.user.id)
    const client = createClient(url!, anonKey!, { auth: { persistSession: false } })
    const signedIn = await client.auth.signInWithPassword({ email, password })
    if (signedIn.error) throw signedIn.error
    const imported = await client.rpc('import_v9_relational', {
      payload: relationalMigrationPayload(formulaSeed),
    })
    if (imported.error) throw imported.error
    const completed = await client.rpc('complete_v9_reconciliation', {
      run_id: (imported.data as { migrationRunId: string }).migrationRunId,
      report: compareReconciliation(
        reconciliationSnapshot(formulaSeed),
        reconciliationSnapshot(formulaSeed),
      ),
    })
    if (completed.error) throw completed.error
    return {
      client,
      ownerId: created.data.user.id,
      workspaceId: (imported.data as { workspaceId: string }).workspaceId,
    }
  }

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false } })
    anonymous = createClient(url!, anonKey!, { auth: { persistSession: false } })
    const first = await createOwner('owner')
    const second = await createOwner('other')
    owner = first.client
    ownerId = first.ownerId
    workspaceId = first.workspaceId
    otherOwner = second.client
  }, 30_000)

  afterAll(async () => {
    for (const id of createdUsers) await admin.auth.admin.deleteUser(id)
  })

  it('permits only the owning user path and supports explicit cleanup', async () => {
    expect((await owner.auth.getUser()).data.user?.id).toBe(ownerId)
    expect(
      (await owner.from('workspaces').select('id,lifecycle_state').eq('id', workspaceId).single()).data,
    ).toMatchObject({ id: workspaceId, lifecycle_state: 'active' })
    const analysisId = crypto.randomUUID()
    const objectPath = `${workspaceId}/${ownerId}/${analysisId}/front.png`
    const image = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {
      type: 'image/png',
    })

    expect((await owner.storage.from('beard-analysis-images').upload(objectPath, image)).error).toBeNull()
    expect((await owner.storage.from('beard-analysis-images').download(objectPath)).error).toBeNull()
    expect((await otherOwner.storage.from('beard-analysis-images').download(objectPath)).error).not.toBeNull()
    expect((await anonymous.storage.from('beard-analysis-images').download(objectPath)).error).not.toBeNull()

    const forgedPath = `${workspaceId}/${crypto.randomUUID()}/${analysisId}/left_profile.png`
    expect((await owner.storage.from('beard-analysis-images').upload(forgedPath, image)).error).not.toBeNull()

    expect((await owner.storage.from('beard-analysis-images').remove([objectPath])).error).toBeNull()
    expect((await owner.storage.from('beard-analysis-images').download(objectPath)).error).not.toBeNull()
  })

  it('maps stable provider keys to internal ids and normalized relationships', async () => {
    const profileId = crypto.randomUUID()
    const analysisId = crypto.randomUUID()
    const correlationId = crypto.randomUUID()
    expect((await owner.from('beard_profiles').insert({
      id: profileId, workspace_id: workspaceId, owner_id: ownerId,
      name: 'Stable key fixture', status: 'Draft', style_name: 'Test style',
      maintenance_frequency_days: 7, preferred_overall_length_mm: 9,
      density: 'medium', texture: 'wavy',
    })).error).toBeNull()
    expect((await admin.from('intelligence_analyses').insert({
      id: analysisId, workspace_id: workspaceId, owner_user_id: ownerId,
      source_module: 'beard-studio', analysis_type: 'beard_photo_analysis',
      schema_version: 2, contract_version: 'beard-photo-result-contract-v2',
      prompt_version: 'beard-photo-analysis-v4', status: 'staging',
      idempotency_key: crypto.randomUUID(), profile_id: profileId,
      context_manifest: {}, correlation_id: correlationId,
    })).error).toBeNull()
    expect((await owner.rpc('begin_beard_provider_attempt', {
      candidate_workspace_id: workspaceId,
      candidate_analysis_id: analysisId,
      candidate_provider: 'openai',
      candidate_model: 'gpt-5',
      candidate_prompt_version: 'beard-photo-analysis-v4',
    })).data).toBe(true)
    const observationKeys = ['front_density_distribution', 'side_symmetry_difference']
    const recommendationIds = [crypto.randomUUID(), crypto.randomUUID()]
    const observations = observationKeys.map(observationKey => ({
      observationKey, category: 'density', statement: 'A visible grooming fact.',
      confidence: 0.8, supportingViews: ['front'],
      evidenceDescription: 'Visible in the supplied view.', limitations: [],
      relatedBeardZones: [],
    }))
    const recommendations = recommendationIds.map((id, index) => ({
      id, title: 'Conservative review', reason: 'Supported by visible evidence.',
      confidence: 0.7, priority: 'low', expectedBenefit: 'A cautious plan.',
      supportingObservationKeys: index === 0 ? observationKeys : [observationKeys[0]],
      affectedZones: [], toolConstraints: [], proposedGuardStrategy: null,
      status: 'undecided',
    }))
    const persisted = await admin.rpc('persist_beard_analysis_result', {
      candidate_workspace_id: workspaceId,
      candidate_analysis_id: analysisId,
      candidate_correlation_id: correlationId,
      candidate_result: { schemaVersion: 2, contractVersion: 'beard-photo-result-contract-v2' },
      candidate_observations: observations,
      candidate_recommendations: recommendations,
      candidate_provider_usage: null,
    })
    expect(persisted.error).toBeNull()
    expect(persisted.data).toEqual({ success: true })
    const storedObservations = await owner.from('intelligence_observations')
      .select('id,provider_observation_key').eq('analysis_id', analysisId)
    expect(storedObservations.data).toHaveLength(2)
    expect(new Set(storedObservations.data?.map(item => item.provider_observation_key))).toEqual(new Set(observationKeys))
    expect(storedObservations.data?.every(item => !observationKeys.includes(item.id))).toBe(true)
    const storedRecommendations = await owner.from('intelligence_recommendations')
      .select('id,supporting_observation_ids').eq('analysis_id', analysisId)
    expect(storedRecommendations.data).toHaveLength(2)
    const internalIds = new Set(storedObservations.data?.map(item => item.id))
    expect(storedRecommendations.data?.flatMap(item => item.supporting_observation_ids).every(id => internalIds.has(id))).toBe(true)
    const relationships = await owner.from('intelligence_recommendation_observations')
      .select('recommendation_id,observation_id').eq('analysis_id', analysisId)
    expect(relationships.data).toHaveLength(3)
    expect(relationships.data?.every(item => recommendationIds.includes(item.recommendation_id) && internalIds.has(item.observation_id))).toBe(true)
    expect((await owner.from('intelligence_observations').insert({})).error).not.toBeNull()
    expect((await owner.from('intelligence_recommendation_observations').insert({})).error).not.toBeNull()
  })

  it('rolls back result rows and records only metadata for the exact persistence failure', async () => {
    const profileId = crypto.randomUUID()
    const analysisId = crypto.randomUUID()
    const correlationId = crypto.randomUUID()
    expect((await owner.from('beard_profiles').insert({
      id: profileId,
      workspace_id: workspaceId,
      owner_id: ownerId,
      name: 'Persistence diagnostic fixture',
      status: 'Draft',
      style_name: 'Test style',
      maintenance_frequency_days: 7,
      preferred_overall_length_mm: 9,
      density: 'medium',
      texture: 'wavy',
    })).error).toBeNull()
    expect((await admin.from('intelligence_analyses').insert({
      id: analysisId,
      workspace_id: workspaceId,
      owner_user_id: ownerId,
      source_module: 'beard-studio',
      analysis_type: 'beard_photo_analysis',
      schema_version: 2,
      contract_version: 'beard-photo-result-contract-v2',
      prompt_version: 'beard-photo-analysis-v4',
      status: 'staging',
      idempotency_key: crypto.randomUUID(),
      profile_id: profileId,
      context_manifest: {},
      correlation_id: correlationId,
    })).error).toBeNull()
    expect((await owner.rpc('begin_beard_provider_attempt', {
      candidate_workspace_id: workspaceId,
      candidate_analysis_id: analysisId,
      candidate_provider: 'openai',
      candidate_model: 'gpt-5',
      candidate_prompt_version: 'beard-photo-analysis-v4',
    })).data).toBe(true)
    const providerText = 'private provider observation that must never enter diagnostics'
    const observationKey = 'front_density_distribution'
    const recommendationId = crypto.randomUUID()
    const args = {
      candidate_workspace_id: workspaceId,
      candidate_analysis_id: analysisId,
      candidate_correlation_id: correlationId,
      candidate_result: { privateProviderResult: providerText },
      candidate_observations: [{
        observationKey,
        category: 'density',
        statement: providerText,
        confidence: 0.8,
        supportingViews: ['front'],
        evidenceDescription: providerText,
        limitations: [providerText],
        relatedBeardZones: [],
      }],
      candidate_recommendations: [{
        id: recommendationId,
        title: providerText,
        reason: providerText,
        confidence: 0.7,
        priority: 'low',
        expectedBenefit: providerText,
        supportingObservationKeys: [observationKey, observationKey],
        affectedZones: [],
        toolConstraints: [],
        proposedGuardStrategy: null,
        status: 'undecided',
      }],
      candidate_provider_usage: null,
    }
    expect((await owner.rpc('persist_beard_analysis_result', args)).error).not.toBeNull()
    const persisted = await admin.rpc('persist_beard_analysis_result', args)
    expect(persisted.error).toBeNull()
    expect(persisted.data).toMatchObject({
      success: false,
      step: 'relationship_insert',
      table: 'intelligence_recommendation_observations',
      operation: 'insert',
      sqlstate: '23505',
      constraint: 'intelligence_recommendation_observations_pkey',
      entityType: 'relationship',
      entityIndex: 1,
      diagnosticVersion: 'beard-persistence-diagnostic-v1',
    })
    expect(JSON.stringify(persisted.data)).not.toContain(providerText)
    expect((await owner.from('intelligence_observations').select('id').eq('analysis_id', analysisId)).data).toEqual([])
    expect((await owner.from('intelligence_recommendations').select('id').eq('analysis_id', analysisId)).data).toEqual([])
    expect((await owner.from('intelligence_recommendation_observations').select('recommendation_id').eq('analysis_id', analysisId)).data).toEqual([])
    const analysis = await owner.from('intelligence_analyses').select(
      'status,error_code,result_payload,provider_usage,persistence_failure_step,persistence_failure_table,persistence_failure_operation,persistence_failure_sqlstate,persistence_failure_constraint,persistence_failure_entity_type,persistence_failure_entity_index,persistence_failure_diagnostic_version',
    ).eq('id', analysisId).single()
    expect(analysis.data).toMatchObject({
      status: 'failed',
      error_code: 'RESULT_PERSISTENCE_FAILED',
      result_payload: null,
      provider_usage: null,
      persistence_failure_step: 'relationship_insert',
      persistence_failure_table: 'intelligence_recommendation_observations',
      persistence_failure_operation: 'insert',
      persistence_failure_sqlstate: '23505',
      persistence_failure_constraint: 'intelligence_recommendation_observations_pkey',
      persistence_failure_entity_type: 'relationship',
      persistence_failure_entity_index: 1,
      persistence_failure_diagnostic_version: 'beard-persistence-diagnostic-v1',
    })
    expect(JSON.stringify(analysis.data)).not.toContain(providerText)
  })

  it('enforces active-analysis and hourly limits atomically in the database', async () => {
    const profileId = crypto.randomUUID()
    expect((await owner.from('beard_profiles').insert({
      id: profileId,
      workspace_id: workspaceId,
      owner_id: ownerId,
      name: 'Rate-limit fixture',
      status: 'Draft',
      style_name: 'Test style',
      maintenance_frequency_days: 7,
      preferred_overall_length_mm: 9,
      density: 'medium',
      texture: 'wavy',
    })).error).toBeNull()
    const row = (status: 'staging' | 'analyzing' | 'failed') => ({
      id: crypto.randomUUID(), workspace_id: workspaceId, owner_user_id: ownerId,
      source_module: 'beard-studio', analysis_type: 'beard_photo_analysis', schema_version: 2,
      contract_version: 'beard-photo-result-contract-v2',
      prompt_version: 'beard-photo-analysis-v4', status, idempotency_key: crypto.randomUUID(),
      profile_id: profileId, context_manifest: {}, correlation_id: crypto.randomUUID(),
    })
    const active = row('staging')
    expect((await owner.from('intelligence_analyses').insert(active)).error).not.toBeNull()
    expect((await admin.from('intelligence_analyses').insert(active)).error).toBeNull()
    const attempt = {
      candidate_workspace_id: workspaceId,
      candidate_analysis_id: active.id,
      candidate_provider: 'openai',
      candidate_model: 'gpt-5',
      candidate_prompt_version: 'beard-photo-analysis-v4',
    }
    expect((await owner.rpc('begin_beard_provider_attempt', attempt)).data).toBe(true)
    expect((await owner.rpc('begin_beard_provider_attempt', attempt)).data).toBe(false)
    const provenance = await owner.from('intelligence_analyses').select('provider_name,model_name,provider_attempt_count,provider_attempted_at,semantic_rule_version,status').eq('id', active.id).single()
    expect(provenance.data).toMatchObject({ provider_name: 'openai', model_name: 'gpt-5', provider_attempt_count: 1, semantic_rule_version: 'beard-semantic-safety-v3', status: 'analyzing' })
    expect(provenance.data?.provider_attempted_at).toBeTruthy()
    expect((await owner.from('intelligence_analyses').update({ failure_stage: 'SemanticValidation' }).eq('id', active.id)).error).not.toBeNull()
    expect((await owner.from('intelligence_analyses').insert({ ...row('failed'), failure_rule_code: 'SEM-0001' })).error).not.toBeNull()
    expect((await otherOwner.from('intelligence_analyses').select('id,failure_stage').eq('id', active.id)).data).toEqual([])
    expect((await owner.from('intelligence_analyses').delete().eq('id', active.id)).error).not.toBeNull()
    expect((await owner.from('intelligence_analyses').update({ profile_id: crypto.randomUUID() }).eq('id', active.id)).error).not.toBeNull()
    expect((await admin.from('intelligence_analyses').insert(row('analyzing'))).error?.message).toContain('ANALYSIS_IN_PROGRESS')
    expect((await owner.from('intelligence_analyses').update({ status: 'failed', error_code: 'PROVIDER_TIMEOUT' }).eq('id', active.id)).error).toBeNull()
    const timedOut = await owner.from('intelligence_analyses').select('provider_name,model_name,provider_attempt_count,provider_attempted_at,status,error_code').eq('id', active.id).single()
    expect(timedOut.data).toMatchObject({ provider_name: 'openai', model_name: 'gpt-5', provider_attempt_count: 1, status: 'failed', error_code: 'PROVIDER_TIMEOUT' })
    expect(timedOut.data?.provider_attempted_at).toBeTruthy()
    for (let index = 0; index < 2; index += 1) {
      expect((await admin.from('intelligence_analyses').insert(row('failed'))).error).toBeNull()
    }
    expect((await admin.from('intelligence_analyses').insert(row('failed'))).error?.message).toContain('RATE_LIMITED')
  })
})
