import { ArrowUpRight, Plus, SlidersHorizontal } from 'lucide-react'
import { products } from '../../data/mockData'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatusPill } from '../../components/ui/StatusPill'
import { formatDate, initials } from '../../utils/format'

const stageTone = (stage: string) => stage === 'Testing' ? 'blue' : stage === 'Formulation' ? 'amber' : stage === 'Research' ? 'green' : 'neutral'

export function ProductsPage() {
  return <>
    <PageHeader eyebrow="Portfolio / 05 products" title="Products" description="The living portfolio—from first provocation to production-ready object." action={<button className="button primary"><Plus size={17} />New product</button>} />
    <div className="toolbar"><div className="segmented"><button className="selected">All products <span>5</span></button><button>Active <span>4</span></button><button>On hold <span>1</span></button></div><button className="button ghost"><SlidersHorizontal size={16} />Filter</button></div>
    <div className="product-grid">
      {products.map((product) => <article className="product-card" key={product.id}>
        <div className="product-card-top"><div className={`product-monogram category-${product.category.toLowerCase().replace(' ', '-')}`}>{initials(product.name)}</div><ArrowUpRight size={19} /></div>
        <div className="product-meta"><span>{product.category}</span><StatusPill tone={stageTone(product.developmentStage)}>{product.developmentStage}</StatusPill></div>
        <h2>{product.name}</h2><p>{product.description}</p>
        <dl className="product-specs"><div><dt>Formula</dt><dd>{product.currentFormulaVersion}</dd></div><div><dt>Scent</dt><dd>{product.scentProfile}</dd></div><div><dt>Target</dt><dd>{formatDate(product.targetLaunchDate)}</dd></div></dl>
        <footer><span>Updated {formatDate(product.updatedAt)}</span><span className={`status-text ${product.status === 'Active' ? 'live' : ''}`}>{product.status}</span></footer>
      </article>)}
    </div>
  </>
}
