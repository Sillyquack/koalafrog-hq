import { describe, expect, it } from 'vitest'
import { formulaSeed } from '../../../data/formulaSeed'
import { migratePhaseTwoState } from './formulaRepository'

describe('Phase 2 local-state migration',()=>{
  it('preserves product and formula records while adding Phase 3 inventory collections',()=>{const legacy={products:formulaSeed.products.slice(0,1),formulas:formulaSeed.formulas.slice(0,1),formulaVersions:formulaSeed.formulaVersions.slice(0,1),formulaLines:formulaSeed.formulaLines.slice(0,2)};const migrated=migratePhaseTwoState(legacy);expect(migrated.products).toEqual(legacy.products);expect(migrated.formulas).toEqual(legacy.formulas);expect(migrated.ingredients.length).toBeGreaterThan(0);expect(migrated.inventoryLots.length).toBeGreaterThan(0);expect(migrated.inventoryMovements.length).toBeGreaterThan(0)})
})
