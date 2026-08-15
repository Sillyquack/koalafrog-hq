import {
  FOOT_CARE_REGISTRY_VERSION,
  footCareProjectTemplates,
  footCareSourcingTargetsFor,
  type FootCareBenchmarkKind,
  type FootCareSourcingTarget,
} from './footCareBenchmarks'

export const LIVE_RESEARCH_MAX_ITEMS=10

export interface FootCareProcurementTargetPayload {
  id:string
  name:string
  benchmarkIds:string[]
  benchmarkIngredientIncis:string[]
  functions:string[]
  requiredSpecifications:string[]
  acceptableSubstitutes:string[]
  preferredSupplierHint?:string
  notes:string
}
export interface FootCareProcurementGroupPayload {
  id:string
  label:string
  targets:FootCareProcurementTargetPayload[]
}

const prohibitedOrdinaryTargets=['octenidine','butane','propane','aerosol propellant']

export function splitFootCareSourcingTargets(
  targets:readonly FootCareSourcingTarget[],
  maximum=LIVE_RESEARCH_MAX_ITEMS,
){
  if(!Number.isInteger(maximum)||maximum<1||maximum>LIVE_RESEARCH_MAX_ITEMS){
    throw new Error(`Foot Care sourcing groups must contain between 1 and ${LIVE_RESEARCH_MAX_ITEMS} items.`)
  }
  return targets.reduce<FootCareSourcingTarget[][]>((groups,target,index)=>{
    const groupIndex=Math.floor(index/maximum)
    ;(groups[groupIndex]??=[]).push(target)
    return groups
  },[])
}

export function buildFootCareProcurementGroups(kind:FootCareBenchmarkKind):FootCareProcurementGroupPayload[]{
  const project=footCareProjectTemplates.find(candidate=>candidate.kind===kind)
  if(!project)throw new Error(`Unknown Foot Care project kind: ${kind}`)
  const targets=footCareSourcingTargetsFor(kind)
  if(!targets.length)throw new Error('The Foot Care registry contains no sourcing targets for this project.')
  if(targets.some(target=>prohibitedOrdinaryTargets.some(blocked=>`${target.id} ${target.name}`.toLowerCase().includes(blocked)))){
    throw new Error('Octenidine HCl and aerosol propellants require explicit Compliance and architecture review and cannot enter ordinary sourcing.')
  }
  return splitFootCareSourcingTargets(targets).map((group,index,groups)=>({
    id:`${kind}-${index+1}`,
    label:groups.length===1?project.name:`${project.name} · sourcing group ${index+1} of ${groups.length}`,
    targets:group.map(target=>({
      id:target.id,
      name:target.name,
      benchmarkIds:[...target.benchmarkIds],
      benchmarkIngredientIncis:[...target.benchmarkIngredientIncis],
      functions:[...target.functions],
      requiredSpecifications:[...target.requiredSpecifications],
      acceptableSubstitutes:[...target.acceptableSubstitutes],
      ...(target.preferredSupplierHint?{preferredSupplierHint:target.preferredSupplierHint}:{}),
      notes:[
        `Registry ${FOOT_CARE_REGISTRY_VERSION}.`,
        `Benchmark → function → sourcing target: ${target.benchmarkIds.join(', ')} → ${target.functions.join(', ')} → ${target.id}.`,
        target.preferredSupplierHint?`${target.preferredSupplierHint} is a preferred-supplier hint only, never a required supplier.`:'No supplier is selected or required by this handoff.',
        'Research candidates require owner review; no candidate, recommendation, order, purchase or inventory record is created by this handoff.',
      ].join(' '),
    })),
  }))
}
