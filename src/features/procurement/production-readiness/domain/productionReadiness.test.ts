import { describe, expect, it } from 'vitest'
import type { FormulaLine, FormulaVersion, Ingredient, InventoryLot, InventoryMovement, Product } from '../../../../types/domain'
import { calculateInventoryGap, calculateLandedCost, formulaReadiness, generateRequirements, rankScenarios, selectPackages, type RoundProductBasis } from './productionReadiness'

const product = (id: string, name: string): Product => ({ id, name, category: name, status: 'Active', developmentStage: 'Formulation', description: '', scentProfile: '', createdAt: '', updatedAt: '' })
const ingredient = (id: string, name: string): Ingredient => ({ id, commonName: name, inciName: name, category: '', functions: [], description: '', defaultUnit: 'g', notes: '', status: 'Active', createdAt: '', updatedAt: '' })
const version = (id: string): FormulaVersion => ({ id, formulaId: `f-${id}`, version: 'v1.0', status: 'Approved', description: '', targetCharacteristics: '', createdAt: '', updatedAt: '', phaseDefinitions: [{ code: 'A', name: 'Main', order: 1 }] })
const line = (id: string, versionId: string, ingredientId: string, percentage: number, role = 'emollient'): FormulaLine => ({ id, formulaVersionId: versionId, ingredientId, percentage, phase: 'A', sortOrder: 1, notes: '', formulationRole: role })
const basis = (category: RoundProductBasis['category'], productName: string, ingredientId: string, percentage = 100): RoundProductBasis => {
  const v = version(`v-${category}`)
  return { product: product(`p-${category}`, productName), category, formulaVersion: v, formulaLines: [line(`l-${category}`, v.id, ingredientId, percentage, category === 'deodorant' ? 'deodorant_active' : 'emollient')], ingredients: [ingredient(ingredientId, 'Jojoba Oil')], batchCount: 2, batchSize: 100, batchUnit: 'g', overagePercent: 5, deodorantStructure: category === 'deodorant' ? 'anhydrous' : undefined }
}

describe('production procurement readiness', () => {
  it('consolidates four product contributions by canonical identity with deterministic overage', () => {
    const result = generateRequirements([
      basis('beard_oil', 'Beard Oil', 'jojoba'),
      basis('beard_butter', 'Beard Butter', 'jojoba'),
      basis('beard_balm', 'Beard Balm', 'jojoba'),
      basis('deodorant', 'Deodorant', 'jojoba'),
    ])
    expect(result.blockers).toEqual([])
    expect(result.requirements).toHaveLength(1)
    expect(result.requirements[0].totalQuantity).toBe(840)
    expect(result.requirements[0].sources.map(item => item.category)).toEqual(['beard_oil', 'beard_butter', 'beard_balm', 'deodorant'])
  })

  it('does not consolidate name-only matches', () => {
    const result = generateRequirements([basis('beard_oil', 'Beard Oil', 'jojoba-a'), basis('beard_butter', 'Beard Butter', 'jojoba-b')])
    expect(result.requirements).toHaveLength(2)
  })

  it('blocks incomplete and volume-scaled percentage formulas, including deodorant structure', () => {
    const input = basis('deodorant', 'Deodorant', 'zinc')
    input.batchUnit = 'ml'
    input.deodorantStructure = undefined
    expect(formulaReadiness(input)).toMatchObject({ state: 'blocked' })
    expect(formulaReadiness(input).reasons).toEqual(expect.arrayContaining([
      expect.stringContaining('mass batch unit'),
      expect.stringContaining('formulation structure'),
    ]))
  })

  it('blocks mutable Draft formula versions as purchasing bases',()=>{
    const input=basis('beard_oil','Beard Oil','jojoba')
    input.formulaVersion={...input.formulaVersion!,status:'Draft'}
    expect(formulaReadiness(input)).toMatchObject({state:'blocked'})
    expect(formulaReadiness(input).reasons).toContain('The selected formula version is Draft and mutable; derive or select an immutable Candidate, Approved, or Retired version.')
  })

  it('excludes quarantine, expiry, unavailable stock and reservations without counting incoming orders', () => {
    const requirement = generateRequirements([basis('beard_oil', 'Beard Oil', 'jojoba')]).requirements[0]
    const lots: InventoryLot[] = [
      { id: 'active', ingredientId: 'jojoba', internalLotNumber: '1', receivedDate: '2026-01-01', openingQuantity: 0, unit: 'g', location: '', status: 'Active', notes: '', createdAt: '', updatedAt: '' },
      { id: 'quarantine', ingredientId: 'jojoba', internalLotNumber: '2', receivedDate: '2026-01-01', openingQuantity: 0, unit: 'g', location: '', status: 'Quarantined', notes: '', createdAt: '', updatedAt: '' },
      { id: 'expired', ingredientId: 'jojoba', internalLotNumber: '3', receivedDate: '2026-01-01', openingQuantity: 0, unit: 'g', expiryDate: '2025-01-01', location: '', status: 'Active', notes: '', createdAt: '', updatedAt: '' },
    ]
    const movements: InventoryMovement[] = lots.map(lot => ({ id: `m-${lot.id}`, inventoryLotId: lot.id, type: 'Receipt', quantity: 100, unit: 'g', reason: '', notes: '', occurredAt: '', createdAt: '' }))
    const gap = calculateInventoryGap({ requirement, lots, movements, reserved: 20, incomingUnreceived: 500, today: new Date('2026-07-27') })
    expect(gap).toMatchObject({ totalOnHand: 300, quarantined: 100, expired: 100, reserved: 20, usableAvailable: 80, incomingUnreceived: 500, purchasingGap: 130 })
  })

  it('uses integer package counts and rejects mass-volume conversion', () => {
    expect(selectPackages(950, 'g', { packageQuantity: 500, packageUnit: 'g' })).toMatchObject({ valid: true, packageCount: 2, purchasedQuantity: 1000, surplus: 50 })
    expect(selectPackages(950, 'g', { packageQuantity: 500, packageUnit: 'ml' })).toMatchObject({ valid: false })
  })

  it('applies an eligible first-order discount but leaves unknown landed costs unknown', () => {
    const landed = calculateLandedCost({
      supplierId: 's', currency: 'NOK', merchandise: 1000, destinationCountry: 'NO',
      discount: { id: 'd', supplier_id: 's', name: 'First', discount_type: 'percentage', percentage: 10, fixed_amount: null, currency: 'NOK', coupon_code: null, minimum_order_value: 500, maximum_discount: null, first_purchase_only: true, requires_newsletter: false, valid_from: null, expires_at: null, status: 'available', source_url: null, evidence_notes: '', verified_at: '2026-07-01', used_at: null, created_at: '', updated_at: '' },
    })
    expect(landed.components.discount).toBe(100)
    expect(landed.knownMinimum).toBe(900)
    expect(landed.confirmedTotal).toBeNull()
    expect(landed.missing).toEqual(['shipping', 'tax', 'duty', 'handling'])
  })

  it('ranks deterministically and prioritizes risk evidence for the risk strategy', () => {
    const candidates = [
      { id: 'cheap', supplierCount: 1, cashOutlay: 100, surplusCost: 0, verifiedCoverage: .2, leadTimeDays: null, documentationCoverage: .2, uncertaintyCount: 3, discountSaving: 0 },
      { id: 'verified', supplierCount: 2, cashOutlay: 200, surplusCost: 10, verifiedCoverage: 1, leadTimeDays: 3, documentationCoverage: 1, uncertaintyCount: 0, discountSaving: 0 },
    ]
    expect(rankScenarios(candidates, 'minimum_cash')[0].id).toBe('cheap')
    expect(rankScenarios(candidates, 'lowest_risk')[0].id).toBe('verified')
  })
})
