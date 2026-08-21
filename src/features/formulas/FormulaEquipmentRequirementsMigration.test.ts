import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL(
    '../../../supabase/migrations/20260821121840_formula_equipment_requirements_v1.sql',
    import.meta.url,
  ),
  'utf8',
)

describe('Formula Equipment requirement authority migration', () => {
  it('extends the established Equipment requirement root instead of creating a competing subsystem', () => {
    expect(migration).toContain('alter table public.process_equipment_requirements')
    expect(migration).toContain('references public.formula_versions(workspace_id, id)')
    expect(migration).not.toContain('create table public.formula_equipment')
  })

  it('freezes version snapshots after Draft and removes direct browser writes', () => {
    expect(migration).toContain('Formula Equipment requirements are immutable after Draft')
    expect(migration).toContain('guard_formula_equipment_requirement_snapshot')
    expect(migration).toContain(
      'revoke insert, update, delete, truncate on table public.process_equipment_requirements from authenticated',
    )
  })

  it('uses fixed-search-path owner-scoped RPCs for replace, duplicate and Product Studio handoff', () => {
    for (const name of [
      'replace_formula_equipment_requirements_v1',
      'duplicate_formula_version_as_draft_v1',
      'create_product_studio_formula_handoff',
    ])
      expect(migration).toContain(`function public.${name}`)
    expect(migration.match(/set search_path = ''/g)?.length).toBeGreaterThanOrEqual(5)
    expect(migration).toContain("where workspace.owner_id = uid and workspace.lifecycle_state = 'active'")
    expect(migration).toContain('from public.formula_versions candidate')
  })

  it('preserves the one-time v9 import and backward-compatible five-argument handoff', () => {
    expect(migration).toContain(
      'rename to import_v9_relational_pre_formula_equipment_requirements',
    )
    expect(migration).toContain("payload->'formulaEquipmentRequirements'")
    expect(migration).toContain(
      'create_product_studio_formula_handoff(text,jsonb,jsonb,jsonb,jsonb)',
    )
  })
})
