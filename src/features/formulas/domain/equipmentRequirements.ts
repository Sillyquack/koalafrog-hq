import type { FormulaEquipmentRequirement } from '../../../types/domain'
import type { EquipmentCapability, EquipmentItem, EquipmentPolicy } from '../../procurement/domain/procurement'

export type EquipmentRequirementState = 'available' | 'unavailable' | 'missing' | 'unknown'

export interface EquipmentRequirementReadiness {
  requirement: FormulaEquipmentRequirement
  state: EquipmentRequirementState
  blocking: boolean
  matchedEquipmentIds: string[]
  candidateEquipmentIds: string[]
  explanation: string
}

const unitFamily:Record<string,string>={mg:'mass',g:'mass',kg:'mass',ml:'volume',l:'volume','°c':'temperature',c:'temperature'}
const unitFactor:Record<string,number>={mg:.001,g:1,kg:1000,ml:1,l:1000,'°c':1,c:1}
const normalizeUnit=(value:string|undefined|null)=>value?.trim().toLowerCase().replace('℃','°c')

function converted(value:number,from:string|null|undefined,to:string|null|undefined){
  const source=normalizeUnit(from),target=normalizeUnit(to)
  if(!source||!target)return source===target?value:undefined
  if(unitFamily[source]!==unitFamily[target])return undefined
  return value*unitFactor[source]/unitFactor[target]
}

const normalized=(value:string|null|undefined)=>value?.trim().toLowerCase().replace(/[\s-]+/g,'_')??''
const usable=(item:EquipmentItem)=>!item.archived_at&&item.ownership_state==='owned'&&['available','in_use'].includes(item.availability_state)&&!['out_of_service','retired','archived','maintenance_required','calibration_required'].includes(item.status)&&!['out_of_service','calibration_due'].includes(item.calibration_status)

function semanticMatch(requirement:FormulaEquipmentRequirement,item:EquipmentItem,capabilities:EquipmentCapability[]){
  const type=normalized(requirement.requiredEquipmentType)
  const itemType=normalized(item.equipment_type)
  const catalogMatch=!type||itemType===type||itemType.includes(type)||normalized(item.name).includes(type)
  const capabilityMatch=!requirement.requiredCapability||capabilities.some(capability=>capability.equipment_item_id===item.id&&normalized(capability.capability_type)===normalized(requirement.requiredCapability))
  return catalogMatch&&capabilityMatch
}

function constraintIssues(requirement:FormulaEquipmentRequirement,item:EquipmentItem){
  const issues:string[]=[]
  if(requirement.minimumCapacity!=null){
    const value=item.capacity_value??item.maximum_value
    const capacity=value==null?undefined:converted(value,item.capacity_unit,requirement.unit)
    if(capacity==null||capacity<requirement.minimumCapacity)issues.push(`capacity ${requirement.minimumCapacity} ${requirement.unit??''} or greater`)
  }
  if(requirement.requiredPrecision!=null){
    const precision=item.precision_value==null?undefined:converted(item.precision_value,item.precision_unit,requirement.unit)
    if(precision==null||precision>requirement.requiredPrecision)issues.push(`resolution ${requirement.requiredPrecision} ${requirement.unit??''} or better`)
  }
  if(requirement.minimumValue!=null){
    const minimum=item.minimum_value==null?undefined:converted(item.minimum_value,item.capacity_unit,requirement.unit)
    if(minimum==null||minimum>requirement.minimumValue)issues.push(`range reaching ${requirement.minimumValue} ${requirement.unit??''}`)
  }
  if(requirement.maximumValue!=null){
    const maximum=item.maximum_value==null?undefined:converted(item.maximum_value,item.capacity_unit,requirement.unit)
    if(maximum==null||maximum<requirement.maximumValue)issues.push(`range reaching ${requirement.maximumValue} ${requirement.unit??''}`)
  }
  if(requirement.requiredMaterial){
    const materials=requirement.requiredMaterial.split('|').map(normalized).filter(Boolean)
    const actual=normalized(item.material)
    if(!actual||!materials.some(material=>actual.includes(material)))issues.push(`material ${requirement.requiredMaterial.replaceAll('|',' or ')}`)
  }
  return issues
}

export function evaluateEquipmentRequirements(
  requirements:FormulaEquipmentRequirement[],
  equipment:EquipmentItem[]|undefined,
  capabilities:EquipmentCapability[]=[],
):EquipmentRequirementReadiness[]{
  return [...requirements].sort((left,right)=>left.sortOrder-right.sortOrder).map(requirement=>{
    if(!equipment)return{requirement,state:'unknown',blocking:requirement.requirementLevel==='required',matchedEquipmentIds:[],candidateEquipmentIds:[],explanation:'Owned Equipment could not be read from the active workspace.'}
    const candidates=equipment.filter(item=>semanticMatch(requirement,item,capabilities))
    const constrained=candidates.filter(item=>constraintIssues(requirement,item).length===0)
    const matches=constrained.filter(usable)
    const availableQuantity=matches.reduce((sum,item)=>sum+(item.quantity??1),0)
    const ready=availableQuantity>=requirement.quantityRequired
    const state:EquipmentRequirementState=ready?'available':candidates.length?'unavailable':'missing'
    const missingConstraints=candidates.flatMap(item=>constraintIssues(requirement,item)).filter((value,index,all)=>all.indexOf(value)===index)
    const explanation=ready
      ?`${availableQuantity} owned and available; ${requirement.quantityRequired} required.`
      :state==='missing'
        ?'No Equipment Catalog record matches this requirement.'
        :missingConstraints.length
          ?`Recorded candidates do not satisfy: ${missingConstraints.join(', ')}.`
          :'Matching records exist, but they are not both owned and operationally available.'
    return{requirement,state,blocking:requirement.requirementLevel==='required'&&!ready,matchedEquipmentIds:matches.map(item=>item.id),candidateEquipmentIds:candidates.map(item=>item.id),explanation}
  })
}

export interface EquipmentChecklistItem {id:string;state:'ready'|'blocked'|'warning';label:string;detail:string;equipmentIds:string[]}

export function equipmentPreparationChecklist(readiness:EquipmentRequirementReadiness[],policies:EquipmentPolicy[]=[]):EquipmentChecklistItem[]{
  const rows=readiness.map(item=>({
    id:`requirement:${item.requirement.id}`,
    state:item.state==='available'?'ready' as const:item.blocking?'blocked' as const:'warning' as const,
    label:item.requirement.preparationInstructions||`Prepare ${item.requirement.requirementName}.`,
    detail:`${item.requirement.requirementName} · ${item.requirement.requirementLevel} · ${item.explanation}`,
    equipmentIds:item.matchedEquipmentIds,
  }))
  const cleaningIds=new Set<string>()
  for(const item of readiness)for(const id of item.matchedEquipmentIds)if(policies.some(policy=>policy.equipment_item_id===id&&policy.status==='active'&&policy.cleaning_required_before_use))cleaningIds.add(id)
  if(cleaningIds.size)rows.push({id:'policy:clean-before-use',state:'warning',label:'Complete and record required pre-use equipment cleaning.',detail:'One or more matched Equipment policies require cleaning before use.',equipmentIds:[...cleaningIds]})
  return rows
}

export const hasEquipmentBlockers=(readiness:EquipmentRequirementReadiness[])=>readiness.some(item=>item.blocking)
