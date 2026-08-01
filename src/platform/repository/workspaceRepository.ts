import type { FormulaState, PackagingComponent } from '../../types/domain'
import type { WorkspaceCommit } from '../actions/workspaceActions'

export interface WorkspaceRepository {
  readonly kind: 'local' | 'supabase'
  load(): FormulaState | Promise<FormulaState>
  commit(change: WorkspaceCommit): WorkspaceCommitConfirmation | void | Promise<WorkspaceCommitConfirmation | void>
  readPackagingComponent?(workspaceId:string,id:string): PackagingComponent | undefined | Promise<PackagingComponent | undefined>
}

export interface WorkspaceCommitConfirmation {
  confirmedPackagingComponent?: PackagingComponent
}

export function changedCollections(change: WorkspaceCommit) {
  return (Object.keys(change.next) as Array<keyof FormulaState>).filter(collection => change.previous[collection] !== change.next[collection])
}
