import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('Beard Studio integration', () => {
  it('registers the grouped route and primary navigation without placeholders', () => {
    const app = readFileSync('src/app/App.tsx', 'utf8'), sidebar = readFileSync('src/components/layout/Sidebar.tsx', 'utf8')
    expect(app).toContain('path="grooming/beard-studio"')
    expect(app).toContain('path="trim"')
    expect(sidebar).toContain("to: '/grooming/beard-studio', label: 'Beard Studio'")
  })
  it('includes explicit narrow mobile safeguards and large Trim Mode targets', () => {
    const css = readFileSync('src/styles/index.css', 'utf8')
    expect(css).toContain('@media(max-width:410px)')
    expect(css).toContain('.touch-button{min-height:52px')
    expect(css).toContain('.page{overflow-x:hidden}')
    expect(css).toContain('@media(max-width:410px){.product-choice{grid-template-columns:1fr}')
  })
  it('reuses Koalafrog Products with explicit grooming usage roles', () => {
    const selector = readFileSync('src/features/beard-studio/components/GroomingProductSelector.tsx', 'utf8')
    expect(selector).toContain('useFormulaData')
    expect(selector).toContain('product.status !==')
    expect(selector).toContain('Usage role')
    expect(selector).toContain('No Koalafrog Products available')
  })
  it('does not expose camera, AI analysis or photo upload controls', () => {
    const ui = [
      'BeardOverviewPage',
      'BeardProfilePage',
      'LengthMapPage',
      'GroomingToolsPage',
      'TrimRecipesPage',
      'TrimModePage',
      'BeardLogPage',
    ].map((page) => readFileSync(`src/features/beard-studio/pages/${page}.tsx`, 'utf8')).join('\n')
    expect(ui).not.toMatch(/facial recognition|AI analysis|Upload photo/i)
  })
})
