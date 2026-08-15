import{readFileSync}from'node:fs'
import{describe,expect,it}from'vitest'
import{footCareProjectTemplates,footCareSourcingTargets}from'./footCareBenchmarks'
import{buildFootCareProcurementGroups,LIVE_RESEARCH_MAX_ITEMS,splitFootCareSourcingTargets}from'./footCareProcurement'

const migration=readFileSync(new URL('../../../../supabase/migrations/20260815200000_foot_care_procurement_handoff.sql',import.meta.url),'utf8')
const hardeningMigration=readFileSync(new URL('../../../../supabase/migrations/20260815210000_harden_foot_care_procurement_handoff.sql',import.meta.url),'utf8')
const analysisShapeMigration=readFileSync(new URL('../../../../supabase/migrations/20260815220000_fix_foot_care_handoff_analysis_shape.sql',import.meta.url),'utf8')

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

  it('keeps the immutable database registry snapshot aligned with the application registry',()=>{
    const encoded=hardeningMigration.match(/\$registry\$\s*(\[[\s\S]*?\])\s*\$registry\$/)?.[1]
    const fixedEncoded=analysisShapeMigration.match(/\$registry\$\s*(\[[\s\S]*?\])\s*\$registry\$/)?.[1]
    expect(encoded).toBeTruthy()
    expect(fixedEncoded).toBeTruthy()
    const expected=footCareSourcingTargets.map(target=>({
      id:target.id,
      name:target.name,
      projectKinds:[...target.projectKinds],
      benchmarkIds:[...target.benchmarkIds],
      benchmarkIngredientIncis:[...target.benchmarkIngredientIncis],
      functions:[...target.functions],
      requiredSpecifications:[...target.requiredSpecifications],
      acceptableSubstitutes:[...target.acceptableSubstitutes],
      ...(target.preferredSupplierHint?{preferredSupplierHint:target.preferredSupplierHint}:{}),
    }))
    expect(JSON.parse(encoded!)).toEqual(expected)
    expect(JSON.parse(fixedEncoded!)).toEqual(expected)
  })

  it('preflights saved-concept identity and canonical provenance before the first Procurement write',()=>{
    expect(analysisShapeMigration).toContain("concept.analysis->'foot_care'->>'registry_version'")
    expect(analysisShapeMigration).toContain("concept.analysis->'foot_care'->>'project_kind'")
    expect(analysisShapeMigration).not.toContain("concept.analysis->'footCare'")
    expect(analysisShapeMigration).not.toContain("->>'registryVersion'")
    expect(analysisShapeMigration).not.toContain("->>'projectKind'")
    expect(analysisShapeMigration).toContain('FOOT_CARE_HANDOFF_REGISTRY_VERSION_MISMATCH')
    expect(analysisShapeMigration).toContain('FOOT_CARE_HANDOFF_TARGET_PROJECT_MISMATCH')
    expect(analysisShapeMigration).toContain('FOOT_CARE_HANDOFF_PROVENANCE_MISMATCH')
    expect(analysisShapeMigration).toContain('FOOT_CARE_HANDOFF_PREFERRED_SUPPLIER_HINT_MISMATCH')
    expect(analysisShapeMigration).toContain('security invoker')
    expect(analysisShapeMigration).toContain('pg_advisory_xact_lock')
    expect(analysisShapeMigration).toContain("jsonb_array_length(group_value->'targets') > 10")
    expect(analysisShapeMigration).toContain("target_text like '%octenidine%'")
    expect(analysisShapeMigration.indexOf('Preflight the complete payload')).toBeLessThan(analysisShapeMigration.indexOf('insert into public.procurement_requests'))
    expect(analysisShapeMigration).not.toMatch(/insert into public\.(procurement_research_jobs|procurement_offer_candidates|procurement_supplier_offers|purchase_orders)/)
  })
})
