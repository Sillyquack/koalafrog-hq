import{describe,expect,it}from'vitest'
import type{FormulaLine,Ingredient}from'../../../types/domain'
import{createBatchLines}from'./labLogic'
describe('milligram batch scaling',()=>{it('preserves a small planned quantity',()=>{const formulaLine={id:'fl',formulaVersionId:'fv',ingredientId:'i',percentage:.1,phase:'A',sortOrder:1,notes:''} as FormulaLine,ingredient={id:'i',commonName:'Powder',inciName:'Powder',category:'Active',functions:[],description:'',defaultUnit:'mg',notes:'',status:'Research',createdAt:'',updatedAt:''} as Ingredient,[line]=createBatchLines('batch',[formulaLine],[ingredient],1,'mg',()=> 'line');expect(line.plannedQuantity).toBe(.001);expect(line.unit).toBe('mg')})})
