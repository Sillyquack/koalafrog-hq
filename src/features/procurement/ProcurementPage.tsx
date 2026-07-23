import {useMemo,useRef,useState} from 'react'
import {Download,FileUp,Plus,Search,ShoppingCart} from 'lucide-react'
import {Link} from 'react-router-dom'
import {PageHeader} from '../../components/ui/PageHeader'
import {procurementDemo} from './data/procurementSeed'
import {procurementActions} from './actions/procurementActions'
import {exportProcurement,parseProcurementJson} from './data/procurementInterchange'
import type {ProcurementPriority,ProcurementRequestStatus} from './domain/procurement'
import {useProcurement} from './useProcurement'

const statuses:ProcurementRequestStatus[]=['needed','researching','recommended','ordered','received']
const priorities:ProcurementPriority[]=['low','normal','high','urgent']
function download(name:string,content:string,type:string){const url=URL.createObjectURL(new Blob([content],{type})),anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();URL.revokeObjectURL(url)}

export function ProcurementPage(){
 const{workspace,data,error,refresh}=useProcurement(),[creating,setCreating]=useState(false),[message,setMessage]=useState(''),[search,setSearch]=useState(''),[status,setStatus]=useState(''),[category,setCategory]=useState(''),[supplier,setSupplier]=useState(''),[priority,setPriority]=useState(''),importRef=useRef<HTMLInputElement>(null)
 const categories=useMemo(()=>[...new Set(data?.requests.map(x=>x.category)??[])].sort(),[data])
 const visible=useMemo(()=>data?.requests.filter(request=>{
  const items=data.requestedItems.filter(x=>x.procurement_request_id===request.id),supplierIds=new Set(data.offers.filter(x=>items.some(item=>item.id===x.requested_item_id)).map(x=>x.supplier_id))
  return(!search||`${request.title} ${items.map(x=>x.name).join(' ')}`.toLowerCase().includes(search.toLowerCase()))&&(!status||request.status===status)&&(!category||request.category===category)&&(!priority||request.priority===priority)&&(!supplier||supplierIds.has(supplier))
 })??[],[data,search,status,category,priority,supplier])
 if(error)return <section className="panel procurement-state" role="alert"><h1>Procurement unavailable</h1><p>{error}</p><button className="button ghost" onClick={refresh}>Retry</button></section>
 if(!data)return <section className="panel procurement-state"><p>Loading hosted procurement…</p></section>
 const create=async(form:HTMLFormElement)=>{if(!workspace)return;const values=Object.fromEntries(new FormData(form));try{await procurementActions.createRequest(workspace.workspaceId,{title:values.title,status:'needed',category:values.category,priority:values.priority,needed_by:values.needed_by||null,notes:values.notes||''});setCreating(false);setMessage('Request created.');await refresh()}catch(cause){setMessage(cause instanceof Error?cause.message:'Could not create request.')}}
 const createDemo=async()=>{if(!workspace)return;try{await procurementActions.importSnapshot(workspace.workspaceId,procurementDemo);setMessage('Demo request added.');await refresh()}catch(cause){setMessage(cause instanceof Error?cause.message:'Could not add demo request.')}}
 const importJson=async(file:File)=>{if(!workspace)return;try{const bundle=parseProcurementJson(await file.text());await procurementActions.importSnapshot(workspace.workspaceId,bundle);setMessage('Procurement JSON imported.');await refresh()}catch(cause){setMessage(cause instanceof Error?cause.message:'Could not import JSON.')}finally{if(importRef.current)importRef.current.value=''}}
 return <div className="procurement-workspace">
  <PageHeader eyebrow="Sourcing / owner-controlled research" title="Procurement" description="Structure needs, compare supplier offers and record recommendations. This workspace never places orders or makes payments." action={<button className="button primary" onClick={()=>setCreating(x=>!x)}><Plus size={14}/>New request</button>}/>
  <div className="operational-notice"><ShoppingCart/><p>Manual research only · unknown values stay unknown · Ordered records an external event and does not purchase anything.</p></div>
  <div className="procurement-toolbar" aria-label="Procurement data tools">
   <button className="button ghost" onClick={()=>download('koalafrog-procurement.json',JSON.stringify(exportProcurement(data),null,2),'application/json')}><Download size={14}/>Export JSON</button>
   <button className="button ghost" onClick={()=>importRef.current?.click()}><FileUp size={14}/>Import JSON</button>
   <input ref={importRef} className="visually-hidden" type="file" accept=".json,application/json" onChange={event=>{const file=event.target.files?.[0];if(file)void importJson(file)}}/>
   {!data.requests.length&&<button className="button ghost" onClick={()=>void createDemo()}>Add demo request</button>}
  </div>
  {creating&&<form className="panel procurement-request-form" onSubmit={event=>{event.preventDefault();void create(event.currentTarget)}}>
   <label>Request title<input name="title" required/></label><label>Category<input name="category" required placeholder="raw_material"/></label>
   <label>Priority<select name="priority" defaultValue="normal">{priorities.map(x=><option key={x}>{x}</option>)}</select></label><label>Needed by<input name="needed_by" type="date"/></label>
   <label className="wide">Notes<textarea name="notes" rows={2}/></label><button className="button primary">Save request</button>
  </form>}
  {message&&<p className="form-message" role="status">{message}</p>}
  <section className="procurement-filters" aria-label="Filter procurement requests">
   <label><Search size={14}/><span className="visually-hidden">Search</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search requests"/></label>
   <label>Status<select value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{statuses.map(x=><option key={x}>{x}</option>)}</select></label>
   <label>Category<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">All categories</option>{categories.map(x=><option key={x}>{x}</option>)}</select></label>
   <label>Supplier<select value={supplier} onChange={e=>setSupplier(e.target.value)}><option value="">All suppliers</option>{data.suppliers.map(x=><option key={x.id} value={x.id}>{x.trading_name||x.legal_name}</option>)}</select></label>
   <label>Priority<select value={priority} onChange={e=>setPriority(e.target.value)}><option value="">All priorities</option>{priorities.map(x=><option key={x}>{x}</option>)}</select></label>
  </section>
  <section className="procurement-request-list" aria-live="polite">
   {visible.map(request=>{const items=data.requestedItems.filter(x=>x.procurement_request_id===request.id),offers=data.offers.filter(x=>items.some(item=>item.id===x.requested_item_id));return <Link className="panel procurement-request-card" key={request.id} to={`/procurement/${request.id}`}><div><span className="eyebrow">{request.category.replaceAll('_',' ')}</span><h2>{request.title}</h2><p>{items.length} requested {items.length===1?'item':'items'} · {offers.length} {offers.length===1?'offer':'offers'} · Needed {request.needed_by||'date unknown'}</p></div><div><strong className={`procurement-status ${request.status}`}>{request.status}</strong><small>{request.priority} priority</small></div></Link>})}
   {!visible.length&&<article className="panel procurement-empty"><h2>No matching requests</h2><p>Create a request, import a versioned JSON file, or adjust the filters.</p></article>}
  </section>
 </div>
}
