import { AlertTriangle, Plus, Search, SlidersHorizontal } from 'lucide-react'
import { ingredients } from '../../data/mockData'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatusPill } from '../../components/ui/StatusPill'
import { formatMoney } from '../../utils/format'

export function IngredientsPage() {
  const attention = ingredients.filter((item) => item.quantityOnHand <= item.reorderLevel)
  return <>
    <PageHeader eyebrow={`Material library / ${String(ingredients.length).padStart(2, '0')} records`} title="Ingredients" description="Working knowledge of every oil, butter, wax and aromatic material in the workshop." action={<button className="button primary"><Plus size={17} />Add ingredient</button>} />
    <div className="metric-strip"><div><span>Materials</span><strong>{ingredients.length}</strong><small>Across the working library</small></div><div><span>Need attention</span><strong className="warning-text">{attention.length}</strong><small>At or below reorder level</small></div><div><span>Scent records</span><strong>{ingredients.filter((item) => item.category.includes('Scent')).length}</strong><small>Materials and internal blends</small></div></div>
    <div className="table-card">
      <div className="table-tools"><label className="search-field"><Search size={17} /><input aria-label="Search ingredients" placeholder="Search name, INCI or supplier" /></label><button className="button ghost"><SlidersHorizontal size={16} />Filters</button></div>
      <div className="responsive-table"><table><thead><tr><th>Material</th><th>Category / function</th><th>Supplier</th><th>On hand</th><th>Unit cost</th><th>Status</th></tr></thead><tbody>
        {ingredients.map((item) => { const low = item.quantityOnHand <= item.reorderLevel; return <tr key={item.id}><td><strong>{item.commonName}</strong><small>{item.inciName}</small></td><td>{item.category}<small>{item.function}</small></td><td>{item.supplier}</td><td><strong>{item.quantityOnHand} {item.unit}</strong><small>Reorder at {item.reorderLevel} {item.unit}</small></td><td>{formatMoney(item.cost)}<small>per {item.unit}</small></td><td>{low ? <StatusPill tone="amber"><AlertTriangle size={12} />Attention</StatusPill> : <StatusPill tone="green">In stock</StatusPill>}</td></tr> })}
      </tbody></table></div>
    </div>
    <p className="content-note">Material records are operational notes only; regulatory and safety assessment belong in the future Compliance workflow.</p>
  </>
}
