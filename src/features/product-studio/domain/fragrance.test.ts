import{describe,expect,it}from'vitest'
import type{Ingredient,ProductStudioSelection}from'../../../types/domain'
import{buildFragranceFormula,fragranceHandoffIssues,isAlcoholCarrier,isFragranceMaterial,normalizeConcentratePercentages}from'./fragrance'

const selections:ProductStudioSelection[]=[
 {ingredientId:'cardamom',role:'fragrance_material',essential:true},
 {ingredientId:'cedar',role:'fragrance_material',essential:true},
]

const ingredient=(overrides:Partial<Ingredient>):Ingredient=>({id:'x',commonName:'Material',inciName:'Material',category:'Other',functions:[],description:'',defaultUnit:'g',notes:'',status:'Active',createdAt:'2026-08-15',updatedAt:'2026-08-15',...overrides})

describe('fragrance Product Studio domain',()=>{
 it('normalizes fragrance concentrate percentages to 100%',()=>{
  const normalized=normalizeConcentratePercentages(selections,{cardamom:30,cedar:70})
  expect(normalized.cardamom).toBe(30)
  expect(normalized.cedar).toBe(70)
  expect(Object.values(normalized).reduce((sum,value)=>sum+value,0)).toBe(100)
 })

 it('builds an 18% EDP dilution as 82% alcohol plus 18% concentrate',()=>{
  const formula=buildFragranceFormula({selections,percentages:{cardamom:25,cedar:75},targetConcentration:18,alcoholIngredientId:'ethanol'})
  expect(formula.lines[0]).toMatchObject({ingredientId:'ethanol',role:'alcohol_carrier',percentage:82})
  expect(formula.lines.slice(1).reduce((sum,line)=>sum+line.percentage,0)).toBe(18)
  expect(formula.total).toBe(100)
 })

 it('blocks finished Formula handoff until an alcohol carrier is adopted',()=>{
  expect(fragranceHandoffIssues({saved:true,selections,percentages:{cardamom:50,cedar:50},targetConcentration:18}).join(' ')).toContain('perfumer’s alcohol')
 })

 it('recognizes perfumery materials and cosmetic alcohol without treating ordinary oils as fragrance',()=>{
  expect(isFragranceMaterial(ingredient({commonName:'Cardamom Oil',category:'Essential oil'}))).toBe(true)
  expect(isAlcoholCarrier(ingredient({commonName:"Perfumer's Alcohol",inciName:'Alcohol Denat.'}))).toBe(true)
  expect(isFragranceMaterial(ingredient({commonName:'Jojoba Oil',category:'Wax ester'}))).toBe(false)
 })
})
