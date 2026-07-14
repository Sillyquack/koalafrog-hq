import { ArrowLeft, ArrowRight, CalendarDays, FlaskConical, Plus } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { StatusPill } from '../../components/ui/StatusPill'
import { formatDate } from '../../utils/format'
import { useFormulaData } from '../formulas/state/FormulaDataContext'

export function ProductDetailPage() {
  const { productId } = useParams(); const navigate = useNavigate()
  const { products, formulas, formulaVersions, labBatches, testSessions, createFormula } = useFormulaData()
  const product = products.find((item) => item.id === productId)
  if (!product) return <div className="empty-state"><h1>Product not found</h1><Link to="/products">Return to products</Link></div>
  const linked = formulas.filter((formula) => formula.productId === product.id)
  const development = formulaVersions.find((version) => version.id === product.currentDevelopmentFormulaVersionId)
  const approved = formulaVersions.find((version) => version.id === product.currentApprovedFormulaVersionId)
  const recentBatches = labBatches.filter((batch) => batch.productId === product.id).slice(0,3)
  const handleCreate = () => { const name = window.prompt('Formula name', 'New Formula'); if (!name?.trim()) return; const formula = createFormula(product.id, name.trim(), 'New development formula.'); navigate(`/formulas/${formula.id}`) }
  return <>
    <Link className="back-link" to="/products"><ArrowLeft size={14} />Products</Link>
    <PageHeader eyebrow={`${product.category} / Product workspace`} title={product.name} description={product.description} action={<button className="button primary" onClick={handleCreate}><Plus size={16} />Create formula</button>} />
    <div className="product-workspace-grid"><section className="panel product-overview"><SectionHeader title="Product overview" /><dl><div><dt>Development stage</dt><dd><StatusPill tone="blue">{product.developmentStage}</StatusPill></dd></div><div><dt>Status</dt><dd>{product.status}</dd></div><div><dt>Scent profile</dt><dd>{product.scentProfile}</dd></div><div><dt>Target launch</dt><dd><CalendarDays size={14} />{formatDate(product.targetLaunchDate)}</dd></div></dl></section>
      <section className="panel development-state"><SectionHeader title="Development status" detail="Formula versions currently carrying the product" /><article><span><FlaskConical size={16} /></span><div><small>Current development version</small><strong>{development ? `${development.version} · ${development.status}` : 'Not assigned'}</strong></div></article><article><span><FlaskConical size={16} /></span><div><small>Current approved version</small><strong>{approved ? `${approved.version} · ${approved.status}` : 'No approved version yet'}</strong></div></article></section></div>
    <section className="panel formula-section"><SectionHeader title="Product formulas" detail={`${linked.length} formulation ${linked.length === 1 ? 'direction' : 'directions'}`} action={<button className="text-button" onClick={handleCreate}><Plus size={14} />Create formula</button>} /><div className="formula-cards">{linked.map((formula) => { const versions = formulaVersions.filter((item) => item.formulaId === formula.id).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)); const latest = versions[0]; return <Link to={`/formulas/${formula.id}`} key={formula.id}><div><span className="eyebrow">{versions.length} version{versions.length === 1 ? '' : 's'}</span><h3>{formula.name}</h3><p>{formula.description}</p></div><dl><div><dt>Latest</dt><dd>{latest?.version ?? '—'}</dd></div><div><dt>Status</dt><dd><StatusPill tone={latest?.status === 'Draft' ? 'amber' : 'blue'}>{latest?.status ?? '—'}</StatusPill></dd></div><div><dt>Updated</dt><dd>{formatDate(formula.updatedAt.slice(0,10))}</dd></div></dl><ArrowRight size={18} /></Link> })}{!linked.length && <p className="empty-copy">No formulas yet. Create the first development direction for this product.</p>}</div></section>
    <section className="panel linked-testing"><SectionHeader title="Recent lab and testing" detail="Concise execution context for this product" />{recentBatches.map((batch)=><Link to={`/lab/${batch.id}`} key={batch.id}><strong>{batch.batchNumber} · {batch.purpose}</strong><span>{batch.status} · {testSessions.filter((session)=>session.labBatchId===batch.id).length} test sessions</span></Link>)}</section>
  </>
}
