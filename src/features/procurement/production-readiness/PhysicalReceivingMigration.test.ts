import{readFileSync}from'node:fs'
import{describe,expect,it}from'vitest'

const migration=readFileSync('supabase/migrations/20260728110000_physical_receiving_inspection_quarantine.sql','utf8')

describe('physical receiving migration contract',()=>{
  it('models receipt, discrepancies, inspections and quarantine separately',()=>{
    for(const table of ['purchase_order_receipts','purchase_order_receipt_shipments','purchase_order_receipt_lines','purchase_order_receipt_discrepancies','purchase_order_receipt_inspections','inventory_quarantine_intakes'])expect(migration).toContain(`create table public.${table}`)
  })
  it('never writes released inventory',()=>{
    expect(migration).not.toMatch(/insert into public\.inventory_lots/i)
    expect(migration).not.toMatch(/insert into public\.inventory_movements/i)
    expect(migration).not.toMatch(/insert into public\.packaging_inventory_lots/i)
    expect(migration).not.toMatch(/insert into public\.packaging_inventory_movements/i)
  })
  it('uses owner-scoped reads and RPC-only writes',()=>{
    expect(migration.match(/enable row level security/g)?.length).toBe(6)
    expect(migration).toContain('grant select on public.purchase_order_receipts')
    expect(migration).toContain('security definer set search_path=public,pg_temp')
    expect(migration).toContain('from public,anon')
  })
  it('preserves explicit idempotency and quantity boundaries',()=>{
    for(const token of ['RECEIPT_RETRY_CONFLICT','RECEIPT_LINE_RETRY_CONFLICT','DISCREPANCY_RETRY_CONFLICT','INSPECTION_RETRY_CONFLICT','QUARANTINE_QUANTITY_EXCEEDS_ELIGIBLE'])expect(migration).toContain(token)
  })
})
