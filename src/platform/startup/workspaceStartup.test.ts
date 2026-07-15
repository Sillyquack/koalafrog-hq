import { describe, expect, it } from 'vitest'
import { selectWorkspaceStartup } from './workspaceStartup'

describe('workspace startup authority', () => {
  it('loads an active remote workspace even when local v9 also exists', () => {
    expect(selectWorkspaceStartup({ authenticated: true, loading: false, remoteState: 'active', hasValidLocalV9: true })).toBe('workspace_ready')
  })

  it('offers explicit migration only for an empty remote workspace', () => {
    expect(selectWorkspaceStartup({ authenticated: true, loading: false, remoteState: 'empty', hasValidLocalV9: true })).toBe('migration_available')
    expect(selectWorkspaceStartup({ authenticated: true, loading: false, remoteState: 'empty', hasValidLocalV9: false })).toBe('empty_remote')
  })

  it('never treats local v9 as a fallback after a remote failure', () => {
    expect(selectWorkspaceStartup({ authenticated: true, loading: false, remoteState: 'active', hasValidLocalV9: true, remoteError: true })).toBe('platform_error')
  })

  it('does not expose an unreconciled import as ready', () => {
    expect(selectWorkspaceStartup({ authenticated: true, loading: false, remoteState: 'reconciliation_required', hasValidLocalV9: true })).toBe('migration_in_progress')
  })
})
