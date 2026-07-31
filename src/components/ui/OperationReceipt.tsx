import type {OwnerOperationReceipt} from '../../platform/operations/ownerOperationReceipt'

export function OperationReceipt({receipt}:{receipt:OwnerOperationReceipt}){
 const json=JSON.stringify(receipt,null,2)
 return <section className="panel" aria-labelledby="operation-receipt-title" data-testid="operation-receipt">
  <span className="eyebrow">Confirmed owner-scoped persistence</span>
  <h2 id="operation-receipt-title">Operation receipt</h2>
  <p>The internal identifier below is intended for audit and reconciliation.</p>
  <pre>{json}</pre>
  <button className="button ghost" type="button" onClick={()=>void navigator.clipboard.writeText(json)}>Copy receipt JSON</button>
 </section>
}
