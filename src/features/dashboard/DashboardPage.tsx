import { ArrowRight, Beaker, Blend, Box, FlaskConical, Leaf, Plus } from 'lucide-react'
import { activities, batches, ingredients, products, testingActivities } from '../../data/mockData'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { StatusPill } from '../../components/ui/StatusPill'

const quickActions = [{ label: 'New Product', icon: Box }, { label: 'New Formula', icon: Beaker }, { label: 'Start Batch', icon: FlaskConical }, { label: 'Add Ingredient', icon: Leaf }, { label: 'Record Test', icon: Plus }]

export function DashboardPage() {
  const active = products.filter((p) => p.status === 'Active')
  const lowStock = ingredients.filter((i) => i.quantityOnHand <= i.reorderLevel)
  return <>
    <header className="dashboard-hero"><div><span className="eyebrow">Tuesday · 14 July</span><h1>Good afternoon, Robert.</h1><p>The workshop is quiet. Three observations and one material decision need your attention.</p></div><div className="day-stamp"><span>Day</span><strong>195</strong><small>2026</small></div></header>
    <section className="quick-actions" aria-label="Quick actions">{quickActions.map(({ label, icon: Icon }) => <button key={label}><Icon size={17} /><span>{label}</span></button>)}</section>
    <div className="dashboard-grid">
      <section className="panel span-8"><SectionHeader title="Active development" detail={`${active.length} products currently moving`} action={<button className="text-button">All products <ArrowRight size={15} /></button>} /><div className="development-list">{active.map((product) => <article key={product.id}><div className="dev-title"><span className="category-dot" /><div><strong>{product.name}</strong><small>{product.category}</small></div><StatusPill tone={product.developmentStage === 'Testing' ? 'blue' : product.developmentStage === 'Formulation' ? 'amber' : 'green'}>{product.developmentStage}</StatusPill></div><div className="dev-detail"><span>{product.currentFormulaVersion}</span><span>{product.scentProfile}</span><span>Updated {product.updatedAt.slice(5)}</span></div></article>)}</div></section>
      <section className="panel span-4 attention-panel"><SectionHeader title="Material attention" detail="Stock signals from the library" /><strong className="attention-number">{lowStock.length}</strong><span>materials at or below reorder</span><div>{lowStock.map((item) => <p key={item.id}><span>{item.commonName}<small>{item.supplier}</small></span><b>{item.quantityOnHand} {item.unit}</b></p>)}</div><button className="text-button">Review ingredients <ArrowRight size={15} /></button></section>
      <section className="panel span-7"><SectionHeader title="Recent lab batches" detail="Latest work from the bench" /><div className="compact-list">{batches.slice(0, 3).map((batch) => <article key={batch.id}><div className="round-icon"><FlaskConical size={16} /></div><div><strong>{batch.batchNumber}</strong><small>{products.find((p) => p.id === batch.productId)?.name} · {batch.formulaVersion}</small></div><StatusPill tone={batch.status === 'Complete' ? 'green' : batch.status === 'Observing' ? 'blue' : 'neutral'}>{batch.status}</StatusPill></article>)}</div></section>
      <section className="panel span-5"><SectionHeader title="Upcoming testing" detail="The next seven days" /><div className="test-list">{testingActivities.map((test) => <article key={test.id}><div><strong>{test.date.split(' ')[0]}</strong><small>{test.date.split(' ')[1]}</small></div><span><b>{test.title}</b><small>{test.product}</small></span></article>)}</div></section>
      <section className="panel span-12"><SectionHeader title="Latest project activity" detail="A trace of recent decisions and records" /><div className="activity-grid">{activities.map((activity) => <article key={activity.id}><span>{activity.type === 'Scent' ? <Blend size={16} /> : activity.type === 'Lab' ? <FlaskConical size={16} /> : <Leaf size={16} />}</span><div><strong>{activity.title}</strong><small>{activity.detail}</small></div><time>{activity.timestamp}</time></article>)}</div></section>
    </div>
  </>
}
