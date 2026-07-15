import type { FormulaState } from '../../types/domain'
import type { WorkspaceCommit } from '../actions/workspaceActions'

export interface WorkspaceRepository {
  readonly kind: 'local' | 'supabase'
  load(): FormulaState | Promise<FormulaState>
  commit(change: WorkspaceCommit): void | Promise<void>
}

export function changedCollections(change: WorkspaceCommit) {
  return (Object.keys(change.next) as Array<keyof FormulaState>).filter(collection => change.previous[collection] !== change.next[collection])
}
