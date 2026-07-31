import {describe,expect,it} from 'vitest'
import {buildOwnerOperationExport,receiptFromPersistedRow,reconcileOwnerRecords} from './ownerOperationReceipt'

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
  const exported=buildOwnerOperationExport(workspaceId,{equipment:[row,{...row,id:'other',workspace_id:'other-workspace'}]},'2026-07-30T13:00:00.000Z')
  expect(exported.records.equipment).toEqual([{id:row.id,workspace_id:workspaceId,name:'Precision scale',equipment_type:'scale',created_at:row.created_at}])
  expect(JSON.stringify(exported)).not.toMatch(/secret-owner|access_token|secret/)
 })
 it('keeps requested-item parent identity auditable',()=>{
  const item={...row,procurement_request_id:'request-id',name:'Jojoba oil',category:'raw_material'}
  expect(receiptFromPersistedRow('procurement_requested_item',workspaceId,item,{name:'Jojoba oil'},'request-id').parent).toEqual({entityType:'procurement_request',recordId:'request-id'})
 })
})
