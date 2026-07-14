import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Formula, FormulaLine, FormulaState, FormulaVersion, FormulaVersionStatus } from '../../../types/domain'
import { ingredients } from '../../../data/mockData'
import { formulaRepository } from '../data/formulaRepository'
import { canTransition, duplicateVersion } from '../domain/formulaLogic'

interface FormulaDataValue extends FormulaState {
  ingredients: typeof ingredients
  updateLine(versionId: string, lineId: string, patch: Partial<FormulaLine>): void
  addLine(versionId: string, ingredientId: string): void
  removeLine(versionId: string, lineId: string): void
  moveLine(versionId: string, lineId: string, direction: -1 | 1): void
  saveVersion(versionId: string, patch: Partial<FormulaVersion>): void
  transitionVersion(versionId: string, status: FormulaVersionStatus): void
  duplicateAsDraft(versionId: string): FormulaVersion | undefined
  createFormula(productId: string, name: string, description: string): Formula
}
const FormulaDataContext = createContext<FormulaDataValue | null>(null)
const uid = () => crypto.randomUUID()

export function FormulaDataProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<FormulaState>(() => formulaRepository.load())
  useEffect(() => formulaRepository.save(state), [state])

  const value = useMemo<FormulaDataValue>(() => ({ ...state, ingredients,
    updateLine(versionId, lineId, patch) { setState((current) => ({ ...current, formulaLines: current.formulaLines.map((line) => line.formulaVersionId === versionId && line.id === lineId ? { ...line, ...patch } : line), formulaVersions: current.formulaVersions.map((version) => version.id === versionId ? { ...version, updatedAt: new Date().toISOString() } : version) })) },
    addLine(versionId, ingredientId) { setState((current) => ({ ...current, formulaLines: [...current.formulaLines, { id: uid(), formulaVersionId: versionId, ingredientId, percentage: 0, phase: 'Phase A', sortOrder: current.formulaLines.filter((line) => line.formulaVersionId === versionId).length + 1, notes: '' }] })) },
    removeLine(versionId, lineId) { setState((current) => ({ ...current, formulaLines: current.formulaLines.filter((line) => !(line.formulaVersionId === versionId && line.id === lineId)) })) },
    moveLine(versionId, lineId, direction) { setState((current) => { const lines = current.formulaLines.filter((line) => line.formulaVersionId === versionId).sort((a,b) => a.sortOrder-b.sortOrder); const index = lines.findIndex((line) => line.id === lineId); const target = index + direction; if (target < 0 || target >= lines.length) return current; [lines[index], lines[target]] = [lines[target], lines[index]]; const orders = new Map(lines.map((line, i) => [line.id, i + 1])); return { ...current, formulaLines: current.formulaLines.map((line) => line.formulaVersionId === versionId ? { ...line, sortOrder: orders.get(line.id)! } : line) } }) },
    saveVersion(versionId, patch) { setState((current) => ({ ...current, formulaVersions: current.formulaVersions.map((version) => version.id === versionId && version.status === 'Draft' ? { ...version, ...patch, updatedAt: new Date().toISOString() } : version) })) },
    transitionVersion(versionId, status) { setState((current) => { const source = current.formulaVersions.find((item) => item.id === versionId); if (!source || !canTransition(source.status, status)) return current; const version = { ...source, status, approvedAt: status === 'Approved' ? new Date().toISOString() : source.approvedAt, updatedAt: new Date().toISOString() }; return { ...current, formulaVersions: current.formulaVersions.map((item) => item.id === versionId ? version : item), products: current.products.map((product) => product.id !== current.formulas.find((formula) => formula.id === source.formulaId)?.productId ? product : { ...product, currentDevelopmentFormulaVersionId: status === 'Candidate' ? versionId : product.currentDevelopmentFormulaVersionId, currentApprovedFormulaVersionId: status === 'Approved' ? versionId : product.currentApprovedFormulaVersionId }) } }) },
    duplicateAsDraft(versionId) { const source = state.formulaVersions.find((item) => item.id === versionId); if (!source) return; const result = duplicateVersion(source, state.formulaLines.filter((line) => line.formulaVersionId === versionId), state.formulaVersions, uid); setState((current) => ({ ...current, formulaVersions: [...current.formulaVersions, result.version], formulaLines: [...current.formulaLines, ...result.lines] })); return result.version },
    createFormula(productId, name, description) { const now = new Date().toISOString(); const formula: Formula = { id: uid(), productId, name, description, createdAt: now, updatedAt: now }; const version: FormulaVersion = { id: uid(), formulaId: formula.id, version: 'v0.1', status: 'Draft', description: 'Initial formula version.', targetCharacteristics: '', createdAt: now, updatedAt: now }; setState((current) => ({ ...current, formulas: [...current.formulas, formula], formulaVersions: [...current.formulaVersions, version] })); return formula },
  }), [state])
  return <FormulaDataContext.Provider value={value}>{children}</FormulaDataContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFormulaData() { const value = useContext(FormulaDataContext); if (!value) throw new Error('FormulaDataProvider is required'); return value }
