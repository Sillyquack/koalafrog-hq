import { ArrowRight, CircleDashed } from 'lucide-react'
import type { ModuleDefinition } from '../../types/domain'
import { PageHeader } from '../../components/ui/PageHeader'

export function PlaceholderPage({ module }: { module: ModuleDefinition }) {
  return <><PageHeader eyebrow={module.eyebrow} title={module.name} description={module.description} /><section className="placeholder-card"><div className="placeholder-mark"><CircleDashed size={38} /></div><span className="eyebrow">Planned workspace</span><h2>A considered foundation, ready for its workflow.</h2><p>This module will be developed in a later phase. Its place in the navigation and domain architecture is reserved now so the system can grow without a structural redesign.</p><div className="capability-list">{module.capabilities.map((capability, index) => <article key={capability}><span>0{index + 1}</span><strong>{capability}</strong><ArrowRight size={16} /></article>)}</div></section></>
}
