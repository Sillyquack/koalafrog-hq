import { useState, type FormEvent } from 'react'
import { isValidBeardPhotoSupportId } from '../../../intelligence/Diagnostics/beardPhotoSupportDiagnostics'
import { BeardPhotoSupportDiagnosticPanel } from './BeardPhotoSupportDiagnosticPanel'

const queryKey = 'beard-analysis-support'
const initialSupportId = () => {
  const value = new URLSearchParams(window.location.search).get(queryKey)?.trim() ?? ''
  return isValidBeardPhotoSupportId(value) ? value : ''
}

export function BeardAnalysisSupportLookup({workspaceId}:{workspaceId?:string}) {
  const [supportId,setSupportId]=useState(initialSupportId)
  const [selectedSupportId,setSelectedSupportId]=useState(initialSupportId)
  const [error,setError]=useState('')

  const submit=(event:FormEvent)=>{event.preventDefault();const candidate=supportId.trim();if(!isValidBeardPhotoSupportId(candidate)){setError('Enter a valid support ID.');return}const url=new URL(window.location.href);url.searchParams.set(queryKey,candidate);window.history.replaceState(null,'',url);setError('');setSelectedSupportId(candidate)}
  const clear=()=>{const url=new URL(window.location.href);url.searchParams.delete(queryKey);window.history.replaceState(null,'',url);setSupportId('');setSelectedSupportId('');setError('')}

  return <section className="beard-support-lookup" aria-labelledby="beard-support-lookup-title">
    <header><div><span className="eyebrow">Analysis history</span><h3 id="beard-support-lookup-title">Reopen an analysis</h3><p>Enter a persisted support ID to retrieve owner-safe metadata for a completed or failed analysis.</p></div></header>
    <form onSubmit={submit}><label htmlFor="beard-support-id">Support ID</label><div><input id="beard-support-id" value={supportId} onChange={event=>setSupportId(event.target.value)} placeholder="00000000-0000-0000-0000-000000000000" autoComplete="off"/><button className="button primary" type="submit" disabled={!workspaceId}>Open analysis</button>{selectedSupportId&&<button className="button" type="button" onClick={clear}>Clear</button>}</div></form>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {!workspaceId&&<p className="form-error">Support lookup requires the hosted workspace.</p>}
    {workspaceId&&selectedSupportId&&<BeardPhotoSupportDiagnosticPanel key={selectedSupportId} workspaceId={workspaceId} supportId={selectedSupportId}/>}
  </section>
}
