import type{Ingredient,SupplierProduct,SupplierProductVerification}from'../../../types/domain'
export const verificationKeys=(['inci','supplierSpecification','sds','coa','allergenInformation','shelfLife','origin','extractionMethod','processingMethod','ifra','cosing'] as const)
export function emptySupplierProductVerification():SupplierProductVerification{return Object.fromEntries(verificationKeys.map(key=>[key,'unknown'])) as unknown as SupplierProductVerification}
export function inheritedSupplierProductProfile(ingredient:Ingredient,product?:SupplierProduct){return{declaredInci:product?.declaredInci??ingredient.inciName,categorySnapshot:product?.categorySnapshot??ingredient.category,defaultInventoryUnit:product?.defaultInventoryUnit??ingredient.defaultUnit,cosingFunctionsSnapshot:product?.cosingFunctionsSnapshot??ingredient.cosingFunctions??[],researchProfileSnapshot:product?.researchProfileSnapshot??ingredient.description,referenceEntryId:product?.referenceEntryId??ingredient.referenceEntryId}}
export function supplierProductNeedsReview(product:SupplierProduct){const verification={...emptySupplierProductVerification(),...product.verification};return Object.values(verification).some(value=>value==='unknown'||value==='needs_review')}
const gradeGroups:{matches:string[];values:string[]}[]=[
 {matches:['essential oil'],values:['Organic','Conventional','Steam Distilled','Cold/Expression Pressed','Expeller Pressed','Bergaptene-Free','Rectified']},
 {matches:['fragrance'],values:['Fragrance Oil','Natural Fragrance','Partly Synthetic','Nature Identical','Custom Blend']},
 {matches:['butter'],values:['Refined','Unrefined','Organic','Deodorised']},
 {matches:['wax'],values:['Yellow','White','Refined','Natural']},
 {matches:['extract','hydrosol','tincture'],values:['CO2','Glycerite','Oil Infusion','Hydrosol','Tincture']},
 {matches:['carrier oil','oil'],values:['Refined','Unrefined','Virgin','Organic','High Oleic','Cold Pressed']},
]
export function gradeSuggestions(category:string){const normalized=category.trim().toLowerCase();return gradeGroups.find(group=>group.matches.some(match=>normalized.includes(match)))?.values??['Organic','Cosmetic Grade','Food Grade','Pharma Grade','USP']}
export function supplierProductCompletion(values:{supplierName?:string;productName?:string;packageQuantity?:number;packageUnit?:string;price?:number;currency?:string;grade?:string;supplierGrade?:string;origin?:string;shelfLifeMonths?:number;storageRequirements?:string;operationalNotes?:string;verification?:SupplierProductVerification}){
 const percent=(complete:number,total:number)=>Math.round(complete/total*100)
 const core=[values.supplierName,values.productName,values.packageQuantity,values.packageUnit]
 const commercial=[values.price,values.currency,values.grade||values.supplierGrade,values.origin,values.shelfLifeMonths,values.storageRequirements]
 const verification=Object.values({...emptySupplierProductVerification(),...values.verification}).filter(value=>value!=='unknown').length
 return{core:percent(core.filter(Boolean).length,core.length),commercial:percent(commercial.filter(Boolean).length,commercial.length),verification:percent(verification,verificationKeys.length),documentation:values.operationalNotes?.trim()?100:0}
}
