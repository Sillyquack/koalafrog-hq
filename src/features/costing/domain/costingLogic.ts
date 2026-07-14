import type { CostLine, FormulaLine, InventoryLot, InventoryMovement, InventoryUnit, ProductionRunAllocation, ProductionRunLine, SupplierProduct } from '../../../types/domain'
import { areUnitsCompatible, convertUnit, expiryState, lotBalance } from '../../inventory/domain/inventoryLogic'

export const BASE_CURRENCY = 'NOK'
export function lotUnitCost(lot:InventoryLot,targetUnit:InventoryUnit=lot.unit){
  if(lot.totalAcquisitionCost==null||!lot.acquisitionCostCurrency||lot.openingQuantity<=0||!areUnitsCompatible(lot.unit,targetUnit))return undefined
  return lot.totalAcquisitionCost/convertUnit(lot.openingQuantity,lot.unit,targetUnit)
}
export function weightedInventoryUnitCost(ingredientId:string,targetUnit:InventoryUnit,lots:InventoryLot[],movements:InventoryMovement[],currency=BASE_CURRENCY,asOf=new Date()){
  const eligible=lots.flatMap(lot=>{if(lot.ingredientId!==ingredientId||lot.status!=='Active'||expiryState(lot,asOf)==='Expired'||lot.acquisitionCostCurrency!==currency||!areUnitsCompatible(lot.unit,targetUnit))return[];const available=lotBalance(lot,movements);const unitCost=lotUnitCost(lot,targetUnit);if(available<=0||unitCost==null||!Number.isFinite(unitCost))return[];const normalizedAvailable=convertUnit(available,lot.unit,targetUnit);return[{available:normalizedAvailable,unitCost}]})
  const totalQuantity=eligible.reduce((sum,item)=>sum+item.available,0);if(totalQuantity<=0)return undefined
  return{unitCost:eligible.reduce((sum,item)=>sum+item.available*item.unitCost,0)/totalQuantity,totalQuantity,lotCount:eligible.length,currency}
}
export interface EstimatedCostLine { formulaLineId:string; ingredientId:string; quantity:number; cost?:number; source?:string }
export function estimateFormulaCost(lines:FormulaLine[],size:number,unit:InventoryUnit,lots:InventoryLot[],movements:InventoryMovement[],supplierProducts:SupplierProduct[],currency=BASE_CURRENCY,asOf=new Date()){
  const details:EstimatedCostLine[]=lines.map(line=>{const quantity=line.percentage*size/100;const inventory=weightedInventoryUnitCost(line.ingredientId,unit,lots,movements,currency,asOf);if(inventory)return{formulaLineId:line.id,ingredientId:line.ingredientId,quantity,cost:quantity*inventory.unitCost,source:`Weighted current inventory · ${inventory.lotCount} lot${inventory.lotCount===1?'':'s'}`};const supplier=supplierProducts.find(s=>s.ingredientId===line.ingredientId&&s.isPreferred&&s.currency===currency&&Number.isFinite(s.price)&&s.price>=0&&Number.isFinite(s.packageQuantity)&&s.packageQuantity>0&&areUnitsCompatible(s.packageUnit,unit));if(supplier){const packageInUnit=convertUnit(supplier.packageQuantity,supplier.packageUnit,unit);return{formulaLineId:line.id,ingredientId:line.ingredientId,quantity,cost:quantity*supplier.price/packageInUnit,source:'Preferred supplier reference'}}return{formulaLineId:line.id,ingredientId:line.ingredientId,quantity}})
  const priced=details.filter(d=>d.cost!=null);const pricedQuantity=priced.reduce((s,d)=>s+d.quantity,0);const totalQuantity=details.reduce((s,d)=>s+d.quantity,0)
  return{details,total:Math.round(priced.reduce((s,d)=>s+d.cost!,0)*10000)/10000,pricedLines:priced.length,totalLines:details.length,coveragePercent:totalQuantity?pricedQuantity/totalQuantity*100:0,complete:priced.length===details.length}
}
export function actualMaterialCost(lines:ProductionRunLine[],allocations:ProductionRunAllocation[]){const lineIds=new Set(lines.map(l=>l.id));const active=allocations.filter(a=>a.inventoryMovementId&&lineIds.has(a.productionRunLineId));const details=active.map(a=>{const line=lines.find(l=>l.id===a.productionRunLineId)!;const cost=a.unitCostSnapshot==null?undefined:a.quantity*a.unitCostSnapshot;return{...a,ingredientName:line.ingredientNameSnapshot,cost}});const priced=details.filter(d=>d.cost!=null);return{details,total:priced.reduce((s,d)=>s+d.cost!,0),pricedAllocations:priced.length,totalAllocations:details.length,complete:details.length>0&&priced.length===details.length}}
export const additionalCostTotal=(lines:CostLine[],currency=BASE_CURRENCY)=>lines.filter(l=>l.currency===currency).reduce((s,l)=>s+l.amount*l.quantity,0)
export function productionCost(material:number|undefined,additional:number,units:number|undefined){const total=material==null?undefined:material+additional;return{total,costPerUnit:total!=null&&units&&units>0?total/units:undefined}}
export function pricingScenario(sellingPrice:number,cogs:number){const grossProfit=sellingPrice-cogs;return{grossProfit,grossMargin:sellingPrice?grossProfit/sellingPrice*100:undefined,markup:cogs?grossProfit/cogs*100:undefined}}
