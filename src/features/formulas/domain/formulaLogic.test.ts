import { describe, expect, it } from 'vitest'
import type { FormulaLine, FormulaVersion } from '../../../types/domain'
import { batchPlanningTarget, calculatePercentageTotal, canTransition, duplicateVersion, nextVersionNumber, percentageBalance, scaleFormula } from './formulaLogic'

const line = (id: string, percentage: number): FormulaLine => ({ id, formulaVersionId: 'version-1', ingredientId: `ingredient-${id}`, percentage, phase: 'Phase A', sortOrder: Number(id), notes: '' })
const version: FormulaVersion = { id: 'version-1', formulaId: 'formula-1', version: 'v0.2', status: 'Candidate', description: 'Frozen source', targetCharacteristics: 'Dry finish', createdAt: '2026-01-01', updatedAt: '2026-01-02' }

describe('formula percentage calculations', () => {
  it('totals decimal percentages without floating point noise', () => {
    const lines = [line('1', 33.3), line('2', 33.3), line('3', 33.4)]
    expect(calculatePercentageTotal(lines)).toBe(100)
    expect(percentageBalance(lines)).toBe(0)
  })
  it('reports remaining and over balances', () => {
    expect(percentageBalance([line('1', 97.5)])).toBe(2.5)
    expect(percentageBalance([line('1', 102)])).toBe(-2)
  })
})

describe('batch scaling', () => {
  it('derives weights without changing canonical percentages', () => {
    const source = [line('1', 60), line('2', 25)]
    expect(scaleFormula(source, 500).map((item) => item.calculatedWeight)).toEqual([300, 125])
    expect(source.map((item) => item.percentage)).toEqual([60, 25])
  })
  it('supports explicit fill planning without changing Formula or inventory records',()=>{
    expect(batchPlanningTarget(500,30,10,5)).toEqual({targetGrams:315,estimatedFills:10})
    expect(batchPlanningTarget(500,0,0,0)).toEqual({targetGrams:500,estimatedFills:undefined})
  })
})

describe('immutable version creation', () => {
  it('copies lines with new identities and leaves the source untouched', () => {
    const ids = ['new-version', 'new-line-1', 'new-line-2']; let index = 0
    const sourceLines = [{...line('1', 60),formulationRole:'Adds controlled viscosity and gloss'}, line('2', 40)]
    const result = duplicateVersion(version, sourceLines, [version], () => ids[index++], '2026-07-14')
    expect(result.version).toMatchObject({ id: 'new-version', version: 'v0.3', status: 'Draft', derivedFromVersionId: 'version-1' })
    expect(result.lines.map((item) => item.id)).toEqual(['new-line-1', 'new-line-2'])
    expect(result.lines.every((item) => item.formulaVersionId === 'new-version')).toBe(true)
    expect(version.status).toBe('Candidate')
    expect(sourceLines[0].formulaVersionId).toBe('version-1')
    expect(result.lines[0].formulationRole).toBe('Adds controlled viscosity and gloss')
    expect(calculatePercentageTotal(result.lines)).toBe(100)
  })
  it('increments the highest human-readable version predictably', () => expect(nextVersionNumber([{ version: 'v0.3' }, { version: 'v1.0' }])).toBe('v1.1'))
})

describe('status rules', () => {
  it('allows only intended transitions', () => {
    expect(canTransition('Draft', 'Candidate')).toBe(true)
    expect(canTransition('Candidate', 'Approved')).toBe(true)
    expect(canTransition('Approved', 'Draft')).toBe(false)
    expect(canTransition('Retired', 'Candidate')).toBe(false)
  })
})
