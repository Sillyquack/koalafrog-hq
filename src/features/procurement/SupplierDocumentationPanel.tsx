import { useState } from 'react'
import { Archive, ExternalLink, FileCheck2, Plus } from 'lucide-react'
import { procurementActions } from './actions/procurementActions'
import type { ProcurementData, SupplierDocumentRecord } from './domain/procurement'
import { capabilityLabels, documentLabel, supplierDocumentationSummary, supplierDocumentTypes, validateSupplierDocument, verificationLabels } from './domain/supplierDocumentation'

const text=(form:FormData,key:string)=>String(form.get(key)??'').trim()
const nullable=(form:FormData,key:string)=>text(form,key)||null

export function SupplierDocumentationPanel({workspaceId,data,supplierId,refresh}:{workspaceId:string;data:ProcurementData;supplierId:string;refresh:()=>Promise<void>|void}){
  const records=data.supplierDocuments.filter(record=>record.supplier_id===supplierId&&!record.archived_at)
  const[editing,setEditing]=useState<SupplierDocumentRecord|null|undefined>(undefined)
  const[error,setError]=useState('')
  const[saving,setSaving]=useState(false)
  const summary=supplierDocumentationSummary(records)
  const save=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault()
    const form=new FormData(event.currentTarget)
    const values={
      supplier_id:supplierId,
      document_type:text(form,'type'),
      document_subtype:nullable(form,'subtype'),
      capability_state:text(form,'capability'),
      verification_state:text(form,'verification'),
      evidence_url:nullable(form,'url'),
      document_title:nullable(form,'title'),
      issuer:nullable(form,'issuer'),
      issue_date:nullable(form,'issueDate'),
      expiry_date:nullable(form,'expiryDate'),
      checked_date:nullable(form,'checkedDate'),
      source_reference:nullable(form,'source'),
      notes:text(form,'notes'),
      scope_type:'supplier_wide',
    }
    const validation=validateSupplierDocument(values as SupplierDocumentRecord)
    if(validation)return setError(validation)
    setSaving(true);setError('')
    try{
      if(editing)await procurementActions.update('supplier_document_records',editing.id,editing.revision,values)
      else await procurementActions.createSupplierDocument(workspaceId,values)
      await refresh();setEditing(undefined)
    }catch(cause){setError(cause instanceof Error?cause.message:'Could not save supplier document record.')}
    finally{setSaving(false)}
  }
  const archive=async(record:SupplierDocumentRecord)=>{
    setSaving(true);setError('')
    try{await procurementActions.update('supplier_document_records',record.id,record.revision,{archived_at:new Date().toISOString()});await refresh()}
    catch(cause){setError(cause instanceof Error?cause.message:'Could not archive supplier document record.')}
    finally{setSaving(false)}
  }
  return <section className="panel supplier-documentation" aria-labelledby="supplier-documentation-title">
    <header className="supplier-documentation-header"><div><span className="eyebrow">Explicit supplier evidence</span><h2 id="supplier-documentation-title">Documentation</h2><p>Availability and verification are recorded separately. Nothing is inferred from notes, links, offers, or internal lot tracking.</p></div>{editing===undefined&&<button className="button ghost" onClick={()=>setEditing(null)}><Plus size={14}/>Add document record</button>}</header>
    <div className="supplier-document-summary" aria-label="Documentation readiness summary">
      <span><strong>{summary.verified}</strong> verified</span><span><strong>{summary.availableOnRequest}</strong> available on request</span><span><strong>{summary.unknown}</strong> unknown</span><span><strong>{summary.expired}</strong> expired</span>
    </div>
    {error&&editing===undefined&&<p className="form-error" role="alert">{error}</p>}
    {editing!==undefined?<DocumentForm record={editing} saving={saving} error={error} onCancel={()=>{setEditing(undefined);setError('')}} onSubmit={save}/>:records.length?<div className="supplier-document-cards">{records.map(record=><article key={record.id}>
      <header><div><span className="eyebrow">{record.scope_type.replace('_',' ')}</span><h3>{documentLabel(record)}</h3></div><span className="document-capability">{capabilityLabels[record.capability_state]}</span></header>
      <dl><div><dt>Verification</dt><dd>{verificationLabels[record.verification_state]}</dd></div><div><dt>Checked</dt><dd>{record.checked_date||'Unknown'}</dd></div><div><dt>Issuer</dt><dd>{record.issuer||'Unknown'}</dd></div><div><dt>Evidence</dt><dd>{record.evidence_url?<a href={record.evidence_url} target="_blank" rel="noreferrer">Open evidence <ExternalLink size={12}/></a>:'No current evidence link'}</dd></div></dl>
      {record.document_title&&<p><strong>{record.document_title}</strong></p>}<p>{record.notes||'No notes recorded.'}</p>
      <footer><button className="text-button" onClick={()=>setEditing(record)}>Edit</button><button className="text-button danger" disabled={saving} onClick={()=>void archive(record)}><Archive size={12}/>Archive</button></footer>
    </article>)}</div>:<div className="supplier-document-empty"><FileCheck2 aria-hidden="true"/><h3>No structured document records</h3><p>Missing records remain unknown. Add a capability record only when you want to state it explicitly.</p></div>}
  </section>
}

function DocumentForm({record,saving,error,onCancel,onSubmit}:{record:SupplierDocumentRecord|null;saving:boolean;error:string;onCancel:()=>void;onSubmit:(event:React.FormEvent<HTMLFormElement>)=>void}){
  return <form className="supplier-document-form" onSubmit={onSubmit}>
    <div className="form-grid">
      <label>Document type<select name="type" defaultValue={record?.document_type??'coa'}>{supplierDocumentTypes.map(type=><option value={type.id} key={type.id}>{type.label}</option>)}</select></label>
      <label>Certificate subtype / title<input name="subtype" defaultValue={record?.document_subtype??''} placeholder="Required for generic certificates"/></label>
      <label>Capability<select name="capability" defaultValue={record?.capability_state??'unknown'}>{Object.entries(capabilityLabels).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label>
      <label>Verification<select name="verification" defaultValue={record?.verification_state??'unverified'}>{Object.entries(verificationLabels).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label>
      <label className="span-2">Evidence URL<input name="url" type="url" defaultValue={record?.evidence_url??''} placeholder="https://…"/></label>
      <label>Document title<input name="title" defaultValue={record?.document_title??''}/></label><label>Issuer<input name="issuer" defaultValue={record?.issuer??''}/></label>
      <label>Issue date<input name="issueDate" type="date" defaultValue={record?.issue_date??''}/></label><label>Expiry date<input name="expiryDate" type="date" defaultValue={record?.expiry_date??''}/></label>
      <label>Checked date<input name="checkedDate" type="date" defaultValue={record?.checked_date??''}/></label><label>Scope<input value="Supplier-wide" disabled aria-label="Scope"/></label>
      <label className="span-2">Source / reference<input name="source" defaultValue={record?.source_reference??''}/></label>
      <label className="span-2">Notes<textarea name="notes" defaultValue={record?.notes??''}/></label>
    </div>
    <p className="document-verification-note">Verified is an explicit human decision; a URL or checked date never changes it automatically.</p>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <footer><button type="button" className="button ghost" disabled={saving} onClick={onCancel}>Cancel</button><button className="button primary" disabled={saving}>{saving?'Saving…':'Save document record'}</button></footer>
  </form>
}
