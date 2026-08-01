import {describe,expect,it} from 'vitest'
import {buildOwnerOperationExport,isOwnerOperationReceipt,receiptFromPersistedRow,reconcileOwnerRecords} from './ownerOperationReceipt'

const workspaceId='11111111-1111-4111-8111-111111111111'
const row={id:'22222222-2222-4222-8222-222222222222',workspace_id:workspaceId,created_at:'2026-07-30T12:00:00.000Z',name:'Precision scale',equipment_type:'scale',owner_id:'secret-owner',access_token:'secret'}

describe('owner operation receipts',()=>{
 it('uses the definitive persisted ID and timestamp',()=>{
  expect(receiptFromPersistedRow('equipment',workspaceId,row,{name:'Precision scale',equipment_type:'scale'})).toMatchObject({recordId:row.id,workspaceId,operation:'created',persistedAt:row.created_at})
 })
 it('rejects a mismatched workspace readback',()=>{
  expect(()=>receiptFromPersistedRow('equipment','another-workspace',row,{name:'Precision scale'})).toThrow(/active workspace/)
 })
 it('classifies a fresh identity as create and an exact owner record as reuse with the same ID',()=>{
  expect(reconcileOwnerRecords('equipment',workspaceId,[],{name:'Precision scale',equipment_type:'scale'})).toEqual({classification:'create'})
  expect(reconcileOwnerRecords('equipment',workspaceId,[row],{name:'Precision scale',equipment_type:'scale'})).toMatchObject({classification:'reuse',receipt:{recordId:row.id,operation:'reused'}})
 })
 it('distinguishes ambiguous conflicts without fabricating an ID',()=>{
  const result=reconcileOwnerRecords('equipment',workspaceId,[row,{...row,id:'33333333-3333-4333-8333-333333333333'}],{name:'Precision scale',equipment_type:'scale'})
  expect(result).toEqual({classification:'ambiguous_conflict',candidateIds:[row.id,'33333333-3333-4333-8333-333333333333']})
 })
 it('exports only allowlisted fields and only the active workspace',()=>{
  const exported=buildOwnerOperationExport(workspaceId,{equipment:[{...row,id:'z-record'},{...row,id:'a-record'},{...row,id:'other',workspace_id:'other-workspace'}]},'2026-07-30T13:00:00.000Z')
  expect(exported.records.equipment?.map(item=>item.id)).toEqual(['a-record','z-record'])
  expect(JSON.stringify(exported)).not.toMatch(/secret-owner|access_token|secret/)
 })
 it('keeps requested-item parent identity auditable',()=>{
  const item={...row,procurement_request_id:'request-id',name:'Jojoba oil',category:'raw_material'}
  expect(receiptFromPersistedRow('procurement_requested_item',workspaceId,item,{name:'Jojoba oil'},'request-id').parent).toEqual({entityType:'procurement_request',recordId:'request-id'})
 })
 it('exports the canonical Supplier ID for Supplier Product readback',()=>{
  const supplierProduct={...row,ingredient_id:'ingredient-id',supplier_id:'supplier-id',supplier_name:'Mystic Moments UK',product_name:'Jojoba Golden Carrier Oil',lifecycle_status:'candidate',price_state:'unknown',updated_at:row.created_at}
  const exported=buildOwnerOperationExport(workspaceId,{supplier_product:[supplierProduct]},'2026-07-30T13:00:00.000Z')
  expect(exported.records.supplier_product?.[0]).toMatchObject({id:row.id,supplier_id:'supplier-id',supplier_name:'Mystic Moments UK'})
 })
 it('validates navigation receipts against entity, persisted ID, and active workspace',()=>{
  const receipt=receiptFromPersistedRow('packaging_component',workspaceId,row,{name:'Precision scale'})
  expect(isOwnerOperationReceipt(receipt,{entityType:'packaging_component',recordId:row.id,workspaceId})).toBe(true)
  expect(isOwnerOperationReceipt({...receipt,workspaceId:'other'},{entityType:'packaging_component',recordId:row.id,workspaceId})).toBe(false)
  expect(isOwnerOperationReceipt({...receipt,operation:'invented'})).toBe(false)
  expect(isOwnerOperationReceipt({entityType:'packaging_component',recordId:row.id})).toBe(false)
 })
 it('exports Draft plans, baskets, and lines with stable relations, ordering, and null Unknowns',()=>{
  const plan={id:'plan-id',workspace_id:workspaceId,title:'Internal Draft',status:'draft',placement_state:'unplaced',order_authorized:false,target_budget:3500,absolute_stop:4000,estimated_landed_total:null,created_at:row.created_at,updated_at:row.created_at,owner_id:'secret'}
  const baskets=[{id:'basket-z',workspace_id:workspaceId,purchase_plan_id:'plan-id',supplier_id:'supplier-z',supplier_name_snapshot:'Z',currency:'GBP',shipping:null,import_vat:null,created_at:row.created_at},{id:'basket-a',workspace_id:workspaceId,purchase_plan_id:'plan-id',supplier_id:'supplier-a',supplier_name_snapshot:'A',currency:'NOK',shipping:110,import_vat:null,created_at:row.created_at},{id:'other-basket',workspace_id:'other-workspace',purchase_plan_id:'other-plan',supplier_id:'other',supplier_name_snapshot:'Other',currency:'NOK',shipping:0,created_at:row.created_at}]
  const lines=[{id:'line-z',workspace_id:workspaceId,purchase_plan_id:'plan-id',purchase_plan_basket_id:'basket-z',source_kind:'supplier_product',source_record_id:'source-z',supplier_sku_snapshot:'SKU-Z',estimated_line_total:null,commercial_evidence_snapshot:{selected:true},created_at:row.created_at},{id:'line-a',workspace_id:workspaceId,purchase_plan_id:'plan-id',purchase_plan_basket_id:'basket-a',source_kind:'manual',source_record_id:null,supplier_sku_snapshot:null,estimated_line_total:100,commercial_evidence_snapshot:{selected:true},created_at:row.created_at}]
  const exported=buildOwnerOperationExport(workspaceId,{purchase_plan:[plan],purchase_plan_basket:baskets,purchase_plan_line:lines},'2026-07-31T13:00:00.000Z')
  expect(exported.records.purchase_plan?.[0]).toMatchObject({id:'plan-id',status:'draft',placement_state:'unplaced',order_authorized:false,estimated_landed_total:null})
  expect(exported.records.purchase_plan_basket?.map(item=>item.id)).toEqual(['basket-a','basket-z'])
  expect(exported.records.purchase_plan_basket?.find(item=>item.id==='basket-z')).toMatchObject({purchase_plan_id:'plan-id',shipping:null,import_vat:null})
  expect(exported.records.purchase_plan_line?.map(item=>item.id)).toEqual(['line-a','line-z'])
  expect(JSON.stringify(exported)).not.toMatch(/secret|other-basket/)
 })
})
