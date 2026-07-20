import{describe,expect,it}from'vitest'
import type{FormulaVersion,Ingredient}from'../../../types/domain'
import{createBatchLines,createBatchProcessSteps}from'../../lab/domain/labLogic'
import{formulationIssues}from'../../formulas/domain/multiPhaseLogic'
import{productTemplates,formulationArchetypes}from'./formulationEngine'
import{bicarbonateFreeGuidance,classifyDeodorantIngredient,compareDeodorantVariants,evaluationFieldsForPackaging,formulaPercentageTotal,naturalDeodorantCompatibility,naturalDeodorantPhases,naturalDeodorantProcess,orderedPhases,rolePhysicalFormIssues}from'./naturalDeodorant'

const ingredient=(id:string,name:string,category:string):Ingredient=>({id,commonName:name,inciName:name,category,functions:[],description:'',defaultUnit:'g',notes:'',status:'Research',createdAt:'',updatedAt:''})

describe('Natural Deodorant solid or stick workflow',()=>{
 it('uses flexible ordered phases and shared validation',()=>{
  expect(orderedPhases([naturalDeodorantPhases[2],naturalDeodorantPhases[0]]).map(phase=>phase.code)).toEqual(['A','C'])
  expect(formulationIssues(formulationArchetypes.solid_or_stick.capabilities,naturalDeodorantPhases,[{phase:'A',percentage:70},{phase:'B',percentage:20},{phase:'C',percentage:10}],naturalDeodorantProcess)).toEqual([])
  expect(formulationIssues(formulationArchetypes.solid_or_stick.capabilities,naturalDeodorantPhases,[{phase:'missing',percentage:100}],naturalDeodorantProcess)).toContain('Formula line references unknown phase missing.')
 })
 it('rejects duplicate phase and process orders through shared rules',()=>{
  const phases=[{...naturalDeodorantPhases[0]},{...naturalDeodorantPhases[1],code:'A',order:1}]
  const process=[{...naturalDeodorantProcess[0]},{...naturalDeodorantProcess[1],order:1}]
  expect(formulationIssues(formulationArchetypes.solid_or_stick.capabilities,phases,[{phase:'A',percentage:100}],process)).toEqual(expect.arrayContaining(['Phase codes must be unique.','Phase order values must be unique.','Process step order values must be unique.']))
 })
 it('classifies known solid, liquid, and powder forms while leaving ambiguity unknown',()=>{
  expect(classifyDeodorantIngredient(ingredient('wax','Beeswax','Wax'))).toMatchObject({role:'structuring_wax',phase:'A',physicalForm:'solid'})
  expect(classifyDeodorantIngredient(ingredient('oil','Jojoba Oil','Carrier Oil'))).toMatchObject({role:'liquid_emollient',phase:'A',physicalForm:'liquid'})
  expect(classifyDeodorantIngredient(ingredient('starch','Arrowroot Starch','Powder'))).toMatchObject({role:'absorbent_powder',phase:'B',physicalForm:'powder'})
 expect(classifyDeodorantIngredient(ingredient('unknown','Material X','Other'))).toMatchObject({role:'other',physicalForm:'unknown'})
 })
 it('does not infer active, wax, or fragrance roles from broad name fragments',()=>{
  expect(classifyDeodorantIngredient(ingredient('jojoba','Jojoba liquid wax ester','Carrier Oil'))).toMatchObject({role:'liquid_emollient',physicalForm:'liquid'})
  expect(classifyDeodorantIngredient(ingredient('magnesium','Magnesium Sulfate','Other'))).toMatchObject({role:'other',physicalForm:'unknown'})
  expect(classifyDeodorantIngredient(ingredient('zinc','Zinc Oxide','Other'))).toMatchObject({role:'other',physicalForm:'unknown'})
  expect(classifyDeodorantIngredient(ingredient('carrier','Fragrance-free carrier oil','Carrier Oil'))).toMatchObject({role:'liquid_emollient',physicalForm:'liquid'})
  expect(classifyDeodorantIngredient(ingredient('active','Zinc Ricinoleate','Powder'))).toMatchObject({role:'deodorant_active',physicalForm:'powder'})
 })
 it('flags role and physical-form conflicts without inventing a physical form',()=>{
  const powder=ingredient('powder','Arrowroot Starch','Powder'),oil=ingredient('oil','Jojoba Oil','Carrier Oil')
  expect(rolePhysicalFormIssues([{ingredientId:powder.id,role:'liquid_emollient'}],[powder])).toHaveLength(1)
  expect(rolePhysicalFormIssues([{ingredientId:oil.id,role:'structuring_wax'}],[oil])).toHaveLength(1)
  expect(rolePhysicalFormIssues([{ingredientId:oil.id,role:'liquid_emollient'}],[oil])).toEqual([])
 })
 it('shows evaluation dimensions relevant to the selected presentation',()=>{
  expect(evaluationFieldsForPackaging('Jar')).toContain('scoopability')
  expect(evaluationFieldsForPackaging('Jar')).not.toContain('releaseBehavior')
  expect(evaluationFieldsForPackaging('Twist-up stick')).toContain('releaseBehavior')
  expect(evaluationFieldsForPackaging('Twist-up stick')).not.toContain('scoopability')
 })
 it('keeps numerical validity separate from template physical and documentation compatibility',()=>{
  const liquidOnly=[{ingredientName:'Coconut Fractionated Carrier Oil',percentage:60,role:'liquid_emollient',physicalForm:'liquid' as const,phase:'A'},{ingredientName:'Bergamot Oil',percentage:40,role:'fragrance',physicalForm:'liquid' as const,phase:'C'}]
  expect(formulaPercentageTotal(liquidOnly)).toBe(100)
  expect(naturalDeodorantCompatibility('Twist-up stick',liquidOnly)).toMatchObject({compatible:false,blockingIssues:expect.arrayContaining(['Twist-up stick intent requires a supported solid structuring material.','Natural Deodorant requires at least one supported deodorant-intent material; efficacy remains unverified.',expect.stringContaining('Bergamot Oil is assigned as fragrance at 40%')])})
  const compatible=[{ingredientName:'Beeswax',percentage:30,role:'structuring_wax',physicalForm:'solid' as const,phase:'A'},{ingredientName:'Arrowroot',percentage:70,role:'absorbent_powder',physicalForm:'powder' as const,phase:'B'}]
  expect(naturalDeodorantCompatibility('Twist-up stick',compatible)).toMatchObject({compatible:true,blockingIssues:[]})
 })
 it('makes bicarbonate-free guidance honest and never implies irritation-free positioning',()=>{
  const baking=ingredient('bicarb','Sodium Bicarbonate','Powder')
  expect(bicarbonateFreeGuidance(true,[baking])).toContain('Bicarbonate-free intent conflicts with a selected bicarbonate material. Remove it or change the intent.')
  expect(bicarbonateFreeGuidance(true,[])[0]).toContain('does not imply hypoallergenic or irritation-free')
 })
 it('contains no unsupported antiperspirant or timed-protection claims',()=>{
  const serialized=JSON.stringify(productTemplates.natural_deodorant).toLowerCase()
  expect(serialized).not.toMatch(/prevents sweating|clinically proven|24-hour|48-hour/)
  expect(serialized).toContain('without unsupported efficacy claims')
 })
 it('preserves phase-aware lines and ordered draft process in Lab snapshots without inventory writes',()=>{
  const material=ingredient('powder','Arrowroot Starch','Powder'),lines=createBatchLines('batch',[{id:'line',formulaVersionId:'version',ingredientId:material.id,percentage:100,phase:'B',sortOrder:1,notes:'Dispersed'}],[material],50,'g',()=> 'lab-line')
  const version={id:'version',formulaId:'formula',version:'v0.1',status:'Draft',description:'',targetCharacteristics:'',phaseDefinitions:naturalDeodorantPhases,manufacturingProcess:naturalDeodorantProcess,createdAt:'',updatedAt:''}as FormulaVersion
  const steps=createBatchProcessSteps('batch',version,(()=>{let id=0;return()=>`step-${++id}`})())
  expect(lines[0]).toMatchObject({phase:'B',plannedQuantity:50})
  expect(steps).toHaveLength(14)
  expect(steps[5]).toMatchObject({phaseCode:'B',critical:true})
 })
 it('compares existing-style variants using structured physical evaluation',()=>{
  expect(compareDeodorantVariants([{id:'a',name:'Wax up',changes:['wax +2'],evaluation:{overallResult:3}},{id:'b',name:'Jar',changes:['jar format'],evaluation:{overallResult:5}}]).map(item=>item.id)).toEqual(['b','a'])
 })
})
