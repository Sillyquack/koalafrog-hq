import { describe, expect, it } from 'vitest'
import { formulaSeed } from '../../data/formulaSeed'
import type { FormulaRepository } from '../../features/formulas/data/formulaRepository'
import { LocalWorkspaceRepository } from './localWorkspaceRepository'

describe('LocalWorkspaceRepository', () => {
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
})
