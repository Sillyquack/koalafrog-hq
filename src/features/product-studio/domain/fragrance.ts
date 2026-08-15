import type{Ingredient,ProductStudioSelection}from'../../../types/domain'

export const fragranceDirections=['Dark leather','Warm woods','Dry spice','Amber','Smoky','Resinous','Fresh citrus','Aromatic','Green','Mineral','Clean musk'] as const
export const fragranceConcentrations=[{label:'Eau de Toilette',value:12},{label:'Eau de Parfum',value:18},{label:'Parfum / Extrait',value:25}] as const

const identity=(ingredient:Ingredient)=>`${ingredient.commonName} ${ingredient.inciName} ${ingredient.category} ${ingredient.functions.join(' ')}`.toLowerCase()

export function isFragranceMaterial(ingredient:Ingredient){
 const text=identity(ingredient)
 return ingredient.status!=='Archived'&&(/essential oil|absolute|resinoid|aroma|fragrance|parfum|perfuming|scent material|isolate|aroma chemical/.test(text)||ingredient.functions.some(item=>/fragrance|perfuming/i.test(item)))
}

export function isAlcoholCarrier(ingredient:Ingredient){
 const text=identity(ingredient)
 return /\bethanol\b|alcohol denat|perfumer.?s alcohol|cosmetic alcohol/.test(text)
}

export function normalizeConcentratePercentages(selections:ProductStudioSelection[],percentages:Record<string,number>){
 if(!selections.length)return{}
 const raw=selections.map(selection=>Math.max(0,Number(percentages[selection.ingredientId]??0)))
 const total=raw.reduce((sum,value)=>sum+value,0)
 if(total<=0){const equal=100/selections.length;return Object.fromEntries(selections.map((selection,index)=>[selection.ingredientId,index===selections.length-1?Number((100-equal*(selections.length-1)).toFixed(2)):Number(equal.toFixed(2))]))}
 let running=0
 return Object.fromEntries(selections.map((selection,index)=>{const value=index===selections.length-1?Number((100-running).toFixed(2)):Number((raw[index]/total*100).toFixed(2));running+=value;return[selection.ingredientId,value]}))
}

export function buildFragranceFormula(input:{selections:ProductStudioSelection[];percentages:Record<string,number>;targetConcentration:number;alcoholIngredientId:string}){
 const normalized=normalizeConcentratePercentages(input.selections,input.percentages),concentration=Math.max(1,Math.min(40,input.targetConcentration))
 const aromatic=input.selections.map((selection,index)=>({ingredientId:selection.ingredientId,role:selection.role||'fragrance_material',phase:'Fragrance concentrate',percentage:Number(((normalized[selection.ingredientId]??0)*concentration/100).toFixed(4)),explanation:'Fragrance-concentrate material scaled into the finished alcohol-based formula.',sortOrder:index+1,notes:''}))
 const aromaticTotal=aromatic.reduce((sum,line)=>sum+line.percentage,0)
 return{lines:[{ingredientId:input.alcoholIngredientId,role:'alcohol_carrier',phase:'Dilution',percentage:Number((100-aromaticTotal).toFixed(4)),explanation:'Alcohol carrier for the finished fine-fragrance dilution.',sortOrder:0,notes:''},...aromatic],total:Number((100-aromaticTotal+aromaticTotal).toFixed(4)),concentratePercentages:normalized}
}

export function fragranceHandoffIssues(input:{saved:boolean;selections:ProductStudioSelection[];percentages:Record<string,number>;targetConcentration:number;alcoholIngredientId?:string}){
 const issues:string[]=[]
 if(!input.saved)issues.push('Save the fragrance concept before creating a Formula.')
 if(input.selections.length<2)issues.push('Select at least two fragrance materials before Formula handoff.')
 const normalized=normalizeConcentratePercentages(input.selections,input.percentages)
 if(input.selections.some(selection=>!Number.isFinite(normalized[selection.ingredientId])||normalized[selection.ingredientId]<=0))issues.push('Every selected fragrance material needs a positive concentrate percentage.')
 if(!Number.isFinite(input.targetConcentration)||input.targetConcentration<=0||input.targetConcentration>40)issues.push('Choose a finished fragrance concentration between 1% and 40%.')
 if(!input.alcoholIngredientId)issues.push('Adopt a cosmetic-grade ethanol / perfumer’s alcohol Ingredient before creating the finished Formula.')
 return issues
}
