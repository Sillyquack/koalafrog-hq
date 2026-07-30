import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'
const migration=readFileSync(new URL('../../../../supabase/migrations/20260728090000_external_purchase_order_placement.sql',import.meta.url),'utf8')
describe('external Purchase Order placement migration',()=>{
  it('records actuals separately and constrains a placed snapshot',()=>{
    for(const value of ['actual_grand_total','actual_currency','placement_evidence','placement_comparison','placement_policy_version','purchase_orders_placed_snapshot_required'])expect(migration).toContain(value)
  })
  it('places one verified draft and produces only placement audit and supplier events',()=>{
    const rpc=migration.split('create function public.record_verified_purchase_order_placement')[1]
    expect(rpc).toContain("status='placed'")
    expect(rpc).toContain("'purchase_placed'")
    expect(rpc).not.toMatch(/insert into public\.(receipts|inventory_lots|inventory_movements)/)
    expect(rpc).not.toMatch(/update public\.purchase_plans/)
    expect(rpc).not.toMatch(/update public\.procurement_supplier_discounts/)
  })
  it('uses owner, workspace, lock, revision, evidence, idempotency, and fixed-search-path controls',()=>{
    for(const value of ['auth.uid()',"lifecycle_state='active'",'for update','STALE_PURCHASE_ORDER_REVISION','PLACEMENT_EVIDENCE_REQUIRED','PLACEMENT_RETRY_CONFLICT','security definer set search_path=public,pg_temp','revoke all on function'])expect(migration).toContain(value)
  })
})
