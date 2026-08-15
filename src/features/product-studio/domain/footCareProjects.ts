import type{ProductStudioConcept}from'../../../types/domain'
import{
  FOOT_CARE_REGISTRY_VERSION,
  footCareProjectTemplates,
  footCareSourcingTargetsFor,
  type FootCareBenchmarkKind,
  type FootCareFormulationSystem,
}from'./footCareBenchmarks'

export interface FootCareConceptAnalysis {
  schemaVersion:1
  registryVersion:string
  projectKind:FootCareBenchmarkKind
  benchmarkIds:string[]
  formulationSystems:FootCareFormulationSystem[]
}

export function footCareConceptAnalysis(concept:ProductStudioConcept|undefined):FootCareConceptAnalysis|undefined{
  const value=concept?.analysis.footCare
  if(!value||typeof value!=='object')return undefined
  const candidate=value as Partial<FootCareConceptAnalysis>
  return candidate.schemaVersion===1
    &&typeof candidate.registryVersion==='string'
    &&candidate.registryVersion.length>0
    &&Array.isArray(candidate.benchmarkIds)
    &&candidate.benchmarkIds.every(id=>typeof id==='string')
    &&Array.isArray(candidate.formulationSystems)
    &&candidate.formulationSystems.every(system=>typeof system==='string')
    &&footCareProjectTemplates.some(project=>project.kind===candidate.projectKind)
    ?candidate as FootCareConceptAnalysis
    :undefined
}

export function createFootCareConceptInput(kind:FootCareBenchmarkKind):Omit<ProductStudioConcept,'id'|'createdAt'|'updatedAt'>{
  const project=footCareProjectTemplates.find(candidate=>candidate.kind===kind)
  if(!project)throw new Error(`Unknown Foot Care project kind: ${kind}`)
  const targets=footCareSourcingTargetsFor(kind)
  return{
    name:project.name,
    productType:'foot_care',
    intentMode:'design',
    desiredProperties:[project.developmentIntent],
    selectedIngredients:[],
    scentDirections:[],
    candidateSubstitutes:Object.fromEntries(targets.map(target=>[target.id,[...target.acceptableSubstitutes]])),
    notes:'',
    analysis:{footCare:{schemaVersion:1,registryVersion:FOOT_CARE_REGISTRY_VERSION,projectKind:kind,benchmarkIds:[...project.benchmarkIds],formulationSystems:[...project.formulationSystems]}},
  }
}
