import { BeardStudioEmptyState } from '../components/BeardStudioEmptyState'
import { useBeardStudio } from '../data/beardStudioRepository'
import { beardZoneNames, validateToolLength, type BeardLengthZone } from '../domain/beardStudio'
import { beardStudioId, beardStudioNow } from '../utils/beardStudioFormat'

export function LengthMapPage() {
  const { state, update } = useBeardStudio()
  const profile = state.profiles.find(item => item.status === 'Active')
  const map = state.lengthMaps.find(item => item.profileId === profile?.id)
  if (!profile) return <BeardStudioEmptyState />
  const ensureMap = () => update(current => ({ ...current, lengthMaps: [...current.lengthMaps, {
    id: beardStudioId(), profileId: profile.id,
    zones: beardZoneNames.map((name, order) => ({ id: beardStudioId(), name, targetLengthMm: 0, minimumLengthMm: null, maximumLengthMm: null, trimDirection: 'with growth', toolId: null, attachmentId: null, notes: '', order: order + 1, enabled: true })),
    createdAt: beardStudioNow(), updatedAt: beardStudioNow(),
  }] }))
  if (!map) return <section className="panel empty-state"><h2>No Length Map</h2><p>Create the eleven-zone map for {profile.name}.</p><button className="button primary" onClick={ensureMap}>Create Length Map</button></section>
  const change = (zoneId: string, patch: Partial<BeardLengthZone>) => update(current => ({ ...current, lengthMaps: current.lengthMaps.map(item => item.id === map.id ? { ...item, zones: item.zones.map(zone => zone.id === zoneId ? { ...zone, ...patch } : zone), updatedAt: beardStudioNow() } : item) }))
  return (
    <div className="studio-stack">
      <section className="section-heading"><div><h2>Length Map</h2><p>Different zones can use deliberately different lengths. All measurements are millimetres.</p></div></section>
      <div className="length-summary" aria-label="Length hierarchy">{map.zones.filter(zone => zone.enabled).sort((a,b)=>a.targetLengthMm-b.targetLengthMm).map(zone=><span key={zone.id}><strong>{zone.targetLengthMm} mm</strong>{zone.name}</span>)}</div>
      <section className="zone-grid">{[...map.zones].sort((a,b)=>a.order-b.order).map(zone => {
        const tool = state.tools.find(item => item.id === zone.toolId)
        const warning = validateToolLength(tool, zone.targetLengthMm)
        return <article className={`panel zone-card ${!zone.enabled ? 'disabled' : ''}`} key={zone.id}>
          <header><span>{zone.order}</span><h3>{zone.name}</h3><label className="switch"><input type="checkbox" checked={zone.enabled} onChange={event => change(zone.id,{enabled:event.target.checked})}/><span>Enabled</span></label></header>
          <label>Target length<div className="input-unit"><input type="number" min="0" step=".1" value={zone.targetLengthMm} onChange={event=>change(zone.id,{targetLengthMm:Number(event.target.value)})}/><span>mm</span></div></label>
          <div className="split-fields"><label>Minimum<div className="input-unit"><input type="number" min="0" step=".1" value={zone.minimumLengthMm ?? ''} onChange={event=>change(zone.id,{minimumLengthMm:event.target.value===''?null:Number(event.target.value)})}/><span>mm</span></div></label><label>Maximum<div className="input-unit"><input type="number" min="0" step=".1" value={zone.maximumLengthMm ?? ''} onChange={event=>change(zone.id,{maximumLengthMm:event.target.value===''?null:Number(event.target.value)})}/><span>mm</span></div></label></div>
          <label>Trim direction<select value={zone.trimDirection} onChange={event=>change(zone.id,{trimDirection:event.target.value as BeardLengthZone['trimDirection']})}>{['with growth','against growth','across growth','detail only'].map(value=><option key={value}>{value}</option>)}</select></label>
          <label>Tool<select value={zone.toolId ?? ''} onChange={event=>change(zone.id,{toolId:event.target.value||null,attachmentId:null})}><option value="">No tool selected</option>{state.tools.filter(item=>item.status==='active').map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>Attachment<select value={zone.attachmentId ?? ''} onChange={event=>change(zone.id,{attachmentId:event.target.value||null})}><option value="">No attachment</option>{tool?.attachments.map(attachment=><option value={attachment.id} key={attachment.id}>{attachment.name}</option>)}</select></label>
          {warning&&<p className="range-warning" role="alert">{warning}</p>}
          <label>Notes<textarea value={zone.notes} onChange={event=>change(zone.id,{notes:event.target.value})}/></label>
        </article>
      })}</section>
    </div>
  )
}
