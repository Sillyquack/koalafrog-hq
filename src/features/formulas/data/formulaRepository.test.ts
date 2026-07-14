import { describe, expect, it } from 'vitest'
import { formulaSeed } from '../../../data/formulaSeed'
import { migratePhaseThreeState, migratePhaseTwoState } from './formulaRepository'

describe('Phase 2 local-state migration', () => {
  it('preserves product and formula records while adding Phase 3 inventory collections', () => {
    const legacy = { products: formulaSeed.products.slice(0,1), formulas: formulaSeed.formulas.slice(0,1), formulaVersions: formulaSeed.formulaVersions.slice(0,1), formulaLines: formulaSeed.formulaLines.slice(0,2) }
    const migrated = migratePhaseTwoState(legacy)
    expect(migrated.products).toEqual(legacy.products); expect(migrated.formulas).toEqual(legacy.formulas); expect(migrated.ingredients.length).toBeGreaterThan(0); expect(migrated.inventoryLots.length).toBeGreaterThan(0)
  })
})
describe('Phase 3 local-state migration', () => {
  it('preserves inventory history while adding lab and testing collections', () => {
    const phaseThree = { products:formulaSeed.products, formulas:formulaSeed.formulas, formulaVersions:formulaSeed.formulaVersions, formulaLines:formulaSeed.formulaLines, ingredients:formulaSeed.ingredients, supplierProducts:formulaSeed.supplierProducts, inventoryLots:formulaSeed.inventoryLots, inventoryMovements:formulaSeed.inventoryMovements }
    const migrated = migratePhaseThreeState(phaseThree)
    expect(migrated.inventoryMovements).toEqual(phaseThree.inventoryMovements); expect(migrated.formulaVersions).toEqual(phaseThree.formulaVersions); expect(migrated.labBatches.length).toBeGreaterThan(0); expect(migrated.testTemplates.length).toBeGreaterThan(0)
  })
})
