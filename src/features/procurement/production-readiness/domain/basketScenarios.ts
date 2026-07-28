import type { SupplierDiscount, SupplierShippingRule } from '../../domain/procurement'

export const BASKET_CALCULATION_VERSION='1.0.0'
export const BASKET_STRATEGIES=['minimum_cash','best_value','discount_utilization','fewest_suppliers','lowest_risk','balanced'] as const
export type BasketStrategy=typeof BASKET_STRATEGIES[number]
export type AssumptionState='confirmed'|'estimated'|'unknown'|'checkout_verification_required'|'import_verification_required'|'not_applicable'
export type Freshness='current'|'aging'|'stale'|'unknown'
export interface BasketLineInput {id:string;supplierId:string;supplierProductId:string;productName:string;ingredientName:string;requiredQuantity:number;unit:string;packageSize:number;packageUnit:string;packageCount:number;purchasedQuantity:number;surplus:number;unitPrice:number;currency:string;stockState:string;priceVerifiedAt:string|null;stockVerifiedAt:string|null;weightKg?:number|null;warnings:string[]}
export interface DiscountDecision {state:'applied'|'potential'|'ineligible'|'unknown';applied:number;potential:number;reason:string;efficiency:number|null;warning:string|null;snapshot:Record<string,unknown>}
export interface ShippingDecision {state:AssumptionState;amount:number|null;rangeMin:number|null;rangeMax:number|null;reason:string;snapshot:Record<string,unknown>}

// Database calculations use PostgreSQL numeric. These guards keep the browser
// projection inside JavaScript's exact operational range instead of silently
// producing Infinity or unstable scores.
const OPERATIONAL_NUMBER_LIMIT=Number.MAX_SAFE_INTEGER
const safeNumber=(value:number,label:string)=>{
  if(!Number.isFinite(value)||Math.abs(value)>OPERATIONAL_NUMBER_LIMIT)throw new RangeError(`${label} exceeds the supported numeric range`)
  return value
}
const safeAdd=(values:number[],label:string)=>safeNumber(values.reduce((sum,value)=>safeNumber(sum+safeNumber(value,label),label),0),label)
const safeMultiply=(left:number,right:number,label:string)=>safeNumber(safeNumber(left,label)*safeNumber(right,label),label)

const age=(date:string|null|undefined,now:Date):Freshness=>{if(!date)return'unknown';const days=Math.floor((now.getTime()-new Date(date).getTime())/86400000);return days<=30?'current':days<=90?'aging':'stale'}
export const currencyRateFreshness=(effectiveAt:string|null,now=new Date())=>age(effectiveAt,now)

export function calculateDiscount(input:{discount?:SupplierDiscount|null;lines:BasketLineInput[];currency:string;now?:Date;includedProductIds?:string[];excludedProductIds?:string[];confirmed?:boolean;stackingAllowed?:boolean}):DiscountDecision{
  const d=input.discount,now=input.now??new Date(),snapshot={discount:d??null,includedProductIds:input.includedProductIds??[],excludedProductIds:input.excludedProductIds??[],confirmed:input.confirmed??false,stackingAllowed:input.stackingAllowed??null}
  if(!d)return{state:'ineligible',applied:0,potential:0,reason:'No recorded discount',efficiency:null,warning:null,snapshot}
  const eligibleLines=input.lines.filter(line=>!(input.excludedProductIds??[]).includes(line.supplierProductId)&&(!(input.includedProductIds?.length)||(input.includedProductIds.includes(line.supplierProductId))))
  const lineTotal=(line:BasketLineInput)=>safeMultiply(line.packageCount,line.unitPrice,'basket merchandise')
  const subtotal=safeAdd(eligibleLines.map(lineTotal),'eligible subtotal'),basket=safeAdd(input.lines.map(lineTotal),'basket merchandise')
  if(['used','expired','invalid'].includes(d.status)||d.used_at){const reason=d.used_at?'First-order discount already used':`Discount status is ${d.status}`;return{state:'ineligible',applied:0,potential:0,reason,efficiency:null,warning:null,snapshot}}
  if(d.expires_at&&new Date(d.expires_at)<=now)return{state:'ineligible',applied:0,potential:0,reason:'Discount expired',efficiency:null,warning:null,snapshot}
  if(d.valid_from&&new Date(d.valid_from)>now)return{state:'ineligible',applied:0,potential:0,reason:'Discount not yet valid',efficiency:null,warning:null,snapshot}
  if(d.currency&&d.currency!==input.currency)return{state:'ineligible',applied:0,potential:0,reason:'Fixed discount currency differs from basket currency',efficiency:null,warning:null,snapshot}
  if(d.minimum_order_value!=null&&subtotal<d.minimum_order_value)return{state:'ineligible',applied:0,potential:0,reason:'Eligible subtotal is below threshold',efficiency:null,warning:null,snapshot}
  let potential=d.discount_type==='percentage'?safeMultiply(subtotal,Number(d.percentage??0),'percentage discount')/100:d.discount_type==='fixed_amount'?safeNumber(Number(d.fixed_amount??0),'fixed discount'):0
  potential=Math.min(subtotal,potential,d.maximum_discount??Number.MAX_SAFE_INTEGER)
  const confirmed=(input.confirmed??Boolean(d.verified_at))&&d.status==='available'
  const applied=confirmed?potential:0,efficiency=d.first_purchase_only&&potential>0?Math.min(1,applied/potential):null
  const warning=d.first_purchase_only&&basket<(d.minimum_order_value??basket)*1.25?'One-time discount is being considered on a relatively small basket':null
  return{state:confirmed?'applied':'potential',applied,potential,reason:confirmed?'Recorded and verified eligibility satisfied':'Eligibility or evidence is not confirmed',efficiency,warning,snapshot}
}

export function calculateShipping(input:{rule?:SupplierShippingRule|null;subtotal:number;postDiscountSubtotal:number;currency:string;destinationCountry:string;totalWeightKg:number|null;now?:Date;thresholdBasis?:'pre_discount'|'post_discount'|null;checkoutOnly?:boolean;weightTiers?:Array<{maxKg:number;amount:number}>;remoteAreaFee?:number|null;dangerousGoodsFee?:number|null;estimateMin?:number|null;estimateMax?:number|null}):ShippingDecision{
  const rule=input.rule,now=input.now??new Date(),snapshot={rule:rule??null,thresholdBasis:input.thresholdBasis??null,checkoutOnly:input.checkoutOnly??false,weightTiers:input.weightTiers??[],remoteAreaFee:input.remoteAreaFee??null,dangerousGoodsFee:input.dangerousGoodsFee??null}
  if(!rule)return{state:'unknown',amount:null,rangeMin:input.estimateMin??null,rangeMax:input.estimateMax??null,reason:'No stored shipping rule',snapshot}
  if(rule.destination_country_code&&rule.destination_country_code!==input.destinationCountry)return{state:'unknown',amount:null,rangeMin:null,rangeMax:null,reason:`Delivery to ${input.destinationCountry} is not confirmed`,snapshot}
  if(input.checkoutOnly||rule.tax_handling==='destination_checkout')return{state:'checkout_verification_required',amount:null,rangeMin:input.estimateMin??null,rangeMax:input.estimateMax??null,reason:'Shipping is determined at checkout',snapshot}
  if(rule.currency&&rule.currency!==input.currency)return{state:'unknown',amount:null,rangeMin:null,rangeMax:null,reason:'Shipping currency differs from basket currency',snapshot}
  const basis=input.thresholdBasis==='pre_discount'?input.subtotal:input.thresholdBasis==='post_discount'?input.postDiscountSubtotal:null
  if(rule.free_shipping_threshold!=null&&basis==null)return{state:'unknown',amount:null,rangeMin:null,rangeMax:null,reason:'Free-shipping threshold basis is not recorded',snapshot}
  if(rule.free_shipping_threshold!=null&&basis!>=rule.free_shipping_threshold)return{state:rule.status==='active'&&age(rule.verified_at,now)==='current'?'confirmed':'estimated',amount:0,rangeMin:0,rangeMax:0,reason:'Recorded free-shipping threshold reached',snapshot}
  let amount=rule.flat_rate
  if(input.weightTiers?.length){
    if(input.totalWeightKg==null)return{state:'unknown',amount:null,rangeMin:null,rangeMax:null,reason:'Weight-tier shipping requires reliable package weight',snapshot}
    amount=[...input.weightTiers].sort((a,b)=>a.maxKg-b.maxKg).find(tier=>input.totalWeightKg!<=tier.maxKg)?.amount??null
  }
  if(amount==null)return{state:'unknown',amount:null,rangeMin:input.estimateMin??null,rangeMax:input.estimateMax??null,reason:'Shipping amount is not recorded',snapshot}
  amount=safeAdd([amount,input.remoteAreaFee??0,input.dangerousGoodsFee??0],'shipping')
  const current=rule.status==='active'&&age(rule.verified_at,now)==='current'
  return{state:current?'confirmed':'estimated',amount,rangeMin:amount,rangeMax:amount,reason:current?'Current stored shipping rule':'Shipping rule is unverified, aging, or stale',snapshot}
}

export interface BasketCost {currency:string;merchandise:number;confirmedDiscount:number;estimatedDiscount:number;shipping:number|null;shippingState:AssumptionState;tax:number|null;taxState:AssumptionState;duty:number|null;dutyState:AssumptionState;handling:number|null;handlingState:AssumptionState}
export function calculateBasketTotals(cost:BasketCost){
  const knownMinimum=safeAdd([cost.merchandise,-cost.confirmedDiscount,cost.shipping??0,cost.tax??0,cost.duty??0,cost.handling??0],'known basket total')
  const unknown=[cost.shippingState,cost.taxState,cost.dutyState,cost.handlingState].filter(state=>['unknown','checkout_verification_required','import_verification_required'].includes(state))
  const estimates=[cost.shipping,cost.tax,cost.duty,cost.handling]
  const estimatedTotal=estimates.some(value=>value==null)?null:safeAdd([cost.merchandise,-cost.confirmedDiscount,-cost.estimatedDiscount,...estimates.map(value=>value??0)],'estimated basket total')
  const confirmedTotal=unknown.length===0&&[cost.shippingState,cost.taxState,cost.dutyState,cost.handlingState].every(state=>['confirmed','not_applicable'].includes(state))?knownMinimum:null
  return{knownMinimum,confirmedTotal,estimatedTotal,unknownComponents:unknown.length,uncertainty:unknown.length?'incomplete':'complete'}
}

export interface ScenarioMetrics {id:string;strategy:BasketStrategy;supplierCount:number;lineCount:number;knownMinimum:number|null;estimatedTotal:number|null;surplusCost:number;discountSaving:number;uncertaintyCount:number;staleCount:number;documentationCoverage:number;stockCoverage:number;leadTimeDays:number|null}
export function scenarioScore(item:ScenarioMetrics){
  const cash=safeNumber(item.estimatedTotal??item.knownMinimum??OPERATIONAL_NUMBER_LIMIT/100,'scenario cash')
  const weighted=(value:number,weight:number)=>safeMultiply(value,weight,'scenario ranking')
  if(item.strategy==='minimum_cash')return safeAdd([cash,weighted(item.surplusCost,.1),weighted(item.uncertaintyCount,10000)],'scenario ranking')
  if(item.strategy==='best_value')return safeAdd([cash,weighted(item.surplusCost,.35),weighted(item.uncertaintyCount,5000)],'scenario ranking')
  if(item.strategy==='discount_utilization')return safeAdd([cash,-weighted(item.discountSaving,2),weighted(item.uncertaintyCount,5000)],'scenario ranking')
  if(item.strategy==='fewest_suppliers')return safeAdd([weighted(item.supplierCount,1e9),cash],'scenario ranking')
  if(item.strategy==='lowest_risk')return safeAdd([weighted(item.uncertaintyCount,1e9),weighted(item.staleCount,1e8),weighted(1-item.documentationCoverage,1e7),weighted(1-item.stockCoverage,1e6),weighted(item.leadTimeDays??999,1e3),cash],'scenario ranking')
  return safeAdd([cash,weighted(item.supplierCount,250),weighted(item.surplusCost,.25),weighted(item.uncertaintyCount,5000),weighted(item.staleCount,1000),-item.discountSaving],'scenario ranking')
}
export const rankScenarioMetrics=(items:ScenarioMetrics[])=>[...items].map(item=>({...item,rankingScore:scenarioScore(item)})).sort((a,b)=>a.rankingScore-b.rankingScore||a.strategy.localeCompare(b.strategy)||a.id.localeCompare(b.id))
export function scenarioStale(sourceRevision:number,currentRevision:number,published:boolean){return published?false:sourceRevision!==currentRevision}
