import type { FormulaState } from '../../types/domain'
import type { WorkspaceRepository } from '../repository/workspaceRepository'
import type { WorkspaceActionName, WorkspaceStateMutation } from './workspaceActions'

export interface WorkspaceActionHooks {
  committed(next: FormulaState): void
  failed(action: WorkspaceActionName, error: Error): void
  pending(action: WorkspaceActionName, pending: boolean): void
}

function persistenceError(error: unknown) {
  if (error instanceof Error) return error
  const message = typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string'
    ? error.message
    : 'Persistence failed.'
  return new Error(message, { cause: error })
}

export async function executeWorkspaceAction(repository: WorkspaceRepository,current: FormulaState,action: WorkspaceActionName,mutation: WorkspaceStateMutation,hooks: WorkspaceActionHooks) {
  const next = mutation(current)
  if (next === current) return
  hooks.pending(action, true)
  try {
    const confirmation=await repository.commit({ action, previous: current, next })
    let confirmedNext=next
    if(action==='updatePackagingComponent'){
      const persisted=confirmation?.confirmedPackagingComponent
      if(!persisted)throw new Error('Packaging Component persistence did not return a definitive owner-authorized readback.')
      confirmedNext={...next,packagingComponents:next.packagingComponents.map(item=>item.id===persisted.id?persisted:item)}
    }
    hooks.committed(confirmedNext)
  } catch (error) {
    const failure=persistenceError(error)
    hooks.failed(action, failure)
    throw failure
  } finally {
    hooks.pending(action, false)
  }
}
