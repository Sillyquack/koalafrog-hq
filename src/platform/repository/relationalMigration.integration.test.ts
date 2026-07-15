import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { formulaSeed } from '../../data/formulaSeed'
import { compareReconciliation, reconciliationSnapshot, validateV9Workspace } from '../migration/v9Migration'
import { relationalMigrationPayload, relationalTableByCollection, toDomainValue } from './supabaseWorkspaceRepository'
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
    return { client, ownerId: created.data.user.id }
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
})
