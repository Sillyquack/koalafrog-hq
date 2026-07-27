import type { SupplierDiscount, SupplierShippingRule } from '../../domain/procurement'

export const BASKET_CALCULATION_VERSION='1.0.0'
export const BASKET_STRATEGIES=['minimum_cash','best_value','discount_utilization','fewest_suppliers','lowest_risk','balanced'] as const
export type BasketStrategy=typeof BASKET_STRATEGIES[number]
export type AssumptionState='confirmed'|'estimated'|'unknown'|'checkout_verification_required'|'import_verification_required'|'not_applicable'
export type Freshness='current'|'aging'|'stale'|'unknown'
export interface BasketLineInput {id:string;supplierId:string;supplierProductId:string;productName:string;ingredientName:string;requiredQuantity:number;unit:string;packageSize:number;packageUnit:string;packageCount:number;purchasedQuantity:number;surplus:number;unitPrice:number;currency:string;stockState:string;priceVerifiedAt:string|null;stockVerifiedAt:string|null;weightKg?:number|null;warnings:string[]}
export interface DiscountDecision {state:'applied'|'potential'|'ineligible'|'unknown';applied:number;potential:number;reason:string;efficiency:number|null;warning:string|null;snapshot:Record<string,unknown>}
export interface ShippingDecision {state:AssumptionState;amount:number|null;rangeMin:number|null;rangeMax:number|null;reason:string;snapshot:Record<string,unknown>}

const age=(date:string|null|undefined,now:Date):Freshness=>{if(!date)return'unknown';const days=Math.floor((now.getTime()-new Date(date).getTime())/86400000);return days<=30?'current':days<=90?'aging':'stale'}
export const currencyRateFreshness=(effectiveAt:string|null,now=new Date())=>age(effectiveAt,now)

export function calculateDiscount(input:{discount?:SupplierDiscount|null;lines:BasketLineInput[];currency:string;now?:Date;includedProductIds?:string[];excludedProductIds?:string[];confirmed?:boolean;stackingAllowed?:boolean}):DiscountDecision{
  const d=input.discount,now=input.now??new Date(),snapshot={discount:d??null,includedProductIds:input.includedProductIds??[],excludedProductIds:input.excludedProductIds??[],confirmed:input.confirmed??false,stackingAllowed:input.stackingAllowed??null}
  if(!d)return{state:'ineligible',applied:0,potential:0,reason:'No recorded discount',efficiency:null,warning:null,snapshot}
  const eligibleLines=input.lines.filter(line=>!(input.excludedProductIds??[]).includes(line.supplierProductId)&&(!(input.includedProductIds?.length)||(input.includedProductIds.includes(line.supplierProductId))))
  const subtotal=eligibleLines.reduce((sum,line)=>sum+line.packageCount*line.unitPrice,0),basket=input.lines.reduce((sum,line)=>sum+line.packageCount*line.unitPrice,0)
  if(['used','expired','invalid'].includes(d.status)||d.used_at){const reason=d.used_at?'First-order discount already used':`Discount status is ${d.status}`;return{state:'ineligible',applied:0,potential:0,reason,efficiency:null,warning:null,snapshot}}
  if(d.expires_at&&new Date(d.expires_at)<=now)return{state:'ineligible',applied:0,potential:0,reason:'Discount expired',efficiency:null,warning:null,snapshot}
  if(d.valid_from&&new Date(d.valid_from)>now)return{state:'ineligible',applied:0,potential:0,reason:'Discount not yet valid',efficiency:null,warning:null,snapshot}
  if(d.currency&&d.currency!==input.currency)return{state:'ineligible',applied:0,potential:0,reason:'Fixed discount currency differs from basket currency',efficiency:null,warning:null,snapshot}
  if(d.minimum_order_value!=null&&subtotal<d.minimum_order_value)return{state:'ineligible',applied:0,potential:0,reason:'Eligible subtotal is below threshold',efficiency:null,warning:null,snapshot}
  let potential=d.discount_type==='percentage'?subtotal*Number(d.percentage??0)/100:d.discount_type==='fixed_amount'?Number(d.fixed_amount??0):0
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
  amount+=input.remoteAreaFee??0;amount+=input.dangerousGoodsFee??0
  const current=rule.status==='active'&&age(rule.verified_at,now)==='current'
  return{state:current?'confirmed':'estimated',amount,rangeMin:amount,rangeMax:amount,reason:current?'Current stored shipping rule':'Shipping rule is unverified, aging, or stale',snapshot}
}

export interface BasketCost {currency:string;merchandise:number;confirmedDiscount:number;estimatedDiscount:number;shipping:number|null;shippingState:AssumptionState;tax:number|null;taxState:AssumptionState;duty:number|null;dutyState:AssumptionState;handling:number|null;handlingState:AssumptionState}
export function calculateBasketTotals(cost:BasketCost){
  const knownMinimum=cost.merchandise-cost.confirmedDiscount+[cost.shipping,cost.tax,cost.duty,cost.handling].reduce<number>((sum,value)=>sum+(value??0),0)
  const unknown=[cost.shippingState,cost.taxState,cost.dutyState,cost.handlingState].filter(state=>['unknown','checkout_verification_required','import_verification_required'].includes(state))
  const estimates=[cost.shipping,cost.tax,cost.duty,cost.handling]
  const estimatedTotal=estimates.some(value=>value==null)?null:cost.merchandise-cost.confirmedDiscount-cost.estimatedDiscount+estimates.reduce<number>((sum,value)=>sum+(value??0),0)
  const confirmedTotal=unknown.length===0&&[cost.shippingState,cost.taxState,cost.dutyState,cost.handlingState].every(state=>['confirmed','not_applicable'].includes(state))?knownMinimum:null
  return{knownMinimum,confirmedTotal,estimatedTotal,unknownComponents:unknown.length,uncertainty:unknown.length?'incomplete':'complete'}
}

export interface ScenarioMetrics {id:string;strategy:BasketStrategy;supplierCount:number;lineCount:number;knownMinimum:number|null;estimatedTotal:number|null;surplusCost:number;discountSaving:number;uncertaintyCount:number;staleCount:number;documentationCoverage:number;stockCoverage:number;leadTimeDays:number|null}
export function scenarioScore(item:ScenarioMetrics){
  const cash=item.estimatedTotal??item.knownMinimum??Number.MAX_SAFE_INTEGER/100
  if(item.strategy==='minimum_cash')return cash+item.surplusCost*.1+item.uncertaintyCount*10000
  if(item.strategy==='best_value')return cash+item.surplusCost*.35+item.uncertaintyCount*5000
  if(item.strategy==='discount_utilization')return cash-item.discountSaving*2+item.uncertaintyCount*5000
  if(item.strategy==='fewest_suppliers')return item.supplierCount*1e9+cash
  if(item.strategy==='lowest_risk')return item.uncertaintyCount*1e9+item.staleCount*1e8+(1-item.documentationCoverage)*1e7+(1-item.stockCoverage)*1e6+(item.leadTimeDays??999)*1e3+cash
  return cash+item.supplierCount*250+item.surplusCost*.25+item.uncertaintyCount*5000+item.staleCount*1000-item.discountSaving
}
export const rankScenarioMetrics=(items:ScenarioMetrics[])=>[...items].map(item=>({...item,rankingScore:scenarioScore(item)})).sort((a,b)=>a.rankingScore-b.rankingScore||a.strategy.localeCompare(b.strategy)||a.id.localeCompare(b.id))
export function scenarioStale(sourceRevision:number,currentRevision:number,published:boolean){return published?false:sourceRevision!==currentRevision}
