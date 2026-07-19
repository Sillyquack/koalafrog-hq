import { afterEach, describe, expect, it, vi } from 'vitest'
import { formulaSeed } from '../../data/formulaSeed'
import { LocalFormulaRepository, STORAGE_KEY, type FormulaRepository } from '../../features/formulas/data/formulaRepository'
import { LocalWorkspaceRepository } from './localWorkspaceRepository'

describe('LocalWorkspaceRepository', () => {
  afterEach(()=>vi.unstubAllGlobals())
  it('owns aggregate v9 persistence for the transitional local session', () => {
    let stored = structuredClone(formulaSeed)
    let saves = 0
    const storage: FormulaRepository = { load:()=>stored,save:state=>{stored=state;saves++} }
    const repository = new LocalWorkspaceRepository(storage)
    const next = {...stored,ingredients:[...stored.ingredients,{...stored.ingredients[0],id:'local-new'}]}
    repository.commit({action:'createIngredient',previous:stored,next})
    expect(saves).toBe(1)
    expect(repository.load().ingredients.some(item=>item.id==='local-new')).toBe(true)
  })
  it('hydrates milligram units without conversion',()=>{let stored=structuredClone(formulaSeed);stored.ingredients[0].defaultUnit='mg';stored.supplierProducts[0].packageUnit='mg';const storage:FormulaRepository={load:()=>stored,save:state=>{stored=state}};const hydrated=new LocalWorkspaceRepository(storage).load();expect(hydrated.ingredients[0].defaultUnit).toBe('mg');expect(hydrated.supplierProducts[0].packageUnit).toBe('mg')})
  it('hydrates legacy v9 records without optional multi-phase fields',()=>{const legacy=structuredClone(formulaSeed);expect(legacy.formulaVersions[0]).not.toHaveProperty('phaseDefinitions');const values=new Map([[STORAGE_KEY,JSON.stringify(legacy)]]);vi.stubGlobal('window',{localStorage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)}});expect(new LocalFormulaRepository().load().formulaVersions[0]).not.toHaveProperty('phaseDefinitions')})
  it('round-trips optional multi-phase metadata through local JSON persistence',()=>{const values=new Map<string,string>();vi.stubGlobal('window',{localStorage:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)}});const repository=new LocalFormulaRepository(),state=structuredClone(formulaSeed);state.formulaVersions[0].phaseDefinitions=[{code:'A',name:'Heat',order:1}];state.formulaVersions[0].manufacturingProcess=[{order:1,title:'Melt',instruction:'Use confirmed limits.',phaseCode:'A',critical:true}];repository.save(state);expect(new LocalFormulaRepository().load().formulaVersions[0]).toMatchObject({phaseDefinitions:state.formulaVersions[0].phaseDefinitions,manufacturingProcess:state.formulaVersions[0].manufacturingProcess})})
})
