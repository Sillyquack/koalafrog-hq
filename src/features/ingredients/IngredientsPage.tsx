import { useMemo, useState } from 'react'
import { Archive, Plus, Search } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatusPill } from '../../components/ui/StatusPill'
import { ingredientBalance, stockState } from '../inventory/domain/inventoryLogic'
import { useFormulaData } from '../formulas/state/FormulaDataContext'
import { IngredientForm } from './components/IngredientForm'

export function IngredientsPage() {
  const data = useFormulaData(); const [params,setParams]=useSearchParams(); const [search, setSearch] = useState(''); const [category, setCategory] = useState('All'); const [status, setStatus] = useState('All'); const [stock, setStock] = useState('All'); const creating=params.get('create')==='1'
  const categories = ['All', ...new Set(data.ingredients.map((item) => item.category))]
  const visible = useMemo(() => data.ingredients.filter((item) => { const state = stockState(item, data.inventoryLots, data.inventoryMovements); return (item.commonName.toLowerCase().includes(search.toLowerCase()) || item.inciName.toLowerCase().includes(search.toLowerCase())) && (category === 'All' || item.category === category) && (status === 'All' || item.status === status) && (stock === 'All' || state === stock) }), [data.ingredients, data.inventoryLots, data.inventoryMovements, search, category, status, stock])
  const low = data.ingredients.filter((item) => stockState(item, data.inventoryLots, data.inventoryMovements) === 'Low').length
  return <>
    <PageHeader eyebrow={`Material library / ${String(data.ingredients.length).padStart(2,'0')} records`} title="Ingredients" description="Material identity, sourcing context and lot-derived stock—kept deliberately separate." action={<button className="button primary" onClick={() => setParams({create:'1'})}><Plus size={16}/>Add ingredient</button>} />
    <div className="metric-strip"><div><span>Active materials</span><strong>{data.ingredients.filter((i) => i.status === 'Active').length}</strong><small>Available to development</small></div><div><span>Low stock</span><strong className="warning-text">{low}</strong><small>At or below reorder threshold</small></div><div><span>Physical lots</span><strong>{data.inventoryLots.length}</strong><small>Movement-derived inventory</small></div></div>
    <div className="inventory-filters"><label className="search-field"><Search size={16}/><input aria-label="Search ingredients" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or INCI" /></label><select aria-label="Ingredient category" value={category} onChange={(e) => setCategory(e.target.value)}>{categories.map((v)=><option key={v}>{v}</option>)}</select><select aria-label="Ingredient status" value={status} onChange={(e)=>setStatus(e.target.value)}>{['All','Active','Research','Archived'].map((v)=><option key={v}>{v}</option>)}</select><select aria-label="Inventory status" value={stock} onChange={(e)=>setStock(e.target.value)}>{['All','In Stock','Low','Out of Stock','No Inventory Data'].map((v)=><option key={v}>{v}</option>)}</select></div>
    <div className="ingredient-library">{visible.map((item) => { const balance = ingredientBalance(item, data.inventoryLots, data.inventoryMovements); const state = stockState(item, data.inventoryLots, data.inventoryMovements); const lots = data.inventoryLots.filter((lot) => lot.ingredientId === item.id && lot.status === 'Active'); const preferred = data.supplierProducts.find((p) => p.ingredientId === item.id && p.isPreferred); return <Link to={`/ingredients/${item.id}`} key={item.id}><div><span className="eyebrow">{item.category}</span><h2>{item.commonName}</h2><p>{item.inciName}</p><small>{item.functions.join(' · ')}</small></div><dl><div><dt>Available</dt><dd>{balance} {item.defaultUnit}</dd></div><div><dt>Active lots</dt><dd>{lots.length}</dd></div><div><dt>Preferred source</dt><dd>{preferred?.supplierName ?? 'Not set'}</dd></div></dl><StatusPill tone={state === 'In Stock' ? 'green' : state === 'Low' ? 'amber' : 'neutral'}>{state}</StatusPill>{item.status === 'Archived' && <Archive size={15}/>}</Link>})}</div>
    {creating && <IngredientForm onClose={() => setParams({})} />}
  </>
}
