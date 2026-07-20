import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { GroomingProductSelector } from '../components/GroomingProductSelector'
import { useBeardStudio } from '../data/beardStudioRepository'
import {
  createLogFromSession,
  validateRating,
  type GroomingProductReference,
} from '../domain/beardStudio'
import { formatBeardStudioDate } from '../utils/beardStudioFormat'

export function BeardLogPage() {
  const { state, update } = useBeardStudio()
  const { logId } = useParams()
  const [ratings, setRatings] = useState({
    overallRating: 3,
    fadeRating: 3 as number | null,
    lineSharpnessRating: 3 as number | null,
    symmetryRating: 3 as number | null,
    comfortRating: 3 as number | null,
  })
  const [notes, setNotes] = useState('')
  const [productsUsed, setProductsUsed] = useState<GroomingProductReference[]>([])
  const [error, setError] = useState('')
  const completed = [...state.sessions].reverse().find(
    (session) => session.status === 'completed' && !state.logs.some((log) => log.sessionId === session.id),
  )
  const selected = logId ? state.logs.find((log) => log.id === logId) : null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!completed) return
    const issue = validateRating(ratings.overallRating, true)
    if (issue) return setError(issue)
    void update((current) =>
      createLogFromSession(
        current,
        completed.id,
        ratings,
        notes,
        productsUsed.length ? productsUsed : undefined,
      ),
    )
    setError('')
  }

  if (selected) {
    return (
      <div className="studio-stack">
        <Link className="back-link" to="/grooming/beard-studio/log"><ChevronLeft />Beard Log</Link>
        <section className="panel log-detail">
          <span className="eyebrow">Immutable trim snapshot · schema v{selected.snapshot.schemaVersion}</span>
          <h2>{formatBeardStudioDate(selected.occurredAt)} · {selected.overallRating}/5</h2>
          <p>{selected.notes || 'No result notes recorded.'}</p>
          <dl>
            <dt>Profile</dt><dd>{selected.snapshot.profile.name}</dd>
            <dt>Recipe</dt><dd>{selected.snapshot.recipe.name} v{selected.snapshot.recipe.version}</dd>
            <dt>Length map</dt><dd>{selected.snapshot.lengthMap?.zones.filter((zone) => zone.enabled).map((zone) => `${zone.name} ${zone.targetLengthMm} mm`).join(' · ') || 'Not captured'}</dd>
            <dt>Tools</dt><dd>{selected.snapshot.tools.map((tool) => `${tool.name} (${tool.attachments.map((attachment) => attachment.name).join(', ')})`).join(' · ') || 'No tool captured'}</dd>
            <dt>Products used</dt><dd>{selected.snapshot.products.map((product) => `${product.nameSnapshot} (${product.role})`).join(' · ') || 'No products captured'}</dd>
          </dl>
          <h3>Procedure used</h3>
          <ol>{selected.snapshot.recipe.steps.map((step) => <li key={step.id}><strong>{step.title}</strong> — {step.instruction}</li>)}</ol>
        </section>
      </div>
    )
  }

  return (
    <div className="studio-stack">
      <section className="section-heading"><div><h2>Beard Log</h2><p>Newest first. Each entry preserves what was actually planned and used.</p></div></section>
      {completed && (
        <form className="panel rating-form" onSubmit={submit}>
          <h3>Record completed trim</h3>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="rating-grid">
            {([
              ['overallRating', 'Overall result'],
              ['fadeRating', 'Fade'],
              ['lineSharpnessRating', 'Line sharpness'],
              ['symmetryRating', 'Symmetry'],
              ['comfortRating', 'Comfort / irritation'],
            ] as const).map(([key, label]) => (
              <label key={key}>{label}<select value={ratings[key] ?? ''} onChange={(event) => setRatings({ ...ratings, [key]: event.target.value === '' ? null : Number(event.target.value) })}>
                {key !== 'overallRating' && <option value="">Not rated</option>}
                {[1, 2, 3, 4, 5].map((rating) => <option value={rating} key={rating}>{rating} / 5</option>)}
              </select></label>
            ))}
          </div>
          <GroomingProductSelector legend="Products used in this trim" value={productsUsed} onChange={setProductsUsed} />
          <label>Result notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What worked, irritation, symmetry, and what to change next time…" /></label>
          <button className="button primary">Save immutable Beard Log snapshot</button>
        </form>
      )}
      <div className="beard-log-list panel">
        {state.logs.length ? [...state.logs].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).map((log) => (
          <Link key={log.id} to={`/grooming/beard-studio/log/${log.id}`}>
            <strong>{formatBeardStudioDate(log.occurredAt)}</strong>
            <span>{log.snapshot.recipe.name} v{log.recipeVersion} · {log.overallRating}/5</span>
            <ChevronRight />
          </Link>
        )) : <div className="empty-state"><h3>No trims logged</h3><p>Complete Trim Mode to create a traceable result entry.</p></div>}
      </div>
    </div>
  )
}
