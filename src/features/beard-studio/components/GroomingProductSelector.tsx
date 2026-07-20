import { groomingProductRoles, type GroomingProductReference, type GroomingProductRole } from '../domain/beardStudio'
import { useFormulaData } from '../../formulas/state/FormulaDataContext'

export function GroomingProductSelector({ value, onChange, legend = 'Grooming products' }: { value: GroomingProductReference[]; onChange(value: GroomingProductReference[]): void; legend?: string }) {
  const { products } = useFormulaData()
  const selectable = products.filter(product => product.status !== 'Archived')
  if (!products.length) return <fieldset className="product-selector"><legend>{legend}</legend><div className="empty-inline"><strong>No Koalafrog Products available</strong><span>Create Products in the portfolio before linking them here. Beard Studio remains usable without products.</span></div></fieldset>
  const toggle = (productId: string, selected: boolean) => {
    const product = products.find(item => item.id === productId)
    if (!product) return
    onChange(selected ? [...value, { productId, nameSnapshot: product.name, categorySnapshot: product.category, role: 'beard oil' }] : value.filter(item => item.productId !== productId))
  }
  const changeRole = (productId: string | null, role: GroomingProductRole) => onChange(value.map(item => item.productId === productId ? { ...item, role } : item))
  return <fieldset className="product-selector"><legend>{legend}</legend>
    {!selectable.length && <div className="empty-inline"><strong>No active Products</strong><span>Archived Products remain visible in historical Beard Logs only.</span></div>}
    {selectable.map(product => {
      const selected = value.find(item => item.productId === product.id)
      return <div className="product-choice" key={product.id}><label><input type="checkbox" checked={Boolean(selected)} onChange={event => toggle(product.id, event.target.checked)}/><span><strong>{product.name}</strong><small>{product.category} · {product.status}</small></span></label>{selected&&<label>Usage role<select aria-label={`${product.name} usage role`} value={selected.role} onChange={event => changeRole(product.id,event.target.value as GroomingProductRole)}>{groomingProductRoles.map(role=><option key={role}>{role}</option>)}</select></label>}</div>
    })}
  </fieldset>
}
