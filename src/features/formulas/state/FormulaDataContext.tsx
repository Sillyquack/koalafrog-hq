import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Formula, FormulaLine, FormulaState, FormulaVersion, FormulaVersionStatus, Ingredient, InventoryLot, InventoryMovement, SupplierProduct } from '../../../types/domain'
import { formulaRepository } from '../data/formulaRepository'
import { canTransition, duplicateVersion } from '../domain/formulaLogic'
import { generateLotNumber, validateMovement } from '../../inventory/domain/inventoryLogic'

interface FormulaDataValue extends FormulaState {
  updateLine(versionId: string, lineId: string, patch: Partial<FormulaLine>): void
  addLine(versionId: string, ingredientId: string): void
  removeLine(versionId: string, lineId: string): void
  moveLine(versionId: string, lineId: string, direction: -1 | 1): void
  saveVersion(versionId: string, patch: Partial<FormulaVersion>): void
  transitionVersion(versionId: string, status: FormulaVersionStatus): void
  duplicateAsDraft(versionId: string): FormulaVersion | undefined
  createFormula(productId: string, name: string, description: string): Formula
  createIngredient(input: Omit<Ingredient, 'id' | 'createdAt' | 'updatedAt'>): Ingredient
  updateIngredient(id: string, patch: Partial<Ingredient>): void
  archiveIngredient(id: string): void
  saveSupplierProduct(input: Omit<SupplierProduct, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): SupplierProduct
  markSupplierPreferred(id: string): void
  receiveStock(input: Omit<InventoryLot, 'id' | 'internalLotNumber' | 'createdAt' | 'updatedAt' | 'status'>): InventoryLot
  addMovement(input: Omit<InventoryMovement, 'id' | 'createdAt'>): InventoryMovement
}
const FormulaDataContext = createContext<FormulaDataValue | null>(null)
const uid = () => crypto.randomUUID()

export function FormulaDataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FormulaState>(() => formulaRepository.load())
  useEffect(() => formulaRepository.save(state), [state])

  const value = useMemo<FormulaDataValue>(() => ({ ...state,
    updateLine(versionId, lineId, patch) { setState((current) => ({ ...current, formulaLines: current.formulaLines.map((line) => line.formulaVersionId === versionId && line.id === lineId ? { ...line, ...patch } : line), formulaVersions: current.formulaVersions.map((version) => version.id === versionId ? { ...version, updatedAt: new Date().toISOString() } : version) })) },
    addLine(versionId, ingredientId) { setState((current) => ({ ...current, formulaLines: [...current.formulaLines, { id: uid(), formulaVersionId: versionId, ingredientId, percentage: 0, phase: 'Phase A', sortOrder: current.formulaLines.filter((line) => line.formulaVersionId === versionId).length + 1, notes: '' }] })) },
    removeLine(versionId, lineId) { setState((current) => ({ ...current, formulaLines: current.formulaLines.filter((line) => !(line.formulaVersionId === versionId && line.id === lineId)) })) },
    moveLine(versionId, lineId, direction) { setState((current) => { const lines = current.formulaLines.filter((line) => line.formulaVersionId === versionId).sort((a,b) => a.sortOrder-b.sortOrder); const index = lines.findIndex((line) => line.id === lineId); const target = index + direction; if (target < 0 || target >= lines.length) return current; [lines[index], lines[target]] = [lines[target], lines[index]]; const orders = new Map(lines.map((line, i) => [line.id, i + 1])); return { ...current, formulaLines: current.formulaLines.map((line) => line.formulaVersionId === versionId ? { ...line, sortOrder: orders.get(line.id)! } : line) } }) },
    saveVersion(versionId, patch) { setState((current) => ({ ...current, formulaVersions: current.formulaVersions.map((version) => version.id === versionId && version.status === 'Draft' ? { ...version, ...patch, updatedAt: new Date().toISOString() } : version) })) },
    transitionVersion(versionId, status) { setState((current) => { const source = current.formulaVersions.find((item) => item.id === versionId); if (!source || !canTransition(source.status, status)) return current; const version = { ...source, status, approvedAt: status === 'Approved' ? new Date().toISOString() : source.approvedAt, updatedAt: new Date().toISOString() }; return { ...current, formulaVersions: current.formulaVersions.map((item) => item.id === versionId ? version : item), products: current.products.map((product) => product.id !== current.formulas.find((formula) => formula.id === source.formulaId)?.productId ? product : { ...product, currentDevelopmentFormulaVersionId: status === 'Candidate' ? versionId : product.currentDevelopmentFormulaVersionId, currentApprovedFormulaVersionId: status === 'Approved' ? versionId : product.currentApprovedFormulaVersionId }) } }) },
    duplicateAsDraft(versionId) { const source = state.formulaVersions.find((item) => item.id === versionId); if (!source) return; const result = duplicateVersion(source, state.formulaLines.filter((line) => line.formulaVersionId === versionId), state.formulaVersions, uid); setState((current) => ({ ...current, formulaVersions: [...current.formulaVersions, result.version], formulaLines: [...current.formulaLines, ...result.lines] })); return result.version },
    createFormula(productId, name, description) { const now = new Date().toISOString(); const formula: Formula = { id: uid(), productId, name, description, createdAt: now, updatedAt: now }; const version: FormulaVersion = { id: uid(), formulaId: formula.id, version: 'v0.1', status: 'Draft', description: 'Initial formula version.', targetCharacteristics: '', createdAt: now, updatedAt: now }; setState((current) => ({ ...current, formulas: [...current.formulas, formula], formulaVersions: [...current.formulaVersions, version] })); return formula },
    createIngredient(input) { const now = new Date().toISOString(); const ingredient = { ...input, id: uid(), createdAt: now, updatedAt: now }; setState((current) => ({ ...current, ingredients: [...current.ingredients, ingredient] })); return ingredient },
    updateIngredient(id, patch) { setState((current) => ({ ...current, ingredients: current.ingredients.map((item) => item.id === id ? { ...item, ...patch, id, updatedAt: new Date().toISOString() } : item) })) },
    archiveIngredient(id) { setState((current) => ({ ...current, ingredients: current.ingredients.map((item) => item.id === id ? { ...item, status: 'Archived', updatedAt: new Date().toISOString() } : item) })) },
    saveSupplierProduct(input) { const now = new Date().toISOString(); const product: SupplierProduct = { ...input, id: input.id ?? uid(), createdAt: now, updatedAt: now }; setState((current) => ({ ...current, supplierProducts: input.id ? current.supplierProducts.map((item) => item.id === input.id ? { ...product, createdAt: item.createdAt } : item) : [...current.supplierProducts, product] })); return product },
    markSupplierPreferred(id) { setState((current) => { const selected = current.supplierProducts.find((item) => item.id === id); if (!selected) return current; return { ...current, supplierProducts: current.supplierProducts.map((item) => item.ingredientId === selected.ingredientId ? { ...item, isPreferred: item.id === id, updatedAt: new Date().toISOString() } : item) } }) },
    receiveStock(input) { const now = new Date().toISOString(); if (!Number.isFinite(input.openingQuantity) || input.openingQuantity <= 0) throw new Error('Opening quantity must be greater than zero.'); const lot: InventoryLot = { ...input, id: uid(), internalLotNumber: generateLotNumber(state.inventoryLots.map((item) => item.internalLotNumber), new Date(`${input.receivedDate}T12:00:00`)), status: 'Active', createdAt: now, updatedAt: now }; const receipt: InventoryMovement = { id: uid(), inventoryLotId: lot.id, type: 'Receipt', quantity: lot.openingQuantity, unit: lot.unit, reason: 'Stock received', notes: 'Initial receipt recorded with lot creation.', occurredAt: `${input.receivedDate}T12:00:00.000Z`, createdAt: now }; setState((current) => ({ ...current, inventoryLots: [...current.inventoryLots, lot], inventoryMovements: [...current.inventoryMovements, receipt] })); return lot },
    addMovement(input) { const lot = state.inventoryLots.find((item) => item.id === input.inventoryLotId); if (!lot) throw new Error('Inventory lot not found.'); const error = validateMovement(lot, state.inventoryMovements, input); if (error) throw new Error(error); const movement = { ...input, id: uid(), createdAt: new Date().toISOString() }; setState((current) => ({ ...current, inventoryMovements: [...current.inventoryMovements, movement] })); return movement },
  }), [state])
  return <FormulaDataContext.Provider value={value}>{children}</FormulaDataContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFormulaData() { const value = useContext(FormulaDataContext); if (!value) throw new Error('FormulaDataProvider is required'); return value }
