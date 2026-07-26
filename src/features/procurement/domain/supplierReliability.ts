import type { SupplierEvent, SupplierEventType } from './procurement'

export const supplierEventLabels:Record<SupplierEventType,string>={
  quote_received:'Quote received',quote_updated:'Quote updated',purchase_planned:'Purchase planned',purchase_placed:'Purchase placed',order_confirmed:'Order confirmed',shipment_dispatched:'Shipment dispatched',shipment_received:'Shipment received',partial_shipment:'Partial shipment',cancelled_order:'Cancelled order',refund:'Refund',replacement_shipment:'Replacement shipment',damaged_shipment:'Damaged shipment',customs_issue:'Customs issue',invoice_received:'Invoice received',payment_completed:'Payment completed',documentation_requested:'Documentation requested',documentation_received:'Documentation received',documentation_rejected:'Documentation rejected',communication:'Communication',manual_note:'Manual note',
}
const days=(from:string,to:string)=>(new Date(to).getTime()-new Date(from).getTime())/86_400_000
export function supplierReliability(events:SupplierEvent[]){
  const current=events.filter(event=>!event.archived_at)
  const type=(name:SupplierEventType)=>current.filter(event=>event.event_type===name)
  const placed=type('purchase_placed'),received=type('shipment_received')
  const deliveries=received.flatMap(delivery=>{
    if(!delivery.purchase_plan_id)return[]
    const order=placed.filter(item=>item.purchase_plan_id===delivery.purchase_plan_id&&item.occurred_at<=delivery.occurred_at).sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at))[0]
    return order?[{order,delivery,days:days(order.occurred_at,delivery.occurred_at)}]:[]
  }).filter(item=>item.days>=0)
  const documentRequests=type('documentation_requested')
  const documentResponses=documentRequests.flatMap(request=>{
    if(!request.supplier_document_record_id)return[]
    const response=current.filter(item=>item.supplier_document_record_id===request.supplier_document_record_id&&['documentation_received','documentation_rejected'].includes(item.event_type)&&item.occurred_at>=request.occurred_at).sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at))[0]
    return response?[{request,response,days:days(request.occurred_at,response.occurred_at)}]:[]
  })
  const issueCount=type('damaged_shipment').length+type('customs_issue').length
  const lateDeliveries=deliveries.filter(({order,delivery})=>order.expected_at!=null&&delivery.occurred_at>order.expected_at).length
  const average=(values:number[])=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null
  const metrics={
    ordersPlaced:placed.length,ordersReceived:new Set(deliveries.map(item=>item.delivery.purchase_plan_id)).size,
    averageDeliveryDays:average(deliveries.map(item=>item.days)),lateDeliveries:deliveries.some(item=>item.order.expected_at)?lateDeliveries:null,
    partialDeliveries:type('partial_shipment').length,replacementShipments:type('replacement_shipment').length,refunds:type('refund').length,
    documentationResponseRate:documentRequests.length?documentResponses.length/documentRequests.length:null,
    documentationTurnaroundDays:average(documentResponses.map(item=>item.days)),shipmentIssueCount:issueCount,
    communicationEvents:type('communication').length,completedShipments:deliveries.length,
  }
  const indicators:string[]=[]
  if(!current.length)indicators.push('No history')
  else if(current.length<3)indicators.push('Limited history')
  if(deliveries.length>=3&&lateDeliveries===0)indicators.push('Consistent deliveries')
  if(deliveries.length>=3){const durations=deliveries.map(item=>item.days);if(Math.max(...durations)-Math.min(...durations)<=2)indicators.push('Reliable lead time');else if(Math.max(...durations)-Math.min(...durations)>7)indicators.push('Variable lead time')}
  if(deliveries.length&&issueCount/deliveries.length>=.3)indicators.push('Frequent shipment issues')
  if(documentRequests.length>=2&&documentResponses.length/documentRequests.length>=.8)indicators.push('Documentation responsive')
  else if(documentRequests.length&&documentResponses.length<documentRequests.length)indicators.push('Documentation incomplete')
  if(current.length>=3&&!indicators.length)indicators.push('Unknown performance')
  return{metrics,indicators}
}
