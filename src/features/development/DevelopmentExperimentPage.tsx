/* eslint-disable react-hooks/set-state-in-effect -- repository hydration synchronizes external records */
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, GitBranch, Play } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useActiveWorkspace } from '../../platform/startup/ActiveWorkspaceContext'
import { developmentActions } from './actions/developmentExperimentActions'
import { canFormulaHandoff, formulaDiff, reviewIssues, transitionTargets, type DevelopmentExperiment } from './domain/developmentExperiment'

export function DevelopmentExperimentPage() {
  const { id = '' } = useParams(), workspace = useActiveWorkspace()
  const [item, setItem] = useState<DevelopmentExperiment>(), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const load = useCallback(async () => { if (!workspace) return; try { setItem((await developmentActions.load(workspace.workspaceId)).find(x => x.id === id)); setError('') } catch (e) { setError(e instanceof Error ? e.message : 'Experiment unavailable.') } }, [workspace, id])
  useEffect(() => void load(), [load])
  const act = async (run: () => Promise<unknown>) => { setBusy(true); setError(''); try { await run(); await load() } catch (e) { setError(e instanceof Error ? e.message : 'Action failed.') } finally { setBusy(false) } }
  if (!item) return <div><Link className="back-link" to="/development"><ArrowLeft size={14} />Development</Link><section className="panel"><p>{error || 'Loading Experiment…'}</p></section></div>
  const issues = reviewIssues(item)
  return <div className="experiment-detail">
    <Link className="back-link" to="/development"><ArrowLeft size={14} />Development</Link>
    <header><div><span className="eyebrow">Experiment · {item.status.replaceAll('_', ' ')}</span><h1>{item.title}</h1><p>{item.objective}</p></div></header>
    {error && <div className="intelligence-error" role="alert">{error}</div>}
    <section className="panel"><h2>Lifecycle</h2>{issues.length > 0 && <aside><strong>Review readiness</strong>{issues.map(x => <p key={x}>{x}</p>)}</aside>}<div className="action-row">{transitionTargets[item.status].map(status => <button className="button ghost" disabled={busy || (status === 'approved' && issues.length > 0)} key={status} onClick={() => act(() => developmentActions.transition(item.id, status, item.revision))}>{status.replaceAll('_', ' ')}</button>)}</div></section>
    <section className="panel"><h2>Plan</h2><dl><div><dt>Hypothesis</dt><dd>{item.hypothesis || 'Not set'}</dd></div><div><dt>Acceptance criteria</dt><dd>{item.acceptance_criteria || 'Not set'}</dd></div><div><dt>Rationale</dt><dd>{item.user_rationale || 'Not set'}</dd></div></dl></section>
    {item.variants.map(v => <section className="panel variant-card" key={v.id}><span className="status-badge">{v.status}</span><h2>{v.name}{v.is_control ? ' · Control' : ''}</h2><p>{v.purpose}</p><h3>Formula diff</h3>{formulaDiff(v).length ? formulaDiff(v).map((d, i) => <p key={i}><strong>{d.action} {d.material}</strong> · {d.before ?? '—'} → {d.after ?? d.action} {d.unit ?? ''}</p>) : <p>Standalone qualitative variant; no Formula changes recorded.</p>}<div className="action-row">{v.linked_formula_version_id ? <Link className="button ghost" to={`/formulas/${v.linked_formula_version_id}`}>Open Formula branch</Link> : <button className="button ghost" disabled={busy || !canFormulaHandoff(item, v)} onClick={() => act(() => developmentActions.branchFormula(item.id, v.id))}><GitBranch size={15} />Create Formula branch</button>}{v.linked_lab_batch_id ? <Link className="button ghost" to={`/lab/${v.linked_lab_batch_id}`}>Open Lab Batch</Link> : <button className="button primary" disabled={busy || !['approved', 'handed_off'].includes(item.status) || !(v.linked_formula_version_id || item.base_formula_version_id)} onClick={() => act(() => developmentActions.createLab(item.id, v.id, v.linked_formula_version_id || item.base_formula_version_id!, 100, 'g'))}><Play size={15} />Create 100 g Lab Batch</button>}</div></section>)}
    <section className="panel"><h2>Observation plan</h2>{item.observationPrompts.length ? item.observationPrompts.map(p => <p key={p.id}><strong>{p.category}</strong> · {p.prompt}</p>) : <p>No observation prompts yet.</p>}{item.status === 'completed' && <Link className="button primary" to={`/knowledge?tab=scent-memory&experimentId=${item.id}`}>Capture in Scent Memory</Link>}</section>
    <section className="panel"><h2>Provenance</h2>{item.source_intelligence_thread_id ? <Link to={`/knowledge/intelligence/${item.source_intelligence_thread_id}`}>Open source Intelligence thread</Link> : <p>Owner-created Development plan.</p>}<p>Revision {item.revision} · created {new Date(item.created_at).toLocaleString()}</p></section>
  </div>
}
