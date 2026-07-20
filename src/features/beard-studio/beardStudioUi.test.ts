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
  })
  it('does not expose camera, AI analysis or photo upload controls', () => {
    const ui = readFileSync('src/features/beard-studio/BeardStudioPages.tsx', 'utf8')
    expect(ui).not.toMatch(/facial recognition|AI analysis|Upload photo/i)
  })
})
