import { useState, type FormEvent } from 'react'
import { Archive, Plus, Save } from 'lucide-react'
import { BeardStudioEmptyState } from '../components/BeardStudioEmptyState'
import{BeardStudioEditorGuard}from'../components/BeardStudioEditorGuard'
import { useBeardStudio } from '../data/beardStudioRepository'
import { activateProfile, validateProfile, type BeardProfile } from '../domain/beardStudio'
import { beardStudioId, beardStudioNow } from '../utils/beardStudioFormat'

const blankProfile = (): BeardProfile => ({ id: beardStudioId(), name: '', status: 'Draft', styleName: '', description: '', targetLook: '', maintenanceFrequencyDays: 7, preferredOverallLengthMm: 8, density: 'medium', texture: 'straight', growthNotes: '', asymmetryNotes: '', weakAreaNotes: '', moustachePreference: '', cheekLinePreference: 'natural', necklinePreference: 'natural', createdAt: beardStudioNow(), updatedAt: beardStudioNow() })

export function BeardProfilePage() {
  const { state, update } = useBeardStudio()
  const [editing, setEditing] = useState<BeardProfile | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const save = async(event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editing) return
    const issues = validateProfile(editing)
    if (issues.length) return setErrors(issues)
    try{await update(current => ({ ...current, profiles: current.profiles.some(item => item.id === editing.id) ? current.profiles.map(item => item.id === editing.id ? { ...editing, updatedAt: beardStudioNow() } : item) : [...current.profiles, editing] }));setEditing(null);setErrors([])}catch{/* shared action error remains visible; keep the draft open */}
  }
  const archive = (profile: BeardProfile) => {
    if (!window.confirm(`Archive ${profile.name}? Existing Beard Log history will be preserved.`)) return
    void update(current => ({ ...current, profiles: current.profiles.map(item => item.id === profile.id ? { ...item, status: 'Archived', updatedAt: beardStudioNow() } : item) }))
  }
  return (
    <div className="studio-stack">
      <BeardStudioEditorGuard dirty={Boolean(editing)} onDiscard={()=>setEditing(null)}/>
      <section className="section-heading"><div><h2>Beard Profiles</h2><p>One profile can be Active at a time.</p></div><button className="button primary" onClick={() => setEditing(blankProfile())}><Plus size={16}/>New Profile</button></section>
      {editing && <form className="panel studio-form" onSubmit={save}>
        <h3>{state.profiles.some(item => item.id === editing.id) ? 'Edit profile' : 'Create profile'}</h3>
        {errors.length > 0 && <div className="form-error" role="alert">{errors.map(error => <p key={error}>{error}</p>)}</div>}
        <div className="form-grid">
          <label>Profile name<input value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })}/></label>
          <label>Style name<input value={editing.styleName} onChange={event => setEditing({ ...editing, styleName: event.target.value })}/></label>
          <label className="wide">Target look<textarea value={editing.targetLook} onChange={event => setEditing({ ...editing, targetLook: event.target.value })}/></label>
          <label>Maintenance frequency<input type="number" min="1" value={editing.maintenanceFrequencyDays} onChange={event => setEditing({ ...editing, maintenanceFrequencyDays: Number(event.target.value) })}/><span className="unit-suffix">days</span></label>
          <label>Preferred overall length<input type="number" min="0" step=".1" value={editing.preferredOverallLengthMm} onChange={event => setEditing({ ...editing, preferredOverallLengthMm: Number(event.target.value) })}/><span className="unit-suffix">mm</span></label>
          <label>Density<select value={editing.density} onChange={event => setEditing({ ...editing, density: event.target.value as BeardProfile['density'] })}>{['light','medium','dense','mixed'].map(value=><option key={value}>{value}</option>)}</select></label>
          <label>Hair texture<select value={editing.texture} onChange={event => setEditing({ ...editing, texture: event.target.value as BeardProfile['texture'] })}>{['straight','wavy','curly','coarse','mixed'].map(value=><option key={value}>{value}</option>)}</select></label>
          <label>Cheek line<select value={editing.cheekLinePreference} onChange={event => setEditing({ ...editing, cheekLinePreference: event.target.value as BeardProfile['cheekLinePreference'] })}>{['natural','lightly defined','sharply defined'].map(value=><option key={value}>{value}</option>)}</select></label>
          <label>Neckline<select value={editing.necklinePreference} onChange={event => setEditing({ ...editing, necklinePreference: event.target.value as BeardProfile['necklinePreference'] })}>{['natural','defined'].map(value=><option key={value}>{value}</option>)}</select></label>
          <label>Moustache preference<input value={editing.moustachePreference} onChange={event => setEditing({ ...editing, moustachePreference: event.target.value })}/></label>
          {([['growthNotes','Growth notes'],['asymmetryNotes','Asymmetry notes'],['weakAreaNotes','Weak-area notes']] as const).map(([key,label])=><label className="wide" key={key}>{label}<textarea value={editing[key]} onChange={event=>setEditing({...editing,[key]:event.target.value})}/></label>)}
        </div>
        <div className="form-actions"><button type="button" className="button ghost" onClick={() => setEditing(null)}>Cancel</button><button className="button primary"><Save size={15}/>Save profile</button></div>
      </form>}
      <div className="record-grid">{state.profiles.map(profile => <article className="panel record-card" key={profile.id}><span className={`status-badge ${profile.status.toLowerCase()}`}>{profile.status}</span><h3>{profile.name}</h3><p>{profile.styleName}</p><small>{profile.maintenanceFrequencyDays}-day maintenance · {profile.preferredOverallLengthMm} mm preferred</small><div className="card-actions"><button className="button small" onClick={() => setEditing(structuredClone(profile))}>Edit</button>{profile.status !== 'Active' && profile.status !== 'Archived' && <button className="button small primary" onClick={() => update(current => activateProfile(current, profile.id))}>Activate</button>}{profile.status !== 'Archived' && <button className="button small danger" onClick={() => archive(profile)}><Archive size={14}/>Archive</button>}</div></article>)}</div>
      {!state.profiles.length && <BeardStudioEmptyState />}
    </div>
  )
}
