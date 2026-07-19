import{describe,expect,it}from'vitest'
import{readFileSync}from'node:fs'

const detail=readFileSync(new URL('FormulaDetailPage.tsx',import.meta.url),'utf8')
const scaler=readFileSync(new URL('components/BatchScaler.tsx',import.meta.url),'utf8')
const studio=readFileSync(new URL('../product-studio/BeardOilStudioPage.tsx',import.meta.url),'utf8')
const css=readFileSync(new URL('../../styles/index.css',import.meta.url),'utf8')

describe('Product Studio to Development Workspace continuity',()=>{
 it('derives an optional origin and links to the exact originating concept',()=>{
  expect(detail).toContain('generatedFormulaId===formula.id')
  expect(detail).toContain('Created from {originTemplate.displayName} Product Studio')
  expect(detail).toContain('`${originTemplate.route}?concept=${origin.id}`')
  expect(detail).toContain('origin&&originTemplate&&')
 })
 it('shows development language, journey, actual structured count and safe Candidate guidance',()=>{
  expect(detail).toContain('Development Workspace')
  expect(detail).toContain("['Concept','Formula','Lab','Testing','Candidate']")
  expect(detail).toContain("lines.length} structured")
  expect(detail).toContain('does not mean safety-approved, stable, compliant, or launch-ready')
 })
 it('derives readiness from the selected Formula, ingredient references, Lab Batches and observations',()=>{
  expect(detail).toContain('formulaTotalsExactly100(lines)')
  expect(detail).toContain('lines.every(line=>ingredients.some')
  expect(detail).toContain('versionBatches.length')
  expect(detail).toContain('observation.labBatchId===batch.id&&observation.observedAt')
  expect(detail).toContain('/lab/start/${formula.id}')
  expect(detail).toContain('Physical-system compatibility')
  expect(detail).toContain('Ingredient-documentation review')
  expect(detail).toContain('Prepare Lab Batch blocked')
  expect(detail).toContain('disabled={!candidateReady}')
 })
 it('keeps source notes separate from Formula composition',()=>{
  expect(detail).toContain('Context notes from Product Studio')
  expect(detail).toContain('Not used as Formula ingredients or percentages')
  expect(studio).toContain('Context notes — not used as formula ingredients')
  expect(studio).toContain('Percentages written in notes do not change the structured formula.')
 })
 it('keeps scaling planning-only and responsive',()=>{
  expect(scaler).toContain('no Lab Batch, reservation, procurement, or inventory movement is created')
  expect(scaler).toContain('no density or volume conversion is inferred')
  expect(css).toContain('@media(max-width:480px){.formula-origin')
 })
})
