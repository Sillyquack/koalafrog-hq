import { readFileSync } from 'node:fs'
import { describe,expect,it } from 'vitest'

const migration=readFileSync(new URL('../../../../supabase/migrations/20260728100000_supplier_confirmation_and_shipments.sql',import.meta.url),'utf8')

describe('supplier confirmation and shipment migration',()=>{
  it('keeps confirmation, shipment, receipt and inventory semantics separate',()=>{
    expect(migration).toContain('purchase_order_confirmations')
    expect(migration).toContain('purchase_order_confirmation_lines')
    expect(migration).toContain('purchase_order_shipments')
    expect(migration).toContain('purchase_order_shipment_lines')
    expect(migration).toContain('delivery_reported')
    expect(migration).toContain('Physical receipt and inspection are not recorded')
    expect(migration).not.toMatch(/insert into public\.(receipts|inventory_lots|inventory_movements)/)
  })
  it('uses guarded definer RPCs and RPC-only writes',()=>{
    for(const name of ['record_purchase_order_supplier_confirmation','decide_purchase_order_confirmation','create_purchase_order_shipment','record_purchase_order_shipment_status']){
      expect(migration).toContain(`create function public.${name}`)
    }
    expect(migration.match(/security definer set search_path=public,pg_temp/g)).toHaveLength(4)
    expect(migration).toContain('from public,anon')
    expect(migration).toContain('to authenticated')
  })
  it('guards immutable versions, retries and cumulative allocation',()=>{
    expect(migration).toContain('CONFIRMATION_RETRY_CONFLICT')
    expect(migration).toContain('SHIPMENT_RETRY_CONFLICT')
    expect(migration).toContain('SHIPMENT_QUANTITY_EXCEEDS_CONFIRMED')
    expect(migration).toContain("lifecycle_status='superseded'")
  })
})
