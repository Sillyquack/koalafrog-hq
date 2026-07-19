import type{Ingredient,IngredientKnowledgeCompatibility,IngredientKnowledgeEvidence,IngredientKnowledgeIdentity,IngredientKnowledgePhysicalProperties,IngredientKnowledgePredictionInputs,IngredientKnowledgeProfile,IngredientKnowledgeRole,IngredientKnowledgeSensory,KnowledgeConfidence,KnowledgeState,KnowledgeValue,MeasuredKnowledgeValue,PredictionInputName,SensoryDimension}from'../../../types/domain'

export type IngredientKnowledgeAggregate={profile:IngredientKnowledgeProfile;roles:IngredientKnowledgeRole[];compatibility:IngredientKnowledgeCompatibility[];evidence:IngredientKnowledgeEvidence[]}

export const knowledgeStates:KnowledgeState[]=['known','unknown','not_applicable','review_required']
export const sensoryDimensions:SensoryDimension[]=['slip','drag','grip','greasy_feel','powder_feel','gloss','dryness','richness','spreadability','absorption','occlusion','film_forming','payoff','tackiness','residue']
export const predictionInputNames:PredictionInputName[]=['hardness_contribution','slip_contribution','gloss_contribution','powder_contribution','cooling_contribution','payoff_contribution','residue_contribution','oxidation_contribution','drag_contribution','structure_contribution']
export const knowledgeConfidences:KnowledgeConfidence[]=['verified','supported','observed','assumed','unknown','conflicting']
export const measuredPhysicalPropertyNames=['density','meltingRange','softeningRange','flashPoint']as const
export const unknownValue=<T>():KnowledgeValue<T>=>({state:'unknown',confidence:'unknown'})
const unknownMeasured=():MeasuredKnowledgeValue=>unknownValue<number>()
export function createEmptyIngredientKnowledgeProfile(ingredientId:string,now=new Date().toISOString()):IngredientKnowledgeProfile{
 const identity=Object.fromEntries(['commercialName','inci','casNumber','ecNumber','botanicalSource','plantPart','extractionMethod','processingStatus','origin','supplier','supplierSku','supplierProductRevision','documentRevision','documentationStatus','veganStatus','organicStatus','cosmosStatus','rspoStatus'].map(key=>[key,unknownValue()]))as unknown as IngredientKnowledgeIdentity
 const physicalProperties={physicalForm:unknownValue(),density:unknownMeasured(),meltingRange:unknownMeasured(),softeningRange:unknownMeasured(),flashPoint:unknownMeasured(),heatSensitivity:unknownValue(),oxidationSensitivity:unknownValue(),volatility:unknownValue(),waterSolubility:unknownValue(),oilSolubility:unknownValue(),alcoholSolubility:unknownValue(),colour:unknownValue(),odour:unknownValue(),particleForm:unknownValue(),hygroscopicity:unknownValue()}as IngredientKnowledgePhysicalProperties
 const sensoryProfile=Object.fromEntries(sensoryDimensions.map(key=>[key,unknownValue<number>()]))as IngredientKnowledgeSensory
 const predictionInputs=Object.fromEntries(predictionInputNames.map(key=>[key,unknownValue<number>()]))as IngredientKnowledgePredictionInputs
 return{id:crypto.randomUUID(),ingredientId,identity,physicalProperties,sensoryProfile,predictionInputs,createdAt:now,updatedAt:now}
}
export function clearIncompatibleKnowledgeValue<T>(field:KnowledgeValue<T>,state:KnowledgeState):KnowledgeValue<T>{return state==='known'?{...field,state}:{state,confidence:field.confidence,notes:field.notes}}
export function validateKnowledgeValue(field:KnowledgeValue<unknown>){const errors:string[]=[];if(field.state==='known'&&(field.value===undefined||field.value===null||field.value===''))errors.push('Known fields require a value.');if(field.state!=='known'&&field.value!==undefined)errors.push(`${field.state.replaceAll('_',' ')} fields cannot retain a value.`);return errors}
export function validateMeasuredValue(field:MeasuredKnowledgeValue){const errors=validateKnowledgeValue(field);if(field.state==='known'){if(!Number.isFinite(field.value))errors.push('Known measured values require a finite numeric value.');if(!field.unit?.trim())errors.push('Known measured values require a unit.');if(field.lowerBound!=null&&!Number.isFinite(field.lowerBound))errors.push('Lower bound must be finite.');if(field.upperBound!=null&&!Number.isFinite(field.upperBound))errors.push('Upper bound must be finite.');if(field.value==null&&field.lowerBound==null&&field.upperBound==null)errors.push('A known measurement requires a value or range.')}else if(field.unit!=null||field.lowerBound!=null||field.upperBound!=null)errors.push(`${field.state.replaceAll('_',' ')} measurements cannot retain units or bounds.`);if(field.lowerBound!=null&&field.upperBound!=null&&field.lowerBound>field.upperBound)errors.push('Lower bound cannot exceed upper bound.');return[...new Set(errors)]}
export function validateSensoryValue(field:KnowledgeValue<number>){const errors=validateKnowledgeValue(field);if(field.state==='known'&&(!Number.isFinite(field.value)||field.value!<0||field.value!>10))errors.push('Known sensory values must be between 0 and 10.');if(field.state==='known'&&!field.sourceReference?.trim()&&!field.notes?.trim())errors.push('Known sensory values require a source reference or contextual note.');return errors}
export function validateIngredientKnowledgeAggregate(input:{profile:IngredientKnowledgeProfile;roles:IngredientKnowledgeRole[];compatibility:IngredientKnowledgeCompatibility[];evidence:IngredientKnowledgeEvidence[]},ingredientIds:string[]=[]){const errors:string[]=[];for(const [key,value]of Object.entries(input.profile.identity))errors.push(...validateKnowledgeValue(value).map(error=>`${key}: ${error}`));for(const[key,value]of Object.entries(input.profile.physicalProperties))errors.push(...((measuredPhysicalPropertyNames as readonly string[]).includes(key)?validateMeasuredValue(value as MeasuredKnowledgeValue):validateKnowledgeValue(value)).map(error=>`${key}: ${error}`));for(const[key,value]of Object.entries(input.profile.sensoryProfile))errors.push(...validateSensoryValue(value).map(error=>`${key}: ${error}`));for(const[key,value]of Object.entries(input.profile.predictionInputs))errors.push(...validateKnowledgeValue(value).map(error=>`${key}: ${error}`));const ids=new Set<string>(),evidenceIds=new Set(input.evidence.map(item=>item.id)),roleKeys=new Set<string>(),compatibilityKeys=new Set<string>();for(const record of[...input.roles,...input.compatibility,...input.evidence]){if(ids.has(record.id))errors.push(`Duplicate relation id ${record.id}.`);ids.add(record.id);if(record.ingredientKnowledgeProfileId!==input.profile.id)errors.push(`Relation ${record.id} belongs to another profile.`)}for(const role of input.roles){const key=`${role.role}|${role.level}|${role.context.trim()}`;if(roleKeys.has(key))errors.push(`Duplicate role ${role.role}, ${role.level}, and context.`);roleKeys.add(key);if(!role.context.trim())errors.push(`Role ${role.role} requires context.`);if(role.evidenceIds.some(id=>!evidenceIds.has(id)))errors.push(`Role ${role.role} references unavailable evidence.`);if(['assumed','unknown','conflicting'].includes(role.confidence)&&role.level==='primary')errors.push(`Primary role ${role.role} requires observed, supported, or verified confidence.`)}for(const relation of input.compatibility){const key=`${relation.targetType}|${relation.targetId??''}|${relation.targetLabel.trim()}|${relation.context.trim()}`;if(compatibilityKeys.has(key))errors.push(`Duplicate compatibility relationship ${relation.targetLabel||relation.targetId}.`);compatibilityKeys.add(key);if(!relation.targetLabel.trim())errors.push('Compatibility target label is required.');if(relation.evidenceIds.some(id=>!evidenceIds.has(id)))errors.push(`Compatibility ${relation.targetLabel||relation.id} references unavailable evidence.`);if(relation.targetType==='ingredient'){if(!relation.targetId)errors.push('Ingredient compatibility requires a canonical target id.');if(relation.targetId===input.profile.ingredientId)errors.push('An ingredient cannot be compatible with itself.');if(relation.targetId&&ingredientIds.length&&!ingredientIds.includes(relation.targetId))errors.push('Compatibility target ingredient does not exist.')}}for(const item of input.evidence){if(!item.title.trim())errors.push('Evidence title is required.');if(item.evidenceDate&&Number.isNaN(Date.parse(`${item.evidenceDate}T00:00:00Z`)))errors.push(`Evidence ${item.title||item.id} has an invalid date.`);if(item.externalUrl&&!/^https?:\/\//i.test(item.externalUrl))errors.push(`Evidence ${item.title||item.id} has an unsupported URL scheme.`);if(item.documentId&&(/^(file:|\/|~\/|[A-Za-z]:\\)/.test(item.documentId)))errors.push(`Evidence ${item.title||item.id} cannot expose a private storage path.`)}return[...new Set(errors)]}
export function knowledgeCompleteness(profile:IngredientKnowledgeProfile|undefined){if(!profile)return{known:0,total:0,percentage:0,reviewRequired:0};const fields=[...Object.values(profile.identity),...Object.values(profile.physicalProperties),...Object.values(profile.sensoryProfile)];const complete=fields.filter(field=>field.state==='not_applicable'||(field.state==='known'&&field.confidence!=='unknown')).length;return{known:complete,total:fields.length,percentage:fields.length?Math.round(complete/fields.length*100):0,reviewRequired:fields.filter(field=>field.state==='review_required'||field.confidence==='conflicting').length}}
export function resolvedIngredientKnowledge(ingredient:Ingredient,profile:IngredientKnowledgeProfile|undefined,roles:IngredientKnowledgeRole[]){const physical=profile?.physicalProperties.physicalForm,supportedRoles=roles.filter(role=>role.ingredientKnowledgeProfileId===profile?.id&&['verified','supported','observed'].includes(role.confidence));return{physicalForm:physical?.state==='known'&&['verified','supported','observed'].includes(physical.confidence)?physical.value:'unknown',physicalFormConfidence:physical?.confidence??'assumed',roles:supportedRoles,evidenceState:profile?Object.values(profile.identity).some(field=>field.state==='known'&&['verified','supported'].includes(field.confidence))?'documented':'recorded':'fallback',reviewRequired:profile?[...Object.values(profile.identity),...Object.values(profile.physicalProperties)].some(field=>field.state==='review_required'||field.confidence==='conflicting')||roles.some(role=>role.ingredientKnowledgeProfileId===profile.id&&role.confidence==='conflicting'):false,fallback:!profile,legacyFunctions:profile?[]:ingredient.functions}}

const nonSemanticKeys=new Set(['createdAt','updatedAt','lastEditedSource'])
function normalizeSemanticValue(value:unknown,key=''):unknown{
 if(typeof value==='string')return value.trim()===''?undefined:value
 if(Array.isArray(value)){
  const normalized=value.map(item=>normalizeSemanticValue(item)).filter(item=>item!==undefined)
  if(key==='evidenceIds')return(normalized as string[]).sort()
  return normalized
 }
 if(value&&typeof value==='object'){
  const entries=Object.entries(value).filter(([entryKey])=>!nonSemanticKeys.has(entryKey)).map(([entryKey,item])=>[entryKey,normalizeSemanticValue(item,entryKey)]as const).filter(([,item])=>item!==undefined)
  return Object.fromEntries(entries.sort(([a],[b])=>a.localeCompare(b)))
 }
 return value
}
export function normalizeIngredientKnowledgeAggregate(input:IngredientKnowledgeAggregate){
 const collection=(items:unknown[])=>items.map(item=>normalizeSemanticValue(item)).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
 return{profile:normalizeSemanticValue(input.profile),roles:collection(input.roles),compatibility:collection(input.compatibility),evidence:collection(input.evidence)}
}
export function ingredientKnowledgeAggregatesEqual(left:IngredientKnowledgeAggregate,right:IngredientKnowledgeAggregate){return JSON.stringify(normalizeIngredientKnowledgeAggregate(left))===JSON.stringify(normalizeIngredientKnowledgeAggregate(right))}

const privateIdentifierPatterns=[
 /^file:/i,/^(?:\/|~\/)/,/^[a-z]:[\\/]/i,/^\\\\/,/^\/\/[^/]+\/[^/]+/,
 /(?:^|[\\/])(?:home|users|private|var|mnt|mount|volumes|workspace|app|srv|opt|tmp)(?:[\\/])/i,
 /(?:supabase|storage)[\\/](?:v1[\\/])?(?:object|buckets?)[\\/]/i,
 /^[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^/\s@]+@/i,
 /^[^/\s:@]+:[^/\s@]+@[^/\s]+/,/supabase[^/]*\/storage\/v1\/object/i,/\/storage\/v1\/object\/(?:authenticated|private)\//i,
]
export type DocumentIdentifierDisplay={kind:'empty'|'hidden'|'url'|'text';text:string;href?:string}
export function documentIdentifierDisplay(value:string|undefined):DocumentIdentifierDisplay{
 const candidate=value?.trim()
 if(!candidate)return{kind:'empty',text:''}
 if(privateIdentifierPatterns.some(pattern=>pattern.test(candidate)))return{kind:'hidden',text:'Legacy private path hidden'}
 if(/^https?:\/\//i.test(candidate)){
  try{const url=new URL(candidate);if(url.username||url.password)return{kind:'hidden',text:'Legacy private path hidden'};return{kind:'url',text:candidate,href:candidate}}catch{return{kind:'text',text:candidate}}
 }
 return{kind:'text',text:candidate}
}

export function safeIngredientKnowledgeError(cause:unknown){
 const raw=cause instanceof Error?cause.message:''
 if(/changed since it was opened|stale|revision|conflict/i.test(raw))return{kind:'stale_conflict' as const,message:'This Ingredient Knowledge record changed after you opened it. Your local changes remain visible; reload the latest data before retrying.'}
 if(!raw||/(sql|postgres|service.?role|stack|\/users\/|\\\\|file:|supabase)/i.test(raw))return{kind:'save_failed' as const,message:'Ingredient Knowledge could not be saved. Your changes remain here; try again after checking the connection.'}
 return{kind:'save_failed' as const,message:'Ingredient Knowledge could not be saved. Your changes remain here; try again.'}
}
