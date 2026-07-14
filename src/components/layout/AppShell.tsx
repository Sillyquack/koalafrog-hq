import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu, Search } from 'lucide-react'
import { Sidebar } from './Sidebar'

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="app-shell">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      {menuOpen && <button className="nav-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <div className="app-column">
        <header className="topbar">
          <button className="icon-button menu-button" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
          <div className="topbar-search"><Search size={17} /><span>Search the workshop</span><kbd>⌘ K</kbd></div>
          <div className="owner-mark"><span>Owner workspace</span><b>RK</b></div>
        </header>
        <main className="page"><Outlet /></main>
      </div>
    </div>
  )
}
