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
      source_module: 'beard-studio', analysis_type: 'beard_photo_analysis', schema_version: 1,
      prompt_version: 'beard-photo-analysis-v1', status, idempotency_key: crypto.randomUUID(),
      profile_id: profileId, context_manifest: {}, correlation_id: crypto.randomUUID(),
    })
    const active = row('staging')
    expect((await owner.from('intelligence_analyses').insert(active)).error).toBeNull()
    const attempt = {
      candidate_workspace_id: workspaceId,
      candidate_analysis_id: active.id,
      candidate_provider: 'openai',
      candidate_model: 'gpt-5',
      candidate_prompt_version: 'beard-photo-analysis-v1',
    }
    expect((await owner.rpc('begin_beard_provider_attempt', attempt)).data).toBe(true)
    expect((await owner.rpc('begin_beard_provider_attempt', attempt)).data).toBe(false)
    const provenance = await owner.from('intelligence_analyses').select('provider_name,model_name,provider_attempt_count,provider_attempted_at,status').eq('id', active.id).single()
    expect(provenance.data).toMatchObject({ provider_name: 'openai', model_name: 'gpt-5', provider_attempt_count: 1, status: 'analyzing' })
    expect(provenance.data?.provider_attempted_at).toBeTruthy()
    expect((await owner.from('intelligence_analyses').delete().eq('id', active.id)).error).not.toBeNull()
    expect((await owner.from('intelligence_analyses').update({ profile_id: crypto.randomUUID() }).eq('id', active.id)).error).not.toBeNull()
    expect((await owner.from('intelligence_analyses').insert(row('analyzing'))).error?.message).toContain('ANALYSIS_IN_PROGRESS')
    expect((await owner.from('intelligence_analyses').update({ status: 'failed', error_code: 'PROVIDER_TIMEOUT' }).eq('id', active.id)).error).toBeNull()
    const timedOut = await owner.from('intelligence_analyses').select('provider_name,model_name,provider_attempt_count,provider_attempted_at,status,error_code').eq('id', active.id).single()
    expect(timedOut.data).toMatchObject({ provider_name: 'openai', model_name: 'gpt-5', provider_attempt_count: 1, status: 'failed', error_code: 'PROVIDER_TIMEOUT' })
    expect(timedOut.data?.provider_attempted_at).toBeTruthy()
    for (let index = 0; index < 4; index += 1) {
      expect((await owner.from('intelligence_analyses').insert(row('failed'))).error).toBeNull()
    }
    expect((await owner.from('intelligence_analyses').insert(row('failed'))).error?.message).toContain('RATE_LIMITED')
  })
})
