import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'

const migration=readFileSync(new URL('../../../../supabase/migrations/20260728080000_draft_purchase_order_handoff.sql',import.meta.url),'utf8')

describe('draft Purchase Order handoff migration',()=>{
  it('uses the existing order aggregate and creates one order per basket transactionally',()=>{
    expect(migration).toContain('alter table public.purchase_orders')
    expect(migration).toContain('for basket_row in select * from public.purchase_plan_baskets')
    expect(migration).toContain('create_draft_purchase_orders_from_plan')
    expect(migration).toContain('PARTIAL_HANDOFF_STATE')
  })
  it('keeps placement, receipt, inventory, and discount consumption outside the handoff',()=>{
    const handoff=migration.split('create function public.create_draft_purchase_orders_from_plan')[1].split('create function public.cancel_draft_purchase_order')[0]
    expect(handoff).not.toContain('record_purchase_order_placement')
    expect(handoff).not.toMatch(/insert into public\.(receipts|inventory_lots|inventory_movements|supplier_events)/)
    expect(handoff).not.toMatch(/update public\.purchase_plans/)
    expect(handoff).not.toMatch(/update public\.procurement_supplier_discounts/)
  })
  it('enforces owner identity, active workspace, fixed search path, revisions, and RPC-only grants',()=>{
    for(const value of ['auth.uid()',"lifecycle_state='active'",'security definer set search_path=public,pg_temp','STALE_PURCHASE_PLAN_REVISION','revoke all on function','grant execute on function'])expect(migration).toContain(value)
  })
})
