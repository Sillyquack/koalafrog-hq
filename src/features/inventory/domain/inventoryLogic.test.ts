import { describe, expect, it } from 'vitest'
import type { Ingredient, InventoryLot, InventoryMovement } from '../../../types/domain'
import { areUnitsCompatible, convertUnit, expiryState, generateLotNumber, ingredientBalance, lotBalance, stockState, validateMovement } from './inventoryLogic'

const lot: InventoryLot = { id:'lot',ingredientId:'ingredient',internalLotNumber:'KF-ING-260714-001',receivedDate:'2026-07-14',openingQuantity:1000,unit:'g',location:'Shelf',status:'Active',notes:'',createdAt:'',updatedAt:'' }
const movement=(id:string,type:InventoryMovement['type'],quantity:number,unit:InventoryMovement['unit']='g'):InventoryMovement=>({id,inventoryLotId:'lot',type,quantity,unit,reason:'Test',notes:'',occurredAt:'2026-07-14T00:00:00Z',createdAt:''})
const ingredient:Ingredient={id:'ingredient',commonName:'Test Oil',inciName:'Testus Oil',category:'Oil',functions:['Emollient'],description:'',defaultUnit:'g',reorderThreshold:300,notes:'',status:'Active',createdAt:'',updatedAt:''}

describe('inventory units',()=>{
  it('converts kg and g',()=>{expect(convertUnit(1,'kg','g')).toBe(1000);expect(convertUnit(500,'g','kg')).toBe(.5)})
  it('converts L and ml',()=>{expect(convertUnit(1.5,'L','ml')).toBe(1500);expect(convertUnit(250,'ml','L')).toBe(.25)})
  it('rejects mass to volume',()=>{expect(areUnitsCompatible('g','ml')).toBe(false);expect(()=>convertUnit(1,'g','ml')).toThrow()})
})
describe('movement ledger',()=>{
  const history=[movement('r','Receipt',1000),movement('c','Consumption',250),movement('w','Waste',10)]
  it('derives balance from signed history',()=>expect(lotBalance(lot,history)).toBe(740))
  it('supports signed adjustment',()=>expect(lotBalance(lot,[...history,movement('a','Adjustment',5)])).toBe(745))
  it('blocks over-consumption',()=>expect(validateMovement(lot,history,{type:'Consumption',quantity:741,unit:'g'})).toContain('exceeds'))
  it('rejects zero, NaN, and incompatible units',()=>{expect(validateMovement(lot,history,{type:'Waste',quantity:0,unit:'g'})).toBeTruthy();expect(validateMovement(lot,history,{type:'Waste',quantity:NaN,unit:'g'})).toBeTruthy();expect(validateMovement(lot,history,{type:'Sample',quantity:1,unit:'ml'})).toContain('compatible')})
})
describe('derived awareness',()=>{
  it('derives low and in-stock states',()=>{const movements=[movement('r','Receipt',1000),movement('c','Consumption',750)];expect(ingredientBalance(ingredient,[lot],movements)).toBe(250);expect(stockState(ingredient,[lot],movements)).toBe('Low')})
  it('classifies expiry relative to isolated threshold',()=>{expect(expiryState({...lot,expiryDate:'2026-07-01'},new Date('2026-07-14T12:00:00'))).toBe('Expired');expect(expiryState({...lot,expiryDate:'2026-08-01'},new Date('2026-07-14T12:00:00'))).toBe('Expiring Soon');expect(expiryState(lot,new Date('2026-07-14T12:00:00'))).toBe('No Expiry Data')})
  it('generates a unique daily lot sequence',()=>expect(generateLotNumber(['KF-ING-260714-001','KF-ING-260714-003'],new Date('2026-07-14T12:00:00'))).toBe('KF-ING-260714-004'))
})
