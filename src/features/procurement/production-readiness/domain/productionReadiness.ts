import type { FormulaLine, FormulaVersion, Ingredient, InventoryLot, InventoryMovement, InventoryUnit, Product, SupplierProduct } from '../../../../types/domain'
import { areUnitsCompatible, convertUnit, expiryState, lotBalance } from '../../../inventory/domain/inventoryLogic'
import type { SupplierDiscount, SupplierShippingRule } from '../../domain/procurement'

export const PRODUCTION_READINESS_VERSIONS = {
  requirementEngine: '1.0.0',
  inventoryGap: '1.0.0',
  landedCost: '1.0.0',
  basketOptimizer: '1.0.0',
  readinessRules: '1.0.0',
} as const

export type ReadinessState = 'ready' | 'needs_review' | 'blocked'
export type ProductionCategory = 'beard_oil' | 'beard_butter' | 'beard_balm' | 'deodorant'
export const REQUIRED_PRODUCTION_CATEGORIES: readonly ProductionCategory[] = ['beard_oil', 'beard_butter', 'beard_balm', 'deodorant']

export interface RoundProductBasis {
  product: Product
  category: ProductionCategory
  formulaVersion?: FormulaVersion
  formulaLines: FormulaLine[]
  ingredients: Ingredient[]
  batchCount: number
  batchSize: number
  batchUnit: InventoryUnit
  overagePercent: number
  deodorantStructure?: 'anhydrous' | 'emulsion' | 'suspension' | 'other'
}

export interface FormulaReadinessResult { state: ReadinessState; reasons: string[] }

export function formulaReadiness(basis: RoundProductBasis): FormulaReadinessResult {
  const reasons: string[] = []
  const review: string[] = []
  if (!basis.formulaVersion) reasons.push('Select a concrete formula version.')
  if (basis.formulaVersion?.status === 'Draft') review.push('The selected formula version is Draft and requires explicit owner review.')
  if (!basis.formulaLines.length) reasons.push('The selected formula has no ingredient lines.')
  if (basis.batchCount <= 0 || basis.batchSize <= 0) reasons.push('Batch count and batch size must be greater than zero.')
  if (!['mg', 'g', 'kg'].includes(basis.batchUnit)) reasons.push('Percentage formulas currently require a mass batch unit; no density conversion is permitted.')
  const ingredientIds = new Set(basis.ingredients.map(item => item.id))
  for (const line of basis.formulaLines) {
    if (!ingredientIds.has(line.ingredientId)) reasons.push(`Formula line ${line.id} has no resolved ingredient identity.`)
    if (!Number.isFinite(line.percentage) || line.percentage <= 0) reasons.push(`Formula line ${line.id} needs a positive percentage.`)
    if (!line.phase.trim()) review.push(`Formula line ${line.id} has no phase metadata.`)
  }
  const total = basis.formulaLines.reduce((sum, line) => sum + line.percentage, 0)
  if (Math.abs(total - 100) > 0.0001) reasons.push(`Formula percentages total ${round(total)}%, not 100%.`)
  if (new Set(basis.formulaLines.map(line => line.id)).size !== basis.formulaLines.length) reasons.push('Duplicate formula-line identities must be resolved.')
  if (basis.category === 'deodorant') {
    if (!basis.deodorantStructure) reasons.push('Record the deodorant formulation structure before purchasing.')
    if (!basis.formulaLines.some(line => /deodor|absorb|active/i.test(line.formulationRole ?? ''))) review.push('No deodorant-specific functional role is recorded.')
    if (!basis.formulaVersion?.phaseDefinitions?.length) review.push('Deodorant phase and processing metadata require review.')
  }
  return reasons.length ? { state: 'blocked', reasons: [...new Set([...reasons, ...review])] } : review.length ? { state: 'needs_review', reasons: [...new Set(review)] } : { state: 'ready', reasons: [] }
}

export interface RequirementSource {
  productId: string
  productName: string
  category: ProductionCategory
  formulaVersionId: string
  formulaVersionLabel: string
  formulaLineId: string
  phase: string
  quantityBeforeOverage: number
  overageQuantity: number
  totalQuantity: number
  unit: InventoryUnit
}
export interface ConsolidatedRequirement {
  ingredientId: string
  ingredientName: string
  referenceEntryId?: string
  unit: InventoryUnit
  totalQuantity: number
  sources: RequirementSource[]
  calculation: string
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 1e6) / 1e6

export function generateRequirements(bases: RoundProductBasis[]): { requirements: ConsolidatedRequirement[]; blockers: string[] } {
  const requirements = new Map<string, ConsolidatedRequirement>()
  const blockers: string[] = []
  for (const basis of bases) {
    const readiness = formulaReadiness(basis)
    if (readiness.state === 'blocked') { blockers.push(...readiness.reasons.map(reason => `${basis.product.name}: ${reason}`)); continue }
    const version = basis.formulaVersion!
    const targetGrams = convertUnit(basis.batchSize, basis.batchUnit, 'g') * basis.batchCount
    for (const line of basis.formulaLines) {
      const ingredient = basis.ingredients.find(item => item.id === line.ingredientId)!
      const before = round(targetGrams * line.percentage / 100)
      const allowance = round(before * Math.max(0, basis.overagePercent) / 100)
      const total = round(before + allowance)
      const source: RequirementSource = { productId: basis.product.id, productName: basis.product.name, category: basis.category, formulaVersionId: version.id, formulaVersionLabel: version.version, formulaLineId: line.id, phase: line.phase, quantityBeforeOverage: before, overageQuantity: allowance, totalQuantity: total, unit: 'g' }
      const key = `${ingredient.id}:g`
      const existing = requirements.get(key)
      if (existing) { existing.totalQuantity = round(existing.totalQuantity + total); existing.sources.push(source) }
      else requirements.set(key, { ingredientId: ingredient.id, ingredientName: ingredient.commonName, referenceEntryId: ingredient.referenceEntryId, unit: 'g', totalQuantity: total, sources: [source], calculation: `Σ(batch size × batch count × line % × (1 + overage %)); ${PRODUCTION_READINESS_VERSIONS.requirementEngine}` })
    }
  }
  return { requirements: [...requirements.values()].sort((a, b) => a.ingredientName.localeCompare(b.ingredientName) || a.ingredientId.localeCompare(b.ingredientId)), blockers }
}

export interface InventoryGap {
  required: number
  totalOnHand: number
  quarantined: number
  expired: number
  unavailable: number
  reserved: number
  usableAvailable: number
  incomingUnreceived: number
  purchasingGap: number
  unit: InventoryUnit
}

export function calculateInventoryGap(input: { requirement: ConsolidatedRequirement; lots: InventoryLot[]; movements: InventoryMovement[]; reserved?: number; incomingUnreceived?: number; today?: Date }): InventoryGap {
  let totalOnHand = 0, quarantined = 0, expired = 0, unavailable = 0
  for (const lot of input.lots.filter(item => item.ingredientId === input.requirement.ingredientId)) {
    if (!areUnitsCompatible(lot.unit, input.requirement.unit)) continue
    const balance = Math.max(0, convertUnit(lotBalance(lot, input.movements), lot.unit, input.requirement.unit))
    totalOnHand += balance
    if (lot.status === 'Quarantined') quarantined += balance
    else if (lot.status === 'Expired' || expiryState(lot, input.today) === 'Expired') expired += balance
    else if (lot.status !== 'Active') unavailable += balance
  }
  const reserved = Math.max(0, input.reserved ?? 0)
  const usableAvailable = Math.max(0, totalOnHand - quarantined - expired - unavailable - reserved)
  return { required: input.requirement.totalQuantity, totalOnHand: round(totalOnHand), quarantined: round(quarantined), expired: round(expired), unavailable: round(unavailable), reserved: round(reserved), usableAvailable: round(usableAvailable), incomingUnreceived: Math.max(0, input.incomingUnreceived ?? 0), purchasingGap: round(Math.max(0, input.requirement.totalQuantity - usableAvailable)), unit: input.requirement.unit }
}

export function selectPackages(gap: number, unit: InventoryUnit, product: Pick<SupplierProduct, 'packageQuantity' | 'packageUnit'>, moq = 1) {
  if (!areUnitsCompatible(unit, product.packageUnit)) return { valid: false as const, reason: 'Unsupported unit conversion between requirement and package.' }
  const packageSize = convertUnit(product.packageQuantity, product.packageUnit, unit)
  const packageCount = Math.max(Math.ceil(gap / packageSize), Math.ceil(moq))
  const purchasedQuantity = round(packageCount * packageSize)
  return { valid: true as const, packageCount, purchasedQuantity, surplus: round(Math.max(0, purchasedQuantity - gap)), unit }
}

export interface LandedCostInput {
  supplierId: string; currency: string; merchandise: number; discount?: SupplierDiscount | null; shippingRule?: SupplierShippingRule | null
  destinationCountry: string; manualShipping?: number | null; tax?: number | null; duty?: number | null; handling?: number | null; now?: Date
}
export function calculateLandedCost(input: LandedCostInput) {
  const now = input.now ?? new Date()
  const discount = input.discount
  const eligible = Boolean(discount && discount.supplier_id === input.supplierId && ['available', 'planned'].includes(discount.status) && (!discount.first_purchase_only || !discount.used_at) && (!discount.currency || discount.currency === input.currency) && (!discount.valid_from || new Date(discount.valid_from) <= now) && (!discount.expires_at || new Date(discount.expires_at) > now) && (discount.minimum_order_value == null || input.merchandise >= discount.minimum_order_value))
  let saving = 0
  if (eligible && discount?.discount_type === 'percentage') saving = input.merchandise * Number(discount.percentage ?? 0) / 100
  if (eligible && discount?.discount_type === 'fixed_amount') saving = Number(discount.fixed_amount ?? 0)
  if (discount?.maximum_discount != null) saving = Math.min(saving, discount.maximum_discount)
  saving = Math.min(input.merchandise, saving)
  const afterDiscount = input.merchandise - saving
  const rule = input.shippingRule
  const ruleApplicable = Boolean(rule && rule.supplier_id === input.supplierId && rule.status === 'active' && rule.currency === input.currency && (!rule.destination_country_code || rule.destination_country_code === input.destinationCountry))
  const freeShipping = Boolean(ruleApplicable && rule?.free_shipping_threshold != null && afterDiscount >= rule.free_shipping_threshold)
  const shipping = input.manualShipping ?? (freeShipping ? 0 : ruleApplicable ? rule?.flat_rate : null)
  const components = { merchandise: input.merchandise, discount: saving, shipping: shipping ?? null, tax: input.tax ?? (ruleApplicable ? rule?.tax_estimate : null) ?? null, duty: input.duty ?? (ruleApplicable ? rule?.duty_estimate : null) ?? null, handling: input.handling ?? null }
  const missing = (Object.entries(components) as [string, number | null][]).filter(([name, value]) => !['merchandise', 'discount'].includes(name) && value == null).map(([name]) => name)
  const knownMinimum = round(afterDiscount + [components.shipping, components.tax, components.duty, components.handling].reduce<number>((sum, value) => sum + (value ?? 0), 0))
  return { currency: input.currency, components, discountEligible: eligible, freeShipping, knownMinimum, confirmedTotal: missing.length ? null : knownMinimum, missing, uncertainty: missing.length ? 'checkout_verification_required' as const : 'confirmed' as const }
}

export interface ScenarioCandidate { id: string; supplierCount: number; cashOutlay: number | null; surplusCost: number; verifiedCoverage: number; leadTimeDays: number | null; documentationCoverage: number; uncertaintyCount: number; discountSaving: number }
export type Strategy = 'minimum_cash' | 'best_value' | 'discount_utilization' | 'fewest_suppliers' | 'lowest_risk' | 'balanced'
export function rankScenarios(candidates: ScenarioCandidate[], strategy: Strategy) {
  const score = (item: ScenarioCandidate) => {
    const cost = item.cashOutlay ?? Number.MAX_SAFE_INTEGER / 100
    if (strategy === 'minimum_cash') return cost
    if (strategy === 'best_value') return cost + item.surplusCost * .35 + item.uncertaintyCount * 10000
    if (strategy === 'discount_utilization') return cost - item.discountSaving + item.uncertaintyCount * 10000
    if (strategy === 'fewest_suppliers') return item.supplierCount * 1e9 + cost
    if (strategy === 'lowest_risk') return (1 - item.verifiedCoverage) * 1e9 + (1 - item.documentationCoverage) * 1e8 + item.uncertaintyCount * 1e7 + (item.leadTimeDays ?? 999) * 1e4 + cost
    return cost + item.surplusCost * .25 + item.supplierCount * 250 + item.uncertaintyCount * 5000 + (1 - item.verifiedCoverage) * 10000 + (1 - item.documentationCoverage) * 10000 + (item.leadTimeDays ?? 90) * 10 - item.discountSaving
  }
  return [...candidates].sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id)).map(item => ({ ...item, score: score(item) }))
}
