import { formulaSeed } from '../../../data/formulaSeed'
import type { FormulaState } from '../../../types/domain'

export interface FormulaRepository { load(): FormulaState; save(state: FormulaState): void }
const STORAGE_KEY = 'koalafrog-hq:formula-state:v2'
const cloneSeed = () => structuredClone(formulaSeed)

export class LocalFormulaRepository implements FormulaRepository {
  load(): FormulaState {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) as FormulaState : cloneSeed()
    } catch { return cloneSeed() }
  }
  save(state: FormulaState) { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }
}

export const formulaRepository = new LocalFormulaRepository()
