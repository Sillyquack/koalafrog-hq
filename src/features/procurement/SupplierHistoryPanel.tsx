import { useMemo, useState } from 'react'
import { Archive, Clock3, Plus } from 'lucide-react'
import { procurementActions } from './actions/procurementActions'
import type { ProcurementData, SupplierEvent } from './domain/procurement'
import { supplierEventLabels, supplierReliability } from './domain/supplierReliability'

const field=(form:FormData,key:string)=>String(form.get(key)??'').trim()
const optional=(form:FormData,key:string)=>field(form,key)||null
const displayMetric=(value:number|null,suffix='')=>value==null?'Unknown':`${Number.isInteger(value)?value:value.toFixed(1)}${suffix}`

export function SupplierHistoryPanel({workspaceId,data,supplierId,refresh}:{workspaceId:string;data:ProcurementData;supplierId:string;refresh:()=>Promise<void>|void}){
  const events=useMemo(()=>data.supplierEvents.filter(event=>event.supplier_id===supplierId&&!event.archived_at).sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at)),[data.supplierEvents,supplierId])
  const plans=data.purchasePlans.filter(plan=>plan.supplier_id===supplierId)
  const documents=data.supplierDocuments.filter(document=>document.supplier_id===supplierId&&!document.archived_at)
  const[editing,setEditing]=useState<SupplierEvent|null|undefined>(undefined),[error,setError]=useState(''),[saving,setSaving]=useState(false),[limit,setLimit]=useState(10)
  const reliability=supplierReliability(events),metrics=reliability.metrics
  const save=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();const form=new FormData(event.currentTarget)
    const values={supplier_id:supplierId,event_type:field(form,'type'),occurred_at:new Date(field(form,'occurredAt')).toISOString(),expected_at:optional(form,'expectedAt')?new Date(field(form,'expectedAt')).toISOString():null,title:field(form,'title'),description:field(form,'description'),supplier_quote_id:null,procurement_request_id:null,supplier_offer_id:null,purchase_plan_id:optional(form,'purchasePlan'),supplier_document_record_id:optional(form,'document')}
    if(!values.title)return setError('Event title is required.')
    setSaving(true);setError('')
    try{if(editing)await procurementActions.update('supplier_events',editing.id,editing.revision,values);else await procurementActions.createSupplierEvent(workspaceId,values);await refresh();setEditing(undefined)}
    catch(cause){setError(cause instanceof Error?cause.message:'Could not save supplier event.')}finally{setSaving(false)}
  }
  const archive=async(event:SupplierEvent)=>{setSaving(true);setError('');try{await procurementActions.update('supplier_events',event.id,event.revision,{archived_at:new Date().toISOString()});await refresh()}catch(cause){setError(cause instanceof Error?cause.message:'Could not archive supplier event.')}finally{setSaving(false)}}
  return <div className="supplier-history-reliability">
    <section className="panel supplier-reliability" aria-labelledby="supplier-reliability-title">
      <header><div><span className="eyebrow">Derived from explicit events</span><h2 id="supplier-reliability-title">Reliability</h2></div><div className="reliability-indicators">{reliability.indicators.map(indicator=><span key={indicator}>{indicator}</span>)}</div></header>
      <div className="reliability-metrics">
        <Metric label="Orders placed" value={metrics.ordersPlaced||null}/><Metric label="Orders received" value={metrics.ordersReceived||null}/>
        <Metric label="Average delivery" value={metrics.averageDeliveryDays} suffix=" days"/><Metric label="Late deliveries" value={metrics.lateDeliveries}/>
        <Metric label="Partial deliveries" value={metrics.partialDeliveries||null}/><Metric label="Replacement shipments" value={metrics.replacementShipments||null}/>
        <Metric label="Refunds" value={metrics.refunds||null}/><Metric label="Shipment issues" value={metrics.shipmentIssueCount||null}/>
        <Metric label="Documentation response" value={metrics.documentationResponseRate==null?null:metrics.documentationResponseRate*100} suffix="%"/>
        <Metric label="Documentation turnaround" value={metrics.documentationTurnaroundDays} suffix=" days"/><Metric label="Communications" value={metrics.communicationEvents||null}/>
      </div>
      <p className="reliability-caveat">Unknown means the required event evidence or denominator has not been recorded. This is operational history, not a subjective supplier score.</p>
    </section>
    <section className="panel supplier-history" aria-labelledby="supplier-history-title">
      <header><div><span className="eyebrow">Newest first</span><h2 id="supplier-history-title">History</h2><p>Canonical operational events only. Existing notes and records are not converted into history.</p></div>{editing===undefined&&<button className="button ghost" onClick={()=>setEditing(null)}><Plus size={14}/>Add history event</button>}</header>
      {editing!==undefined?<EventForm record={editing} plans={plans} documents={documents} saving={saving} error={error} onSubmit={save} onCancel={()=>{setEditing(undefined);setError('')}}/>:<>
        {error&&<p className="form-error" role="alert">{error}</p>}
        {events.length?<ol className="supplier-timeline">{events.slice(0,limit).map(event=><li key={event.id}><div className="timeline-mark"><Clock3 size={14}/></div><article><header><div><span className="eyebrow">{supplierEventLabels[event.event_type]}</span><h3>{event.title}</h3></div><time dateTime={event.occurred_at}>{new Date(event.occurred_at).toLocaleString()}</time></header><p>{event.description||'No description recorded.'}</p>{event.expected_at&&<small>Expected by {new Date(event.expected_at).toLocaleString()}</small>}<footer><button className="text-button" onClick={()=>setEditing(event)}>Edit</button><button className="text-button danger" disabled={saving} onClick={()=>void archive(event)}><Archive size={12}/>Archive</button></footer></article></li>)}</ol>:<div className="supplier-history-empty"><Clock3 aria-hidden="true"/><h3>No supplier history</h3><p>No operational events have been explicitly recorded for this supplier.</p></div>}
        {events.length>limit&&<button className="button ghost history-load-more" onClick={()=>setLimit(value=>value+10)}>Load older events</button>}
      </>}
    </section>
  </div>
}
function Metric({label,value,suffix}:{label:string;value:number|null;suffix?:string}){return <div><span>{label}</span><strong>{displayMetric(value,suffix)}</strong></div>}
function EventForm({record,plans,documents,saving,error,onSubmit,onCancel}:{record:SupplierEvent|null;plans:ProcurementData['purchasePlans'];documents:ProcurementData['supplierDocuments'];saving:boolean;error:string;onSubmit:(event:React.FormEvent<HTMLFormElement>)=>void;onCancel:()=>void}){
  const local=(value:string)=>{const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60_000).toISOString().slice(0,16)}
  return <form className="supplier-event-form" onSubmit={onSubmit}><div className="form-grid">
    <label>Event type<select name="type" defaultValue={record?.event_type??'manual_note'}>{Object.entries(supplierEventLabels).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label>
    <label>Occurred at<input name="occurredAt" type="datetime-local" required defaultValue={record?local(record.occurred_at):local(new Date().toISOString())}/></label>
    <label>Expected at<input name="expectedAt" type="datetime-local" defaultValue={record?.expected_at?local(record.expected_at):''}/></label>
    <label>Related purchase<select name="purchasePlan" defaultValue={record?.purchase_plan_id??''}><option value="">Not linked</option>{plans.map(plan=><option value={plan.id} key={plan.id}>{plan.title}</option>)}</select></label>
    <label className="span-2">Related supplier document<select name="document" defaultValue={record?.supplier_document_record_id??''}><option value="">Not linked</option>{documents.map(document=><option value={document.id} key={document.id}>{document.document_subtype||document.document_type.toUpperCase()}</option>)}</select></label>
    <label className="span-2">Title<input name="title" required defaultValue={record?.title??''}/></label><label className="span-2">Description<textarea name="description" defaultValue={record?.description??''}/></label>
  </div>{error&&<p className="form-error" role="alert">{error}</p>}<footer><button type="button" className="button ghost" disabled={saving} onClick={onCancel}>Cancel</button><button className="button primary" disabled={saving}>{saving?'Saving…':'Save history event'}</button></footer></form>
}
