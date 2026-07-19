import{describe,expect,it}from'vitest'
import{createEmptyIngredientKnowledgeProfile,documentIdentifierDisplay,ingredientKnowledgeAggregatesEqual,normalizeIngredientKnowledgeAggregate,safeIngredientKnowledgeError,type IngredientKnowledgeAggregate}from'./ingredientKnowledge'

const aggregate=():IngredientKnowledgeAggregate=>({profile:createEmptyIngredientKnowledgeProfile('ingredient','2026-01-01T00:00:00Z'),roles:[],compatibility:[],evidence:[]})
describe('Ingredient Knowledge semantic reliability',()=>{
 it('starts clean and ignores timestamps, blank optional strings, and collection order',()=>{
  const left=aggregate(),right=structuredClone(left)
  right.profile.updatedAt='2027-01-01T00:00:00Z'
  right.profile.identity.inci.notes='  '
  left.roles=[{id:'b',ingredientKnowledgeProfileId:left.profile.id,role:'other',level:'optional',context:'x',evidenceIds:['z','a'],confidence:'observed',notes:'',createdAt:'a',updatedAt:'a'},{id:'a',ingredientKnowledgeProfileId:left.profile.id,role:'active',level:'secondary',context:'y',evidenceIds:[],confidence:'supported',notes:'',createdAt:'a',updatedAt:'a'}]
  right.roles=structuredClone(left.roles).reverse()
  right.roles[1].evidenceIds.reverse()
  expect(ingredientKnowledgeAggregatesEqual(left,right)).toBe(true)
  expect(normalizeIngredientKnowledgeAggregate(left)).toEqual(normalizeIngredientKnowledgeAggregate(right))
 })
 it('detects material profile, child, link, clearing, and deletion changes and semantic revert',()=>{
  const baseline=aggregate(),edited=structuredClone(baseline)
  edited.profile.identity.inci={state:'known',value:'TEST',confidence:'supported'}
  expect(ingredientKnowledgeAggregatesEqual(baseline,edited)).toBe(false)
  edited.profile.identity.inci=structuredClone(baseline.profile.identity.inci)
  expect(ingredientKnowledgeAggregatesEqual(baseline,edited)).toBe(true)
 })
 it.each([
  ['/Users/owner/private.pdf'],['C:\\Users\\owner\\private.pdf'],['\\\\server\\share\\private.pdf'],['file:///tmp/private.pdf'],['/mnt/container/private.pdf'],['https://user:secret@example.test/doc'],
  ['user:secret@example.test/doc'],['https://project.supabase.co/storage/v1/object/authenticated/compliance-documents/private.pdf'],
 ])('hides private identifier %s',(value)=>expect(documentIdentifierDisplay(value)).toEqual({kind:'hidden',text:'Legacy private path hidden'}))
 it('distinguishes safe URLs and ordinary identifiers',()=>{
  expect(documentIdentifierDisplay('https://example.test/doc')).toEqual({kind:'url',text:'https://example.test/doc',href:'https://example.test/doc'})
  expect(documentIdentifierDisplay('SDS-2026-004')).toEqual({kind:'text',text:'SDS-2026-004'})
 })
 it('normalizes stale and unsafe transport errors',()=>{
  expect(safeIngredientKnowledgeError(new Error('record changed since it was opened')).kind).toBe('stale_conflict')
  expect(safeIngredientKnowledgeError(new Error('postgres SQL /Users/private'))).toEqual({kind:'save_failed',message:expect.not.stringContaining('/Users')})
 })
})
