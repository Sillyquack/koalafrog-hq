import { describe, expect, it } from 'vitest'
import { WORKSPACE_SCHEMA } from '../../../platform/version'
import {
  LEGACY_STORAGE_KEY as REPOSITORY_LEGACY_STORAGE_KEY,
  PHASE_FIVE_STORAGE_KEY as REPOSITORY_PHASE_FIVE_STORAGE_KEY,
  PHASE_FOUR_STORAGE_KEY as REPOSITORY_PHASE_FOUR_STORAGE_KEY,
  PHASE_SIX_STORAGE_KEY as REPOSITORY_PHASE_SIX_STORAGE_KEY,
  PHASE_THREE_STORAGE_KEY as REPOSITORY_PHASE_THREE_STORAGE_KEY,
  STORAGE_KEY as REPOSITORY_STORAGE_KEY,
  LocalFormulaRepository,
} from './formulaRepository'
import {
  LEGACY_STORAGE_KEY,
  LOCAL_WORKSPACE_FALLBACK_ORDER,
  PHASE_FIVE_STORAGE_KEY,
  PHASE_FOUR_STORAGE_KEY,
  PHASE_SIX_STORAGE_KEY,
  PHASE_THREE_STORAGE_KEY,
  STORAGE_KEY,
} from './workspaceMigrationVersions'

describe('local workspace migration versions',()=>{
  it('retains every historical storage key and the current workspace schema',()=>{
    expect({
      current:STORAGE_KEY,
      phaseSix:PHASE_SIX_STORAGE_KEY,
      phaseFive:PHASE_FIVE_STORAGE_KEY,
      phaseFour:PHASE_FOUR_STORAGE_KEY,
      phaseThree:PHASE_THREE_STORAGE_KEY,
      legacyFormulaState:LEGACY_STORAGE_KEY,
    }).toEqual({
      current:'koalafrog-hq:workspace:v9',
      phaseSix:'koalafrog-hq:workspace:v8',
      phaseFive:'koalafrog-hq:workspace:v7',
      phaseFour:'koalafrog-hq:workspace:v6',
      phaseThree:'koalafrog-hq:workspace:v4',
      legacyFormulaState:'koalafrog-hq:formula-state:v2',
    })
    expect(STORAGE_KEY).toBe(WORKSPACE_SCHEMA)
  })

  it('documents the runtime fallback order from current through legacy',()=>{
    const orderedKeys=LOCAL_WORKSPACE_FALLBACK_ORDER.map(entry=>entry.storageKey)
    expect(orderedKeys).toEqual([
      STORAGE_KEY,
      PHASE_SIX_STORAGE_KEY,
      PHASE_FIVE_STORAGE_KEY,
      PHASE_FOUR_STORAGE_KEY,
      PHASE_THREE_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
    ])
    const requestedKeys:string[]=[]
    Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:{getItem:(key:string)=>{requestedKeys.push(key);return null}}}})
    new LocalFormulaRepository().load()
    expect(requestedKeys).toEqual(orderedKeys)
  })

  it('keeps the formula repository public constants intact',()=>{
    expect([
      REPOSITORY_STORAGE_KEY,
      REPOSITORY_PHASE_SIX_STORAGE_KEY,
      REPOSITORY_PHASE_FIVE_STORAGE_KEY,
      REPOSITORY_PHASE_FOUR_STORAGE_KEY,
      REPOSITORY_PHASE_THREE_STORAGE_KEY,
      REPOSITORY_LEGACY_STORAGE_KEY,
    ]).toEqual([
      STORAGE_KEY,
      PHASE_SIX_STORAGE_KEY,
      PHASE_FIVE_STORAGE_KEY,
      PHASE_FOUR_STORAGE_KEY,
      PHASE_THREE_STORAGE_KEY,
      LEGACY_STORAGE_KEY,
    ])
  })
})
