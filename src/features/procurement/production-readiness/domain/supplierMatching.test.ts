import { describe,expect,it } from 'vitest'
import type { SupplierProduct } from '../../../../types/domain'
import { classifySupplierProduct, freshnessState, normalizePackageQuantity, orderCandidates, type PurchasingSpecification } from './supplierMatching'

const spec:PurchasingSpecification={ingredientId:'shea',ingredientName:'Shea',inci:{value:'BUTYROSPERMUM PARKII BUTTER',state:'confirmed'},requiredUnit:'g',minimumGap:850,grade:{value:'Cosmetic',state:'confirmed'},organic:{value:null,state:'unknown'},requiredDocuments:['sds'],preferredDocuments:['coa'],provenance:{ingredient:'ingredients:shea'}}
const product=(changes:Partial<SupplierProduct>={}):SupplierProduct=>({id:'product-a',ingredientId:'shea',supplierName:'Supplier',productName:'Refined shea',packageQuantity:1,packageUnit:'kg',price:20,currency:'NOK',notes:'',isPreferred:false,grade:'Cosmetic',productStatus:'verified_operational',verification:{inci:'reviewed',supplierSpecification:'reviewed',sds:'reviewed',coa:'reviewed',allergenInformation:'unknown',shelfLife:'unknown',origin:'unknown',extractionMethod:'unknown',processingMethod:'unknown',ifra:'not_applicable',cosing:'reviewed'},createdAt:'2026-07-01',updatedAt:'2026-07-20',...changes})

describe('production Supplier Product matching',()=>{
  it('classifies an accepted exact canonical match and calculates integer packs and surplus',()=>expect(classifySupplierProduct({spec,product:product(),mappingAccepted:true,acceptedIngredientId:'shea',now:new Date('2026-07-27')})).toMatchObject({classification:'exact',packageCount:1,purchasedQuantity:1000,surplus:150}))
  it('keeps an organic preference unknown without inventing a failure',()=>expect(classifySupplierProduct({spec,product:product(),mappingAccepted:true,acceptedIngredientId:'shea',now:new Date('2026-07-27')}).mismatches).toEqual([]))
  it('warns for optional documentation but blocks neither package nor match',()=>expect(classifySupplierProduct({spec,product:product({verification:{...product().verification!,coa:'unknown'}}),mappingAccepted:true,acceptedIngredientId:'shea',now:new Date('2026-07-27')})).toMatchObject({classification:'preference_deviation',warnings:['Preferred COA is not reviewed']}))
  it('records a required documentation blocker as an explicit warning pending owner policy',()=>expect(classifySupplierProduct({spec,product:product({verification:{...product().verification!,sds:'unknown'}}),mappingAccepted:true,acceptedIngredientId:'shea',now:new Date('2026-07-27')}).warnings).toContain('Required SDS is not reviewed'))
  it.each([['kg',1000],['mg',.001],['g',1]] as const)('converts %s to g', (unit,value)=>expect(normalizePackageQuantity(1,unit,'g')).toBe(value))
  it.each([['L',1000],['ml',1]] as const)('converts %s to ml', (unit,value)=>expect(normalizePackageQuantity(1,unit,'ml')).toBe(value))
  it('rejects mass-volume and count-mass conversions',()=>{expect(normalizePackageQuantity(1,'ml','g')).toBeNull();expect(normalizePackageQuantity(1,'pcs','g')).toBeNull()})
  it('respects MOQ with a whole package count',()=>expect(classifySupplierProduct({spec,product:product({packageQuantity:250,packageUnit:'g'}),mappingAccepted:true,acceptedIngredientId:'shea',moq:5,now:new Date('2026-07-27')})).toMatchObject({packageCount:5,purchasedQuantity:1250,surplus:400}))
  it('classifies incompatible units, grades, stale records, and unavailable products transparently',()=>{
    expect(classifySupplierProduct({spec,product:product({packageUnit:'ml'}),now:new Date('2026-07-27')}).classification).toBe('unit_incompatible')
    expect(classifySupplierProduct({spec,product:product({grade:'Food'}),mappingAccepted:true,acceptedIngredientId:'shea',now:new Date('2026-07-27')}).mismatches).toContain('Grade Food does not match Cosmetic')
    expect(classifySupplierProduct({spec,product:product({updatedAt:'2026-01-01'}),mappingAccepted:true,acceptedIngredientId:'shea',now:new Date('2026-07-27')}).classification).toBe('stale')
    expect(classifySupplierProduct({spec,product:product({productStatus:'discontinued'}),now:new Date('2026-07-27')}).classification).toBe('unavailable')
  })
  it('uses deterministic score then classification then identity ordering',()=>{const a=classifySupplierProduct({spec,product:product({id:'a'}),now:new Date('2026-07-27')}),b={...a,supplierProductId:'b',score:a.score+1};expect(orderCandidates([a,b]).map(x=>x.supplierProductId)).toEqual(['b','a'])})
  it('distinguishes current, aging, stale, and unknown freshness',()=>{const now=new Date('2026-07-27');expect(freshnessState('2026-07-20',now)).toBe('current');expect(freshnessState('2026-06-01',now)).toBe('aging');expect(freshnessState('2026-01-01',now)).toBe('stale');expect(freshnessState(undefined,now)).toBe('unknown')})
})
