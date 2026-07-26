import { describe, expect, it } from 'vitest'
import type { SupplierEvent } from './procurement'
import { supplierReliability } from './supplierReliability'

const event=(event_type:SupplierEvent['event_type'],occurred_at:string,values:Partial<SupplierEvent>={}):SupplierEvent=>({id:crypto.randomUUID(),supplier_id:'supplier-1',event_type,occurred_at,expected_at:null,title:event_type,description:'',supplier_quote_id:null,procurement_request_id:null,supplier_offer_id:null,purchase_plan_id:null,supplier_document_record_id:null,revision:1,archived_at:null,created_at:occurred_at,updated_at:occurred_at,...values})

describe('supplier reliability',()=>{
  it('keeps every unsupported metric unknown and reports no history',()=>{
    const result=supplierReliability([])
    expect(result.indicators).toEqual(['No history'])
    expect(result.metrics.averageDeliveryDays).toBeNull()
    expect(result.metrics.documentationResponseRate).toBeNull()
    expect(result.metrics.lateDeliveries).toBeNull()
  })
  it('uses only linked completed deliveries and ignores unknown delivery pairs',()=>{
    const events=[
      event('purchase_placed','2026-07-01T10:00:00Z',{purchase_plan_id:'plan-1',expected_at:'2026-07-06T10:00:00Z'}),
      event('shipment_received','2026-07-05T10:00:00Z',{purchase_plan_id:'plan-1'}),
      event('shipment_received','2026-07-03T10:00:00Z'),
      event('purchase_placed','2026-07-10T10:00:00Z',{purchase_plan_id:'plan-2'}),
    ]
    const result=supplierReliability(events)
    expect(result.metrics.ordersPlaced).toBe(2)
    expect(result.metrics.ordersReceived).toBe(1)
    expect(result.metrics.averageDeliveryDays).toBe(4)
    expect(result.metrics.lateDeliveries).toBe(0)
  })
  it('derives documentation response and turnaround only from explicit linked pairs',()=>{
    const events=[
      event('documentation_requested','2026-07-01T00:00:00Z',{supplier_document_record_id:'doc-1'}),
      event('documentation_received','2026-07-03T00:00:00Z',{supplier_document_record_id:'doc-1'}),
      event('documentation_requested','2026-07-04T00:00:00Z',{supplier_document_record_id:'doc-2'}),
      event('communication','2026-07-05T00:00:00Z'),
    ]
    const result=supplierReliability(events)
    expect(result.metrics.documentationResponseRate).toBe(.5)
    expect(result.metrics.documentationTurnaroundDays).toBe(2)
    expect(result.indicators).toContain('Documentation incomplete')
  })
  it('derives deterministic delivery and issue descriptors without a score',()=>{
    const events:SupplierEvent[]=[]
    for(let index=0;index<3;index++){events.push(event('purchase_placed',`2026-07-0${index+1}T00:00:00Z`,{purchase_plan_id:`plan-${index}`}));events.push(event('shipment_received',`2026-07-0${index+3}T00:00:00Z`,{purchase_plan_id:`plan-${index}`}))}
    const result=supplierReliability(events)
    expect(result.indicators).toContain('Consistent deliveries')
    expect(result.indicators).toContain('Reliable lead time')
    expect(result).not.toHaveProperty('score')
  })
  it('excludes archived events',()=>{expect(supplierReliability([event('refund','2026-07-01T00:00:00Z',{archived_at:'2026-07-02T00:00:00Z'})]).indicators).toEqual(['No history'])})
})
