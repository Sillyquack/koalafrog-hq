import { createStarterWorkspace } from '../domain/beardStudio'
import { useBeardStudio } from '../data/beardStudioRepository'

export function BeardStudioEmptyState() {
  const { update } = useBeardStudio()
  return (
    <section className="panel empty-state">
      <span className="empty-icon">K<span>•</span>F</span>
      <h2>No beard profile yet</h2>
      <p>Create a blank profile from the Profile tab, or add the editable starter setup with Bobby’s example profile, Philips tool, length map and recipe.</p>
      <button className="button primary" onClick={() => update(() => createStarterWorkspace())}>Create editable starter setup</button>
    </section>
  )
}
