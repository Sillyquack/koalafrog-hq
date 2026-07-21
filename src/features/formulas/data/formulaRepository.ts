import { formulaSeed } from '../../../data/formulaSeed'
import type { FormulaState } from '../../../types/domain'
import {
  LEGACY_STORAGE_KEY,
  PHASE_FIVE_STORAGE_KEY,
  PHASE_FOUR_STORAGE_KEY,
  PHASE_SIX_STORAGE_KEY,
  PHASE_SEVEN_STORAGE_KEY,
  PHASE_THREE_STORAGE_KEY,
  STORAGE_KEY,
} from './workspaceMigrationVersions'
export {
  LEGACY_STORAGE_KEY,
  PHASE_FIVE_STORAGE_KEY,
  PHASE_FOUR_STORAGE_KEY,
  PHASE_SIX_STORAGE_KEY,
  PHASE_SEVEN_STORAGE_KEY,
  PHASE_THREE_STORAGE_KEY,
  STORAGE_KEY,
} from './workspaceMigrationVersions'

export interface FormulaRepository { load(): FormulaState; save(state: FormulaState): void }
const cloneSeed = () => structuredClone(formulaSeed)
const emptyBeardStudio=()=>({revision:0,profiles:[],lengthMaps:[],tools:[],recipes:[],sessions:[],logs:[]})
export function normalizeWorkspaceState(state:FormulaState):FormulaState{return{...state,beardStudio:{...emptyBeardStudio(),...(state.beardStudio??{})},ingredientKnowledgeProfiles:state.ingredientKnowledgeProfiles??[],ingredientKnowledgeRoles:state.ingredientKnowledgeRoles??[],ingredientKnowledgeCompatibility:state.ingredientKnowledgeCompatibility??[],ingredientKnowledgeEvidence:state.ingredientKnowledgeEvidence??[]}}
type PhaseTwoState = Pick<FormulaState, 'products' | 'formulas' | 'formulaVersions' | 'formulaLines'>
export function migratePhaseTwoState(legacy: PhaseTwoState): FormulaState { const seed = cloneSeed(); return { ...seed, products: legacy.products, formulas: legacy.formulas, formulaVersions: legacy.formulaVersions, formulaLines: legacy.formulaLines } }
type PhaseThreeState = Pick<FormulaState,'products'|'formulas'|'formulaVersions'|'formulaLines'|'ingredients'|'supplierProducts'|'inventoryLots'|'inventoryMovements'>
export function migratePhaseThreeState(legacy:PhaseThreeState):FormulaState{const seed=cloneSeed();return{...seed,...legacy}}
type PhaseFourState = Omit<FormulaState,'productionRuns'|'productionRunLines'|'productionRunAllocations'|'productionProcessSteps'|'costLines'>
export function migratePhaseFourState(legacy:PhaseFourState):FormulaState{return{...legacy,productionRuns:[],productionRunLines:[],productionRunAllocations:[],productionProcessSteps:[],costLines:[]}}
type PhaseFiveState=Omit<FormulaState,'packagingComponents'|'packagingSupplierProducts'|'packagingInventoryLots'|'packagingInventoryMovements'|'packagingSpecifications'|'packagingSpecificationVersions'|'packagingSpecificationLines'|'packagingAllocations'|'finishedGoodsBatches'|'finishedGoodsMovements'>
export function migratePhaseFiveState(legacy:PhaseFiveState):FormulaState{return{...legacy,packagingComponents:[],packagingSupplierProducts:[],packagingInventoryLots:[],packagingInventoryMovements:[],packagingSpecifications:[],packagingSpecificationVersions:[],packagingSpecificationLines:[],packagingAllocations:[],finishedGoodsBatches:[],finishedGoodsMovements:[]}}
type PhaseSixState=Omit<FormulaState,'responsiblePersons'|'complianceDossiers'|'complianceDocuments'|'regulatorySources'|'regulatoryReviews'|'pifSections'|'cpsrRecords'|'labelArtworkVersions'|'labelReviewItems'|'inciDrafts'|'claims'|'claimEvidence'|'cpnpRecords'|'readinessIssues'|'launchPlans'|'launchMilestones'|'launchDecisions'|'safetyEffectRecords'>
export function migratePhaseSixState(legacy:PhaseSixState):FormulaState{return{...legacy,responsiblePersons:[],complianceDossiers:[],complianceDocuments:[],regulatorySources:[],regulatoryReviews:[],pifSections:[],cpsrRecords:[],labelArtworkVersions:[],labelReviewItems:[],inciDrafts:[],claims:[],claimEvidence:[],cpnpRecords:[],readinessIssues:[],launchPlans:[],launchMilestones:[],launchDecisions:[],safetyEffectRecords:[]}}

export class LocalFormulaRepository implements FormulaRepository {
  load(): FormulaState {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored) return normalizeWorkspaceState(JSON.parse(stored) as FormulaState)
      const phaseSeven=window.localStorage.getItem(PHASE_SEVEN_STORAGE_KEY)
      if(phaseSeven)return normalizeWorkspaceState(JSON.parse(phaseSeven) as FormulaState)
      const phaseSix=window.localStorage.getItem(PHASE_SIX_STORAGE_KEY)
      if(phaseSix)return migratePhaseSixState(JSON.parse(phaseSix) as PhaseSixState)
      const phaseFive=window.localStorage.getItem(PHASE_FIVE_STORAGE_KEY)
      if(phaseFive)return migratePhaseFiveState(JSON.parse(phaseFive) as PhaseFiveState)
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
