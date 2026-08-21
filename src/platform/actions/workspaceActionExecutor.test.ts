import { describe, expect, it } from 'vitest'
import { formulaSeed } from '../../data/formulaSeed'
import type { WorkspaceRepository } from '../repository/workspaceRepository'
import { executeWorkspaceAction } from './workspaceActionExecutor'
import { workspaceActionNames } from './workspaceActions'

describe('workspace application actions', () => {
  it('inventories all 73 provider mutations without duplicates', () => {
    expect(workspaceActionNames).toHaveLength(73)
    expect(new Set(workspaceActionNames).size).toBe(73)
  })

  it('commits in-memory state only after asynchronous persistence confirms', async () => {
    let release!: () => void
    const repository: WorkspaceRepository = { kind:'supabase',load:()=>formulaSeed,commit:()=>new Promise<void>(resolve=>{release=resolve}) }
    let state=formulaSeed
    const action=executeWorkspaceAction(repository,state,'createIngredient',current=>({...current,ingredients:[...current.ingredients,{...current.ingredients[0],id:'new'}]}),{committed:next=>{state=next},failed:()=>{},pending:()=>{}})
    expect(state).toBe(formulaSeed)
    release()
    await action
    expect(state.ingredients.some(item=>item.id==='new')).toBe(true)
  })

  it('preserves previous state when persistence rejects', async () => {
    const repository: WorkspaceRepository = { kind:'supabase',load:()=>formulaSeed,commit:()=>Promise.reject(new Error('constraint failure')) }
    let state=formulaSeed,error=''
    await expect(executeWorkspaceAction(repository,state,'addMovement',current=>({...current,inventoryMovements:[]}),{committed:next=>{state=next},failed:(_action,failure)=>{error=failure.message},pending:()=>{}})).rejects.toThrow('constraint failure')
    expect(state).toBe(formulaSeed)
    expect(error).toBe('constraint failure')
  })

  it('publishes a Packaging Component update only from confirmed repository readback', async()=>{
    const before=formulaSeed.packagingComponents[0]
    expect(before).toBeDefined()
    const persisted={...before,notes:'Persisted note',updatedAt:'2026-07-31T12:00:00.000Z'}
    const repository:WorkspaceRepository={kind:'supabase',load:()=>formulaSeed,commit:async()=>({confirmedPackagingComponent:persisted})}
    let state=formulaSeed
    await executeWorkspaceAction(repository,state,'updatePackagingComponent',current=>({...current,packagingComponents:current.packagingComponents.map(item=>item.id===before.id?{...item,notes:'Requested note'}:item)}),{committed:next=>{state=next},failed:()=>{},pending:()=>{}})
    expect(state.packagingComponents.find(item=>item.id===before.id)).toEqual(persisted)
  })

  it('retains prior Packaging Component state when confirmed readback is missing',async()=>{
    const before=formulaSeed.packagingComponents[0]
    const repository:WorkspaceRepository={kind:'supabase',load:()=>formulaSeed,commit:async()=>undefined}
    let state=formulaSeed,error=''
    await expect(executeWorkspaceAction(repository,state,'updatePackagingComponent',current=>({...current,packagingComponents:current.packagingComponents.map(item=>item.id===before.id?{...item,notes:'Unconfirmed'}:item)}),{committed:next=>{state=next},failed:(_action,failure)=>{error=failure.message},pending:()=>{}})).rejects.toThrow(/definitive owner-authorized readback/)
    expect(state).toBe(formulaSeed)
    expect(error).toMatch(/definitive owner-authorized readback/)
  })
})
