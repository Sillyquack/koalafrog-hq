import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Play, Plus, Wrench } from 'lucide-react'
import { BeardStudioEmptyState } from '../components/BeardStudioEmptyState'
import { useBeardStudio } from '../data/beardStudioRepository'
import { formatBeardStudioDate } from '../utils/beardStudioFormat'
import { BeardIntelligencePanel } from '../components/BeardIntelligencePanel'

export function BeardOverviewPage() {
  const { state } = useBeardStudio()
  const [renderedAt] = useState(() => Date.now())
  const profile = state.profiles.find(item => item.status === 'Active')
  if (!profile) return <BeardStudioEmptyState />
  const recipe = state.recipes.find(item => item.profileId === profile.id && item.status === 'Active')
  const logs = state.logs.filter(item => item.profileId === profile.id).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  const last = logs[0]
  const primaryTool = state.tools.find(tool => tool.primary && tool.status === 'active')
  const days = last ? Math.max(0, Math.floor((renderedAt - new Date(last.occurredAt).getTime()) / 86_400_000)) : null
  return (
    <div className="beard-overview">
      <section className="workshop-summary panel">
        <div><span className="eyebrow">Active profile</span><h2>{profile.name}</h2><p>{profile.styleName}</p></div>
        <dl>
          <div><dt>Active recipe</dt><dd>{recipe?.name ?? 'Not selected'}</dd></div>
          <div><dt>Last trim</dt><dd>{last ? formatBeardStudioDate(last.occurredAt) : 'No trim logged'}</dd></div>
          <div><dt>Days since</dt><dd>{days ?? '—'}</dd></div>
          <div><dt>Latest result</dt><dd>{last ? `${last.overallRating} / 5` : 'Not rated'}</dd></div>
          <div><dt>Primary trimmer</dt><dd>{primaryTool?.name ?? 'Not selected'}</dd></div>
        </dl>
      </section>
      <section className="quick-actions" aria-label="Quick actions">
        <Link className="button primary" to="/grooming/beard-studio/trim"><Play size={16}/>Start Trim</Link>
        <Link className="button secondary" to="/grooming/beard-studio/log"><Plus size={16}/>Log Trim</Link>
        <Link className="button secondary" to="/grooming/beard-studio/length-map"><Wrench size={16}/>Edit Length Map</Link>
      </section>
      <section className="panel">
        <h2>Recent Beard Log</h2>
        {logs.length ? <div className="beard-log-list">{logs.slice(0, 4).map(log => <Link key={log.id} to={`/grooming/beard-studio/log/${log.id}`}><strong>{formatBeardStudioDate(log.occurredAt)}</strong><span>{log.snapshot.recipe.name} · {log.overallRating}/5</span></Link>)}</div> : <p className="muted">No trims have been recorded for this profile.</p>}
      </section>
      <BeardIntelligencePanel state={state} />
    </div>
  )
}
