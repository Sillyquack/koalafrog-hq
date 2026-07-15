export type RemoteWorkspaceState = 'missing' | 'empty' | 'importing' | 'reconciliation_required' | 'active' | 'failed'

export type WorkspaceStartupState =
  | 'signed_out'
  | 'loading_remote'
  | 'migration_available'
  | 'empty_remote'
  | 'workspace_ready'
  | 'migration_in_progress'
  | 'platform_error'

export interface WorkspaceStartupInput {
  authenticated: boolean
  loading: boolean
  remoteState?: RemoteWorkspaceState
  hasValidLocalV9: boolean
  remoteError?: boolean
}

/**
 * Selects one authoritative startup path. A remote failure never falls back to
 * an editable local workspace, and an active remote workspace always wins.
 */
export function selectWorkspaceStartup(input: WorkspaceStartupInput): WorkspaceStartupState {
  if (!input.authenticated) return 'signed_out'
  if (input.loading) return 'loading_remote'
  if (input.remoteError || input.remoteState === 'failed') return 'platform_error'
  if (input.remoteState === 'active') return 'workspace_ready'
  if (input.remoteState === 'importing' || input.remoteState === 'reconciliation_required') return 'migration_in_progress'
  if ((input.remoteState === 'missing' || input.remoteState === 'empty') && input.hasValidLocalV9) return 'migration_available'
  return 'empty_remote'
}
