import {useState} from 'react'
import {CheckCircle2,Copy,Download,XCircle} from 'lucide-react'
import type{OwnerOperationEntity,OwnerOperationReceipt}from'../../platform/operations/ownerOperationReceipt'

export type OperationReceiptPanelResult=
 |{state:'confirmed';receipt:OwnerOperationReceipt}
 |{state:'rejected_duplicate';entityType:OwnerOperationEntity;existingId?:string;message:string}
 |{state:'ambiguous_conflict';entityType:OwnerOperationEntity;candidateIds:string[];message:string}

const download=(name:string,content:string)=>{const url=URL.createObjectURL(new Blob([content],{type:'application/json'})),anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();URL.revokeObjectURL(url)}
const operationLabel=(operation:OwnerOperationReceipt['operation'])=>operation==='created'?'CREATE':operation==='reused'?'REUSE':'UPDATE'

export function OperationReceiptPanel({result,onDismiss}:{result:OperationReceiptPanelResult;onDismiss?:()=>void}){
 const[message,setMessage]=useState('')
 const receipt=result.state==='confirmed'?result.receipt:undefined
 const entityType=receipt?.entityType??(result.state==='confirmed'?'supplier_product':result.entityType)
 const panelId=`operation-receipt-${receipt?.recordId??entityType}`
 const json=JSON.stringify(receipt??result,null,2)
 const copy=async(value:string,label:string)=>{try{await navigator.clipboard.writeText(value);setMessage(`${label} copied.`)}catch{setMessage(`Could not copy ${label.toLowerCase()}. Select it manually.`)}}
 return <section className={`panel operation-receipt-panel ${result.state}`} aria-labelledby={panelId} data-testid="operation-receipt">
  <header><div>{receipt?<CheckCircle2 aria-hidden="true"/>:<XCircle aria-hidden="true"/>}<span className="eyebrow">{receipt?'Confirmed persistence':result.state.replaceAll('_',' ')}</span><h2 id={panelId}>Operation receipt</h2></div>{onDismiss&&<button className="button ghost" type="button" onClick={onDismiss} aria-label="Dismiss operation receipt">Dismiss</button>}</header>
  {result.state==='confirmed'?<><p>{operationLabel(result.receipt.operation)} confirmed for <strong>{result.receipt.entityType.replaceAll('_',' ')}</strong>. Internal IDs are shown for owner audit and reconciliation.</p><dl><div><dt>Record ID</dt><dd className="receipt-id">{result.receipt.recordId}</dd></div><div><dt>Workspace reference</dt><dd className="receipt-id">{result.receipt.workspaceId}</dd></div><div><dt>Persisted</dt><dd>{result.receipt.persistedAt}</dd></div>{result.receipt.parent&&<div><dt>{result.receipt.parent.entityType==='procurement_requested_item'?'Parent requested-item ID':'Parent request ID'}</dt><dd className="receipt-id">{result.receipt.parent.recordId}</dd></div>}{result.receipt.supplierId&&<div><dt>Supplier ID</dt><dd className="receipt-id">{result.receipt.supplierId}</dd></div>}{result.receipt.sourceSupplierProductDomain!==undefined&&<div><dt>Source Supplier Product</dt><dd>{result.receipt.sourceSupplierProductDomain?<><span>{result.receipt.sourceSupplierProductDomain.replaceAll('_',' ')}</span><span className="receipt-id">{result.receipt.sourceSupplierProductId}</span></>:'Manual offer · no canonical source'}</dd></div>}<div><dt>Natural identity</dt><dd>{Object.entries(result.receipt.naturalIdentity).map(([key,value])=><span key={key}>{key.replaceAll('_',' ')}: {value}</span>)}</dd></div>{result.receipt.changedFields?.length?<div><dt>Confirmed changes</dt><dd>{result.receipt.changedFields.map(item=><span key={item.field}>{item.field.replaceAll(/([A-Z])/g,' $1')}: {item.before??'Unknown'} → {item.after??'Unknown'}</span>)}</dd></div>:null}</dl><div className="action-row"><button className="button ghost" type="button" onClick={()=>void copy(result.receipt.recordId,'Record ID')}><Copy size={14}/>Copy ID</button><button className="button ghost" type="button" onClick={()=>void copy(json,'Receipt JSON')}><Copy size={14}/>Copy receipt JSON</button><button className="button ghost" type="button" onClick={()=>download(`koalafrog-${result.receipt.entityType}-${result.receipt.recordId}.json`,json)}><Download size={14}/>Download receipt JSON</button></div></>:<><p role="alert">{result.message}</p>{result.state==='rejected_duplicate'&&result.existingId&&<p className="receipt-id">Existing ID: {result.existingId}</p>}{result.state==='ambiguous_conflict'&&<ul>{result.candidateIds.map(id=><li className="receipt-id" key={id}>{id}</li>)}</ul>}</>}
  {message&&<p role="status" aria-live="polite">{message}</p>}
 </section>
}
