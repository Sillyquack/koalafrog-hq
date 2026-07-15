import { describe, expect, it } from 'vitest'
import { formulaSeed } from '../../data/formulaSeed'
import { relationalMigrationPayload, relationalTableByCollection, toDatabaseValue, toDomainValue } from './supabaseWorkspaceRepository'

describe('relational workspace mapping', () => {
  it('maps every v9 collection to an explicit table', () => {
    expect(Object.keys(relationalTableByCollection)).toEqual(Object.keys(formulaSeed))
    expect(new Set(Object.values(relationalTableByCollection)).size).toBe(Object.keys(formulaSeed).length)
    expect(Object.values(relationalTableByCollection)).not.toContain('workspace_records')
  })

  it('preserves stable IDs while translating column names', () => {
    const product = formulaSeed.products[0]
    const row = toDatabaseValue(product) as Record<string, unknown>
    expect(row.id).toBe(product.id)
    expect(row.development_stage).toBe(product.developmentStage)
    expect(toDomainValue(row)).toEqual(product)
  })

  it('creates migration input without mutating the v9 source', () => {
    const before = structuredClone(formulaSeed)
    const payload = relationalMigrationPayload(formulaSeed)
    expect((payload.formulaVersions as Array<Record<string, unknown>>)[0].formula_id).toBe(formulaSeed.formulaVersions[0].formulaId)
    expect(formulaSeed).toEqual(before)
  })
})
