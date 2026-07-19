import { describe, expect, it } from 'vitest'
import { formulationIssues } from '../../formulas/domain/multiPhaseLogic'
import { formulationArchetypes, productTemplates, resolveArchetype, resolveProductTemplate, resolveTemplateArchetype } from './formulationEngine'

describe('Core Formulation Engine registry',()=>{
  it('maps existing product templates to operational archetypes',()=>{
    expect(resolveTemplateArchetype('beard_oil')).toMatchObject({ok:true,value:{archetype:{id:'simple_liquid',maturity:'operational'}}})
    expect(resolveTemplateArchetype('beard_butter')).toMatchObject({ok:true,value:{archetype:{id:'anhydrous_multiphase',maturity:'operational'}}})
    expect(resolveTemplateArchetype('natural_deodorant')).toMatchObject({ok:true,value:{archetype:{id:'solid_or_stick',maturity:'operational'}}})
  })

  it('registers future archetypes as planned capabilities without operational templates',()=>{
    expect(Object.keys(formulationArchetypes)).toEqual(['simple_liquid','anhydrous_multiphase','solid_or_stick','emulsion','water_based','alcohol_based','gel','powder'])
    expect(Object.values(formulationArchetypes).filter(item=>item.maturity==='operational').map(item=>item.id)).toEqual(['simple_liquid','anhydrous_multiphase','solid_or_stick'])
    expect(Object.values(productTemplates).map(item=>item.archetypeId)).toEqual(['simple_liquid','anhydrous_multiphase','solid_or_stick'])
  })

  it('fails visibly for unknown archetypes and templates',()=>{
    expect(resolveArchetype('unknown')).toEqual({ok:false,error:'Unknown formulation archetype: unknown'})
    expect(resolveProductTemplate('unknown')).toEqual({ok:false,error:'Unknown Product Studio template: unknown'})
    expect(resolveTemplateArchetype('unknown')).toEqual({ok:false,error:'Unknown Product Studio template: unknown'})
  })

  it('uses shared composition validation for simple liquids',()=>{
    const archetype=formulationArchetypes.simple_liquid
    expect(formulationIssues(archetype.capabilities,[],[{phase:'Main blend',percentage:60},{phase:'Final additions',percentage:40}],[])).toEqual([])
    expect(formulationIssues(archetype.capabilities,[],[{phase:'Main blend',percentage:99}],[])).toContain('Formula percentages must total exactly 100%.')
  })

  it('uses shared phase and process validation for anhydrous multi-phase formulas',()=>{
    const template=productTemplates.beard_butter,archetype=formulationArchetypes.anhydrous_multiphase
    expect(formulationIssues(archetype.capabilities,[...template.defaultPhases],[{phase:'A',percentage:100}],[...template.draftProcess])).toEqual([])
    expect(formulationIssues(archetype.capabilities,[...template.defaultPhases],[{phase:'unknown',percentage:100}],[...template.draftProcess])).toContain('Formula line references unknown phase unknown.')
  })

  it('makes solid or stick operational without enabling unrelated planned archetypes',()=>{
    expect(formulationArchetypes.solid_or_stick.capabilities).toMatchObject({phases:true,heating:true,cooling:true,powderDispersion:true,controlledFilling:true,setting:true,structuredPhysicalTesting:true})
    expect([formulationArchetypes.emulsion,formulationArchetypes.water_based,formulationArchetypes.alcohol_based,formulationArchetypes.gel,formulationArchetypes.powder].every(item=>item.maturity==='planned')).toBe(true)
  })
})
