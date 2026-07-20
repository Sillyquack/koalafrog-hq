import { Link, NavLink, Outlet } from 'react-router-dom'
import { Scissors } from 'lucide-react'
import { BeardStudioProvider } from '../data/beardStudioRepository'

const tabs = [
  ['', 'Overview'],
  ['profile', 'Profile'],
  ['length-map', 'Length Map'],
  ['recipes', 'Trim Recipes'],
  ['log', 'Beard Log'],
  ['tools', 'Tools'],
] as const

export function BeardStudioShell() {
  return <BeardStudioProvider><div className="beard-studio">
    <header className="page-header beard-studio-header">
      <div><span className="eyebrow">Grooming / repeatable practice</span><h1><Scissors size={28} />Beard Studio</h1><p>Define, perform and improve a controlled beard routine.</p></div>
      <Link className="button primary" to="/grooming/beard-studio/trim">Start Trim</Link>
    </header>
    <nav className="studio-tabs" aria-label="Beard Studio sections">{tabs.map(([path, label]) => <NavLink key={label} end={!path} to={`/grooming/beard-studio${path ? `/${path}` : ''}`}>{label}</NavLink>)}</nav>
    <Outlet />
  </div></BeardStudioProvider>
}
