import type{FormulaLine,Ingredient,IngredientKnowledgeProfile,IngredientKnowledgeRole}from'../../../types/domain'
import{productTemplates,validateArchetypeComposition,type ArchetypeCompositionLine}from'./formulationEngine'
import{formulaPercentageTotal,orderedPhases}from'../../formulas/domain/multiPhaseLogic'

export const naturalDeodorantPhases=[...productTemplates.natural_deodorant.defaultPhases]
export const naturalDeodorantProcess=[...productTemplates.natural_deodorant.draftProcess]
export const deodorantRoles=['structuring_wax','soft_structurant','liquid_emollient','absorbent_powder','deodorant_active','slip_modifier','antioxidant','fragrance','preservative','other']as const
export type DeodorantRole=typeof deodorantRoles[number]
export type PhysicalForm='solid'|'liquid'|'powder'|'unknown'
export const deodorantEvaluationFields=['firmness','releaseBehavior','scoopability','glide','drag','payoff','spreadability','powderiness','residue','greasiness','dryDown','visibleWhitening','crumbling','cracking','sweatingOrOilBleed','shrinkageOrSinkhole','graininess','odourControlObservation','skinComfort','fragranceStrength','packagingCompatibility','warmTemperatureBehavior','coolTemperatureBehavior','appearance','overallResult']as const
export interface DeodorantVariant{id:string;name:string;changes:string[];evaluation?:Partial<Record<typeof deodorantEvaluationFields[number],number>>}

const text=(ingredient:Ingredient)=>`${ingredient.commonName} ${ingredient.inciName} ${ingredient.category} ${ingredient.functions.join(' ')}`.toLowerCase()
export function classifyDeodorantIngredient(ingredient:Ingredient,profile?:IngredientKnowledgeProfile,knowledgeRoles:IngredientKnowledgeRole[]=[]):{role:DeodorantRole;phase:string;physicalForm:PhysicalForm;guidance:string[]}{
 const formField=profile?.physicalProperties.physicalForm,knownForm=formField?.state==='known'&&['verified','supported','observed'].includes(formField.confidence)?formField.value:undefined,primaryRole=knowledgeRoles.find(item=>item.ingredientKnowledgeProfileId===profile?.id&&item.level==='primary'&&['verified','supported','observed'].includes(item.confidence))?.role
 if(knownForm||primaryRole){const physicalForm:PhysicalForm=knownForm==='powder'?'powder':knownForm==='liquid'?'liquid':['solid','semi_solid','wax','paste','granules'].includes(knownForm??'')?'solid':'unknown';const role=deodorantRoles.includes(primaryRole as DeodorantRole)?primaryRole as DeodorantRole:'other';return{role,phase:['fragrance','antioxidant','preservative'].includes(role)?'C':['absorbent_powder','deodorant_active'].includes(role)?'B':'A',physicalForm,guidance:['Ingredient Knowledge used as the structured source.']}}
 const value=text(ingredient),category=ingredient.category.trim().toLowerCase(),functions=ingredient.functions.map(item=>item.trim().toLowerCase()),fragrance=/\b(parfum|essential oil)\b/.test(value)||category==='fragrance'||functions.some(item=>item==='perfuming'||item==='fragrance material'),antioxidant=/\b(tocopherol|tocopheryl|antioxidant)\b/.test(value),bicarbonate=/\b(sodium bicarbonate|bicarbonate of soda|nahco3)\b/.test(value),magnesium=/\bmagnesium (hydroxide|carbonate)\b/.test(value),zinc=/\bzinc ricinoleate\b/.test(value),powder=category==='powder'||/\b(starch|arrowroot|tapioca|kaolin|sodium bicarbonate|magnesium hydroxide|magnesium carbonate|zinc ricinoleate)\b/.test(value),liquidWax=/\b(liquid wax ester|jojoba|simmondsia)\b/.test(value),wax=!liquidWax&&(category==='wax'||/\b(beeswax|candelilla wax|carnauba wax|cera alba)\b/.test(value)),butter=category==='butter'||/\b(shea butter|mango butter|cocoa butter)\b/.test(value),liquid=liquidWax||category==='carrier oil'||/\b(squalane|triglyceride|liquid oil)\b/.test(value)
 const role:DeodorantRole=fragrance?'fragrance':antioxidant?'antioxidant':bicarbonate||magnesium||zinc?'deodorant_active':powder?'absorbent_powder':wax?'structuring_wax':butter?'soft_structurant':liquid?'liquid_emollient':'other'
 const physicalForm:PhysicalForm=powder?'powder':wax||butter?'solid':liquid?'liquid':'unknown'
 const guidance=[physicalForm==='powder'?'Disperse as an insoluble material unless supported documentation establishes otherwise; dispersion method remains material-specific.':'',bicarbonate?'Bicarbonate may conflict with bicarbonate-free intent; irritation and suitability require review.':'',magnesium||zinc?'This metadata supports a deodorant-intent role only; it does not establish efficacy or regulatory status.':'',physicalForm==='unknown'?'Physical form is unsupported; review required.':''].filter(Boolean)
 return{role,phase:fragrance||antioxidant?'C':powder||bicarbonate||magnesium||zinc?'B':'A',physicalForm,guidance}
}
export function bicarbonateFreeGuidance(enabled:boolean,ingredients:Ingredient[]){if(!enabled)return[];return ingredients.some(item=>/bicarbonate|sodium bicarbonate/.test(text(item)))?['Bicarbonate-free intent conflicts with a selected bicarbonate material. Remove it or change the intent.']:['Bicarbonate-free is a development intent and does not imply hypoallergenic or irritation-free.']}
export function compareDeodorantVariants(variants:DeodorantVariant[]){return[...variants].sort((a,b)=>(b.evaluation?.overallResult??0)-(a.evaluation?.overallResult??0))}
export function validDeodorantScore(value:number){return Number.isFinite(value)&&value>=1&&value<=5}
export function rolePhysicalFormIssues(lines:Array<{ingredientId:string;role:string}>,ingredients:Ingredient[]){
 const issues:string[]=[]
 for(const line of lines){const ingredient=ingredients.find(item=>item.id===line.ingredientId);if(!ingredient){issues.push(`Ingredient ${line.ingredientId} is unavailable.`);continue}const form=classifyDeodorantIngredient(ingredient).physicalForm
  if(form==='powder'&&!['absorbent_powder','deodorant_active','other'].includes(line.role))issues.push(`${ingredient.commonName} is recorded as a powder and needs a dispersion-appropriate role.`)
  if(form==='liquid'&&['structuring_wax','soft_structurant','absorbent_powder'].includes(line.role))issues.push(`${ingredient.commonName} is recorded as a liquid and cannot use the ${line.role.replaceAll('_',' ')} role.`)
  if(form==='solid'&&['liquid_emollient','absorbent_powder'].includes(line.role))issues.push(`${ingredient.commonName} is recorded as a solid and cannot use the ${line.role.replaceAll('_',' ')} role.`)
 }
 return issues
}
export function evaluationFieldsForPackaging(intent:string){return deodorantEvaluationFields.filter(field=>intent==='Jar'?field!=='releaseBehavior':['Twist-up stick','Push-up tube'].includes(intent)?field!=='scoopability':true)}
export function naturalDeodorantCompatibility(packagingIntent:string,lines:Array<ArchetypeCompositionLine&{phase:string}>){
 const archetype=validateArchetypeComposition('solid_or_stick',packagingIntent,lines),blockingIssues=[...archetype.blockingIssues],reviewIssues=[...archetype.reviewIssues]
 if(!lines.some(line=>['deodorant_active','absorbent_powder'].includes(line.role)))blockingIssues.push('Natural Deodorant requires at least one supported deodorant-intent material; efficacy remains unverified.')
 if(!lines.some(line=>line.phase==='B'&&['deodorant_active','absorbent_powder'].includes(line.role)))blockingIssues.push('Phase B needs a supported powder or deodorant-intent material for this template.')
 for(const line of lines.filter(line=>line.role==='fragrance'&&line.percentage>0))blockingIssues.push(`${line.ingredientName} is assigned as fragrance at ${line.percentage}%. Supported supplier and safety documentation is required; the usage limit is unknown, so this Formula is not Lab-ready or Candidate-ready.`)
 return{compatible:blockingIssues.length===0,blockingIssues:[...new Set(blockingIssues)],reviewIssues:[...new Set(reviewIssues)]}
}
export function naturalDeodorantFormulaCompatibility(packagingIntent:string,lines:FormulaLine[],ingredients:Ingredient[],profiles:IngredientKnowledgeProfile[]=[],roles:IngredientKnowledgeRole[]=[]){return naturalDeodorantCompatibility(packagingIntent,lines.map(line=>{const ingredient=ingredients.find(item=>item.id===line.ingredientId),profile=profiles.find(item=>item.ingredientId===ingredient?.id),classification=ingredient&&classifyDeodorantIngredient(ingredient,profile,roles);return{ingredientName:ingredient?.commonName??line.ingredientId,percentage:line.percentage,role:line.formulationRole??roles.find(item=>item.ingredientKnowledgeProfileId===profile?.id&&item.level==='primary')?.role??'other',phase:line.phase,physicalForm:classification?.physicalForm??'unknown'}}))}
export{formulaPercentageTotal,orderedPhases}
