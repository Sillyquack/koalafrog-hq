import{describe,expect,it}from'vitest'
import{
  FOOT_CARE_REGISTRY_VERSION,
  footCareBenchmarks,
  footCareCoreSourcingTargets,
  footCareProjectTemplates,
  footCareSourcingTargets,
}from'./footCareBenchmarks'
import{createFootCareConceptInput,footCareConceptAnalysis}from'./footCareProjects'

describe('Foot Care benchmark registry',()=>{
  it('registers the three owned GEHWOL benchmarks and preserves the antiperspirant source conflict',()=>{
    expect(footCareBenchmarks.map(benchmark=>`${benchmark.productName} ${benchmark.packSize}`)).toEqual([
      'Fusskraft Blue 75 ml',
      'GEHWOL med Antiperspirant 125 ml',
      'Foot + Shoe Deodorant 150 ml',
    ])
    expect(footCareBenchmarks[1]).toMatchObject({evidenceState:'source_conflict_requires_pack_label',alternateSourceUrl:expect.stringContaining('gehwolfootcare.com')})
    expect(footCareBenchmarks[1].sourceNote).toContain('physical-product truth')
  })

  it('keeps Octenidine HCl and aerosol propellants as review evidence rather than ordinary sourcing targets',()=>{
    const deodorizer=footCareBenchmarks[2]
    expect(deodorizer.ingredients.filter(ingredient=>['Octenidine HCl','Butane','Propane'].includes(ingredient.inci)).every(ingredient=>ingredient.sourcingPriority==='compliance_review')).toBe(true)
    expect(footCareCoreSourcingTargets.join(' ')).not.toMatch(/Octenidine|Butane|Propane/)
  })

  it('preserves benchmark and function provenance for every sourcing target',()=>{
    const benchmarkIds=new Set(footCareBenchmarks.map(benchmark=>benchmark.id))
    expect(footCareSourcingTargets).toHaveLength(12)
    for(const target of footCareSourcingTargets){
      expect(target.benchmarkIds.length).toBeGreaterThan(0)
      expect(target.benchmarkIds.every(id=>benchmarkIds.has(id))).toBe(true)
      expect(target.benchmarkIngredientIncis.length).toBeGreaterThan(0)
      expect(target.functions.length).toBeGreaterThan(0)
      expect(target.requiredSpecifications.length).toBeGreaterThan(0)
    }
  })

  it('defines three independent persisted Foot Care concept inputs',()=>{
    expect(footCareProjectTemplates.map(project=>project.name)).toEqual(['Daily dry/rough foot care','Sweat-control antiperspirant','Foot + shoe deodorizer'])
    for(const project of footCareProjectTemplates){
      const input=createFootCareConceptInput(project.kind)
      expect(input).toMatchObject({name:project.name,productType:'foot_care',intentMode:'design',selectedIngredients:[]})
      expect(footCareConceptAnalysis({...input,id:'concept',createdAt:'',updatedAt:''})).toMatchObject({registryVersion:FOOT_CARE_REGISTRY_VERSION,projectKind:project.kind,benchmarkIds:project.benchmarkIds})
    }
  })
})
