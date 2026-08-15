import {useMemo,useState} from 'react'
import {ArrowLeft,ExternalLink,FlaskConical,PackageSearch,ShieldAlert} from 'lucide-react'
import {Link,useSearchParams} from 'react-router-dom'
import type{ProductStudioConcept}from'../../types/domain'
import{useFormulaData}from'../formulas/state/FormulaDataContext'
import{procurementActions}from'../procurement/actions/procurementActions'
import{useProcurement}from'../procurement/useProcurement'
import{
  FOOT_CARE_REGISTRY_VERSION,
  footCareBenchmarks,
  footCareProjectTemplates,
  type FootCareBenchmarkKind,
  type FootCareFormulationSystem,
}from'./domain/footCareBenchmarks'
import{buildFootCareProcurementGroups}from'./domain/footCareProcurement'
import{createFootCareConceptInput,footCareConceptAnalysis}from'./domain/footCareProjects'
import{formulationArchetypes}from'./domain/formulationEngine'

const evidenceLabels={
  verified_current_local_source:'Verified current local source',
  verified_current_brand_source:'Verified current brand source',
  source_conflict_requires_pack_label:'Source conflict · pack label required',
}as const

function benchmarkDisplayName(benchmark:(typeof footCareBenchmarks)[number]){
  const productName=benchmark.productName.toLowerCase().startsWith(benchmark.brand.toLowerCase())
    ?benchmark.productName
    :`${benchmark.brand} ${benchmark.productName}`
  return`${productName} ${benchmark.packSize}`
}

function persistableConcept(concept:ProductStudioConcept){
  const{createdAt,updatedAt,...input}=concept
  void createdAt
  void updatedAt
  return input
}

function capabilityState(system:FootCareFormulationSystem){
  if(system==='aerosol')return{label:'Unsupported architecture',description:'No aerosol formulation, filling, packaging or production workflow is registered.'}
  const archetype=formulationArchetypes[system]
  return{label:archetype.maturity==='planned'?'Planned · not operational':archetype.maturity,description:[...archetype.knownLimitations,...archetype.warnings].join(' ')}
}

function ProjectWorkspace({concept,onSaved}:{concept:ProductStudioConcept;onSaved:(concept:ProductStudioConcept)=>void}){
  const data=useFormulaData(),[notes,setNotes]=useState(concept.notes),[message,setMessage]=useState(''),[busy,setBusy]=useState(false)
  const analysis=footCareConceptAnalysis(concept),project=footCareProjectTemplates.find(candidate=>candidate.kind===analysis?.projectKind)
  if(!analysis||!project)return <section className="panel" role="alert"><h2>Foot Care project unavailable</h2><p>The saved concept does not contain a supported Foot Care project identity.</p></section>
  const save=async()=>{setBusy(true);setMessage('');try{const saved=await data.saveProductStudioConcept({...persistableConcept(concept),notes});onSaved(saved);setMessage('Project notes saved through the workspace repository.')}catch(cause){setMessage(cause instanceof Error?cause.message:'The project could not be saved.')}finally{setBusy(false)}}
  return <section className="panel foot-care-project-workspace" aria-labelledby="active-foot-care-project">
    <div><span className="eyebrow">Persisted Foot Care project</span><h2 id="active-foot-care-project">{concept.name}</h2><p>{project.developmentIntent}</p><small>Registry {analysis.registryVersion} · saved {concept.updatedAt.slice(0,10)}</small></div>
    <label>Development notes<textarea rows={5} value={notes} onChange={event=>setNotes(event.target.value)} placeholder="Record open questions, pack-label checks and architecture decisions. Notes never become Formula ingredients."/></label>
    <div className="foot-care-project-actions"><button className="button primary" disabled={busy||notes===concept.notes} onClick={()=>void save()}>{busy?'Saving…':'Save project notes'}</button>{message&&<p role="status" className="form-message">{message}</p>}</div>
  </section>
}

export function FootCareStudioPage(){
  const formulaData=useFormulaData(),procurement=useProcurement(),[searchParams,setSearchParams]=useSearchParams(),[busy,setBusy]=useState(''),[message,setMessage]=useState(''),[handoffRequestIds,setHandoffRequestIds]=useState<string[]>([])
  const concepts=useMemo(()=>formulaData.productStudioConcepts.filter(concept=>concept.productType==='foot_care'),[formulaData.productStudioConcepts])
  const activeId=searchParams.get('concept'),activeConcept=concepts.find(concept=>concept.id===activeId)
  const byKind=(kind:FootCareBenchmarkKind)=>concepts.find(concept=>footCareConceptAnalysis(concept)?.projectKind===kind)
  const openProject=(id:string)=>setSearchParams({concept:id})
  const createProject=async(kind:FootCareBenchmarkKind)=>{
    const existing=byKind(kind)
    if(existing){openProject(existing.id);return}
    setBusy(kind);setMessage('')
    try{
      const saved=await formulaData.saveProductStudioConcept(createFootCareConceptInput(kind))
      openProject(saved.id)
      setMessage(`${saved.name} created through FormulaDataContext.`)
    }catch(cause){setMessage(cause instanceof Error?cause.message:'The Foot Care project could not be created.')}finally{setBusy('')}
  }
  const handoff=async()=>{
    const analysis=footCareConceptAnalysis(activeConcept)
    if(!activeConcept||!analysis)return
    if(!procurement.workspace||!procurement.data){setMessage(procurement.error||'An authenticated active Supabase workspace is required for Procurement handoff.');return}
    setBusy('handoff');setMessage('');setHandoffRequestIds([])
    try{
      const groups=buildFootCareProcurementGroups(analysis.projectKind)
      const receipt=await procurementActions.createFootCareProcurementHandoff(procurement.workspace.workspaceId,activeConcept.id,FOOT_CARE_REGISTRY_VERSION,groups)
      await procurement.refresh()
      setHandoffRequestIds(receipt.groups.map(group=>group.requestId))
      const created=receipt.groups.filter(group=>group.operation==='created').length,reused=receipt.groups.length-created
      setMessage(`Procurement handoff confirmed: ${created} request group(s) created and ${reused} safely reused. Research was not started.`)
    }catch(cause){setMessage(cause instanceof Error?cause.message:'Procurement handoff failed safely.')}finally{setBusy('')}
  }
  const relatedRequests=activeConcept&&procurement.data?procurement.data.requests.filter(request=>request.source_type==='product_studio_concept'&&request.source_id===activeConcept.id):[]
  const systems=[...new Set(footCareProjectTemplates.flatMap(project=>project.formulationSystems))]
  return <div className="foot-care-studio">
    <Link className="back-link" to="/product-studio"><ArrowLeft size={14}/>Product Studio</Link>
    <header className="studio-hero foot-care-hero"><span className="eyebrow">Product Studio / Foot Care research</span><h1>Foot Care Product Studio</h1><p>Use owned GEHWOL benchmarks as evidence, translate functions into deliberate sourcing targets, and keep unsupported formulation systems visibly outside operational Formula and Lab workflows.</p><small>Registry {FOOT_CARE_REGISTRY_VERSION}</small></header>

    <section className="studio-section" aria-labelledby="foot-care-projects-title">
      <div className="studio-section-heading"><div><span className="eyebrow">Three persistent starting points</span><h2 id="foot-care-projects-title">Development projects</h2></div></div>
      <div className="foot-care-project-grid">{footCareProjectTemplates.map(project=>{const saved=byKind(project.kind);return <article className={saved?.id===activeConcept?.id?'panel active':'panel'} key={project.kind}><FlaskConical/><span className="eyebrow">{saved?'Repository-backed project':'Project template'}</span><h3>{project.name}</h3><p>{project.developmentIntent}</p><div className="foot-care-system-list">{project.formulationSystems.map(system=><span key={system}>{system.replaceAll('_',' ')} · {capabilityState(system).label}</span>)}</div><p className="studio-warning"><ShieldAlert size={15}/>{project.systemWarning}</p><button className="button" disabled={busy===project.kind} onClick={()=>void createProject(project.kind)}>{busy===project.kind?'Saving…':saved?'Continue project':'Create project'}</button></article>})}</div>
    </section>
    {message&&<p className="form-message" role="status">{message}</p>}
    {activeConcept&&<ProjectWorkspace key={activeConcept.id} concept={activeConcept} onSaved={saved=>{setMessage(`${saved.name} is up to date.`)}}/>}

    <section className="studio-section" aria-labelledby="foot-care-capability-title"><div className="studio-section-heading"><div><span className="eyebrow">Formulation truthfulness</span><h2 id="foot-care-capability-title">Research does not equal operational formulation</h2></div></div><div className="foot-care-capability-grid">{systems.map(system=>{const state=capabilityState(system);return <article className="panel" key={system}><strong>{system.replaceAll('_',' ')}</strong><span className="studio-state review">{state.label}</span><p>{state.description}</p></article>})}</div><p className="studio-warning"><ShieldAlert size={16}/>No Foot Care project on this page can create a Formula or prepare a Lab Batch while its formulation architecture remains planned or unsupported.</p></section>

    <section className="studio-section" aria-labelledby="foot-care-benchmarks-title"><div className="studio-section-heading"><div><span className="eyebrow">Owned benchmark evidence</span><h2 id="foot-care-benchmarks-title">GEHWOL benchmark registry</h2></div></div><div className="foot-care-benchmark-grid">{footCareBenchmarks.map(benchmark=><article className="panel foot-care-benchmark" key={benchmark.id}><header><div><span className={`evidence-state ${benchmark.evidenceState}`}>{evidenceLabels[benchmark.evidenceState]}</span><h3>{benchmarkDisplayName(benchmark)}</h3><p>{benchmark.role}</p></div><a href={benchmark.sourceUrl} target="_blank" rel="noreferrer">Primary source <ExternalLink size={13}/></a>{benchmark.alternateSourceUrl&&<a href={benchmark.alternateSourceUrl} target="_blank" rel="noreferrer">Conflicting source <ExternalLink size={13}/></a>}</header><p className="benchmark-source-note">{benchmark.sourceNote}</p><details><summary>INCI → function map ({benchmark.ingredients.length})</summary><div className="foot-care-inci-table-wrap"><table><thead><tr><th>INCI</th><th>Function evidence</th><th>Sourcing state</th></tr></thead><tbody>{benchmark.ingredients.map((ingredient,index)=><tr key={`${ingredient.inci}-${index}`}><th>{ingredient.inci}{ingredient.notes&&<small>{ingredient.notes}</small>}</th><td>{ingredient.functions.join(' · ')}</td><td>{ingredient.sourcingPriority.replaceAll('_',' ')}</td></tr>)}</tbody></table></div></details><div className="foot-care-learning-grid"><div><h4>Development learning</h4><ul>{benchmark.developmentLearnings.map(learning=><li key={learning}>{learning}</li>)}</ul></div><div><h4>Claim guardrails</h4><ul>{benchmark.claimGuardrails.map(guardrail=><li key={guardrail}>{guardrail}</li>)}</ul></div></div></article>)}</div></section>

    <section className="panel foot-care-procurement" aria-labelledby="foot-care-procurement-title"><div><span className="eyebrow">Benchmark → function → sourcing target → review inbox</span><h2 id="foot-care-procurement-title">Procurement handoff</h2><p>{activeConcept?'Create or safely reuse requested-item groups for this saved project. Each group is capped at 10 items for the live-research contract.':'Create or continue one of the three projects before handing requirements to Procurement.'}</p><p>Mystic Moments is recorded only as a preferred-supplier hint where the registry marks it relevant. Octenidine HCl and aerosol propellants remain excluded pending explicit Compliance and architecture review.</p></div><button className="button primary" disabled={!activeConcept||busy==='handoff'||!procurement.workspace||!procurement.data} onClick={()=>void handoff()}><PackageSearch size={15}/>{busy==='handoff'?'Preparing…':'Prepare Procurement requests'}</button>{procurement.error&&<p className="studio-warning" role="note">{procurement.error}</p>}{[...new Set([...relatedRequests.map(request=>request.id),...handoffRequestIds])].map(requestId=><Link className="button ghost" key={requestId} to={`/procurement/${requestId}`}>Open request · consent and review remain separate</Link>)}</section>
  </div>
}
