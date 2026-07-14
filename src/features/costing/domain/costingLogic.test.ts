import { describe,expect,it } from 'vitest'
import type { FormulaLine,InventoryLot,InventoryMovement,ProductionRunAllocation,ProductionRunLine,SupplierProduct } from '../../../types/domain'
import { actualMaterialCost,additionalCostTotal,estimateFormulaCost,lotUnitCost,pricingScenario,productionCost,weightedInventoryUnitCost } from './costingLogic'

const asOf=new Date('2026-07-14T12:00:00Z')
const lot=(id:string,unit:InventoryLot['unit'],openingQuantity:number,cost?:number,patch:Partial<InventoryLot>={}):InventoryLot=>({id,ingredientId:'i',internalLotNumber:id,receivedDate:'2026-01-01',openingQuantity,unit,location:'A',status:'Active',notes:'',totalAcquisitionCost:cost,acquisitionCostCurrency:cost==null?undefined:'NOK',createdAt:'',updatedAt:'',...patch})
const movement=(id:string,inventoryLotId:string,type:InventoryMovement['type'],quantity:number,unit:InventoryMovement['unit']):InventoryMovement=>({id,inventoryLotId,type,quantity,unit,reason:'',notes:'',occurredAt:'',createdAt:''})
const receipt=(l:InventoryLot)=>movement(`r-${l.id}`,l.id,'Receipt',l.openingQuantity,l.unit)
const line:FormulaLine={id:'line',formulaVersionId:'v',ingredientId:'i',percentage:100,phase:'A',sortOrder:1,notes:''}
const supplier:SupplierProduct={id:'sp',ingredientId:'i',supplierName:'Supplier',productName:'Oil',packageQuantity:1,packageUnit:'kg',price:250,currency:'NOK',notes:'',isPreferred:true,createdAt:'',updatedAt:''}

describe('estimated inventory reference cost',()=>{
  it('weights unit cost by different remaining quantities',()=>{const a=lot('a','g',1000,180),b=lot('b','g',500,150);const movements=[receipt(a),movement('ca','a','Consumption',200,'g'),receipt(b),movement('cb','b','Consumption',300,'g')];expect(weightedInventoryUnitCost('i','g',[a,b],movements,'NOK',asOf)?.unitCost).toBeCloseTo(.204)})
  it('excludes zero-balance lots',()=>{const empty=lot('empty','g',100,1),usable=lot('usable','g',100,20);const movements=[receipt(empty),movement('c','empty','Consumption',100,'g'),receipt(usable)];expect(weightedInventoryUnitCost('i','g',[empty,usable],movements,'NOK',asOf)?.unitCost).toBe(.2)})
  it('excludes non-Active lots',()=>{const quarantined=lot('q','g',100,1,{status:'Quarantined'}),usable=lot('u','g',100,20);expect(weightedInventoryUnitCost('i','g',[quarantined,usable],[receipt(quarantined),receipt(usable)],'NOK',asOf)?.unitCost).toBe(.2)})
  it('excludes expired lots',()=>{const expired=lot('e','g',100,1,{expiryDate:'2026-07-01'}),usable=lot('u','g',100,20);expect(weightedInventoryUnitCost('i','g',[expired,usable],[receipt(expired),receipt(usable)],'NOK',asOf)?.unitCost).toBe(.2)})
  it('excludes lots with missing cost or non-base currency',()=>{const missing=lot('m','g',100),eur=lot('eur','g',100,10,{acquisitionCostCurrency:'EUR'}),usable=lot('u','g',100,20);expect(weightedInventoryUnitCost('i','g',[missing,eur,usable],[receipt(missing),receipt(eur),receipt(usable)],'NOK',asOf)?.unitCost).toBe(.2)})
  it('normalizes kg to g and remaining quantities before weighting',()=>{const kg=lot('kg','kg',1,180),grams=lot('g','g',200,60);expect(weightedInventoryUnitCost('i','g',[kg,grams],[receipt(kg),receipt(grams)],'NOK',asOf)?.unitCost).toBeCloseTo(.2)})
  it('normalizes L to ml',()=>{const litres=lot('L','L',1,100),ml=lot('ml','ml',1000,300);expect(weightedInventoryUnitCost('i','ml',[litres,ml],[receipt(litres),receipt(ml)],'NOK',asOf)?.unitCost).toBeCloseTo(.2)})
})

describe('estimate source hierarchy',()=>{
  it('falls back to the compatible preferred NOK Supplier Product',()=>{const result=estimateFormulaCost([line],100,'g',[],[],[supplier],'NOK',asOf);expect(result.details[0]).toMatchObject({cost:25,source:'Preferred supplier reference'});expect(result.complete).toBe(true)})
  it('reports Unknown when neither source is valid',()=>{const result=estimateFormulaCost([line],100,'g',[],[],[{...supplier,currency:'EUR'}],'NOK',asOf);expect(result.details[0].cost).toBeUndefined();expect(result.total).toBe(0);expect(result.coveragePercent).toBe(0);expect(result.complete).toBe(false)})
  it('reports partial coverage without treating Unknown as zero',()=>{const known=lot('known','kg',1,180);const lines=[{...line,percentage:80},{...line,id:'missing',ingredientId:'missing',percentage:20}];const result=estimateFormulaCost(lines,100,'g',[known],[receipt(known)],[],'NOK',asOf);expect(result.total).toBe(14.4);expect(result.coveragePercent).toBe(80);expect(result.complete).toBe(false)})
})

describe('actual production cost remains historical',()=>{
  it('uses committed allocation snapshots independently of current estimate inputs',()=>{const lines=[{id:'run-line',ingredientNameSnapshot:'Oil'} as ProductionRunLine];const allocations=[{id:'a',productionRunLineId:'run-line',quantity:250,unit:'g',inventoryMovementId:'m',unitCostSnapshot:.18} as ProductionRunAllocation];const before=actualMaterialCost(lines,allocations);const changedLot=lot('new','g',1000,999);estimateFormulaCost([line],100,'g',[changedLot],[receipt(changedLot)],[{...supplier,price:999}],'NOK',asOf);expect(actualMaterialCost(lines,allocations)).toEqual(before);expect(before.total).toBe(45)})
  it('ignores committed allocations belonging to another run',()=>{const lines=[{id:'run-line',ingredientNameSnapshot:'Oil'} as ProductionRunLine];const allocations=[{id:'other',productionRunLineId:'other-line',quantity:999,unit:'g',inventoryMovementId:'m',unitCostSnapshot:9} as ProductionRunAllocation];expect(actualMaterialCost(lines,allocations)).toMatchObject({total:0,totalAllocations:0,complete:false})})
})

describe('supporting calculations',()=>{it('derives normalized lot unit cost and blocks mass-volume conversion',()=>{expect(lotUnitCost(lot('kg','kg',1,180),'g')).toBe(.18);expect(lotUnitCost(lot('kg','kg',1,180),'ml')).toBeUndefined()});it('totals additional costs and pricing metrics',()=>{expect(additionalCostTotal([{amount:10,quantity:3,currency:'NOK'} as never])).toBe(30);expect(productionCost(50,30,4)).toEqual({total:80,costPerUnit:20});expect(pricingScenario(100,40)).toEqual({grossProfit:60,grossMargin:60,markup:150})})})
