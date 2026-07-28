import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration=readFileSync(new URL('../../../../supabase/migrations/20260727165818_production_purchase_plan_approval_gate.sql',import.meta.url),'utf8')

describe('production purchase plan approval migration contract',()=>{
  it('extends the existing plan and line aggregates instead of duplicating them',()=>{
    expect(migration).toContain('alter table public.purchase_plans')
    expect(migration).toContain('alter table public.purchase_plan_lines')
    expect(migration).not.toContain('create table public.purchase_plans')
    expect(migration).not.toContain('create table public.purchase_plan_lines')
  })

  it('creates immutable supplier baskets, manual verification, and audit history',()=>{
    for(const value of [
      'create table public.purchase_plan_baskets',
      'create table public.purchase_plan_verifications',
      'create table public.purchase_plan_audit_events',
      'source_snapshot jsonb',
      "'1.0.0'",
      "when 'package_price' then .05 else .10",
      'HARD_BLOCKER_NOT_WAIVABLE',
      'VERIFICATION_GATE_UNRESOLVED',
      'ACTIVE_PLAN_REQUIRES_EXPLICIT_SUPERSESSION',
    ])expect(migration).toContain(value)
  })

  it('stops before Purchase Order execution and inventory mutation',()=>{
    expect(migration).not.toMatch(/insert\s+into\s+public\.purchase_orders/i)
    expect(migration).not.toMatch(/insert\s+into\s+public\.(receipts|inventory_lots|inventory_movements)/i)
    expect(migration).not.toMatch(/update\s+public\.procurement_supplier_discounts/i)
    expect(migration).not.toContain('create_purchase_order_from_plan(')
  })

  it('uses authenticated RPCs with fixed search paths and no anonymous execution',()=>{
    expect(migration.match(/security definer set search_path=public,pg_temp/g)).toHaveLength(5)
    expect(migration.match(/revoke all on function public\./g)).toHaveLength(5)
    expect(migration.match(/grant execute on function public\./g)).toHaveLength(5)
  })
})
