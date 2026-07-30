import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'

const page=readFileSync(new URL('./ProcurementPage.tsx',import.meta.url),'utf8')
const domain=readFileSync(new URL('./domain/procurement.ts',import.meta.url),'utf8')
const css=readFileSync(new URL('../../styles/index.css',import.meta.url),'utf8')
const migration=readFileSync(new URL('../../../supabase/migrations/20260727155213_procurement_semantic_separation_v1.sql',import.meta.url),'utf8')

describe('procurement semantic separation UI contract',()=>{
 it('distinguishes internal plans, external orders, receiving, and inventory',()=>{
  for(const value of ['Purchase Plans are internal decisions','Purchase Orders record explicit supplier execution','Receiving:','Inventory: unchanged','Approval never creates one automatically'])expect(page).toContain(value)
  expect(domain).not.toContain("'ordered_external'|'partially_received'|'received'")
 })
 it('requires explicit order creation and placement',()=>{
  expect(page).toContain('Create draft Purchase Order')
  expect(page).toContain('Record external placement')
  expect(page).toContain('window.confirm')
  expect(page).toContain('window.prompt')
 })
 it('preserves safe links, status text, and a 390px layout',()=>{
  expect(page).toContain('rel="noopener noreferrer"')
  expect(page).toContain("replaceAll('_',' ')")
 expect(css).toContain('.procurement-execution-grid{grid-template-columns:1fr}')
 })
 it('preserves legacy execution without replaying inventory or supplier events',()=>{
  for(const value of ["when 'ordered_external' then 'placed'","when 'partially_received' then 'partially_fulfilled'","legacy_received_quantity","purchase_orders_legacy_source_plan","on conflict do nothing","supplier_event_execution_link_guard"])expect(migration).toContain(value)
  expect(migration).not.toContain('insert into public.inventory_lots')
  expect(migration).not.toContain('insert into public.inventory_movements')
 })
})
