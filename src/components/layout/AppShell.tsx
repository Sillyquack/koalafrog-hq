import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu, Search } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { RouteScrollRestoration } from './RouteScrollRestoration'
import { configuredWorkspaceRuntime, workspaceRuntimeLabel } from '../../platform/startup/runtimeMode'
import { SecureLogoutButton } from '../../platform/auth/AuthGate'

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const workspaceIdentity=workspaceRuntimeLabel(configuredWorkspaceRuntime)
  return (
    <div className="app-shell">
      <RouteScrollRestoration />
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      {menuOpen && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <div className="app-column">
        <header className="topbar">
          <button className="icon-button menu-button" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
          <div className="topbar-search"><Search size={17} /><span>Search the workshop</span><kbd>⌘ K</kbd></div>
          <details className="owner-mark">
            <summary aria-label={`${workspaceIdentity.title}, owner account menu`}>
              <span className="owner-copy"><strong>Owner workspace</strong><small>{workspaceIdentity.title}</small></span>
              <b aria-hidden="true">RK</b>
            </summary>
            <div className="account-menu"><span>{workspaceIdentity.title}</span><SecureLogoutButton /></div>
          </details>
        </header>
        <main className="page"><Outlet /></main>
      </div>
    </div>
  )
}
