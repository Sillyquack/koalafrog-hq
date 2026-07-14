import { NavLink } from 'react-router-dom'
import { Beaker, Blend, BookOpen, Boxes, Calculator, ClipboardCheck, Factory, FileText, FlaskConical, Gauge, Leaf, Package, Rocket, ShoppingBasket, TestTubeDiagonal, Toolbox, X } from 'lucide-react'

const navItems = [
  { to: '/', label: 'Dashboard', icon: Gauge, end: true },
  { to: '/products', label: 'Products', icon: Boxes },
  { to: '/formulas', label: 'Formulas', icon: FileText },
  { to: '/ingredients', label: 'Ingredients', icon: Leaf },
  { to: '/lab', label: 'Lab', icon: FlaskConical },
  { to: '/scent-house', label: 'Scent House', icon: Blend },
  { to: '/inventory', label: 'Inventory', icon: ShoppingBasket },
  { to: '/production', label: 'Production', icon: Factory },
  { to: '/testing', label: 'Testing', icon: TestTubeDiagonal },
  { to: '/suppliers', label: 'Suppliers', icon: Package },
  { to: '/equipment', label: 'Equipment', icon: Toolbox },
  { to: '/costing', label: 'Costing', icon: Calculator },
  { to: '/compliance', label: 'Compliance', icon: ClipboardCheck },
  { to: '/packaging', label: 'Packaging', icon: Beaker },
  { to: '/launch', label: 'Launch', icon: Rocket },
  { to: '/knowledge', label: 'Knowledge', icon: BookOpen },
]

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <aside className={`sidebar ${open ? 'is-open' : ''}`}>
      <div className="brand-lockup">
        <div className="brand-symbol" aria-hidden="true">K<span>•</span>F</div>
        <div><strong>Koalafrog HQ</strong><small>Private workshop system</small></div>
        <button className="icon-button sidebar-close" onClick={onClose} aria-label="Close navigation"><X size={19} /></button>
      </div>
      <nav className="primary-nav" aria-label="Primary navigation">
        <p className="nav-label">Workshop</p>
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onClose} className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <Icon size={17} strokeWidth={1.7} /><span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer"><span className="pulse-dot" />Local workspace <small>Foundation v0.1</small></div>
    </aside>
  )
}
