import { useState } from 'react'
import { Activity, Brain, Clock3, Lightbulb, Sparkles } from 'lucide-react'
import type { Agent } from '../Agents/Agent'
import type { IntelligenceAction } from './actions'
import type { IntelligenceContext, IntelligenceResult } from '../Shared/models'
import { executeIntelligencePipeline } from '../Pipelines/intelligencePipeline'

type PanelSection = 'Insights' | 'Recommendations' | 'History' | 'Actions' | 'Summary'
const sections: readonly PanelSection[] = ['Insights', 'Recommendations', 'History', 'Actions', 'Summary']

export interface IntelligencePanelProps {
  context: IntelligenceContext
  actions: readonly IntelligenceAction[]
  agents: readonly Agent[]
  initialResult: IntelligenceResult
  title?: string
}

export function IntelligencePanel({ context, actions, agents, initialResult, title = 'Intelligence' }: IntelligencePanelProps) {
  const [section, setSection] = useState<PanelSection>('Insights')
  const [result, setResult] = useState<IntelligenceResult>(initialResult)
  const [running, setRunning] = useState<string | null>(null)
  const [error, setError] = useState('')

  const run = async (action: IntelligenceAction) => {
    setRunning(action.id); setError('')
    try { setResult(await executeIntelligencePipeline(agents, context, action)); setSection(action.kind === 'Recommend' ? 'Recommendations' : action.kind === 'Summarize' ? 'Summary' : 'Insights') }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Intelligence action failed.') }
    finally { setRunning(null) }
  }

  return <section className="intelligence-panel" aria-labelledby="intelligence-title">
    <header><div><span className="eyebrow"><Sparkles size={13}/> Advisory layer</span><h2 id="intelligence-title">{title}</h2><p>Observes and recommends. Authoritative workspace data is never changed automatically.</p></div><Brain aria-hidden="true" /></header>
    <div className={`intelligence-provenance ${result.provenance}`} role="status">{result.provenance === 'mock' ? 'Demo / mocked output — not a real analysis' : result.provenance === 'provider' ? 'Provider-generated advisory output' : 'Computed from workspace records'}</div>
    <nav aria-label="Intelligence sections">{sections.map(item => <button key={item} type="button" aria-pressed={section === item} onClick={() => setSection(item)}>{item}</button>)}</nav>
    <div className="intelligence-panel-content">
      {section === 'Insights' && <PanelList empty="Run an analysis to generate insights.">{result.insights?.map(insight => <article key={insight.id}><span className={`intelligence-severity ${insight.severity}`}>{insight.severity}</span><strong>{insight.title}</strong><p>{insight.description}</p><small>{Math.round(insight.confidence * 100)}% confidence · {insight.sourceAgent}</small></article>)}</PanelList>}
      {section === 'Recommendations' && <PanelList empty="No recommendations yet.">{result.recommendations?.map(item => <article key={item.id}><span className="intelligence-severity recommendation">{item.priority}</span><strong>{item.reason}</strong><p>{item.expectedBenefit}</p><small>{Math.round(item.confidence * 100)}% confidence</small></article>)}</PanelList>}
      {section === 'History' && <PanelList empty="Historical context will appear when records are available.">{result.history?.map(point => <article key={point.timestamp}><Clock3/><strong>{new Date(point.timestamp).toLocaleDateString()}</strong><p>{point.value}</p></article>)}</PanelList>}
      {section === 'Actions' && (agents.length ? <div className="intelligence-actions">{actions.map(action => <button key={action.id} type="button" disabled={running !== null} onClick={() => void run(action)}><Activity/><span><strong>{action.label}</strong><small>{action.description ?? action.kind}</small></span>{running === action.id && <em role="status">Working…</em>}</button>)}</div> : <div className="intelligence-unavailable" role="status"><strong>Intelligence provider unavailable</strong><p>No analysis can run right now. Beard Studio remains fully usable and no workspace records are affected.</p></div>)}
      {section === 'Summary' && <div className="intelligence-summary"><Lightbulb/><p>{result.summary ?? 'Run “Summarize Progress” to create a context-aware summary.'}</p></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  </section>
}

function PanelList({ children, empty }: { children: React.ReactNode; empty: string }) {
  const values = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : []
  return values.length ? <div className="intelligence-list">{children}</div> : <p className="intelligence-empty">{empty}</p>
}
