import type{FormulaState,Ingredient,InventoryLot,InventoryMovement,LabObservation,PackagingComponent,PackagingInventoryLot,PackagingInventoryMovement,ProductStudioSelection,SupplierProduct}from'../../../types/domain'
import{convertUnit,lotBalance}from'../../inventory/domain/inventoryLogic'
import{packagingLotBalance}from'../../packaging/domain/packagingLogic'
import type{EquipmentItem}from'../../procurement/domain/procurement'

export type FindingSeverity='information'|'recommendation'|'caution'|'blocking'
export interface RuleFinding{id:string;severity:FindingSeverity;title:string;explanation:string;evidence:string[];actions:string[]}
export interface IngredientFit{ingredient:Ingredient;role:string;range:[number,number];physicalState:'liquid'|'solid'|'powder'|'unknown';oilSoluble:boolean;richness:number;absorption:number;slip:number;gloss:number;oxidativeStability:number;nativeOdour:number;scentStrength:number;scentFamily?:string;note?:'top'|'heart'|'base';tags:string[];cautions:string[];provenance:'curated'|'partially_profiled'}
export interface ReadinessItem{id:string;name:string;available:number;required:number;state:'ready'|'low'|'missing';supplierProduct?:SupplierProduct;reason:string}

export const beardOilArchitecture={
 id:'beard-oil-v1',productType:'beard_oil',label:'Beard Oil',description:'An anhydrous liquid carrier system with optional sensory, antioxidant, functional and aromatic support.',
 roles:[
  {id:'liquid_base',label:'Liquid base / carrier system',required:true},
  {id:'supporting_carrier',label:'Supporting carrier oils',required:false},
  {id:'sensory_emollient',label:'Lightweight or sensory emollients',required:false},
  {id:'antioxidant',label:'Antioxidant support',required:false},
  {id:'oil_functional',label:'Oil-soluble functional ingredients',required:false},
  {id:'fragrance',label:'Fragrance or essential-oil system',required:false},
  {id:'other',label:'Other justified oil-compatible additions',required:false},
 ],
 equipment:[
  {type:'scale',label:'Precision scale',level:'required' as const},
  {type:'mixing_vessel',label:'Mixing vessel',level:'required' as const},
  {type:'transfer',label:'Transfer tools or pipettes',level:'recommended' as const},
 ],
 procedure:[
  'Prepare a clean, identified workspace and review recorded cautions.',
  'Confirm the exact Draft Formula Version, batch size and usable lots.',
  'Weigh the liquid carrier system from largest to smallest quantity.',
  'Mix gently until visually uniform; avoid unnecessary aeration.',
  'Add antioxidant and other minor oil-soluble additions.',
  'Add the scent system last and record actual quantities.',
  'Fill suitable liquid packaging and apply temporary batch identification.',
  'Record yield, appearance, odour, texture and application feel.',
  'Store the retained sample under the chosen test conditions.',
  'Clean equipment and schedule follow-up evaluation checkpoints.',
 ],
} as const

export const beardOilProperties=['Lightweight','Rich','Fast absorbing','Slow absorbing','Low gloss','Natural gloss','Dry finish','Silky slip','Nourishing','Softening','Beard control','Sensitive-skin conscious','Neutral base odour','High oxidative stability','Premium sensory feel','Minimal ingredient count'] as const
export const scentDirections=['Scent-free','Woody','Fresh','Green','Citrus','Spicy','Warm','Dark','Smoky','Leather-inspired','Resinous','Clean','Aromatic'] as const

const normalized=(ingredient:Ingredient)=>`${ingredient.commonName} ${ingredient.inciName} ${ingredient.category} ${ingredient.functions.join(' ')}`.toLowerCase()
export function profileIngredient(ingredient:Ingredient):IngredientFit{
 const name=normalized(ingredient),scent=/essential|fragrance|parfum|scent/.test(name),solid=/wax|butter|starch|powder/.test(name)
 const castor=/castor|ricinus/.test(name),squalane=/squalane|caprylic|triglyceride/.test(name),jojoba=/jojoba|simmondsia/.test(name),antioxidant=/tocopher|antioxidant/.test(name)
 const water=/water|aqua|hydrosol/.test(name),powder=/starch|powder/.test(name),wax=/wax|cera alba/.test(name),butter=/butter/.test(name)
 const role=scent?'fragrance':antioxidant?'antioxidant':squalane?'sensory_emollient':castor?'supporting_carrier':solid?'other':'liquid_base'
 return{ingredient,role,range:scent?[0,2]:antioxidant?[0.1,1]:castor?[2,20]:squalane?[10,60]:solid?[0,3]:[20,100],physicalState:powder?'powder':solid?'solid':'liquid',oilSoluble:!water&&!powder,richness:castor||butter||wax?5:squalane?1:jojoba?3:2,absorption:squalane?5:castor?1:jojoba?3:3,slip:squalane?5:castor?4:3,gloss:castor?5:squalane?2:3,oxidativeStability:jojoba||squalane?5:antioxidant?4:/hemp|flax|rosehip/.test(name)?1:3,nativeOdour:scent?5:/unrefined|neem/.test(name)?4:1,scentStrength:scent?5:0,scentFamily:/cedar|wood/.test(name)?'Woody':/bergamot|citrus/.test(name)?'Citrus':/cardamom|spice/.test(name)?'Spicy':undefined,note:/bergamot|citrus/.test(name)?'top':/cardamom/.test(name)?'heart':scent?'base':undefined,tags:[squalane?'lightweight':'',jojoba?'balanced':'',castor?'control':'',antioxidant?'oxidative-support':''].filter(Boolean),cautions:[solid?'Normally inappropriate in a liquid Beard Oil.':'',water?'Not compatible with a simple anhydrous oil system.':'',scent?'Strong aromatic material; product-specific review is needed.':'',/hemp|flax|rosehip/.test(name)?'Oxidation-sensitive material.':''].filter(Boolean),provenance:name.includes('jojoba')||squalane||castor||antioxidant||scent?'curated':'partially_profiled'}
}

export function availableIngredientQuantity(ingredientId:string,lots:InventoryLot[],movements:InventoryMovement[],today=new Date().toISOString().slice(0,10),targetUnit?:Ingredient['defaultUnit']){
 return lots.filter(lot=>lot.ingredientId===ingredientId&&lot.status==='Active'&&(!lot.expiryDate||lot.expiryDate>=today)&&(!lot.bestBeforeDate||lot.bestBeforeDate>=today)).reduce((sum,lot)=>{const balance=Math.max(0,lotBalance(lot,movements));if(!targetUnit)return sum+balance;try{return sum+convertUnit(balance,lot.unit,targetUnit)}catch{return sum}},0)
}

export function rankIngredients(ingredients:Ingredient[],goals:string[]){
 return ingredients.map(ingredient=>{const fit=profileIngredient(ingredient),reasons:string[]=[];let score=0
  const selected=goals.map(x=>x.toLowerCase())
  if(selected.some(x=>x.includes('light')||x.includes('fast')||x.includes('dry'))&&fit.absorption>=4){score+=3;reasons.push('supports a lighter, quicker-feeling direction')}
  if(selected.some(x=>x.includes('rich')||x.includes('control'))&&fit.richness>=4){score+=3;reasons.push('adds body or controlled glide')}
  if(selected.some(x=>x.includes('slip')||x.includes('premium'))&&fit.slip>=4){score+=2;reasons.push('contributes strong slip')}
  if(selected.some(x=>x.includes('oxidative'))&&fit.oxidativeStability>=4){score+=2;reasons.push('has a comparatively robust curated stability profile')}
  if(selected.some(x=>x.includes('neutral'))&&fit.nativeOdour<=1){score+=2;reasons.push('has low expected native odour interference')}
  if(fit.physicalState!=='liquid'||!fit.oilSoluble)score-=5
  return{fit,score,reasons:reasons.length?reasons:['general architecture fit; profile needs further research']}
 }).sort((a,b)=>b.score-a.score||a.fit.ingredient.commonName.localeCompare(b.fit.ingredient.commonName))
}

export function analyzeCombination(selections:ProductStudioSelection[],ingredients:Ingredient[]):RuleFinding[]{
 const fits=selections.map(selection=>profileIngredient(ingredients.find(item=>item.id===selection.ingredientId)!)).filter(Boolean),findings:RuleFinding[]=[]
 if(!fits.some(fit=>fit.role==='liquid_base'||fit.role==='sensory_emollient'))findings.push({id:'bo.missing-liquid-base',severity:'blocking',title:'No valid liquid base selected',explanation:'A Beard Oil needs at least one liquid, oil-compatible carrier or sensory emollient.',evidence:fits.map(f=>f.ingredient.commonName),actions:['Add a liquid carrier','Review ranked base ingredients']})
 const solids=fits.filter(fit=>fit.physicalState!=='liquid'||!fit.oilSoluble);if(solids.length)findings.push({id:'bo.solid-or-incompatible',severity:'blocking',title:'Selection moves away from a liquid oil',explanation:`${solids.map(f=>f.ingredient.commonName).join(' and ')} ${solids.length===1?'is':'are'} solid, powder-like, water-based or otherwise incompatible with a simple anhydrous liquid architecture.`,evidence:solids.map(f=>`${f.ingredient.commonName}: ${f.physicalState}`),actions:['Remove ingredient','Replace with a liquid oil-compatible alternative','Continue as a future balm or butter concept']})
 const heavy=fits.filter(f=>f.richness>=4);if(heavy.length>=2)findings.push({id:'bo.heavy-system',severity:'caution',title:'Several rich materials may feel heavy',explanation:'Multiple high-richness materials can increase drag, tack or greasiness in a leave-on beard oil.',evidence:heavy.map(f=>f.ingredient.commonName),actions:['Keep one as a supporting oil','Add a lightweight emollient','Continue and verify physically']})
 const fragile=fits.filter(f=>f.oxidativeStability<=1);if(fragile.length>=2)findings.push({id:'bo.oxidation-load',severity:'caution',title:'Oxidation-sensitive combination',explanation:'The concept relies on several ingredients with comparatively low curated oxidative-stability profiles.',evidence:fragile.map(f=>f.ingredient.commonName),actions:['Reduce dependence','Add a more robust base','Plan stability observation']})
 const aromatics=fits.filter(f=>f.scentStrength>=4);if(aromatics.length>2)findings.push({id:'bo.aromatic-density',severity:'recommendation',title:'Aromatic system may become dense',explanation:'Several strong aromatic materials may dominate the carrier system or need a clearer top, heart and base structure.',evidence:aromatics.map(f=>`${f.ingredient.commonName}: ${f.note??'position needs research'}`),actions:['Remove one aromatic','Add a bridge','Choose Scent-free']})
 if(!findings.length)findings.push({id:'bo.architecture-fit',severity:'information',title:'Selection fits the basic Beard Oil architecture',explanation:'The chosen materials form a liquid oil-compatible system under the current curated profiles.',evidence:fits.map(f=>f.ingredient.commonName),actions:['Review predicted profile','Compare with inventory','Create an editable Draft']})
 return findings
}

export function predictedProfile(selections:ProductStudioSelection[],ingredients:Ingredient[]){
 const fits=selections.map(x=>ingredients.find(i=>i.id===x.ingredientId)).filter(Boolean).map(x=>profileIngredient(x!)),average=(field:keyof Pick<IngredientFit,'richness'|'absorption'|'slip'|'gloss'|'oxidativeStability'|'nativeOdour'>)=>fits.length?fits.reduce((s,f)=>s+f[field],0)/fits.length:0
 const richness=average('richness'),absorption=average('absorption'),gloss=average('gloss'),odour=average('nativeOdour'),stability=average('oxidativeStability'),aromatics=fits.filter(f=>f.scentStrength>0)
 return{label:'PREDICTED PROFILE',richness:richness<2?'Light':richness<3.5?'Light to medium':'Rich',absorption:absorption>3.5?'Likely relatively quick':absorption>2?'Moderate':'Likely slow',greasiness:richness>3.5&&absorption<2.5?'Elevated':'Low to moderate',slip:average('slip')>3.5?'Silky':'Moderate',spreadability:average('slip')>3?'Easy spreading':'Controlled',gloss:gloss>3.5?'Natural to high':gloss>2?'Moderate natural':'Low',beardControl:richness>3.2?'Moderate':'Light',baseOdour:odour>2?'Noticeable interference possible':'Low expected interference',oxidativeRobustness:stability>3.5?'Comparatively robust':stability>2?'Moderate':'Needs stability attention',scentIntensity:aromatics.length>2?'Potentially strong':aromatics.length?'Present':'Scent-free',scentDirection:[...new Set(aromatics.map(x=>x.scentFamily).filter(Boolean))].join(' · ')||'None',liquidStability:fits.some(f=>f.physicalState!=='liquid'||!f.oilSoluble)?'Not expected to remain a simple uniform liquid':'Expected liquid at room temperature; physical testing required',complexity:fits.length<=3?'Minimal':fits.length<=6?'Moderate':'Complex',explanation:'Based on curated Ingredient properties and deterministic formulation rules. Physical testing is still required.'}
}

export function formulaStartingPoint(selections:ProductStudioSelection[],ingredients:Ingredient[],variant:'lightweight'|'balanced'|'richer'='balanced'){
 const fits=selections.map(s=>({selection:s,fit:profileIngredient(ingredients.find(i=>i.id===s.ingredientId)!)})).filter(x=>x.fit),minor=fits.filter(x=>['antioxidant','fragrance','oil_functional'].includes(x.fit.role)),major=fits.filter(x=>!minor.includes(x))
 const minorLines=minor.map(x=>({...x,percentage:x.fit.role==='antioxidant'?Math.min(1,x.fit.range[1]):Math.min(1.5,x.fit.range[1])})),remaining=100-minorLines.reduce((s,x)=>s+x.percentage,0)
 const weights=major.map(x=>variant==='lightweight'?(6-x.fit.richness):variant==='richer'?x.fit.richness:Math.max(1,4-Math.abs(3-x.fit.richness))),weightTotal=weights.reduce((s,x)=>s+x,0)||1
 const lines=[...major.map((x,index)=>({...x,percentage:remaining*weights[index]/weightTotal})),...minorLines].map((x,index,array)=>({ingredientId:x.fit.ingredient.id,role:x.fit.role,phase:x.fit.role==='fragrance'?'Final additions':'Main blend',percentage:index===array.length-1?0:Number(x.percentage.toFixed(2)),explanation:`${x.fit.role.replaceAll('_',' ')}; curated starting range ${x.fit.range[0]}–${x.fit.range[1]}%.`}))
 lines[lines.length-1].percentage=Number((100-lines.slice(0,-1).reduce((s,x)=>s+x.percentage,0)).toFixed(2))
 return{variant,lines,total:Number(lines.reduce((s,x)=>s+x.percentage,0).toFixed(2)),warnings:lines.filter(line=>{const fit=profileIngredient(ingredients.find(i=>i.id===line.ingredientId)!);return line.percentage<fit.range[0]||line.percentage>fit.range[1]}).map(line=>`${ingredients.find(i=>i.id===line.ingredientId)?.commonName} needs expert review against its curated range.`)}
}

export function inventoryReadiness(selections:ProductStudioSelection[],state:Pick<FormulaState,'ingredients'|'inventoryLots'|'inventoryMovements'|'supplierProducts'>,batchSize=30,today=new Date().toISOString().slice(0,10)):ReadinessItem[]{
 const formula=formulaStartingPoint(selections,state.ingredients),preferred=(id:string)=>state.supplierProducts.find(p=>p.ingredientId===id&&p.isPreferred)??state.supplierProducts.find(p=>p.ingredientId===id)
 return formula.lines.map(line=>{const ingredient=state.ingredients.find(i=>i.id===line.ingredientId)!,available=availableIngredientQuantity(line.ingredientId,state.inventoryLots,state.inventoryMovements,today,ingredient.defaultUnit),required=batchSize*line.percentage/100;return{id:line.ingredientId,name:ingredient.commonName,available,required,state:available<=0?'missing':available<required?'low':'ready',supplierProduct:preferred(line.ingredientId),reason:available<=0?'No usable Inventory Lot recorded.':available<required?'Usable stock is below this batch requirement.':'Usable Inventory Lots cover this starting batch.'}})
}

export function substituteSuggestions(missingId:string,ingredients:Ingredient[],lots:InventoryLot[],movements:InventoryMovement[]){
 const source=profileIngredient(ingredients.find(i=>i.id===missingId)!),carrierRoles=['liquid_base','supporting_carrier','sensory_emollient'],compatible=(role:string)=>role===source.role||(carrierRoles.includes(role)&&carrierRoles.includes(source.role)),candidates=ingredients.filter(i=>i.id!==missingId).map(profileIngredient).filter(f=>compatible(f.role)&&availableIngredientQuantity(f.ingredient.id,lots,movements)>0).sort((a,b)=>Math.abs(a.richness-source.richness)-Math.abs(b.richness-source.richness))
 return candidates.slice(0,3).map(f=>({ingredientId:f.ingredient.id,name:f.ingredient.commonName,explanation:`Same ${source.role.replaceAll('_',' ')} role with stocked material; sensory equivalence is predicted, not verified.`}))
}

export function equipmentReadiness(items:EquipmentItem[]){return beardOilArchitecture.equipment.map(requirement=>{const matches=items.filter(item=>!item.archived_at&&item.status==='available'&&(item.equipment_type.includes(requirement.type)||item.name.toLowerCase().includes(requirement.label.split(' ')[0].toLowerCase())));return{...requirement,state:matches.length?'ready' as const:'missing' as const,matches:matches.map(item=>item.id),explanation:matches.length?'Recorded available equipment matches this operational requirement.':'No available owned Equipment record matches; reference knowledge is not ownership.'}})}
export function packagingReadiness(components:PackagingComponent[],lots:PackagingInventoryLot[],movements:PackagingInventoryMovement[]){const suitable=components.filter(c=>c.status==='Active'&&(/bottle/i.test(c.category)||/bottle/i.test(c.name))&&(!c.capacityUnit||['ml','L'].includes(c.capacityUnit))),available=suitable.reduce((sum,c)=>sum+lots.filter(l=>l.packagingComponentId===c.id&&l.status==='Active').reduce((s,l)=>s+Math.max(0,packagingLotBalance(l,movements)),0),0);return{state:available>0?'ready' as const:'missing' as const,available,componentIds:suitable.map(c=>c.id),explanation:available>0?'Suitable liquid packaging is recorded in Packaging Inventory.':'No suitable bottle stock is recorded; a Packaging Component or Supplier Product alone is not physical stock.'}}
export function maximumBatchSize(readiness:ReadinessItem[]){const ratios=readiness.filter(x=>x.required>0).map(x=>x.available/x.required);return ratios.length?Math.max(0,Math.floor(Math.min(...ratios)*30)):0}
export function missingItemPlan(readiness:ReadinessItem[],equipment:ReturnType<typeof equipmentReadiness>,packaging:ReturnType<typeof packagingReadiness>){return{ingredients:readiness.filter(x=>x.state!=='ready').map(x=>({id:x.id,name:x.name,state:x.supplierProduct?'recorded_supplier_product':'research_needed',supplierProductId:x.supplierProduct?.id,reason:x.reason})),equipment:equipment.filter(x=>x.state==='missing').map(x=>({name:x.label,reason:x.explanation})),packaging:packaging.state==='missing'?[{name:'Suitable liquid bottle',reason:packaging.explanation}]:[],documentation:['Review supplier specification, SDS, CoA, allergens and applicable fragrance documentation before later controlled stages.']}}
export function observedProfile(observations:LabObservation[]){const recorded=observations.filter(x=>x.observedAt);return{label:'OBSERVED',available:recorded.length>0,summary:recorded.length?recorded.map(x=>[x.texture,x.scent,x.appearance].filter(Boolean).join(' · ')).filter(Boolean):['No linked physical observation recorded yet.'],evidenceIds:recorded.map(x=>x.id)}}
