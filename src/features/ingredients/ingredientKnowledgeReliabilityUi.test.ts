import{readFileSync}from'node:fs'
import{describe,expect,it}from'vitest'
const page=readFileSync('src/features/ingredients/IngredientKnowledgePage.tsx','utf8')
const guard=readFileSync('src/features/ingredients/useUnsavedIngredientKnowledgeGuard.tsx','utf8')
const dialog=readFileSync('src/features/ingredients/UnsavedChangesDialog.tsx','utf8')
describe('Ingredient Knowledge reliability UI contracts',()=>{
 it('derives dirty state semantically and resets its baseline only after awaited aggregate save',()=>{
  expect(page).toMatch(/ingredientKnowledgeAggregatesEqual\(aggregate,\s*baseline\)/)
  expect(page.indexOf('await data.saveIngredientKnowledge(saved)')).toBeLessThan(page.indexOf('setBaseline(structuredClone(saved))'))
  expect(page).toMatch(/effectiveSaveState === "saving"[\s\S]+effectiveSaveState === "validating"[\s\S]+!dirty/)
 })
 it('registers beforeunload only while dirty and uses the router blocker',()=>{
  expect(guard).toContain('useBlocker')
  expect(guard).toContain('if(!dirty)return')
  expect(guard).toContain("window.addEventListener('beforeunload'")
  expect(guard).toContain("window.removeEventListener('beforeunload'")
 })
 it('provides an accessible, focus-trapped dialog whose Escape action stays',()=>{
  expect(dialog).toContain('role="dialog"')
  expect(dialog).toContain('aria-modal="true"')
  expect(dialog).toContain("event.key==='Escape'")
  expect(dialog).toContain('onStay()')
  expect(dialog).toContain("event.key!=='Tab'")
  expect(dialog).toContain('returnFocus.current?.focus()')
 })
 it('keeps tab changes local and distinguishes save outcomes in text',()=>{
  expect(page).toMatch(/onClick=\{\(\) => setTab\(item\)\}/)
  expect(page).toMatch(/stale_conflict:\s*"Stale-write conflict\./)
  expect(page).toMatch(/validation_failed:\s*"Not saved\./)
  expect(page).toMatch(/save_failed:\s*"Save failed\./)
 })
})
