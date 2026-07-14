import type { InventoryLot, InventoryMovement, SupplierProduct } from '../types/domain'

export const supplierProducts: SupplierProduct[] = [
  { id:'sp1', ingredientId:'i1', supplierName:'Mystic Materials', productName:'Jojoba Golden — 1 kg', supplierSku:'JOJ-G-1K', packageQuantity:1, packageUnit:'kg', price:389, currency:'NOK', productUrl:'', notes:'Development supplier record.', isPreferred:true, createdAt:'2026-03-01', updatedAt:'2026-07-01' },
  { id:'sp2', ingredientId:'i1', supplierName:'Nordic Raw Materials', productName:'Golden Jojoba — 500 g', supplierSku:'NRM-J500', packageQuantity:500, packageUnit:'g', price:229, currency:'NOK', notes:'Alternate sample size.', isPreferred:false, createdAt:'2026-04-01', updatedAt:'2026-06-01' },
  { id:'sp3', ingredientId:'i6', supplierName:'Atelier Botanica', productName:'Cedarwood Atlas — 50 ml', supplierSku:'CED-AT-50', packageQuantity:50, packageUnit:'ml', price:176, currency:'NOK', notes:'Olfactive development material.', isPreferred:true, createdAt:'2026-03-09', updatedAt:'2026-07-01' },
  { id:'sp4', ingredientId:'i3', supplierName:'Nordic Raw Materials', productName:'Refined Mango Butter — 1 kg', packageQuantity:1, packageUnit:'kg', price:298, currency:'NOK', notes:'Working sample.', isPreferred:true, createdAt:'2026-04-01', updatedAt:'2026-07-01' },
]
export const inventoryLots: InventoryLot[] = [
  { id:'lot1', ingredientId:'i1', supplierProductId:'sp1', internalLotNumber:'KF-ING-260401-001', supplierLotNumber:'MM-JG-0326', receivedDate:'2026-04-01', openingQuantity:1000, unit:'g', bestBeforeDate:'2027-10-01', location:'Raw Materials / Shelf A', status:'Active', notes:'Development stock record.', createdAt:'2026-04-01', updatedAt:'2026-07-10' },
  { id:'lot2', ingredientId:'i6', supplierProductId:'sp3', internalLotNumber:'KF-ING-260509-001', supplierLotNumber:'AB-CA-0526', receivedDate:'2026-05-09', openingQuantity:50, unit:'ml', bestBeforeDate:'2026-08-20', location:'Scent Cabinet / Drawer 2', status:'Active', notes:'Store as labelled by supplier.', createdAt:'2026-05-09', updatedAt:'2026-07-12' },
  { id:'lot3', ingredientId:'i3', supplierProductId:'sp4', internalLotNumber:'KF-ING-260618-001', receivedDate:'2026-06-18', openingQuantity:1000, unit:'g', bestBeforeDate:'2027-06-01', location:'Raw Materials / Cool Shelf', status:'Active', notes:'Mock inventory lot.', createdAt:'2026-06-18', updatedAt:'2026-07-11' },
  { id:'lot4', ingredientId:'i2', internalLotNumber:'KF-ING-260301-001', receivedDate:'2026-03-01', openingQuantity:250, unit:'g', location:'Raw Materials / Shelf A', status:'Active', notes:'No supplier expiry data recorded.', createdAt:'2026-03-01', updatedAt:'2026-07-01' },
]
export const inventoryMovements: InventoryMovement[] = [
  { id:'mv1', inventoryLotId:'lot1', type:'Receipt', quantity:1000, unit:'g', reason:'Stock received', notes:'Initial receipt.', occurredAt:'2026-04-01T10:00:00Z', createdAt:'2026-04-01T10:00:00Z' },
  { id:'mv2', inventoryLotId:'lot1', type:'Consumption', quantity:380, unit:'g', reason:'Manual development use', notes:'Historical mock use.', occurredAt:'2026-07-10T09:30:00Z', createdAt:'2026-07-10T09:30:00Z' },
  { id:'mv3', inventoryLotId:'lot2', type:'Receipt', quantity:50, unit:'ml', reason:'Stock received', notes:'Initial receipt.', occurredAt:'2026-05-09T11:00:00Z', createdAt:'2026-05-09T11:00:00Z' },
  { id:'mv4', inventoryLotId:'lot2', type:'Sample', quantity:12, unit:'ml', reason:'Scent evaluations', notes:'Development sample removals.', occurredAt:'2026-07-12T14:00:00Z', createdAt:'2026-07-12T14:00:00Z' },
  { id:'mv5', inventoryLotId:'lot3', type:'Receipt', quantity:1000, unit:'g', reason:'Stock received', notes:'Initial receipt.', occurredAt:'2026-06-18T10:00:00Z', createdAt:'2026-06-18T10:00:00Z' },
  { id:'mv6', inventoryLotId:'lot3', type:'Consumption', quantity:520, unit:'g', reason:'Manual development use', notes:'Historical mock use.', occurredAt:'2026-07-11T10:00:00Z', createdAt:'2026-07-11T10:00:00Z' },
  { id:'mv7', inventoryLotId:'lot4', type:'Receipt', quantity:250, unit:'g', reason:'Stock received', notes:'Initial receipt.', occurredAt:'2026-03-01T10:00:00Z', createdAt:'2026-03-01T10:00:00Z' },
  { id:'mv8', inventoryLotId:'lot4', type:'Consumption', quantity:40, unit:'g', reason:'Manual development use', notes:'Historical mock use.', occurredAt:'2026-07-01T10:00:00Z', createdAt:'2026-07-01T10:00:00Z' },
]
