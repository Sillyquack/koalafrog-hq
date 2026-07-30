import type { InventoryUnit, OperationalReviewState, SupplierProduct } from '../../../../types/domain'
import { areUnitsCompatible, convertUnit } from '../../../inventory/domain/inventoryLogic'
import { selectPackages } from './productionReadiness'

export const SUPPLIER_MATCHING_VERSION = '1.0.0'
export type FreshnessState = 'current'|'aging'|'stale'|'unknown'
export type MatchClassification = 'exact'|'preference_deviation'|'needs_review'|'incompatible'|'insufficient_evidence'|'stale'|'unavailable'|'unit_incompatible'|'package_too_small'|'package_excessive'|'missing_mapping'
export interface PurchasingSpecification {
  ingredientId:string;ingredientName:string;inci:{value:string|null;state:'confirmed'|'unknown'}
  requiredUnit:InventoryUnit;minimumGap:number;grade:{value:string|null;state:'confirmed'|'preferred'|'unknown'|'not_applicable'|'blocked'}
  organic:{value:boolean|null;state:'confirmed'|'preferred'|'unknown'|'not_applicable'|'blocked'}
  requiredDocuments:string[];preferredDocuments:string[];provenance:Record<string,string>
}
export interface MatchCandidate {
  supplierProductId:string;classification:MatchClassification;score:number;reasons:string[];mismatches:string[];warnings:string[]
  packageCount:number|null;purchasedQuantity:number|null;surplus:number|null;freshness:{price:FreshnessState;stock:FreshnessState}
}

export const freshnessState=(verifiedAt:string|undefined,now=new Date()):FreshnessState=>{
  if(!verifiedAt)return'unknown'
  const days=Math.floor((now.getTime()-new Date(verifiedAt).getTime())/86_400_000)
  return days<=30?'current':days<=90?'aging':'stale'
}

export function classifySupplierProduct(input:{spec:PurchasingSpecification;product:SupplierProduct;acceptedIngredientId?:string;mappingAccepted?:boolean;moq?:number;now?:Date}):MatchCandidate{
  const {spec,product}=input,reasons:string[]=[],mismatches:string[]=[],warnings:string[]=[]
  let score=0
  const mappingExact=input.mappingAccepted&&input.acceptedIngredientId===spec.ingredientId
  if(mappingExact){reasons.push('Accepted canonical Ingredient mapping');score+=55}
  else if(product.ingredientId===spec.ingredientId){reasons.push('Legacy Ingredient association requires explicit acceptance');score+=35}
  else mismatches.push('Missing canonical mapping')
  const unitCompatible=areUnitsCompatible(spec.requiredUnit,product.packageUnit)
  if(unitCompatible){reasons.push('Package unit is compatible');score+=20}else mismatches.push('Mass, volume, and count cannot be converted without an approved basis')
  const packageResult=unitCompatible?selectPackages(spec.minimumGap,spec.requiredUnit,product,input.moq??1):null
  const verification=product.verification
  if(verification?.sds==='reviewed'){reasons.push('Required SDS is reviewed');score+=10}else warnings.push('Required SDS is not reviewed')
  if(verification?.coa!=='reviewed')warnings.push('Preferred COA is not reviewed')
  if(spec.grade.value&&product.grade&&spec.grade.value.toLowerCase()!==product.grade.toLowerCase())mismatches.push(`Grade ${product.grade} does not match ${spec.grade.value}`)
  else if(spec.grade.value&&product.grade){reasons.push('Grade matches');score+=5}
  const price=freshnessState(product.updatedAt,input.now),stock=freshnessState(product.updatedAt,input.now)
  if(price==='stale')warnings.push('Price information is stale')
  if(stock==='stale')warnings.push('Stock information is stale')
  if(price==='unknown')warnings.push('Price freshness is unknown')
  const unavailable=product.productStatus==='inactive'||product.productStatus==='discontinued'
  if(unavailable)mismatches.push('Supplier Product is unavailable')
  let classification:MatchClassification
  if(!unitCompatible)classification='unit_incompatible'
  else if(unavailable)classification='unavailable'
  else if(product.ingredientId!==spec.ingredientId&&!mappingExact)classification='missing_mapping'
  else if(mismatches.length)classification='incompatible'
  else if(price==='stale'||stock==='stale')classification='stale'
  else if(mappingExact&&!warnings.length)classification='exact'
  else if(mappingExact)classification='preference_deviation'
  else classification='needs_review'
  if(mismatches.length)score=Math.min(score,25)
  return{supplierProductId:product.id,classification,score,reasons,mismatches,warnings,packageCount:packageResult?.valid?packageResult.packageCount:null,purchasedQuantity:packageResult?.valid?packageResult.purchasedQuantity:null,surplus:packageResult?.valid?packageResult.surplus:null,freshness:{price,stock}}
}

export const documentState=(value:OperationalReviewState|undefined)=>value??'unknown'
export const normalizePackageQuantity=(quantity:number,from:InventoryUnit,to:InventoryUnit)=>areUnitsCompatible(from,to)?convertUnit(quantity,from,to):null
export const orderCandidates=(items:MatchCandidate[])=>[...items].sort((a,b)=>b.score-a.score||a.classification.localeCompare(b.classification)||a.supplierProductId.localeCompare(b.supplierProductId))
