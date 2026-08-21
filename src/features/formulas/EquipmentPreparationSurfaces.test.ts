import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')
const lab = read('../lab/LabBatchDetailPage.tsx')
const production = read('../production/ProductionRunDetailPage.tsx')
const equipmentPage = read('../procurement/EquipmentPage.tsx')
const panel = read('components/EquipmentRequirementsPanel.tsx')
const checklist = read('components/EquipmentPreparationChecklist.tsx')

describe('Equipment-aware preparation surfaces', () => {
  it('blocks Lab and Production start only for required gaps on the exact Formula Version', () => {
    for (const page of [lab, production]) {
      expect(page).toContain('formulaEquipmentRequirements.filter')
      expect(page).toContain('hasEquipmentBlockers')
      expect(page).toContain('disabled={equipmentBlocked}')
      expect(page).toContain('<EquipmentPreparationChecklist')
    }
  })

  it('keeps historical requirements read-only and current availability derived', () => {
    expect(panel).toContain("const editable=version.status==='Draft'")
    expect(panel).toContain('Historical snapshot')
    expect(checklist).toContain('requirements are')
    expect(checklist).toContain('availability is read from current Equipment')
  })

  it('never turns a catalog definition into owned or available Equipment implicitly', () => {
    expect(equipmentPage).toContain("ownership_state: 'not_owned'")
    expect(equipmentPage).toContain("availability_state: 'unknown'")
    expect(equipmentPage).toContain("status: 'research'")
    expect(equipmentPage).toContain('Track as not owned')
    expect(equipmentPage).not.toContain("ownership_state: 'owned'")
  })
})
