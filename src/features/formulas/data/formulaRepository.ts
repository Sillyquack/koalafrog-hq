import { formulaSeed } from '../../../data/formulaSeed'
import type { FormulaState } from '../../../types/domain'

export interface FormulaRepository { load(): FormulaState; save(state: FormulaState): void }
export const STORAGE_KEY = 'koalafrog-hq:workspace:v7'
export const PHASE_FOUR_STORAGE_KEY = 'koalafrog-hq:workspace:v6'
export const PHASE_THREE_STORAGE_KEY = 'koalafrog-hq:workspace:v4'
export const LEGACY_STORAGE_KEY = 'koalafrog-hq:formula-state:v2'
const cloneSeed = () => structuredClone(formulaSeed)
type PhaseTwoState = Pick<FormulaState, 'products' | 'formulas' | 'formulaVersions' | 'formulaLines'>
export function migratePhaseTwoState(legacy: PhaseTwoState): FormulaState { const seed = cloneSeed(); return { ...seed, products: legacy.products, formulas: legacy.formulas, formulaVersions: legacy.formulaVersions, formulaLines: legacy.formulaLines } }
type PhaseThreeState = Pick<FormulaState,'products'|'formulas'|'formulaVersions'|'formulaLines'|'ingredients'|'supplierProducts'|'inventoryLots'|'inventoryMovements'>
export function migratePhaseThreeState(legacy:PhaseThreeState):FormulaState{const seed=cloneSeed();return{...seed,...legacy}}
type PhaseFourState = Omit<FormulaState,'productionRuns'|'productionRunLines'|'productionRunAllocations'|'productionProcessSteps'|'costLines'>
export function migratePhaseFourState(legacy:PhaseFourState):FormulaState{return{...legacy,productionRuns:[],productionRunLines:[],productionRunAllocations:[],productionProcessSteps:[],costLines:[]}}

export class LocalFormulaRepository implements FormulaRepository {
  load(): FormulaState {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) return JSON.parse(stored) as FormulaState
      const phaseFour = window.localStorage.getItem(PHASE_FOUR_STORAGE_KEY)
      if(phaseFour)return migratePhaseFourState(JSON.parse(phaseFour) as PhaseFourState)
      const phaseThree = window.localStorage.getItem(PHASE_THREE_STORAGE_KEY)
      if (phaseThree) return migratePhaseThreeState(JSON.parse(phaseThree) as PhaseThreeState)
      const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY)
      return legacy ? migratePhaseTwoState(JSON.parse(legacy) as PhaseTwoState) : cloneSeed()
    } catch { return cloneSeed() }
  }
  save(state: FormulaState) { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }
}

export const formulaRepository = new LocalFormulaRepository()
