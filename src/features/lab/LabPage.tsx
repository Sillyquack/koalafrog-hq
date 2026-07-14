import { CalendarDays, ChevronRight, FlaskConical, Plus } from 'lucide-react'
import { batches, products } from '../../data/mockData'
import { PageHeader } from '../../components/ui/PageHeader'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { StatusPill } from '../../components/ui/StatusPill'
import { formatDate } from '../../utils/format'

const productName = (id: string) => products.find((item) => item.id === id)?.name ?? 'Unknown product'
const tone = (status: string) => status === 'Complete' ? 'green' : status === 'Observing' ? 'blue' : 'neutral'

export function LabPage() {
  return <>
    <PageHeader eyebrow="Lab notebook / Batch record" title="Lab" description="A precise, chronological record of what was made, what changed and what happened next." action={<button className="button primary"><FlaskConical size={17} />Start batch</button>} />
    <section className="lab-feature"><div><span className="eyebrow light">Next on the bench</span><h2>KF-BB-260716-01</h2><p>Beard Butter · formula v0.5</p><div className="lab-feature-meta"><span><CalendarDays size={15} />16 July</span><span>Target 150 g</span><span>Cooling curve trial</span></div></div><button className="button light"><Plus size={16} />Open run sheet</button></section>
    <div className="notebook-layout"><section className="panel"><SectionHeader title="Recent batches" detail="Newest workshop records first" action={<button className="text-button">View archive</button>} /><div className="batch-list">
      {batches.map((batch) => <article className="batch-row" key={batch.id}><div className="batch-index">{batch.batchNumber.split('-').at(-1)}</div><div className="batch-main"><div><strong>{batch.batchNumber}</strong><StatusPill tone={tone(batch.status)}>{batch.status}</StatusPill></div><h3>{productName(batch.productId)}</h3><p>{batch.notes}</p></div><dl><div><dt>Formula</dt><dd>{batch.formulaVersion}</dd></div><div><dt>Yield</dt><dd>{batch.actualYield ? `${batch.actualYield} / ` : ''}{batch.targetYield} g</dd></div><div><dt>Date</dt><dd>{formatDate(batch.date)}</dd></div></dl><ChevronRight size={18} /></article>)}
    </div></section><aside className="panel lab-aside"><SectionHeader title="Observation rhythm" detail="The shape of a future record" /><div className="timeline"><div className="done"><b>0h</b><span><strong>Initial observation</strong><small>Texture, appearance, aroma, yield</small></span></div><div className="current"><b>24h</b><span><strong>Settling review</strong><small>Due tomorrow · Oil v0.8</small></span></div><div><b>7d</b><span><strong>Short-term review</strong><small>Texture and scent development</small></span></div><div><b>30d</b><span><strong>Study checkpoint</strong><small>Longer-term observations</small></span></div></div><div className="future-block"><strong>Designed to grow</strong><p>Future batch records can add exact weigh-ins, process steps, deviations, images and timed observations without changing this core model.</p></div></aside></div>
  </>
}
