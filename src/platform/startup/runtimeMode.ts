export type WorkspaceRuntimeMode = 'local' | 'supabase'
export const configuredWorkspaceRuntime: WorkspaceRuntimeMode = (import.meta.env.VITE_WORKSPACE_REPOSITORY as string | undefined)?.toLowerCase() === 'supabase' ? 'supabase' : 'local'
export const workspaceRuntimeLabel = (runtime: WorkspaceRuntimeMode) => runtime === 'supabase' ? { title: 'Hosted workspace', detail: 'Supabase' } : { title: 'Local workspace', detail: 'Browser storage' }
