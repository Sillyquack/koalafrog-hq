import type { Ingredient, InventoryLot, InventoryMovement, InventoryMovementType, InventoryUnit } from '../../../types/domain'

export const inventoryUnits:readonly InventoryUnit[]=['mg','g','kg','ml','L','pcs']
export const weightUnits:readonly InventoryUnit[]=['mg','g','kg']
export const volumeUnits:readonly InventoryUnit[]=['ml','L']
export const countUnits:readonly InventoryUnit[]=['pcs']
const baseFactor: Record<InventoryUnit, number> = { mg: .001, g: 1, kg: 1000, ml: 1, L: 1000, pcs: 1 }
const family = (unit: InventoryUnit) => unit === 'mg' || unit === 'g' || unit === 'kg' ? 'mass' : unit === 'ml' || unit === 'L' ? 'volume' : 'count'
export const areUnitsCompatible = (a: InventoryUnit, b: InventoryUnit) => family(a) === family(b)
export function convertUnit(value: number, from: InventoryUnit, to: InventoryUnit) { if (!areUnitsCompatible(from, to)) throw new Error(`Cannot convert ${from} to ${to}`); return value * baseFactor[from] / baseFactor[to] }
export const movementDirection = (type: InventoryMovementType) => type === 'Receipt' ? 1 : type === 'Adjustment' ? 1 : -1
export function signedMovementQuantity(movement: Pick<InventoryMovement, 'type' | 'quantity'>) { return movement.type === 'Adjustment' ? movement.quantity : Math.abs(movement.quantity) * movementDirection(movement.type) }
export function lotBalance(lot: InventoryLot, movements: InventoryMovement[]) { return movements.filter((m) => m.inventoryLotId === lot.id).reduce((sum, movement) => sum + convertUnit(signedMovementQuantity(movement), movement.unit, lot.unit), 0) }

export function validateMovement(lot: InventoryLot, movements: InventoryMovement[], input: Pick<InventoryMovement, 'type' | 'quantity' | 'unit'>) {
  if (!Number.isFinite(input.quantity) || input.quantity === 0) return 'Quantity must be a non-zero number.'
  if (!areUnitsCompatible(input.unit, lot.unit)) return `Movement unit must be compatible with ${lot.unit}.`
  if (input.type !== 'Adjustment' && input.quantity < 0) return 'Use a positive quantity; movement type controls direction.'
  const change = convertUnit(signedMovementQuantity(input), input.unit, lot.unit)
  if (lotBalance(lot, movements) + change < 0) return 'Movement exceeds the available lot quantity.'
  return null
}

export type StockState = 'In Stock' | 'Low' | 'Out of Stock' | 'No Inventory Data'
export function ingredientBalance(ingredient: Ingredient, lots: InventoryLot[], movements: InventoryMovement[]) { return lots.filter((lot) => lot.ingredientId === ingredient.id && !['Disposed', 'Expired'].includes(lot.status)).reduce((sum, lot) => sum + convertUnit(lotBalance(lot, movements), lot.unit, ingredient.defaultUnit), 0) }
export function stockState(ingredient: Ingredient, lots: InventoryLot[], movements: InventoryMovement[]): StockState { const linked = lots.filter((lot) => lot.ingredientId === ingredient.id); if (!linked.length) return 'No Inventory Data'; const balance = ingredientBalance(ingredient, lots, movements); if (balance <= 0) return 'Out of Stock'; if (ingredient.reorderThreshold != null && balance <= ingredient.reorderThreshold) return 'Low'; return 'In Stock' }

export type ExpiryState = 'Expired' | 'Expiring Soon' | 'Healthy' | 'No Expiry Data'
export const EXPIRING_SOON_DAYS = 60
export function expiryState(lot: InventoryLot, today = new Date(), thresholdDays = EXPIRING_SOON_DAYS): ExpiryState { const value = lot.expiryDate ?? lot.bestBeforeDate; if (!value) return 'No Expiry Data'; const days = (new Date(`${value}T12:00:00`).getTime() - today.getTime()) / 86400000; if (days < 0) return 'Expired'; if (days <= thresholdDays) return 'Expiring Soon'; return 'Healthy' }

export function generateLotNumber(existing: string[], date = new Date()) { const stamp = `${String(date.getFullYear()).slice(-2)}${String(date.getMonth()+1).padStart(2,'0')}${String(date.getDate()).padStart(2,'0')}`; const prefix = `KF-ING-${stamp}-`; const sequence = Math.max(0, ...existing.filter((n) => n.startsWith(prefix)).map((n) => Number(n.slice(prefix.length)) || 0)) + 1; return `${prefix}${String(sequence).padStart(3,'0')}` }
