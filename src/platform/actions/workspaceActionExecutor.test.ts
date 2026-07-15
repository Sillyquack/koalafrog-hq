import { describe, expect, it } from 'vitest'
import { formulaSeed } from '../../data/formulaSeed'
import type { WorkspaceRepository } from '../repository/workspaceRepository'
import { executeWorkspaceAction } from './workspaceActionExecutor'
import { workspaceActionNames } from './workspaceActions'

describe('workspace application actions', () => {
  it('inventories all 59 provider mutations without duplicates', () => {
    expect(workspaceActionNames).toHaveLength(59)
    expect(new Set(workspaceActionNames).size).toBe(59)
  })

  it('commits in-memory state only after asynchronous persistence confirms', async () => {
    let release!: () => void
    const repository: WorkspaceRepository = { kind:'supabase',load:()=>formulaSeed,commit:()=>new Promise<void>(resolve=>{release=resolve}) }
    let state=formulaSeed
    executeWorkspaceAction(repository,state,'createIngredient',current=>({...current,ingredients:[...current.ingredients,{...current.ingredients[0],id:'new'}]}),{committed:next=>{state=next},failed:()=>{},pending:()=>{}})
    expect(state).toBe(formulaSeed)
    release()
    await Promise.resolve()
    expect(state.ingredients.some(item=>item.id==='new')).toBe(true)
  })

  it('preserves previous state when persistence rejects', async () => {
    const repository: WorkspaceRepository = { kind:'supabase',load:()=>formulaSeed,commit:()=>Promise.reject(new Error('constraint failure')) }
    let state=formulaSeed,error=''
    executeWorkspaceAction(repository,state,'addMovement',current=>({...current,inventoryMovements:[]}),{committed:next=>{state=next},failed:(_action,failure)=>{error=failure.message},pending:()=>{}})
    await new Promise(resolve=>setTimeout(resolve,0))
    expect(state).toBe(formulaSeed)
    expect(error).toBe('constraint failure')
  })
})
