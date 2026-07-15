import type { FormulaState } from '../../types/domain'
import type { WorkspaceRepository } from '../repository/workspaceRepository'
import type { WorkspaceActionName, WorkspaceStateMutation } from './workspaceActions'

export interface WorkspaceActionHooks {
  committed(next: FormulaState): void
  failed(action: WorkspaceActionName, error: Error): void
  pending(action: WorkspaceActionName, pending: boolean): void
}

export function executeWorkspaceAction(repository: WorkspaceRepository,current: FormulaState,action: WorkspaceActionName,mutation: WorkspaceStateMutation,hooks: WorkspaceActionHooks) {
  const next = mutation(current)
  if (next === current) return
  hooks.pending(action, true)
  try {
    const persisted = repository.commit({ action, previous: current, next })
    if (persisted instanceof Promise) {
      void persisted.then(() => hooks.committed(next)).catch(error => hooks.failed(action, error instanceof Error ? error : new Error('Persistence failed.'))).finally(() => hooks.pending(action, false))
    } else {
      hooks.committed(next)
      hooks.pending(action, false)
    }
  } catch (error) {
    hooks.failed(action, error instanceof Error ? error : new Error('Persistence failed.'))
    hooks.pending(action, false)
  }
}
