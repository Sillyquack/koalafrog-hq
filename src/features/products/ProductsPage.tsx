import { useMemo, useState } from 'react'
import { ArrowUpRight, Plus, SlidersHorizontal } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatusPill } from '../../components/ui/StatusPill'
import { formatDate, initials } from '../../utils/format'
import { useFormulaData } from '../formulas/state/FormulaDataContext'
import { ProductForm } from './components/ProductForm'
import { productTargetDateLabel } from './domain/productDates'

const stageTone = (stage: string) => stage === 'Testing' ? 'blue' : stage === 'Formulation' ? 'amber' : stage === 'Research' ? 'green' : 'neutral'

export function ProductsPage() {
  const { products, formulaVersions } = useFormulaData()
  const [params,setParams]=useSearchParams(); const creating=params.get('create')==='1'
  const [stage, setStage] = useState('All')
  const [category, setCategory] = useState('All')
  const stages = ['All', ...new Set(products.map((item) => item.developmentStage))]
  const categories = ['All', ...new Set(products.map((item) => item.category))]
  const visible = useMemo(() => products.filter((p) => (stage === 'All' || p.developmentStage === stage) && (category === 'All' || p.category === category)), [products, stage, category])
  return <>
    <PageHeader eyebrow={`Portfolio / ${String(products.length).padStart(2, '0')} products`} title="Products" description="The living portfolio—from first provocation to production-ready object." action={<button className="button primary" onClick={()=>setParams({create:'1'})}><Plus size={17} />New product</button>} />
    <div className="filter-bar"><SlidersHorizontal size={16} /><label>Stage<select value={stage} onChange={(event) => setStage(event.target.value)}>{stages.map((value) => <option key={value}>{value}</option>)}</select></label><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((value) => <option key={value}>{value}</option>)}</select></label><span>{visible.length} shown</span></div>
    <div className="product-grid">
      {visible.map((product) => { const development = formulaVersions.find((version) => version.id === product.currentDevelopmentFormulaVersionId); return <Link to={`/products/${product.id}`} className="product-card" key={product.id}>
        <div className="product-card-top"><div className={`product-monogram category-${product.category.toLowerCase().replace(' ', '-')}`}>{initials(product.name)}</div><ArrowUpRight size={19} /></div>
        <div className="product-meta"><span>{product.category}</span><StatusPill tone={stageTone(product.developmentStage)}>{product.developmentStage}</StatusPill></div>
        <h2>{product.name}</h2><p>{product.description}</p>
        <dl className="product-specs"><div><dt>Development</dt><dd>{development?.version ?? 'Not assigned'}</dd></div><div><dt>Scent</dt><dd>{product.scentProfile}</dd></div><div><dt>Target</dt><dd>{productTargetDateLabel(product.targetLaunchDate)}</dd></div></dl>
        <footer><span>Updated {formatDate(product.updatedAt)}</span><span className={`status-text ${product.status === 'Active' ? 'live' : ''}`}>{product.status}</span></footer>
      </Link>})}
    </div>
    {creating&&<ProductForm prerequisite={params.get('reason')==='formula'?'A Product is required before its first Formula can be created.':undefined} onClose={()=>setParams({})}/>}
  </>
}
