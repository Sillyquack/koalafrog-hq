import{readFileSync}from'node:fs'
import{describe,expect,it}from'vitest'
import{footCareProjectTemplates,footCareSourcingTargets}from'./footCareBenchmarks'
import{buildFootCareProcurementGroups,LIVE_RESEARCH_MAX_ITEMS,splitFootCareSourcingTargets}from'./footCareProcurement'

const migration=readFileSync(new URL('../../../../supabase/migrations/20260815200000_foot_care_procurement_handoff.sql',import.meta.url),'utf8')

describe('Foot Care Procurement handoff',()=>{
  it('caps every research group at the live provider contract and splits larger registries',()=>{
    expect(splitFootCareSourcingTargets(footCareSourcingTargets).map(group=>group.length)).toEqual([10,2])
    for(const project of footCareProjectTemplates){
      const groups=buildFootCareProcurementGroups(project.kind)
      expect(groups.every(group=>group.targets.length>0&&group.targets.length<=LIVE_RESEARCH_MAX_ITEMS)).toBe(true)
    }
  })

  it('carries benchmark, INCI, function and optional supplier-hint provenance without forcing a supplier',()=>{
    const groups=buildFootCareProcurementGroups('daily_dry_foot_care')
    expect(groups.flatMap(group=>group.targets)).toContainEqual(expect.objectContaining({id:'aloe-vera-powder',benchmarkIds:['gehwol-fusskraft-blue-no-2026-08'],benchmarkIngredientIncis:['Aloe Barbadensis Leaf Juice Powder'],functions:['skin conditioning'],preferredSupplierHint:'Mystic Moments'}))
    expect(JSON.stringify(groups)).not.toContain('target_supplier_id')
    expect(JSON.stringify(groups)).toContain('preferred-supplier hint only')
  })

  it('never hands Octenidine or aerosol propellants to ordinary raw-material research',()=>{
    const payload=JSON.stringify(footCareProjectTemplates.flatMap(project=>buildFootCareProcurementGroups(project.kind)))
    expect(payload).not.toMatch(/Octenidine HCl|"Butane"|"Propane"|aerosol propellant/i)
  })

  it('uses an owner-scoped atomic idempotent RPC and creates no research, candidate, order or purchase side effects',()=>{
    expect(migration).toContain('security invoker')
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('procurement_requests_product_studio_source_unique')
    expect(migration).toContain('procurement_requested_items_source_target_unique')
    expect(migration).toContain("jsonb_array_length(group_value->'targets') > 10")
    expect(migration).toContain("product_type = 'foot_care'")
    expect(migration).toContain("target_text like '%octenidine%'")
    expect(migration).toContain('source_benchmark_ids')
    expect(migration).toContain('source_benchmark_ingredient_incis')
    expect(migration).toContain('source_functions')
    expect(migration).not.toMatch(/insert into public\.(procurement_research_jobs|procurement_offer_candidates|procurement_supplier_offers|purchase_orders)/)
  })
})
