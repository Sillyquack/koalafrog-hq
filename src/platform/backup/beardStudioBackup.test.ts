import{describe,expect,it}from'vitest'
import{formulaSeed}from'../../data/formulaSeed'
import{createStarterWorkspace}from'../../features/beard-studio/domain/beardStudio'
import{normalizeWorkspaceState}from'../../features/formulas/data/formulaRepository'
import{createBackup,validateBackup}from'./backup'

describe('Beard Studio canonical backup and migration',()=>{
 it('exports and restores IDs, relationships, Unknown snapshots, and no Formula composition',()=>{const state=structuredClone(formulaSeed);state.beardStudio=createStarterWorkspace();state.beardStudio.profiles[0].growthNotes='Unknown until observed';const beforeLines=structuredClone(state.formulaLines),backup=createBackup(state),restored=structuredClone(backup.records);expect(validateBackup(backup).valid).toBe(true);expect(restored.beardStudio).toEqual(state.beardStudio);expect(restored.formulaLines).toEqual(beforeLines)})
 it('hydrates a pre-feature workspace to an empty aggregate without mutating its input',()=>{const old=structuredClone(formulaSeed)as Partial<typeof formulaSeed>;delete old.beardStudio;const before=structuredClone(old),migrated=normalizeWorkspaceState(old as typeof formulaSeed);expect(old).toEqual(before);expect(migrated.beardStudio).toEqual({revision:0,profiles:[],lengthMaps:[],tools:[],recipes:[],sessions:[],logs:[]})})
 it('normalization is idempotent and preserves existing canonical records',()=>{const state=structuredClone(formulaSeed);state.beardStudio=createStarterWorkspace();expect(normalizeWorkspaceState(normalizeWorkspaceState(state))).toEqual(state)})
})
