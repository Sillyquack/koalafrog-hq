import { WORKSPACE_SCHEMA } from '../../../platform/version'

export const STORAGE_KEY = WORKSPACE_SCHEMA
export const PHASE_SIX_STORAGE_KEY = 'koalafrog-hq:workspace:v8'
export const PHASE_FIVE_STORAGE_KEY = 'koalafrog-hq:workspace:v7'
export const PHASE_FOUR_STORAGE_KEY = 'koalafrog-hq:workspace:v6'
export const PHASE_THREE_STORAGE_KEY = 'koalafrog-hq:workspace:v4'
export const LEGACY_STORAGE_KEY = 'koalafrog-hq:formula-state:v2'

export const LOCAL_WORKSPACE_FALLBACK_ORDER = [
  { version: 'current', storageKey: STORAGE_KEY },
  { version: 'phaseSix', storageKey: PHASE_SIX_STORAGE_KEY },
  { version: 'phaseFive', storageKey: PHASE_FIVE_STORAGE_KEY },
  { version: 'phaseFour', storageKey: PHASE_FOUR_STORAGE_KEY },
  { version: 'phaseThree', storageKey: PHASE_THREE_STORAGE_KEY },
  { version: 'legacyFormulaState', storageKey: LEGACY_STORAGE_KEY },
] as const

export type LocalWorkspaceVersion = typeof LOCAL_WORKSPACE_FALLBACK_ORDER[number]['version']
