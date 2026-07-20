import type { FormulaPhaseDefinition, FormulaProcessStep, ProductStudioType } from '../../../types/domain'

export type FormulationArchetypeId =
  | 'simple_liquid'
  | 'anhydrous_multiphase'
  | 'solid_or_stick'
  | 'emulsion'
  | 'water_based'
  | 'alcohol_based'
  | 'gel'
  | 'powder'

export type FormulationMaturity = 'operational' | 'planned'

export interface FormulationCapabilities {
  phases:boolean
  heating:boolean
  cooling:boolean
  aqueousPhase:boolean
  oilPhase:boolean
  emulsification:boolean
  coolDownAdditions:boolean
  powderDispersion:boolean
  controlledFilling:boolean
  setting:boolean
  structuredPhysicalTesting:boolean
}

export interface FormulationArchetype {
  id:FormulationArchetypeId
  displayName:string
  description:string
  maturity:FormulationMaturity
  capabilities:FormulationCapabilities
  defaultPhaseTemplates:readonly FormulaPhaseDefinition[]
  evaluationDimensions:readonly string[]
  knownLimitations:readonly string[]
  warnings:readonly string[]
}

export interface ProductTemplate {
  id:ProductStudioType
  displayName:string
  description:string
  archetypeId:FormulationArchetypeId
  route:string
  targetFields:readonly string[]
  evaluationDimensions:readonly string[]
  defaultPhases:readonly FormulaPhaseDefinition[]
  draftProcess:readonly FormulaProcessStep[]
  packagingIntent:string
  productCategory:string
  guidance:readonly string[]
}

export interface ArchetypeCompositionLine {
  ingredientName:string
  percentage:number
  role:string
  physicalForm:'solid'|'liquid'|'powder'|'unknown'
}

export interface ArchetypeCompositionResult {
  compatible:boolean
  blockingIssues:string[]
  reviewIssues:string[]
}

const noCapabilities:FormulationCapabilities={phases:false,heating:false,cooling:false,aqueousPhase:false,oilPhase:false,emulsification:false,coolDownAdditions:false,powderDispersion:false,controlledFilling:false,setting:false,structuredPhysicalTesting:false}

export const formulationArchetypes={
  simple_liquid:{id:'simple_liquid',displayName:'Simple liquid',description:'A single-system liquid formula prepared without a required thermal or emulsification process.',maturity:'operational',capabilities:{...noCapabilities,oilPhase:true,coolDownAdditions:true},defaultPhaseTemplates:[],evaluationDimensions:['appearance','application feel','absorption','greasiness','scent','stability'],knownLimitations:['Material compatibility and usage limits remain product- and supplier-specific.'],warnings:['A liquid appearance does not establish stability, safety, or regulatory suitability.']},
  anhydrous_multiphase:{id:'anhydrous_multiphase',displayName:'Anhydrous multi-phase',description:'An oil-phase system with explicit ordered phases and controlled heating or cooling steps.',maturity:'operational',capabilities:{...noCapabilities,phases:true,heating:true,cooling:true,oilPhase:true,coolDownAdditions:true},defaultPhaseTemplates:[],evaluationDimensions:['texture','graininess','separation','melt','spreadability','greasiness','stability'],knownLimitations:['Thermal limits must come from supported material information and physical trials.'],warnings:['Draft process structure is not validated manufacturing or safety guidance.']},
  solid_or_stick:{id:'solid_or_stick',displayName:'Solid or stick',description:'An anhydrous heated system structured for stick, bar, puck, or jar presentation.',maturity:'operational',capabilities:{...noCapabilities,phases:true,heating:true,cooling:true,oilPhase:true,coolDownAdditions:true,powderDispersion:true,controlledFilling:true,setting:true,structuredPhysicalTesting:true},defaultPhaseTemplates:[],evaluationDimensions:['firmness','release or scoopability','glide','drag','payoff','spreadability','powderiness','residue','greasiness','dry-down','visible whitening','crumbling','cracking','sweating or oil bleed','shrinkage or sinkhole','graininess','skin comfort','packaging compatibility','warm-temperature behavior','cool-temperature behavior','appearance','overall result'],knownLimitations:['Melting, addition, and filling limits remain supplier-, material-, formula-, and packaging-specific.','Physical observations do not establish efficacy, safety, stability, or compliance.'],warnings:['Draft process guidance requires supported supplier information and controlled physical trials.']},
  emulsion:{id:'emulsion',displayName:'Emulsion',description:'A combined aqueous and oil-phase system requiring an emulsification process.',maturity:'planned',capabilities:{...noCapabilities,phases:true,heating:true,cooling:true,aqueousPhase:true,oilPhase:true,emulsification:true,coolDownAdditions:true},defaultPhaseTemplates:[],evaluationDimensions:[],knownLimitations:['Preservation, emulsifier selection, stability, and microbiological controls are not implemented.'],warnings:['Not available as an operational Product Studio workflow.']},
  water_based:{id:'water_based',displayName:'Water-based',description:'An aqueous formulation system.',maturity:'planned',capabilities:{...noCapabilities,phases:true,aqueousPhase:true,coolDownAdditions:true},defaultPhaseTemplates:[],evaluationDimensions:[],knownLimitations:['Preservation and microbiological controls are not implemented.'],warnings:['Not available as an operational Product Studio workflow.']},
  alcohol_based:{id:'alcohol_based',displayName:'Alcohol-based',description:'A formulation whose primary carrier system is alcohol-based.',maturity:'planned',capabilities:{...noCapabilities,coolDownAdditions:true},defaultPhaseTemplates:[],evaluationDimensions:[],knownLimitations:['Alcohol handling, compatibility, and product rules are not implemented.'],warnings:['Not available as an operational Product Studio workflow.']},
  gel:{id:'gel',displayName:'Gel',description:'A structured liquid system formed through a gelling process.',maturity:'planned',capabilities:{...noCapabilities,phases:true,cooling:true,coolDownAdditions:true},defaultPhaseTemplates:[],evaluationDimensions:[],knownLimitations:['Gelling, hydration, preservation, and stability rules are not implemented.'],warnings:['Not available as an operational Product Studio workflow.']},
  powder:{id:'powder',displayName:'Powder',description:'A dry blended particulate system.',maturity:'planned',capabilities:{...noCapabilities,phases:true},defaultPhaseTemplates:[],evaluationDimensions:[],knownLimitations:['Particle handling, inhalation, blending, and uniformity controls are not implemented.'],warnings:['Not available as an operational Product Studio workflow.']},
} as const satisfies Record<FormulationArchetypeId,FormulationArchetype>

const beardButterPhases:readonly FormulaPhaseDefinition[]=[
  {code:'A',name:'Heat phase',order:1,instructions:'Butters, waxes and heat-stable oils. Confirm supplier-specific melting and heat limits before setting temperatures.'},
  {code:'B',name:'Cool-down phase',order:2,instructions:'Cool-down ingredients. Set an addition temperature only from supported material information.'},
  {code:'C',name:'Sensitive additions',order:3,instructions:'Fragrance, antioxidants and temperature-sensitive additions. Unknown heat limits remain unknown.'},
]

const beardButterProcess:readonly FormulaProcessStep[]=[
  {order:1,title:'Weigh Phase A',instruction:'Weigh Phase A materials separately and record actual weights.',phaseCode:'A',critical:true,completionCriteria:'All Phase A materials identified and weighed.'},
  {order:2,title:'Melt and combine',instruction:'Heat Phase A only as required by confirmed material information and mix until homogeneous; record the actual temperature.',phaseCode:'A',mixingMethod:'Stirring',mixingIntensity:'Gentle to moderate',critical:true,completionCriteria:'No visible solid wax or butter remains.'},
  {order:3,title:'Controlled cooling',instruction:'Remove from heat and cool while continuing controlled stirring.',phaseCode:'A',mixingMethod:'Stirring',mixingIntensity:'Gentle',critical:true,completionCriteria:'Batch reaches the Phase B addition range.'},
  {order:4,title:'Add Phase B',instruction:'Add Phase B below its confirmed material-specific limit and mix until uniform; record the actual temperature.',phaseCode:'B',mixingMethod:'Stirring',mixingIntensity:'Gentle',critical:true,completionCriteria:'Phase B is evenly incorporated.'},
  {order:5,title:'Add Phase C',instruction:'Add temperature-sensitive materials only within confirmed material-specific limits; record the actual temperature.',phaseCode:'C',mixingMethod:'Stirring',mixingIntensity:'Gentle',critical:true,completionCriteria:'Additions are uniformly dispersed.'},
  {order:6,title:'Finish texture',instruction:'Continue stirring or optionally whip according to the selected variant.',mixingMethod:'Stirring or whipping',mixingIntensity:'Record actual method',critical:false,completionCriteria:'Target visual texture is reached.'},
  {order:7,title:'Fill and set',instruction:'Fill suitable containers, record fill count, then cool and set without disturbance.',critical:true,completionCriteria:'Containers are filled and the batch is set aside for observation.'},
  {order:8,title:'Record final condition',instruction:'Record yield, appearance, texture, graininess, sweating and deviations.',critical:true,completionCriteria:'Initial physical observations are recorded.'},
]

const deodorantPhases:readonly FormulaPhaseDefinition[]=[
  {code:'A',name:'Structuring and melt phase',order:1,instructions:'Waxes, butters, solid structurants, and heat-stable liquid oils. Use only supplier-supported thermal conditions.'},
  {code:'B',name:'Powder dispersion',order:2,instructions:'Absorbent, deodorant-intent, and other insoluble powders. Treat these as dispersed materials, not dissolved ingredients.'},
  {code:'C',name:'Cool-down',order:3,instructions:'Antioxidants, optional fragrance, and heat-sensitive additions. Unknown addition limits remain unknown.'},
]

const deodorantProcess:readonly FormulaProcessStep[]=[
  {order:1,title:'Review the controlled source',instruction:'Review supplier documentation, the selected Formula Version, unknown limits, and the draft process before work begins.',critical:true,completionCriteria:'Source records and unresolved limits have been reviewed.'},
  {order:2,title:'Prepare equipment and packaging',instruction:'Prepare clean equipment and the selected stick, tube, jar, or other packaging; do not assume packaging stock.',critical:true,completionCriteria:'Equipment and packaging intent are identified.'},
  {order:3,title:'Weigh phases separately',instruction:'Weigh each phase separately and preserve phase identity.',critical:true,completionCriteria:'All planned materials are identified and weighed.'},
  {order:4,title:'Melt structuring materials',instruction:'Heat Phase A only using supplier-supported conditions and record actual temperature in Lab.',phaseCode:'A',mixingMethod:'Record actual method',mixingIntensity:'Record actual intensity',critical:true,completionCriteria:'Structuring materials are visually melted without using an assumed universal temperature.'},
  {order:5,title:'Combine Phase A',instruction:'Mix Phase A until visually homogeneous.',phaseCode:'A',mixingMethod:'Record actual method',mixingIntensity:'Record actual intensity',critical:true,completionCriteria:'Phase A appears visually homogeneous.'},
  {order:6,title:'Disperse powders',instruction:'Add Phase B gradually while mixing to limit clumps; powders remain dispersed rather than assumed dissolved.',phaseCode:'B',mixingMethod:'Record actual dispersion method',mixingIntensity:'Record actual intensity',critical:true,completionCriteria:'No obvious dry pockets or large clumps remain.'},
  {order:7,title:'Continue controlled mixing',instruction:'Continue mixing using the recorded method and intensity.',phaseCode:'B',mixingMethod:'Record actual method',mixingIntensity:'Record actual intensity',critical:false,completionCriteria:'Dispersion appears uniform enough to proceed to cooling.'},
  {order:8,title:'Begin controlled cooling',instruction:'Begin controlled cooling and record actual observations.',phaseCode:'B',critical:true,completionCriteria:'Batch is cooling without visible separation.'},
  {order:9,title:'Add cool-down materials',instruction:'Add Phase C only within documented supported conditions; fragrance is optional.',phaseCode:'C',mixingMethod:'Record actual method',mixingIntensity:'Gentle or supported method',critical:true,completionCriteria:'Cool-down additions appear uniformly incorporated.'},
  {order:10,title:'Fill selected packaging',instruction:'Fill the selected packaging and record actual packaging, method, and fill temperature if known.',phaseCode:'C',critical:true,completionCriteria:'Planned units are filled or any deviation is recorded.'},
  {order:11,title:'Record fill temperature',instruction:'Record fill temperature when measured; leave it unknown rather than estimating.',critical:false,completionCriteria:'Measured value or unknown state is recorded.'},
  {order:12,title:'Set and cool',instruction:'Allow the product to set under recorded conditions.',critical:true,completionCriteria:'Units have set sufficiently for initial inspection.'},
  {order:13,title:'Inspect physical condition',instruction:'Inspect surface, shrinkage, cracking, sweating, separation, texture, release, and packaging interaction.',critical:true,completionCriteria:'Initial physical defects and observations are recorded.'},
  {order:14,title:'Record yield and retained sample',instruction:'Record yield, fill count, retained sample, deviations, and final appearance.',critical:true,completionCriteria:'Lab record contains yield and initial retained-sample information.'},
]

export const productTemplates={
  beard_oil:{id:'beard_oil',displayName:'Beard Oil',description:'An anhydrous liquid carrier system with optional sensory, antioxidant, functional and aromatic support.',archetypeId:'simple_liquid',route:'/product-studio/beard-oil',targetFields:['wear','absorption','gloss','scent'],evaluationDimensions:['appearance','application feel','absorption','greasiness','scent','stability'],defaultPhases:[],draftProcess:[],packagingIntent:'Liquid-compatible bottle',productCategory:'Beard Care',guidance:['Physical testing is required before conclusions are treated as observed.']},
  beard_butter:{id:'beard_butter',displayName:'Beard Butter',description:'A heat-processed anhydrous butter with ordered phases and recorded process controls.',archetypeId:'anhydrous_multiphase',route:'/product-studio/beard-butter',targetFields:['texture','firmness','melt behavior','absorption feel','greasiness','scoopability','conditioning','skin feel','scent strength','packaging intent','climate considerations'],evaluationDimensions:['firmness','scoopability','graininess','oil separation or sweating','melt on contact','spreadability','absorption','greasiness','residue','beard softness','skin comfort','scent strength','appearance','stability observations','overall result'],defaultPhases:beardButterPhases,draftProcess:beardButterProcess,packagingIntent:'Wide-mouth jar',productCategory:'Beard Care',guidance:['Thermal limits remain unknown until supported by material information.','Draft process guidance requires physical testing and safety assessment.']},
  natural_deodorant:{id:'natural_deodorant',displayName:'Natural Deodorant',description:'A solid or stick development workflow supporting anhydrous systems and explicitly identified aqueous glycol soap-gel references without unsupported efficacy claims.',archetypeId:'solid_or_stick',route:'/product-studio/natural-deodorant',targetFields:['format','physical system','firmness','glide','payoff','spreadability','drag','residue','powderiness','greasiness','absorption feel','dry finish','odour-control intent','sensitive-skin positioning','bicarbonate-free intent','scent direction','climate behavior','stain-resistance intent','packaging intent'],evaluationDimensions:['firmness','push-up or release behavior','scoopability','glide','drag','payoff','spreadability','powderiness','residue','greasiness','dry-down','visible whitening','crumbling','cracking','sweating or oil bleed','shrinkage or sinkhole','graininess','odour-control observation','skin comfort','fragrance strength','packaging compatibility','warm-temperature behavior','cool-temperature behavior','appearance','overall result'],defaultPhases:deodorantPhases,draftProcess:deodorantProcess,packagingIntent:'Twist-up stick, push-up tube, jar, other, or unknown',productCategory:'Personal Care',guidance:['Physical system may be anhydrous solid/stick or an explicitly recorded aqueous glycol soap-gel reference.','Odour-control is development intent; observations are not proof of efficacy.','Bicarbonate-free intent does not imply hypoallergenic or irritation-free.','No universal melting, addition, filling temperature, or usage limit is assumed.']},
} as const satisfies Record<ProductStudioType,ProductTemplate>

export type RegistryResult<T>={ok:true;value:T}|{ok:false;error:string}

export function resolveArchetype(id:string):RegistryResult<FormulationArchetype>{
  const value=(formulationArchetypes as Record<string,FormulationArchetype|undefined>)[id]
  return value?{ok:true,value}:{ok:false,error:`Unknown formulation archetype: ${id}`}
}

export function resolveProductTemplate(id:string):RegistryResult<ProductTemplate>{
  const value=(productTemplates as Record<string,ProductTemplate|undefined>)[id]
  return value?{ok:true,value}:{ok:false,error:`Unknown Product Studio template: ${id}`}
}

export function resolveTemplateArchetype(id:string):RegistryResult<{template:ProductTemplate;archetype:FormulationArchetype}>{
  const template=resolveProductTemplate(id)
  if(!template.ok)return template
  const archetype=resolveArchetype(template.value.archetypeId)
  return archetype.ok?{ok:true,value:{template:template.value,archetype:archetype.value}}:archetype
}

export function validateArchetypeComposition(archetypeId:FormulationArchetypeId,packagingIntent:string,lines:ArchetypeCompositionLine[]):ArchetypeCompositionResult{
  if(archetypeId!=='solid_or_stick')return{compatible:true,blockingIssues:[],reviewIssues:[]}
  const supportedStructurant=lines.some(line=>line.physicalForm==='solid'&&['structuring_wax','soft_structurant'].includes(line.role))
  const blockingIssues:string[]=[]
  if(!supportedStructurant)blockingIssues.push(
    ['Twist-up stick','Push-up tube'].includes(packagingIntent)
      ?`${packagingIntent} intent requires a supported solid structuring material.`
      :'A solid or balm-like jar system requires at least one supported solid or semi-solid structuring material.'
  )
  const reviewIssues=lines.filter(line=>line.physicalForm==='unknown').map(line=>`${line.ingredientName}: physical form is unknown. Review supplier documentation.`)
  return{compatible:blockingIssues.length===0,blockingIssues,reviewIssues}
}
