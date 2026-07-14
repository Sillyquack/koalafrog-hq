import { useState } from 'react'
import { ArrowLeft, Check, Copy, LockKeyhole, Save, ShieldCheck } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../../components/ui/PageHeader'
import { StatusPill } from '../../components/ui/StatusPill'
import { SectionHeader } from '../../components/ui/SectionHeader'
import type { FormulaVersionStatus } from '../../types/domain'
import { formatDate } from '../../utils/format'
import { BatchScaler } from './components/BatchScaler'
import { FormulaBuilder } from './components/FormulaBuilder'
import { calculatePercentageTotal } from './domain/formulaLogic'
import { useFormulaData } from './state/FormulaDataContext'

export function FormulaDetailPage() {
  const { formulaId } = useParams(); const [params, setParams] = useSearchParams()
  const { formulas, formulaVersions, formulaLines, products, labBatches, productionRuns, saveVersion, transitionVersion, duplicateAsDraft } = useFormulaData()
  const formula = formulas.find((item) => item.id === formulaId); const versions = formulaVersions.filter((item) => item.formulaId === formulaId).sort((a,b) => b.createdAt.localeCompare(a.createdAt))
  const selected = versions.find((item) => item.id === params.get('version')) ?? versions[0]; const lines = formulaLines.filter((line) => line.formulaVersionId === selected?.id)
  const versionBatches = labBatches.filter((batch) => batch.formulaVersionId === selected?.id)
  const versionRuns=productionRuns.filter(run=>run.formulaVersionId===selected?.id)
  const [description, setDescription] = useState(selected?.description ?? ''); const [characteristics, setCharacteristics] = useState(selected?.targetCharacteristics ?? '')
  if (!formula || !selected) return <div className="empty-state"><h1>Formula not found</h1><Link to="/formulas">Return to formulas</Link></div>
  const product = products.find((item) => item.id === formula.productId); const valid = calculatePercentageTotal(lines) === 100
  const selectVersion = (id: string) => { const next = versions.find((v) => v.id === id)!; setParams({ version: id }); setDescription(next.description); setCharacteristics(next.targetCharacteristics) }
  const duplicate = () => { const created = duplicateAsDraft(selected.id); if (created) { setParams({ version: created.id }); setDescription(created.description); setCharacteristics(created.targetCharacteristics) } }
  const transition = (status: FormulaVersionStatus) => { if (status === 'Candidate' && !valid) return; transitionVersion(selected.id, status) }
  return <>
    <Link className="back-link" to="/formulas"><ArrowLeft size={14} />Formula library</Link>
    <PageHeader eyebrow={`${product?.name} / Formula workspace`} title={formula.name} description={formula.description} />
    <div className="formula-workspace"><aside className="version-rail panel"><div><span className="eyebrow">Version history</span><strong>{versions.length} recorded</strong></div>{versions.map((version) => <button className={version.id === selected.id ? 'active' : ''} key={version.id} onClick={() => selectVersion(version.id)}><span>{version.version}</span><StatusPill tone={version.status === 'Draft' ? 'amber' : version.status === 'Approved' ? 'green' : version.status === 'Retired' ? 'neutral' : 'blue'}>{version.status}</StatusPill><small>{formatDate(version.updatedAt.slice(0,10))}</small></button>)}</aside>
      <div className="formula-main"><section className="version-banner"><div><span className="eyebrow">Active version</span><h2>{selected.version}</h2></div><StatusPill tone={selected.status === 'Draft' ? 'amber' : selected.status === 'Approved' ? 'green' : selected.status === 'Retired' ? 'neutral' : 'blue'}>{selected.status === 'Draft' ? <Save size={12} /> : <LockKeyhole size={12} />}{selected.status}</StatusPill><p>{selected.status === 'Draft' ? 'Editable working version' : 'Frozen for traceability'}</p><div className="version-actions">{selected.status === 'Draft' ? <><button className="button ghost" onClick={() => saveVersion(selected.id, { description, targetCharacteristics: characteristics })}><Save size={15} />Save changes</button><button className="button primary" disabled={!valid} title={!valid ? 'Formula must total exactly 100%' : ''} onClick={() => transition('Candidate')}><ShieldCheck size={15} />Promote to Candidate</button></> : <><button className="button ghost" onClick={duplicate}><Copy size={15} />Duplicate as New Draft</button>{selected.status === 'Candidate' && <button className="button primary" onClick={() => transition('Approved')}><Check size={15} />Approve</button>}{selected.status !== 'Retired' && <button className="button ghost" onClick={() => transition('Retired')}>Retire</button>}</>}</div></section>
        <section className="formula-notes panel"><label>Version description<textarea disabled={selected.status !== 'Draft'} value={description} onChange={(e) => setDescription(e.target.value)} /></label><label>Target characteristics<textarea disabled={selected.status !== 'Draft'} value={characteristics} onChange={(e) => setCharacteristics(e.target.value)} /></label></section>
        <FormulaBuilder version={selected} lines={lines} /><BatchScaler lines={lines} />
        <section className="panel linked-testing"><SectionHeader title="Lab history" detail="Batches created from this exact version" />{versionBatches.map((batch)=><Link to={`/lab/${batch.id}`} key={batch.id}><strong>{batch.batchNumber}</strong><span>{batch.status} · {batch.purpose}</span></Link>)}{!versionBatches.length&&<p className="empty-copy">No Lab Batches reference this version.</p>}</section>
        <section className="panel linked-testing"><SectionHeader title="Production history" detail="Controlled runs sourced from this exact immutable version" action={<Link className="text-button" to="/costing">Cost planning</Link>}/>{versionRuns.map(run=><Link to={`/production/${run.id}`} key={run.id}><strong>{run.productionRunNumber}</strong><span>{run.status} · {run.purpose}</span></Link>)}{!versionRuns.length&&<p className="empty-copy">No Production Runs reference this version.</p>}</section>
        <p className="development-disclaimer">Development mock formulation data only. No safety, performance, regulatory, or commercial approval is implied.</p>
      </div>
    </div>
  </>
}
