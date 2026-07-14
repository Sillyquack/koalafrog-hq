import { ArrowRight, Blend, Droplets, Plus, Sparkles } from 'lucide-react'
import { accords, scentMaterials, scentProfiles } from '../../data/mockData'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { SectionHeader } from '../../components/ui/SectionHeader'

export function ScentHousePage() {
  const signature = scentProfiles[0]
  return <div className="scent-page">
    <header className="scent-header"><div><span className="eyebrow light">Olfactive workshop / Private studies</span><h1>Scent House</h1><p>Where Koalafrog’s atmosphere becomes material—built through studies, accords and careful memory.</p></div><button className="button scent-button"><Plus size={16} />New experiment</button></header>
    <section className="signature-card"><div className="signature-orbit"><span>KF</span></div><div className="signature-copy"><span className="eyebrow">Signature scent DNA / Study 06</span><h2>{signature.name}</h2><blockquote>“{signature.direction}.”</blockquote><div className="note-cloud">{signature.notes.map((note) => <span key={note}>{note}</span>)}</div><div className="maturity"><span><b>Definition</b><small>{signature.maturity}% resolved</small></span><ProgressBar value={signature.maturity} /></div></div><div className="signature-aside"><small>Current question</small><strong>Can the mineral opening feel colder without making the woods distant?</strong><button className="text-button">Open study <ArrowRight size={15} /></button></div></section>
    <div className="scent-grid"><section className="scent-panel profiles"><SectionHeader title="Scent profiles" detail="Active olfactive territories" />{scentProfiles.slice(1).map((profile, index) => <article key={profile.id}><span className={`scent-swatch swatch-${index + 1}`} /><div><small>{profile.direction}</small><h3>{profile.name}</h3><div>{profile.notes.map((note) => <span key={note}>{note}</span>)}</div><ProgressBar value={profile.maturity} /></div><b>{profile.maturity}%</b></article>)}</section>
      <section className="scent-panel"><SectionHeader title="Accord bench" detail="Structures being tuned" action={<Blend size={19} />} /><div className="accord-list">{accords.map((accord, index) => <article key={accord.id}><span>0{index + 1}</span><div><h3>{accord.name}</h3><p>{accord.materials.join(' · ')}</p></div><small>{accord.status}</small></article>)}</div><button className="scent-link">View all experiments <ArrowRight size={15} /></button></section>
      <section className="scent-panel materials"><SectionHeader title="Material organ" detail="Selected character references" action={<Droplets size={19} />} /><div>{scentMaterials.map((material) => <article key={material.id}><span><Sparkles size={14} /></span><div><h3>{material.name}</h3><p>{material.character}</p></div><small>{material.family}</small></article>)}</div></section>
    </div>
    <p className="scent-footnote">All scent entries are original development concepts and observation notes—not commercial fragrance formulas.</p>
  </div>
}
